-- ── Activities master ──────────────────────────────────────────────────────────
-- One row per activity type per company (e.g. "Video Edit", "Meta Ads").
-- unit_type controls what the member fills in: hours only, count only, or both.

CREATE TABLE IF NOT EXISTS activities (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name          text        NOT NULL,
  team_category text        NOT NULL CHECK (team_category IN ('MEDIA','META','CREATIVE','AI','OPS')),
  unit_type     text        NOT NULL CHECK (unit_type IN ('hours','count','both')),
  emoji         text        NOT NULL DEFAULT '💼',
  sort_order    int         NOT NULL DEFAULT 0,
  is_active     boolean     NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id, name)
);

ALTER TABLE activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON activities
  FOR ALL USING (company_id = (auth.jwt() ->> 'company_id')::uuid);

CREATE POLICY "admin_write" ON activities
  FOR INSERT WITH CHECK ((auth.jwt() ->> 'role') = 'ADMIN');

CREATE POLICY "admin_update" ON activities
  FOR UPDATE USING ((auth.jwt() ->> 'role') = 'ADMIN');

CREATE POLICY "admin_delete" ON activities
  FOR DELETE USING ((auth.jwt() ->> 'role') = 'ADMIN');

-- ── Work logs ─────────────────────────────────────────────────────────────────
-- One row per activity per member per day.
-- Replaces the unstructured work_entries JSONB in daily_updates.

CREATE TABLE IF NOT EXISTS work_logs (
  id            uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid         NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id       uuid         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date          date         NOT NULL,
  activity_id   uuid         NOT NULL REFERENCES activities(id),
  client_name   text,
  hours         numeric(5,2) NOT NULL DEFAULT 0,
  unit_count    int          NOT NULL DEFAULT 0,
  notes         text,
  cost          numeric(10,2) NOT NULL DEFAULT 0,
  created_at    timestamptz  NOT NULL DEFAULT now()
);

ALTER TABLE work_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON work_logs
  FOR ALL USING (company_id = (auth.jwt() ->> 'company_id')::uuid);

CREATE POLICY "member_insert" ON work_logs
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "member_update" ON work_logs
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "admin_all" ON work_logs
  FOR ALL USING ((auth.jwt() ->> 'role') = 'ADMIN');

CREATE INDEX IF NOT EXISTS work_logs_company_date_idx  ON work_logs(company_id, date);
CREATE INDEX IF NOT EXISTS work_logs_company_user_idx  ON work_logs(company_id, user_id);
CREATE INDEX IF NOT EXISTS work_logs_activity_idx      ON work_logs(activity_id);

-- ── Content posts ─────────────────────────────────────────────────────────────
-- One row per post published (Reel, Poster, Story, etc.)

CREATE TABLE IF NOT EXISTS content_posts (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id       uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date          date        NOT NULL,
  client_name   text,
  platform      text        NOT NULL CHECK (platform IN ('Instagram','YouTube','Facebook','LinkedIn','Twitter','Other')),
  post_type     text        NOT NULL CHECK (post_type IN ('Reel','Poster','Story','Video','Carousel','Thread','Short','Other')),
  post_link     text,
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE content_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON content_posts
  FOR ALL USING (company_id = (auth.jwt() ->> 'company_id')::uuid);

CREATE POLICY "member_insert" ON content_posts
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "member_update" ON content_posts
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "admin_all" ON content_posts
  FOR ALL USING ((auth.jwt() ->> 'role') = 'ADMIN');

CREATE INDEX IF NOT EXISTS content_posts_company_date_idx ON content_posts(company_id, date);
CREATE INDEX IF NOT EXISTS content_posts_user_date_idx    ON content_posts(user_id, date);
