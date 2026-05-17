-- Add break tracking to attendance_logs
ALTER TABLE attendance_logs
  ADD COLUMN IF NOT EXISTS break_in  timestamptz,
  ADD COLUMN IF NOT EXISTS break_out timestamptz;
