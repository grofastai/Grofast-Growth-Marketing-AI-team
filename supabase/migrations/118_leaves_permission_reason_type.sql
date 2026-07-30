-- Structured reason for Permission leave — Late Login / Early Logoff / Other, replacing a
-- pure freeform text box. "Other" still uses the freeform reason text like before.
alter table leaves add column if not exists permission_reason_type text
  check (permission_reason_type in ('late_login', 'early_logoff', 'other'));

-- Backfill existing permission-type rows from their reason text (case-insensitive, after
-- stripping the [BACKFILL]/[EXCEPTIONAL] prefixes some rows already carry).
update leaves
set permission_reason_type = case
  when lower(regexp_replace(reason, '^\[(BACKFILL|EXCEPTIONAL)\]\s*', '', 'i')) = 'late login' then 'late_login'
  when lower(regexp_replace(reason, '^\[(BACKFILL|EXCEPTIONAL)\]\s*', '', 'i')) = 'early logoff' then 'early_logoff'
  else 'other'
end
where leave_type = 'permission' and permission_reason_type is null;
