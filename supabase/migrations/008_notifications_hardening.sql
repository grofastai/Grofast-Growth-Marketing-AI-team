-- Harden the notifications table and users cooldown fields.

-- 1. Per-type cooldown column — prevents different notification types from blocking each other
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS last_onboarding_notified_at timestamptz;

-- 2. Provider reference — stores the n8n execution ID or WhatsApp message ID for tracing
ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS provider_ref text;

-- 3. Deduplication via minute_bucket column + unique index.
--    date_trunc('minute', timestamptz) is STABLE (timezone-dependent), not IMMUTABLE,
--    so it cannot be used directly in an index expression. Instead we store the truncated
--    value in a plain column populated by a BEFORE INSERT trigger.
ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS minute_bucket timestamptz;

CREATE OR REPLACE FUNCTION notifications_set_minute_bucket()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  NEW.minute_bucket := date_trunc('minute', NEW.created_at);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_minute_bucket ON notifications;
CREATE TRIGGER set_minute_bucket
  BEFORE INSERT ON notifications
  FOR EACH ROW EXECUTE FUNCTION notifications_set_minute_bucket();

CREATE UNIQUE INDEX IF NOT EXISTS uniq_notifications_dedupe
  ON notifications (user_id, type, minute_bucket);
