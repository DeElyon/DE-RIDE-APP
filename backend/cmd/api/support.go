package main

import (
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgxpool"
)

func registerSupportRoutes(secure fiber.Router, db *pgxpool.Pool) {
	secure.Get("/support/cases", func(c *fiber.Ctx) error {
		me := c.Locals("identity").(identity)
		rows, err := db.Query(c.UserContext(), `SELECT id,subject,category,status,priority,created_at,updated_at FROM support_cases WHERE requester_id=$1 ORDER BY updated_at DESC LIMIT 100`, me.UserID)
		if err != nil {
			return c.Status(503).JSON(errJSON("ERR_SUPPORT_UNAVAILABLE"))
		}
		defer rows.Close()
		cases := make([]fiber.Map, 0)
		for rows.Next() {
			var id, subject, category, status, priority string
			var created, updated time.Time
			if err = rows.Scan(&id, &subject, &category, &status, &priority, &created, &updated); err != nil {
				return c.Status(500).JSON(errJSON("ERR_DATABASE_QUERY"))
			}
			cases = append(cases, fiber.Map{"id": id, "subject": subject, "category": category, "status": status, "priority": priority, "created_at": created, "updated_at": updated})
		}
		if err = rows.Err(); err != nil {
			return c.Status(500).JSON(errJSON("ERR_DATABASE_QUERY"))
		}
		return c.JSON(fiber.Map{"cases": cases})
	})
	secure.Post("/support/cases", func(c *fiber.Ctx) error {
		me := c.Locals("identity").(identity)
		var req struct {
			Subject     string `json:"subject"`
			Category    string `json:"category"`
			TripID      string `json:"trip_id"`
			RideOrderID string `json:"ride_order_id"`
			Message     string `json:"message"`
		}
		if err := c.BodyParser(&req); err != nil {
			return c.Status(400).JSON(errJSON("ERR_INVALID_REQUEST"))
		}
		req.Subject = strings.TrimSpace(req.Subject)
		req.Category = strings.ToUpper(strings.TrimSpace(req.Category))
		req.Message = strings.TrimSpace(req.Message)
		allowed := map[string]bool{"ACCOUNT": true, "PAYMENT": true, "TRIP": true, "KYC": true, "SAFETY": true, "OTHER": true}
		if len(req.Subject) < 4 || len(req.Subject) > 180 || !allowed[req.Category] || len(req.Message) < 1 || len(req.Message) > 5000 {
			return c.Status(422).JSON(errJSON("ERR_SUPPORT_CASE_INVALID"))
		}
		tx, err := db.Begin(c.UserContext())
		if err != nil {
			return c.Status(503).JSON(errJSON("ERR_DATABASE_UNAVAILABLE"))
		}
		defer tx.Rollback(c.UserContext())
		var caseID string
		err = tx.QueryRow(c.UserContext(), `INSERT INTO support_cases(requester_id,trip_id,ride_order_id,subject,category) VALUES($1,NULLIF($2,'')::uuid,NULLIF($3,'')::uuid,$4,$5) RETURNING id`, me.UserID, req.TripID, req.RideOrderID, req.Subject, req.Category).Scan(&caseID)
		if err != nil {
			return c.Status(422).JSON(errJSON("ERR_SUPPORT_CASE_CREATE_FAILED"))
		}
		if _, err = tx.Exec(c.UserContext(), `INSERT INTO support_messages(case_id,sender_id,body) VALUES($1,$2,$3)`, caseID, me.UserID, req.Message); err != nil {
			return c.Status(500).JSON(errJSON("ERR_SUPPORT_MESSAGE_CREATE_FAILED"))
		}
		if err = tx.Commit(c.UserContext()); err != nil {
			return c.Status(500).JSON(errJSON("ERR_SUPPORT_COMMIT_FAILED"))
		}
		return c.Status(201).JSON(fiber.Map{"id": caseID, "status": "OPEN"})
	})
	secure.Get("/support/cases/:caseID/messages", func(c *fiber.Ctx) error {
		me := c.Locals("identity").(identity)
		caseID := c.Params("caseID")
		var role string
		if err := db.QueryRow(c.UserContext(), `SELECT active_role FROM users WHERE id=$1`, me.UserID).Scan(&role); err != nil {
			return c.Status(401).JSON(errJSON("ERR_AUTH_REQUIRED"))
		}
		admin := role == "ADMIN"
		rows, err := db.Query(c.UserContext(), `SELECT m.id,m.sender_id,m.body,m.attachment_media_id,m.created_at FROM support_messages m JOIN support_cases s ON s.id=m.case_id WHERE s.id=$1 AND (s.requester_id=$2 OR $3) AND NOT m.internal_note ORDER BY m.created_at ASC LIMIT 500`, caseID, me.UserID, admin)
		if err != nil {
			return c.Status(404).JSON(errJSON("ERR_SUPPORT_CASE_NOT_FOUND"))
		}
		defer rows.Close()
		items := make([]fiber.Map, 0)
		for rows.Next() {
			var id, sender, body string
			var media *string
			var created time.Time
			if err = rows.Scan(&id, &sender, &body, &media, &created); err != nil {
				return c.Status(500).JSON(errJSON("ERR_DATABASE_QUERY"))
			}
			items = append(items, fiber.Map{"id": id, "sender_id": sender, "body": body, "attachment_media_id": media, "created_at": created})
		}
		if err = rows.Err(); err != nil {
			return c.Status(500).JSON(errJSON("ERR_DATABASE_QUERY"))
		}
		return c.JSON(fiber.Map{"messages": items})
	})
	secure.Post("/support/cases/:caseID/messages", func(c *fiber.Ctx) error {
		me := c.Locals("identity").(identity)
		var req struct {
			Body         string `json:"body"`
			AttachmentID string `json:"attachment_media_id"`
		}
		if err := c.BodyParser(&req); err != nil {
			return c.Status(400).JSON(errJSON("ERR_INVALID_REQUEST"))
		}
		req.Body = strings.TrimSpace(req.Body)
		if len(req.Body) < 1 || len(req.Body) > 5000 {
			return c.Status(422).JSON(errJSON("ERR_SUPPORT_MESSAGE_INVALID"))
		}
		var id string
		err := db.QueryRow(c.UserContext(), `INSERT INTO support_messages(case_id,sender_id,body,attachment_media_id) SELECT id,$2,$3,NULLIF($4,'')::uuid FROM support_cases WHERE id=$1 AND requester_id=$2 AND status NOT IN ('RESOLVED','CLOSED') RETURNING id`, c.Params("caseID"), me.UserID, req.Body, req.AttachmentID).Scan(&id)
		if err != nil {
			return c.Status(404).JSON(errJSON("ERR_SUPPORT_CASE_NOT_WRITABLE"))
		}
		_, _ = db.Exec(c.UserContext(), `UPDATE support_cases SET status='OPEN',updated_at=now() WHERE id=$1`, c.Params("caseID"))
		return c.Status(201).JSON(fiber.Map{"id": id, "status": "SENT"})
	})
	secure.Post("/disputes", func(c *fiber.Ctx) error {
		me := c.Locals("identity").(identity)
		var req struct {
			EscalationID    string `json:"escalation_id"`
			PaymentIntentID string `json:"payment_intent_id"`
			Reason          string `json:"reason"`
		}
		if err := c.BodyParser(&req); err != nil {
			return c.Status(400).JSON(errJSON("ERR_INVALID_REQUEST"))
		}
		req.Reason = strings.TrimSpace(req.Reason)
		if len(req.Reason) < 10 || len(req.Reason) > 3000 || (req.EscalationID == "" && req.PaymentIntentID == "") {
			return c.Status(422).JSON(errJSON("ERR_DISPUTE_INVALID"))
		}
		var id string
		err := db.QueryRow(c.UserContext(), `INSERT INTO disputes(escalation_id,payment_intent_id,opened_by,reason) SELECT NULLIF($1,'')::uuid,NULLIF($2,'')::uuid,$3,$4 WHERE ($1='' OR EXISTS(SELECT 1 FROM escalations WHERE id=NULLIF($1,'')::uuid AND reporter_id=$3)) AND ($2='' OR EXISTS(SELECT 1 FROM payment_intents WHERE id=NULLIF($2,'')::uuid AND user_id=$3)) RETURNING id`, req.EscalationID, req.PaymentIntentID, me.UserID, req.Reason).Scan(&id)
		if err != nil {
			return c.Status(422).JSON(errJSON("ERR_DISPUTE_REFERENCE_INVALID"))
		}
		return c.Status(201).JSON(fiber.Map{"id": id, "status": "OPEN"})
	})
}
