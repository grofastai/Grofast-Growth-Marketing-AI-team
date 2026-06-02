-- Content Calendar: schedule posts, videos, and reels per client
CREATE TABLE IF NOT EXISTS content_posts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  title         text NOT NULL,
  platform      text CHECK (platform IN ('instagram', 'youtube', 'facebook', 'linkedin', 'twitter', 'whatsapp', 'other')),
  content_type  text CHECK (content_type IN ('post', 'reel', 'video', 'story', 'carousel', 'other')),
  client_id     uuid REFERENCES projects(id) ON DELETE SET NULL,
  client_name   text NOT NULL DEFAULT '',
  scheduled_date date NOT NULL,
  posted_date   date,
  status        text NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'in_progress', 'ready', 'posted', 'cancelled')),
  assigned_to   uuid REFERENCES users(id) ON DELETE SET NULL,
  drive_link    text,
  caption       text,
  notes         text,
  created_by    uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE content_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "content_posts_tenant" ON content_posts
  FOR ALL USING (company_id = (auth.jwt() ->> 'company_id')::uuid);

CREATE INDEX IF NOT EXISTS idx_content_posts_date    ON content_posts(company_id, scheduled_date);
CREATE INDEX IF NOT EXISTS idx_content_posts_assigned ON content_posts(assigned_to);
