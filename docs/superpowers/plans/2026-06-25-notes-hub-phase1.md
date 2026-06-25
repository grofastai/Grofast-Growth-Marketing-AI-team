# Notes Knowledge Hub — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Keep-style member Notes with the structural core of a Notion-style Knowledge Hub: scoped notes (Private/Team/SOP), nested folders, a three-pane layout, a TipTap rich-text editor, search, and a one-time migration of existing notes — rendered in both admin and member portals.

**Architecture:** A shared client component `components/notes/notes-hub.tsx` (with sub-components for the three panes) is rendered by thin server pages in `app/admin/notes/` and `app/member/notes/`. Data access goes through extended server actions in `lib/actions/notes.ts` using the existing service-role admin-client pattern. Pure logic (plain-text extraction, access rules, filtering) lives in small testable modules under `lib/notes/`.

**Tech Stack:** Next.js 15 App Router, Supabase (service-role admin client), TipTap (`@tiptap/react`, `@tiptap/starter-kit`, plus table/link/task-list/underline extensions), TypeScript strict, Vitest for pure-logic tests, inline-style UI matching the existing GroFast design language.

## Global Constraints

- Multi-tenant: every row carries `company_id`; every action resolves the caller's `company_id` from `users` and filters by it. (verbatim from spec §3.5)
- Primary brand color `#DE1A1A`; white/black/light-gray; 16px radius; soft shadows; no external UI component libraries (TipTap is an editor engine, allowed). (spec §6)
- Scope enum is exactly `'private' | 'team' | 'sop'`. (spec §3.1)
- SOP notes are editable only by `role='ADMIN'`. (spec §4)
- `content` (plain text) is always kept as the search/preview mirror of `body` (TipTap JSON) on every save. (spec §3.1)
- Server actions use the service-role admin client (matching existing `lib/actions/notes.ts`); access is enforced in the action queries. (spec §3.5)
- Existing reminder columns/cron and `convertNoteToTask` keep working unchanged. (spec §1)

---

### Task 1: Database migration — schema + data migration

**Files:**
- Create: `supabase/migrations/083_notes_hub.sql`

**Interfaces:**
- Produces: table `note_folders(id, company_id, name, icon, parent_id, scope, owner_id, position, created_at)`; new `notes` columns `folder_id, scope, body, created_by`; one `Personal` private folder per existing note-owner with their notes migrated into it.

- [ ] **Step 1: Write the migration SQL**

```sql
-- 083_notes_hub.sql — Notes Knowledge Hub Phase 1
-- 1. Folders table (created BEFORE the notes FK references it)
CREATE TABLE IF NOT EXISTS note_folders (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL,
  name        text NOT NULL,
  icon        text,
  parent_id   uuid REFERENCES note_folders(id) ON DELETE CASCADE,
  scope       text NOT NULL DEFAULT 'private' CHECK (scope IN ('private','team','sop')),
  owner_id    uuid,
  position    int  NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_note_folders_company ON note_folders (company_id, scope, position);

-- 2. Notes columns
ALTER TABLE notes
  ADD COLUMN IF NOT EXISTS folder_id  uuid REFERENCES note_folders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS scope      text NOT NULL DEFAULT 'private'
    CHECK (scope IN ('private','team','sop')),
  ADD COLUMN IF NOT EXISTS body       jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS created_by uuid;

UPDATE notes SET created_by = user_id WHERE created_by IS NULL;

CREATE INDEX IF NOT EXISTS idx_notes_scope_company ON notes (company_id, scope, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_notes_folder        ON notes (folder_id);

-- 3. Seed a "Personal" private folder per existing note owner, then migrate their notes into it
WITH owners AS (
  SELECT DISTINCT user_id, company_id FROM notes WHERE user_id IS NOT NULL
), seeded AS (
  INSERT INTO note_folders (company_id, name, icon, scope, owner_id, position)
  SELECT company_id, 'Personal', '📁', 'private', user_id, 0
  FROM owners
  RETURNING id, owner_id
)
UPDATE notes n
SET folder_id = s.id, scope = 'private'
FROM seeded s
WHERE n.user_id = s.owner_id AND n.folder_id IS NULL;

-- 4. Wrap existing plain-text content into a minimal TipTap doc so the editor renders it
UPDATE notes
SET body = jsonb_build_object(
  'type','doc',
  'content', jsonb_build_array(
    jsonb_build_object('type','paragraph','content',
      CASE WHEN coalesce(content,'') = '' THEN '[]'::jsonb
           ELSE jsonb_build_array(jsonb_build_object('type','text','text',content)) END)
  ))
WHERE body = '{}'::jsonb;

-- 5. RLS (defense-in-depth; actions also enforce)
ALTER TABLE note_folders ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_note_folders ON note_folders
  FOR ALL USING (company_id = (auth.jwt() ->> 'company_id')::uuid);
```

- [ ] **Step 2: Apply the migration**

Apply via the Supabase MCP `apply_migration` tool (name `notes_hub`, the SQL above), OR run it against the project. Confirm no error is returned.

- [ ] **Step 3: Verify schema**

Run via Supabase MCP `execute_sql`:
```sql
SELECT column_name FROM information_schema.columns
WHERE table_name='notes' AND column_name IN ('folder_id','scope','body','created_by');
SELECT count(*) AS personal_folders FROM note_folders WHERE name='Personal';
```
Expected: 4 column rows returned; `personal_folders` ≥ number of distinct existing note owners.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/083_notes_hub.sql
git commit -m "feat(notes): add knowledge-hub schema + migrate existing notes"
```

---

### Task 2: Pure logic — TipTap plain-text extraction (TDD)

**Files:**
- Create: `lib/notes/tiptap-text.ts`
- Test: `lib/notes/tiptap-text.test.ts`

**Interfaces:**
- Produces: `extractPlainText(doc: TiptapDoc): string` — flattens a TipTap JSON doc to a single space/newline-joined plain string for search + previews. `type TiptapDoc = { type: string; content?: TiptapNode[] }`.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest'
import { extractPlainText } from './tiptap-text'

describe('extractPlainText', () => {
  it('joins text nodes across paragraphs', () => {
    const doc = { type: 'doc', content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'Hello' }, { type: 'text', text: ' world' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'Line two' }] },
    ]}
    expect(extractPlainText(doc)).toBe('Hello world\nLine two')
  })
  it('handles empty / contentless docs', () => {
    expect(extractPlainText({ type: 'doc' })).toBe('')
    expect(extractPlainText({ type: 'doc', content: [{ type: 'paragraph' }] })).toBe('')
  })
  it('extracts text from nested nodes (lists, tasks)', () => {
    const doc = { type: 'doc', content: [
      { type: 'taskList', content: [
        { type: 'taskItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'todo a' }] }] },
      ]},
    ]}
    expect(extractPlainText(doc)).toBe('todo a')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test lib/notes/tiptap-text.test.ts`
