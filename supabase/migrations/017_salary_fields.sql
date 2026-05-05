-- Add salary/employment fields to users table
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS employment_type TEXT DEFAULT 'regular'
    CHECK (employment_type IN ('regular', 'irregular')),
  ADD COLUMN IF NOT EXISTS monthly_salary  NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS hourly_rate     NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS paid_leave_days INTEGER DEFAULT 5;
