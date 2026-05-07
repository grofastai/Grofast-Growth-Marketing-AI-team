-- Update team CHECK constraint to match new team names
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_team_check;

ALTER TABLE users
  ADD CONSTRAINT users_team_check CHECK (
    team IS NULL OR team IN (
      'Media & Technology Team',
      'Media Team',
      'Technology & Operation Team',
      'Creative Team'
    )
  );
