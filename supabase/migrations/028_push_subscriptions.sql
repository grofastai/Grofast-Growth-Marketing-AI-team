-- Web Push subscription store — one row per user (upsert on user_id)
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id  uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  endpoint    text NOT NULL,
  p256dh      text NOT NULL,
  auth        text NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Members can read/delete their own subscription
CREATE POLICY "own_subscription" ON push_subscriptions
  FOR ALL USING (user_id = auth.uid());

-- Service role handles inserts/upserts (via SUPABASE_SERVICE_ROLE_KEY)
