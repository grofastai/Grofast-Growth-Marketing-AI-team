-- Multi-select tags on a shoot (branding / advertisement / promotion) — a shoot can be
-- more than one of these at once, unlike the older single-value shoot_type column, which
-- stays untouched and unexposed in the UI.
alter table shoots add column tags text[] not null default '{}';
alter table shoots add constraint shoots_tags_check
  check (tags <@ array['branding','advertisement','promotion']::text[]);
