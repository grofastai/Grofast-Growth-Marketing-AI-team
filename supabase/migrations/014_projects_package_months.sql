-- Add package name and engagement month range to projects
-- Run in: Supabase Dashboard → SQL Editor

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS package_name  text,
  ADD COLUMN IF NOT EXISTS start_month   date,
  ADD COLUMN IF NOT EXISTS end_month     date;
