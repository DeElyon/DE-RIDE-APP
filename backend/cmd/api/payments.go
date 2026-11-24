package main

import (
	"context"
	"crypto/ecdsa"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"crypto/sha512"
	"crypto/x509"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"encoding/pem"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type paystackInitializeResponse struct {
	Status  bool   `json:"status"`
	Message string `json:"message"`
	Data    struct {
		AuthorizationURL string `json:"authorization_url"`
		AccessCode       string `json:"access_code"`
		Reference        string `json:"reference"`
	} `json:"data"`
}

type paystackVerifyResponse struct {
	Status bool `json:"status"`
	Data   struct {
		Status    string `json:"status"`
		Reference string `json:"reference"`
		Amount    int64  `json:"amount"`
		Currency  string `json:"currency"`
	} `json:"data"`
}

func registerPaymentRoutes(v1, secure fiber.Router, db *pgxpool.Pool) {
	secure.Post("/wallet/fund", func(c *fiber.Ctx) error {
		me := c.Locals("identity").(identity)
		var req struct {
			AmountNaira int64 `json:"amount_ngn"`
		}
		if err := c.BodyParser(&req); err != nil || req.AmountNaira < 100 || req.AmountNaira > 5_000_000 {
			return c.Status(400).JSON(errJSON("ERR_WALLET_FUND_AMOUNT_INVALID"))
		}
		if os.Getenv("PAYSTACK_SECRET_KEY") == "" || !receiptSigningConfigured() {
			return c.Status(503).JSON(errJSON("ERR_PAYMENT_SERVICE_NOT_CONFIGURED"))
		}
		idempotencyKey := strings.TrimSpace(c.Get("Idempotency-Key"))
		if len(idempotencyKey) < 12 || len(idempotencyKey) > 120 {
			return c.Status(400).JSON(errJSON("ERR_IDEMPOTENCY_KEY_REQUIRED"))
		}
		var email string
		if err := db.QueryRow(c.UserContext(), `SELECT email FROM users WHERE id=$1 AND email_verified=true`, me.UserID).Scan(&email); err != nil {
			return c.Status(403).JSON(errJSON("ERR_EMAIL_VERIFICATION_REQUIRED"))
		}
		intentID, reference, authURL, accessCode, status, err := createWalletFundingIntent(c.UserContext(), db, me.UserID, email, req.AmountNaira*100, idempotencyKey)
		if err != nil {
			return c.Status(502).JSON(errJSON("ERR_PAYSTACK_INITIALIZE_FAILED"))
		}
		return c.Status(201).JSON(fiber.Map{"payment_intent_id": intentID, "reference": reference, "authorization_url": authURL, "access_code": accessCode, "status": status, "amount_ngn": req.AmountNaira})
	})
	secure.Get("/payments/verify", func(c *fiber.Ctx) error {
		me := c.Locals("identity").(identity)
		reference := strings.TrimSpace(c.Query("reference"))
		if reference == "" {
			return c.Status(400).JSON(errJSON("ERR_PAYMENT_REFERENCE_REQUIRED"))
		}
		var intentID, intentStatus string
		var amount int64
		if err := db.QueryRow(c.UserContext(), `SELECT id,status,amount_kobo FROM payment_intents WHERE user_id=$1 AND provider_reference=$2 AND intent_type='WALLET_FUNDING'`, me.UserID, reference).Scan(&intentID, &intentStatus, &amount); err != nil {
			return c.Status(404).JSON(errJSON("ERR_PAYMENT_NOT_FOUND"))
		}
		if intentStatus != "SUCCEEDED" {
			if err := verifyAndSettleWalletFunding(c.UserContext(), db, reference); err != nil {
				return c.Status(409).JSON(errJSON("ERR_PAYMENT_NOT_SETTLED"))
			}
		}
		return c.JSON(fiber.Map{"status": "SUCCEEDED", "reference": reference, "amount_ngn": amount / 100, "payment_intent_id": intentID})
	})
	v1.Post("/webhooks/paystack", func(c *fiber.Ctx) error {
		if os.Getenv("PAYSTACK_SECRET_KEY") == "" {
			return c.Status(503).JSON(errJSON("ERR_PAYMENT_SERVICE_NOT_CONFIGURED"))
		}
		if !verifyPaystackWebhookSignature(c.Body(), c.Get("paystack-signature"), c.Get("x-paystack-signature")) {
			return c.Status(401).JSON(errJSON("ERR_INVALID_PAYSTACK_SIGNATURE"))
		}
		var event struct {
			Event string `json:"event"`
			Data  struct {
				Reference string `json:"reference"`
			} `json:"data"`
		}
		if err := json.Unmarshal(c.Body(), &event); err != nil || event.Event == "" {
			return c.Status(400).JSON(errJSON("ERR_INVALID_PAYSTACK_EVENT"))
		}
		digest := sha256.Sum256(c.Body())
		eventID := hex.EncodeToString(digest[:])
		var alreadyProcessed bool
		err := db.QueryRow(c.UserContext(), `INSERT INTO paystack_webhook_events(event_id,reference,event_type,payload) VALUES($1,$2,$3,$4::jsonb) ON CONFLICT(event_id) DO UPDATE SET event_id=EXCLUDED.event_id RETURNING processed_at IS NOT NULL`, eventID, event.Data.Reference, event.Event, string(c.Body())).Scan(&alreadyProcessed)
		if err != nil {
			return c.Status(503).JSON(errJSON("ERR_WEBHOOK_RECORD_FAILED"))
		}
		if alreadyProcessed {
			return c.SendStatus(200)
		}
		go processPaystackWebhookEvent(db, eventID)
		return c.SendStatus(200)
	})
}

func processPaystackWebhookEvent(db *pgxpool.Pool, eventID string) {
	ctx, cancel := context.WithTimeout(context.Background(), 25*time.Second)
	defer cancel()
	var eventType, reference string
	err := db.QueryRow(ctx, `UPDATE paystack_webhook_events SET processing_at=now() WHERE event_id=$1 AND processed_at IS NULL AND (processing_at IS NULL OR processing_at<now()-interval '2 minutes') RETURNING event_type,reference`, eventID).Scan(&eventType, &reference)
	if err != nil {
		return
	}
	if eventType == "charge.success" {
		if err = verifyAndSettleWalletFunding(ctx, db, reference); err != nil {
			_, _ = db.Exec(ctx, `UPDATE paystack_webhook_events SET processing_at=NULL,processing_error=$1 WHERE event_id=$2`, err.Error(), eventID)
			return
		}
	}
	_, _ = db.Exec(ctx, `UPDATE paystack_webhook_events SET processed_at=now(),processing_at=NULL,processing_error=NULL WHERE event_id=$1`, eventID)
}

func processPendingPaystackEvents(db *pgxpool.Pool) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	rows, err := db.Query(ctx, `SELECT event_id FROM paystack_webhook_events WHERE processed_at IS NULL AND (processing_at IS NULL OR processing_at<now()-interval '2 minutes') ORDER BY received_at LIMIT 20`)
	if err != nil {
		cancel()
		return
	}
	ids := make([]string, 0)
	for rows.Next() {
		var id string
		if rows.Scan(&id) == nil {
			ids = append(ids, id)
		}
	}
	rows.Close()
	cancel()
	for _, id := range ids {
		processPaystackWebhookEvent(db, id)
	}
}

