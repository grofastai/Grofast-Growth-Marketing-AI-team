-- Task 8: In-app (bell) notifications.
--
-- The `notifications` table was originally created in 007/008 as a WhatsApp
-- *send log* (columns: status, phone, provider_ref, minute_bucket). The in-app
-- notification feature reuses the same table but needs a different shape:
-- title/body/read/link rows that members read and mark as read.
--
-- This migration reconciles the table to support both uses:
--   * adds the in-app columns (title, body, read, link)
--   * relaxes the legacy NOT NULL on `status` (in-app rows don't set it)
--   * removes the per-minute dedupe unique index, which would silently reject
--     legitimate bulk inserts (e.g. one announcement notification per company
--     user) and repeated same-type notifications within the same minute
--   * adds user-scoped RLS so a member can read and update ONLY their own rows

-- 1. New columns for in-app notifications --------------------------------------
ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS body  text,
  ADD COLUMN IF NOT EXISTS read  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS link  text;

-- 2. Relax legacy NOT NULL constraints (WhatsApp-log fields are optional now) ---
ALTER TABLE notifications ALTER COLUMN status DROP NOT NULL;

-- 3. Drop the per-minute dedupe index + trigger (blocks bulk/same-minute inserts)
DROP INDEX IF EXISTS uniq_notifications_dedupe;
DROP TRIGGER IF EXISTS set_minute_bucket ON notifications;

-- 4. Performance: list unread / recent notifications for a user fast -----------
CREATE INDEX IF NOT EXISTS idx_notifications_user_created
  ON notifications (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON notifications (user_id) WHERE read = false;

-- 5. RLS — a user can read and update only their own notifications -------------
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own_read_notifications"   ON notifications;
CREATE POLICY "own_read_notifications" ON notifications
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "own_update_notifications" ON notifications;
CREATE POLICY "own_update_notifications" ON notifications
  FOR UPDATE USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
