-- Drop old team name constraint
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_team_check;

-- Update existing members to new team names
UPDATE users SET team = 'Media Production Team'              WHERE team = 'Media Team';
UPDATE users SET team = 'AI Development & Media'             WHERE team = 'Media & Technology Team';
UPDATE users SET team = 'Performance Marketing & Operations' WHERE team = 'Technology & Operation Team';
UPDATE users SET team = 'Creative Studio'                    WHERE team = 'Creative Team';

-- Add new constraint with all current team names
ALTER TABLE users ADD CONSTRAINT users_team_check CHECK (
  team IS NULL OR team IN (
    'Media Production Team',
    'Creative Studio',
    'AI Development & Automation',
    'Performance Marketing & Operations',
    'AI Development & Media',
    'Freelance Media Production',
    'Freelance Creative Studio',
    'Freelance Development & Automation',
    'Freelance Marketing & Operations',
    'Freelance IT Technology & Media'
  )
);
