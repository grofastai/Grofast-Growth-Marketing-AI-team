-- Targets used to be shared across Video and Poster for the same client/kind/month —
-- splitting them so admins can set a distinct Video target and Poster target, settable
-- from the Active Clients list (not only from inside Media Tracker).
alter table content_client_targets add column if not exists content_type text;

-- All 7 existing rows were set while the log tab defaulted to Video — backfill them so
-- existing targets keep applying to Video instead of silently disappearing.
update content_client_targets set content_type = 'video' where content_type is null;

alter table content_client_targets alter column content_type set not null;
alter table content_client_targets add constraint content_client_targets_content_type_check
  check (content_type in ('video', 'poster'));

alter table content_client_targets drop constraint content_client_targets_company_id_client_name_kind_month_key;
alter table content_client_targets add constraint content_client_targets_unique_key
  unique (company_id, client_name, kind, month, content_type);
