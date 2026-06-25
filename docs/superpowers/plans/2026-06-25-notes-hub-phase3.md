# Notes Knowledge Hub — Phase 3 (Rich Media) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use `- [ ]` checkboxes.

**Goal:** Add voice notes (record → upload → playback), a calendar view of reminder-bearing notes, and PDF/Word export.

**Architecture:** A new `note_attachments` table stores audio attachments (Supabase Storage `documents` bucket, public URL, matching the existing documents-upload pattern). Pure helpers handle the month grid, note bucketing, and export filename/HTML so they are unit-tested. Voice recording uses the browser `MediaRecorder`; export is fully client-side (print window for PDF, HTML `.doc` Blob for Word).

**Tech Stack:** Next.js 15, Supabase Storage (service-role admin client), browser MediaRecorder, Vitest.

## Global Constraints

- Multi-tenant: every row carries `company_id`; actions filter by viewer company.
- Server actions / API routes use the service-role admin client (matches `app/api/documents/upload/route.ts`).
- Reuse the existing public `documents` storage bucket; audio path `note-audio/{company_id}/{note_id}/{ts}.webm`.
- Voice + share require a saved note (note.id present), same as Phase 2 sharing.
- Red primary `#DE1A1A`; no external UI component libraries; no new heavy deps (no jsPDF/docx libs — export is hand-rolled).
- Commit per task; push to `sajee` only after the whole phase verifies.

---

### Task 1: `note_attachments` migration

**Files:** Create `supabase/migrations/085_note_attachments.sql`

- [ ] **Step 1: Write the migration**

```sql
-- 085_note_attachments.sql — Notes Hub Phase 3: attachments (voice notes)
CREATE TABLE IF NOT EXISTS note_attachments (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  note_id    uuid NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  type       text NOT NULL CHECK (type IN ('audio','file')),
  url        text NOT NULL,
  filename   text,
  duration   int,
  size       int,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_note_attachments_note ON note_attachments (note_id);

ALTER TABLE note_attachments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_note_attachments ON note_attachments;
CREATE POLICY tenant_isolation_note_attachments ON note_attachments
  FOR ALL USING (company_id = (auth.jwt() ->> 'company_id')::uuid);
```

- [ ] **Step 2: Commit** — `git add supabase/migrations/085_note_attachments.sql && git commit -m "feat(notes): note_attachments table for Phase 3"`

---

### Task 2: Calendar pure helpers (TDD)

**Files:** Create `lib/notes/calendar.ts`, Test `lib/notes/calendar.test.ts`

**Interfaces:**
- `monthMatrix(year: number, month: number): (Date | null)[][]` — weeks (Sun-start) of 7 cells; out-of-month cells are `null`.
- `bucketByDay(notes: { id: string; reminder_at: string | null }[]): Record<string, string[]>` — `YYYY-MM-DD` → note ids.

- [ ] **Step 1: Failing test**

```typescript
import { describe, it, expect } from 'vitest'
import { monthMatrix, bucketByDay } from './calendar'

describe('monthMatrix', () => {
  it('June 2026 starts on Monday and has the 1st in row 0 col 1', () => {
    const m = monthMatrix(2026, 5) // month is 0-based: 5 = June
    expect(m[0][0]).toBeNull()                 // Sunday before the 1st
    expect(m[0][1]?.getDate()).toBe(1)         // Mon Jun 1
    expect(m.every(w => w.length === 7)).toBe(true)
  })
})

describe('bucketByDay', () => {
  it('groups note ids by their reminder local date and skips null', () => {
    const out = bucketByDay([
      { id: 'a', reminder_at: '2026-06-10T09:00:00.000Z' },
      { id: 'b', reminder_at: '2026-06-10T15:00:00.000Z' },
      { id: 'c', reminder_at: null },
    ])
    expect(out['2026-06-10']?.sort()).toEqual(['a', 'b'])
    expect(Object.values(out).flat()).not.toContain('c')
  })
})
```

