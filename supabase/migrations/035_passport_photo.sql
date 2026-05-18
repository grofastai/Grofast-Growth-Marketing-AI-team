-- Add passport photo field to users
ALTER TABLE users ADD COLUMN IF NOT EXISTS passport_photo_url text;

-- Create passport-photos storage bucket (public read, admin write)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'passport-photos',
  'passport-photos',
  true,
  2097152,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS: anyone can read (public bucket)
CREATE POLICY IF NOT EXISTS "passport_photos_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'passport-photos');

-- Storage RLS: only admins can upload/update
CREATE POLICY IF NOT EXISTS "passport_photos_admin_insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'passport-photos'
    AND (auth.jwt() ->> 'role') = 'ADMIN'
  );

CREATE POLICY IF NOT EXISTS "passport_photos_admin_update" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'passport-photos'
    AND (auth.jwt() ->> 'role') = 'ADMIN'
  );
