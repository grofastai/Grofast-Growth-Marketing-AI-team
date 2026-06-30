-- Drop old team name constraint
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_team_check;

-- Update existing members to new team names
UPDATE users SET team = 'Media Production Team'              WHERE team = 'Media Team';
UPDATE users SET team = 'AI Development & Media'             WHERE team = 'Media & Technology Team';
UPDATE users SET team = 'Performance Marketing & Operations' WHERE team = 'Technology & Operation Team';
UPDATE users SET team = 'Creative Studio'                    WHERE team = 'Creative Team';
-- Rename Freelance Creative Studio → Freelance RJ Voiceover (if any rows exist)
UPDATE users SET team = 'Freelance RJ Voiceover'             WHERE team = 'Freelance Creative Studio';

-- Add new constraint with all 9 freelancer teams + 5 full-time teams
ALTER TABLE users ADD CONSTRAINT users_team_check CHECK (
  team IS NULL OR team IN (
    -- Full Time
    'Media Production Team',
    'Creative Studio',
    'AI Development & Automation',
    'Performance Marketing & Operations',
    'AI Development & Media',
    -- Freelancer (has login)
    'Freelance Media Production',
    'Freelance Video Editing',
    'Freelance Videography',
    -- Freelancer (no login — manager enters data)
    'Freelance RJ Voiceover',
    'Freelance Graphics Designer',
    'Freelance Content Writer',
    'Freelance Development & Automation',
    'Freelance Marketing & Operations',
    'Freelance IT Technology & Media'
  )
);
