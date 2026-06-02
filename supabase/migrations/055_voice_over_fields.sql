-- Expand voice_over fields in freelancer_updates to support
-- per-video tracking, pricing, free time, and top-rank flag.

ALTER TABLE freelancer_updates
  ADD COLUMN IF NOT EXISTS vo_number        integer,
  ADD COLUMN IF NOT EXISTS vo_price_per_min numeric(8,2),
  ADD COLUMN IF NOT EXISTS vo_free_time     numeric(6,2),
  ADD COLUMN IF NOT EXISTS vo_total_price   numeric(10,2),
  ADD COLUMN IF NOT EXISTS vo_pending       numeric(10,2),
  ADD COLUMN IF NOT EXISTS vo_top_rank      boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS vo_video1_name   text,
  ADD COLUMN IF NOT EXISTS vo_video1_pay    text CHECK (vo_video1_pay IN ('paid', 'unpaid')),
  ADD COLUMN IF NOT EXISTS vo_video2_name   text,
  ADD COLUMN IF NOT EXISTS vo_video2_pay    text CHECK (vo_video2_pay IN ('paid', 'unpaid')),
  ADD COLUMN IF NOT EXISTS vo_video3_name   text,
  ADD COLUMN IF NOT EXISTS vo_video3_pay    text CHECK (vo_video3_pay IN ('paid', 'unpaid')),
  ADD COLUMN IF NOT EXISTS vo_video4_name   text,
  ADD COLUMN IF NOT EXISTS vo_video4_pay    text CHECK (vo_video4_pay IN ('paid', 'unpaid'));
