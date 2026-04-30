-- Add work_type and status to attendance_logs
-- work_type: 'wfh' | 'office'
-- status:    'present' | 'absent'

ALTER TABLE attendance_logs
  ADD COLUMN IF NOT EXISTS work_type text CHECK (work_type IN ('wfh', 'office')),
  ADD COLUMN IF NOT EXISTS status    text NOT NULL DEFAULT 'present'
    CHECK (status IN ('present', 'absent'));
