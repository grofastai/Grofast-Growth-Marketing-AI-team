-- "Other" as a posted platform had no way to say which platform it actually was —
-- add a free-text label alongside it, only meaningful when platform = 'other'.
alter table content_item_posts add column if not exists other_platform_label text;
