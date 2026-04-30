-- Notification delivery log — tracks every WhatsApp send attempt.
-- Useful for debugging "user didn't receive message" reports.

CREATE TABLE IF NOT EXISTS notifications (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid REFERENCES companies(id) ON DELETE CASCADE,
  user_id     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  type        text NOT NULL,   -- 'whatsapp_onboarding' | 'whatsapp_daily_alert'
  status      text NOT NULL,   -- 'sent' | 'failed'
  phone       text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Admins can read their own company's logs; only service role can write.
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_read_notifications" ON notifications;
CREATE POLICY "admin_read_notifications" ON notifications
  FOR SELECT USING (
    company_id = (auth.jwt() ->> 'company_id')::uuid
    AND (auth.jwt() ->> 'role') = 'ADMIN'
  );

-- Cooldown guard: tracks the last time a welcome notification was sent to this user.
-- Prevents duplicate sends if admin accidentally triggers creation twice.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS last_notified_at timestamptz;