func verifyPaystackWebhookSignature(body []byte, currentHeader, legacyHeader string) bool {
	legacySecret := os.Getenv("PAYSTACK_SECRET_KEY")
	if legacyHeader != "" && legacySecret != "" && validHexSignature(legacyHeader) {
		mac := hmac.New(sha512.New, []byte(legacySecret))
		_, _ = mac.Write(body)
		if hmac.Equal(mac.Sum(nil), mustDecodeHex(legacyHeader)) {
			return true
		}
	}
	if currentHeader == "" {
		return false
	}
	var timestamp string
	var signatures []string
	for _, part := range strings.Split(currentHeader, ",") {
		key, value, ok := strings.Cut(strings.TrimSpace(part), "=")
		if !ok {
			continue
		}
		switch key {
		case "t":
			if timestamp != "" {
				return false
			}
			timestamp = value
		case "v1":
			kid, sig, ok := strings.Cut(value, ":")
			if ok && strings.HasPrefix(kid, "whk_") && validHexSignature(sig) {
				signatures = append(signatures, sig)
			}
		}
	}
	if timestamp == "" || len(signatures) == 0 {
		return false
	}
	signedAt, err := strconv.ParseInt(timestamp, 10, 64)
	if err != nil || time.Since(time.Unix(signedAt, 0)) > 5*time.Minute || time.Until(time.Unix(signedAt, 0)) > 5*time.Minute {
		return false
	}
	secrets := strings.Split(os.Getenv("PAYSTACK_WEBHOOK_SECRETS"), ";")
	if os.Getenv("PAYSTACK_WEBHOOK_SECRET") != "" {
		secrets = append(secrets, os.Getenv("PAYSTACK_WEBHOOK_SECRET"))
	}
	for _, secret := range secrets {
		secret = strings.TrimSpace(secret)
		if secret == "" {
			continue
		}
		mac := hmac.New(sha512.New, []byte(secret))
		_, _ = mac.Write([]byte(timestamp + "."))
		_, _ = mac.Write(body)
		expected := mac.Sum(nil)
		for _, signature := range signatures {
			if hmac.Equal(expected, mustDecodeHex(signature)) {
				return true
			}
		}
	}
	return false
}

