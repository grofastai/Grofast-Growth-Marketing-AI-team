-- Expand postable platforms with Meta Ads, Google Ads, and Other.
alter table content_item_posts drop constraint if exists content_item_posts_platform_check;
alter table content_item_posts add constraint content_item_posts_platform_check
  check (platform in ('instagram','youtube','facebook','linkedin','gmb','ads','meta_ads','google_ads','other'));
