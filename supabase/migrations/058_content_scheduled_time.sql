-- 058_content_scheduled_time.sql

-- Add optional posting time to content_posts
ALTER TABLE content_posts
  ADD COLUMN IF NOT EXISTS scheduled_time time NULL;

-- Drop the existing status CHECK constraint and recreate with 'missed' included
ALTER TABLE content_posts
  DROP CONSTRAINT IF EXISTS content_posts_status_check;

ALTER TABLE content_posts
  ADD CONSTRAINT content_posts_status_check
  CHECK (status IN ('pending', 'in_progress', 'ready', 'posted', 'cancelled', 'missed'));
