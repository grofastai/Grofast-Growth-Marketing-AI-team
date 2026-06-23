-- Add extra profile fields to freelancers table (for no-login freelancers)
ALTER TABLE freelancers ADD COLUMN IF NOT EXISTS email       text;
ALTER TABLE freelancers ADD COLUMN IF NOT EXISTS date_of_birth date;
ALTER TABLE freelancers ADD COLUMN IF NOT EXISTS joined_at   date;
ALTER TABLE freelancers ADD COLUMN IF NOT EXISTS position    text;
