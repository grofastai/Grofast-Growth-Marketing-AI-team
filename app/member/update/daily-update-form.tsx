"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import {
  Clock, ChevronDown, CheckCircle2, Loader2,
  SendHorizonal, MoreHorizontal, Plus, Zap,
} from "lucide-react"
import { submitDailyUpdate } from "@/lib/actions/daily-updates"

interface Project { id: string; business_name: string }

type Slot = {
  hour: number
  description: string
  projectId: string
  projectName: string
  status: "not_started" | "in_progress" | "completed"
}

type Mood = "very_tired" | "tired" | "neutral" | "good" | "very_good"

// 9 AM → 11 PM  (slot shows e.g. "10 PM – 11 PM")
const SLOT_HOURS = [9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22]
// Overtime: 11 PM → 3 AM
const OVERTIME_HOURS = [23, 0, 1, 2]

const MOODS: { key: Mood; emoji: string; label: string }[] = [
  { key: "very_tired", emoji: "😫", label: "Very tired" },
  { key: "tired",      emoji: "😐", label: "Tired" },
  { key: "neutral",    emoji: "😊", label: "Neutral" },
  { key: "good",       emoji: "😄", label: "Good" },
  { key: "very_good",  emoji: "😁", label: "Very good" },
]

const STATUS_STYLE = {
  completed:   { bg: "rgba(22,163,74,0.1)",    color: "#16A34A", label: "Completed",   dot: "#22C55E" },
  in_progress: { bg: "rgba(245,158,11,0.1)",   color: "#D97706", label: "In Progress", dot: "#F59E0B" },
  not_started: { bg: "rgba(156,163,175,0.12)", color: "#9CA3AF", label: "Not Started", dot: "#D1D5DB" },
} as const

const STATUS_CYCLE: Record<Slot["status"], Slot["status"]> = {
  not_started: "in_progress",
  in_progress: "completed",
  completed:   "not_started",
}

const PROJECT_COLORS = ["#de1a1a", "#6366F1", "#0EA5E9", "#10B981", "#F59E0B", "#EC4899"]

function fmtHour(h: number) {
  const hr = h % 24
  if (hr === 0) return "12 AM"
  if (hr < 12) return `${hr} AM`
  if (hr === 12) return "12 PM"
  return `${hr - 12} PM`
}

function projectColor(name: string) {
  if (!name) return "#9CA3AF"
  const i = name.split("").reduce((a, c) => a + c.charCodeAt(0), 0) % PROJECT_COLORS.length
  return PROJECT_COLORS[i]
}

function GaugeChart({ score }: { score: number }) {
  const r = 56, cx = 80, cy = 72
  const circ = Math.PI * r
  const filled = Math.min(score / 100, 1) * circ
  const arc = `M ${cx - r},${cy} A ${r},${r} 0 0,1 ${cx + r},${cy}`
  const label = score >= 70 ? "Good" : score >= 40 ? "Fair" : "Low"
  const msg   = score >= 70 ? "Keep it up! You're on fire! 🔥" : score >= 40 ? "Good effort, keep going! 💪" : "Fill in your hourly work! ✍️"
  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 160 85" className="w-full" style={{ maxWidth: 200 }}>
        <defs>
          <linearGradient id="gaugeG" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#FCA5A5" />
            <stop offset="100%" stopColor="#de1a1a" />
          </linearGradient>
        </defs>
        <path d={arc} fill="none" stroke="#F3F4F6" strokeWidth="13" strokeLinecap="round" />
        <path d={arc} fill="none" stroke="url(#gaugeG)" strokeWidth="13" strokeLinecap="round"
          strokeDasharray={`${filled} ${circ}`} style={{ transition: "stroke-dasharray 0.5s ease" }} />
        <text x={cx} y={cy - 6} textAnchor="middle" fontSize="26" fontWeight="900" fill="#111111">{score}</text>
        <text x={cx} y={cy + 10} textAnchor="middle" fontSize="11" fill="#6B7280">{label}</text>
      </svg>
      <p className="text-[11px] text-center mt-1" style={{ color: "#6B7280" }}>{msg}</p>
    </div>
  )
}

