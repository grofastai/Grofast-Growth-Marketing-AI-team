"use client"

import { useState, useTransition, useMemo } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import {
  Camera, Film, Plus, Trash2, CheckCircle2,
  Loader2, SendHorizonal, Clock, BookOpen,
  ChevronDown, Upload, Link2, Zap, BarChart2, MoreHorizontal,
  Briefcase, AlertCircle,
} from "lucide-react"
import { submitDailyUpdate } from "@/lib/actions/daily-updates"

interface GeneralTaskEntry {
  id: string
  clientName: string
  title: string
  category: string
  durationHours: number
  status: "completed" | "in_progress" | "blocked"
  notes: string
}

interface Project { id: string; business_name: string }

interface ShootEntry {
  id: string; clientName: string; title: string
  startTime: string; endTime: string; durationHours: number
  notes: string; videoUploaded: boolean
}
interface EditEntry {
  id: string
  clientName: string
  title: string          // Video Name
  videoType: string      // Reel | Short | Long Form | etc.
  videoDuration: string  // e.g. "30 sec" or "2:30 min"
  dateGiven: string      // YYYY-MM-DD
  dateFinished: string   // YYYY-MM-DD
  timeTaken: number      // hours spent editing
  driveUpdated: boolean
  revisions: number
  videoLink: string
  notes: string
}

interface TimeSlot {
  id: string
  label: string
  description: string
  projectName: string
  status: "completed" | "in_progress" | "not_started"
}

const TIME_SLOT_LABELS = [
  "09 AM - 10 AM", "10 AM - 11 AM", "11 AM - 12 PM",
  "12 PM - 01 PM", "01 PM - 02 PM", "02 PM - 03 PM",
  "03 PM - 04 PM", "04 PM - 05 PM", "05 PM - 06 PM",
]

const TIME_OPTIONS = [
  "07:00","07:30","08:00","08:30","09:00","09:30","10:00","10:30","11:00","11:30",
  "12:00","12:30","13:00","13:30","14:00","14:30","15:00","15:30","16:00","16:30",
  "17:00","17:30","18:00","18:30","19:00","19:30","20:00","20:30","21:00","21:30","22:00",
]

function fmt12(t: string) {
  if (!t) return ""
  const [h, m] = t.split(":").map(Number)
  return `${h % 12 || 12}:${String(m).padStart(2,"0")} ${h >= 12 ? "PM" : "AM"}`
}
function calcDuration(start: string, end: string) {
  if (!start || !end) return 0
  const [sh, sm] = start.split(":").map(Number)
  const [eh, em] = end.split(":").map(Number)
  const diff = (eh * 60 + em) - (sh * 60 + sm)
  return diff > 0 ? Math.round((diff / 60) * 10) / 10 : 0
}

// ── Field style ───────────────────────────────────────────────────────────────
const F: React.CSSProperties = {
  background: "#F9FAFB",
  border: "1.5px solid #EBEDF2",
  color: "#111827",
  borderRadius: 10,
  padding: "9px 12px",
  fontSize: 13,
  outline: "none",
  width: "100%",
}

// ── Duration stepper ──────────────────────────────────────────────────────────
function DurationPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const steps = [0.5,1,1.5,2,2.5,3,3.5,4,4.5,5,5.5,6,6.5,7,7.5,8,9,10,11,12]
  return (
    <select value={value} onChange={e => onChange(Number(e.target.value))}
      style={{ ...F, width:"auto", minWidth:80 }}>
      {steps.map(s => <option key={s} value={s}>{s}h</option>)}
    </select>
  )
}

