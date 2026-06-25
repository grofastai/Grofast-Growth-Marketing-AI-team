-- Make the support handler assignable instead of hardcoded to GF003.
-- Any user with is_support_handler = true sees the Support Inbox (handler workspace);
-- everyone else sees the member Support chat. Admins are always handlers in code.
-- Starts fresh: no one is assigned until an admin toggles it on in the Team tab.
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_support_handler boolean NOT NULL DEFAULT false;

-- Speeds up "find all handlers for this company" notification lookups.
CREATE INDEX IF NOT EXISTS idx_users_support_handler
  ON users (company_id)
  WHERE is_support_handler = true;
