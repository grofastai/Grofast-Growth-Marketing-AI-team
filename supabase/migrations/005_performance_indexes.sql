-- Performance indexes for common query patterns
-- Run once in Supabase SQL editor or via migration

CREATE INDEX IF NOT EXISTS idx_tasks_status      ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to ON tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_tasks_company     ON tasks(company_id);

CREATE INDEX IF NOT EXISTS idx_leaves_status     ON leaves(status);
CREATE INDEX IF NOT EXISTS idx_leaves_user       ON leaves(user_id);
CREATE INDEX IF NOT EXISTS idx_leaves_company    ON leaves(company_id);

CREATE INDEX IF NOT EXISTS idx_daily_updates_date    ON daily_updates(date);
CREATE INDEX IF NOT EXISTS idx_daily_updates_user    ON daily_updates(user_id);
CREATE INDEX IF NOT EXISTS idx_daily_updates_company ON daily_updates(company_id);

CREATE INDEX IF NOT EXISTS idx_attendance_logs_date    ON attendance_logs(date);
CREATE INDEX IF NOT EXISTS idx_attendance_logs_user    ON attendance_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_attendance_logs_company ON attendance_logs(company_id);

CREATE INDEX IF NOT EXISTS idx_users_employee_id ON users(employee_id);
CREATE INDEX IF NOT EXISTS idx_users_company     ON users(company_id);

CREATE INDEX IF NOT EXISTS idx_announcements_company ON announcements(company_id);
CREATE INDEX IF NOT EXISTS idx_projects_company      ON projects(company_id);
CREATE INDEX IF NOT EXISTS idx_projects_status       ON projects(status);
