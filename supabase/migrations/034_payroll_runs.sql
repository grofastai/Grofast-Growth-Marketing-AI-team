-- Payroll runs: track payment status, bonus, and advances per employee per month
CREATE TABLE IF NOT EXISTS payroll_runs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES users(id)     ON DELETE CASCADE,
  month       text NOT NULL CHECK (month ~ '^\d{4}-\d{2}$'),
  bonus       numeric(10,2) NOT NULL DEFAULT 0,
  advance     numeric(10,2) NOT NULL DEFAULT 0,
  notes       text,
  is_paid     boolean NOT NULL DEFAULT false,
  paid_at     timestamptz,
  paid_by     uuid REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, month)
);

ALTER TABLE payroll_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payroll_tenant_read" ON payroll_runs
  FOR SELECT USING (company_id = (auth.jwt() ->> 'company_id')::uuid);

CREATE POLICY "payroll_admin_write" ON payroll_runs
  FOR ALL USING (
    company_id = (auth.jwt() ->> 'company_id')::uuid
    AND (auth.jwt() ->> 'role') = 'ADMIN'
  );

CREATE INDEX IF NOT EXISTS payroll_runs_company_month_idx ON payroll_runs(company_id, month);
