-- On Review now branches straight into Branding Ready / Ads Ready (decided at review
-- time, not inferred later from platform choice) — replaces the single Ready to Post
-- stage. "Edited" is dropped as its own stage; the "who edited" question moves to the
-- Ready to Edit -> On Review step instead.

-- Cancelled-by-whom, for counting rejections by cause.
alter table content_items add column if not exists cancelled_by text
  check (cancelled_by in ('client', 'us'));

-- Only relevant for an Ads Completed post — when the ad actually started running,
-- separate from posted_date (when it was logged).
alter table content_item_posts add column if not exists ad_run_date date;

-- Safety backfill (no real rows expected in these statuses today, but harmless insurance):
update content_items set status = 'on_review' where status = 'edited';
update content_items set status = case
  when 'ads' = any(ready_platforms) or 'meta_ads' = any(ready_platforms) or 'google_ads' = any(ready_platforms)
    then 'ads_ready' else 'branding_ready' end
  where status = 'ready_to_post';

alter table content_items drop constraint if exists content_items_status_check;
alter table content_items add constraint content_items_status_check
  check (status in ('scripting','voiceover','design','ready_to_edit','on_review','branding_ready','ads_ready','posted','cancelled'));
