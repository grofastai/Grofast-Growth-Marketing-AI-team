-- Allow 'half_day' as a valid attendance status
ALTER TABLE attendance_logs DROP CONSTRAINT IF EXISTS attendance_logs_status_check;
ALTER TABLE attendance_logs ADD CONSTRAINT attendance_logs_status_check
  CHECK (status = ANY (ARRAY['present', 'absent', 'half_day']));
