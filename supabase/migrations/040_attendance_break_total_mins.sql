-- Accumulate total break minutes so employees can take multiple breaks per day.
-- After each Break Out the duration is added here and break_in/break_out are cleared.
ALTER TABLE attendance_logs
  ADD COLUMN IF NOT EXISTS break_total_mins integer NOT NULL DEFAULT 0;
