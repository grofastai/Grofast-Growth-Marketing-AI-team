-- ============================================================
-- GroFast Data Integrity Checks
-- Run weekly in Supabase SQL Editor.
-- All queries return rows only when a problem exists.
-- ============================================================

-- 1. Users in the DB with no matching Supabase Auth account
--    (orphaned rows — auth user was deleted but users row remained)
SELECT u.id, u.name, u.email, u.company_id
FROM users u
WHERE NOT EXISTS (
  SELECT 1 FROM auth.users a WHERE a.id = u.id
);

-- 2. Tasks with no project (project was deleted, task became orphaned)
SELECT t.id, t.title, t.status, t.company_id
FROM tasks t
WHERE t.project_id IS NULL;

-- 3. Tasks that are overdue and still open (silent blockers)
SELECT t.id, t.title, t.due_date, t.status,
       u.name AS assigned_to_name
FROM tasks t
LEFT JOIN users u ON u.id = t.assigned_to
WHERE t.status <> 'completed'
  AND t.due_date < CURRENT_DATE
ORDER BY t.due_date ASC;

-- 4. Active projects past deadline (no alert was actioned)
SELECT p.id, p.business_name, p.deadline, p.progress_pct, p.company_id
FROM projects p
WHERE p.status = 'active'
  AND p.deadline < CURRENT_DATE
ORDER BY p.deadline ASC;

-- 5. Members who have never submitted a daily update (might be inactive/test accounts)
SELECT u.id, u.name, u.employee_id, u.created_at, u.status
FROM users u
WHERE u.role = 'MEMBER'
  AND NOT EXISTS (
    SELECT 1 FROM daily_updates d WHERE d.user_id = u.id
  );

-- 6. WhatsApp notifications that failed in the last 7 days
SELECT n.id, n.type, n.phone, n.created_at,
       u.name AS user_name, u.email
FROM notifications n
LEFT JOIN users u ON u.id = n.user_id
WHERE n.status = 'failed'
  AND n.created_at > now() - interval '7 days'
ORDER BY n.created_at DESC;

-- 7. Users with must_change_password still true after 48 hours
--    (they received the magic link but haven't logged in)
SELECT u.id, u.name, u.email, u.created_at,
       u.last_onboarding_notified_at
FROM users u
WHERE u.must_change_password = true
  AND u.created_at < now() - interval '48 hours';

-- 8. Duplicate daily updates (should not exist — unique constraint — but check anyway)
SELECT user_id, date, COUNT(*) AS cnt
FROM daily_updates
GROUP BY user_id, date
HAVING COUNT(*) > 1;
