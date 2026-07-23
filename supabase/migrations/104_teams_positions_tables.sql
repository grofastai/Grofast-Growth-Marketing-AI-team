-- Admin-managed Teams and Positions/Designations, replacing the hardcoded
-- FULL_TIME_TEAMS/FREELANCER_TEAMS arrays (app/admin/team/team-client.tsx)
-- and the free-text Position input. Same shape/RLS pattern as `clients`
-- (046_clients_table.sql). Old users.team/freelancers.team text columns and
-- the users_team_check constraint are left in place and dual-written for
-- now — the ~15 files that still match on team name strings are migrated
-- to team_id in a later follow-up, not this migration.

CREATE TABLE IF NOT EXISTS teams (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name         text        NOT NULL,
  scope        text        NOT NULL CHECK (scope IN ('full_time', 'freelance_login', 'freelance_no_login')),
  -- Which work-entry field set a freelance_no_login team's members get
  -- (see freelancers-member-client.tsx). New teams the admin creates start
  -- 'generic' (client/title/amount/notes/drive link only) until custom
  -- fields are wired up for them.
  template_key text        NOT NULL DEFAULT 'generic',
  color        text,
  emoji        text,
  is_active    boolean     NOT NULL DEFAULT true,
  sort_order   int         NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id, name)
);

ALTER TABLE teams ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON teams
  FOR ALL USING (company_id = (auth.jwt() ->> 'company_id')::uuid);

CREATE POLICY "admin_write" ON teams
  FOR INSERT WITH CHECK ((auth.jwt() ->> 'role') = 'ADMIN');

CREATE POLICY "admin_update" ON teams
  FOR UPDATE USING ((auth.jwt() ->> 'role') = 'ADMIN');

CREATE POLICY "admin_delete" ON teams
  FOR DELETE USING ((auth.jwt() ->> 'role') = 'ADMIN');

CREATE INDEX IF NOT EXISTS teams_company_scope_idx ON teams(company_id, scope, is_active);


CREATE TABLE IF NOT EXISTS positions (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name         text        NOT NULL,
  is_active    boolean     NOT NULL DEFAULT true,
  sort_order   int         NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id, name)
);

ALTER TABLE positions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON positions
  FOR ALL USING (company_id = (auth.jwt() ->> 'company_id')::uuid);

CREATE POLICY "admin_write" ON positions
  FOR INSERT WITH CHECK ((auth.jwt() ->> 'role') = 'ADMIN');

CREATE POLICY "admin_update" ON positions
  FOR UPDATE USING ((auth.jwt() ->> 'role') = 'ADMIN');

CREATE POLICY "admin_delete" ON positions
  FOR DELETE USING ((auth.jwt() ->> 'role') = 'ADMIN');

CREATE INDEX IF NOT EXISTS positions_company_active_idx ON positions(company_id, is_active);


-- Multi-select join tables — a person can hold more than one position.
CREATE TABLE IF NOT EXISTS user_positions (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id      uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  position_id  uuid        NOT NULL REFERENCES positions(id) ON DELETE CASCADE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, position_id)
);

ALTER TABLE user_positions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON user_positions
  FOR ALL USING (company_id = (auth.jwt() ->> 'company_id')::uuid);

CREATE POLICY "admin_write" ON user_positions
  FOR INSERT WITH CHECK ((auth.jwt() ->> 'role') = 'ADMIN');

CREATE POLICY "admin_delete" ON user_positions
  FOR DELETE USING ((auth.jwt() ->> 'role') = 'ADMIN');

CREATE INDEX IF NOT EXISTS user_positions_user_idx ON user_positions(user_id);


CREATE TABLE IF NOT EXISTS freelancer_positions (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     uuid        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  freelancer_id  uuid        NOT NULL REFERENCES freelancers(id) ON DELETE CASCADE,
  position_id    uuid        NOT NULL REFERENCES positions(id) ON DELETE CASCADE,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE(freelancer_id, position_id)
);

ALTER TABLE freelancer_positions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON freelancer_positions
  FOR ALL USING (company_id = (auth.jwt() ->> 'company_id')::uuid);

CREATE POLICY "admin_write" ON freelancer_positions
  FOR INSERT WITH CHECK ((auth.jwt() ->> 'role') = 'ADMIN');

CREATE POLICY "admin_delete" ON freelancer_positions
  FOR DELETE USING ((auth.jwt() ->> 'role') = 'ADMIN');

