-- Shoots table for media team shoot logging
CREATE TABLE IF NOT EXISTS shoots (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  title          text NOT NULL,
  client         text NOT NULL,
  location       text NOT NULL,
  start_time     timestamptz NOT NULL,
  end_time       timestamptz NOT NULL,
  team_assigned  text,
  equipment_used text,
  travel_expense numeric(10,2) NOT NULL DEFAULT 0,
  status         text NOT NULL DEFAULT 'scheduled'
                   CHECK (status IN ('scheduled', 'completed', 'cancelled')),
  created_by     uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE shoots ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'shoots' AND policyname = 'shoots_tenant_isolation'
  ) THEN
    CREATE POLICY "shoots_tenant_isolation" ON shoots
      FOR ALL USING (company_id = (auth.jwt() ->> 'company_id')::uuid);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS shoots_company_id_idx   ON shoots (company_id);
CREATE INDEX IF NOT EXISTS shoots_start_time_idx   ON shoots (company_id, start_time DESC);
CREATE INDEX IF NOT EXISTS shoots_created_by_idx   ON shoots (created_by);
