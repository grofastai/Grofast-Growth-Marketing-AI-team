-- Add freelancer manager flag to users
-- Only one member per company can have this set to true at a time (enforced in app layer)
ALTER TABLE users ADD COLUMN IF NOT EXISTS can_manage_freelancers boolean NOT NULL DEFAULT false;
