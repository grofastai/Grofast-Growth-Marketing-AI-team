-- Per-company payroll calculation settings. Every default below matches the
-- values that were previously hardcoded in app/admin/payroll/page.tsx and
-- app/api/payslip/route.ts, so any company with no row here (or before this
-- migration has been backfilled) calculates payroll identically to before —
-- this table is purely additive/opt-in.
CREATE TABLE IF NOT EXISTS payroll_settings (
  company_id        uuid        PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  ot_threshold_hrs   numeric(4,2) NOT NULL DEFAULT 9.5,
  half_day_threshold_hrs numeric(4,2) NOT NULL DEFAULT 4,
  salary_basis_days numeric(4,1) NOT NULL DEFAULT 30,
  basic_pct         numeric(5,2) NOT NULL DEFAULT 50,
  hra_pct           numeric(5,2) NOT NULL DEFAULT 20,
  travel_pct        numeric(5,2) NOT NULL DEFAULT 7,
  medical_pct       numeric(5,2) NOT NULL DEFAULT 3,
  updated_at        timestamptz NOT NULL DEFAULT now(),
  updated_by        uuid REFERENCES users(id) ON DELETE SET NULL
);

ALTER TABLE payroll_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON payroll_settings
  FOR ALL USING (
    company_id = (auth.jwt() ->> 'company_id')::uuid
  );

CREATE POLICY "admin_write" ON payroll_settings
  FOR INSERT WITH CHECK (
    (auth.jwt() ->> 'role') = 'ADMIN'
  );

CREATE POLICY "admin_update" ON payroll_settings
  FOR UPDATE USING (
    (auth.jwt() ->> 'role') = 'ADMIN'
  );
