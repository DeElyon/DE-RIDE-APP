# API surface and planned contracts

All endpoints are rooted at `/api/v1`. Authenticated routes require a signed access token and an active role claim. Financial mutations must use an idempotency key and commit a database ledger entry in the same transaction as the business status change.

| Area | Contract |
|---|---|
| Health | `GET /healthz`, `GET /api/v1/health` (implemented) |
| Parks | `GET /api/v1/parks?state=LA` (implemented; reads configured rows) |
| Auth | `POST /api/v1/auth/register`, `/auth/verify-otp`, `/auth/login`, `/auth/refresh` (Argon2id passwords, email OTP, rotating HS256 JWT pair) |
| Profiles | `POST /api/v1/users/switch-rider-mode` (JWT, approval, active-job and persisted active-role checks) |
| Trips | `POST /api/v1/trips/:id/capacity` (JWT, assigned role, database 120-second cooldown) |
| Tickets, orders, wallet, VTU | Planned; not implemented |
| WebSockets and background workers | Planned; not implemented |

Error envelope: `{"error":"ERR_CODE","message":"...","retry_after_seconds":120}`. Capacity edits return HTTP 429 `ERR_CAPACITY_COOLDOWN_ACTIVE`. The database constrains the ₦60,000 one-time plan to the PASSENGER role; a purchase endpoint is not implemented yet. Rider-mode switching requires both approved registrations and no in-progress ride or delivery. GPS opt-in and source precedence HARDWARE > DRIVER_APP > DISPATCHER_APP > MANUAL remain schema/product requirements; telemetry endpoints are not implemented.

All authenticated routes currently use `JWT_ACCESS_SECRET` HS256 access tokens. Registration requires a valid SMTP configuration to deliver OTPs; email verification and login issue one-hour access tokens and 30-day rotating refresh tokens. Refresh tokens are persisted, single-use, and invalidated on rotation. The mode-switch operation returns a refreshed access token; previous tokens fail active-role validation. Financial mutations must never return simulated success; checkout, refunds, VTU orders, subscriptions, token accounting, and provider webhooks remain unimplemented.
