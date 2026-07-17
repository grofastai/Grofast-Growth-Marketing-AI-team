-- The "Going" status is removed from the Shoots pipeline — a shoot now moves directly
-- from Scheduled to Completed (or Cancelled). Any shoot still sitting in "going" reverts
-- to "scheduled" so it isn't stranded outside the new constraint.
update shoots set status = 'scheduled' where status = 'going';

alter table shoots drop constraint if exists shoots_status_check;
alter table shoots add constraint shoots_status_check
  check (status in ('scheduled', 'completed', 'cancelled'));
