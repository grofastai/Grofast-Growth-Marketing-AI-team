-- voiceover_by used to be restricted to the freelancers table (the dedicated "Freelance RJ
-- Voiceover" team), but full-time/part-time members also do voice-over work. Since a single
-- FK can't reference two different tables, drop it and resolve the id against both users and
-- freelancers in application code (see lib/data/media-tracker.ts).
alter table content_items drop constraint content_items_voiceover_by_fkey;
