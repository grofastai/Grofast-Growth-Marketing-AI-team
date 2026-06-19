CREATE TABLE IF NOT EXISTS company_leaves (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  date       date NOT NULL,
  name       text NOT NULL,
  created_by uuid,
  created_at timestamptz DEFAULT now(),
  UNIQUE(company_id, date)
);

ALTER TABLE company_leaves ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON company_leaves
  FOR ALL USING (company_id = (auth.jwt() ->> 'company_id')::uuid);

CREATE POLICY "admin_write" ON company_leaves
  FOR INSERT WITH CHECK ((auth.jwt() ->> 'role') = 'ADMIN');

CREATE POLICY "admin_delete" ON company_leaves
  FOR DELETE USING ((auth.jwt() ->> 'role') = 'ADMIN');
