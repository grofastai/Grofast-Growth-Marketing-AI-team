-- An Ads Video can be posted straight to Ads with no organic platform attached (its
-- use_for already allows tagging it "ads" from the scripting stage) — Ready to Post and
-- the post log need the same option, so content_item_posts.platform must accept it too.
alter table content_item_posts drop constraint if exists content_item_posts_platform_check;
alter table content_item_posts add constraint content_item_posts_platform_check
  check (platform in ('instagram', 'youtube', 'facebook', 'linkedin', 'gmb', 'ads'));
