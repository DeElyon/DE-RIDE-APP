package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"strings"
	"time"

	"github.com/deride/ecosystem/backend/internal/cache"
	"github.com/deride/ecosystem/backend/internal/realtime"
	"github.com/gofiber/contrib/websocket"
	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

type identity struct {
	UserID string `json:"sub"`
	Role   string `json:"role"`
}

func main() {
	dsn := strings.TrimSpace(os.Getenv("DATABASE_URL"))
	if dsn == "" {
		log.Fatal("DATABASE_URL is required")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	poolCfg, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		log.Fatalf("database config: %v", err)
	}
	poolCfg.MaxConns = envInt32("DB_MAX_CONNS", 25)
	poolCfg.MinConns = envInt32("DB_MIN_CONNS", 2)
	db, err := pgxpool.NewWithConfig(ctx, poolCfg)
	if err != nil {
		log.Fatalf("connect to Postgres: %v", err)
	}
	defer db.Close()
	if err := db.Ping(ctx); err != nil {
		log.Fatalf("ping Postgres: %v", err)
	}
	store := cache.NewMemoryStore(30 * time.Second)
	defer store.Close()
	hub := realtime.NewHub()
	app := fiber.New(fiber.Config{AppName: "DE RIDE API", ReadTimeout: 15 * time.Second, WriteTimeout: 30 * time.Second, BodyLimit: 2 * 1024 * 1024})
	origins := strings.TrimSpace(os.Getenv("ALLOWED_ORIGINS"))
	if origins == "" {
		origins = "http://localhost:3000"
	}
	app.Use(cors.New(cors.Config{AllowOrigins: origins, AllowMethods: "GET,POST,PATCH,PUT,DELETE,OPTIONS", AllowHeaders: "Origin,Content-Type,Accept,Authorization", MaxAge: 600}))
	app.Use(func(c *fiber.Ctx) error {
		c.Set("X-Content-Type-Options", "nosniff")
		c.Set("Referrer-Policy", "same-origin")
		return c.Next()
	})
	app.Get("/healthz", func(c *fiber.Ctx) error { return c.JSON(fiber.Map{"status": "ok", "service": "deride-api"}) })
	go purgeExpiredTripMessages(db)
	v1 := app.Group("/api/v1")
	registerAuthRoutes(v1, db)
	v1.Get("/health", func(c *fiber.Ctx) error {
		probe, done := context.WithTimeout(c.UserContext(), 2*time.Second)
		defer done()
		if err := db.Ping(probe); err != nil {
			return c.Status(503).JSON(fiber.Map{"status": "degraded", "database": "unavailable"})
		}
		return c.JSON(fiber.Map{"status": "ok", "database": "connected"})
	})
	v1.Get("/parks", func(c *fiber.Ctx) error {
		state := strings.ToUpper(c.Query("state"))
		rows, err := db.Query(c.UserContext(), `SELECT id,name,state_code,launch_enabled,ST_Y(location::geometry),ST_X(location::geometry) FROM bus_parks WHERE ($1='' OR state_code=$1) ORDER BY launch_enabled DESC,name LIMIT 100`, state)
		if err != nil {
			return c.Status(503).JSON(errJSON("ERR_DATABASE_UNAVAILABLE"))
		}
		defer rows.Close()
		parks := make([]fiber.Map, 0)
		for rows.Next() {
			var id, name, code string
			var launch bool
			var lat, lon *float64
			if err = rows.Scan(&id, &name, &code, &launch, &lat, &lon); err != nil {
				return c.Status(500).JSON(errJSON("ERR_DATABASE_QUERY"))
			}
			parks = append(parks, fiber.Map{"id": id, "name": name, "state_code": strings.TrimSpace(code), "launch_enabled": launch, "latitude": lat, "longitude": lon})
		}
		if err = rows.Err(); err != nil {
			return c.Status(500).JSON(errJSON("ERR_DATABASE_QUERY"))
		}
		return c.JSON(fiber.Map{"parks": parks})
	})
	v1.Get("/parks/summary", func(c *fiber.Ctx) error {
		var active, nationwide, boarding, onlineRiders int64
		var waitMinutes *float64
		err := db.QueryRow(c.UserContext(), `SELECT
			(SELECT count(*) FROM bus_parks WHERE launch_enabled),
			(SELECT count(*) FROM bus_parks),
			(SELECT count(*) FROM trips WHERE status='OPEN' AND departure_at >= now()),
			(SELECT count(DISTINCT biker_id) FROM ride_orders WHERE status IN ('ACCEPTED','IN_PROGRESS') AND biker_id IS NOT NULL),
			(SELECT avg(greatest(0,extract(epoch FROM (departure_at-now()))/60)) FROM trips WHERE status='OPEN' AND departure_at >= now())`).Scan(&active, &nationwide, &boarding, &onlineRiders, &waitMinutes)
		if err != nil {
			return c.Status(503).JSON(errJSON("ERR_DATABASE_UNAVAILABLE"))
		}
		return c.JSON(fiber.Map{"active_parks": active, "nationwide_parks": nationwide, "verified_buses": boarding, "online_riders": onlineRiders, "average_wait_saved": waitMinutes})
	})
	secure := v1.Group("", authenticate(os.Getenv("JWT_ACCESS_SECRET"), db))
	secure.Post("/ws-ticket", func(c *fiber.Ctx) error {
		me := c.Locals("identity").(identity)
		ticket := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{"sub": me.UserID, "role": me.Role, "token_type": "websocket", "jti": uuid.NewString(), "exp": time.Now().Add(30 * time.Second).Unix()})
		signed, err := ticket.SignedString([]byte(os.Getenv("JWT_ACCESS_SECRET")))
		if err != nil {
			return c.Status(500).JSON(errJSON("ERR_WS_TICKET_ISSUE"))
		}
		return c.JSON(fiber.Map{"ticket": signed, "expires_in_seconds": 30})
	})
	secure.Get("/ws", websocket.New(func(conn *websocket.Conn) {
		me, ok := conn.Locals("identity").(identity)
		if !ok {
			_ = conn.WriteJSON(fiber.Map{"error": "ERR_AUTH_REQUIRED"})
			return
		}
		client := &realtime.Client{Conn: conn.Conn}
		if me.Role == "ADMIN" {
			hub.Join("admin:sos", client)
		}
		defer hub.Leave(client)
		for {
			_, raw, err := conn.ReadMessage()
			if err != nil {
				return
			}
			var event struct {
				Type        string `json:"event"`
				TripID      string `json:"trip_id"`
				Content     string `json:"content"`
				Category    string `json:"category"`
				Description string `json:"description"`
			}
			if json.Unmarshal(raw, &event) != nil || event.TripID == "" {
				_ = client.Send(fiber.Map{"event": "error", "code": "ERR_INVALID_EVENT"})
				continue
			}
			ctx, done := context.WithTimeout(context.Background(), 3*time.Second)
			switch event.Type {
			case "room:join":
				var allowed bool
				err = db.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM trips t WHERE t.id=$1 AND (t.driver_id=$2 OR EXISTS(SELECT 1 FROM tickets k WHERE k.trip_id=t.id AND k.passenger_id=$2)))`, event.TripID, me.UserID).Scan(&allowed)
				if err == nil && allowed {
					hub.Join("trip:"+event.TripID, client)
					err = client.Send(fiber.Map{"event": "room:joined", "trip_id": event.TripID})
				} else {
					err = client.Send(fiber.Map{"event": "error", "code": "ERR_TRIP_ACCESS_DENIED"})
				}
			case "chat:send_message":
				if len(event.Content) == 0 || len(event.Content) > 2000 {
					err = client.Send(fiber.Map{"event": "error", "code": "ERR_INVALID_MESSAGE"})
					break
				}
				var messageID string
				err = db.QueryRow(ctx, `INSERT INTO messages(trip_id,sender_id,body) SELECT t.id,$2,$3 FROM trips t WHERE t.id=$1 AND (t.driver_id=$2 OR EXISTS(SELECT 1 FROM tickets k WHERE k.trip_id=t.id AND k.passenger_id=$2)) AND NOT(t.status IN ('ARRIVED','CANCELLED') AND t.arrived_at IS NOT NULL AND now()>t.arrived_at+interval '6 minutes') RETURNING id`, event.TripID, me.UserID, event.Content).Scan(&messageID)
				if err == nil {
					hub.Broadcast("trip:"+event.TripID, fiber.Map{"event": "chat:message", "id": messageID, "trip_id": event.TripID, "sender_id": me.UserID, "content": event.Content, "created_at": time.Now().UTC()})
				} else {
					err = client.Send(fiber.Map{"event": "error", "code": "ERR_CHAT_UNAVAILABLE"})
				}
			case "escalation:create":
				issue := strings.TrimSpace(event.Category + ": " + event.Description)
				if len(issue) < 4 || len(issue) > 2000 {
					err = client.Send(fiber.Map{"event": "error", "code": "ERR_INVALID_ESCALATION"})
					break
				}
				var escalationID string
				err = db.QueryRow(ctx, `INSERT INTO escalations(reporter_id,trip_id,issue,status) SELECT $2,t.id,$3,'OPEN' FROM trips t WHERE t.id=$1 AND (t.driver_id=$2 OR EXISTS(SELECT 1 FROM tickets k WHERE k.trip_id=t.id AND k.passenger_id=$2)) RETURNING id`, event.TripID, me.UserID, issue).Scan(&escalationID)
				if err == nil {
					alert := fiber.Map{"event": "escalation:urgent_alert", "escalation_id": escalationID, "trip_id": event.TripID, "reporter_id": me.UserID, "issue": issue}
					hub.Broadcast("admin:sos", alert)
					hub.Broadcast("trip:"+event.TripID, alert)
				} else {
					err = client.Send(fiber.Map{"event": "error", "code": "ERR_ESCALATION_UNAVAILABLE"})
				}
			default:
				err = client.Send(fiber.Map{"event": "error", "code": "ERR_UNKNOWN_EVENT"})
			}
			done()
			if err != nil {
				return
			}
		}
	}, websocket.Config{Origins: strings.Split(origins, ",")}))
	secure.Post("/users/switch-rider-mode", func(c *fiber.Ctx) error {
		me := c.Locals("identity").(identity)
		var in struct {
			Mode string `json:"mode"`
		}
		if err := c.BodyParser(&in); err != nil {
			return c.Status(400).JSON(errJSON("ERR_INVALID_REQUEST"))
		}
		if in.Mode != "BIKER" && in.Mode != "DISPATCH_RIDER" {
			return c.Status(400).JSON(errJSON("ERR_INVALID_MODE"))
		}
		tx, err := db.Begin(c.UserContext())
		if err != nil {
			return c.Status(503).JSON(errJSON("ERR_DATABASE_UNAVAILABLE"))
		}
		defer tx.Rollback(c.UserContext())
		var biker, dispatch bool
		var active int
		err = tx.QueryRow(c.UserContext(), `SELECT biker_approved,dispatch_approved FROM users WHERE id=$1 FOR UPDATE`, me.UserID).Scan(&biker, &dispatch)
		if err != nil {
			return c.Status(404).JSON(errJSON("ERR_USER_NOT_FOUND"))
		}
		if in.Mode == "BIKER" && !biker || in.Mode == "DISPATCH_RIDER" && !dispatch {
			return c.Status(403).JSON(errJSON("ERR_RIDER_MODE_NOT_APPROVED"))
		}
		if err = tx.QueryRow(c.UserContext(), `SELECT (SELECT count(*) FROM ride_orders WHERE biker_id=$1 AND status IN ('ACCEPTED','IN_PROGRESS'))+(SELECT count(*) FROM parcel_orders WHERE rider_id=$1 AND status IN ('ACCEPTED','IN_PROGRESS'))`, me.UserID).Scan(&active); err != nil {
			return c.Status(500).JSON(errJSON("ERR_DATABASE_QUERY"))
		}
		if active > 0 {
			return c.Status(409).JSON(errJSON("ERR_ACTIVE_RIDER_JOB"))
		}
		if _, err = tx.Exec(c.UserContext(), `UPDATE users SET active_role=$2 WHERE id=$1`, me.UserID, in.Mode); err != nil {
			return c.Status(500).JSON(errJSON("ERR_DATABASE_QUERY"))
		}
		if err = tx.Commit(c.UserContext()); err != nil {
			return c.Status(500).JSON(errJSON("ERR_DATABASE_QUERY"))
		}
		secret := []byte(os.Getenv("JWT_ACCESS_SECRET"))
		token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{"sub": me.UserID, "role": in.Mode, "exp": time.Now().Add(time.Hour).Unix()})
		signed, err := token.SignedString(secret)
		if err != nil {
			return c.Status(500).JSON(errJSON("ERR_TOKEN_ISSUE"))
		}
		return c.JSON(fiber.Map{"active_role": in.Mode, "access_token": signed})
	})
	secure.Post("/trips/:id/capacity", func(c *fiber.Ctx) error {
		me := c.Locals("identity").(identity)
		if me.Role != "DRIVER" && me.Role != "DISPATCHER" && me.Role != "PARK_OPERATOR" && me.Role != "ADMIN" {
			return c.Status(403).JSON(errJSON("ERR_ROLE_FORBIDDEN"))
		}
		var in struct {
			Capacity    int       `json:"capacity"`
			DepartureAt time.Time `json:"departure_at"`
		}
		if err := c.BodyParser(&in); err != nil || in.Capacity < 0 || in.DepartureAt.IsZero() {
			return c.Status(400).JSON(errJSON("ERR_INVALID_REQUEST"))
		}
		key := c.Params("id")
		res, err := db.Exec(c.UserContext(), `UPDATE trips SET capacity=$1,departure_at=$2,last_capacity_update_at=now() WHERE id=$3 AND ($4='ADMIN' OR driver_id=$5 OR ($4='DISPATCHER' AND EXISTS(SELECT 1 FROM trip_operator_assignments a WHERE a.trip_id=trips.id AND a.user_id=$5)) OR ($4='PARK_OPERATOR' AND EXISTS(SELECT 1 FROM park_operator_assignments a WHERE a.park_id=trips.park_id AND a.user_id=$5))) AND (last_capacity_update_at IS NULL OR last_capacity_update_at <= now()-interval '120 seconds')`, in.Capacity, in.DepartureAt, key, me.Role, me.UserID)
		if err != nil {
			return c.Status(500).JSON(errJSON("ERR_DATABASE_QUERY"))
		}
		if res.RowsAffected() == 0 {
			var last *time.Time
			var exists bool
			err = db.QueryRow(c.UserContext(), `SELECT last_capacity_update_at FROM trips WHERE id=$1 AND ($2='ADMIN' OR driver_id=$3 OR ($2='DISPATCHER' AND EXISTS(SELECT 1 FROM trip_operator_assignments a WHERE a.trip_id=trips.id AND a.user_id=$3)) OR ($2='PARK_OPERATOR' AND EXISTS(SELECT 1 FROM park_operator_assignments a WHERE a.park_id=trips.park_id AND a.user_id=$3)))`, key, me.Role, me.UserID).Scan(&last)
			exists = err == nil
			if exists && last != nil {
				remaining := int(time.Until(last.Add(120 * time.Second)).Seconds())
				if remaining < 1 {
					remaining = 1
				}
				return c.Status(429).JSON(fiber.Map{"error": "ERR_CAPACITY_COOLDOWN_ACTIVE", "message": "capacity or departure update is cooling down", "retry_after_seconds": remaining})
			}
			return c.Status(404).JSON(errJSON("ERR_TRIP_NOT_FOUND_OR_FORBIDDEN"))
		}
		store.SetWithTTL("trip:last-update:"+key, []byte(time.Now().UTC().Format(time.RFC3339)), 120*time.Second)
		return c.JSON(fiber.Map{"ok": true, "capacity": in.Capacity, "departure_at": in.DepartureAt, "cooldown_seconds": 120})
	})
	_ = v1
	port := strings.TrimSpace(os.Getenv("PORT"))
	if port == "" {
		port = "8080"
	}
	log.Fatal(app.Listen(":" + port))
}

func authenticate(secret string, db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		if secret == "" {
			return c.Status(503).JSON(errJSON("ERR_AUTH_NOT_CONFIGURED"))
		}
		parts := strings.Fields(c.Get("Authorization"))
		ticketAuth := false
		if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") {
			if c.Path() != "/api/v1/ws" || c.Query("ticket") == "" {
				return c.Status(401).JSON(errJSON("ERR_AUTH_REQUIRED"))
			}
			parts = []string{"Bearer", c.Query("ticket")}
			ticketAuth = true
		}
		if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") {
			return c.Status(401).JSON(errJSON("ERR_AUTH_REQUIRED"))
		}
		t, err := jwt.Parse(parts[1], func(t *jwt.Token) (any, error) {
			if t.Method.Alg() != jwt.SigningMethodHS256.Alg() {
				return nil, jwt.ErrSignatureInvalid
			}
			return []byte(secret), nil
		})
		if err != nil || !t.Valid {
			return c.Status(401).JSON(errJSON("ERR_INVALID_TOKEN"))
		}
		claims, ok := t.Claims.(jwt.MapClaims)
		if !ok {
			return c.Status(401).JSON(errJSON("ERR_INVALID_TOKEN"))
		}
		sub, _ := claims["sub"].(string)
		role, _ := claims["role"].(string)
		tokenType, _ := claims["token_type"].(string)
		if ticketAuth && tokenType != "websocket" || !ticketAuth && tokenType == "websocket" {
			return c.Status(401).JSON(errJSON("ERR_INVALID_TOKEN"))
		}
		if sub == "" || role == "" {
			return c.Status(401).JSON(errJSON("ERR_INVALID_TOKEN"))
		}
		var activeRole string
		if err := db.QueryRow(c.UserContext(), `SELECT active_role FROM users WHERE id=$1`, sub).Scan(&activeRole); err != nil {
			return c.Status(401).JSON(errJSON("ERR_USER_NOT_FOUND"))
		}
		if activeRole != role {
			return c.Status(401).JSON(errJSON("ERR_STALE_ROLE_TOKEN"))
		}
		c.Locals("identity", identity{sub, activeRole})
		return c.Next()
	}
}
func errJSON(code string) fiber.Map {
	return fiber.Map{"error": code, "message": strings.ReplaceAll(strings.ToLower(code), "_", " ")}
}
func envInt32(k string, fallback int32) int32 {
	var n int32
	if _, err := fmt.Sscan(os.Getenv(k), &n); err != nil || n < 1 {
		return fallback
	}
	return n
}

func purgeExpiredTripMessages(db *pgxpool.Pool) {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()
	for range ticker.C {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		_, _ = db.Exec(ctx, `DELETE FROM messages m USING trips t WHERE m.trip_id=t.id AND t.status IN ('ARRIVED','CANCELLED') AND t.arrived_at IS NOT NULL AND now()>t.arrived_at+interval '6 minutes' AND NOT EXISTS(SELECT 1 FROM escalations e WHERE e.trip_id=t.id)`)
		cancel()
	}
}
