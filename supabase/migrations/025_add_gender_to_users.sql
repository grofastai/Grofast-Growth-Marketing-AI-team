-- Add gender column to users table
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS gender TEXT DEFAULT 'male' CHECK (gender IN ('male', 'female'));
