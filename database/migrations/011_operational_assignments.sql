-- Explicit scope for dispatchers and park operators; being assigned a role alone
-- does not grant access to every trip or terminal.
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified boolean NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name text NOT NULL DEFAULT '';
ALTER TABLE email_otps ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
CREATE INDEX IF NOT EXISTS email_otps_user_created_idx ON email_otps(user_id, created_at DESC);
CREATE TABLE IF NOT EXISTS auth_refresh_tokens (
 id uuid PRIMARY KEY,
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 expires_at timestamptz NOT NULL,
 revoked_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS auth_refresh_user_idx ON auth_refresh_tokens(user_id, expires_at);
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='passenger_lifetime_plan_only') THEN
  ALTER TABLE subscription_plans ADD CONSTRAINT passenger_lifetime_plan_only
   CHECK (id <> 'passenger_lifetime' OR (price_ngn=60000 AND interval='one_time' AND eligible_roles=ARRAY['PASSENGER']::text[]));
 END IF;
END $$;
CREATE TABLE IF NOT EXISTS park_operator_assignments (
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 park_id uuid NOT NULL REFERENCES bus_parks(id) ON DELETE CASCADE,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id, park_id)
);
CREATE TABLE IF NOT EXISTS trip_operator_assignments (
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 trip_id uuid NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id, trip_id)
);
