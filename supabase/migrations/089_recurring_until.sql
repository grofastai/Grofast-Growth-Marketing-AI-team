-- Bounds a recurring task's chain to a date range instead of running forever.
-- Null means open-ended (existing recurring tasks created before this column
-- existed keep their old unlimited behavior).
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS recurring_until date;
