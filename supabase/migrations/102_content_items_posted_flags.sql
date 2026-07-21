-- Independent Branding/Ads posted flags, derived server-side from content_item_posts
-- (see addContentPost/deleteContentPost). Distinct from status='posted', which just
-- marks the pipeline stage.
alter table content_items add column if not exists posted_branding boolean not null default false;
alter table content_items add column if not exists posted_ads boolean not null default false;

update content_items ci set posted_ads = true
  where exists (select 1 from content_item_posts p where p.content_item_id = ci.id and p.platform in ('ads'));
update content_items ci set posted_branding = true
  where exists (select 1 from content_item_posts p where p.content_item_id = ci.id
    and p.platform in ('instagram','youtube','facebook','linkedin','gmb'));