- [ ] **Step 2: Run → fail.** `pnpm exec vitest run lib/notes/calendar.test.ts`

- [ ] **Step 3: Implement**

```typescript
export function monthMatrix(year: number, month: number): (Date | null)[][] {
  const first = new Date(year, month, 1)
  const startDow = first.getDay() // 0 = Sun
  const daysIn = new Date(year, month + 1, 0).getDate()
  const cells: (Date | null)[] = []
  for (let i = 0; i < startDow; i++) cells.push(null)
  for (let d = 1; d <= daysIn; d++) cells.push(new Date(year, month, d))
  while (cells.length % 7 !== 0) cells.push(null)
  const weeks: (Date | null)[][] = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
  return weeks
}

export function bucketByDay(notes: { id: string; reminder_at: string | null }[]): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  for (const n of notes) {
    if (!n.reminder_at) continue
    const d = new Date(n.reminder_at)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    ;(out[key] ??= []).push(n.id)
  }
  return out
}
```

> Note: the June-2026 test asserts the 1st lands in column 1 (Monday). The helper uses `getDay()` so the test runs in the repo's local TZ consistently; `bucketByDay` keys by local date to match how reminders are displayed.

- [ ] **Step 4: Run → pass.**
- [ ] **Step 5: Commit** — `git add lib/notes/calendar.* && git commit -m "feat(notes): calendar month-grid helpers (TDD)"`

---

### Task 3: Export pure helpers (TDD)

**Files:** Create `lib/notes/export.ts`, Test `lib/notes/export.test.ts`

**Interfaces:**
- `exportFilename(title: string | null, ext: 'pdf' | 'doc'): string` — slugged title + extension, fallback `note`.
- `buildWordDocument(title: string, bodyHtml: string): string` — a complete HTML document string suitable for a `.doc` Blob.

- [ ] **Step 1: Failing test**

```typescript
import { describe, it, expect } from 'vitest'
import { exportFilename, buildWordDocument } from './export'

describe('exportFilename', () => {
  it('slugs the title and appends extension', () => {
    expect(exportFilename('Meeting With Client!', 'pdf')).toBe('meeting-with-client.pdf')
    expect(exportFilename('  ', 'doc')).toBe('note.doc')
    expect(exportFilename(null, 'doc')).toBe('note.doc')
  })
})

describe('buildWordDocument', () => {
  it('wraps body in a full HTML doc containing the title', () => {
    const html = buildWordDocument('Hello', '<p>World</p>')
    expect(html).toContain('<html')
    expect(html).toContain('Hello')
    expect(html).toContain('<p>World</p>')
  })
})
```

- [ ] **Step 2: Run → fail.**

- [ ] **Step 3: Implement**

```typescript
export function exportFilename(title: string | null, ext: 'pdf' | 'doc'): string {
  const slug = (title ?? '').toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return `${slug || 'note'}.${ext}`
}

export function buildWordDocument(title: string, bodyHtml: string): string {
  return `<!DOCTYPE html><html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"><title>${title}</title></head><body><h1>${title}</h1>${bodyHtml}</body></html>`
}
```

- [ ] **Step 4: Run → pass.**
- [ ] **Step 5: Commit** — `git add lib/notes/export.* && git commit -m "feat(notes): export filename + Word document helpers (TDD)"`

---

### Task 4: Attachment server actions + audio upload route

**Files:** Modify `lib/actions/notes.ts`; Create `app/api/notes/audio/route.ts`

**Interfaces:**
- `getAttachments(noteId: string): Promise<{ id: string; type: 'audio'|'file'; url: string; filename: string|null; duration: number|null }[]>`
- `addAudioAttachment(noteId: string, url: string, duration: number, filename: string): Promise<{ success: boolean; error?: string }>`
- `deleteAttachment(id: string): Promise<{ success: boolean; error?: string }>`
- POST `/api/notes/audio` (multipart: `file`, `noteId`) → `{ url }`

- [ ] **Step 1: Add actions** (append to `lib/actions/notes.ts`)

```typescript
export async function getAttachments(noteId: string): Promise<{ id: string; type: 'audio' | 'file'; url: string; filename: string | null; duration: number | null }[]> {
  const v = await getViewer()
  if (!v) return []
  const admin = adminSupabase()
  const { data } = await admin.from('note_attachments')
    .select('id, type, url, filename, duration').eq('note_id', noteId).eq('company_id', v.companyId)
    .order('created_at')
  return (data ?? []) as { id: string; type: 'audio' | 'file'; url: string; filename: string | null; duration: number | null }[]
}

