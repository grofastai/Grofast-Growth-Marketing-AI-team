-- Shot By becomes multi-person — a shoot's crew is already multiple people (going_by on
-- shoots), but only one of them ever got credited on the resulting video. Converts the
-- existing single value into a one-element array so no data is lost; new rows can now
-- hold the shoot's full crew instead of just whoever completed it.
alter table content_items
  alter column shot_by type uuid[]
  using case when shot_by is null then '{}'::uuid[] else array[shot_by] end;
alter table content_items alter column shot_by set default '{}';
