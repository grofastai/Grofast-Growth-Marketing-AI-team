"use client"

import { useState } from "react"
import { Pencil, Check, X } from "lucide-react"

// Inline-editable Target cell for the Client Delivery Status table — only shown when
// the dashboard is scoped to a single content type (video or poster), since a combined
// "All Content Types" total can't be written back to one target row. Click-to-edit with
// an explicit Save/Cancel, rather than an always-open input, so nothing writes until
// confirmed and a stray click or scroll-wheel bump can't save.
export function EditableTargetCell({ value, onSave }: { value: number; onSave: (n: number) => Promise<void> }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(String(value))
  const [saving, setSaving] = useState(false)

  function startEdit() {
    setDraft(String(value))
    setEditing(true)
  }

  async function commit() {
    const n = Math.max(0, Math.round(Number(draft)) || 0)
    if (n === value) { setEditing(false); return }
    setSaving(true)
    await onSave(n)
    setSaving(false)
    setEditing(false)
  }

  if (!editing) {
    return (
      <button type="button" onClick={startEdit}
        className="flex items-center gap-1.5"
        style={{ border: "none", background: "transparent", padding: "3px 6px", borderRadius: 7, cursor: "pointer", color: "#7C3AED", fontWeight: 800, fontSize: 12 }}>
        {value}
        <Pencil size={10} style={{ opacity: 0.6 }} />
      </button>
    )
  }

  return (
    <span className="inline-flex items-center gap-1">
      <input autoFocus type="number" min={0} value={draft} disabled={saving}
        onChange={e => setDraft(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false) }}
        style={{ width: 48, padding: "3px 4px", borderRadius: 6, border: "1.5px solid #7C3AED", fontSize: 12, fontWeight: 800, textAlign: "center", color: "#7C3AED" }} />
      <button type="button" onClick={commit} disabled={saving} title="Save"
        style={{ width: 22, height: 22, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 6, border: "none", background: "rgba(22,163,74,0.12)", color: "#16A34A", cursor: saving ? "wait" : "pointer" }}>
        <Check size={12} />
      </button>
      <button type="button" onClick={() => setEditing(false)} disabled={saving} title="Cancel"
        style={{ width: 22, height: 22, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 6, border: "1px solid #E5E7EB", background: "#F9FAFB", color: "#6B7280", cursor: saving ? "wait" : "pointer" }}>
        <X size={11} />
      </button>
    </span>
  )
}
