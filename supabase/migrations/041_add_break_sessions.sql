-- Add break_sessions jsonb column to store each individual break session.
-- Schema per entry: { in: string (ISO), out: string (ISO) | null, mins: number | null }
-- Existing rows will default to an empty array.
ALTER TABLE attendance_logs
  ADD COLUMN IF NOT EXISTS break_sessions jsonb NOT NULL DEFAULT '[]'::jsonb;
