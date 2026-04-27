"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Plus, Trash2 } from "lucide-react"
import { submitDailyUpdate } from "@/lib/actions/daily-updates"
import type { ShootEntryInput, EditingEntryInput } from "@/lib/validations/daily-update"

const ATTENDANCE = [
  { value: "present", label: "Present", color: "#10B981", bg: "rgba(16,185,129,0.12)" },
  { value: "absent", label: "Absent", color: "#FF6B57", bg: "rgba(255,107,87,0.12)" },
  { value: "holiday", label: "Holiday", color: "#F59E0B", bg: "rgba(245,158,11,0.12)" },
  { value: "outside", label: "Outside", color: "#6D5DF6", bg: "rgba(109,93,246,0.12)" },
]

const WORK_TYPES = [
  { value: "office", label: "Office" },
  { value: "wfh", label: "WFH" },
  { value: "outside", label: "Outside" },
]

const labelStyle = { color: "#6B7280" }
const inputStyle = {
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.08)",
  color: "#E6EDF3",
}

export default function DailyUpdateForm() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [attendance, setAttendance] = useState<string>("present")
  const [workType, setWorkType] = useState<string>("office")
  const [workingHours, setWorkingHours] = useState<string>("")
  const [learningHours, setLearningHours] = useState<string>("0")
  const [shootCount, setShootCount] = useState<string>("0")
  const [notes, setNotes] = useState<string>("")
  const [shootEntries, setShootEntries] = useState<ShootEntryInput[]>([])
  const [editingEntries, setEditingEntries] = useState<EditingEntryInput[]>([])

  const isPresent = attendance === "present"

  function addShootEntry() {
    setShootEntries((prev) => [...prev, { client_name: "", shoot_type: "", video_count: 1, notes: "" }])
  }

  function updateShoot(i: number, field: keyof ShootEntryInput, value: string | number) {
    setShootEntries((prev) => prev.map((e, idx) => idx === i ? { ...e, [field]: value } : e))
  }

  function removeShoot(i: number) {
    setShootEntries((prev) => prev.filter((_, idx) => idx !== i))
  }

  function addEditEntry() {
    setEditingEntries((prev) => [...prev, { client_name: "", editing_hours: 1, folder_link: "" }])
  }

  function updateEdit(i: number, field: keyof EditingEntryInput, value: string | number) {
    setEditingEntries((prev) => prev.map((e, idx) => idx === i ? { ...e, [field]: value } : e))
  }

  function removeEdit(i: number) {
    setEditingEntries((prev) => prev.filter((_, idx) => idx !== i))
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      const result = await submitDailyUpdate({
        attendance_status: attendance as "present" | "absent" | "holiday" | "outside",
        work_type: isPresent ? (workType as "office" | "wfh" | "outside") : undefined,
        working_hours: isPresent && workingHours ? parseFloat(workingHours) : undefined,
        learning_hours: parseFloat(learningHours) || 0,
        shoot_count: parseInt(shootCount) || 0,
        notes: notes || undefined,
        shoot_entries: shootEntries,
        editing_entries: editingEntries,
      })
      if (result.success) {
        router.push("/member/dashboard")
        router.refresh()
      } else {
        setError(result.error ?? "Something went wrong")
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Attendance */}
      <div>
        <label className="text-[12px] font-semibold uppercase tracking-wider font-sans mb-2 block" style={labelStyle}>
          Attendance Status *
        </label>
        <div className="grid grid-cols-4 gap-2">
          {ATTENDANCE.map((opt) => (
            <button key={opt.value} type="button" onClick={() => setAttendance(opt.value)}
              className="py-2.5 rounded-xl text-[13px] font-semibold font-sans transition-all"
              style={attendance === opt.value
                ? { background: opt.bg, color: opt.color, border: `1px solid ${opt.color}40` }
                : { background: "rgba(255,255,255,0.03)", color: "#6B7280", border: "1px solid rgba(255,255,255,0.06)" }
              }>
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Work Type (only when present) */}
      {isPresent && (
        <div>
          <label className="text-[12px] font-semibold uppercase tracking-wider font-sans mb-2 block" style={labelStyle}>
            Work Type *
          </label>
          <div className="grid grid-cols-3 gap-2">
            {WORK_TYPES.map((opt) => (
              <button key={opt.value} type="button" onClick={() => setWorkType(opt.value)}
                className="py-2.5 rounded-xl text-[13px] font-semibold font-sans transition-all"
                style={workType === opt.value
                  ? { background: "rgba(109,93,246,0.12)", color: "#6D5DF6", border: "1px solid rgba(109,93,246,0.25)" }
                  : { background: "rgba(255,255,255,0.03)", color: "#6B7280", border: "1px solid rgba(255,255,255,0.06)" }
                }>
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Hours row */}
      <div className="grid grid-cols-3 gap-3">
        {isPresent && (
          <div>
            <label className="text-[12px] font-semibold uppercase tracking-wider font-sans mb-1.5 block" style={labelStyle}>
              Working Hours
            </label>
            <input type="number" min="0" max="24" step="0.5" value={workingHours}
              onChange={(e) => setWorkingHours(e.target.value)} placeholder="e.g. 8.5"
              className="w-full px-3 py-2.5 rounded-xl text-[13px] font-sans outline-none"
              style={inputStyle} />
          </div>
        )}
        <div>
          <label className="text-[12px] font-semibold uppercase tracking-wider font-sans mb-1.5 block" style={labelStyle}>
            Learning Hours
          </label>
          <input type="number" min="0" max="24" step="0.5" value={learningHours}
            onChange={(e) => setLearningHours(e.target.value)}
            className="w-full px-3 py-2.5 rounded-xl text-[13px] font-sans outline-none"
            style={inputStyle} />
        </div>
        <div>
          <label className="text-[12px] font-semibold uppercase tracking-wider font-sans mb-1.5 block" style={labelStyle}>
            Shoot Count
          </label>
          <input type="number" min="0" value={shootCount}
            onChange={(e) => setShootCount(e.target.value)}
            className="w-full px-3 py-2.5 rounded-xl text-[13px] font-sans outline-none"
            style={inputStyle} />
        </div>
      </div>

      {/* Notes */}
      <div>
        <label className="text-[12px] font-semibold uppercase tracking-wider font-sans mb-1.5 block" style={labelStyle}>
          Notes
        </label>
        <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)}
          placeholder="What did you work on today? Any blockers?"
          className="w-full px-3 py-2.5 rounded-xl text-[13px] font-sans outline-none resize-none"
          style={inputStyle} />
      </div>

      {/* Shoot Entries */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-[12px] font-semibold uppercase tracking-wider font-sans" style={labelStyle}>
            Shoot Details
          </label>
          <button type="button" onClick={addShootEntry}
            className="flex items-center gap-1 text-[12px] font-semibold font-sans px-2.5 py-1 rounded-lg"
            style={{ background: "rgba(109,93,246,0.1)", color: "#6D5DF6" }}>
            <Plus size={12} /> Add
          </button>
        </div>
        {shootEntries.map((entry, i) => (
          <div key={i} className="rounded-xl p-4 mb-2 grid grid-cols-3 gap-3" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
            <input placeholder="Client name" value={entry.client_name} onChange={(e) => updateShoot(i, "client_name", e.target.value)}
              className="px-3 py-2 rounded-lg text-[12px] font-sans outline-none" style={inputStyle} />
            <input placeholder="Shoot type" value={entry.shoot_type} onChange={(e) => updateShoot(i, "shoot_type", e.target.value)}
              className="px-3 py-2 rounded-lg text-[12px] font-sans outline-none" style={inputStyle} />
            <div className="flex gap-2">
              <input type="number" min="1" placeholder="Videos" value={entry.video_count}
                onChange={(e) => updateShoot(i, "video_count", parseInt(e.target.value) || 1)}
                className="flex-1 px-3 py-2 rounded-lg text-[12px] font-sans outline-none" style={inputStyle} />
              <button type="button" onClick={() => removeShoot(i)} className="px-2 rounded-lg" style={{ background: "rgba(255,107,87,0.1)" }}>
                <Trash2 size={12} style={{ color: "#FF6B57" }} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Editing Entries */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-[12px] font-semibold uppercase tracking-wider font-sans" style={labelStyle}>
            Editing Details
          </label>
          <button type="button" onClick={addEditEntry}
            className="flex items-center gap-1 text-[12px] font-semibold font-sans px-2.5 py-1 rounded-lg"
            style={{ background: "rgba(109,93,246,0.1)", color: "#6D5DF6" }}>
            <Plus size={12} /> Add
          </button>
        </div>
        {editingEntries.map((entry, i) => (
          <div key={i} className="rounded-xl p-4 mb-2 grid grid-cols-3 gap-3" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
            <input placeholder="Client name" value={entry.client_name} onChange={(e) => updateEdit(i, "client_name", e.target.value)}
              className="px-3 py-2 rounded-lg text-[12px] font-sans outline-none" style={inputStyle} />
            <input type="number" min="0.5" step="0.5" placeholder="Hours" value={entry.editing_hours}
              onChange={(e) => updateEdit(i, "editing_hours", parseFloat(e.target.value) || 0.5)}
              className="px-3 py-2 rounded-lg text-[12px] font-sans outline-none" style={inputStyle} />
            <div className="flex gap-2">
              <input placeholder="Folder URL (opt.)" value={entry.folder_link ?? ""} onChange={(e) => updateEdit(i, "folder_link", e.target.value)}
                className="flex-1 px-3 py-2 rounded-lg text-[12px] font-sans outline-none" style={inputStyle} />
              <button type="button" onClick={() => removeEdit(i)} className="px-2 rounded-lg" style={{ background: "rgba(255,107,87,0.1)" }}>
                <Trash2 size={12} style={{ color: "#FF6B57" }} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {error && (
        <p className="text-[13px] font-sans px-4 py-3 rounded-xl" style={{ background: "rgba(255,107,87,0.08)", color: "#FF6B57", border: "1px solid rgba(255,107,87,0.15)" }}>
          {error}
        </p>
      )}

      <button type="submit" disabled={isPending}
        className="w-full py-3 rounded-xl text-[14px] font-bold font-sans text-white flex items-center justify-center gap-2 transition-all"
        style={{ background: "linear-gradient(135deg, #FF6B57, #E85A45)", boxShadow: "0 4px 20px rgba(255,107,87,0.3)" }}>
        {isPending && <Loader2 size={16} className="animate-spin" />}
        {isPending ? "Submitting..." : "Submit Daily Update"}
      </button>
    </form>
  )
}
