-- ── New Role Types: FOUNDER and CEO ─────────────────────────────────────────
-- Extends the role CHECK constraint to include FOUNDER and CEO alongside existing roles.
-- Both roles get admin-panel access (same routing as ADMIN) while also being
-- able to access the member panel for their own daily updates.

DO $$
BEGIN
  -- Drop the existing role constraint (name may vary by migration version)
  ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;

  -- Re-add with new roles included
  ALTER TABLE users ADD CONSTRAINT users_role_check
    CHECK (role IN ('ADMIN','MEMBER','FREELANCER_MGR','FREELANCER','FOUNDER','CEO'));
END$$;

-- Update the JWT hook to recognise admin-level roles
-- The hook already passes the role value through verbatim — no function change needed.
-- The routing logic that consumes 'role' (middleware, layouts) is updated in app code.