func validHexSignature(value string) bool {
	if len(value) != 128 {
		return false
	}
	_, err := hex.DecodeString(value)
	return err == nil
}
func mustDecodeHex(value string) []byte {
	decoded, err := hex.DecodeString(value)
	if err != nil {
		return nil
	}
	return decoded
}

func createWalletFundingIntent(ctx context.Context, db *pgxpool.Pool, userID, email string, amountKobo int64, key string) (string, string, string, string, string, error) {
	reference := "DRW-" + strings.ReplaceAll(uuid.NewString(), "-", "")
	var intentID, status string
	var authURL, accessCode *string
	tx, err := db.Begin(ctx)
	if err != nil {
		return "", "", "", "", "", err
	}
	defer tx.Rollback(ctx)
	err = tx.QueryRow(ctx, `INSERT INTO payment_intents(user_id,intent_type,payment_method,idempotency_key,provider_reference,amount_kobo,status,metadata) VALUES($1,'WALLET_FUNDING','PAYSTACK',$2,$3,$4,'CREATED','{}'::jsonb) ON CONFLICT(user_id,idempotency_key) DO NOTHING RETURNING id,status,authorization_url,access_code`, userID, key, reference, amountKobo).Scan(&intentID, &status, &authURL, &accessCode)
	if err == pgx.ErrNoRows {
		var existingAmount int64
		if err = tx.QueryRow(ctx, `SELECT id,status,authorization_url,access_code,provider_reference,amount_kobo FROM payment_intents WHERE user_id=$1 AND idempotency_key=$2 FOR UPDATE`, userID, key).Scan(&intentID, &status, &authURL, &accessCode, &reference, &existingAmount); err != nil {
			return "", "", "", "", "", err
		}
		if existingAmount != amountKobo {
			return "", "", "", "", "", fmt.Errorf("idempotency key amount mismatch")
		}
		if err = tx.Commit(ctx); err != nil {
			return "", "", "", "", "", err
		}
		if authURL != nil {
			return intentID, reference, *authURL, stringValue(accessCode), status, nil
		}
		// A prior initialize attempt may have died after creating the intent. Retry
		// the same provider reference so the idempotency key can recover cleanly.
	}
	if err != nil {
		return "", "", "", "", "", err
	}
	if err = tx.Commit(ctx); err != nil {
		return "", "", "", "", "", err
	}
	frontendURL := strings.TrimRight(os.Getenv("PUBLIC_FRONTEND_URL"), "/")
	if frontendURL == "" {
		frontendURL = "http://localhost:3000"
	}
	callback := frontendURL + "/wallet?payment=return"
	requestBody, _ := json.Marshal(map[string]any{"email": email, "amount": amountKobo, "reference": reference, "currency": "NGN", "callback_url": callback, "metadata": map[string]any{"intent_id": intentID, "purpose": "WALLET_FUNDING", "user_id": userID}})
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, "https://api.paystack.co/transaction/initialize", strings.NewReader(string(requestBody)))
	if err != nil {
		return "", "", "", "", "", err
	}
	request.Header.Set("Authorization", "Bearer "+os.Getenv("PAYSTACK_SECRET_KEY"))
	request.Header.Set("Content-Type", "application/json")
	response, err := (&http.Client{Timeout: 15 * time.Second}).Do(request)
	if err != nil {
		return "", "", "", "", "", err
	}
	defer response.Body.Close()
	var provider paystackInitializeResponse
	if err = json.NewDecoder(io.LimitReader(response.Body, 1<<20)).Decode(&provider); err != nil || response.StatusCode < 200 || response.StatusCode >= 300 || !provider.Status || provider.Data.Reference != reference {
		_, _ = db.Exec(ctx, `UPDATE payment_intents SET status='FAILED',updated_at=now() WHERE id=$1`, intentID)
		return "", "", "", "", "", fmt.Errorf("provider rejected initialization")
	}
	_, err = db.Exec(ctx, `UPDATE payment_intents SET status='PENDING',authorization_url=$1,access_code=$2,expires_at=now()+interval '30 minutes',updated_at=now() WHERE id=$3`, provider.Data.AuthorizationURL, provider.Data.AccessCode, intentID)
	return intentID, reference, provider.Data.AuthorizationURL, provider.Data.AccessCode, "PENDING", err
}

