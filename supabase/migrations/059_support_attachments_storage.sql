-- Allow authenticated users to upload/read support attachments
CREATE POLICY "support_attachments_upload"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'support-attachments');

CREATE POLICY "support_attachments_read"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'support-attachments');

CREATE POLICY "support_attachments_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'support-attachments' AND auth.uid()::text = (storage.foldername(name))[1]);
