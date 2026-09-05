-- The script stage now has to leave a real Drive/Docs link behind, the same way the edit
-- stage already does. Kept as its own column rather than reusing edited_drive_link: the
-- editor overwrites that one at the Edited -> Completed Edit move, which would silently
-- destroy the script doc link the moment editing finished.
alter table content_items add column if not exists script_drive_link text;

comment on column public.content_items.script_drive_link is
  'Google Drive/Docs link to the written script. Required when a Scripting item is completed — moved to Voice Over, or spun off into a shoot.';
