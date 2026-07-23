-- Ready to Edit -> On Review, and Shoot Scheduled -> Completed, now both require a Google
-- Drive link recording where the footage/edit actually lives.
alter table content_items add column if not exists edited_drive_link text;
alter table shoots add column if not exists drive_link text;
