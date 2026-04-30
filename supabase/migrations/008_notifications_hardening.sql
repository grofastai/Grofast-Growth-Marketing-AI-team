-- Harden the notifications table and users cooldown fields.

-- 1. Per-type cooldown column — prevents different notification types from blocking each other
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS last_onboarding_notified_at timestamptz;

-- 2. Provider reference — stores the n8n execution ID or WhatsApp message ID for tracing
ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS provider_ref text;

-- 3. Deduplication index — prevents double-inserts within the same minute for the same user+type
--    (safe to create even if 007 migration already added some rows)
CREATE UNIQUE INDEX IF NOT EXISTS uniq_notifications_dedupe
  ON notifications (user_id, type, date_trunc('minute', created_at));
