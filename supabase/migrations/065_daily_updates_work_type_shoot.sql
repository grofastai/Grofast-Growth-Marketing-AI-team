-- Allow 'shoot' as valid work_type in daily_updates (mirrors attendance_logs)
ALTER TABLE daily_updates
  DROP CONSTRAINT IF EXISTS daily_updates_work_type_check;

ALTER TABLE daily_updates
  ADD CONSTRAINT daily_updates_work_type_check
    CHECK (work_type IN ('office', 'outside', 'wfh', 'shoot'));
