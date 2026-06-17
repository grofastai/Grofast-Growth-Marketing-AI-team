-- Add break_minutes to freelancer work entries for video shooters
ALTER TABLE freelancer_work_entries
  ADD COLUMN IF NOT EXISTS break_minutes integer NOT NULL DEFAULT 0;
