-- Media Tracker needs to know who's eligible to be picked as Scripted By / Voice Over /
-- Edited By / Shot By — deliberately a separate column from users.enabled_blocks (the
-- Non-Media-only Daily Update Blocks checklist) so this doesn't touch that system at all.
-- Values: 'scripting' | 'voiceover' | 'editing' | 'shooting'.
alter table users add column if not exists media_tracker_roles text[] not null default '{}';
