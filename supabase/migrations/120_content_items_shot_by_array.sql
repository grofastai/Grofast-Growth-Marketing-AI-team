-- Shot By becomes multi-person — a shoot's crew is already multiple people (going_by on
-- shoots), but only one of them ever got credited on the resulting video. Converts the
-- existing single value into a one-element array so no data is lost; new rows can now
-- hold the shoot's full crew instead of just whoever completed it.
--
-- The original scalar column carried a `references users(id) on delete set null` foreign
-- key, which Postgres cannot re-target at an array type (array columns can't be FK
-- constrained against a scalar column). It's dropped here rather than replaced — user IDs
-- placed into shot_by already come from an app-level picker sourced from real users, so the
-- DB-level constraint wasn't load-bearing, and a trigger to emulate it would be pure
-- overhead for what this table needs.
alter table content_items drop constraint if exists content_items_shot_by_fkey;
alter table content_items
  alter column shot_by type uuid[]
  using case when shot_by is null then '{}'::uuid[] else array[shot_by] end;
alter table content_items alter column shot_by set default '{}';