Expected: FAIL — `extractPlainText` not defined.

- [ ] **Step 3: Write the implementation**

```typescript
export interface TiptapNode { type: string; text?: string; content?: TiptapNode[] }
export interface TiptapDoc { type: string; content?: TiptapNode[] }

// Block-level nodes whose boundary should produce a newline between them.
const BLOCK = new Set(['paragraph', 'heading', 'listItem', 'taskItem', 'blockquote'])

export function extractPlainText(doc: TiptapDoc | TiptapNode | null | undefined): string {
  if (!doc) return ''
  const lines: string[] = []
  const walk = (node: TiptapNode, buf: { s: string }) => {
    if (node.text) buf.s += node.text
    node.content?.forEach(child => {
      if (BLOCK.has(child.type)) {
        const inner = { s: '' }
        walk(child, inner)
        if (inner.s.trim()) lines.push(inner.s.trim())
      } else {
        walk(child, buf)
      }
    })
  }
  const root = { s: '' }
  walk(doc as TiptapNode, root)
  if (root.s.trim()) lines.unshift(root.s.trim())
  return lines.join('\n')
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test lib/notes/tiptap-text.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/notes/tiptap-text.ts lib/notes/tiptap-text.test.ts
git commit -m "feat(notes): TipTap plain-text extraction helper"
```

---

### Task 3: Pure logic — access rules (TDD)

**Files:**
- Create: `lib/notes/access.ts`
- Test: `lib/notes/access.test.ts`

**Interfaces:**
- Consumes: scope strings from Task 1.
- Produces:
  - `type Viewer = { id: string; role: 'ADMIN' | 'MEMBER' }`
  - `type NoteAccess = { user_id: string; scope: 'private'|'team'|'sop'; shareEdit?: boolean }`
  - `canEditNote(note: NoteAccess, v: Viewer): boolean`
  - `canReadNote(note: NoteAccess & { shared?: boolean }, v: Viewer): boolean`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest'
import { canEditNote, canReadNote } from './access'

const admin = { id: 'a', role: 'ADMIN' as const }
const memberOwner = { id: 'm', role: 'MEMBER' as const }
const other = { id: 'x', role: 'MEMBER' as const }

describe('canEditNote', () => {
  it('private: only owner edits', () => {
    expect(canEditNote({ user_id: 'm', scope: 'private' }, memberOwner)).toBe(true)
    expect(canEditNote({ user_id: 'm', scope: 'private' }, other)).toBe(false)
  })
  it('team: owner or share-edit user edits', () => {
    expect(canEditNote({ user_id: 'm', scope: 'team' }, memberOwner)).toBe(true)
    expect(canEditNote({ user_id: 'm', scope: 'team' }, other)).toBe(false)
    expect(canEditNote({ user_id: 'm', scope: 'team', shareEdit: true }, other)).toBe(true)
  })
  it('sop: only admins edit', () => {
    expect(canEditNote({ user_id: 'm', scope: 'sop' }, admin)).toBe(true)
    expect(canEditNote({ user_id: 'm', scope: 'sop' }, memberOwner)).toBe(false)
  })
})

