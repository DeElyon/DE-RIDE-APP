# API surface and planned contracts

All endpoints are rooted at `/api/v1`. Authenticated routes require a signed access token and an active role claim. Financial mutations must use an idempotency key and commit a database ledger entry in the same transaction as the business status change.

| Area | Contract |
|---|---|
| Health | `GET /healthz`, `GET /api/v1/health` (implemented) |
| Parks | `GET /api/v1/parks?state=LA` (implemented; reads configured rows) |
| Auth | `POST /api/v1/auth/register`, `/auth/verify-otp`, `/auth/login`, `/auth/refresh`, `/auth/logout` (Argon2id passwords, email OTP, rotating HS256 JWT pair, persisted refresh-session revocation) |
| Profiles | `GET /api/v1/me` (account, verification, wallet and Amebo balances); `POST /api/v1/users/switch-rider-mode` (JWT, approval, active-job and persisted active-role checks; returns a fresh token pair) |
| Wallet reads | `GET /api/v1/wallet/transactions` (most recent 50 persisted ledger entries) |
| Trips | `POST /api/v1/trips/:id/capacity` (JWT, assigned role, database 120-second cooldown) |
| Tickets, orders, wallet mutations, VTU | Planned; checkout, top-ups, refunds, purchases and settlements are not implemented |
| WebSockets and background workers | Authenticated trip rooms, persisted chat messages, and six-minute post-arrival purge |

The browser obtains a 30-second WebSocket ticket with authenticated `POST /api/v1/ws-ticket`, then connects to `GET /api/v1/ws?ticket=...`. `frontend/src/lib/api-client.ts` provides `openAuthenticatedWebSocket()`. Join a trip with `{"event":"room:join","trip_id":"..."}` and send chat with `{"event":"chat:send_message","trip_id":"...","content":"..."}`. Trip access is restricted to its assigned driver and ticketed passengers. Room membership is process-local; deploy one API instance until a shared realtime transport is added. Migration `012_realtime_lifecycle.sql` adds `trips.arrived_at`, which must be set when a trip is marked arrived for six-minute cleanup to run.

Error envelope: `{"error":"ERR_CODE","message":"...","retry_after_seconds":120}`. Capacity edits return HTTP 429 `ERR_CAPACITY_COOLDOWN_ACTIVE`. The database constrains the ₦60,000 one-time plan to the PASSENGER role; a purchase endpoint is not implemented yet. Rider-mode switching requires both approved registrations and no in-progress ride or delivery. GPS opt-in and source precedence HARDWARE > DRIVER_APP > DISPATCHER_APP > MANUAL remain schema/product requirements; telemetry endpoints are not implemented.

All authenticated routes currently use `JWT_ACCESS_SECRET` HS256 access tokens. Registration requires a valid SMTP configuration to deliver OTPs; email verification and login issue one-hour access tokens and 30-day rotating refresh tokens. Refresh tokens are persisted, single-use, and invalidated on rotation. Access tokens are bound to the refresh session, so logout and rotation revoke their use immediately. The mode-switch operation revokes prior sessions and returns a fresh token pair. Financial mutations must never return simulated success; checkout, wallet funding, refunds, VTU orders, subscriptions, token accounting, and provider webhooks remain unimplemented.
