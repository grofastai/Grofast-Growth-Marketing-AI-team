-- Create public media-uploads bucket for team file uploads
INSERT INTO storage.buckets (id, name, public)
VALUES ('media-uploads', 'media-uploads', true)
ON CONFLICT (id) DO NOTHING;

-- Authenticated users can upload
CREATE POLICY "authenticated_upload"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'media-uploads');

-- Anyone can view (public bucket)
CREATE POLICY "public_read"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'media-uploads');

-- Authenticated users can delete their own uploads
CREATE POLICY "authenticated_delete"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'media-uploads');
