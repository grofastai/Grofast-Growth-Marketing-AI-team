-- Stop sending every new document to the retired n8n server.
--
-- 038 attached a trigger that POSTed the full documents row — file link included — to
-- https://n8n.srv1163761.hstgr.cloud/webhook/document-backup on every insert. n8n is no
-- longer part of the stack, so that was an ongoing leak of document links to a server we
-- have moved away from (or, if it is down, a silently failing call on every upload).
--
-- Nothing is lost by removing it: backup is handled in-app. app/api/documents/upload is the
-- only live insert path into documents; it syncs the file to Google Drive via after(), and
-- /api/cron/drive-retry re-attempts anything left in drive_sync_queue.
--
-- pg_net stays installed — dropping an extension is a wider change than this needs, and it
-- is harmless unused.
drop trigger if exists document_backup_trigger on public.documents;
drop function if exists public.notify_document_backup();
