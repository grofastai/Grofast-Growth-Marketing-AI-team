-- Editing is removed as a tracked pipeline stage — an item now goes straight from its
-- entry point (Ready to Edit for video, Design for posters) to Edited, with the editor
-- recorded at that point instead of at a separate "starting the edit" step.
--
-- Anything currently sitting in Editing is treated as done and moved forward to Edited
-- (backfilling edited_date where missing; edited_by was already captured when the item
-- entered Editing, so that's left as-is).
update content_items
  set status = 'edited', edited_date = coalesce(edited_date, current_date)
  where status = 'editing';

alter table content_items drop constraint if exists content_items_status_check;
alter table content_items add constraint content_items_status_check
  check (status in (
    'scripting', 'voiceover', 'design', 'ready_to_edit',
    'edited', 'on_review', 'ready_to_post', 'posted', 'cancelled'
  ));
