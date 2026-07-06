-- Recurring task engine: each generated task is the "live head" of its own series.
-- When recurring_active is true and recurring_next_run has arrived, the cron clones
-- the row into a new task, then flips recurring_active to false on this row.
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS recurring_active   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS recurring_next_run date;

CREATE INDEX IF NOT EXISTS idx_tasks_recurring_due
  ON tasks (recurring_next_run)
  WHERE recurring_active = true;
