# Notes Module V2 — Design Spec

**Date:** 2026-06-05
**Scope:** Enhance existing notes module with checklist mode, labels, archive, masonry grid UI, and convert-to-task

---

## Existing Foundation

The `notes` table already has: `id`, `company_id`, `user_id`, `title`, `content`, `color`, `pinned`, `reminder_at`, `reminded`, `created_at`, `updated_at`.

The existing client has: text notes, 7 color options, pin/unpin, date+time reminders, search.

This spec describes enhancements only — the existing reminder and search functionality is preserved unchanged.

---

## Out of Scope (This Build)

- AI features (expand idea, generate caption/script, summarize)
- Voice notes
- Image attachment
- Note ownership / team notes
- Drag-and-drop reorder

---

## 1. Database Changes

```sql
-- 061_notes_v2.sql
ALTER TABLE notes
  ADD COLUMN IF NOT EXISTS note_type text NOT NULL DEFAULT 'text'
    CHECK (note_type IN ('text', 'checklist')),
  ADD COLUMN IF NOT EXISTS items     jsonb   NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS labels    text[]  NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS archived  boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_notes_archived ON notes (user_id, archived, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notes_labels   ON notes USING gin (labels);
```

### Column Details

| Column | Type | Purpose |
|--------|------|---------|
| `note_type` | text | `'text'` or `'checklist'` |
| `items` | jsonb array | Checklist items: `[{id, text, checked}]`. Empty for text notes. |
| `labels` | text[] | User-defined label strings e.g. `['Bug Reports', 'Client Requests']` |
| `archived` | boolean | True = note is archived, hidden from main view |

**Search compatibility:** The `content` column on checklist notes stores a plain-text summary of all item texts (joined with `, `) so the existing search query works unchanged.

---

## 2. Server Actions (`lib/actions/notes.ts`)

### Updated `NoteInput` type

```typescript
export interface NoteInput {
  title?:      string
  content:     string        // plain text; for checklist: joined item texts
  color?:      string
  pinned?:     boolean
  reminder_at?: string | null
  note_type:   'text' | 'checklist'
  items:       ChecklistItem[]
  labels:      string[]
}

export interface ChecklistItem {
  id:      string
  text:    string
  checked: boolean
}
```

### New actions to add

```typescript
export async function archiveNote(id: string): Promise<{ success: boolean; error?: string }>
// Sets archived = true (or false for unarchive). Uses user_id check for ownership.

export async function convertNoteToTask(
  noteId: string,
  taskTitle: string,
  dueDate?: string
): Promise<{ success: boolean; error?: string }>
// Creates a task in the tasks table:
//   - assigned_to = current user
//   - title = taskTitle
//   - description = note content
//   - due_date = dueDate (optional)
//   - status = 'todo'
//   - company_id = user's company_id
// Does NOT delete or modify the note.
```

### Updated existing actions

`createNote` and `updateNote` pass `note_type`, `items`, `labels` through to the insert/update query.

`deleteNote` — no change (hard delete, same as before).

---

## 3. UI — `app/member/notes/notes-client.tsx`

Full rewrite of the client component. The page server component (`page.tsx`) only needs a minor change to pass `archived=false` by default in the fetch query.

### Layout

```
┌─────────────────────────────────────────────────────┐
│  Quick-create bar: "Take a note…" [T] [☑] [🎨]     │
├─────────────────────────────────────────────────────┤
│  Labels: [All] [Bug Reports] [Client] [Marketing]   │
├─────────────────────────────────────────────────────┤
│  📌 PINNED                                          │
│  ┌─────────┐  ┌─────────┐                          │
│  │ note    │  │ note    │                          │
│  └─────────┘  └─────────┘                          │
│  OTHER NOTES                                        │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐            │
│  │ note    │  │ note    │  │ note    │            │
│  └─────────┘  └─────────┘  └─────────┘            │
└─────────────────────────────────────────────────────┘
```

**Grid:** CSS columns (`column-count: 3` on desktop, `2` on tablet, `1` on mobile) for a masonry effect. No JS masonry library needed.

### Quick-Create Bar

- Single-line input "Take a note…"
- On focus: expands to show title field, content/checklist area, bottom toolbar
- Bottom toolbar icons: `[T]` text mode · `[☑]` checklist mode · `[🎨]` color picker · `[🏷]` label input · `[🔔]` reminder · `[Save]`
- Clicking outside without content: collapses back to single line
- Clicking `[☑]` while collapsed: opens directly in checklist mode

### Note Card

Each card:
- Colored background (`note.color`)
- Title (if set) in bold
- **Text note:** content preview (max 3 lines, truncated)
- **Checklist note:** first 5 items with checkboxes; `+N more` if there are more
- Label chips at the bottom (small colored pills)
- Reminder badge if `reminder_at` is set and not reminded
- On hover: action icons appear — `[✏ Edit]` `[📦 Archive]` `[📋 Convert]` `[🗑 Delete]`
- Pin icon always visible top-right corner

### Checklist Mode

In the editor (create or edit):
- Each item row: `[ ] ___text input___  [×]`
- Checking an item: text gets `line-through` + dimmed
- Completed items sort to the bottom
- Enter key on an item: focuses the next item or creates a new one
- `+ Add item` button appends a new empty item
- When saving: `content` field = all item texts joined with `, `

### Label Handling

- In the editor: a text input with autocomplete from the user's existing labels
- Labels shown as removable chips in the editor
- Autocomplete derived client-side from `[...new Set(allNotes.flatMap(n => n.labels))]`
- Label filter bar: shows all unique labels from non-archived notes; click to filter; click again to clear

### Archive View

- Header has an "Archived" toggle link next to "Notes"
- When active: shows only `archived = true` notes with "Unarchive" instead of "Archive" on cards
- Archive action: sets `archived = true` via `archiveNote` server action
- Archived notes do NOT appear in main view or label filters

### Convert to Task

- Hover card → click `[📋 Convert]`
- Small inline popup appears over the card:
  ```
  Convert to Task
  Title: [pre-filled from note title]
  Due:   [date picker, optional]
  [Cancel] [Create Task]
  ```
- On confirm: calls `convertNoteToTask(noteId, title, dueDate?)`
- Shows a brief "✓ Task created" toast; note remains unchanged

---

## 4. Page Server Component (`app/member/notes/page.tsx`)

Minor change: the existing fetch passes no `archived` filter — update to `.eq('archived', false)` by default. The client component handles the archive toggle by calling `router.refresh()` after archive actions, and the page re-renders with the correct data.

For the archived view, a query param `?archived=1` can be used to trigger `.eq('archived', true)` in the server fetch instead.

---

## 5. Success Criteria

- Member can create a checklist note and check/uncheck items
- Labels can be added to any note and filtered in the main view
- Archiving a note removes it from the main view; it appears in the archived view
- Converting a note to a task creates a task visible in `/member/tasks`
- Masonry grid displays notes in 2-3 columns on desktop
- Pinned notes always appear at the top
- Existing reminders and search continue to work unchanged
