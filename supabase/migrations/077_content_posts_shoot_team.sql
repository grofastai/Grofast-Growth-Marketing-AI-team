ALTER TABLE content_posts ADD COLUMN IF NOT EXISTS shoot_team uuid[] DEFAULT '{}';