CREATE INDEX IF NOT EXISTS freelancer_positions_freelancer_idx ON freelancer_positions(freelancer_id);


-- team_id columns on users/freelancers, additive alongside the existing
-- text `team` column (kept + dual-written until the follow-up rollout).
ALTER TABLE users       ADD COLUMN IF NOT EXISTS team_id uuid REFERENCES teams(id);
ALTER TABLE freelancers ADD COLUMN IF NOT EXISTS team_id uuid REFERENCES teams(id);

CREATE INDEX IF NOT EXISTS users_team_id_idx       ON users(team_id);
CREATE INDEX IF NOT EXISTS freelancers_team_id_idx ON freelancers(team_id);


-- ── Seed: current hardcoded teams, one row per company ─────────────────────
DO $$
DECLARE
  c record;
BEGIN
  FOR c IN SELECT id FROM companies LOOP
    INSERT INTO teams (company_id, name, scope, template_key, color, emoji, sort_order) VALUES
      (c.id, 'Media Production Team',                          'full_time',         'generic',     '#EC4899', '🎥', 1),
      (c.id, 'Creative Studio',                                 'full_time',         'generic',     '#F59E0B', '🎨', 2),
      (c.id, 'Software Development & Automation',                'full_time',         'generic',     '#6366F1', '💻', 3),
      (c.id, 'Performance Marketing & Operations',                'full_time',         'generic',     '#10B981', '📊', 4),
      (c.id, 'AI Development & Creative Production',              'full_time',         'generic',     '#8B5CF6', '🖥️', 5),

      (c.id, 'Freelance Media Production',                       'freelance_login',    'generic',     '#EC4899', '🎥', 6),
      (c.id, 'Freelance Video Editing',                          'freelance_login',    'generic',     '#6366F1', '🎬', 7),
      (c.id, 'Freelance Videography',                            'freelance_login',    'generic',     '#EF4444', '📹', 8),

      (c.id, 'Freelance RJ Voiceover',                           'freelance_no_login', 'rj_voiceover', '#A855F7', '🎙️', 9),
      (c.id, 'Freelance Graphics Designer',                      'freelance_no_login', 'design',       '#F97316', '🎨', 10),
      (c.id, 'Freelance Content Writer',                         'freelance_no_login', 'generic',      '#14B8A6', '✍️', 11),
      (c.id, 'Freelance Software Development & Automation',      'freelance_no_login', 'dev_task',     '#6366F1', '💻', 12),
      (c.id, 'Freelance Marketing & Operations',                 'freelance_no_login', 'dev_task',     '#10B981', '📊', 13),
      (c.id, 'Freelance AI Development & Creative Production',   'freelance_no_login', 'hybrid_it_media', '#8B5CF6', '🖥️', 14)
    ON CONFLICT (company_id, name) DO NOTHING;

    -- Starting Position catalog, per the user's supplied list — editable/extendable from Manage Positions.
    INSERT INTO positions (company_id, name, sort_order) VALUES
      (c.id, 'FOUNDER & CEO', 1),
      (c.id, 'FOUNDER & MD', 2),
      (c.id, 'SENIOR SOFTWARE DEVELOPER', 3),
      (c.id, 'JUNIOR SOFTWARE DEVELOPER', 4),
      (c.id, 'PERFORMANCE MARKETING EXECUTIVE', 5),
      (c.id, 'CREATIVE STUDIO EXECUTIVE', 6),
      (c.id, 'SOCIAL MEDIA MANAGER', 7),
      (c.id, 'CLIENT RELATIONSHIP MANAGER', 8),
      (c.id, 'OPERATIONS EXECUTIVE', 9)
    ON CONFLICT (company_id, name) DO NOTHING;
  END LOOP;
END $$;

-- Backfill team_id on existing rows by matching the current text `team` value.
UPDATE users u SET team_id = t.id
  FROM teams t WHERE t.company_id = u.company_id AND t.name = u.team AND u.team_id IS NULL;

UPDATE freelancers f SET team_id = t.id
  FROM teams t WHERE t.company_id = f.company_id AND t.name = f.team AND f.team_id IS NULL;

-- Note: per the user's explicit instruction, user_positions/freelancer_positions
-- are intentionally left empty — no auto-backfill from the old free-text
-- users.position/freelancers.position values. The admin assigns positions
-- manually after this ships.
