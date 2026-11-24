package main

import (
	"context"
	"encoding/json"
	"strings"
	"time"

	"github.com/deride/ecosystem/backend/internal/finance"
	"github.com/deride/ecosystem/backend/internal/tickets"
	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

func registerFinanceFlowRoutes(secure fiber.Router, db *pgxpool.Pool) {
	secure.Post("/tickets/checkout", func(c *fiber.Ctx) error {
		me := c.Locals("identity").(identity)
		if me.Role != "PASSENGER" {
			return c.Status(403).JSON(errJSON("ERR_ROLE_FORBIDDEN"))
		}
		var req struct {
			TripID string `json:"trip_id"`
			Seat   string `json:"seat_code"`
		}
		if err := c.BodyParser(&req); err != nil {
			return c.Status(400).JSON(errJSON("ERR_INVALID_REQUEST"))
		}
		req.Seat = strings.TrimSpace(req.Seat)
		key := strings.TrimSpace(c.Get("Idempotency-Key"))
		if req.TripID == "" || req.Seat == "" || len(req.Seat) > 16 || len(key) < 12 || len(key) > 120 {
			return c.Status(422).JSON(errJSON("ERR_TICKET_CHECKOUT_INVALID"))
		}
		tx, err := db.Begin(c.UserContext())
		if err != nil {
			return c.Status(503).JSON(errJSON("ERR_DATABASE_UNAVAILABLE"))
		}
		defer tx.Rollback(c.UserContext())
		var fare int64
		var capacity int
		var state string
		var tripStatus string
		var departure time.Time
		err = tx.QueryRow(c.UserContext(), `SELECT fare_ngn,capacity,state_code,status,departure_at FROM trips WHERE id=$1 FOR UPDATE`, req.TripID).Scan(&fare, &capacity, &state, &tripStatus, &departure)
		if err != nil {
			return c.Status(404).JSON(errJSON("ERR_TRIP_NOT_FOUND"))
		}
		if tripStatus != "OPEN" || !departure.After(time.Now()) {
			return c.Status(409).JSON(errJSON("ERR_TRIP_NOT_BOOKABLE"))
		}
		var existingID, existingCode, existingTrip, existingSeat string
		var existingTotal int64
		err = tx.QueryRow(c.UserContext(), `SELECT id,manual_code,total_paid_ngn,trip_id,seat_code FROM tickets WHERE passenger_id=$1 AND checkout_key=$2`, me.UserID, key).Scan(&existingID, &existingCode, &existingTotal, &existingTrip, &existingSeat)
		if err == nil {
			if existingTrip != req.TripID || existingSeat != req.Seat {
				return c.Status(409).JSON(errJSON("ERR_IDEMPOTENCY_KEY_PAYLOAD_MISMATCH"))
			}
			_ = tx.Commit(c.UserContext())
			return c.JSON(fiber.Map{"ticket_id": existingID, "manual_code": existingCode, "total_paid_ngn": existingTotal, "status": "CONFIRMED"})
		}
		if err != pgx.ErrNoRows {
			return c.Status(503).JSON(errJSON("ERR_TICKET_LOOKUP_FAILED"))
		}
		var taken int
		if err = tx.QueryRow(c.UserContext(), `SELECT count(*) FROM tickets WHERE trip_id=$1 AND seat_code=$2 AND status NOT IN ('CANCELLED','REFUNDED')`, req.TripID, req.Seat).Scan(&taken); err != nil {
			return c.Status(503).JSON(errJSON("ERR_TICKET_LOOKUP_FAILED"))
		}
		if taken > 0 {
			return c.Status(409).JSON(errJSON("ERR_SEAT_UNAVAILABLE"))
		}
		var sold int
		if err = tx.QueryRow(c.UserContext(), `SELECT count(*) FROM tickets WHERE trip_id=$1 AND status NOT IN ('CANCELLED','REFUNDED')`, req.TripID).Scan(&sold); err != nil {
			return c.Status(503).JSON(errJSON("ERR_TICKET_LOOKUP_FAILED"))
		}
		if sold >= capacity {
			return c.Status(409).JSON(errJSON("ERR_TRIP_FULL"))
		}
		var balance int64
		if err = tx.QueryRow(c.UserContext(), `SELECT balance_ngn FROM wallet_accounts WHERE user_id=$1 FOR UPDATE`, me.UserID).Scan(&balance); err != nil {
			return c.Status(404).JSON(errJSON("ERR_WALLET_NOT_FOUND"))
		}
		var waived bool
		_ = tx.QueryRow(c.UserContext(), `SELECT EXISTS(SELECT 1 FROM subscriptions s JOIN subscription_plans p ON p.id=s.plan_id WHERE s.user_id=$1 AND s.status='ACTIVE' AND (s.ends_at IS NULL OR s.ends_at>now()) AND p.id IN ('swift_pass','executive_club','passenger_lifetime'))`, me.UserID).Scan(&waived)
		total, platform, paystack := finance.Checkout(fare*100, waived)
		totalNaira := (total + 99) / 100
		platformNaira := (platform + 99) / 100
		paystackNaira := (paystack + 99) / 100
		if balance < totalNaira {
			return c.Status(402).JSON(fiber.Map{"error": "ERR_WALLET_BALANCE_INSUFFICIENT", "required_ngn": totalNaira, "balance_ngn": balance})
		}
		ticketID, err := newUUID()
		if err != nil {
			return c.Status(500).JSON(errJSON("ERR_TICKET_CREATE_FAILED"))
		}
		code, err := tickets.GenerateManualCode(strings.ToUpper(strings.TrimSpace(state)))
		if err != nil {
			return c.Status(500).JSON(errJSON("ERR_TICKET_CODE_FAILED"))
		}
		signed, err := tickets.SignWithEnvironment(tickets.Payload{TicketID: ticketID, TripID: req.TripID, PassengerID: me.UserID, Seat: req.Seat, StateCode: strings.ToUpper(strings.TrimSpace(state))})
		if err != nil {
			return c.Status(503).JSON(errJSON("ERR_TICKET_SIGNING_UNAVAILABLE"))
		}
		qr, _ := json.Marshal(signed)
		if _, err = tx.Exec(c.UserContext(), `UPDATE wallet_accounts SET balance_ngn=balance_ngn-$1 WHERE user_id=$2`, totalNaira, me.UserID); err != nil {
			return c.Status(500).JSON(errJSON("ERR_WALLET_DEBIT_FAILED"))
		}
		_, err = tx.Exec(c.UserContext(), `INSERT INTO tickets(id,trip_id,passenger_id,seat_code,manual_code,qr_payload,base_fare_ngn,platform_fee_ngn,paystack_fee_ngn,payment_reference,status,total_paid_ngn,checkout_key) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,'CONFIRMED',$11,$12)`, ticketID, req.TripID, me.UserID, req.Seat, code, string(qr), fare, platformNaira, paystackNaira, "WALLET-"+ticketID, totalNaira, key)
		if err != nil {
			return c.Status(409).JSON(errJSON("ERR_TICKET_CREATE_FAILED"))
		}
		ledgerID, err := insertLedger(c.UserContext(), tx, me.UserID, "ticket:"+me.UserID+":"+key, -totalNaira, "TICKET_PURCHASE")
		if err != nil {
			return c.Status(500).JSON(errJSON("ERR_LEDGER_WRITE_FAILED"))
		}
		claims := map[string]any{"receipt_id": ticketID, "ticket_id": ticketID, "reference": "WALLET-" + ticketID, "user_id": me.UserID, "type": "TICKET_PURCHASE", "amount_ngn": totalNaira, "currency": "NGN", "issued_at": time.Now().UTC().Format(time.RFC3339)}
		if err = storeSignedReceipt(c.UserContext(), tx, me.UserID, "TICKET_PURCHASE", ledgerID, claims); err != nil {
			return c.Status(503).JSON(errJSON("ERR_RECEIPT_SIGNING_UNAVAILABLE"))
		}
		if err = tx.Commit(c.UserContext()); err != nil {
			return c.Status(500).JSON(errJSON("ERR_CHECKOUT_COMMIT_FAILED"))
		}
		return c.Status(201).JSON(fiber.Map{"ticket_id": ticketID, "manual_code": code, "qr_payload": signed, "base_fare_ngn": fare, "platform_fee_ngn": platformNaira, "paystack_fee_ngn": paystackNaira, "total_paid_ngn": totalNaira, "status": "CONFIRMED"})
	})
	secure.Post("/tickets/:ticketID/refund", func(c *fiber.Ctx) error {
		me := c.Locals("identity").(identity)
		var req struct {
			Claim       string `json:"claim_type"`
			Destination string `json:"destination"`
			MinutesLate int    `json:"minutes_late"`
		}
		if err := c.BodyParser(&req); err != nil {
			return c.Status(400).JSON(errJSON("ERR_INVALID_REQUEST"))
		}
		req.Claim = strings.ToUpper(strings.TrimSpace(req.Claim))
		req.Destination = strings.ToUpper(strings.TrimSpace(req.Destination))
		if req.Destination == "" {
			req.Destination = "WALLET"
		}
		if req.Destination != "WALLET" {
			return c.Status(422).JSON(errJSON("ERR_ORIGINAL_REFUND_UNAVAILABLE"))
		}
		pct := 100
		status := "CANCELLED"
		if req.Claim == "LATE_ARRIVAL" {
			pct = 80
			status = "LATE_ARRIVAL_80"
		} else if req.Claim == "NO_SHOW" {
			pct = 40
			status = "NO_SHOW_40"
		} else if req.Claim != "CANCEL" {
			return c.Status(422).JSON(errJSON("ERR_INVALID_REFUND_CLAIM"))
		}
		key := strings.TrimSpace(c.Get("Idempotency-Key"))
		if len(key) < 12 || len(key) > 120 {
			return c.Status(400).JSON(errJSON("ERR_IDEMPOTENCY_KEY_REQUIRED"))
		}
		tx, err := db.Begin(c.UserContext())
		if err != nil {
			return c.Status(503).JSON(errJSON("ERR_DATABASE_UNAVAILABLE"))
		}
		defer tx.Rollback(c.UserContext())
		var passengerID, tripID, ticketStatus string
		var fare int64
		var departure time.Time
		err = tx.QueryRow(c.UserContext(), `SELECT k.passenger_id,k.trip_id,k.base_fare_ngn,k.status,t.departure_at FROM tickets k JOIN trips t ON t.id=k.trip_id WHERE k.id=$1 FOR UPDATE OF k`, c.Params("ticketID")).Scan(&passengerID, &tripID, &fare, &ticketStatus, &departure)
		if err != nil || passengerID != me.UserID {
			return c.Status(404).JSON(errJSON("ERR_TICKET_NOT_FOUND"))
		}
		if ticketStatus == "CANCELLED" || ticketStatus == "REFUNDED" {
			return c.Status(409).JSON(errJSON("ERR_TICKET_ALREADY_REFUNDED"))
		}
		if req.Claim == "CANCEL" && time.Now().After(departure) {
			return c.Status(422).JSON(errJSON("ERR_CANCELLATION_WINDOW_CLOSED"))
		}
		if req.Claim == "LATE_ARRIVAL" && time.Now().Sub(departure) <= 10*time.Minute {
			return c.Status(422).JSON(errJSON("ERR_REFUND_WINDOW_INVALID"))
		}
		if req.Claim == "NO_SHOW" && time.Now().Before(departure.Add(10*time.Minute)) {
			return c.Status(422).JSON(errJSON("ERR_NO_SHOW_WINDOW_INVALID"))
		}
		refund, err := finance.Refund(fare, pct)
		if err != nil {
			return c.Status(422).JSON(errJSON("ERR_REFUND_CALCULATION_FAILED"))
		}
		ledgerKey := "refund:" + me.UserID + ":" + key
		if _, err = tx.Exec(c.UserContext(), `INSERT INTO refunds(ticket_id,percent,amount_ngn,destination,idempotency_key) VALUES($1,$2,$3,'WALLET',$4)`, c.Params("ticketID"), pct, refund, ledgerKey); err != nil {
			return c.Status(409).JSON(errJSON("ERR_REFUND_ALREADY_REQUESTED"))
		}
		if _, err = tx.Exec(c.UserContext(), `UPDATE wallet_accounts SET balance_ngn=balance_ngn+$1 WHERE user_id=$2`, refund, me.UserID); err != nil {
			return c.Status(500).JSON(errJSON("ERR_REFUND_CREDIT_FAILED"))
		}
		if _, err = tx.Exec(c.UserContext(), `UPDATE tickets SET status=$1,refund_status='REFUNDED_WALLET' WHERE id=$2`, status, c.Params("ticketID")); err != nil {
			return c.Status(500).JSON(errJSON("ERR_TICKET_UPDATE_FAILED"))
		}
		ledgerID, err := insertLedger(c.UserContext(), tx, me.UserID, ledgerKey, refund, "REFUND")
		if err != nil {
			return c.Status(500).JSON(errJSON("ERR_LEDGER_WRITE_FAILED"))
		}
		claims := map[string]any{"receipt_id": ledgerID, "ticket_id": c.Params("ticketID"), "user_id": me.UserID, "type": "REFUND", "amount_ngn": refund, "currency": "NGN", "percentage": pct, "issued_at": time.Now().UTC().Format(time.RFC3339)}
		if err = storeSignedReceipt(c.UserContext(), tx, me.UserID, "REFUND", ledgerID, claims); err != nil {
			return c.Status(503).JSON(errJSON("ERR_RECEIPT_SIGNING_UNAVAILABLE"))
		}
		if err = tx.Commit(c.UserContext()); err != nil {
			return c.Status(500).JSON(errJSON("ERR_REFUND_COMMIT_FAILED"))
		}
		return c.JSON(fiber.Map{"ticket_id": c.Params("ticketID"), "refund_amount_ngn": refund, "destination": "WALLET", "status": status})
	})
	secure.Post("/subscriptions/upgrade", func(c *fiber.Ctx) error {
		me := c.Locals("identity").(identity)
		var req struct {
			PlanID string `json:"plan_id"`
		}
		if err := c.BodyParser(&req); err != nil {
			return c.Status(400).JSON(errJSON("ERR_INVALID_REQUEST"))
		}
		req.PlanID = strings.TrimSpace(req.PlanID)
		key := strings.TrimSpace(c.Get("Idempotency-Key"))
		if req.PlanID == "" {
			return c.Status(422).JSON(errJSON("ERR_SUBSCRIPTION_PLAN_REQUIRED"))
		}
		if len(key) < 12 || len(key) > 120 {
			return c.Status(400).JSON(errJSON("ERR_IDEMPOTENCY_KEY_REQUIRED"))
		}
		tx, err := db.Begin(c.UserContext())
		if err != nil {
			return c.Status(503).JSON(errJSON("ERR_DATABASE_UNAVAILABLE"))
		}
		defer tx.Rollback(c.UserContext())
		var price int64
		var eligible []string
		var interval string
		if err = tx.QueryRow(c.UserContext(), `SELECT price_ngn,eligible_roles,interval FROM subscription_plans WHERE id=$1`, req.PlanID).Scan(&price, &eligible, &interval); err != nil {
			return c.Status(404).JSON(errJSON("ERR_SUBSCRIPTION_PLAN_NOT_FOUND"))
		}
		if interval == "per_trip" {
			return c.Status(422).JSON(errJSON("ERR_PER_TRIP_PLAN_REQUIRES_TRIP_DEPARTURE"))
		}
		allowed := false
		for _, role := range eligible {
			if role == me.Role {
				allowed = true
			}
		}
		if !allowed {
			return c.Status(403).JSON(errJSON("ERR_ROLE_PLAN_RESTRICTED"))
		}
		if (req.PlanID == "passenger_lifetime" || req.PlanID == "sovereign_60k") && me.Role != "PASSENGER" {
			return c.Status(403).JSON(errJSON("ERR_ROLE_PLAN_RESTRICTED"))
		}
		var currentID string
		_ = tx.QueryRow(c.UserContext(), `SELECT plan_id FROM subscriptions WHERE user_id=$1 AND status='ACTIVE' AND (ends_at IS NULL OR ends_at>now()) ORDER BY starts_at DESC LIMIT 1 FOR UPDATE`, me.UserID).Scan(&currentID)
		if currentID == req.PlanID {
			_ = tx.Commit(c.UserContext())
			return c.JSON(fiber.Map{"plan_id": req.PlanID, "status": "ACTIVE"})
		}
		if currentID != "" {
			if _, err = tx.Exec(c.UserContext(), `UPDATE subscriptions SET status='SUPERSEDED',ends_at=now() WHERE user_id=$1 AND status='ACTIVE'`, me.UserID); err != nil {
				return c.Status(500).JSON(errJSON("ERR_SUBSCRIPTION_UPDATE_FAILED"))
			}
		}
		if price > 0 {
			var balance int64
			if err = tx.QueryRow(c.UserContext(), `SELECT balance_ngn FROM wallet_accounts WHERE user_id=$1 FOR UPDATE`, me.UserID).Scan(&balance); err != nil || balance < price {
				return c.Status(402).JSON(errJSON("ERR_WALLET_BALANCE_INSUFFICIENT"))
			}
			if _, err = tx.Exec(c.UserContext(), `UPDATE wallet_accounts SET balance_ngn=balance_ngn-$1 WHERE user_id=$2`, price, me.UserID); err != nil {
				return c.Status(500).JSON(errJSON("ERR_WALLET_DEBIT_FAILED"))
			}
			ledgerID, ledgerErr := insertLedger(c.UserContext(), tx, me.UserID, "subscription:"+me.UserID+":"+key, -price, "SUBSCRIPTION")
			if ledgerErr != nil {
				return c.Status(409).JSON(errJSON("ERR_IDEMPOTENCY_KEY_REUSED"))
			}
			claims := map[string]any{"receipt_id": ledgerID, "user_id": me.UserID, "type": "SUBSCRIPTION", "plan_id": req.PlanID, "amount_ngn": price, "currency": "NGN", "issued_at": time.Now().UTC().Format(time.RFC3339)}
			if err = storeSignedReceipt(c.UserContext(), tx, me.UserID, "SUBSCRIPTION", ledgerID, claims); err != nil {
				return c.Status(503).JSON(errJSON("ERR_RECEIPT_SIGNING_UNAVAILABLE"))
			}
		}
		var ends any
		if interval == "one_time" {
			ends = nil
		} else {
			ends = time.Now().Add(30 * 24 * time.Hour)
		}
		var subscriptionID string
		if err = tx.QueryRow(c.UserContext(), `INSERT INTO subscriptions(user_id,plan_id,starts_at,ends_at,status) VALUES($1,$2,now(),$3,'ACTIVE') RETURNING id`, me.UserID, req.PlanID, ends).Scan(&subscriptionID); err != nil {
			return c.Status(500).JSON(errJSON("ERR_SUBSCRIPTION_CREATE_FAILED"))
		}
		_, _ = tx.Exec(c.UserContext(), `INSERT INTO app_notifications(user_id,category,title,body,action_url,payload) VALUES($1,'SUBSCRIPTION','Subscription updated',$2,'/transactions',jsonb_build_object('plan_id',$3))`, me.UserID, "Your subscription is now active.", req.PlanID)
		if err = tx.Commit(c.UserContext()); err != nil {
			return c.Status(500).JSON(errJSON("ERR_SUBSCRIPTION_COMMIT_FAILED"))
		}
		go sendPushNotificationToUser(db, me.UserID, "Subscription updated", "Your subscription is now active.", "/transactions")
		return c.Status(201).JSON(fiber.Map{"subscription_id": subscriptionID, "plan_id": req.PlanID, "status": "ACTIVE", "ends_at": ends})
	})
	secure.Post("/subscriptions/downgrade", func(c *fiber.Ctx) error {
		me := c.Locals("identity").(identity)
		var req struct {
			PlanID string `json:"plan_id"`
		}
		if err := c.BodyParser(&req); err != nil {
			return c.Status(400).JSON(errJSON("ERR_INVALID_REQUEST"))
		}
		req.PlanID = strings.TrimSpace(req.PlanID)
		var price int64
		var eligible []string
		var interval string
		if err := db.QueryRow(c.UserContext(), `SELECT price_ngn,eligible_roles,interval FROM subscription_plans WHERE id=$1`, req.PlanID).Scan(&price, &eligible, &interval); err != nil {
			return c.Status(404).JSON(errJSON("ERR_SUBSCRIPTION_PLAN_NOT_FOUND"))
		}
		if price != 0 || interval == "per_trip" {
			return c.Status(422).JSON(errJSON("ERR_DOWNGRADE_TARGET_MUST_BE_FREE"))
		}
		allowed := false
		for _, role := range eligible {
			if role == me.Role {
				allowed = true
			}
		}
		if !allowed {
			return c.Status(403).JSON(errJSON("ERR_ROLE_PLAN_RESTRICTED"))
		}
		tx, err := db.Begin(c.UserContext())
		if err != nil {
			return c.Status(503).JSON(errJSON("ERR_DATABASE_UNAVAILABLE"))
		}
		defer tx.Rollback(c.UserContext())
		_, _ = tx.Exec(c.UserContext(), `UPDATE subscriptions SET status='SUPERSEDED',ends_at=now() WHERE user_id=$1 AND status='ACTIVE'`, me.UserID)
		var id string
		if err = tx.QueryRow(c.UserContext(), `INSERT INTO subscriptions(user_id,plan_id,starts_at,ends_at,status) VALUES($1,$2,now(),now()+interval '30 days','ACTIVE') RETURNING id`, me.UserID, req.PlanID).Scan(&id); err != nil {
			return c.Status(500).JSON(errJSON("ERR_SUBSCRIPTION_DOWNGRADE_FAILED"))
		}
		_, _ = tx.Exec(c.UserContext(), `INSERT INTO app_notifications(user_id,category,title,body,action_url,payload) VALUES($1,'SUBSCRIPTION','Subscription changed',$2,'/transactions',jsonb_build_object('plan_id',$3))`, me.UserID, "Your subscription was changed to the free plan.", req.PlanID)
		if err = tx.Commit(c.UserContext()); err != nil {
			return c.Status(500).JSON(errJSON("ERR_SUBSCRIPTION_COMMIT_FAILED"))
		}
		go sendPushNotificationToUser(db, me.UserID, "Subscription changed", "Your subscription was changed to the free plan.", "/transactions")
		return c.JSON(fiber.Map{"subscription_id": id, "plan_id": req.PlanID, "status": "ACTIVE", "effective": "IMMEDIATELY"})
	})
}

func insertLedger(ctx context.Context, tx pgx.Tx, userID, key string, amount int64, kind string) (string, error) {
	var id string
	err := tx.QueryRow(ctx, `INSERT INTO ledger_entries(user_id,idempotency_key,amount_ngn,entry_type) VALUES($1,$2,$3,$4) RETURNING id`, userID, key, amount, kind).Scan(&id)
	return id, err
}

func storeSignedReceipt(ctx context.Context, tx pgx.Tx, userID, kind, ledgerID string, claims map[string]any) error {
	signed, keyID, err := signReceiptClaims(claims)
	if err != nil {
		return err
	}
	claimBytes, _ := json.Marshal(claims)
	signedBytes, _ := json.Marshal(signed)
	_, err = tx.Exec(ctx, `INSERT INTO signed_receipts(user_id,ledger_entry_id,receipt_type,key_id,claims,signed_payload) VALUES($1,$2,$3,$4,$5::jsonb,$6)`, userID, ledgerID, kind, keyID, string(claimBytes), string(signedBytes))
	return err
}
