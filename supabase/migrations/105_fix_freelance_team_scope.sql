-- Correction: only "Freelance Media Production" is login-enabled — Video Editing and
-- Videography are no-login (manager enters their work), per the actual dropdown grouping
-- in team-client.tsx (NO_LOGIN_TEAMS set) which 104_teams_positions_tables.sql mis-scoped.
UPDATE teams SET scope = 'freelance_no_login'
WHERE name IN ('Freelance Video Editing', 'Freelance Videography') AND scope = 'freelance_login';
