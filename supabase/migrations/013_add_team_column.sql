-- Add team column to users table
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS team text
  CHECK (team IS NULL OR team IN (
    'Media Team',
    'Tech & Operation Team',
    'Tech & Media Team',
    'Freelancing',
    'Script Team'
  ));
