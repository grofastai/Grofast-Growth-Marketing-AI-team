-- Attendance logs: one row per member per day
CREATE TABLE IF NOT EXISTS attendance_logs (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid        NOT NULL,
  user_id     uuid        NOT NULL,
  date        date        NOT NULL DEFAULT CURRENT_DATE,
  clock_in    timestamptz,
  clock_out   timestamptz,
  created_at  timestamptz DEFAULT now(),
  UNIQUE (company_id, user_id, date)
);

ALTER TABLE attendance_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_isolation" ON attendance_logs;
CREATE POLICY "tenant_isolation" ON attendance_logs
  FOR ALL USING (company_id = (auth.jwt() ->> 'company_id')::uuid);

-- Multi-service: add array column to projects
ALTER TABLE projects ADD COLUMN IF NOT EXISTS service_types text[] DEFAULT '{}';

-- Migrate any existing single service_type values into the new array
UPDATE projects
SET service_types = ARRAY[service_type]
WHERE service_type IS NOT NULL
  AND (service_types IS NULL OR array_length(service_types, 1) IS NULL OR array_length(service_types, 1) = 0);