export async function addAudioAttachment(noteId: string, url: string, duration: number, filename: string): Promise<{ success: boolean; error?: string }> {
  const v = await getViewer()
  if (!v) return { success: false, error: 'Not authenticated' }
  const admin = adminSupabase()
  const { data: note } = await admin.from('notes').select('user_id, scope, company_id').eq('id', noteId).single()
  if (!note || note.company_id !== v.companyId) return { success: false, error: 'Note not found' }
  if (!canEditNote({ user_id: note.user_id, scope: note.scope as NoteScope }, { id: v.id, role: v.role })) {
    return { success: false, error: 'You cannot attach to this note' }
  }
  const { error } = await admin.from('note_attachments').insert({
    company_id: v.companyId, note_id: noteId, type: 'audio', url, duration, filename,
  })
  if (error) return { success: false, error: error.message }
  revalidatePath('/member/notes'); revalidatePath('/admin/notes')
  return { success: true }
}

export async function deleteAttachment(id: string): Promise<{ success: boolean; error?: string }> {
  const v = await getViewer()
  if (!v) return { success: false, error: 'Not authenticated' }
  const admin = adminSupabase()
  const { error } = await admin.from('note_attachments').delete().eq('id', id).eq('company_id', v.companyId)
  if (error) return { success: false, error: error.message }
  revalidatePath('/member/notes'); revalidatePath('/admin/notes')
  return { success: true }
}
```

- [ ] **Step 2: Create the upload route** `app/api/notes/audio/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'

function adminSupabase() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } })
}