// ── Shared slot row component ────────────────────────────────────────────────
function SlotRow({
  slot, index, total, projects, isOvertime,
  onUpdate,
}: {
  slot: Slot
  index: number
  total: number
  projects: Project[]
  isOvertime: boolean
  onUpdate: (hour: number, patch: Partial<Slot>) => void
}) {
  const st      = STATUS_STYLE[slot.status]
  const isFilled = slot.description.trim().length > 0
  const isLunch  = slot.hour === 12
  const pColor   = projectColor(slot.projectName)
  const accentColor = isOvertime ? "#F59E0B" : "#de1a1a"

  return (
    <div
      className="grid gap-3 items-center px-5 py-3 transition-colors hover:bg-[#FAFAFA] group"
      style={{
        gridTemplateColumns: "76px 1fr 144px 124px 28px",
        borderBottom: index < total - 1 ? "1px solid #F5F5F7" : "none",
        background: isOvertime ? "rgba(245,158,11,0.02)" : undefined,
      }}>

      {/* Time + filled indicator */}
      <div className="flex items-center gap-2">
        <div>
          <p className="text-[12px] font-black leading-none" style={{ color: accentColor }}>{fmtHour(slot.hour)}</p>
          <p className="text-[10px] mt-0.5 leading-none" style={{ color: "#6B7280" }}>– {fmtHour(slot.hour + 1)}</p>
        </div>
        <div className="w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all"
          style={{ borderColor: isFilled ? accentColor : "#E5E7EB", background: isFilled ? accentColor : "#FFFFFF" }}>
          {isFilled && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
        </div>
      </div>

      {/* Description */}
      <div>
        <input
          value={slot.description}
          onChange={e => {
            const v = e.target.value
            onUpdate(slot.hour, {
              description: v,
              status: v && slot.status === "not_started" ? "in_progress" : slot.status,
            })
          }}
          placeholder={isLunch ? "Lunch break 🍱" : isOvertime ? "Overtime work…" : "What did you work on this hour?"}
          className="w-full bg-transparent outline-none text-[13px]"
          style={{ color: isFilled ? "#111111" : "#6B7280", fontWeight: isFilled ? 500 : 400 }}
        />
      </div>

      {/* Project selector */}
      <div>
        {projects.length > 0 ? (
          <div className="relative">
            <select
              value={slot.projectId}
              onChange={e => {
                const p = projects.find(x => x.id === e.target.value)
                onUpdate(slot.hour, { projectId: e.target.value, projectName: p?.business_name ?? "" })
              }}
              className="w-full text-[11px] font-semibold rounded-lg px-2 py-1.5 appearance-none outline-none pr-5 cursor-pointer"
              style={{
                background: slot.projectName ? `${pColor}18` : "#F9FAFB",
                color:      slot.projectName ? pColor : "#9CA3AF",
                border:     `1px solid ${slot.projectName ? `${pColor}35` : "#E5E7EB"}`,
              }}>
              <option value="">Select Project</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.business_name}</option>)}
            </select>
            <ChevronDown size={9} className="absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "#9CA3AF" }} />
          </div>
        ) : (
          <input
            value={slot.projectName}
            onChange={e => onUpdate(slot.hour, { projectName: e.target.value })}
            placeholder="Project..."
            className="w-full text-[11px] rounded-lg px-2 py-1.5 outline-none"
            style={{ background: "#F9FAFB", border: "1px solid #E5E7EB", color: "#374151" }}
          />
        )}
      </div>

      {/* Status chip */}
      <button
        onClick={() => onUpdate(slot.hour, { status: STATUS_CYCLE[slot.status] })}
        className="flex items-center gap-1 px-2 py-1.5 rounded-full text-[10px] font-bold transition-all w-full justify-center"
        style={{ background: st.bg, color: st.color }}>
        <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: st.dot }} />
        <span>{st.label}</span>
        <ChevronDown size={8} className="flex-shrink-0" />
      </button>

      {/* More menu */}
      <button className="w-7 h-7 rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all hover:bg-gray-100">
        <MoreHorizontal size={13} style={{ color: "#9CA3AF" }} />
      </button>
    </div>
  )
}

