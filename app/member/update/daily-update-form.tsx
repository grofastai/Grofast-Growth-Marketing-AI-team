"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Plus, Trash2 } from "lucide-react"
import { submitDailyUpdate } from "@/lib/actions/daily-updates"
import type { ShootEntryInput, EditingEntryInput } from "@/lib/validations/daily-update"

interface Task { id: string; title: string; status: string }

const ATTENDANCE = [
  { value: "present", label: "Present",  color: "#A3E635", bg: "rgba(163,230,53,0.1)",  border: "rgba(163,230,53,0.3)" },
  { value: "absent",  label: "Absent",   color: "#FF6B57", bg: "rgba(255,107,87,0.1)",  border: "rgba(255,107,87,0.3)" },
  { value: "holiday", label: "Holiday",  color: "#F59E0B", bg: "rgba(245,158,11,0.1)",  border: "rgba(245,158,11,0.3)" },
  { value: "outside", label: "Outside",  color: "rgba(255,255,255,0.7)", bg: "rgba(255,255,255,0.06)", border: "rgba(255,255,255,0.15)" },
]

const WORK_TYPES = [
  { value: "office",  label: "Office" },
  { value: "wfh",    label: "WFH" },
  { value: "outside", label: "Outside" },
]

const inputStyle: React.CSSProperties = {
  background: "#1A1A1A",
  border: "1px solid #2E2E2E",
  color: "#FFFFFF",
  borderRadius: "10px",
  padding: "10px 14px",
  fontSize: "13px",
  outline: "none",
  width: "100%",
  fontFamily: "inherit",
  colorScheme: "dark",
}

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "10px",
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.16em",
  marginBottom: "8px",
  color: "rgba(255,255,255,0.3)",
}

