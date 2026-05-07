-- 022: work proof uploads on daily updates + internal support tickets

-- Work proof URLs (screenshots / docs uploaded with daily update)
ALTER TABLE daily_updates
  ADD COLUMN IF NOT EXISTS work_proof_urls TEXT[] DEFAULT '{}';

-- ── Support tickets ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS support_tickets (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id  UUID NOT NULL,
  user_id     UUID NOT NULL,
  title       TEXT NOT NULL,
  category    TEXT NOT NULL DEFAULT 'general',
  description TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'open',
  priority    TEXT NOT NULL DEFAULT 'normal',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'support_tickets' AND policyname = 'tenant_isolation'
  ) THEN
    CREATE POLICY "tenant_isolation" ON support_tickets
      FOR ALL USING (company_id = (auth.jwt() ->> 'company_id')::uuid);
  END IF;
END $$;

-- ── Support responses ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS support_responses (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  ticket_id      UUID NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  responder_id   UUID NOT NULL,
  responder_name TEXT NOT NULL DEFAULT '',
  message        TEXT NOT NULL,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE support_responses ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'support_responses' AND policyname = 'tenant_isolation'
  ) THEN
    CREATE POLICY "tenant_isolation" ON support_responses
      FOR ALL USING (
        ticket_id IN (
          SELECT id FROM support_tickets
          WHERE company_id = (auth.jwt() ->> 'company_id')::uuid
        )
      );
  END IF;
END $$;
