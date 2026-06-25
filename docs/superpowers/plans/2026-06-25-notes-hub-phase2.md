# Notes Knowledge Hub — Phase 2 (Collaboration) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add note sharing (view/edit) with a "Shared With Me" surface, and @mentions that notify the tagged teammate.

**Architecture:** A new `note_shares` table records who a note is shared with and at what permission. Server actions create/remove shares and decorate hub notes with `shared`/`can_edit` flags using pure helpers. @mentions use TipTap's Mention node (inserted via a teammate picker — no inline suggestion popup) and, on save, diff the mention ids out of the document and fire notifications via the existing `insertManyNotifications`.

**Tech Stack:** Next.js 15 App Router, Supabase (service-role admin client in server actions), TipTap v3 (`@tiptap/extension-mention`), Vitest.

## Global Constraints

- Multi-tenant: every row carries `company_id`; server actions filter by the viewer's company.
- Server actions use the service-role admin client (matches existing `lib/actions/notes.ts`).
- Access rules live in `lib/notes/access.ts` (already built in Phase 1: `canEditNote` accepts `shareEdit`, `canReadNote` accepts `shared`). Reuse them — do not duplicate logic.
- Notifications via `insertManyNotifications` from `lib/actions/notifications.ts` (`{ companyId, userId, type, title, body?, link? }`).
- Red primary `#DE1A1A`; no external UI component libraries.
- Branch workflow: commit per task; push to `sajee` only after the whole phase is verified.

---

### Task 1: `note_shares` table migration

**Files:**
- Create: `supabase/migrations/084_note_shares.sql`

**Interfaces:**
- Produces: table `note_shares (id, company_id, note_id, shared_with, permission, shared_by, created_at)` with `UNIQUE(note_id, shared_with)`.

- [ ] **Step 1: Write the migration**

```sql
-- 084_note_shares.sql — Notes Hub Phase 2: sharing
CREATE TABLE IF NOT EXISTS note_shares (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL,
  note_id     uuid NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  shared_with uuid NOT NULL,
  permission  text NOT NULL DEFAULT 'view' CHECK (permission IN ('view','edit')),
  shared_by   uuid NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (note_id, shared_with)
);
CREATE INDEX IF NOT EXISTS idx_note_shares_user    ON note_shares (shared_with);
CREATE INDEX IF NOT EXISTS idx_note_shares_company ON note_shares (company_id);

ALTER TABLE note_shares ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_note_shares ON note_shares;
CREATE POLICY tenant_isolation_note_shares ON note_shares
  FOR ALL USING (company_id = (auth.jwt() ->> 'company_id')::uuid);
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/084_note_shares.sql
git commit -m "feat(notes): note_shares table for Phase 2 sharing"
```

(The migration is applied to the live DB at the verify step, Task 7 — not now.)

---

### Task 2: `extractMentionIds` pure helper (TDD)

**Files:**
- Create: `lib/notes/mentions.ts`
- Test: `lib/notes/mentions.test.ts`

**Interfaces:**
- Produces: `extractMentionIds(doc: unknown): string[]` — unique user ids from `mention` nodes anywhere in a TipTap doc.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest'
import { extractMentionIds } from './mentions'

