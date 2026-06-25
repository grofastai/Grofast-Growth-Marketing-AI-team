# Notes Knowledge Hub — Design Spec

**Date:** 2026-06-25
**Scope:** Replace the existing Google Keep-style personal Notes module with a Notion/Linear-style company **Knowledge Hub** — three-pane layout, folders, scopes (Private / Team / SOP), rich-text editing, sharing, @mentions, voice notes, calendar view, and export. Built in 3 ordered, independently-shippable phases.

---

## 1. Context & Decisions

### What exists today
- `app/member/notes/` — a member-only Keep-style masonry board (~1,100 LOC) backed by a single `notes` table.
- Features: text/checklist notes, 7 colors, pin, reminders (with WhatsApp recipients + cron at `api/cron/note-reminders`), free-text labels, archive, convert-to-task.
- Server actions in `lib/actions/notes.ts`. Reminder recipients in migration `074`.

### Confirmed product decisions
1. **Replace** the Keep-style module; **migrate** all existing personal notes into the new hub (into each member's "Personal" folder, `scope='private'`). Nothing is lost.
2. **Shared hub** rendered in BOTH `(admin)` and `(member)` portals. Personal notes stay private; Team Notes & SOP Library are company-wide; SOP Library is **editable by admins only**.
3. **All features are in scope**, delivered across 3 phases.
4. **Editor:** TipTap (ProseMirror) — a headless editor engine, not a UI kit; does not violate the "no component libraries" rule.
5. **Delivery:** write this spec + an implementation plan, then build & push **Phase 1** first.

### Existing infrastructure this design reuses
- **Notifications:** `insertNotification()` / `insertManyNotifications()` in `lib/actions/notifications.ts` (table `notifications` with `company_id, user_id, type, title, body, link`). → powers @mentions and share notifications.
- **File storage:** Supabase Storage via the service-role admin client (pattern in `app/api/documents/upload/route.ts`, bucket `documents`). → powers voice-note audio upload.
- **Reminders:** existing `reminder_at`, `reminder_recipients`, `reminder_message`, `reminded` columns + cron. Carried forward unchanged.

---

## 2. Out of Scope

- Real-time collaborative editing (multiple cursors / live co-edit). Editing is last-write-wins per note.
- Full-text Postgres search (`tsvector`). Search stays `ILIKE` over title/content/labels, matching the current approach.
- Folder drag-and-drop reorder in Phase 1 (folders ordered by `position`, edited via menu). DnD can be a later nicety.
- Integrating note events into the existing social **Content Calendar** (`content_posts`) — semantically wrong. The hub gets its own lightweight calendar view (§7, Phase 3).
- Versioning / edit history.

---

## 3. Data Model

### 3.1 `notes` (modify existing table)

> **Migration order:** within the single Phase-1 migration file, create `note_folders` (§3.2) **before** this `ALTER TABLE notes`, because the `folder_id` foreign key references it.

```sql
-- migration: <next-number>_notes_hub.sql  (note_folders created first, see §3.2)
ALTER TABLE notes
  ADD COLUMN IF NOT EXISTS folder_id  uuid REFERENCES note_folders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS scope      text NOT NULL DEFAULT 'private'
    CHECK (scope IN ('private','team','sop')),
  ADD COLUMN IF NOT EXISTS body       jsonb NOT NULL DEFAULT '{}'::jsonb,  -- TipTap doc JSON
  ADD COLUMN IF NOT EXISTS created_by uuid;  -- author (= user_id for migrated rows)

-- Backfill author + keep user_id meaning "owner/author"
UPDATE notes SET created_by = user_id WHERE created_by IS NULL;

CREATE INDEX IF NOT EXISTS idx_notes_scope_company ON notes (company_id, scope, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_notes_folder        ON notes (folder_id);
```

- `content` (existing, plain text) stays as the **search + preview mirror** of `body`. On every save, `content` = plain-text extraction of the TipTap doc.
- `note_type`, `items`, `color`, `pinned`, `labels`, `archived`, reminder columns — all retained and continue to work.
- Scope semantics:
  - `private` — visible to `user_id` only.
  - `team` — visible to all users in `company_id`; editable by author + share-edit users.
  - `sop` — visible to all users in `company_id`; editable only by `role='ADMIN'`.

### 3.2 `note_folders` (new)

```sql
CREATE TABLE note_folders (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL,
  name        text NOT NULL,
  icon        text,                       -- emoji or lucide key
  parent_id   uuid REFERENCES note_folders(id) ON DELETE CASCADE,  -- nesting
  scope       text NOT NULL DEFAULT 'private' CHECK (scope IN ('private','team','sop')),
  owner_id    uuid,                        -- set for private folders; NULL for team/sop
  position    int  NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_note_folders_company ON note_folders (company_id, scope, position);
```

- The **top sidebar group** (My Notes / Team Notes / SOP Library / Shared With Me) are **scope tabs / virtual views**, NOT folder rows.
- The **bottom sidebar group** (Projects, Clients, Marketing, Learning, HR, Personal…) are real `note_folders` rows. Each member is seeded a "Personal" private folder on migration.
- Folder note-count is computed per query (count of visible notes whose `folder_id` matches).

### 3.3 `note_shares` (new)

```sql
CREATE TABLE note_shares (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  note_id     uuid NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  shared_with uuid NOT NULL,               -- target user
  permission  text NOT NULL DEFAULT 'view' CHECK (permission IN ('view','edit')),
  shared_by   uuid NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (note_id, shared_with)
);
CREATE INDEX idx_note_shares_user ON note_shares (shared_with);
```

- "Shared With Me" = notes where a `note_shares` row exists for the current user.

### 3.4 `note_attachments` (new)

```sql
CREATE TABLE note_attachments (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  note_id    uuid NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  type       text NOT NULL CHECK (type IN ('audio','file')),
  url        text NOT NULL,
  filename   text,
  duration   int,                          -- seconds, for audio
  size       int,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_note_attachments_note ON note_attachments (note_id);
```

- Phase 3 uses `type='audio'` for voice notes. `type='file'` reserved for future file attachments.

### 3.5 RLS

All four tables follow the standard tenant pattern: `company_id = (auth.jwt() ->> 'company_id')::uuid`. Because server actions already use the service-role admin client (matching the existing notes actions), visibility is enforced in the action queries (scope/owner/share checks) AND backed by RLS for defense-in-depth. SOP writes additionally check `role='ADMIN'` in the action.

---

## 4. Routes & Access

- New shared route segment used by both portals. Concretely: `app/admin/notes/` and `app/member/notes/` each render a thin server `page.tsx` that fetches scoped data and passes it to a **shared client component** in `components/notes/notes-hub.tsx`.
- The existing `app/member/notes/` is rewritten to use the shared hub. Sidebar nav links already exist for members; an admin nav link is added.
- Access enforced in server actions:

| Scope | Read | Write |
|---|---|---|
| Private | `user_id = me` | `user_id = me` |
| Team | same `company_id` | author OR `note_shares.permission='edit'` |
| SOP | same `company_id` | `role = 'ADMIN'` |
| Shared (any) | `note_shares.shared_with = me` | `note_shares.permission='edit'` |

---

## 5. Server Actions (`lib/actions/notes.ts` — extend)

Existing actions (`getNotes`, `createNote`, `updateNote`, `deleteNote`, `togglePin`, `archiveNote`, `convertNoteToTask`) are updated to carry `folder_id`, `scope`, `body`, and to enforce the access table above. New actions:

```typescript
// Folders
getFolders(): Promise<FolderRow[]>                       // visible folders + counts
createFolder(input: { name; icon?; parentId?; scope }): ActionResult<{ id }>
renameFolder(id, name): ActionResult
deleteFolder(id): ActionResult                            // notes → folder_id = null
moveNoteToFolder(noteId, folderId | null): ActionResult

// Hub fetch
getHubNotes(view: 'all'|'mine'|'team'|'sop'|'shared', folderId?, q?): Promise<NoteRow[]>

// Sharing (Phase 2)
shareNote(noteId, userIds: string[], permission): ActionResult   // + notification
unshareNote(noteId, userId): ActionResult
getNoteShares(noteId): Promise<ShareRow[]>

// Mentions (Phase 2) — called inside updateNote when body contains new @mentions
// fires insertManyNotifications(type='note_mention', link=`/.../notes?note=<id>`)

// Attachments (Phase 3)
addAudioAttachment(noteId, url, duration): ActionResult
deleteAttachment(id): ActionResult
```

`ActionResult<T> = { success: boolean; error?: string } & T`.

---

## 6. UI — `components/notes/notes-hub.tsx`

Three-pane responsive layout, GroFast branding (red `#DE1A1A` primary, white, black, light gray; 16px radius; soft shadows; hero card style consistent with the rest of the app).

### 6.1 Header
- Title `📒 Notes`, subtitle "Create, organize and collaborate on company knowledge."
- Right: red `+ New Note` button.
- Full-width search (filters title / folder / content / labels / shared).
- Filter tabs (pills): **All · My Notes · Team Notes · SOP Library · Shared With Me**. Selected = red bg / white text. These map to `getHubNotes(view)`.

### 6.2 Left pane — Folders (~20%)
- `📂 Folders` heading.
- Scope shortcuts (top group, virtual): My Notes, Team Notes, SOP Library ⭐ Shared With Me.
- Divider.
- Real folder rows with icon + name + `(count)`; nested children indented & collapsible.
- `+ New Folder` at the bottom. Selected folder highlighted; hover animation. Right-click / kebab → rename, delete.

### 6.3 Center pane — Notes list (~30%)
- Sort dropdown: Newest · Oldest · Recently Edited.
- Note cards: title, folder name, last-updated, scope/privacy badge, reminder icon, voice-note icon (if attachment), mention indicator. Rounded white cards, hover elevation. Click → open in editor.

### 6.4 Right pane — Editor (~50%)
- Title input ("Untitled Note").
- Metadata row: folder dropdown, scope toggle (Private / Team; SOP shown/selectable for admins).
- **TipTap toolbar:** Bold, Italic, Underline, Headings, Bullet list, Numbered list, Checklist, Quote, Table, Link, Divider, Emoji, Undo, Redo.
- Auto-expanding editing area; autosave (debounced `updateNote`).
- **Sticky bottom action bar:** @ Mention · Voice Note · Reminder · Calendar · Share · Export · Save.

### 6.5 Responsive
- Desktop: 3 columns. Tablet: folder sidebar → drawer, editor widens. Mobile: list → editor → sidebar drawer.

### 6.6 Feature popups
- **@Mention:** typing `@` in the editor opens a teammate search; selecting inserts a styled mention node and (on save) notifies that user.
- **Voice note:** mic button → record/pause/stop/play with duration + waveform; on attach, uploads audio and creates an `audio` attachment.
- **Reminder:** Today / Tomorrow / Next Week / Custom date+time + "Add to Calendar" checkbox. Reuses existing reminder columns & cron.
- **Share:** teammate search + View/Edit permission + Share button → `shareNote` + notification.
- **Export:** Export as PDF / Word, generated client-side from the rendered note HTML (no backend).

---

## 7. Feature Notes

- **Migration:** a one-time data step (in the migration SQL or a server action run once) creates a "Personal" private folder per existing note owner and sets their notes to `scope='private'`, `folder_id=<their Personal folder>`, `body` = paragraph wrapping existing `content`.
- **Search:** `ILIKE` over `title`, `content`, `labels`, plus folder name match, scoped to what the user may see.
- **Export:** PDF via the browser print pipeline or a lightweight client lib; Word via HTML→`.doc` blob. Decided concretely during Phase 3 planning; both are client-only.
- **Calendar view (Phase 3):** a self-contained month view inside the hub showing notes that have `reminder_at` (and any future due dates). It does NOT write to `content_posts`.

---

## 8. Build Phases

### Phase 1 — Structural core (ship first)
Schema (`notes` changes + `note_folders`), migration of existing notes, shared `notes-hub.tsx`, three-pane layout, scope tabs, folders (nested + counts + CRUD), TipTap editor with full toolbar, search, Private/Team/SOP read-write enforced by role, admin route + nav link. Reminders carried over (existing).

### Phase 2 — Collaboration
`note_shares` table + share popup + "Shared With Me", @mentions → notifications, share notifications.

### Phase 3 — Rich media
`note_attachments` table + voice notes (record/upload/playback), hub calendar view, PDF/Word export.

Each phase: build → `pnpm typecheck`/`lint`/`build` → push to `sajee` → WhatsApp Sanjay to merge.

---

## 9. Success Criteria

- A member sees Private notes only they can read; Team notes everyone in the company can read; SOP notes everyone reads but only admins edit.
- Folders nest, show live note counts, and filter the list when selected.
- The TipTap editor produces headings, lists, checklists, tables, quotes, and links; notes autosave and reload identically.
- Existing personal notes appear post-migration in each member's Personal folder with content intact.
- (P2) Sharing a note surfaces it under the recipient's "Shared With Me" and notifies them; @mention notifies the tagged user.
- (P3) A voice note records, uploads, and plays back; a note exports to PDF and Word; the calendar view shows reminder-bearing notes.
- The hub renders correctly in both admin and member portals and is responsive across desktop/tablet/mobile.
