-- A shoot-sourced video sitting in Ready to Edit can turn out to be unusable (bad take,
-- client pulls the ask). Rather than deleting it outright, it can now be moved to a
-- Cancelled column and kept for the record.
alter table content_items drop constraint if exists content_items_status_check;
alter table content_items add constraint content_items_status_check
  check (status in (
    'scripting', 'voiceover', 'design', 'ready_to_edit',
    'editing', 'edited', 'on_review', 'ready_to_post', 'posted', 'cancelled'
  ));
