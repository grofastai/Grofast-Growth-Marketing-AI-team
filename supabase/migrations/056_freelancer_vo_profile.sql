-- Add Voice Over rate card + video tracking fields to the freelancer profile (users table).
-- These store the freelancer's current rate and video assignment state.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS vo_number        integer,
  ADD COLUMN IF NOT EXISTS vo_price_per_min numeric(8,2),
  ADD COLUMN IF NOT EXISTS vo_free_time     numeric(6,2)  DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vo_total_price   numeric(10,2),
  ADD COLUMN IF NOT EXISTS vo_pending       numeric(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vo_top_rank      boolean       DEFAULT false,
  ADD COLUMN IF NOT EXISTS vo_video1_name   text,
  ADD COLUMN IF NOT EXISTS vo_video1_pay    text CHECK (vo_video1_pay IN ('paid', 'unpaid')),
  ADD COLUMN IF NOT EXISTS vo_video2_name   text,
  ADD COLUMN IF NOT EXISTS vo_video2_pay    text CHECK (vo_video2_pay IN ('paid', 'unpaid')),
  ADD COLUMN IF NOT EXISTS vo_video3_name   text,
  ADD COLUMN IF NOT EXISTS vo_video3_pay    text CHECK (vo_video3_pay IN ('paid', 'unpaid')),
  ADD COLUMN IF NOT EXISTS vo_video4_name   text,
  ADD COLUMN IF NOT EXISTS vo_video4_pay    text CHECK (vo_video4_pay IN ('paid', 'unpaid'));
