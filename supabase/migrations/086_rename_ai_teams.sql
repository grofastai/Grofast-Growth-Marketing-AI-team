-- Rename two easily-confused full-time teams + their freelancer counterparts
-- Old "AI Development & Automation" (pure tech: app/web dev, custom AI software, automation)
--   -> "Software Development & Automation"
-- Old "AI Development & Media" (same scope + voiceover/posters/scripting)
--   -> "AI Development & Creative Production"

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_team_check;

UPDATE users SET team = 'Software Development & Automation'   WHERE team = 'AI Development & Automation';
UPDATE users SET team = 'AI Development & Creative Production' WHERE team = 'AI Development & Media';

UPDATE freelancers SET team = 'Freelance Software Development & Automation'    WHERE team = 'Freelance Development & Automation';
UPDATE freelancers SET team = 'Freelance AI Development & Creative Production' WHERE team = 'Freelance IT Technology & Media';

ALTER TABLE users ADD CONSTRAINT users_team_check CHECK (
  team IS NULL OR team IN (
    -- Full Time
    'Media Production Team',
    'Creative Studio',
    'Software Development & Automation',
    'Performance Marketing & Operations',
    'AI Development & Creative Production',
    -- Freelancer (has login)
    'Freelance Media Production',
    'Freelance Video Editing',
    'Freelance Videography',
    -- Freelancer (no login — manager enters data)
    'Freelance RJ Voiceover',
    'Freelance Graphics Designer',
    'Freelance Content Writer',
    'Freelance Software Development & Automation',
    'Freelance Marketing & Operations',
    'Freelance AI Development & Creative Production'
  )
);
