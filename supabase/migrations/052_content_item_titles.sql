-- Item titles for count-based work log entries.
-- Each element is the title of one produced item (video, poster, reel, etc.).
-- Empty array = legacy row, no titles recorded.
ALTER TABLE work_logs
  ADD COLUMN IF NOT EXISTS item_titles text[] NOT NULL DEFAULT '{}';

-- Optional title for each published post.
ALTER TABLE content_posts
  ADD COLUMN IF NOT EXISTS title text;
