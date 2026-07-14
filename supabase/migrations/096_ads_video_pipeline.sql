-- Ads Video pipeline: non-shoot video gets a front half (Scripting -> Voice Over) that
-- converges with shoot video at Ready to Edit, plus a new On Review gate before Ready to
-- Post. Two existing statuses are renamed (not just relabelled — the check constraint
-- enumerates them, so old rows must be remapped before the new constraint can land).
--
-- Ordering matters: drop the old constraint, remap rows, THEN add the new constraint —
-- doing it the other way rejects the UPDATE against the old constraint.
alter table content_items drop constraint if exists content_items_status_check;

update content_items set status = 'ready_to_edit' where status = 'shot';
update content_items set status = 'ready_to_post' where status = 'ready';

alter table content_items add constraint content_items_status_check
  check (status in (
    'scripting', 'voiceover', 'design', 'ready_to_edit',
    'editing', 'edited', 'on_review', 'ready_to_post', 'posted'
  ));

alter table content_items alter column status set default 'ready_to_edit';

-- Origin: which of the three entry paths produced this item. Distinct from content_type
-- (video/poster) because video can come from either a shoot or an ads-video script.
alter table content_items add column if not exists source text not null default 'shoot'
  check (source in ('shoot', 'ads_video', 'poster'));
update content_items set source = 'poster' where content_type = 'poster';

-- Ads-video scripting fields.
alter table content_items add column if not exists hook_count integer;
alter table content_items add column if not exists use_for text[];
alter table content_items add column if not exists priority text
  check (priority in ('low', 'medium', 'high', 'urgent'));
alter table content_items add column if not exists scripted_by uuid references users(id) on delete set null;

-- Voice-over assignment. References freelancers, not users — the RJ Voiceover roster
-- lives in the freelancers table, not the team's own user accounts.
alter table content_items add column if not exists voiceover_by uuid references freelancers(id) on delete set null;
alter table content_items add column if not exists voiceover_date date;

-- The On Review approval — who signed off and when, distinct from edited_by/edited_date
-- (the editor) and from shot_by (the shoot crew).
alter table content_items add column if not exists reviewed_by uuid references users(id) on delete set null;
alter table content_items add column if not exists reviewed_at timestamptz;
