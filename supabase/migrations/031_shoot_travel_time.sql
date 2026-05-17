-- Travel time for shoots (internal only, not billed to clients)
ALTER TABLE shoots
  ADD COLUMN IF NOT EXISTS travel_time_hours numeric(4,2) NOT NULL DEFAULT 0;
