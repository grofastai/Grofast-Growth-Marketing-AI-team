ALTER TABLE content_posts
  ADD COLUMN IF NOT EXISTS content_pillar text,
  ADD COLUMN IF NOT EXISTS priority text DEFAULT 'medium'
    CHECK (priority IN ('low', 'medium', 'high', 'urgent'));