export default function DailyUpdateForm({ tasks }: { tasks: Task[] }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [attendance, setAttendance] = useState("present")
  const [workType, setWorkType] = useState("office")
  const [workingHours, setWorkingHours] = useState("")
  const [learningHours, setLearningHours] = useState("0")
  const [shootCount, setShootCount] = useState("0")
  const [notes, setNotes] = useState("")
  const [taskId, setTaskId] = useState("")
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
        task_id: taskId || null,
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
    <>
      <style>{`
        .du-input::placeholder { color: rgba(255,255,255,0.2); }
        .du-input:focus { border-color: rgba(163,230,53,0.4) !important; }
      `}</style>

      <form onSubmit={handleSubmit} className="space-y-5">

        {/* Attendance */}
        <div>
          <label style={labelStyle}>Attendance Status *</label>
          <div className="grid grid-cols-4 gap-2">
            {ATTENDANCE.map((opt) => (
              <button key={opt.value} type="button" onClick={() => setAttendance(opt.value)}
                className="py-2.5 rounded-lg text-[13px] font-bold transition-all"
                style={attendance === opt.value
                  ? { background: opt.bg, color: opt.color, border: `1px solid ${opt.border}` }
                  : { background: "#1A1A1A", color: "rgba(255,255,255,0.35)", border: "1px solid #2E2E2E" }
                }>
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Work Type (when present) */}
        {isPresent && (
          <div>
            <label style={labelStyle}>Work Type *</label>
            <div className="grid grid-cols-3 gap-2">
              {WORK_TYPES.map((opt) => (
                <button key={opt.value} type="button" onClick={() => setWorkType(opt.value)}
                  className="py-2.5 rounded-lg text-[13px] font-bold transition-all"
                  style={workType === opt.value
                    ? { background: "rgba(163,230,53,0.1)", color: "#A3E635", border: "1px solid rgba(163,230,53,0.25)" }
                    : { background: "#1A1A1A", color: "rgba(255,255,255,0.35)", border: "1px solid #2E2E2E" }
                  }>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Task link */}
        {tasks.length > 0 && (
          <div>
            <label style={labelStyle}>Task Worked On</label>
            <select value={taskId} onChange={(e) => setTaskId(e.target.value)}
              className="du-input" style={inputStyle}>
              <option value="">No specific task</option>
              {tasks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title} ({t.status === "in_progress" ? "In Progress" : "To Do"})
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Hours */}
        <div className={`grid gap-3 ${isPresent ? "grid-cols-3" : "grid-cols-2"}`}>
          {isPresent && (
            <div>
              <label style={labelStyle}>Working Hours</label>
              <input type="number" min="0" max="24" step="0.5" value={workingHours}
                onChange={(e) => setWorkingHours(e.target.value)} placeholder="e.g. 8"
                className="du-input" style={inputStyle} />
            </div>
          )}
          <div>
            <label style={labelStyle}>Learning Hours</label>
            <input type="number" min="0" max="24" step="0.5" value={learningHours}
              onChange={(e) => setLearningHours(e.target.value)}
              className="du-input" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Shoot Count</label>
            <input type="number" min="0" value={shootCount}
              onChange={(e) => setShootCount(e.target.value)}
              className="du-input" style={inputStyle} />
          </div>
        </div>

        {/* Notes */}
        <div>
          <label style={labelStyle}>Notes</label>
          <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)}
            placeholder="What did you work on? Any blockers?"
            className="du-input resize-none" style={inputStyle} />
        </div>

        {/* Shoot Entries */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label style={{ ...labelStyle, marginBottom: 0 }}>Shoot Details</label>
            <button type="button" onClick={addShootEntry}
              className="flex items-center gap-1.5 text-[12px] font-bold px-3 py-1.5 rounded-lg"
              style={{ background: "rgba(163,230,53,0.1)", color: "#A3E635" }}>
              <Plus size={12} /> Add
            </button>
          </div>
          {shootEntries.map((entry, i) => (
            <div key={i} className="rounded-xl p-4 mb-2 grid grid-cols-3 gap-3"
              style={{ background: "#1A1A1A", border: "1px solid #2E2E2E" }}>
              <input placeholder="Client name" value={entry.client_name}
                onChange={(e) => updateShoot(i, "client_name", e.target.value)}
                className="du-input px-3 py-2 rounded-lg text-[12px] outline-none" style={{ ...inputStyle, padding: "8px 12px" }} />
              <input placeholder="Shoot type" value={entry.shoot_type}
                onChange={(e) => updateShoot(i, "shoot_type", e.target.value)}
                className="du-input px-3 py-2 rounded-lg text-[12px] outline-none" style={{ ...inputStyle, padding: "8px 12px" }} />
              <div className="flex gap-2">
                <input type="number" min="1" placeholder="Videos" value={entry.video_count}
                  onChange={(e) => updateShoot(i, "video_count", parseInt(e.target.value) || 1)}
                  className="du-input flex-1 rounded-lg text-[12px] outline-none" style={{ ...inputStyle, padding: "8px 12px" }} />
                <button type="button" onClick={() => removeShoot(i)}
                  className="px-2.5 rounded-lg" style={{ background: "rgba(255,107,87,0.1)" }}>
                  <Trash2 size={12} style={{ color: "#FF6B57" }} />
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Editing Entries */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label style={{ ...labelStyle, marginBottom: 0 }}>Editing Details</label>
            <button type="button" onClick={addEditEntry}
              className="flex items-center gap-1.5 text-[12px] font-bold px-3 py-1.5 rounded-lg"
              style={{ background: "rgba(163,230,53,0.1)", color: "#A3E635" }}>
              <Plus size={12} /> Add
            </button>
          </div>
          {editingEntries.map((entry, i) => (
            <div key={i} className="rounded-xl p-4 mb-2 grid grid-cols-3 gap-3"
              style={{ background: "#1A1A1A", border: "1px solid #2E2E2E" }}>
              <input placeholder="Client name" value={entry.client_name}
                onChange={(e) => updateEdit(i, "client_name", e.target.value)}
                className="du-input rounded-lg text-[12px] outline-none" style={{ ...inputStyle, padding: "8px 12px" }} />
              <input type="number" min="0.5" step="0.5" placeholder="Hours" value={entry.editing_hours}
                onChange={(e) => updateEdit(i, "editing_hours", parseFloat(e.target.value) || 0.5)}
                className="du-input rounded-lg text-[12px] outline-none" style={{ ...inputStyle, padding: "8px 12px" }} />
              <div className="flex gap-2">
                <input placeholder="Folder URL (opt.)" value={entry.folder_link ?? ""}
                  onChange={(e) => updateEdit(i, "folder_link", e.target.value)}
                  className="du-input flex-1 rounded-lg text-[12px] outline-none" style={{ ...inputStyle, padding: "8px 12px" }} />
                <button type="button" onClick={() => removeEdit(i)}
                  className="px-2.5 rounded-lg" style={{ background: "rgba(255,107,87,0.1)" }}>
                  <Trash2 size={12} style={{ color: "#FF6B57" }} />
                </button>
              </div>
            </div>
          ))}
        </div>

        {error && (
          <div className="flex items-center gap-2.5 px-4 py-3 rounded-lg"
            style={{ background: "rgba(255,107,87,0.07)", border: "1px solid rgba(255,107,87,0.18)", color: "#FF6B57" }}>
            <span className="text-[13px]">{error}</span>
          </div>
        )}

        <button type="submit" disabled={isPending}
          className="w-full py-3.5 rounded-lg text-[14px] font-bold flex items-center justify-center gap-2 transition-all"
          style={{ background: "#A3E635", color: "#0D0D0D", opacity: isPending ? 0.65 : 1, cursor: isPending ? "not-allowed" : "pointer" }}>
          {isPending && <Loader2 size={16} className="animate-spin" />}
          {isPending ? "Submitting…" : "Submit Daily Update →"}
        </button>
      </form>
    </>
  )
}