func verifyAndSettleWalletFunding(ctx context.Context, db *pgxpool.Pool, reference string) error {
	secret := os.Getenv("PAYSTACK_SECRET_KEY")
	if secret == "" {
		return fmt.Errorf("payment provider is not configured")
	}
	endpoint := "https://api.paystack.co/transaction/verify/" + url.PathEscape(reference)
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return err
	}
	request.Header.Set("Authorization", "Bearer "+secret)
	response, err := (&http.Client{Timeout: 15 * time.Second}).Do(request)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	var verified paystackVerifyResponse
	if err = json.NewDecoder(io.LimitReader(response.Body, 1<<20)).Decode(&verified); err != nil {
		return err
	}
	if response.StatusCode < 200 || response.StatusCode >= 300 || !verified.Status || verified.Data.Status != "success" || verified.Data.Reference != reference || verified.Data.Currency != "NGN" {
		return fmt.Errorf("provider transaction is not successful")
	}
	tx, err := db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	var intentID, userID string
	var amount int64
	var status string
	err = tx.QueryRow(ctx, `SELECT id,user_id,amount_kobo,status FROM payment_intents WHERE provider_reference=$1 AND intent_type='WALLET_FUNDING' FOR UPDATE`, reference).Scan(&intentID, &userID, &amount, &status)
	if err != nil {
		return err
	}
	if amount != verified.Data.Amount {
		return fmt.Errorf("verified amount mismatch")
	}
	if status == "SUCCEEDED" {
		return tx.Commit(ctx)
	}
	if status != "PENDING" && status != "CREATED" {
		return fmt.Errorf("payment intent is not settleable")
	}
	if amount%100 != 0 {
		return fmt.Errorf("wallet funding must settle in whole naira")
	}
	var email string
	if err = tx.QueryRow(ctx, `SELECT email FROM users WHERE id=$1`, userID).Scan(&email); err != nil {
		return err
	}
	if _, err = tx.Exec(ctx, `INSERT INTO wallet_accounts(user_id,balance_ngn) VALUES($1,0) ON CONFLICT(user_id) DO NOTHING`, userID); err != nil {
		return err
	}
	if _, err = tx.Exec(ctx, `UPDATE wallet_accounts SET balance_ngn=balance_ngn+$1 WHERE user_id=$2`, amount/100, userID); err != nil {
		return err
	}
	ledgerKey := "wallet-fund:" + intentID
	var ledgerID string
	err = tx.QueryRow(ctx, `INSERT INTO ledger_entries(user_id,idempotency_key,amount_ngn,entry_type) VALUES($1,$2,$3,'WALLET_FUNDING') ON CONFLICT(idempotency_key) DO UPDATE SET idempotency_key=EXCLUDED.idempotency_key RETURNING id`, userID, ledgerKey, amount/100).Scan(&ledgerID)
	if err != nil {
		return err
	}
	claims := map[string]any{"receipt_id": uuid.NewString(), "reference": reference, "user_id": userID, "email": email, "type": "WALLET_FUNDING", "amount_ngn": amount / 100, "currency": "NGN", "issued_at": time.Now().UTC().Format(time.RFC3339)}
	signed, keyID, err := signReceiptClaims(claims)
	if err != nil {
		return err
	}
	claimBytes, _ := json.Marshal(claims)
	signedBytes, _ := json.Marshal(signed)
	if _, err = tx.Exec(ctx, `INSERT INTO signed_receipts(user_id,payment_intent_id,ledger_entry_id,receipt_type,key_id,claims,signed_payload) VALUES($1,$2,$3,'WALLET_FUNDING',$4,$5::jsonb,$6) ON CONFLICT(ledger_entry_id) DO NOTHING`, userID, intentID, ledgerID, keyID, string(claimBytes), string(signedBytes)); err != nil {
		return err
	}
	if _, err = tx.Exec(ctx, `UPDATE payment_intents SET status='SUCCEEDED',settled_at=now(),updated_at=now() WHERE id=$1`, intentID); err != nil {
		return err
	}
	_, _ = tx.Exec(ctx, `INSERT INTO app_notifications(user_id,category,title,body,action_url,payload) VALUES($1,'WALLET','Wallet funded','Your wallet was credited with NGN '||$2::text,'/transactions',jsonb_build_object('reference',$3))`, userID, amount/100, reference)
	if err = tx.Commit(ctx); err != nil {
		return err
	}
	go sendPushNotificationToUser(db, userID, "Wallet funded", "Your DE RIDE wallet has been credited.", "/transactions")
	return nil
}

