alter table content_item_posts drop constraint content_item_posts_platform_check;
alter table content_item_posts add constraint content_item_posts_platform_check
  check (platform in ('instagram','youtube','facebook','linkedin','gmb','twitter','ads','meta_ads','google_ads','other'));
