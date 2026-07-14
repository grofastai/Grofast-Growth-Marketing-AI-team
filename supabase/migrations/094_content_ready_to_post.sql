-- Phase 4: "Ready to Post" — a stage between Edited and Posted where the post is
-- scheduled but hasn't gone out yet. Moving an item here captures WHICH platforms it's
-- going to and WHEN, so the team has a queue of what's due and when.
--
-- No WhatsApp reminder is wired to this (deliberate — Vercel Hobby crons drift by up to
-- ~59 minutes, so a "10 minutes before" reminder isn't achievable on the current plan).
alter table content_items drop constraint if exists content_items_status_check;
alter table content_items add constraint content_items_status_check
  check (status in ('shot', 'editing', 'edited', 'ready', 'posted'));

-- The planned platforms/slot. These are the INTENT; content_item_posts remains the
-- record of what actually went out, written when the item is marked Posted.
alter table content_items add column if not exists ready_platforms text[] not null default '{}';
alter table content_items add column if not exists scheduled_post_date date;
alter table content_items add column if not exists scheduled_post_time time;

-- Drives the "what's due next" queue ordering.
create index if not exists content_items_scheduled_post_idx
  on content_items(company_id, scheduled_post_date, scheduled_post_time);
