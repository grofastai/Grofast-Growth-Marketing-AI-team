-- Rename 'absent' → 'leave' everywhere.
-- attendance_logs.status
ALTER TABLE attendance_logs DROP CONSTRAINT IF EXISTS attendance_logs_status_check;
UPDATE attendance_logs SET status = 'leave' WHERE status = 'absent';
ALTER TABLE attendance_logs
  ADD CONSTRAINT attendance_logs_status_check
  CHECK (status = ANY (ARRAY['present', 'leave', 'half_day']));

-- daily_updates.attendance_status
ALTER TABLE daily_updates DROP CONSTRAINT IF EXISTS daily_updates_attendance_status_check;
UPDATE daily_updates SET attendance_status = 'leave' WHERE attendance_status = 'absent';
ALTER TABLE daily_updates
  ADD CONSTRAINT daily_updates_attendance_status_check
  CHECK (attendance_status IN ('present', 'leave', 'holiday', 'outside'));
