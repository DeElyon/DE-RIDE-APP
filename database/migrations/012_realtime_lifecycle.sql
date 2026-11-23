ALTER TABLE trips ADD COLUMN IF NOT EXISTS arrived_at timestamptz;
CREATE INDEX IF NOT EXISTS messages_trip_created_idx ON messages(trip_id, created_at);
CREATE INDEX IF NOT EXISTS escalations_trip_idx ON escalations(trip_id) WHERE trip_id IS NOT NULL;
