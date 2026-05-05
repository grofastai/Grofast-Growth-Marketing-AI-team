-- Add created_by to tasks so members can see who assigned a task
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES users(id) ON DELETE SET NULL;
