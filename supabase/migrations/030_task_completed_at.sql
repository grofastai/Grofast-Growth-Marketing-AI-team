-- Track when a task was marked completed (for 7-day auto-delete)
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS completed_at timestamptz;

-- Backfill existing completed tasks
UPDATE tasks SET completed_at = created_at WHERE status = 'completed' AND completed_at IS NULL;
