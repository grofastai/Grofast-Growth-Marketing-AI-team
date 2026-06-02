-- Fix employment_type check constraint to include part_time and freelancer
-- Migration 017 only allowed ('regular', 'irregular') but the app sends
-- 'part_time' and 'freelancer' when creating those account types.

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_employment_type_check;

ALTER TABLE users
  ADD CONSTRAINT users_employment_type_check
  CHECK (employment_type IN ('regular', 'irregular', 'part_time', 'freelancer'));
