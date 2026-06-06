-- ── Freelancer Management Module ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS freelancers (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            uuid        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name                  text        NOT NULL,
  type                  text        NOT NULL CHECK (type IN ('voice_over','video_editor','video_shooter','other')),
  phone                 text,
  availability_notes    text,
  rating                numeric(2,1) NOT NULL DEFAULT 0 CHECK (rating >= 0 AND rating <= 5),
  status                text        NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),

  -- Voice Over Artist fields
  language              text,
  voice_type            text,
  cost_per_minute       numeric(10,2),

  -- Video Editor fields
  editing_software      text[]      NOT NULL DEFAULT '{}',
  video_types_offered   text[]      NOT NULL DEFAULT '{}',
  cost_per_video        numeric(10,2),

  -- Video Shooter fields
  availability_schedule text,
  cost_per_hour         numeric(10,2),

  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS freelancer_work_entries (
  id                       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id               uuid        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  freelancer_id            uuid        NOT NULL REFERENCES freelancers(id) ON DELETE CASCADE,
  entry_type               text        NOT NULL CHECK (entry_type IN ('voice_over','video_edit','video_shoot')),

  -- Common
  client_name              text,
  title                    text,
  date                     date        NOT NULL DEFAULT CURRENT_DATE,
  status                   text        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','in_progress','completed','cancelled')),
  payment_status           text        NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid','paid')),
  paid_at                  timestamptz,
  amount                   numeric(10,2),
  notes                    text,

  -- Voice Over
  audio_duration_minutes   numeric(10,2),
  cost_per_minute_snapshot numeric(10,2),

  -- Video Edit
  date_given               date,
  date_finished            date,
  video_type               text,
  video_duration           text,
  time_taken_hours         numeric(10,2),
  drive_updated            boolean     NOT NULL DEFAULT false,
  revision_count           integer     NOT NULL DEFAULT 0,
  cost_per_video_snapshot  numeric(10,2),

  -- Video Shoot
  start_time               time,
  end_time                 time,
  travel_hours             numeric(10,2) NOT NULL DEFAULT 0,
  working_hours            numeric(10,2),
  cost_per_hour_snapshot   numeric(10,2),

  created_at               timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE freelancers ENABLE ROW LEVEL SECURITY;
ALTER TABLE freelancer_work_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON freelancers
  FOR ALL USING (company_id = (auth.jwt() ->> 'company_id')::uuid);

CREATE POLICY "tenant_isolation" ON freelancer_work_entries
  FOR ALL USING (company_id = (auth.jwt() ->> 'company_id')::uuid);

-- Indexes
CREATE INDEX IF NOT EXISTS freelancers_company_idx ON freelancers(company_id);
CREATE INDEX IF NOT EXISTS fwe_company_idx          ON freelancer_work_entries(company_id);
CREATE INDEX IF NOT EXISTS fwe_freelancer_idx       ON freelancer_work_entries(freelancer_id);
