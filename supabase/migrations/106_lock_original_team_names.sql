-- Prevents renaming the 8 original no-login freelancer teams from the Manage
-- Teams panel. The freelancer work-entry form (freelancers-member-client.tsx)
-- still matches these exact original names in code to decide which custom
-- fields to show (Duration/Language for RJ Voiceover, Task Description for
-- Dev, etc.) and hasn't been migrated to read from the teams table yet —
-- renaming one of them would silently switch that freelancer to the generic
-- form. Colors/emoji can still be edited freely (cosmetic, nothing depends on
-- them); only the name is locked.
--
-- Full-time teams and the one login freelancer team ("Freelance Media
-- Production") are intentionally left unlocked per the user's explicit
-- instruction — only the no-login freelancer teams should be locked.
-- Teams the admin creates from now on are also never locked.

ALTER TABLE teams ADD COLUMN IF NOT EXISTS is_locked boolean NOT NULL DEFAULT false;

UPDATE teams SET is_locked = true WHERE scope = 'freelance_no_login' AND name IN (
  'Freelance Video Editing',
  'Freelance Videography',
  'Freelance RJ Voiceover',
  'Freelance Graphics Designer',
  'Freelance Content Writer',
  'Freelance Software Development & Automation',
  'Freelance Marketing & Operations',
  'Freelance AI Development & Creative Production'
);
