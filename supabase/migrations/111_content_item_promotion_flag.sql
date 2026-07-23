-- A one-way "this was used for promotion" tag, ticked independently of platform choice
-- at Mark as Posted/Mark as Ads — separate from the derived posted_branding/posted_ads
-- dual-post breakdown, since a video can be flagged as promotion regardless of whether
-- it actually ends up posted both places.
alter table content_items add column if not exists is_promotion boolean not null default false;
