-- Monthly salary snapshot per employee per month
-- Locked in when payroll is first opened for that month — never overwritten
CREATE TABLE IF NOT EXISTS monthly_salary_records (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id     uuid        NOT NULL REFERENCES users(id)     ON DELETE CASCADE,
  month       text        NOT NULL, -- format: YYYY-MM
  amount      numeric(12,2) NOT NULL,
  locked_at   timestamptz NOT NULL DEFAULT now(),

  UNIQUE (user_id, month)
);

ALTER TABLE monthly_salary_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON monthly_salary_records
  FOR ALL USING (company_id = (auth.jwt() ->> 'company_id')::uuid);

CREATE INDEX IF NOT EXISTS msr_company_month_idx ON monthly_salary_records(company_id, month);
CREATE INDEX IF NOT EXISTS msr_user_month_idx    ON monthly_salary_records(user_id, month);
