-- OT is now decided by the admin manually per employee per month, not auto-calculated
-- from hours worked. Mirrors bonus/advance/incentive: an editable figure on payroll_runs.
ALTER TABLE payroll_runs
  ADD COLUMN IF NOT EXISTS ot_amount numeric(10,2) NOT NULL DEFAULT 0;
