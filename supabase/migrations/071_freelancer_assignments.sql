-- Per-freelancer member assignments (many-to-many)
CREATE TABLE IF NOT EXISTS freelancer_assignments (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid NOT NULL,
  freelancer_id uuid NOT NULL,
  user_id      uuid NOT NULL,
  created_at   timestamptz DEFAULT now(),
  UNIQUE (freelancer_id, user_id)
);

ALTER TABLE freelancer_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON freelancer_assignments
  FOR ALL USING (company_id = (auth.jwt() ->> 'company_id')::uuid);

CREATE INDEX IF NOT EXISTS idx_fla_freelancer ON freelancer_assignments (freelancer_id);
CREATE INDEX IF NOT EXISTS idx_fla_user       ON freelancer_assignments (user_id);
CREATE INDEX IF NOT EXISTS idx_fla_company    ON freelancer_assignments (company_id);
