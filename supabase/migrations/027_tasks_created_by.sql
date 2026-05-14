-- Backfill created_by for existing tasks that have no assigner set.
-- The created_by column was added in migration 018; this fills in legacy rows.
UPDATE tasks t
SET created_by = (
  SELECT u.id FROM users u
  WHERE u.company_id = t.company_id AND u.role = 'ADMIN'
  ORDER BY u.created_at ASC
  LIMIT 1
)
WHERE created_by IS NULL;
