-- Ads-vs-Branding differentiation for shoots, and a link back to the Ads Video
-- content_items row a shoot may have been spun off from via "Move to Shoot".
alter table shoots add column if not exists shoot_type text
  check (shoot_type in ('ads_shoot', 'branding_shoot'));

alter table shoots add column if not exists source_content_item_id uuid
  references content_items(id) on delete set null;

create index if not exists shoots_source_content_item_idx
  on shoots(source_content_item_id);
