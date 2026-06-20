-- Drop overly strict platform and content_type check constraints on content_posts.
-- Validation is enforced in the application layer (PLATFORMS array in UI).
-- This prevents errors when new platform/type values are introduced.

ALTER TABLE content_posts
  DROP CONSTRAINT IF EXISTS content_posts_platform_check;

ALTER TABLE content_posts
  DROP CONSTRAINT IF EXISTS content_posts_content_type_check;
