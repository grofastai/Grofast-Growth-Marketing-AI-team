-- Enable pg_net for HTTP calls from the database
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Trigger function: calls n8n webhook on every document insert
CREATE OR REPLACE FUNCTION notify_document_backup()
RETURNS trigger AS $$
BEGIN
  PERFORM net.http_post(
    url     := 'https://n8n.srv1163761.hstgr.cloud/webhook/document-backup',
    body    := json_build_object(
                 'type',       'INSERT',
                 'table',      'documents',
                 'schema',     'public',
                 'record',     row_to_json(NEW),
                 'old_record', null
               )::text,
    headers := '{"Content-Type": "application/json"}'::jsonb
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Attach trigger to documents table
CREATE TRIGGER document_backup_trigger
  AFTER INSERT ON documents
  FOR EACH ROW EXECUTE FUNCTION notify_document_backup();
