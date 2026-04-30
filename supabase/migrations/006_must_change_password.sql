-- Add must_change_password flag to users table.
-- Existing users default to false (no forced reset).
-- New members created by admin will have this set to true via application code.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;
