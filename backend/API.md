# API surface

All routes use `/api/v1`. Authenticated routes require an access token; monetary writes must be idempotent and update durable ledger records transactionally.

| Area | Routes | Status |
|---|---|---|
| Auth/session | `POST /auth/register`, `/auth/verify-otp`, `/auth/login`, `/auth/refresh`, `/auth/logout` | Implemented with Argon2id, one-time email OTP, rotating persisted refresh sessions, and session-bound access tokens |
| Profile | `GET /me`, `POST /users/switch-rider-mode` | Implemented; switch requires both approvals and no active job |
| Parks/trips | `GET /parks`, `/parks/summary`, `POST /trips/:id/capacity` | Directory and database-backed 120-second capacity lock implemented |
| Cloudinary | `POST /media/cloudinary-sign`, `/media/cloudinary-confirm`, `GET /media/:id/access` | Signed authenticated uploads, server verification, compressed incoming transformations, short-lived reviewer/owner download URLs; KYC retained, other assets expire after 30 days |
| KYC | `POST /vehicle-registrations`, `GET /admin/kyc/queue`, `POST /admin/kyc/:registrationID/review` | Vehicle submission, ownership-checked assets, reviews, role approval and notifications implemented |
| Wallet funding | `POST /wallet/fund`, `GET /payments/verify`, `POST /webhooks/paystack` | Paystack initialization, verification before settlement, event persistence, async retry worker, wallet ledger and signed receipt implemented |
| Account activity | `GET /wallet/transactions`, `/transactions`, `/transactions/:id/receipt`, `/notifications`; `PATCH /notifications/:id/read`, `POST /notifications/read-all` | Read APIs implemented; signed receipts exist for verified wallet funding, wallet ticket purchases/refunds, and paid subscriptions. The transaction feed exposes all ledger categories and signed receipts |
| Push | `POST/DELETE /push-subscriptions/:id` (POST path omits `:id`) | VAPID Web Push subscription and wallet/KYC event delivery implemented |
| Support/disputes | `GET/POST /support/cases`, `GET/POST /support/cases/:caseID/messages`, `POST /disputes` | Customer case creation, correspondence, and dispute filing implemented |
| Realtime | `POST /ws-ticket`, `GET /ws?ticket=...` | Authenticated WebSocket trip chat and six-minute post-arrival purge implemented |

**Implemented with limits:** Ticket checkout and ticket refunds currently settle to/from the DE RIDE wallet only. Subscription upgrades debit the wallet and downgrades to an eligible free plan take effect immediately; upgrades do not yet use recurring Paystack billing. Customer support case creation and replies are available, but admin replies and dispute adjudication are not. The support page currently lists cases without opening their message threads.

**Not yet implemented:** Paystack-backed ticket checkout and original-funding refunds; Paystack-backed subscription billing; Amebo token purchases and metering; VTU plan/purchase integration; admin support replies/dispute adjudication; rank prize settlement; GPS telemetry and full rider-order APIs. These flows must not be represented as completed in product UI until their provider and settlement handlers exist.

For media uploads, configure a signed Cloudinary upload preset with strict 5 MB limits, supported formats, authenticated delivery, and incoming transformation policies. Image incoming transformations apply before storage; PDF documents are size-validated but remain their original file format. KYC assets have no automatic expiry; non-KYC media is removed by the hourly worker after 30 days.

For payments, configure `PAYSTACK_SECRET_KEY`, webhook signing secrets, `QR_PRIVATE_KEY_PEM`, and `QR_KEY_ID`. The webhook handler authenticates the raw request body, records the event, acknowledges it, and uses a retryable worker; the worker verifies the transaction with Paystack before crediting the wallet. Never trust a browser callback as proof of payment.

The process-local WebSocket hub and in-memory cooldown/cache are per instance. Run a single API instance until shared realtime/cache infrastructure is intentionally introduced. Financial and KYC records remain durable in Neon Postgres.