export async function POST(req: NextRequest) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const admin = adminSupabase()
  const { data: profile } = await admin.from('users').select('company_id').eq('id', user.id).single()
  if (!profile?.company_id) return NextResponse.json({ error: 'No company' }, { status: 403 })

  const form = await req.formData()
  const file = form.get('file') as File | null
  const noteId = form.get('noteId') as string
  if (!file || !noteId) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  if (file.size > 10 * 1024 * 1024) return NextResponse.json({ error: 'Audio too large (max 10MB)' }, { status: 400 })

  const path = `note-audio/${profile.company_id}/${noteId}/${Date.now()}.webm`
  const buffer = Buffer.from(await file.arrayBuffer())
  const { error: upErr } = await admin.storage.from('documents').upload(path, buffer, { contentType: file.type || 'audio/webm', upsert: false })
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })
  const { data: { publicUrl } } = admin.storage.from('documents').getPublicUrl(path)
  return NextResponse.json({ url: publicUrl })
}
```

- [ ] **Step 3: Narrow typecheck + commit** (temp `tsconfig.check.json` incl. `app/api/notes/**`, `lib/actions/notes.ts`) → `npx tsc --noEmit -p tsconfig.check.json` expect exit 0.

```bash
git add lib/actions/notes.ts app/api/notes/audio/route.ts
git commit -m "feat(notes): attachment actions + audio upload route"
```

---

### Task 5: Voice recorder, calendar view, export menu components

**Files:** Create `components/notes/voice-recorder.tsx`, `components/notes/calendar-view.tsx`, `components/notes/export-menu.tsx`

- [ ] **Step 1: Voice recorder** `components/notes/voice-recorder.tsx`

```tsx
'use client'
import { useEffect, useRef, useState } from 'react'
import { Mic, Square, Play, Trash2, Loader2 } from 'lucide-react'
import { addAudioAttachment, getAttachments, deleteAttachment } from '@/lib/actions/notes'

function fmt(s: number) { const m = Math.floor(s / 60); const r = s % 60; return `${m}:${String(r).padStart(2, '0')}` }

export function VoiceRecorder({ noteId }: { noteId: string }) {
  const [list, setList] = useState<{ id: string; url: string; duration: number | null }[]>([])
  const [recording, setRecording] = useState(false)
  const [secs, setSecs] = useState(0)
  const [busy, setBusy] = useState(false)
  const rec = useRef<MediaRecorder | null>(null)
  const chunks = useRef<Blob[]>([])
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)

  const reload = () => getAttachments(noteId).then(a => setList(a.filter(x => x.type === 'audio').map(x => ({ id: x.id, url: x.url, duration: x.duration }))))
  useEffect(() => { reload() }, [noteId])

  const start = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    const mr = new MediaRecorder(stream); rec.current = mr; chunks.current = []
    mr.ondataavailable = e => chunks.current.push(e.data)
    mr.onstop = async () => {
      stream.getTracks().forEach(t => t.stop())
      const blob = new Blob(chunks.current, { type: 'audio/webm' })
      const dur = secs
      setBusy(true)
      try {
        const fd = new FormData(); fd.append('file', blob, 'voice.webm'); fd.append('noteId', noteId)
        const res = await fetch('/api/notes/audio', { method: 'POST', body: fd })
        const json = await res.json()
        if (json.url) { await addAudioAttachment(noteId, json.url, dur, 'voice.webm'); await reload() }
      } finally { setBusy(false); setSecs(0) }
    }
    mr.start(); setRecording(true); setSecs(0)
    timer.current = setInterval(() => setSecs(s => s + 1), 1000)
  }
  const stop = () => { rec.current?.stop(); setRecording(false); if (timer.current) clearInterval(timer.current) }
  const remove = async (id: string) => { await deleteAttachment(id); reload() }

  return (
    <div style={{ padding: 10, border: '1px solid #F1F1F4', borderRadius: 12, marginTop: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {recording ? (
          <button onClick={stop} style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#DE1A1A', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 12px', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
            <Square size={13} /> Stop · {fmt(secs)}
          </button>
        ) : (
          <button onClick={start} disabled={busy} style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#F3F4F6', border: 'none', borderRadius: 8, padding: '7px 12px', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#374151' }}>
            {busy ? <Loader2 size={13} className="animate-spin" /> : <Mic size={13} />} {busy ? 'Saving…' : 'Record voice note'}
          </button>
        )}
        {recording && <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#DE1A1A', animation: 'pulse 1s infinite' }} />}
      </div>
      {list.map(a => (
        <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
          <Play size={13} color="#DE1A1A" />
          <audio controls src={a.url} style={{ height: 30, flex: 1 }} />
          {a.duration != null && <span style={{ fontSize: 11, color: '#9CA3AF' }}>{fmt(a.duration)}</span>}
          <button onClick={() => remove(a.id)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#9CA3AF' }}><Trash2 size={13} /></button>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Calendar view** `components/notes/calendar-view.tsx`

```tsx
'use client'
import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { monthMatrix, bucketByDay } from '@/lib/notes/calendar'
import type { HubNote } from './types'

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
const DOW = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

export function CalendarView({ notes, onSelect }: { notes: HubNote[]; onSelect: (id: string) => void }) {
  const today = new Date()
  const [y, setY] = useState(today.getFullYear())
  const [m, setM] = useState(today.getMonth())
  const weeks = monthMatrix(y, m)
  const buckets = bucketByDay(notes.map(n => ({ id: n.id, reminder_at: n.reminder_at })))
  const titleOf = (id: string) => notes.find(n => n.id === id)?.title || 'Untitled'
  const prev = () => { if (m === 0) { setM(11); setY(y - 1) } else setM(m - 1) }
  const next = () => { if (m === 11) { setM(0); setY(y + 1) } else setM(m + 1) }
  const key = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

  return (
    <div style={{ flex: 1, padding: 20, overflowY: 'auto', background: '#fff' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <strong style={{ fontSize: 17 }}>{MONTHS[m]} {y}</strong>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={prev} style={{ border: '1px solid #E5E7EB', background: '#fff', borderRadius: 8, padding: 6, cursor: 'pointer' }}><ChevronLeft size={15} /></button>
          <button onClick={next} style={{ border: '1px solid #E5E7EB', background: '#fff', borderRadius: 8, padding: 6, cursor: 'pointer' }}><ChevronRight size={15} /></button>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 6 }}>
        {DOW.map(d => <div key={d} style={{ fontSize: 11, fontWeight: 700, color: '#9CA3AF', textAlign: 'center', padding: 4 }}>{d}</div>)}
        {weeks.flat().map((d, i) => (
          <div key={i} style={{ minHeight: 78, border: '1px solid #F1F1F4', borderRadius: 10, padding: 6, background: d ? '#fff' : '#FAFAFB' }}>
            {d && <>
              <div style={{ fontSize: 11, color: key(d) === key(today) ? '#DE1A1A' : '#6B7280', fontWeight: key(d) === key(today) ? 800 : 600 }}>{d.getDate()}</div>
              {(buckets[key(d)] ?? []).map(id => (
                <div key={id} onClick={() => onSelect(id)} title={titleOf(id)}
                  style={{ marginTop: 3, fontSize: 10, background: 'rgba(222,26,26,0.1)', color: '#DE1A1A', borderRadius: 5, padding: '2px 4px', cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {titleOf(id)}
                </div>
              ))}
            </>}
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Export menu** `components/notes/export-menu.tsx`

```tsx
'use client'
import { useState } from 'react'
import { Download } from 'lucide-react'
import { exportFilename, buildWordDocument } from '@/lib/notes/export'

export function ExportMenu({ title, getHtml }: { title: string; getHtml: () => string }) {
  const [open, setOpen] = useState(false)
  const asWord = () => {
    const blob = new Blob(['﻿', buildWordDocument(title || 'Untitled', getHtml())], { type: 'application/msword' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = exportFilename(title, 'doc'); a.click()
    URL.revokeObjectURL(a.href); setOpen(false)
  }
  const asPdf = () => {
    const w = window.open('', '_blank'); if (!w) return
    w.document.write(`<html><head><title>${exportFilename(title, 'pdf')}</title></head><body><h1>${title || 'Untitled'}</h1>${getHtml()}</body></html>`)
    w.document.close(); w.focus(); w.print(); setOpen(false)
  }
  return (
    <div style={{ position: 'relative' }}>
      <button type="button" onClick={() => setOpen(o => !o)} title="Export"
        style={{ display: 'flex', alignItems: 'center', gap: 5, background: '#F3F4F6', border: 'none', borderRadius: 8, padding: '7px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', color: '#374151' }}>
        <Download size={14} /> Export
      </button>
      {open && (
        <div style={{ position: 'absolute', bottom: 40, left: 0, background: '#fff', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.15)', border: '1px solid #F1F1F4', zIndex: 20, width: 150 }}>
          <div onClick={asPdf} style={{ padding: '9px 12px', fontSize: 13, cursor: 'pointer' }}>Export as PDF</div>
          <div onClick={asWord} style={{ padding: '9px 12px', fontSize: 13, cursor: 'pointer', borderTop: '1px solid #F1F1F4' }}>Export as Word</div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Commit** — `git add components/notes/voice-recorder.tsx components/notes/calendar-view.tsx components/notes/export-menu.tsx && git commit -m "feat(notes): voice recorder, calendar view, export menu components"`

---

### Task 6: Wire into editor + hub

**Files:** Modify `components/notes/note-editor.tsx`, `components/notes/notes-hub.tsx`

- [ ] **Step 1: note-editor** — import and add Voice + Export to the action bar; show recorder under the editor. Add imports:

```tsx
import { VoiceRecorder } from './voice-recorder'
import { ExportMenu } from './export-menu'
```

In the action bar (next to Mention/Share, only when `note.id`), add:

```tsx
{note.id && <ExportMenu title={title} getHtml={() => editor?.getHTML() ?? ''} />}
```

Under the editor body container (after the `</div>` that closes the editor box, only when `canEdit && note.id`), add:

```tsx
{canEdit && note.id && <div style={{ padding: '0 16px 12px' }}><VoiceRecorder noteId={note.id} /></div>}
```

- [ ] **Step 2: notes-hub** — add a Calendar toggle. Add import `import { CalendarView } from './calendar-view'` and `import { CalendarDays } from 'lucide-react'` (merge into existing lucide import). Add state `const [calendar, setCalendar] = useState(false)`. Add a toggle button in the header next to "New Note":

```tsx
<button onClick={() => setCalendar(c => !c)} title="Calendar"
  style={{ background: calendar ? '#DE1A1A' : '#F3F4F6', color: calendar ? '#fff' : '#374151', border: 'none', borderRadius: 10, padding: '9px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
  <CalendarDays size={15} /> Calendar
</button>
```

Replace the three-pane body so that when `calendar` is true it shows the calendar instead of list+editor:

```tsx
<div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
  <FolderSidebar … />
  {calendar ? (
    <CalendarView notes={visible} onSelect={id => { setCalendar(false); handleSelect(id) }} />
  ) : (
    <>
      <NotesList … />
      <NoteEditor … />
      {sharing && <SharePopup … />}
    </>
  )}
</div>
```

- [ ] **Step 3: Add pulse keyframe to `app/globals.css`**

```css
@keyframes pulse { 0%,100% { opacity: 1 } 50% { opacity: 0.3 } }
```

- [ ] **Step 4: Build + lint** — `pnpm build` (exit 0), `npx eslint components/notes lib/notes` (exit 0).
- [ ] **Step 5: Commit** — `git add components/notes app/globals.css && git commit -m "feat(notes): wire voice/calendar/export into hub + editor"`

---

### Task 7: Apply migration, verify, push

- [ ] **Step 1:** Apply `085_note_attachments.sql` to `bxyozelldqerlvtjwsai` via the Supabase tool; verify `SELECT count(*) FROM information_schema.tables WHERE table_name='note_attachments'` = 1.
- [ ] **Step 2:** `pnpm exec vitest run lib/notes/` → expect Phase1+2+3 = 23 tests pass (14 + 5 + 2 calendar + 2 export = 23). Dev-server smoke: `/member/notes`, `/admin/notes` → 307.
- [ ] **Step 3:** Hand to user for browser check (record a voice note + play it back; calendar shows reminder notes; export PDF + Word). After confirmation: `git push origin master:sajee`.

---

## Self-Review

**Spec coverage (Phase 3):** voice notes → Tasks 1,4,5,6. Calendar view (self-contained, reminder-driven, no `content_posts`) → Tasks 2,5,6. PDF/Word export (client-only) → Tasks 3,5,6. ✓
**Placeholder scan:** complete code in every code step. ✓
**Type consistency:** `addAudioAttachment(noteId, url, duration, filename)`, `getAttachments(noteId)`, `deleteAttachment(id)`, `monthMatrix(year, month)`, `bucketByDay(notes)`, `exportFilename(title, ext)`, `buildWordDocument(title, bodyHtml)` — identical across tasks. Audio path + bucket `documents` consistent between route and constraints. ✓
