-- Store explicit end time for permission leaves (replaces calculated start + duration)
ALTER TABLE leaves ADD COLUMN IF NOT EXISTS permission_end_time text;

-- Store optional time period for half-day leaves
ALTER TABLE leaves ADD COLUMN IF NOT EXISTS half_day_from_time text;
ALTER TABLE leaves ADD COLUMN IF NOT EXISTS half_day_to_time text;
