-- ── Add FREELANCER_MGR and FREELANCER roles ───────────────────────────────────
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('ADMIN', 'MEMBER', 'FREELANCER_MGR', 'FREELANCER'));

-- ── Freelancer updates table ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS freelancer_updates (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  freelancer_id  uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  submitted_by   uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id      uuid REFERENCES projects(id) ON DELETE SET NULL,
  client_name    text NOT NULL DEFAULT '',
  date           date NOT NULL DEFAULT CURRENT_DATE,
  work_type      text NOT NULL CHECK (work_type IN ('shooting', 'editing', 'voice_over')),

  -- Shooting fields
  shoot_title    text,
  shoot_duration numeric(4,1),
  shoot_notes    text,
  video_uploaded boolean DEFAULT false,

  -- Editing fields
  video_name     text,
  video_type     text,
  time_taken     numeric(4,1),
  drive_link     text,
  revisions      int DEFAULT 0,
  edit_notes     text,

  -- Voice Over fields
  script_name    text,
  vo_duration    text,
  vo_notes       text,

  created_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE freelancer_updates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "freelancer_updates_policy" ON freelancer_updates
  FOR ALL USING (
    company_id = (auth.jwt() ->> 'company_id')::uuid
    AND (
      (auth.jwt() ->> 'role') IN ('ADMIN', 'FREELANCER_MGR')
    )
  );

-- Indexes
CREATE INDEX IF NOT EXISTS idx_freelancer_updates_date        ON freelancer_updates(date);
CREATE INDEX IF NOT EXISTS idx_freelancer_updates_freelancer  ON freelancer_updates(freelancer_id);
CREATE INDEX IF NOT EXISTS idx_freelancer_updates_company     ON freelancer_updates(company_id);