// ── Main component ───────────────────────────────────────────────────────────
export default function DailyUpdateForm({
  projects,
  userName,
}: {
  projects: Project[]
  team: string | null
  userName: string
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const firstName = userName.split(" ")[0] || "there"
  const h = new Date().getHours()
  const greeting = h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening"
  const now = new Date()
  const dateLabel = now.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
  const dayName   = now.toLocaleDateString("en-US", { weekday: "long" })
  const dateStr   = now.toLocaleDateString("en-US", { weekday: "long", day: "numeric", month: "long", year: "numeric" })

  const [slots, setSlots] = useState<Slot[]>(
    SLOT_HOURS.map(hr => ({ hour: hr, description: "", projectId: "", projectName: "", status: "not_started" }))
  )
  const [overtimeSlots, setOvertimeSlots] = useState<Slot[]>(
    OVERTIME_HOURS.map(hr => ({ hour: hr, description: "", projectId: "", projectName: "", status: "not_started" }))
  )
  const [showOvertime, setShowOvertime] = useState(false)
  const [mood, setMood]         = useState<Mood>("good")
  const [error, setError]       = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)

  const filledSlots    = slots.filter(s => s.description.trim().length > 0)
  const filledOvertime = overtimeSlots.filter(s => s.description.trim().length > 0)
  const allFilled      = [...filledSlots, ...filledOvertime]
  const completedCount = allFilled.filter(s => s.status === "completed").length
  const productivity   = allFilled.length > 0 ? Math.round((completedCount / allFilled.length) * 100) : 0
  const hoursWorked    = allFilled.length
  const totalHours     = SLOT_HOURS.length    // 14 regular hours
  const progressPct    = Math.round((filledSlots.length / totalHours) * 100)
  const circum         = 2 * Math.PI * 17

  function updateSlot(hour: number, patch: Partial<Slot>) {
    setSlots(prev => prev.map(s => s.hour === hour ? { ...s, ...patch } : s))
  }
  function updateOvertimeSlot(hour: number, patch: Partial<Slot>) {
    setOvertimeSlots(prev => prev.map(s => s.hour === hour ? { ...s, ...patch } : s))
  }

  function handleSubmit() {
    if (allFilled.length === 0) { setError("Please fill in at least one hour slot."); return }
    setError(null)
    startTransition(async () => {
      const work_entries = allFilled.map(s => ({
        id:             crypto.randomUUID(),
        client_id:      s.projectId || null,
        client_name:    s.projectName || "Internal",
        task_type:      "other" as const,
        title:          s.description,
        start_time:     `${String(s.hour % 24).padStart(2, "0")}:00`,
        end_time:       `${String((s.hour + 1) % 24).padStart(2, "0")}:00`,
        duration_hours: 1,
        notes:          "",
        video_uploaded: null,
        screenshot_url: "",
        video_link:     "",
        editing_videos: [],
      }))
      const res = await submitDailyUpdate({
        active_tab:    "working",
        work_entries,
        links:         [],
        shoot_count:   0,
        editing_count: 0,
        learning_hours: 0,
      })
      if (!res.success) setError(res.error ?? "Submission failed")
      else { setSubmitted(true); router.refresh() }
    })
  }

  // ── Column header template (must match SlotRow gridTemplateColumns) ────────
  const COLS = "76px 1fr 144px 124px 28px"

  return (
    <div style={{ background: "#F1F2F6", minHeight: "100vh" }} className="p-3 md:p-5 xl:p-6">

      {/* ── PAGE HEADER ─────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        {/* Title */}
        <div className="flex-1 min-w-[160px]">
          <h1 className="text-[26px] md:text-[30px] font-black leading-tight" style={{ color: "#111111", fontFamily: "var(--font-jakarta)" }}>
            Daily Update
          </h1>
          <p className="text-[12px] mt-0.5" style={{ color: "#6B7280" }}>{dateStr}</p>
        </div>

        {/* Girl + greeting */}
        <div className="flex items-end gap-0 rounded-2xl flex-shrink-0 overflow-hidden"
          style={{ background: "#FFFFFF", border: "1px solid #E8E9EF", boxShadow: "0 2px 12px rgba(0,0,0,0.05)" }}>
          <div className="relative flex-shrink-0" style={{ width: 76, height: 88 }}>
            <Image src="/brand/assistant-girl.jpg" alt="Assistant" fill style={{ objectFit: "cover", objectPosition: "top center" }} />
          </div>
          <div className="px-4 pb-3 pt-3 self-center">
            <p className="text-[14px] font-black leading-tight" style={{ color: "#111111", fontFamily: "var(--font-jakarta)" }}>
              {greeting}, {firstName}! 👋
            </p>
            <p className="text-[11px] mt-0.5" style={{ color: "#6B7280" }}>Let&apos;s make today productive.</p>
          </div>
        </div>

        {/* Date widget */}
        <div className="flex items-center gap-3 px-4 py-2.5 rounded-2xl flex-shrink-0"
          style={{ background: "#FFFFFF", border: "1px solid #E8E9EF", boxShadow: "0 2px 12px rgba(0,0,0,0.05)" }}>
          <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: "rgba(222,26,26,0.1)" }}>
            <Clock size={14} style={{ color: "#de1a1a" }} />
          </div>
          <div>
            <p className="text-[12px] font-black" style={{ color: "#111111" }}>{dateLabel}</p>
            <p className="text-[10px]" style={{ color: "#9CA3AF" }}>{dayName}</p>
          </div>
        </div>

        {/* Day progress circle */}
        <div className="flex items-center gap-3 px-4 py-2.5 rounded-2xl flex-shrink-0"
          style={{ background: "#FFFFFF", border: "1px solid #E8E9EF", boxShadow: "0 2px 12px rgba(0,0,0,0.05)" }}>
          <div className="relative w-10 h-10 flex-shrink-0">
            <svg viewBox="0 0 44 44" className="w-full h-full" style={{ transform: "rotate(-90deg)" }}>
              <circle cx="22" cy="22" r="17" fill="none" stroke="#F3F4F6" strokeWidth="5" />
              <circle cx="22" cy="22" r="17" fill="none" stroke="#de1a1a" strokeWidth="5" strokeLinecap="round"
                strokeDasharray={`${(filledSlots.length / totalHours) * circum} ${circum}`}
                style={{ transition: "stroke-dasharray 0.5s ease" }} />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-[9px] font-black" style={{ color: "#111111" }}>
              {progressPct}%
            </span>
          </div>
          <div>
            <p className="text-[11px] font-bold" style={{ color: "#111111" }}>Day Progress</p>
            <p className="text-[10px]" style={{ color: "#6B7280" }}>{filledSlots.length} / {totalHours} hrs</p>
          </div>
        </div>
      </div>

      {/* ── MAIN 2-COL ─────────────────────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_300px] gap-4">

        {/* LEFT — Timeline card */}
        <div className="rounded-3xl flex flex-col"
          style={{ background: "#FFFFFF", boxShadow: "0 2px 20px rgba(0,0,0,0.06)", overflow: "hidden" }}>

          {/* Scrollable timeline */}
          <div style={{ overflowX: "auto" }}>
            <div style={{ minWidth: 540 }}>

              {/* Column headers */}
              <div className="px-5 py-3" style={{ borderBottom: "1px solid #F5F5F7" }}>
                <div className="grid gap-3 items-center" style={{ gridTemplateColumns: COLS }}>
                  {["Time", "What did you work on?", "Project", "Status", ""].map(lbl => (
                    <span key={lbl} className="text-[11px] font-bold uppercase tracking-widest" style={{ color: "#374151" }}>{lbl}</span>
                  ))}
                </div>
              </div>

              {/* Regular slots 9 AM → 11 PM */}
              <div>
                {slots.map((slot, i) => (
                  <SlotRow
                    key={slot.hour}
                    slot={slot}
                    index={i}
                    total={slots.length}
                    projects={projects}
                    isOvertime={false}
                    onUpdate={updateSlot}
                  />
                ))}
              </div>

              {/* ── OVERTIME SECTION ─────────────────────────── */}
              <div style={{ borderTop: "2px dashed #FDE68A" }}>
                {/* Overtime toggle header */}
                <button
                  onClick={() => setShowOvertime(v => !v)}
                  className="w-full flex items-center gap-3 px-5 py-3 transition-colors hover:bg-amber-50"
                  style={{ background: "rgba(245,158,11,0.04)" }}>
                  <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{ background: "rgba(245,158,11,0.15)" }}>
                    <Zap size={12} style={{ color: "#F59E0B" }} />
                  </div>
                  <div className="flex-1 text-left">
                    <p className="text-[12px] font-black" style={{ color: "#D97706" }}>Overtime</p>
                    <p className="text-[10px]" style={{ color: "#9CA3AF" }}>11 PM → 3 AM · Log late-night work</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {filledOvertime.length > 0 && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                        style={{ background: "rgba(245,158,11,0.15)", color: "#D97706" }}>
                        {filledOvertime.length}h logged
                      </span>
                    )}
                    <div className="w-6 h-6 rounded-full flex items-center justify-center"
                      style={{ background: "rgba(245,158,11,0.12)" }}>
                      {showOvertime
                        ? <ChevronDown size={12} style={{ color: "#F59E0B" }} />
                        : <Plus size={12} style={{ color: "#F59E0B" }} />
                      }
                    </div>
                  </div>
                </button>

                {showOvertime && (
                  <div style={{ background: "rgba(254,243,199,0.3)" }}>
                    {overtimeSlots.map((slot, i) => (
                      <SlotRow
                        key={slot.hour}
                        slot={slot}
                        index={i}
                        total={overtimeSlots.length}
                        projects={projects}
                        isOvertime={true}
                        onUpdate={updateOvertimeSlot}
                      />
                    ))}
                  </div>
                )}
              </div>

            </div>
          </div>

          {/* Bottom action bar */}
          <div className="px-5 py-4 flex flex-wrap items-center gap-4 justify-between mt-auto"
            style={{ borderTop: "1px solid #F0F0F0" }}>
            <div className="flex items-center gap-2">
              <CheckCircle2 size={13} style={{ color: "#22C55E" }} />
              <span className="text-[11px] font-medium" style={{ color: "#6B7280" }}>Auto-saved just now</span>
            </div>
            {error && <p className="text-[12px] font-semibold" style={{ color: "#EF4444" }}>{error}</p>}
            <button
              onClick={handleSubmit}
              disabled={isPending || submitted}
              className="flex items-center gap-2 px-6 py-2.5 rounded-2xl text-[13px] font-bold disabled:opacity-60 transition-all"
              style={{ background: submitted ? "#22C55E" : "#de1a1a", color: "#FFFFFF", boxShadow: "0 4px 16px rgba(222,26,26,0.3)" }}>
              {isPending   ? <Loader2 size={14} className="animate-spin" />
               : submitted ? <CheckCircle2 size={14} />
               : <SendHorizonal size={14} />}
              {isPending ? "Submitting…" : submitted ? "Submitted!" : "Submit Daily Update"}
            </button>
          </div>
        </div>

        {/* RIGHT — Stats panel */}
        <div className="space-y-4">

          {/* Today's Overview */}
          <div className="rounded-3xl overflow-hidden"
            style={{ background: "#FFFFFF", boxShadow: "0 2px 16px rgba(0,0,0,0.06)" }}>
            <div className="relative w-full" style={{ height: 170 }}>
              <Image src="/brand/daily-boy.png" alt="Overview" fill style={{ objectFit: "cover", objectPosition: "center top" }} />
            </div>
            <div className="p-4">
              <h3 className="text-[13px] font-black mb-3" style={{ color: "#111111" }}>Today&apos;s Overview</h3>
              <div className="space-y-2.5">
                {[
                  { icon: "⏱", label: "Hours Logged",  value: `${hoursWorked} / ${totalHours} hrs` },
                  { icon: "🎯", label: "Focus Time",    value: hoursWorked > 1 ? `${hoursWorked - 1}h 30m` : "—" },
                  { icon: "📈", label: "Productivity",  value: `${productivity}%` },
                  { icon: "⚡", label: "Status",        value: hoursWorked === 0 ? "Not started" : hoursWorked >= 10 ? "On track" : "In Progress",
                    color: hoursWorked >= 10 ? "#22C55E" : hoursWorked > 0 ? "#F59E0B" : "#9CA3AF" },
                  ...(filledOvertime.length > 0 ? [{ icon: "🌙", label: "Overtime", value: `${filledOvertime.length}h`, color: "#D97706" }] : []),
                ].map(r => (
                  <div key={r.label} className="flex items-center justify-between">
                    <span className="text-[11px] flex items-center gap-1.5" style={{ color: "#9CA3AF" }}>
                      <span>{r.icon}</span>{r.label}
                    </span>
                    <span className="text-[11px] font-bold" style={{ color: (r as { color?: string }).color ?? "#111111" }}>
                      {r.value}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Productivity Score */}
          <div className="rounded-3xl p-4" style={{ background: "#FFFFFF", boxShadow: "0 2px 16px rgba(0,0,0,0.06)" }}>
            <h3 className="text-[13px] font-black mb-1" style={{ color: "#111111" }}>Productivity Score</h3>
            <GaugeChart score={productivity} />
          </div>

          {/* Mood */}
          <div className="rounded-3xl p-4" style={{ background: "#FFFFFF", boxShadow: "0 2px 16px rgba(0,0,0,0.06)" }}>
            <h3 className="text-[13px] font-black mb-3" style={{ color: "#111111" }}>How do you feel today?</h3>
            <div className="flex justify-between">
              {MOODS.map(m => (
                <button key={m.key} onClick={() => setMood(m.key)}
                  className="flex flex-col items-center gap-1 p-1.5 rounded-xl transition-all flex-1"
                  style={{
                    background: mood === m.key ? "rgba(222,26,26,0.07)" : "transparent",
                    border:     mood === m.key ? "2px solid rgba(222,26,26,0.25)" : "2px solid transparent",
                  }}>
                  <span className="text-[20px] leading-none">{m.emoji}</span>
                  <span className="text-[8px] font-semibold text-center leading-tight"
                    style={{ color: mood === m.key ? "#de1a1a" : "#9CA3AF" }}>{m.label}</span>
                </button>
              ))}
            </div>
          </div>

        </div>
      </div>

      {/* ── BOTTOM PROGRESS BAR ───────────────────────────────── */}
      <div className="mt-4 flex items-center gap-4 px-5 py-3 rounded-2xl"
        style={{ background: "#FFFFFF", border: "1px solid #E8E9EF" }}>
        <span className="text-[12px] font-bold flex-shrink-0" style={{ color: "#111111" }}>🏆 Keep going!</span>
        <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: "#F3F4F6" }}>
          <div className="h-full rounded-full transition-all duration-500" style={{ width: `${progressPct}%`, background: "linear-gradient(90deg, #FCA5A5, #de1a1a)" }} />
        </div>
        <span className="text-[12px] font-bold flex-shrink-0" style={{ color: "#de1a1a" }}>{progressPct}%</span>
        <span className="text-[12px] flex-shrink-0 hidden sm:block" style={{ color: "#6B7280" }}>You&apos;re doing great today.</span>
      </div>

    </div>
  )
}
