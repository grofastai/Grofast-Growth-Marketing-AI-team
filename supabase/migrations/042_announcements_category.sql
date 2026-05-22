-- Add category column to announcements table
ALTER TABLE announcements
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'General';
