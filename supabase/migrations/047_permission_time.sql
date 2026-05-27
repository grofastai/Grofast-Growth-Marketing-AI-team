-- Add permission_time to leaves for short permission requests (e.g. "14:00")
ALTER TABLE leaves ADD COLUMN IF NOT EXISTS permission_time text;
