-- Reintroduces a distinct "Edited" stage between production (Ready to Edit / Design)
-- and the review gate — previously merged into on_review by migration 105. The editor
-- hand-off and the admin's review/approval are now two separate, visible moments again.
-- No backfill: existing rows keep their current status; only new forward moves pass
-- through 'edited'. on_review itself is unchanged (display-renamed to "Completed Edit"
-- in the client only, not here).

alter table content_items drop constraint if exists content_items_status_check;
alter table content_items add constraint content_items_status_check
  check (status in ('scripting','voiceover','design','ready_to_edit','edited','on_review','branding_ready','ads_ready','posted','cancelled'));