// ── Gauge chart ───────────────────────────────────────────────────────────────
function GaugeChart({ score }: { score: number }) {
  const r = 50, cx = 70, cy = 65, circ = Math.PI * r
  const filled = Math.min(score / 100, 1) * circ
  const arc = `M ${cx - r},${cy} A ${r},${r} 0 0,1 ${cx + r},${cy}`
  const c = score >= 70 ? "#22C55E" : score >= 40 ? "#F59E0B" : "#DE1A1A"
  const lbl = score >= 70 ? "Great" : score >= 40 ? "Good" : "Low"
  return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center" }}>
      <svg viewBox="0 0 140 78" style={{ width:"100%", maxWidth:180 }}>
        <defs>
          <linearGradient id="gg" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#FCA5A5"/>
            <stop offset="100%" stopColor={c}/>
          </linearGradient>
        </defs>
        <path d={arc} fill="none" stroke="#F3F4F6" strokeWidth="12" strokeLinecap="round"/>
        <path d={arc} fill="none" stroke="url(#gg)" strokeWidth="12" strokeLinecap="round"
          strokeDasharray={`${filled} ${circ}`} style={{ transition:"stroke-dasharray 0.5s ease" }}/>
        <text x={cx} y={cy - 8} textAnchor="middle" fontSize="24" fontWeight="900" fill="#111111">{score}</text>
        <text x={cx} y={cy + 10} textAnchor="middle" fontSize="11" fill={c} fontWeight="700">{lbl}</text>
        <text x={cx - r + 4} y={cy + 20} textAnchor="middle" fontSize="9" fill="#9CA3AF">0</text>
        <text x={cx + r - 4} y={cy + 20} textAnchor="middle" fontSize="9" fill="#9CA3AF">100</text>
      </svg>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
export default function DailyUpdateForm({
  projects, userName, team,
}: {
  projects: Project[]; team: string | null; userName: string
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const isMediaTeam = !team || team.toLowerCase().includes("media")

  const firstName = userName.split(" ")[0] || "there"
  const now        = new Date()
  const h          = now.getHours()
  const greeting   = h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening"
  const dateLabel  = now.toLocaleDateString("en-US", { weekday:"long", day:"numeric", month:"long", year:"numeric" })

  const [tab, setTab] = useState<"working"|"learning">("working")

  const [shoots, setShoots] = useState<ShootEntry[]>([])
  const addShoot    = () => setShoots(p => [...p, { id: crypto.randomUUID(), clientName:"", title:"", startTime:"09:00", endTime:"17:00", durationHours:8, notes:"", videoUploaded:false }])
  const patchShoot  = (id: string, patch: Partial<ShootEntry>) => setShoots(p => p.map(s => s.id === id ? { ...s, ...patch } : s))
  const removeShoot = (id: string) => setShoots(p => p.filter(s => s.id !== id))

  const todayStr   = new Date().toISOString().split("T")[0]

  const [edits, setEdits] = useState<EditEntry[]>([])
  const addEdit    = () => setEdits(p => [...p, {
    id: crypto.randomUUID(), clientName: "", title: "", videoType: "", videoDuration: "",
    dateGiven: todayStr, dateFinished: todayStr, timeTaken: 2,
    driveUpdated: false, revisions: 0, videoLink: "", notes: "",
  }])
  const patchEdit  = (id: string, patch: Partial<EditEntry>) => setEdits(p => p.map(e => e.id === id ? { ...e, ...patch } : e))
  const removeEdit = (id: string) => setEdits(p => p.filter(e => e.id !== id))

  // ── General task state (non-media teams) ──────────────────────────────────
  const [generalTasks, setGeneralTasks] = useState<GeneralTaskEntry[]>([])
  const addGeneralTask    = () => setGeneralTasks(p => [...p, { id: crypto.randomUUID(), clientName: "", title: "", category: "Development", durationHours: 1, status: "completed", notes: "" }])
  const patchGeneralTask  = (id: string, patch: Partial<GeneralTaskEntry>) => setGeneralTasks(p => p.map(t => t.id === id ? { ...t, ...patch } : t))
  const removeGeneralTask = (id: string) => setGeneralTasks(p => p.filter(t => t.id !== id))
  const totalGeneralHours = useMemo(() => generalTasks.reduce((s, t) => s + t.durationHours, 0), [generalTasks])

  // Non-media team: time-slot state
  const [timeSlots, setTimeSlots] = useState<TimeSlot[]>(() =>
    TIME_SLOT_LABELS.map(label => ({
      id: crypto.randomUUID(), label,
      description: "", projectName: "", status: "not_started" as const,
    }))
  )
  const patchSlot = (id: string, patch: Partial<TimeSlot>) =>
    setTimeSlots(p => p.map(s => s.id === id ? { ...s, ...patch } : s))
  const [mood, setMood] = useState("good")

  const [learningTopic, setLearningTopic] = useState("")
  const [learningHours, setLearningHours] = useState(1)
  const [learningNotes, setLearningNotes] = useState("")
  const [error,     setError]     = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)

  const totalShootHours   = useMemo(() => shoots.reduce((s, e) => s + e.durationHours, 0), [shoots])
  const totalEditHours    = useMemo(() => edits.reduce((s, e) => s + e.timeTaken, 0), [edits])
  const totalHours        = tab === "working" ? totalShootHours + totalEditHours : learningHours
  const generalProductivity = useMemo(() => {
    const filled = timeSlots.filter(s => s.description.trim())
    if (filled.length === 0) return 0
    return Math.round((filled.filter(s => s.status === "completed").length / timeSlots.length) * 100)
  }, [timeSlots])
  const productivity    = useMemo(() => {
    if (tab === "learning") return learningHours > 0 ? 80 : 0
    const filled = shoots.filter(s => s.clientName && s.title).length + edits.filter(e => e.clientName && e.title).length
    const total  = shoots.length + edits.length
    if (total === 0) return 0
    return Math.round((filled / total) * 100)
  }, [tab, shoots, edits, learningHours])

  function handleSubmit() {
    setError(null)
    if (tab === "working" && shoots.length === 0 && edits.length === 0) {
      setError("Add at least one shoot or edit entry."); return
    }
    if (tab === "learning" && !learningTopic.trim()) {
      setError("Enter what you learned today."); return
    }
    const work_entries = [
      ...shoots.map(s => ({
        id:             s.id,
        client_id:      projects.find(p => p.business_name === s.clientName)?.id ?? null,
        client_name:    s.clientName || "Internal",
        task_type:      "shoot" as const,
        title:          s.title || "Shoot",
        start_time:     s.startTime,
        end_time:       s.endTime,
        duration_hours: s.durationHours,
        notes:          s.notes,
        video_uploaded: s.videoUploaded,
        screenshot_url: "",
        video_link:     "",
        editing_videos: [],
      })),
      ...edits.map(e => ({
        id:             e.id,
        client_id:      projects.find(p => p.business_name === e.clientName)?.id ?? null,
        client_name:    e.clientName || "Internal",
        task_type:      "edit" as const,
        title:          e.title || "Editing",
        start_time:     "",
        end_time:       "",
        duration_hours: e.timeTaken,
        notes:          e.notes,
        video_uploaded: null,
        screenshot_url: "",
        video_link:     e.videoLink,
        editing_videos: [],
        video_type:     e.videoType,
        video_duration: e.videoDuration,
        date_given:     e.dateGiven,
        date_finished:  e.dateFinished,
        drive_updated:  e.driveUpdated,
        revisions:      e.revisions,
      })),
    ]
    startTransition(async () => {
      const res = await submitDailyUpdate({
        active_tab:          tab,
        work_entries,
        links:               [],
        shoot_count:         shoots.length,
        editing_count:       edits.length,
        shoot_time_hours:    totalShootHours,
        editing_time_hours:  totalEditHours,
        learning_hours:      tab === "learning" ? learningHours : 0,
        learning_topic:      tab === "learning" ? learningTopic : undefined,
        learning_notes:      tab === "learning" ? learningNotes : undefined,
      })
      if (!res.success) setError(res.error ?? "Submission failed.")
      else { setSubmitted(true); router.refresh() }
    })
  }

  // ── Non-media team: timeline submit ───────────────────────────────────────
  function handleGeneralSubmit() {
    setError(null)
    const filled = timeSlots.filter(s => s.description.trim())
    if (filled.length === 0) { setError("Fill in at least one time slot."); return }
    const work_entries = filled.map(t => ({
      id:             t.id,
      client_id:      projects.find(p => p.business_name === t.projectName)?.id ?? null,
      client_name:    t.projectName || "Internal",
      task_type:      "other" as const,
      title:          t.description,
      start_time:     "",
      end_time:       "",
      duration_hours: 1,
      notes:          `[${t.status}] ${t.label}`,
      video_uploaded: null,
      screenshot_url: "",
      video_link:     "",
      editing_videos: [],
    }))
    startTransition(async () => {
      const res = await submitDailyUpdate({
        active_tab:         "working",
        work_entries,
        links:              [],
        shoot_count:        0,
        editing_count:      0,
        shoot_time_hours:   0,
        editing_time_hours: 0,
        learning_hours:     0,
      })
      if (!res.success) setError(res.error ?? "Submission failed.")
      else { setSubmitted(true); router.refresh() }
    })
  }

  if (!isMediaTeam) {
    const workStart = 9, workEnd = 18
    const totalWorkHours = workEnd - workStart
    const elapsed = Math.max(0, Math.min(h - workStart, totalWorkHours))
    const dayPct = Math.round((elapsed / totalWorkHours) * 100)
    const ringR = 32, ringCirc = 2 * Math.PI * ringR
    const ringFilled = (dayPct / 100) * ringCirc
    const filledSlots = timeSlots.filter(s => s.description.trim())
    const calDay = now.getDate()
    const calMonth = now.toLocaleDateString("en-US", { month: "short", year: "numeric" })
    const calWeekday = now.toLocaleDateString("en-US", { weekday: "long" })
    const MOODS = [
      { key: "very_tired", emoji: "😴", label: "Very tired" },
      { key: "tired",      emoji: "😔", label: "Tired" },
      { key: "neutral",    emoji: "😐", label: "Neutral" },
      { key: "good",       emoji: "😊", label: "Good" },
      { key: "very_good",  emoji: "🤩", label: "Very good" },
    ]

    if (submitted) {
      return (
        <div style={{ background:"#F5F6FA", minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center" }}>
          <div style={{ textAlign:"center" }}>
            <CheckCircle2 size={56} style={{ color:"#22C55E", marginBottom:16 }} />
            <p style={{ fontSize:20, fontWeight:900, color:"#111111", margin:"0 0 8px", fontFamily:"var(--font-jakarta)" }}>Daily Update Submitted!</p>
            <p style={{ fontSize:13, color:"#6B7280", margin:0 }}>Great work, {firstName}. See you tomorrow!</p>
          </div>
        </div>
      )
    }

    return (
      <div style={{ background:"#F5F6FA", minHeight:"100vh", padding:"20px 24px 40px", display:"flex", flexDirection:"column", gap:18 }}>

        {/* Rich header */}
        <div style={{ background:"#FFFFFF", borderRadius:20, border:"1px solid #EBEDF2", padding:"16px 24px", display:"flex", alignItems:"center", justifyContent:"space-between", gap:16, boxShadow:"0 2px 10px rgba(0,0,0,0.05)" }}>

          {/* Title + date */}
          <div style={{ flexShrink:0 }}>
            <h1 style={{ fontSize:26, fontWeight:900, color:"#111111", fontFamily:"var(--font-jakarta)", margin:"0 0 3px" }}>
              Daily <span style={{ color:"#DE1A1A" }}>Update</span>
            </h1>
            <p style={{ fontSize:11, color:"#9CA3AF", margin:0 }}>{dateLabel}</p>
          </div>

          {/* Girl greeting card */}
          <div style={{ display:"flex", alignItems:"center", borderRadius:16, overflow:"hidden", background:"rgba(222,26,26,0.03)", border:"1px solid rgba(222,26,26,0.12)", flex:1, maxWidth:340 }}>
            <div style={{ position:"relative", width:70, height:80, flexShrink:0 }}>
              <Image src="/brand/assistant-girl.jpg" alt="" fill style={{ objectFit:"cover", objectPosition:"top center" }} />
            </div>
            <div style={{ padding:"10px 16px" }}>
              <p style={{ fontSize:13, fontWeight:800, color:"#111111", margin:"0 0 3px", fontFamily:"var(--font-jakarta)" }}>
                {greeting}, {firstName}! 👋
              </p>
              <p style={{ fontSize:11, color:"#6B7280", margin:0 }}>Let&apos;s make today productive.</p>
            </div>
          </div>

          {/* Calendar widget */}
          <div style={{ background:"#FAFBFC", borderRadius:16, border:"1px solid #EBEDF2", padding:"12px 18px", textAlign:"center", flexShrink:0 }}>
            <p style={{ fontSize:10, color:"#9CA3AF", margin:"0 0 4px", fontWeight:600, textTransform:"uppercase", letterSpacing:"0.08em" }}>{calMonth}</p>
            <p style={{ fontSize:32, fontWeight:900, color:"#DE1A1A", margin:"0 0 2px", lineHeight:1, fontFamily:"var(--font-jakarta)" }}>{calDay}</p>
            <p style={{ fontSize:10, color:"#6B7280", margin:0, fontWeight:600 }}>{calWeekday}</p>
          </div>

          {/* Day progress ring */}
          <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:6, flexShrink:0 }}>
            <div style={{ position:"relative", width:80, height:80 }}>
              <svg viewBox="0 0 80 80" width="80" height="80">
                <circle cx="40" cy="40" r={ringR} fill="none" stroke="#F3F4F6" strokeWidth="8" />
                <circle cx="40" cy="40" r={ringR} fill="none" stroke="#DE1A1A" strokeWidth="8"
                  strokeDasharray={`${ringFilled} ${ringCirc}`} strokeLinecap="round"
                  transform="rotate(-90 40 40)" style={{ transition:"stroke-dasharray 0.5s ease" }} />
              </svg>
              <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center" }}>
                <span style={{ fontSize:15, fontWeight:900, color:"#111111" }}>{dayPct}%</span>
              </div>
            </div>
            <div style={{ textAlign:"center" }}>
              <p style={{ fontSize:10, fontWeight:700, color:"#374151", margin:"0 0 1px" }}>Day Progress</p>
              <p style={{ fontSize:9, color:"#9CA3AF", margin:0 }}>{elapsed}/{totalWorkHours} hrs</p>
            </div>
          </div>
        </div>

        {/* Main grid */}
        <div style={{ display:"grid", gridTemplateColumns:"1fr 300px", gap:18, alignItems:"start" }}>

          {/* Left — Timeline */}
          <div style={{ background:"#FFFFFF", borderRadius:20, border:"1px solid #EBEDF2", padding:"20px 22px", boxShadow:"0 2px 10px rgba(0,0,0,0.05)" }}>
            <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:20 }}>
              <div style={{ width:34, height:34, borderRadius:10, background:"rgba(222,26,26,0.1)", display:"flex", alignItems:"center", justifyContent:"center" }}>
                <Clock size={16} style={{ color:"#DE1A1A" }} />
              </div>
              <div>
                <p style={{ fontSize:14, fontWeight:800, color:"#111111", margin:0 }}>Today&apos;s Timeline</p>
                <p style={{ fontSize:10, color:"#9CA3AF", margin:0 }}>{filledSlots.length} of {timeSlots.length} slots filled</p>
              </div>
            </div>

            <div style={{ display:"flex", flexDirection:"column" }}>
              {timeSlots.map((slot, i) => {
                const isCurrent = h >= 9 + i && h < 10 + i
                const statusCfg = slot.status === "completed"
                  ? { bg:"rgba(34,197,94,0.1)", color:"#16A34A", border:"rgba(34,197,94,0.3)" }
                  : slot.status === "in_progress"
                  ? { bg:"rgba(245,158,11,0.1)", color:"#D97706", border:"rgba(245,158,11,0.3)" }
                  : { bg:"#F9FAFB", color:"#9CA3AF", border:"#E5E7EB" }
                return (
                  <div key={slot.id} style={{
                    display:"flex", alignItems:"center", gap:10,
                    padding:"11px 8px",
                    borderBottom: i < timeSlots.length - 1 ? "1px solid #F5F5F7" : "none",
                    background: isCurrent ? "rgba(222,26,26,0.02)" : "transparent",
                    borderRadius: isCurrent ? 10 : 0,
                  }}>
                    {/* Time label */}
                    <span style={{ width:112, flexShrink:0, fontSize:11, fontWeight:800,
                      color: isCurrent ? "#DE1A1A" : "#6B7280", fontFamily:"var(--font-jakarta)" }}>
                      {slot.label}
                    </span>
                    {/* Clock circle */}
                    <div style={{ width:30, height:30, borderRadius:"50%", flexShrink:0,
                      background: isCurrent ? "#DE1A1A" : "#F3F4F6",
                      display:"flex", alignItems:"center", justifyContent:"center" }}>
                      <Clock size={13} style={{ color: isCurrent ? "#FFFFFF" : "#9CA3AF" }} />
                    </div>
                    {/* Description input */}
                    <input value={slot.description} onChange={e => patchSlot(slot.id, { description: e.target.value })}
                      placeholder="What did you work on this hour?"
                      style={{ flex:1, background:"transparent", border:"none", outline:"none",
                        fontSize:12, color:"#111827", fontFamily:"inherit", padding:"0 4px" }} />
                    {/* Project pill */}
                    {projects.length > 0 ? (
                      <select value={slot.projectName} onChange={e => patchSlot(slot.id, { projectName: e.target.value })}
                        style={{ fontSize:10, fontWeight:700,
                          color: slot.projectName ? "#DE1A1A" : "#9CA3AF",
                          background: slot.projectName ? "rgba(222,26,26,0.08)" : "#F3F4F6",
                          border: slot.projectName ? "1.5px solid rgba(222,26,26,0.25)" : "1.5px solid #E5E7EB",
                          borderRadius:20, padding:"3px 8px", appearance:"none", cursor:"pointer",
                          maxWidth:110, flexShrink:0 }}>
                        <option value="">Project</option>
                        {projects.map(p => <option key={p.id} value={p.business_name}>{p.business_name}</option>)}
                      </select>
                    ) : (
                      <input value={slot.projectName} onChange={e => patchSlot(slot.id, { projectName: e.target.value })}
                        placeholder="Project"
                        style={{ fontSize:10, fontWeight:700, color:"#9CA3AF", background:"#F3F4F6",
                          border:"1.5px solid #E5E7EB", borderRadius:20, padding:"3px 8px",
                          maxWidth:100, outline:"none", flexShrink:0 }} />
                    )}
                    {/* Status dropdown */}
                    <select value={slot.status} onChange={e => patchSlot(slot.id, { status: e.target.value as TimeSlot["status"] })}
                      style={{ fontSize:10, fontWeight:700, color:statusCfg.color,
                        background:statusCfg.bg, border:`1.5px solid ${statusCfg.border}`,
                        borderRadius:20, padding:"3px 8px", appearance:"none", cursor:"pointer", flexShrink:0 }}>
                      <option value="not_started">Not Started</option>
                      <option value="in_progress">In Progress</option>
                      <option value="completed">Completed ✓</option>
                    </select>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Right — Sidebar */}
          <div style={{ display:"flex", flexDirection:"column", gap:16 }}>

            {/* Today's Overview */}
            <div style={{ background:"#FFFFFF", borderRadius:20, border:"1px solid #EBEDF2", overflow:"hidden", boxShadow:"0 2px 10px rgba(0,0,0,0.05)" }}>
              <div style={{ position:"relative", height:140 }}>
                <Image src="/brand/daily-boy.png" alt="" fill style={{ objectFit:"cover", objectPosition:"center top" }} />
                <div style={{ position:"absolute", inset:0, background:"linear-gradient(to bottom, transparent 40%, #FFFFFF 100%)" }} />
              </div>
              <div style={{ padding:"14px 16px" }}>
                <p style={{ fontSize:13, fontWeight:800, color:"#111111", margin:"0 0 12px", display:"flex", alignItems:"center", gap:7 }}>
                  <BarChart2 size={13} style={{ color:"#DE1A1A" }} /> Today&apos;s Overview
                </p>
                <div style={{ display:"flex", flexDirection:"column", gap:9 }}>
                  {([
                    { label:"Hours Logged", value:`${elapsed}/${totalWorkHours} hrs`, color: elapsed >= 8 ? "#22C55E" : "#111111" },
                    { label:"Focus Time", value: filledSlots.filter(s=>s.status!=="not_started").length > 0 ? `${filledSlots.filter(s=>s.status!=="not_started").length}h active` : "—", color:"#6366F1" },
                    { label:"Productivity", value:`${generalProductivity}%`, color: generalProductivity >= 70 ? "#22C55E" : generalProductivity > 0 ? "#F59E0B" : "#9CA3AF" },
                    { label:"Status", badge:{ text: filledSlots.length===0?"Not started":generalProductivity>=70?"On track":"In Progress", bg: filledSlots.length===0?"#9CA3AF":generalProductivity>=70?"#22C55E":"#F59E0B" } },
                  ] as Array<{label:string;value?:string;color?:string;badge?:{text:string;bg:string}}>
                  ).map((r,idx)=>(
                    <div key={idx} style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                      <span style={{ fontSize:11, color:"#9CA3AF" }}>{r.label}</span>
                      {r.badge ? (
                        <span style={{ fontSize:10, fontWeight:700, color:"#fff", background:r.badge.bg, padding:"2px 8px", borderRadius:6 }}>{r.badge.text}</span>
                      ) : (
                        <span style={{ fontSize:11, fontWeight:700, color:r.color }}>{r.value}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Productivity Score */}
            <div style={{ background:"#FFFFFF", borderRadius:20, border:"1px solid #EBEDF2", padding:"16px", boxShadow:"0 2px 10px rgba(0,0,0,0.05)" }}>
              <p style={{ fontSize:13, fontWeight:800, color:"#111111", margin:"0 0 12px", display:"flex", alignItems:"center", gap:7 }}>
                <BarChart2 size={14} style={{ color:"#DE1A1A" }} /> Productivity Score
              </p>
              <GaugeChart score={generalProductivity} />
              <p style={{ fontSize:10, color:"#9CA3AF", textAlign:"center", marginTop:6 }}>
                {generalProductivity===0?"Fill in your tasks above ✍️":generalProductivity>=70?"You're on fire! 🔥":"Keep going! 💪"}
              </p>
            </div>

            {/* Mood selector */}
            <div style={{ background:"#FFFFFF", borderRadius:20, border:"1px solid #EBEDF2", padding:"16px", boxShadow:"0 2px 10px rgba(0,0,0,0.05)" }}>
              <p style={{ fontSize:13, fontWeight:800, color:"#111111", margin:"0 0 14px" }}>How do you feel today?</p>
              <div style={{ display:"flex", gap:4, justifyContent:"space-between" }}>
                {MOODS.map(m => (
                  <button key={m.key} onClick={() => setMood(m.key)} title={m.label}
                    style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:4,
                      padding:"8px 4px", borderRadius:12, flex:1, cursor:"pointer", border:"none",
                      background: mood===m.key ? "rgba(222,26,26,0.05)" : "transparent",
                      outline: mood===m.key ? "2px solid #DE1A1A" : "2px solid transparent",
                      transition:"all 0.15s" }}>
                    <span style={{ fontSize:20 }}>{m.emoji}</span>
                    <span style={{ fontSize:8, color: mood===m.key?"#DE1A1A":"#9CA3AF", fontWeight:600, lineHeight:1.2, textAlign:"center" }}>{m.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* AI Assistant */}
            <div style={{ background:"#FFFFFF", borderRadius:20, border:"1px solid #EBEDF2", padding:"16px", boxShadow:"0 2px 10px rgba(0,0,0,0.05)" }}>
              <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:12 }}>
                <div style={{ width:44, height:44, borderRadius:14, flexShrink:0,
                  background:"linear-gradient(135deg, #3B82F6 0%, #1D4ED8 100%)",
                  display:"flex", alignItems:"center", justifyContent:"center",
                  boxShadow:"0 4px 12px rgba(59,130,246,0.3)" }}>
                  <span style={{ fontSize:22 }}>🤖</span>
                </div>
                <div>
                  <p style={{ fontSize:12, fontWeight:800, color:"#111111", margin:"0 0 3px" }}>AI Assistant</p>
                  <p style={{ fontSize:11, color:"#6B7280", margin:0, lineHeight:1.4 }}>
                    Hi {firstName}! 👋 Need help logging your update?
                  </p>
                </div>
              </div>
              <button style={{ width:"100%", padding:"10px 0", borderRadius:12, border:"none",
                cursor:"pointer", background:"#DE1A1A", color:"#FFFFFF", fontSize:12, fontWeight:700,
                boxShadow:"0 4px 14px rgba(222,26,26,0.35)" }}>
                Get AI Suggestion
              </button>
            </div>
          </div>
        </div>

        {/* Bottom submit bar */}
        <div style={{ background:"#FFFFFF", borderRadius:16, border:"1px solid #EBEDF2", padding:"14px 24px",
          display:"flex", alignItems:"center", justifyContent:"space-between",
          boxShadow:"0 2px 10px rgba(0,0,0,0.05)" }}>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <CheckCircle2 size={16} style={{ color:"#22C55E" }} />
            <span style={{ fontSize:12, color:"#6B7280", fontWeight:500 }}>Auto-saved just now</span>
          </div>
          {error && <p style={{ fontSize:12, fontWeight:600, color:"#DE1A1A", margin:0 }}>{error}</p>}
          <button onClick={handleGeneralSubmit} disabled={isPending}
            style={{ display:"flex", alignItems:"center", gap:8, padding:"12px 32px", borderRadius:16,
              fontSize:14, fontWeight:700, border:"none", cursor: isPending?"not-allowed":"pointer",
              background:"#DE1A1A", color:"#FFFFFF", boxShadow:"0 4px 18px rgba(222,26,26,0.4)",
              opacity: isPending?0.7:1, transition:"all 0.2s" }}>
            {isPending ? <Loader2 size={14} className="animate-spin" /> : <SendHorizonal size={14} />}
            {isPending ? "Submitting…" : "Submit Daily Update →"}
          </button>
        </div>
      </div>
    )
  }

  // ── Section header ─────────────────────────────────────────────────────────
  function SectionHead({ icon, label, count, color }: { icon: React.ReactNode; label: string; count: number; color: string }) {
    return (
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16 }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <div style={{ width:34, height:34, borderRadius:10, background:`${color}18`, display:"flex", alignItems:"center", justifyContent:"center" }}>
            {icon}
          </div>
          <div>
            <p style={{ fontSize:14, fontWeight:800, color:"#111111", margin:0 }}>{label}</p>
            <p style={{ fontSize:10, color:"#9CA3AF", margin:0 }}>{count} entr{count !== 1 ? "ies" : "y"} today</p>
          </div>
        </div>
        <button style={{ background:"none", border:"none", cursor:"pointer", color:"#9CA3AF", padding:4, borderRadius:6, display:"flex", alignItems:"center" }}>
          <MoreHorizontal size={16} />
        </button>
      </div>
    )
  }

  // ── Main render ────────────────────────────────────────────────────────────
  return (
    <div style={{ background:"#F5F6FA", minHeight:"100vh", padding:"20px 24px 40px" }}>

      {/* ── PAGE HEADER ─────────────────────────────────────────────────────── */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:22, flexWrap:"wrap", gap:12 }}>
        <div>
          <h1 style={{ fontSize:28, fontWeight:900, color:"#111111", fontFamily:"var(--font-jakarta)", margin:"0 0 3px" }}>
            Daily <span style={{ color:"#DE1A1A" }}>Update</span>
          </h1>
          <p style={{ fontSize:12, color:"#6B7280", margin:0 }}>{dateLabel}</p>
        </div>

        {/* Greeting card */}
        <div style={{ display:"flex", alignItems:"center", gap:0, borderRadius:16, overflow:"hidden", background:"#FFFFFF", border:"1px solid #EBEDF2", boxShadow:"0 2px 10px rgba(0,0,0,0.05)" }}>
          <div style={{ position:"relative", width:68, height:78, flexShrink:0 }}>
            <Image src="/brand/assistant-girl.jpg" alt="" fill style={{ objectFit:"cover", objectPosition:"top center" }} />
          </div>
          <div style={{ padding:"10px 16px" }}>
            <p style={{ fontSize:13, fontWeight:800, color:"#111111", margin:"0 0 2px", fontFamily:"var(--font-jakarta)" }}>{greeting}, {firstName}! 👋</p>
            <p style={{ fontSize:11, color:"#6B7280", margin:0 }}>Log your media work for today.</p>
          </div>
        </div>
      </div>

      {/* ── MAIN LAYOUT ─────────────────────────────────────────────────────── */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 280px", gap:18, alignItems:"start" }}>

        {/* ── LEFT ─ Form ──────────────────────────────────────────────────── */}
        <div style={{ display:"flex", flexDirection:"column", gap:16 }}>

          {/* Tab selector */}
          <div style={{ display:"flex", gap:6, background:"#FFFFFF", borderRadius:14, padding:5, border:"1px solid #EBEDF2", width:"fit-content", boxShadow:"0 1px 4px rgba(0,0,0,0.04)" }}>
            {(["working","learning"] as const).map(t => (
              <button key={t} onClick={() => setTab(t)}
                style={{ padding:"9px 22px", borderRadius:10, fontSize:13, fontWeight:700, border:"none", cursor:"pointer", transition:"all 0.18s",
                  background: tab === t ? "#DE1A1A" : "transparent",
                  color:      tab === t ? "#fff"    : "#9CA3AF",
                  boxShadow:  tab === t ? "0 4px 14px rgba(222,26,26,0.35)" : "none",
                }}>
                {t === "working" ? "⚡  Working" : "📚  Learning"}
              </button>
            ))}
          </div>

          {tab === "working" && (<>

            {/* ── SHOOTS SECTION ────────────────────────────────────────────── */}
            <div style={{ background:"#FFFFFF", borderRadius:20, border:"1px solid #EBEDF2", padding:"20px 22px", boxShadow:"0 2px 10px rgba(0,0,0,0.05)" }}>
              <SectionHead icon={<Camera size={16} style={{ color:"#EF4444" }} />} label="Shoots Today" count={shoots.length} color="#EF4444" />

              {shoots.length === 0 ? (
                <div onClick={addShoot}
                  style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:14, padding:"32px 0", borderRadius:16, border:"2px dashed #FECACA", background:"rgba(239,68,68,0.02)", cursor:"pointer" }}>
                  <div style={{ position:"relative", width:180, height:140 }}>
                    <Image src="/brand/shoot-illustration.png" alt="Shoots" fill style={{ objectFit:"contain" }} />
                  </div>
                  <p style={{ fontSize:13, fontWeight:600, color:"#9CA3AF", margin:0 }}>No shoots logged yet</p>
                  <span style={{ fontSize:12, color:"#FFFFFF", fontWeight:700, background:"#DE1A1A", padding:"9px 22px", borderRadius:10, boxShadow:"0 4px 14px rgba(222,26,26,0.35)" }}>
                    + Add shoot
                  </span>
                </div>
              ) : (
                <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
                  {shoots.map((s, i) => (
                    <div key={s.id} style={{ background:"#FAFBFC", borderRadius:14, border:"1px solid #F0F1F5", padding:"14px 16px" }}>
                      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:12 }}>
                        <span style={{ fontSize:11, fontWeight:800, color:"#EF4444", textTransform:"uppercase", letterSpacing:"0.1em" }}>Shoot #{i + 1}</span>
                        <button onClick={() => removeShoot(s.id)}
                          style={{ width:26, height:26, borderRadius:8, background:"rgba(239,68,68,0.08)", border:"none", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>
                          <Trash2 size={12} style={{ color:"#EF4444" }} />
                        </button>
                      </div>
                      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:10 }}>
                        <div>
                          <label style={{ display:"block", fontSize:10, fontWeight:700, color:"#374151", textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:5 }}>Client / Project *</label>
                          {projects.length > 0 ? (
                            <div style={{ position:"relative" }}>
                              <select value={s.clientName} onChange={e => patchShoot(s.id, { clientName: e.target.value })} style={{ ...F, paddingRight:28, appearance:"none" }}>
                                <option value="">Select project…</option>
                                {projects.map(p => <option key={p.id} value={p.business_name}>{p.business_name}</option>)}
                              </select>
                              <ChevronDown size={11} style={{ position:"absolute", right:10, top:"50%", transform:"translateY(-50%)", color:"#9CA3AF", pointerEvents:"none" }} />
                            </div>
                          ) : (
                            <input value={s.clientName} onChange={e => patchShoot(s.id, { clientName: e.target.value })} placeholder="Client name…" style={F} />
                          )}
                        </div>
                        <div>
                          <label style={{ display:"block", fontSize:10, fontWeight:700, color:"#374151", textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:5 }}>Shoot Type / Title *</label>
                          <input value={s.title} onChange={e => patchShoot(s.id, { title: e.target.value })} placeholder="e.g. Basketball Tournament Shoot" style={F} />
                        </div>
                      </div>
                      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 100px", gap:10, marginBottom:10 }}>
                        <div>
                          <label style={{ display:"block", fontSize:10, fontWeight:700, color:"#374151", textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:5 }}>Start Time</label>
                          <div style={{ position:"relative" }}>
                            <select value={s.startTime} onChange={e => {
                              const st = e.target.value
                              const dur = calcDuration(st, s.endTime)
                              patchShoot(s.id, { startTime: st, durationHours: dur || s.durationHours })
                            }} style={{ ...F, paddingRight:28, appearance:"none" }}>
                              {TIME_OPTIONS.map(t => <option key={t} value={t}>{fmt12(t)}</option>)}
                            </select>
                            <ChevronDown size={11} style={{ position:"absolute", right:10, top:"50%", transform:"translateY(-50%)", color:"#9CA3AF", pointerEvents:"none" }} />
                          </div>
                        </div>
                        <div>
                          <label style={{ display:"block", fontSize:10, fontWeight:700, color:"#374151", textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:5 }}>End Time</label>
                          <div style={{ position:"relative" }}>
                            <select value={s.endTime} onChange={e => {
                              const et = e.target.value
                              const dur = calcDuration(s.startTime, et)
                              patchShoot(s.id, { endTime: et, durationHours: dur || s.durationHours })
                            }} style={{ ...F, paddingRight:28, appearance:"none" }}>
                              {TIME_OPTIONS.map(t => <option key={t} value={t}>{fmt12(t)}</option>)}
                            </select>
                            <ChevronDown size={11} style={{ position:"absolute", right:10, top:"50%", transform:"translateY(-50%)", color:"#9CA3AF", pointerEvents:"none" }} />
                          </div>
                        </div>
                        <div>
                          <label style={{ display:"block", fontSize:10, fontWeight:700, color:"#374151", textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:5 }}>Duration</label>
                          <DurationPicker value={s.durationHours} onChange={v => patchShoot(s.id, { durationHours: v })} />
                        </div>
                      </div>
                      <div style={{ display:"grid", gridTemplateColumns:"1fr auto", gap:10, alignItems:"start" }}>
                        <div>
                          <label style={{ display:"block", fontSize:10, fontWeight:700, color:"#374151", textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:5 }}>Notes</label>
                          <input value={s.notes} onChange={e => patchShoot(s.id, { notes: e.target.value })} placeholder="Location, shots taken, any issues…" style={F} />
                        </div>
                        <div style={{ paddingTop:24 }}>
                          <button onClick={() => patchShoot(s.id, { videoUploaded: !s.videoUploaded })}
                            style={{ display:"flex", alignItems:"center", gap:6, padding:"9px 14px", borderRadius:10, border:"1.5px solid", cursor:"pointer", fontSize:11, fontWeight:700, transition:"all 0.15s",
                              background:  s.videoUploaded ? "rgba(34,197,94,0.1)"  : "#F9FAFB",
                              borderColor: s.videoUploaded ? "rgba(34,197,94,0.4)"  : "#EBEDF2",
                              color:       s.videoUploaded ? "#16A34A" : "#9CA3AF",
                            }}>
                            <Upload size={12} />
                            {s.videoUploaded ? "Uploaded ✓" : "Video Uploaded?"}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {shoots.length > 0 && (
                <button onClick={addShoot}
                  style={{ display:"flex", alignItems:"center", gap:7, marginTop:12, padding:"9px 16px", borderRadius:10, background:"rgba(239,68,68,0.06)", border:"1.5px dashed rgba(239,68,68,0.3)", color:"#EF4444", fontSize:12, fontWeight:700, cursor:"pointer" }}>
                  <Plus size={13} /> Add Another Shoot
                </button>
              )}
            </div>

            {/* ── EDITS SECTION ─────────────────────────────────────────────── */}
            <div style={{ background:"#FFFFFF", borderRadius:20, border:"1px solid #EBEDF2", padding:"20px 22px", boxShadow:"0 2px 10px rgba(0,0,0,0.05)" }}>
              <SectionHead icon={<Film size={16} style={{ color:"#6366F1" }} />} label="Editing Today" count={edits.length} color="#6366F1" />

              {edits.length === 0 ? (
                <div onClick={addEdit}
                  style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:14, padding:"32px 0", borderRadius:16, border:"2px dashed #C7D2FE", background:"rgba(99,102,241,0.02)", cursor:"pointer" }}>
                  <div style={{ position:"relative", width:180, height:140 }}>
                    <Image src="/brand/edit-illustration.png" alt="Editing" fill style={{ objectFit:"contain" }} />
                  </div>
                  <p style={{ fontSize:13, fontWeight:600, color:"#9CA3AF", margin:0 }}>No editing logged yet</p>
                  <span style={{ fontSize:12, color:"#FFFFFF", fontWeight:700, background:"#6366F1", padding:"9px 22px", borderRadius:10, boxShadow:"0 4px 14px rgba(99,102,241,0.35)" }}>
                    + Add edit
                  </span>
                </div>
              ) : (
                <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
                  {edits.map((e, i) => (
                    <div key={e.id} style={{ background:"#FAFBFC", borderRadius:14, border:"1px solid #F0F1F5", padding:"14px 16px" }}>

                      {/* Card header */}
                      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14 }}>
                        <span style={{ fontSize:11, fontWeight:800, color:"#6366F1", textTransform:"uppercase", letterSpacing:"0.1em" }}>Edit #{i + 1}</span>
                        <button onClick={() => removeEdit(e.id)}
                          style={{ width:26, height:26, borderRadius:8, background:"rgba(99,102,241,0.08)", border:"none", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>
                          <Trash2 size={12} style={{ color:"#6366F1" }} />
                        </button>
                      </div>

                      {/* Row 1 — Dates */}
                      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:10 }}>
                        <div>
                          <label style={{ display:"block", fontSize:10, fontWeight:700, color:"#374151", textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:5 }}>Date Given</label>
                          <input type="date" value={e.dateGiven} onChange={ev => patchEdit(e.id, { dateGiven: ev.target.value })} style={{ ...F, colorScheme:"light" }} />
                        </div>
                        <div>
                          <label style={{ display:"block", fontSize:10, fontWeight:700, color:"#374151", textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:5 }}>Date Finished</label>
                          <input type="date" value={e.dateFinished} onChange={ev => patchEdit(e.id, { dateFinished: ev.target.value })} style={{ ...F, colorScheme:"light" }} />
                        </div>
                      </div>

                      {/* Row 2 — Client & Video Name */}
                      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:10 }}>
                        <div>
                          <label style={{ display:"block", fontSize:10, fontWeight:700, color:"#374151", textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:5 }}>Client Name *</label>
                          {projects.length > 0 ? (
                            <div style={{ position:"relative" }}>
                              <select value={e.clientName} onChange={ev => patchEdit(e.id, { clientName: ev.target.value })} style={{ ...F, paddingRight:28, appearance:"none" }}>
                                <option value="">Select project…</option>
                                {projects.map(p => <option key={p.id} value={p.business_name}>{p.business_name}</option>)}
                              </select>
                              <ChevronDown size={11} style={{ position:"absolute", right:10, top:"50%", transform:"translateY(-50%)", color:"#9CA3AF", pointerEvents:"none" }} />
                            </div>
                          ) : (
                            <input value={e.clientName} onChange={ev => patchEdit(e.id, { clientName: ev.target.value })} placeholder="Client name…" style={F} />
                          )}
                        </div>
                        <div>
                          <label style={{ display:"block", fontSize:10, fontWeight:700, color:"#374151", textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:5 }}>Video Name *</label>
                          <input value={e.title} onChange={ev => patchEdit(e.id, { title: ev.target.value })} placeholder="e.g. Evan Styles Makeover Reel" style={F} />
                        </div>
                      </div>

                      {/* Row 3 — Video Type, Duration, Revisions */}
                      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 110px", gap:10, marginBottom:10 }}>
                        <div>
                          <label style={{ display:"block", fontSize:10, fontWeight:700, color:"#374151", textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:5 }}>Video Type</label>
                          <div style={{ position:"relative" }}>
                            <select value={e.videoType} onChange={ev => patchEdit(e.id, { videoType: ev.target.value })} style={{ ...F, paddingRight:28, appearance:"none" }}>
                              <option value="">Select type…</option>
                              {["Reel","Short Film","Long Form / YouTube","Teaser","Promotional","Interview","Tutorial","Documentary","Social Media","Other"].map(t => (
                                <option key={t} value={t}>{t}</option>
                              ))}
                            </select>
                            <ChevronDown size={11} style={{ position:"absolute", right:10, top:"50%", transform:"translateY(-50%)", color:"#9CA3AF", pointerEvents:"none" }} />
                          </div>
                        </div>
                        <div>
                          <label style={{ display:"block", fontSize:10, fontWeight:700, color:"#374151", textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:5 }}>Duration</label>
                          <input value={e.videoDuration} onChange={ev => patchEdit(e.id, { videoDuration: ev.target.value })} placeholder="e.g. 30 sec, 2:30 min" style={F} />
                        </div>
                        <div>
                          <label style={{ display:"block", fontSize:10, fontWeight:700, color:"#374151", textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:5 }}>Revisions</label>
                          <input type="number" min="0" max="99" value={e.revisions}
                            onChange={ev => patchEdit(e.id, { revisions: parseInt(ev.target.value) || 0 })}
                            placeholder="0" style={F} />
                        </div>
                      </div>

                      {/* Row 4 — Time Taken & Drive Updated */}
                      <div style={{ display:"grid", gridTemplateColumns:"1fr auto", gap:10, alignItems:"end", marginBottom:10 }}>
                        <div>
                          <label style={{ display:"block", fontSize:10, fontWeight:700, color:"#374151", textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:5 }}>Time Taken (editing hours)</label>
                          <DurationPicker value={e.timeTaken} onChange={v => patchEdit(e.id, { timeTaken: v })} />
                        </div>
                        <div>
                          <button onClick={() => patchEdit(e.id, { driveUpdated: !e.driveUpdated })}
                            style={{ display:"flex", alignItems:"center", gap:6, padding:"9px 14px", borderRadius:10, border:"1.5px solid", cursor:"pointer", fontSize:11, fontWeight:700, transition:"all 0.15s", whiteSpace:"nowrap",
                              background:  e.driveUpdated ? "rgba(34,197,94,0.1)"  : "#F9FAFB",
                              borderColor: e.driveUpdated ? "rgba(34,197,94,0.4)"  : "#EBEDF2",
                              color:       e.driveUpdated ? "#16A34A" : "#9CA3AF",
                            }}>
                            <Upload size={12} />
                            {e.driveUpdated ? "Drive Updated ✓" : "Drive Updated?"}
                          </button>
                        </div>
                      </div>

                      {/* Row 5 — Notes & Drive Link */}
                      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                        <div>
                          <label style={{ display:"block", fontSize:10, fontWeight:700, color:"#374151", textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:5 }}>Notes</label>
                          <input value={e.notes} onChange={ev => patchEdit(e.id, { notes: ev.target.value })} placeholder="Software used, challenges…" style={F} />
                        </div>
                        <div>
                          <label style={{ display:"block", fontSize:10, fontWeight:700, color:"#374151", textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:5 }}>
                            <Link2 size={9} style={{ display:"inline", marginRight:4 }} />Drive / Video Link
                          </label>
                          <input value={e.videoLink} onChange={ev => patchEdit(e.id, { videoLink: ev.target.value })} placeholder="https://drive.google.com/…" style={F} />
                        </div>
                      </div>

                    </div>
                  ))}
                </div>
              )}

              {edits.length > 0 && (
                <button onClick={addEdit}
                  style={{ display:"flex", alignItems:"center", gap:7, marginTop:12, padding:"9px 16px", borderRadius:10, background:"rgba(99,102,241,0.06)", border:"1.5px dashed rgba(99,102,241,0.3)", color:"#6366F1", fontSize:12, fontWeight:700, cursor:"pointer" }}>
                  <Plus size={13} /> Add Another Edit
                </button>
              )}
            </div>

          </>)}

          {/* ── LEARNING TAB ──────────────────────────────────────────────────── */}
          {tab === "learning" && (
            <div style={{ background:"#FFFFFF", borderRadius:20, border:"1px solid #EBEDF2", padding:"20px 22px", boxShadow:"0 2px 10px rgba(0,0,0,0.05)" }}>
              <SectionHead icon={<BookOpen size={16} style={{ color:"#10B981" }} />} label="What did you learn today?" count={0} color="#10B981" />
              <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
                <div>
                  <label style={{ display:"block", fontSize:10, fontWeight:700, color:"#374151", textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:6 }}>Topic / Course *</label>
                  <input value={learningTopic} onChange={e => setLearningTopic(e.target.value)} placeholder="e.g. DaVinci Resolve color grading, Adobe Premiere…" style={F} />
                </div>
                <div style={{ display:"grid", gridTemplateColumns:"160px 1fr", gap:14 }}>
                  <div>
                    <label style={{ display:"block", fontSize:10, fontWeight:700, color:"#374151", textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:6 }}>Hours Spent *</label>
                    <DurationPicker value={learningHours} onChange={setLearningHours} />
                  </div>
                  <div>
                    <label style={{ display:"block", fontSize:10, fontWeight:700, color:"#374151", textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:6 }}>Notes</label>
                    <input value={learningNotes} onChange={e => setLearningNotes(e.target.value)} placeholder="Key takeaways, resources used…" style={F} />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── SUBMIT BAR ────────────────────────────────────────────────────── */}
          <div style={{ background:"#FFFFFF", borderRadius:16, border:"1px solid #EBEDF2", padding:"14px 18px", display:"flex", alignItems:"center", justifyContent:"space-between", gap:12, boxShadow:"0 2px 10px rgba(0,0,0,0.05)" }}>
            <div>
              {error && <p style={{ fontSize:12, fontWeight:600, color:"#DE1A1A", margin:0 }}>{error}</p>}
              {!error && (
                <p style={{ fontSize:12, color:"#9CA3AF", margin:0 }}>
                  {tab === "working"
                    ? `${shoots.length} shoot${shoots.length !== 1 ? "s" : ""} · ${edits.length} edit${edits.length !== 1 ? "s" : ""} · ${totalHours}h total`
                    : `Learning: ${learningTopic || "not set"} · ${learningHours}h`}
                </p>
              )}
            </div>
            <button onClick={handleSubmit} disabled={isPending || submitted}
              style={{ display:"flex", alignItems:"center", gap:8, padding:"11px 24px", borderRadius:14, fontSize:13, fontWeight:700, border:"none", cursor: isPending || submitted ? "not-allowed" : "pointer", transition:"all 0.2s", opacity: isPending ? 0.7 : 1,
                background: submitted ? "#22C55E" : "#DE1A1A",
                color:"#fff", boxShadow: submitted ? "0 4px 14px rgba(34,197,94,0.4)" : "0 4px 14px rgba(222,26,26,0.4)" }}>
              {isPending   ? <Loader2     size={14} className="animate-spin" /> :
               submitted   ? <CheckCircle2 size={14} /> :
                             <SendHorizonal size={14} />}
              {isPending ? "Submitting…" : submitted ? "Submitted! ✓" : "Submit Daily Update"}
            </button>
          </div>
        </div>

        {/* ── RIGHT ─ Summary panel ────────────────────────────────────────── */}
        <div style={{ display:"flex", flexDirection:"column", gap:14 }}>

          {/* Today's Overview */}
          <div style={{ background:"#FFFFFF", borderRadius:20, border:"1px solid #EBEDF2", overflow:"hidden", boxShadow:"0 2px 10px rgba(0,0,0,0.05)" }}>
            <div style={{ position:"relative", height:150 }}>
              <Image src="/brand/daily-boy.png" alt="" fill style={{ objectFit:"cover", objectPosition:"center top" }} />
              <div style={{ position:"absolute", inset:0, background:"linear-gradient(to bottom, transparent 40%, #FFFFFF 100%)" }} />
            </div>
            <div style={{ padding:"14px 16px" }}>
              <p style={{ fontSize:13, fontWeight:800, color:"#111111", margin:"0 0 14px", display:"flex", alignItems:"center", gap:7 }}>
                <BarChart2 size={13} style={{ color:"#DE1A1A" }} /> Today&apos;s Overview
              </p>
              <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                {([
                  { icon: <Clock  size={12} style={{ color:"#9CA3AF" }} />, label:"Hours Logged", text: totalHours > 0 ? `${totalHours}h` : "—", color: totalHours >= 8 ? "#22C55E" : "#111111", badge: null },
                  { icon: <Camera size={12} style={{ color:"#EF4444" }} />, label:"Shoots",        text: String(shoots.length),                  color: shoots.length  > 0 ? "#EF4444" : "#9CA3AF", badge: null },
                  { icon: <Film   size={12} style={{ color:"#6366F1" }} />, label:"Edits",          text: String(edits.length),                   color: edits.length   > 0 ? "#6366F1" : "#9CA3AF", badge: null },
                  { icon: <Zap    size={12} style={{ color:"#F59E0B" }} />, label:"Status",         text: null, color: "#111",
                    badge: { text: totalHours === 0 ? "Not started" : totalHours >= 8 ? "On track" : "In Progress",
                             bg: totalHours >= 8 ? "#22C55E" : totalHours > 0 ? "#F59E0B" : "#DE1A1A" } },
                ] as Array<{ icon: React.ReactNode; label: string; text: string | null; color: string; badge: { text: string; bg: string } | null }>
                ).map((r, idx) => (
                  <div key={idx} style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                    <span style={{ fontSize:11, color:"#9CA3AF", display:"flex", alignItems:"center", gap:6 }}>
                      {r.icon}{r.label}
                    </span>
                    {r.badge ? (
                      <span style={{ fontSize:10, fontWeight:700, color:"#fff", background:r.badge.bg, padding:"2px 8px", borderRadius:6 }}>{r.badge.text}</span>
                    ) : (
                      <span style={{ fontSize:11, fontWeight:700, color:r.color }}>{r.text}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Productivity Score */}
          <div style={{ background:"#FFFFFF", borderRadius:20, border:"1px solid #EBEDF2", padding:"16px", boxShadow:"0 2px 10px rgba(0,0,0,0.05)" }}>
            <div style={{ display:"flex", alignItems:"center", gap:7, marginBottom:12 }}>
              <BarChart2 size={14} style={{ color:"#DE1A1A" }} />
              <p style={{ fontSize:13, fontWeight:800, color:"#111111", margin:0 }}>Productivity Score</p>
            </div>
            <GaugeChart score={productivity} />
            <p style={{ fontSize:10, color:"#9CA3AF", textAlign:"center", marginTop:6 }}>
              {productivity === 0 ? "Fill in your entries above ✍️" : productivity >= 70 ? "You're on fire! 🔥" : "Keep going! 💪"}
            </p>
          </div>

          {/* Consistency card */}
          <div style={{ background:"#FFFFFF", borderRadius:20, border:"1px solid #EBEDF2", padding:"18px 16px", boxShadow:"0 2px 10px rgba(0,0,0,0.05)", display:"flex", alignItems:"flex-start", gap:14 }}>
            <div style={{ fontSize:38, flexShrink:0, lineHeight:1 }}>🏆</div>
            <div>
              <p style={{ fontSize:13, fontWeight:800, color:"#111111", margin:"0 0 6px" }}>Consistency is the key!</p>
              <p style={{ fontSize:11, color:"#6B7280", margin:0, lineHeight:1.55 }}>Keep logging your shoots and edits to improve your productivity.</p>
            </div>
          </div>

          {/* Hours breakdown — shown once entries exist */}
          {(totalShootHours > 0 || totalEditHours > 0) && (
            <div style={{ background:"#FFFFFF", borderRadius:20, border:"1px solid #EBEDF2", padding:"16px", boxShadow:"0 2px 10px rgba(0,0,0,0.05)" }}>
              <div style={{ display:"flex", alignItems:"center", gap:7, marginBottom:14 }}>
                <Zap size={14} style={{ color:"#F59E0B" }} />
                <p style={{ fontSize:13, fontWeight:800, color:"#111111", margin:0 }}>Hours Breakdown</p>
              </div>
              {[
                { label:"Shoot Time", hours: totalShootHours, color:"#EF4444", icon:Camera },
                { label:"Edit Time",  hours: totalEditHours,  color:"#6366F1", icon:Film   },
              ].map(b => (
                <div key={b.label} style={{ marginBottom:10 }}>
                  <div style={{ display:"flex", justifyContent:"space-between", marginBottom:5 }}>
                    <span style={{ fontSize:11, color:"#6B7280", display:"flex", alignItems:"center", gap:5 }}>
                      <b.icon size={11} style={{ color:b.color }} />{b.label}
                    </span>
                    <span style={{ fontSize:11, fontWeight:700, color:b.color }}>{b.hours}h</span>
                  </div>
                  <div style={{ height:5, borderRadius:99, background:"#F3F4F6", overflow:"hidden" }}>
                    <div style={{ height:"100%", borderRadius:99, background:b.color, width:`${totalHours > 0 ? (b.hours/totalHours)*100 : 0}%`, transition:"width 0.4s ease" }} />
                  </div>
                </div>
              ))}
              <div style={{ marginTop:12, paddingTop:10, borderTop:"1px solid #F0F1F5", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                <span style={{ fontSize:12, fontWeight:700, color:"#374151" }}>Total</span>
                <span style={{ fontSize:13, fontWeight:900, color:"#DE1A1A" }}>{totalHours}h</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
