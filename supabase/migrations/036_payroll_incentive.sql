-- Add incentive column to payroll_runs
ALTER TABLE payroll_runs
  ADD COLUMN IF NOT EXISTS incentive numeric(10,2) NOT NULL DEFAULT 0;
