-- Seed 20 default activities for every existing company.
-- Uses ON CONFLICT DO NOTHING so it's safe to re-run.

INSERT INTO activities (company_id, name, team_category, unit_type, emoji, sort_order)
SELECT
  c.id,
  a.name,
  a.team_category,
  a.unit_type,
  a.emoji,
  a.sort_order
FROM companies c
CROSS JOIN (VALUES
  ('Video Edit',        'MEDIA',    'both',  '🎬', 1),
  ('Video Shoot',       'MEDIA',    'hours', '📸', 2),
  ('Script Writing',    'MEDIA',    'hours', '✍️',  3),
  ('Poster Design',     'CREATIVE', 'both',  '🖼️', 4),
  ('Graphic Design',    'CREATIVE', 'both',  '🎨', 5),
  ('Thumbnail Design',  'CREATIVE', 'count', '🖼️', 6),
  ('Motion Graphics',   'CREATIVE', 'hours', '🎭', 7),
  ('Meta Ads',          'META',     'hours', '📊', 8),
  ('Google Ads',        'META',     'hours', '📢', 9),
  ('Reporting',         'META',     'hours', '📋', 10),
  ('Lead Follow-up',    'META',     'hours', '🎯', 11),
  ('AI Automation',     'AI',       'hours', '🤖', 12),
  ('Website Dev',       'AI',       'hours', '💻', 13),
  ('Chatbot Setup',     'AI',       'hours', '🔧', 14),
  ('Reel Posting',      'OPS',      'count', '📱', 15),
  ('Story Posting',     'OPS',      'count', '📖', 16),
  ('YouTube Upload',    'OPS',      'count', '▶️', 17),
  ('Client Call',       'OPS',      'hours', '📞', 18),
  ('Strategy Meeting',  'OPS',      'hours', '🗓️', 19),
  ('Content Planning',  'OPS',      'hours', '📝', 20)
) AS a(name, team_category, unit_type, emoji, sort_order)
ON CONFLICT (company_id, name) DO NOTHING;
