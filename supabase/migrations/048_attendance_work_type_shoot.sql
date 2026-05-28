-- Allow 'shoot' as a valid work_type for media team members
-- who clock in directly from a shoot location without coming to the office.

ALTER TABLE attendance_logs
  DROP CONSTRAINT IF EXISTS attendance_logs_work_type_check;

ALTER TABLE attendance_logs
  ADD CONSTRAINT attendance_logs_work_type_check
    CHECK (work_type IN ('wfh', 'office', 'shoot'));
