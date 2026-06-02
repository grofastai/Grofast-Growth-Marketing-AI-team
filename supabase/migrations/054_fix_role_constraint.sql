-- Fix users_role_check constraint to include FREELANCER_MGR and FREELANCER roles.
-- Migration 032 added these roles but was not applied to the live database,
-- leaving the constraint at the original ('ADMIN', 'MEMBER') from migration 001.

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;

ALTER TABLE users
  ADD CONSTRAINT users_role_check
  CHECK (role IN ('ADMIN', 'MEMBER', 'FREELANCER_MGR', 'FREELANCER'));
