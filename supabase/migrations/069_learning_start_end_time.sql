ALTER TABLE daily_updates
  ADD COLUMN IF NOT EXISTS learning_start_time TEXT,
  ADD COLUMN IF NOT EXISTS learning_end_time   TEXT;