describe('canReadNote', () => {
  it('private: owner only', () => {
    expect(canReadNote({ user_id: 'm', scope: 'private' }, memberOwner)).toBe(true)
    expect(canReadNote({ user_id: 'm', scope: 'private' }, other)).toBe(false)
  })
  it('private shared with me: readable', () => {
    expect(canReadNote({ user_id: 'm', scope: 'private', shared: true }, other)).toBe(true)
  })
  it('team & sop: anyone in company reads', () => {
    expect(canReadNote({ user_id: 'm', scope: 'team' }, other)).toBe(true)
    expect(canReadNote({ user_id: 'm', scope: 'sop' }, other)).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test lib/notes/access.test.ts`
Expected: FAIL — functions not defined.

- [ ] **Step 3: Write the implementation**

```typescript
export type Viewer = { id: string; role: 'ADMIN' | 'MEMBER' }
export type NoteAccess = { user_id: string; scope: 'private' | 'team' | 'sop'; shareEdit?: boolean }

export function canEditNote(note: NoteAccess, v: Viewer): boolean {
  if (note.scope === 'sop') return v.role === 'ADMIN'
  if (note.scope === 'team') return note.user_id === v.id || !!note.shareEdit
  return note.user_id === v.id // private
}

export function canReadNote(note: NoteAccess & { shared?: boolean }, v: Viewer): boolean {
  if (note.scope === 'team' || note.scope === 'sop') return true
  return note.user_id === v.id || !!note.shared // private
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test lib/notes/access.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/notes/access.ts lib/notes/access.test.ts
git commit -m "feat(notes): note access-rule helpers"
```

---

### Task 4: Pure logic — hub view filtering + search (TDD)

**Files:**
- Create: `lib/notes/filter.ts`
- Test: `lib/notes/filter.test.ts`

**Interfaces:**
- Produces:
  - `type HubView = 'all'|'mine'|'team'|'sop'|'shared'`
  - `type FilterNote = { id: string; user_id: string; scope: 'private'|'team'|'sop'; shared?: boolean; folder_id: string|null; title: string|null; content: string; labels: string[] }`
  - `filterNotes(notes: FilterNote[], opts: { view: HubView; viewerId: string; folderId?: string|null; q?: string; folderName?: (id: string|null) => string }): FilterNote[]`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest'
import { filterNotes, type FilterNote } from './filter'

const notes: FilterNote[] = [
  { id: '1', user_id: 'me', scope: 'private', folder_id: 'f1', title: 'My private', content: 'alpha', labels: [] },
  { id: '2', user_id: 'me', scope: 'team',    folder_id: 'f1', title: 'Team note', content: 'beta', labels: ['x'] },
  { id: '3', user_id: 'you', scope: 'sop',    folder_id: 'f2', title: 'SOP doc', content: 'gamma', labels: [] },
  { id: '4', user_id: 'you', scope: 'private', shared: true, folder_id: null, title: 'Shared in', content: 'delta', labels: [] },
]

describe('filterNotes view', () => {
  it('mine = my-authored notes', () => {
    expect(filterNotes(notes, { view: 'mine', viewerId: 'me' }).map(n => n.id)).toEqual(['1', '2'])
  })
  it('team / sop / shared', () => {
    expect(filterNotes(notes, { view: 'team', viewerId: 'me' }).map(n => n.id)).toEqual(['2'])
    expect(filterNotes(notes, { view: 'sop', viewerId: 'me' }).map(n => n.id)).toEqual(['3'])
    expect(filterNotes(notes, { view: 'shared', viewerId: 'me' }).map(n => n.id)).toEqual(['4'])
  })
  it('all = everything visible', () => {
    expect(filterNotes(notes, { view: 'all', viewerId: 'me' }).map(n => n.id)).toEqual(['1', '2', '3', '4'])
  })
})

describe('filterNotes folder + search', () => {
  it('filters by folder', () => {
    expect(filterNotes(notes, { view: 'all', viewerId: 'me', folderId: 'f1' }).map(n => n.id)).toEqual(['1', '2'])
  })
  it('search matches title/content/labels', () => {
    expect(filterNotes(notes, { view: 'all', viewerId: 'me', q: 'gamma' }).map(n => n.id)).toEqual(['3'])
    expect(filterNotes(notes, { view: 'all', viewerId: 'me', q: 'team' }).map(n => n.id)).toEqual(['2'])
    expect(filterNotes(notes, { view: 'all', viewerId: 'me', q: 'x' }).map(n => n.id)).toEqual(['2'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test lib/notes/filter.test.ts`
Expected: FAIL — `filterNotes` not defined.

- [ ] **Step 3: Write the implementation**

```typescript
export type HubView = 'all' | 'mine' | 'team' | 'sop' | 'shared'
export type FilterNote = {
  id: string; user_id: string; scope: 'private' | 'team' | 'sop'; shared?: boolean
  folder_id: string | null; title: string | null; content: string; labels: string[]
}

export function filterNotes(
  notes: FilterNote[],
  opts: { view: HubView; viewerId: string; folderId?: string | null; q?: string; folderName?: (id: string | null) => string },
): FilterNote[] {
  const { view, viewerId, folderId, q, folderName } = opts
  let out = notes.filter(n => {
    switch (view) {
      case 'mine':   return n.user_id === viewerId && n.scope === 'private'
      case 'team':   return n.scope === 'team'
      case 'sop':    return n.scope === 'sop'
      case 'shared': return !!n.shared
      default:       return true // all
    }
  })
  if (folderId !== undefined && folderId !== null) out = out.filter(n => n.folder_id === folderId)
  if (q && q.trim()) {
    const needle = q.trim().toLowerCase()
    out = out.filter(n =>
      (n.title ?? '').toLowerCase().includes(needle) ||
      n.content.toLowerCase().includes(needle) ||
      n.labels.some(l => l.toLowerCase().includes(needle)) ||
      (folderName?.(n.folder_id) ?? '').toLowerCase().includes(needle))
  }
  return out
}
```

Note: `view:'mine'` returns the viewer's **private** notes (their personal space); team/sop authored by them appear under Team/SOP tabs. This matches the sidebar's "My Notes" = personal scope.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test lib/notes/filter.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/notes/filter.ts lib/notes/filter.test.ts
git commit -m "feat(notes): hub view-filter + search helper"
```

---

### Task 5: Server actions — folders + extended note actions

**Files:**
- Modify: `lib/actions/notes.ts`

**Interfaces:**
- Consumes: `extractPlainText` (Task 2), `canEditNote` (Task 3).
- Produces:
  - `interface FolderRow { id; company_id; name; icon: string|null; parent_id: string|null; scope: 'private'|'team'|'sop'; owner_id: string|null; position: number; count: number }`
  - `getFolders(): Promise<FolderRow[]>`
  - `createFolder(input: { name: string; icon?: string; parentId?: string|null; scope: 'private'|'team'|'sop' }): Promise<{ success: boolean; id?: string; error?: string }>`
  - `renameFolder(id: string, name: string): Promise<{ success: boolean; error?: string }>`
  - `deleteFolder(id: string): Promise<{ success: boolean; error?: string }>`
  - `getHubNotes(): Promise<HubNoteRow[]>` where `HubNoteRow` extends `NoteRow` with `scope`, `folder_id`, `body`, `created_by`, `shared: boolean`, `can_edit: boolean`.
  - Updated `NoteInput` adds `scope`, `folder_id`, `body` (TipTap JSON object).

- [ ] **Step 1: Extend `NoteRow` / `NoteInput` and add the viewer helper**

Add to the type block in `lib/actions/notes.ts`:
```typescript
import { extractPlainText } from '@/lib/notes/tiptap-text'
import { canEditNote } from '@/lib/notes/access'

export type NoteScope = 'private' | 'team' | 'sop'

export interface FolderRow {
  id: string; company_id: string; name: string; icon: string | null
  parent_id: string | null; scope: NoteScope; owner_id: string | null
  position: number; count: number
}

// extend existing NoteRow:
//   scope: NoteScope; folder_id: string | null; body: unknown; created_by: string | null
// extend existing NoteInput:
//   scope?: NoteScope; folder_id?: string | null; body?: unknown

export interface HubNoteRow extends NoteRow {
  scope: NoteScope; folder_id: string | null; body: unknown; created_by: string | null
  shared: boolean; can_edit: boolean
}

async function getViewer() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const admin = adminSupabase()
  const { data: profile } = await admin.from('users').select('company_id, role').eq('id', user.id).single()
  if (!profile?.company_id) return null
  return { id: user.id, companyId: profile.company_id as string, role: profile.role as 'ADMIN' | 'MEMBER' }
}
```

- [ ] **Step 2: Add `getFolders`**

```typescript
export async function getFolders(): Promise<FolderRow[]> {
  const v = await getViewer()
  if (!v) return []
  const admin = adminSupabase()
  const { data: folders } = await admin
    .from('note_folders')
    .select('id, company_id, name, icon, parent_id, scope, owner_id, position')
    .eq('company_id', v.companyId)
    .or(`owner_id.is.null,owner_id.eq.${v.id}`)
    .order('position')
  const { data: notes } = await admin
    .from('notes').select('folder_id').eq('company_id', v.companyId).eq('archived', false)
  const counts = new Map<string, number>()
  for (const n of notes ?? []) if (n.folder_id) counts.set(n.folder_id, (counts.get(n.folder_id) ?? 0) + 1)
  return (folders ?? []).map(f => ({ ...f, count: counts.get(f.id) ?? 0 })) as FolderRow[]
}
```

- [ ] **Step 3: Add folder CRUD**

```typescript
export async function createFolder(
  input: { name: string; icon?: string; parentId?: string | null; scope: NoteScope },
): Promise<{ success: boolean; id?: string; error?: string }> {
  const v = await getViewer()
  if (!v) return { success: false, error: 'Not authenticated' }
  if (input.scope === 'sop' && v.role !== 'ADMIN') return { success: false, error: 'Only admins can create SOP folders' }
  if (!input.name.trim()) return { success: false, error: 'Folder name required' }
  const admin = adminSupabase()
  const { data, error } = await admin.from('note_folders').insert({
    company_id: v.companyId, name: input.name.trim(), icon: input.icon ?? '📁',
    parent_id: input.parentId ?? null, scope: input.scope,
    owner_id: input.scope === 'private' ? v.id : null,
  }).select('id').single()
  if (error) return { success: false, error: error.message }
  revalidatePath('/member/notes'); revalidatePath('/admin/notes')
  return { success: true, id: data.id }
}

export async function renameFolder(id: string, name: string): Promise<{ success: boolean; error?: string }> {
  const v = await getViewer()
  if (!v) return { success: false, error: 'Not authenticated' }
  if (!name.trim()) return { success: false, error: 'Name required' }
  const admin = adminSupabase()
  const { error } = await admin.from('note_folders').update({ name: name.trim() })
    .eq('id', id).eq('company_id', v.companyId)
  if (error) return { success: false, error: error.message }
  revalidatePath('/member/notes'); revalidatePath('/admin/notes')
  return { success: true }
}

export async function deleteFolder(id: string): Promise<{ success: boolean; error?: string }> {
  const v = await getViewer()
  if (!v) return { success: false, error: 'Not authenticated' }
  const admin = adminSupabase()
  // notes.folder_id ON DELETE SET NULL handles detachment
  const { error } = await admin.from('note_folders').delete().eq('id', id).eq('company_id', v.companyId)
  if (error) return { success: false, error: error.message }
  revalidatePath('/member/notes'); revalidatePath('/admin/notes')
  return { success: true }
}
```

- [ ] **Step 4: Add `getHubNotes` (scope-aware fetch)**

```typescript
export async function getHubNotes(): Promise<HubNoteRow[]> {
  const v = await getViewer()
  if (!v) return []
  const admin = adminSupabase()
  // All non-archived company notes that are team/sop, OR my own private notes.
  const { data: rows } = await admin
    .from('notes')
    .select('id, title, content, color, pinned, reminder_at, reminded, reminder_recipients, reminder_message, note_type, items, labels, archived, created_at, updated_at, scope, folder_id, body, created_by, user_id')
    .eq('company_id', v.companyId)
    .eq('archived', false)
    .or(`scope.in.(team,sop),and(scope.eq.private,user_id.eq.${v.id})`)
    .order('pinned', { ascending: false })
    .order('updated_at', { ascending: false })
  return (rows ?? []).map(r => ({
    ...r,
    shared: false, // Phase 2 fills this from note_shares
    can_edit: canEditNote({ user_id: r.user_id, scope: r.scope }, { id: v.id, role: v.role }),
  })) as HubNoteRow[]
}
```

- [ ] **Step 5: Update `createNote` / `updateNote` to carry scope/folder/body + derive content**

In `createNote`, replace the insert payload additions:
```typescript
  const bodyJson = input.body ?? { type: 'doc', content: [] }
  const derivedContent = input.content?.trim() || extractPlainText(bodyJson as never)
  // ...inside .insert({ ... }) add:
  //   scope:      input.scope ?? 'private',
  //   folder_id:  input.folder_id ?? null,
  //   body:       bodyJson,
  //   created_by: user.id,
  //   content:    derivedContent,
```
Guard SOP create: `if ((input.scope === 'sop') && role !== 'ADMIN') return { success:false, error:'Only admins can create SOP notes' }` (resolve role via the existing profile fetch — extend its select to `company_id, role`).

In `updateNote`, before updating, load the row's `scope, user_id`, resolve viewer role, and reject when `!canEditNote(...)`. Then set `content = input.content?.trim() || extractPlainText(input.body)`, `body = input.body ?? existing`, `scope`, `folder_id` in the update payload.

- [ ] **Step 6: Typecheck**

Run: `pnpm typecheck`
Expected: no errors in `lib/actions/notes.ts`.

- [ ] **Step 7: Commit**

```bash
git add lib/actions/notes.ts
git commit -m "feat(notes): folder CRUD + scope-aware hub note actions"
```

---

### Task 6: Install TipTap + build the editor pane

**Files:**
- Modify: `package.json` (deps)
- Create: `components/notes/types.ts`
- Create: `components/notes/tiptap-toolbar.tsx`
- Create: `components/notes/note-editor.tsx`

**Interfaces:**
- Consumes: `HubNoteRow`, `FolderRow`, `NoteScope` from `lib/actions/notes.ts`.
- Produces:
  - `components/notes/types.ts`: re-exports `HubNoteRow as HubNote`, `FolderRow as Folder`, `NoteScope`, plus `type TeamMember = { id: string; name: string; employee_id: string }`.
  - `NoteEditor` props: `{ note: HubNote | null; folders: Folder[]; canEdit: boolean; onSave: (patch: { title: string; body: unknown; scope: NoteScope; folder_id: string|null }) => void; saving: boolean }`.

- [ ] **Step 1: Install TipTap**

```bash
pnpm add @tiptap/react @tiptap/pm @tiptap/starter-kit @tiptap/extension-link @tiptap/extension-underline @tiptap/extension-task-list @tiptap/extension-task-item @tiptap/extension-table @tiptap/extension-table-row @tiptap/extension-table-cell @tiptap/extension-table-header
```
Expected: packages added, lockfile updated.

- [ ] **Step 2: Create `components/notes/types.ts`**

```typescript
export type { HubNoteRow as HubNote, FolderRow as Folder, NoteScope } from '@/lib/actions/notes'
export type TeamMember = { id: string; name: string; employee_id: string }
```

- [ ] **Step 3: Create `tiptap-toolbar.tsx`**

A client component taking `{ editor: Editor | null }` from `@tiptap/react`. Render buttons that call editor chain commands. Each button: `disabled={!editor}`, red active state when `editor?.isActive(...)`.
```tsx
'use client'
import { Editor } from '@tiptap/react'
import { Bold, Italic, Underline as U, Heading1, Heading2, List, ListOrdered,
  CheckSquare, Quote, Table as TableIcon, Link as LinkIcon, Minus, Undo2, Redo2 } from 'lucide-react'

export function TiptapToolbar({ editor }: { editor: Editor | null }) {
  if (!editor) return null
  const Btn = ({ on, active, children, label }: { on: () => void; active?: boolean; children: React.ReactNode; label: string }) => (
    <button type="button" title={label} aria-label={label} onClick={on}
      style={{ width: 30, height: 30, borderRadius: 8, border: 'none', cursor: 'pointer',
        display: 'grid', placeItems: 'center',
        background: active ? '#DE1A1A' : 'transparent', color: active ? '#fff' : '#374151' }}>
      {children}
    </button>
  )
  return (
    <div style={{ display: 'flex', gap: 2, flexWrap: 'wrap', padding: 6, borderBottom: '1px solid #F1F1F4' }}>
      <Btn label="Bold"      on={() => editor.chain().focus().toggleBold().run()}            active={editor.isActive('bold')}><Bold size={15}/></Btn>
      <Btn label="Italic"    on={() => editor.chain().focus().toggleItalic().run()}          active={editor.isActive('italic')}><Italic size={15}/></Btn>
      <Btn label="Underline" on={() => editor.chain().focus().toggleUnderline().run()}       active={editor.isActive('underline')}><U size={15}/></Btn>
      <Btn label="Heading 1" on={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} active={editor.isActive('heading', { level: 1 })}><Heading1 size={15}/></Btn>
      <Btn label="Heading 2" on={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive('heading', { level: 2 })}><Heading2 size={15}/></Btn>
      <Btn label="Bullet list"   on={() => editor.chain().focus().toggleBulletList().run()}  active={editor.isActive('bulletList')}><List size={15}/></Btn>
      <Btn label="Numbered list" on={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive('orderedList')}><ListOrdered size={15}/></Btn>
      <Btn label="Checklist"  on={() => editor.chain().focus().toggleTaskList().run()}        active={editor.isActive('taskList')}><CheckSquare size={15}/></Btn>
      <Btn label="Quote"      on={() => editor.chain().focus().toggleBlockquote().run()}      active={editor.isActive('blockquote')}><Quote size={15}/></Btn>
      <Btn label="Table"      on={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}><TableIcon size={15}/></Btn>
      <Btn label="Link"       on={() => { const url = prompt('Link URL'); if (url) editor.chain().focus().setLink({ href: url }).run() }} active={editor.isActive('link')}><LinkIcon size={15}/></Btn>
      <Btn label="Divider"    on={() => editor.chain().focus().setHorizontalRule().run()}><Minus size={15}/></Btn>
      <Btn label="Undo"       on={() => editor.chain().focus().undo().run()}><Undo2 size={15}/></Btn>
      <Btn label="Redo"       on={() => editor.chain().focus().redo().run()}><Redo2 size={15}/></Btn>
    </div>
  )
}
```

- [ ] **Step 4: Create `note-editor.tsx`**

```tsx
'use client'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Link from '@tiptap/extension-link'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Table from '@tiptap/extension-table'
import TableRow from '@tiptap/extension-table-row'
import TableCell from '@tiptap/extension-table-cell'
import TableHeader from '@tiptap/extension-table-header'
import { useEffect, useState } from 'react'
import { TiptapToolbar } from './tiptap-toolbar'
import type { HubNote, Folder, NoteScope } from './types'

const EXT = [StarterKit, Underline, Link.configure({ openOnClick: false }),
  TaskList, TaskItem.configure({ nested: true }),
  Table.configure({ resizable: false }), TableRow, TableCell, TableHeader]

export function NoteEditor({ note, folders, canEdit, onSave, saving }: {
  note: HubNote | null; folders: Folder[]; canEdit: boolean
  onSave: (p: { title: string; body: unknown; scope: NoteScope; folder_id: string | null }) => void
  saving: boolean
}) {
  const [title, setTitle] = useState(note?.title ?? '')
  const [scope, setScope] = useState<NoteScope>(note?.scope ?? 'private')
  const [folderId, setFolderId] = useState<string | null>(note?.folder_id ?? null)
  const editor = useEditor({
    extensions: EXT, editable: canEdit, immediatelyRender: false,
    content: (note?.body as object) ?? { type: 'doc', content: [] },
  }, [note?.id])

  useEffect(() => {
    setTitle(note?.title ?? ''); setScope(note?.scope ?? 'private'); setFolderId(note?.folder_id ?? null)
  }, [note?.id])

  if (!note) return <div style={{ flex: 1, display: 'grid', placeItems: 'center', color: '#9CA3AF' }}>Select or create a note</div>

  const save = () => onSave({ title, body: editor?.getJSON() ?? { type: 'doc', content: [] }, scope, folder_id: folderId })

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      <input value={title} onChange={e => setTitle(e.target.value)} onBlur={save} disabled={!canEdit}
        placeholder="Untitled Note"
        style={{ fontSize: 22, fontWeight: 800, border: 'none', outline: 'none', padding: '16px 20px 8px', fontFamily: 'var(--font-jakarta)' }} />
      <div style={{ display: 'flex', gap: 10, padding: '0 20px 10px', alignItems: 'center' }}>
        <select value={folderId ?? ''} onChange={e => { setFolderId(e.target.value || null); }} disabled={!canEdit}
          style={{ fontSize: 12, padding: '4px 8px', borderRadius: 8, border: '1px solid #E5E7EB' }}>
          <option value="">No folder</option>
          {folders.map(f => <option key={f.id} value={f.id}>{f.icon} {f.name}</option>)}
        </select>
        {(['private', 'team', 'sop'] as NoteScope[]).map(s => (
          <button key={s} type="button" disabled={!canEdit || (s === 'sop' && false)} onClick={() => setScope(s)}
            style={{ fontSize: 12, padding: '4px 12px', borderRadius: 99, border: 'none', cursor: 'pointer',
              background: scope === s ? '#DE1A1A' : '#F3F4F6', color: scope === s ? '#fff' : '#6B7280' }}>
            {s === 'private' ? 'Private' : s === 'team' ? 'Team' : 'SOP'}
          </button>
        ))}
      </div>
      <div style={{ border: '1px solid #F1F1F4', borderRadius: 14, margin: '0 16px 16px', display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
        {canEdit && <TiptapToolbar editor={editor} />}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }} onBlur={save}>
          <EditorContent editor={editor} />
        </div>
      </div>
      {canEdit && (
        <div style={{ padding: '10px 16px', borderTop: '1px solid #F1F1F4', display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={save} disabled={saving}
            style={{ background: '#DE1A1A', color: '#fff', border: 'none', borderRadius: 10, padding: '8px 20px', fontWeight: 700, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 5: Typecheck**

Run: `pnpm typecheck`
Expected: no errors in the new files.

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml components/notes/types.ts components/notes/tiptap-toolbar.tsx components/notes/note-editor.tsx
git commit -m "feat(notes): TipTap editor pane + toolbar"
```

---

### Task 7: Folder sidebar + notes list panes

**Files:**
- Create: `components/notes/folder-sidebar.tsx`
- Create: `components/notes/notes-list.tsx`

**Interfaces:**
- Produces:
  - `FolderSidebar` props: `{ folders: Folder[]; view: HubView; activeFolderId: string|null; onView: (v: HubView) => void; onFolder: (id: string|null) => void; onNewFolder: (name: string, scope: NoteScope) => void; isAdmin: boolean }` (imports `HubView` from `@/lib/notes/filter`).
  - `NotesList` props: `{ notes: HubNote[]; folders: Folder[]; activeId: string|null; sort: 'newest'|'oldest'|'edited'; onSort: (s: 'newest'|'oldest'|'edited') => void; onSelect: (id: string) => void }`.

- [ ] **Step 1: Create `folder-sidebar.tsx`**

```tsx
'use client'
import { useState } from 'react'
import { User, Globe, BookOpen, Star, Plus } from 'lucide-react'
import type { Folder, NoteScope } from './types'
import type { HubView } from '@/lib/notes/filter'

const TABS: { key: HubView; label: string; icon: React.ReactNode }[] = [
  { key: 'mine',   label: 'My Notes',       icon: <User size={15}/> },
  { key: 'team',   label: 'Team Notes',     icon: <Globe size={15}/> },
  { key: 'sop',    label: 'SOP Library',    icon: <BookOpen size={15}/> },
  { key: 'shared', label: 'Shared With Me', icon: <Star size={15}/> },
]

export function FolderSidebar({ folders, view, activeFolderId, onView, onFolder, onNewFolder, isAdmin }: {
  folders: Folder[]; view: HubView; activeFolderId: string | null
  onView: (v: HubView) => void; onFolder: (id: string | null) => void
  onNewFolder: (name: string, scope: NoteScope) => void; isAdmin: boolean
}) {
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const row = (active: boolean): React.CSSProperties => ({
    display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 10,
    cursor: 'pointer', fontSize: 13, fontWeight: 600,
    background: active ? 'rgba(222,26,26,0.08)' : 'transparent',
    color: active ? '#DE1A1A' : '#374151',
  })
  return (
    <div style={{ width: 240, flexShrink: 0, padding: 14, borderRight: '1px solid #F1F1F4', overflowY: 'auto' }}>
      <div style={{ fontSize: 12, fontWeight: 800, color: '#9CA3AF', padding: '4px 10px' }}>📂 FOLDERS</div>
      {TABS.map(t => (
        <div key={t.key} style={row(view === t.key && !activeFolderId)} onClick={() => onView(t.key)}>
          {t.icon}<span>{t.label}</span>
        </div>
      ))}
      <div style={{ height: 1, background: '#F1F1F4', margin: '10px 4px' }} />
      {folders.map(f => (
        <div key={f.id} style={row(activeFolderId === f.id)} onClick={() => onFolder(f.id)}>
          <span>{f.icon ?? '📁'}</span><span style={{ flex: 1 }}>{f.name}</span>
          <span style={{ fontSize: 11, color: '#9CA3AF' }}>{f.count}</span>
        </div>
      ))}
      {adding ? (
        <div style={{ display: 'flex', gap: 4, padding: '6px 4px' }}>
          <input autoFocus value={name} onChange={e => setName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && name.trim()) { onNewFolder(name.trim(), 'private'); setName(''); setAdding(false) } }}
            placeholder="Folder name" style={{ flex: 1, fontSize: 12, padding: '4px 8px', borderRadius: 8, border: '1px solid #E5E7EB' }} />
        </div>
      ) : (
        <div style={{ ...row(false), color: '#6B7280' }} onClick={() => setAdding(true)}>
          <Plus size={15}/><span>New Folder</span>
        </div>
      )}
    </div>
  )
}
```
(Note: scope selection for new folders defaults to `private`; admins selecting team/sop folders is a Phase-2 affordance. `isAdmin` is threaded now for that.)

- [ ] **Step 2: Create `notes-list.tsx`**

```tsx
'use client'
import { Pin, Bell, Lock, Globe, BookOpen } from 'lucide-react'
import type { HubNote, Folder } from './types'

const scopeBadge = (s: string) =>
  s === 'team' ? { icon: <Globe size={11}/>, label: 'Team', c: '#2563EB' }
  : s === 'sop' ? { icon: <BookOpen size={11}/>, label: 'SOP', c: '#7C3AED' }
  : { icon: <Lock size={11}/>, label: 'Private', c: '#6B7280' }

export function NotesList({ notes, folders, activeId, sort, onSort, onSelect }: {
  notes: HubNote[]; folders: Folder[]; activeId: string | null
  sort: 'newest' | 'oldest' | 'edited'; onSort: (s: 'newest' | 'oldest' | 'edited') => void
  onSelect: (id: string) => void
}) {
  const fname = (id: string | null) => folders.find(f => f.id === id)?.name ?? ''
  const sorted = [...notes].sort((a, b) =>
    sort === 'oldest' ? +new Date(a.created_at) - +new Date(b.created_at)
    : sort === 'edited' ? +new Date(b.updated_at) - +new Date(a.updated_at)
    : +new Date(b.created_at) - +new Date(a.created_at))
  return (
    <div style={{ width: 320, flexShrink: 0, borderRight: '1px solid #F1F1F4', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: 12 }}>
        <select value={sort} onChange={e => onSort(e.target.value as 'newest' | 'oldest' | 'edited')}
          style={{ fontSize: 12, padding: '4px 8px', borderRadius: 8, border: '1px solid #E5E7EB' }}>
          <option value="newest">Newest</option><option value="oldest">Oldest</option><option value="edited">Recently Edited</option>
        </select>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 12px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {sorted.map(n => {
          const b = scopeBadge(n.scope)
          return (
            <div key={n.id} onClick={() => onSelect(n.id)}
              style={{ background: activeId === n.id ? 'rgba(222,26,26,0.06)' : '#fff', borderRadius: 14,
                border: activeId === n.id ? '1px solid rgba(222,26,26,0.3)' : '1px solid #F1F1F4',
                padding: 12, cursor: 'pointer', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                <span style={{ fontWeight: 700, fontSize: 14, color: '#111' }}>{n.title || 'Untitled'}</span>
                {n.pinned && <Pin size={13} color="#DE1A1A" />}
              </div>
              <div style={{ fontSize: 12, color: '#9CA3AF', margin: '4px 0', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{n.content}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: '#9CA3AF' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: b.c }}>{b.icon}{b.label}</span>
                {fname(n.folder_id) && <span>· {fname(n.folder_id)}</span>}
                {n.reminder_at && !n.reminded && <Bell size={11} color="#F59E0B" />}
              </div>
            </div>
          )
        })}
        {sorted.length === 0 && <div style={{ textAlign: 'center', color: '#9CA3AF', fontSize: 13, padding: 20 }}>No notes here yet.</div>}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add components/notes/folder-sidebar.tsx components/notes/notes-list.tsx
git commit -m "feat(notes): folder sidebar + notes list panes"
```

---

### Task 8: Hub orchestrator component

**Files:**
- Create: `components/notes/notes-hub.tsx`

**Interfaces:**
- Consumes: all pane components, `filterNotes` (Task 4), the server actions (Task 5).
- Produces: `NotesHub` props: `{ initialNotes: HubNote[]; folders: Folder[]; teamMembers: TeamMember[]; viewer: { id: string; role: 'ADMIN'|'MEMBER' } }`.

- [ ] **Step 1: Create `notes-hub.tsx`**

```tsx
'use client'
import { useState, useTransition, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Search } from 'lucide-react'
import { FolderSidebar } from './folder-sidebar'
import { NotesList } from './notes-list'
import { NoteEditor } from './note-editor'
import { filterNotes, type HubView } from '@/lib/notes/filter'
import { canEditNote } from '@/lib/notes/access'
import { createNote, updateNote, createFolder } from '@/lib/actions/notes'
import type { HubNote, Folder, TeamMember, NoteScope } from './types'

export default function NotesHub({ initialNotes, folders, viewer }: {
  initialNotes: HubNote[]; folders: Folder[]; teamMembers: TeamMember[]
  viewer: { id: string; role: 'ADMIN' | 'MEMBER' }
}) {
  const router = useRouter()
  const [view, setView] = useState<HubView>('all')
  const [folderId, setFolderId] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<'newest' | 'oldest' | 'edited'>('newest')
  const [activeId, setActiveId] = useState<string | null>(null)
  const [saving, startSave] = useTransition()

  const visible = useMemo(() => filterNotes(
    initialNotes as never, { view, viewerId: viewer.id, folderId, q,
      folderName: id => folders.find(f => f.id === id)?.name ?? '' }) as unknown as HubNote[],
    [initialNotes, view, folderId, q, folders, viewer.id])

  const active = initialNotes.find(n => n.id === activeId) ?? null
  const canEdit = active ? canEditNote({ user_id: active.user_id, scope: active.scope }, viewer) : true

  const handleSave = (p: { title: string; body: unknown; scope: NoteScope; folder_id: string | null }) => {
    startSave(async () => {
      const input = { title: p.title, content: '', body: p.body, scope: p.scope, folder_id: p.folder_id,
        note_type: 'text' as const, items: [], labels: [] }
      if (active) await updateNote(active.id, input as never)
      else { const r = await createNote(input as never); if (r.success && r.id) setActiveId(r.id) }
      router.refresh()
    })
  }
  const handleNew = () => setActiveId(null)
  const handleNewFolder = (name: string, scope: NoteScope) =>
    startSave(async () => { await createFolder({ name, scope }); router.refresh() })

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: '#F8F9FC' }}>
      <div style={{ padding: '16px 20px', borderBottom: '1px solid #F1F1F4', display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: 22, fontWeight: 900, margin: 0, fontFamily: 'var(--font-jakarta)' }}>📒 Notes</h1>
          <p style={{ fontSize: 12, color: '#9CA3AF', margin: '2px 0 0' }}>Create, organize and collaborate on company knowledge.</p>
        </div>
        <div style={{ position: 'relative' }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#9CA3AF' }} />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search notes..."
            style={{ paddingLeft: 30, padding: '8px 12px 8px 30px', borderRadius: 10, border: '1px solid #E5E7EB', fontSize: 13, width: 240 }} />
        </div>
        <button onClick={handleNew}
          style={{ background: '#DE1A1A', color: '#fff', border: 'none', borderRadius: 10, padding: '9px 16px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Plus size={15}/> New Note
        </button>
      </div>
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <FolderSidebar folders={folders} view={view} activeFolderId={folderId}
          onView={v => { setView(v); setFolderId(null) }} onFolder={id => { setFolderId(id); setView('all') }}
          onNewFolder={handleNewFolder} isAdmin={viewer.role === 'ADMIN'} />
        <NotesList notes={visible} folders={folders} activeId={activeId} sort={sort} onSort={setSort} onSelect={setActiveId} />
        <NoteEditor note={active} folders={folders} canEdit={canEdit} onSave={handleSave} saving={saving} />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/notes/notes-hub.tsx
git commit -m "feat(notes): three-pane hub orchestrator"
```

---

### Task 9: Wire pages (member rewrite + admin new) + admin nav link

**Files:**
- Modify: `app/member/notes/page.tsx`
- Modify: `app/member/notes/notes-client.tsx` (delete — replaced by shared hub)
- Create: `app/admin/notes/page.tsx`
- Modify: `components/admin/sidebar.tsx`

**Interfaces:**
- Consumes: `getHubNotes`, `getFolders` (Task 5), `NotesHub` (Task 8).

- [ ] **Step 1: Rewrite `app/member/notes/page.tsx`**

```tsx
import { getHubNotes, getFolders } from '@/lib/actions/notes'
import { createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import NotesHub from '@/components/notes/notes-hub'

export const dynamic = 'force-dynamic'
function adminSupabase() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } })
}

export default async function MemberNotesPage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const admin = adminSupabase()
  const { data: profile } = await admin.from('users').select('company_id, role').eq('id', user.id).single()
  const [notes, folders, members] = await Promise.all([
    getHubNotes(), getFolders(),
    profile?.company_id
      ? admin.from('users').select('id, name, employee_id').eq('company_id', profile.company_id).eq('status', 'active').eq('role', 'MEMBER').order('name')
      : Promise.resolve({ data: [] as never[] }),
  ])
  return <NotesHub initialNotes={notes} folders={folders} teamMembers={(members.data ?? []) as never}
    viewer={{ id: user.id, role: (profile?.role as 'ADMIN' | 'MEMBER') ?? 'MEMBER' }} />
}
```

- [ ] **Step 2: Create `app/admin/notes/page.tsx`**

Same as Step 1 but the file lives under `app/admin/notes/page.tsx`. (Identical body — the hub is portal-agnostic; the only difference is the route group, which provides the admin layout/guard.)

- [ ] **Step 3: Delete the old client**

```bash
git rm app/member/notes/notes-client.tsx
```

- [ ] **Step 4: Add the admin nav link**

In `components/admin/sidebar.tsx`, import `StickyNote` from `lucide-react` if not present, and add to the nav array (place it near Announcements, mirroring the member sidebar):
```tsx
  { label: "Notes", href: "/admin/notes", icon: StickyNote },
```

- [ ] **Step 5: Add minimal TipTap content styling**

Append to `app/globals.css` so editor blocks render readably:
```css
.ProseMirror { outline: none; min-height: 240px; font-size: 14px; line-height: 1.6; }
.ProseMirror h1 { font-size: 1.5rem; font-weight: 800; margin: 0.6em 0 0.3em; }
.ProseMirror h2 { font-size: 1.25rem; font-weight: 700; margin: 0.5em 0 0.3em; }
.ProseMirror ul { list-style: disc; padding-left: 1.4em; }
.ProseMirror ol { list-style: decimal; padding-left: 1.4em; }
.ProseMirror blockquote { border-left: 3px solid #DE1A1A; padding-left: 12px; color: #6B7280; }
.ProseMirror ul[data-type="taskList"] { list-style: none; padding-left: 0; }
.ProseMirror ul[data-type="taskList"] li { display: flex; gap: 8px; align-items: flex-start; }
.ProseMirror table { border-collapse: collapse; width: 100%; }
.ProseMirror td, .ProseMirror th { border: 1px solid #E5E7EB; padding: 6px 8px; }
.ProseMirror a { color: #DE1A1A; text-decoration: underline; }
```

- [ ] **Step 6: Typecheck + lint + build**

Run: `pnpm typecheck && pnpm lint && pnpm build`
Expected: all pass; `/admin/notes` and `/member/notes` compile.

- [ ] **Step 7: Commit**

```bash
git add app/member/notes/page.tsx app/admin/notes/page.tsx components/admin/sidebar.tsx app/globals.css
git commit -m "feat(notes): wire hub pages for admin + member, add admin nav link"
```

---

### Task 10: Manual verification + push

**Files:** none (verification only)

- [ ] **Step 1: Run dev server and verify the flows**

Run: `pnpm dev`, then check:
- `/member/notes` loads the three-pane hub; existing personal notes appear under the **Personal** folder with their text intact.
- Create a note: type a title + rich content (heading, checklist, table), Save → it appears in the list and reopens identically after `router.refresh()`.
- Switch tabs (All / My Notes / Team Notes / SOP Library / Shared With Me) and confirm filtering.
- Create a folder; the note count updates when a note is assigned to it.
- As a MEMBER, an SOP note opens **read-only** (no toolbar / disabled save). As an ADMIN at `/admin/notes`, the same SOP note is editable.
- Search filters by title/content/label.

- [ ] **Step 2: Confirm verification with evidence**

Capture that typecheck/lint/build passed (Task 9 Step 6) and the manual flows above behaved as expected. If any fail, fix before pushing.

- [ ] **Step 3: Push to sajee (ask first, per workflow)**

Confirm with the user, then:
```bash
git push origin master:sajee
```
Then WhatsApp Sanjay to merge to master for production.

---

## Self-Review Notes

- **Spec coverage (Phase 1 scope):** scopes (T1,T3,T5), folders nested+counts+CRUD (T1,T5,T7), three-pane layout (T6–T8), tabs (T4,T7,T8), TipTap editor full toolbar (T6), search (T4,T8), migration of existing notes (T1), role-gated SOP edit (T3,T5,T6,T9), both portals + admin nav (T9). Reminders carried over unchanged (existing columns retained in T1; surfaced as a badge in T7). Phase 2 (sharing, @mentions) and Phase 3 (voice, calendar, export) are intentionally deferred to their own plans.
- **Type consistency:** `HubNoteRow`/`HubNote`, `FolderRow`/`Folder`, `NoteScope`, `HubView`, `canEditNote`, `extractPlainText`, `filterNotes` names are used identically across tasks.
- **Placeholder scan:** no TBD/TODO; all code steps contain concrete code. The `view:'mine'` semantics and new-folder default scope are documented inline where they could be ambiguous.
