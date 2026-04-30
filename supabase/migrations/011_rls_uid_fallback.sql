-- ============================================================
-- RLS UID Fallback
-- Adds auth.uid()-based fallback clauses to all user-scoped
-- SELECT/UPDATE policies so member data loads even when the
-- custom JWT hook has not injected company_id/role claims.
-- ============================================================

-- ── users ─────────────────────────────────────────────────────
DROP POLICY IF EXISTS "tenant_read_users" ON users;
CREATE POLICY "tenant_read_users" ON users
  FOR SELECT USING (
    company_id = (auth.jwt() ->> 'company_id')::uuid
    OR id = auth.uid()
  );

-- ── daily_updates ─────────────────────────────────────────────
DROP POLICY IF EXISTS "tenant_daily_updates" ON daily_updates;
CREATE POLICY "tenant_daily_updates" ON daily_updates
  FOR ALL USING (
    (
      company_id = (auth.jwt() ->> 'company_id')::uuid
      AND (
        (auth.jwt() ->> 'role') = 'ADMIN'
        OR user_id = auth.uid()
      )
    )
    OR user_id = auth.uid()
  );

-- ── tasks — select & update ────────────────────────────────────
DROP POLICY IF EXISTS "tasks_select" ON tasks;
CREATE POLICY "tasks_select" ON tasks
  FOR SELECT USING (
    company_id = (auth.jwt() ->> 'company_id')::uuid
    OR assigned_to = auth.uid()
  );

DROP POLICY IF EXISTS "tasks_update" ON tasks;
CREATE POLICY "tasks_update" ON tasks
  FOR UPDATE USING (
    (
      company_id = (auth.jwt() ->> 'company_id')::uuid
      AND (
        (auth.jwt() ->> 'role') = 'ADMIN'
        OR assigned_to = auth.uid()
      )
    )
    OR assigned_to = auth.uid()
  );

-- ── leaves ────────────────────────────────────────────────────
DROP POLICY IF EXISTS "tenant_leaves" ON leaves;
CREATE POLICY "tenant_leaves" ON leaves
  FOR ALL USING (
    (
      company_id = (auth.jwt() ->> 'company_id')::uuid
      AND (
        (auth.jwt() ->> 'role') = 'ADMIN'
        OR user_id = auth.uid()
      )
    )
    OR user_id = auth.uid()
  );

-- ── attendance_logs ───────────────────────────────────────────
DROP POLICY IF EXISTS "tenant_isolation" ON attendance_logs;
CREATE POLICY "tenant_isolation" ON attendance_logs
  FOR ALL USING (
    company_id = (auth.jwt() ->> 'company_id')::uuid
    OR user_id = auth.uid()
  );

-- ── shoot_entries & editing_entries ──────────────────────────
DROP POLICY IF EXISTS "tenant_shoot_entries" ON shoot_entries;
CREATE POLICY "tenant_shoot_entries" ON shoot_entries
  FOR ALL USING (
    (
      company_id = (auth.jwt() ->> 'company_id')::uuid
      AND (
        (auth.jwt() ->> 'role') = 'ADMIN'
        OR user_id = auth.uid()
      )
    )
    OR user_id = auth.uid()
  );

DROP POLICY IF EXISTS "tenant_editing_entries" ON editing_entries;
CREATE POLICY "tenant_editing_entries" ON editing_entries
  FOR ALL USING (
    (
      company_id = (auth.jwt() ->> 'company_id')::uuid
      AND (
        (auth.jwt() ->> 'role') = 'ADMIN'
        OR user_id = auth.uid()
      )
    )
    OR user_id = auth.uid()
  );