func signReceiptClaims(claims map[string]any) (map[string]string, string, error) {
	privatePEM := strings.ReplaceAll(os.Getenv("QR_PRIVATE_KEY_PEM"), `\n`, "\n")
	block, _ := pem.Decode([]byte(privatePEM))
	if block == nil {
		return nil, "", fmt.Errorf("receipt signing key is missing")
	}
	parsed, err := x509.ParsePKCS8PrivateKey(block.Bytes)
	if err != nil {
		key, e := x509.ParseECPrivateKey(block.Bytes)
		if e != nil {
			return nil, "", err
		}
		parsed = key
	}
	key, ok := parsed.(*ecdsa.PrivateKey)
	if !ok || key.Curve.Params().Name != "P-256" {
		return nil, "", fmt.Errorf("receipt key must be ECDSA P-256")
	}
	body, err := json.Marshal(claims)
	if err != nil {
		return nil, "", err
	}
	digest := sha256.Sum256(body)
	r, s, err := ecdsa.Sign(rand.Reader, key, digest[:])
	if err != nil {
		return nil, "", err
	}
	raw := make([]byte, 64)
	r.FillBytes(raw[:32])
	s.FillBytes(raw[32:])
	keyID := os.Getenv("QR_KEY_ID")
	if keyID == "" {
		return nil, "", fmt.Errorf("receipt key ID is missing")
	}
	return map[string]string{"claims": base64.RawURLEncoding.EncodeToString(body), "signature": base64.RawURLEncoding.EncodeToString(raw), "key_id": keyID}, keyID, nil
}

func receiptSigningConfigured() bool {
	return os.Getenv("QR_PRIVATE_KEY_PEM") != "" && os.Getenv("QR_KEY_ID") != ""
}
func stringValue(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}
