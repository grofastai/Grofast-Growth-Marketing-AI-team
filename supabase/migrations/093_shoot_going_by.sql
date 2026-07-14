-- Phase 2 (accountability): record WHO is going on a shoot when it's marked Going, so
-- the rest of the team can see who's covering it. A shoot usually has more than one
-- person (camera, assistant), hence an array rather than a single uuid.
--
-- content_items.edited_by already exists and is reused to record who is starting an
-- edit, so no column is needed there.
alter table shoots add column if not exists going_by uuid[] not null default '{}';