describe('extractMentionIds', () => {
  it('collects unique mention ids from nested content', () => {
    const doc = { type: 'doc', content: [
      { type: 'paragraph', content: [
        { type: 'text', text: 'hi ' },
        { type: 'mention', attrs: { id: 'u1', label: 'Rahul' } },
        { type: 'mention', attrs: { id: 'u2', label: 'Punith' } },
      ]},
      { type: 'paragraph', content: [{ type: 'mention', attrs: { id: 'u1', label: 'Rahul' } }] },
    ]}
    expect(extractMentionIds(doc).sort()).toEqual(['u1', 'u2'])
  })
  it('returns [] for docs with no mentions or bad input', () => {
    expect(extractMentionIds({ type: 'doc', content: [{ type: 'paragraph' }] })).toEqual([])
    expect(extractMentionIds(null)).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test lib/notes/mentions.test.ts`
Expected: FAIL ("extractMentionIds is not a function" / module not found)

- [ ] **Step 3: Write the implementation**

```typescript
type Node = { type?: string; attrs?: { id?: string }; content?: Node[] }

export function extractMentionIds(doc: unknown): string[] {
  const ids = new Set<string>()
  const walk = (n: Node | null | undefined) => {
    if (!n || typeof n !== 'object') return
    if (n.type === 'mention' && n.attrs?.id) ids.add(n.attrs.id)
    n.content?.forEach(walk)
  }
  walk(doc as Node)
  return [...ids]
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test lib/notes/mentions.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/notes/mentions.ts lib/notes/mentions.test.ts
git commit -m "feat(notes): extractMentionIds helper (TDD)"
```

---

### Task 3: `noteShareState` pure helper (TDD)

**Files:**
- Create: `lib/notes/shares.ts`
- Test: `lib/notes/shares.test.ts`

**Interfaces:**
- Consumes: `canEditNote` from `lib/notes/access.ts`.
- Produces:
  - `indexShares(rows: { note_id: string; permission: 'view' | 'edit' }[]): Map<string, 'view' | 'edit'>`
  - `noteShareState(note: { id: string; user_id: string; scope: 'private'|'team'|'sop' }, shareMap: Map<string,'view'|'edit'>, viewer: { id: string; role: 'ADMIN'|'MEMBER' }): { shared: boolean; can_edit: boolean }`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest'
import { indexShares, noteShareState } from './shares'

const viewer = { id: 'me', role: 'MEMBER' as const }

describe('noteShareState', () => {
  it('marks a note shared to me (not my own) and respects edit permission', () => {
    const map = indexShares([{ note_id: 'n1', permission: 'edit' }, { note_id: 'n2', permission: 'view' }])
    expect(noteShareState({ id: 'n1', user_id: 'other', scope: 'private' }, map, viewer)).toEqual({ shared: true, can_edit: true })
    expect(noteShareState({ id: 'n2', user_id: 'other', scope: 'private' }, map, viewer)).toEqual({ shared: true, can_edit: false })
  })
  it('does not mark my own note as shared', () => {
    const map = indexShares([{ note_id: 'n3', permission: 'edit' }])
    expect(noteShareState({ id: 'n3', user_id: 'me', scope: 'private' }, map, viewer)).toEqual({ shared: false, can_edit: true })
  })
  it('unshared note: not shared, edit by normal scope rules', () => {
    const map = indexShares([])
    expect(noteShareState({ id: 'n4', user_id: 'other', scope: 'team' }, map, viewer)).toEqual({ shared: false, can_edit: false })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test lib/notes/shares.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 3: Write the implementation**

```typescript
import { canEditNote } from './access'

export function indexShares(rows: { note_id: string; permission: 'view' | 'edit' }[]): Map<string, 'view' | 'edit'> {
  const m = new Map<string, 'view' | 'edit'>()
  for (const r of rows) m.set(r.note_id, r.permission)
  return m
}

export function noteShareState(
  note: { id: string; user_id: string; scope: 'private' | 'team' | 'sop' },
  shareMap: Map<string, 'view' | 'edit'>,
  viewer: { id: string; role: 'ADMIN' | 'MEMBER' },
): { shared: boolean; can_edit: boolean } {
  const perm = shareMap.get(note.id)
  const shared = perm !== undefined && note.user_id !== viewer.id
  const can_edit = canEditNote({ user_id: note.user_id, scope: note.scope, shareEdit: perm === 'edit' }, viewer)
  return { shared, can_edit }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test lib/notes/shares.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/notes/shares.ts lib/notes/shares.test.ts
git commit -m "feat(notes): noteShareState/indexShares helpers (TDD)"
```

---

### Task 4: Sharing + mention server actions

**Files:**
- Modify: `lib/actions/notes.ts`

**Interfaces:**
- Consumes: `getViewer()`, `adminSupabase()`, `extractMentionIds`, `indexShares`, `noteShareState`, `insertManyNotifications`.
- Produces:
  - `shareNote(noteId: string, userIds: string[], permission: 'view'|'edit'): Promise<{ success: boolean; error?: string }>`
  - `unshareNote(noteId: string, userId: string): Promise<{ success: boolean; error?: string }>`
  - `getNoteShares(noteId: string): Promise<{ shared_with: string; permission: 'view'|'edit' }[]>`
  - `getHubNotes()` now decorates every row with real `shared` + `can_edit`, and ADDITIONALLY returns private notes shared with the viewer.
  - `updateNote()` fires mention notifications for newly-added mention ids.

- [ ] **Step 1: Add imports at top of `lib/actions/notes.ts`** (after the existing access import)

```typescript
import { extractMentionIds } from '@/lib/notes/mentions'
import { indexShares, noteShareState } from '@/lib/notes/shares'
import { insertManyNotifications } from '@/lib/actions/notifications'
```

- [ ] **Step 2: Replace the body of `getHubNotes` with a share-aware version**

Find the existing `export async function getHubNotes(): Promise<HubNoteRow[]>` and replace its body with:

```typescript
export async function getHubNotes(): Promise<HubNoteRow[]> {
  const v = await getViewer()
  if (!v) return []
  const admin = adminSupabase()

  const { data: shareRows } = await admin
    .from('note_shares').select('note_id, permission').eq('shared_with', v.id)
  const shareMap = indexShares((shareRows ?? []) as { note_id: string; permission: 'view' | 'edit' }[])
  const sharedIds = [...shareMap.keys()]

  const cols = 'id, title, content, color, pinned, reminder_at, reminded, reminder_recipients, reminder_message, note_type, items, labels, archived, scope, folder_id, body, created_by, user_id, created_at, updated_at'
  const visibleFilter = `scope.in.(team,sop),and(scope.eq.private,user_id.eq.${v.id})`
    + (sharedIds.length ? `,id.in.(${sharedIds.join(',')})` : '')

  const { data: rows } = await admin
    .from('notes').select(cols)
    .eq('company_id', v.companyId).eq('archived', false)
    .or(visibleFilter)
    .order('pinned', { ascending: false })
    .order('updated_at', { ascending: false })

  return (rows ?? []).map(r => {
    const state = noteShareState({ id: r.id, user_id: r.user_id, scope: r.scope }, shareMap, { id: v.id, role: v.role })
    return { ...r, ...state }
  }) as HubNoteRow[]
}
```

- [ ] **Step 3: Add the share actions** (append after `getHubNotes`)

```typescript
export async function getNoteShares(noteId: string): Promise<{ shared_with: string; permission: 'view' | 'edit' }[]> {
  const v = await getViewer()
  if (!v) return []
  const admin = adminSupabase()
  const { data } = await admin.from('note_shares')
    .select('shared_with, permission').eq('note_id', noteId).eq('company_id', v.companyId)
  return (data ?? []) as { shared_with: string; permission: 'view' | 'edit' }[]
}

export async function shareNote(
  noteId: string, userIds: string[], permission: 'view' | 'edit',
): Promise<{ success: boolean; error?: string }> {
  const v = await getViewer()
  if (!v) return { success: false, error: 'Not authenticated' }
  if (!userIds.length) return { success: true }
  const admin = adminSupabase()

  const { data: note } = await admin.from('notes')
    .select('user_id, scope, company_id, title').eq('id', noteId).single()
  if (!note || note.company_id !== v.companyId) return { success: false, error: 'Note not found' }
  if (!canEditNote({ user_id: note.user_id, scope: note.scope as NoteScope }, { id: v.id, role: v.role })) {
    return { success: false, error: 'Only the owner can share this note' }
  }

  const { error } = await admin.from('note_shares').upsert(
    userIds.map(uid => ({ company_id: v.companyId, note_id: noteId, shared_with: uid, permission, shared_by: v.id })),
    { onConflict: 'note_id,shared_with' },
  )
  if (error) return { success: false, error: error.message }

  await insertManyNotifications(userIds.map(uid => ({
    companyId: v.companyId, userId: uid, type: 'note_share',
    title: 'A note was shared with you', body: note.title ?? 'Untitled note',
    link: '/member/notes',
  })))
  revalidatePath('/member/notes'); revalidatePath('/admin/notes')
  return { success: true }
}

export async function unshareNote(noteId: string, userId: string): Promise<{ success: boolean; error?: string }> {
  const v = await getViewer()
  if (!v) return { success: false, error: 'Not authenticated' }
  const admin = adminSupabase()
  const { error } = await admin.from('note_shares')
    .delete().eq('note_id', noteId).eq('shared_with', userId).eq('company_id', v.companyId)
  if (error) return { success: false, error: error.message }
  revalidatePath('/member/notes'); revalidatePath('/admin/notes')
  return { success: true }
}
```

- [ ] **Step 4: Fire mention notifications in `updateNote`**

In `updateNote`, after the successful `update(...)` (right before `revalidatePath`), add mention notification logic. Replace the tail of `updateNote`:

```typescript
  if (error) return { success: false, error: error.message }

  // Notify newly-added mentions (diff against the previous body)
  const prevIds = extractMentionIds(existing.body)
  const newIds = extractMentionIds(bodyJson).filter(id => !prevIds.includes(id) && id !== v.id)
  if (newIds.length) {
    await insertManyNotifications(newIds.map(uid => ({
      companyId: v.companyId, userId: uid, type: 'note_mention',
      title: 'You were mentioned in a note', body: input.title?.trim() || 'Untitled note',
      link: '/member/notes',
    })))
  }

  revalidatePath('/member/notes'); revalidatePath('/admin/notes')
  return { success: true }
```

- [ ] **Step 5: Typecheck (narrow) + commit**

Create a temporary `tsconfig.check.json` at repo root including `lib/notes/**/*.ts`, `lib/actions/notes.ts`, `components/notes/**/*.tsx`, then:

Run: `npx tsc --noEmit -p tsconfig.check.json`
Expected: exit 0, no output. Delete the temp config afterward.

```bash
git add lib/actions/notes.ts
git commit -m "feat(notes): share + mention server actions, share-aware hub fetch"
```

---

### Task 5: TipTap Mention node + Share popup + bottom action bar

**Files:**
- Modify: `components/notes/note-editor.tsx`
- Create: `components/notes/share-popup.tsx`
- Create: `components/notes/mention-picker.tsx`
- Modify: `components/notes/notes-hub.tsx` (pass `teamMembers` + viewer to editor; render share popup)

**Interfaces:**
- Consumes: `shareNote`, `getNoteShares`, `unshareNote` from `lib/actions/notes`; `TeamMember` from `./types`.
- Produces: `<SharePopup note teamMembers onClose />`, `<MentionPicker teamMembers onPick />`, and a Mention extension wired into the editor.

- [ ] **Step 1: Install the mention extension**

Run: `pnpm add @tiptap/extension-mention`
Expected: adds `@tiptap/extension-mention@3.x`.

- [ ] **Step 2: Add the Mention node to the editor extensions**

In `components/notes/note-editor.tsx`, add the import and extend `EXT`:

```typescript
import Mention from '@tiptap/extension-mention'
```

Add to the `EXT` array (suggestion disabled — we insert via the picker):

```typescript
  Mention.configure({
    HTMLAttributes: { class: 'note-mention' },
    renderText: ({ node }) => `@${node.attrs.label ?? node.attrs.id}`,
  }),
```

- [ ] **Step 3: Create the mention picker**

`components/notes/mention-picker.tsx`:

```tsx
'use client'
import { useState } from 'react'
import type { TeamMember } from './types'

export function MentionPicker({ teamMembers, onPick, onClose }: {
  teamMembers: TeamMember[]; onPick: (m: TeamMember) => void; onClose: () => void
}) {
  const [q, setQ] = useState('')
  const list = teamMembers.filter(m => m.name.toLowerCase().includes(q.toLowerCase()))
  return (
    <div style={{ position: 'absolute', bottom: 52, left: 16, width: 240, background: '#fff', borderRadius: 12,
      boxShadow: '0 8px 28px rgba(0,0,0,0.18)', border: '1px solid #F1F1F4', zIndex: 20, padding: 8 }}>
      <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Mention teammate…"
        onKeyDown={e => { if (e.key === 'Escape') onClose() }}
        style={{ width: '100%', padding: '6px 8px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13, marginBottom: 6 }} />
      <div style={{ maxHeight: 180, overflowY: 'auto' }}>
        {list.map(m => (
          <div key={m.id} onClick={() => onPick(m)}
            style={{ padding: '7px 8px', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#F9FAFB'}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>
            {m.name} <span style={{ color: '#9CA3AF', fontSize: 11 }}>#{m.employee_id}</span>
          </div>
        ))}
        {list.length === 0 && <div style={{ padding: 8, color: '#9CA3AF', fontSize: 12 }}>No matches</div>}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Create the share popup**

`components/notes/share-popup.tsx`:

```tsx
'use client'
import { useEffect, useState, useTransition } from 'react'
import { X } from 'lucide-react'
import { shareNote, unshareNote, getNoteShares } from '@/lib/actions/notes'
import type { TeamMember } from './types'

export function SharePopup({ noteId, teamMembers, onClose }: {
  noteId: string; teamMembers: TeamMember[]; onClose: () => void
}) {
  const [shares, setShares] = useState<{ shared_with: string; permission: 'view' | 'edit' }[]>([])
  const [picked, setPicked] = useState<Record<string, boolean>>({})
  const [perm, setPerm] = useState<'view' | 'edit'>('view')
  const [busy, start] = useTransition()
  const nameOf = (id: string) => teamMembers.find(m => m.id === id)?.name ?? id

  useEffect(() => { getNoteShares(noteId).then(setShares) }, [noteId])

  const doShare = () => start(async () => {
    const ids = Object.keys(picked).filter(k => picked[k])
    if (ids.length) await shareNote(noteId, ids, perm)
    setPicked({}); setShares(await getNoteShares(noteId))
  })
  const remove = (uid: string) => start(async () => { await unshareNote(noteId, uid); setShares(await getNoteShares(noteId)) })

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 50, display: 'grid', placeItems: 'center' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ width: 380, background: '#fff', borderRadius: 16, padding: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <strong style={{ fontSize: 15 }}>Share note</strong>
          <button onClick={onClose} style={{ border: 'none', background: 'transparent', cursor: 'pointer' }}><X size={16} /></button>
        </div>
        <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
          {(['view', 'edit'] as const).map(p => (
            <button key={p} onClick={() => setPerm(p)}
              style={{ fontSize: 12, padding: '4px 12px', borderRadius: 99, border: 'none', cursor: 'pointer',
                background: perm === p ? '#DE1A1A' : '#F3F4F6', color: perm === p ? '#fff' : '#6B7280' }}>
              {p === 'view' ? 'Can view' : 'Can edit'}
            </button>
          ))}
        </div>
        <div style={{ maxHeight: 180, overflowY: 'auto', border: '1px solid #F1F1F4', borderRadius: 10, padding: 6, marginBottom: 10 }}>
          {teamMembers.map(m => (
            <label key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 6px', fontSize: 13, cursor: 'pointer' }}>
              <input type="checkbox" checked={!!picked[m.id]} onChange={e => setPicked(p => ({ ...p, [m.id]: e.target.checked }))} />
              {m.name}
            </label>
          ))}
        </div>
        <button onClick={doShare} disabled={busy}
          style={{ width: '100%', background: '#DE1A1A', color: '#fff', border: 'none', borderRadius: 10, padding: '9px', fontWeight: 700, cursor: 'pointer', opacity: busy ? 0.6 : 1 }}>
          Share Note
        </button>
        {shares.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 11, color: '#9CA3AF', marginBottom: 4 }}>SHARED WITH</div>
            {shares.map(s => (
              <div key={s.shared_with} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, padding: '3px 0' }}>
                <span>{nameOf(s.shared_with)} <span style={{ color: '#9CA3AF', fontSize: 11 }}>· {s.permission}</span></span>
                <button onClick={() => remove(s.shared_with)} style={{ border: 'none', background: 'transparent', color: '#DE1A1A', cursor: 'pointer', fontSize: 12 }}>Remove</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Add bottom action bar + wire picker/share into the editor**

In `components/notes/note-editor.tsx`: add props `teamMembers: TeamMember[]` and `onShare: () => void`; add an `AtSign` + `Share2` import from `lucide-react`; add state `const [showMention, setShowMention] = useState(false)`. Insert a mention via:

```tsx
const insertMention = (m: TeamMember) => {
  editor?.chain().focus().insertContent({ type: 'mention', attrs: { id: m.id, label: m.name } }).insertContent(' ').run()
  setShowMention(false)
}
```

Replace the existing bottom Save bar block with a sticky action bar (keep Save behavior):

```tsx
{canEdit && (
  <div style={{ position: 'relative', padding: '10px 16px', borderTop: '1px solid #F1F1F4', display: 'flex', alignItems: 'center', gap: 8 }}>
    <button type="button" onClick={() => setShowMention(s => !s)} title="Mention"
      style={{ display: 'flex', alignItems: 'center', gap: 5, background: '#F3F4F6', border: 'none', borderRadius: 8, padding: '7px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', color: '#374151' }}>
      <AtSign size={14} /> Mention
    </button>
    {note.id && (
      <button type="button" onClick={onShare} title="Share"
        style={{ display: 'flex', alignItems: 'center', gap: 5, background: '#F3F4F6', border: 'none', borderRadius: 8, padding: '7px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', color: '#374151' }}>
        <Share2 size={14} /> Share
      </button>
    )}
    <div style={{ flex: 1 }} />
    <button onClick={save} disabled={saving}
      style={{ background: '#DE1A1A', color: '#fff', border: 'none', borderRadius: 10, padding: '8px 20px', fontWeight: 700, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
      {saving ? 'Saving…' : 'Save'}
    </button>
    {showMention && <MentionPicker teamMembers={teamMembers} onPick={insertMention} onClose={() => setShowMention(false)} />}
  </div>
)}
```

Add imports in `note-editor.tsx`:

```tsx
import { AtSign, Share2 } from 'lucide-react'
import { MentionPicker } from './mention-picker'
import type { TeamMember } from './types'
```

- [ ] **Step 6: Wire editor props + share popup in `notes-hub.tsx`**

Pass `teamMembers` into `NotesHub`'s props (already received), add `const [sharing, setSharing] = useState<string | null>(null)`, pass `teamMembers={teamMembers}` and `onShare={() => active && setSharing(active.id)}` to `<NoteEditor>`, and render at the end of the hub JSX:

```tsx
{sharing && <SharePopup noteId={sharing} teamMembers={teamMembers} onClose={() => setSharing(null)} />}
```

Add imports:

```tsx
import { SharePopup } from './share-popup'
```

- [ ] **Step 7: Add mention CSS**

Append to `app/globals.css`:

```css
.ProseMirror .note-mention { background: rgba(222,26,26,0.1); color: #DE1A1A; border-radius: 6px; padding: 0 4px; font-weight: 600; }
```

- [ ] **Step 8: Build + lint**

Run: `pnpm build`
Expected: exit 0, `/admin/notes` and `/member/notes` compile.
Run: `npx eslint components/notes lib/notes lib/actions/notes.ts`
Expected: exit 0.

- [ ] **Step 9: Commit**

```bash
git add components/notes package.json pnpm-lock.yaml app/globals.css
git commit -m "feat(notes): mention picker, share popup, bottom action bar"
```

---

### Task 6: Verify "Shared With Me" + reminders carryover

**Files:** none (verification only — the `shared` view already exists in `lib/notes/filter.ts` and is now populated by Task 4).

- [ ] **Step 1: Confirm filter wiring**

Read `lib/notes/filter.ts` and confirm `view === 'shared'` returns `notes.filter(n => !!n.shared)`. `getHubNotes` (Task 4) now sets `shared` truthfully, so the "Shared With Me" tab populates with no further change. No code edit expected.

- [ ] **Step 2: Run the full notes unit suite**

Run: `pnpm test lib/notes/`
Expected: PASS (Phase 1's 14 + Task 2's 2 + Task 3's 3 = 19 tests).

---

### Task 7: Apply migration, verify, push

- [ ] **Step 1: Apply `084_note_shares.sql` to the live Supabase project** (`bxyozelldqerlvtjwsai`) via the Supabase tool, then verify the table exists:

```sql
SELECT count(*) FROM information_schema.tables WHERE table_name = 'note_shares';
```
Expected: `1`.

- [ ] **Step 2: Dev-server smoke check**

Run `pnpm dev`; request `/member/notes` and `/admin/notes` — expect 307 (redirect to login), no 500. Hand to the user for an authenticated click-through (share a note, confirm it appears under the recipient's "Shared With Me"; @mention a teammate, confirm a notification).

- [ ] **Step 3: Push to sajee** (after user confirms)

```bash
git push origin master:sajee
```

---

## Self-Review

**Spec coverage (Phase 2 items in `2026-06-25-notes-knowledge-hub-design.md`):**
- Sharing view/edit → Tasks 1, 4, 5. ✓
- "Shared With Me" → Task 4 (`getHubNotes` shared decoration) + Task 6 (filter already wired). ✓
- @mentions → notifications → Tasks 2, 4 (notify), 5 (insert UI). ✓
- Share notifications → Task 4 (`shareNote` → `insertManyNotifications`). ✓
- Reminders carryover → unchanged from Phase 1 (existing columns + cron); noted in Task 6. ✓

**Placeholder scan:** No TBD/TODO; every code step shows complete code. ✓

**Type consistency:** `shareNote(noteId, userIds, permission)`, `unshareNote(noteId, userId)`, `getNoteShares(noteId)`, `noteShareState(note, shareMap, viewer)`, `indexShares(rows)`, `extractMentionIds(doc)` — names/signatures identical across Tasks 2–5. `note_shares` columns identical between Task 1 SQL and Task 4 queries (`note_id, shared_with, permission, shared_by, company_id`). ✓
