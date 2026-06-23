-- ── Freelancer new team system ────────────────────────────────────────────────
-- Adds team column to freelancers (for no-login freelancers)
-- Creates new freelancer_work_entries_v2 table for manager-entered work

-- 1. Add team column to freelancers table
ALTER TABLE freelancers ADD COLUMN IF NOT EXISTS team text;

-- 2. New work entries table (clean, no legacy columns)
CREATE TABLE IF NOT EXISTS freelancer_work_entries_v2 (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       uuid        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  freelancer_id    uuid        NOT NULL REFERENCES freelancers(id) ON DELETE CASCADE,

  -- Which team type this entry belongs to
  team             text        NOT NULL,

  -- Master date (when work was finished)
  date_finished    date        NOT NULL DEFAULT CURRENT_DATE,

  -- Per-entry common fields
  date_given       date,
  client_name      text        NOT NULL,
  title            text        NOT NULL,
  amount           numeric(10,2),
  drive_link       text,
  notes            text,

  -- RJ Voiceover specific
  duration_mins    numeric(10,2),
  language         text,

  -- Dev / Marketing / IT specific
  task_description text,

  -- Payment
  payment_status   text        NOT NULL DEFAULT 'unpaid'
                               CHECK (payment_status IN ('unpaid','paid')),
  paid_at          timestamptz,

  created_at       timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE freelancer_work_entries_v2 ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON freelancer_work_entries_v2
  FOR ALL USING (company_id = (auth.jwt() ->> 'company_id')::uuid);

-- Indexes
CREATE INDEX IF NOT EXISTS fwe_v2_company_idx     ON freelancer_work_entries_v2(company_id);
CREATE INDEX IF NOT EXISTS fwe_v2_freelancer_idx  ON freelancer_work_entries_v2(freelancer_id);
CREATE INDEX IF NOT EXISTS fwe_v2_date_idx        ON freelancer_work_entries_v2(date_finished);
CREATE INDEX IF NOT EXISTS fwe_v2_client_idx      ON freelancer_work_entries_v2(company_id, client_name);
