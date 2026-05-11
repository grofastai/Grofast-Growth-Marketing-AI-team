"use client"

import { useState, useTransition, useMemo } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import {
  Camera, Film, Plus, Trash2, CheckCircle2,
  Loader2, SendHorizonal, Clock, BookOpen,
  ChevronDown, Upload, Link2, Zap, BarChart2,
} from "lucide-react"
import { submitDailyUpdate } from "@/lib/actions/daily-updates"

interface Project { id: string; business_name: string }

// ── Entry shapes ──────────────────────────────────────────────────────────────
interface ShootEntry {
  id: string; clientName: string; title: string
  startTime: string; endTime: string; durationHours: number
  notes: string; videoUploaded: boolean
}
interface EditEntry {
  id: string; clientName: string; title: string
  durationHours: number; videoLink: string; notes: string
}

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
  background:"#F9FAFB", border:"1.5px solid #EBEDF2", color:"#111827",
  borderRadius:10, padding:"9px 12px", fontSize:13, outline:"none", width:"100%",
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

// ── Gauge Chart ───────────────────────────────────────────────────────────────
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
            <stop offset="0%" stopColor="#FCA5A5"/><stop offset="100%" stopColor={c}/>
          </linearGradient>
        </defs>
        <path d={arc} fill="none" stroke="#F3F4F6" strokeWidth="12" strokeLinecap="round"/>
        <path d={arc} fill="none" stroke="url(#gg)" strokeWidth="12" strokeLinecap="round"
          strokeDasharray={`${filled} ${circ}`} style={{ transition:"stroke-dasharray 0.5s ease" }}/>
        <text x={cx} y={cy - 4} textAnchor="middle" fontSize="24" fontWeight="900" fill="#111111">{score}</text>
        <text x={cx} y={cy + 12} textAnchor="middle" fontSize="11" fill={c} fontWeight="700">{lbl}</text>
      </svg>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
export default function DailyUpdateForm({
  projects, userName,
}: {
  projects: Project[]; team: string | null; userName: string
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const firstName = userName.split(" ")[0] || "there"
  const now        = new Date()
  const h          = now.getHours()
  const greeting   = h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening"
  const dateLabel  = now.toLocaleDateString("en-US", { weekday:"long", day:"numeric", month:"long", year:"numeric" })

  // ── Tab ────────────────────────────────────────────────────────────────────
  const [tab, setTab] = useState<"working"|"learning">("working")

  // ── Shoot entries ──────────────────────────────────────────────────────────
  const [shoots, setShoots] = useState<ShootEntry[]>([])
  const addShoot = () => setShoots(p => [...p, { id: crypto.randomUUID(), clientName:"", title:"", startTime:"09:00", endTime:"17:00", durationHours: 8, notes:"", videoUploaded:false }])
  const patchShoot = (id: string, patch: Partial<ShootEntry>) => setShoots(p => p.map(s => s.id === id ? { ...s, ...patch } : s))
  const removeShoot = (id: string) => setShoots(p => p.filter(s => s.id !== id))

  // ── Edit entries ───────────────────────────────────────────────────────────
  const [edits, setEdits] = useState<EditEntry[]>([])
  const addEdit = () => setEdits(p => [...p, { id: crypto.randomUUID(), clientName:"", title:"", durationHours:2, videoLink:"", notes:"" }])
  const patchEdit = (id: string, patch: Partial<EditEntry>) => setEdits(p => p.map(e => e.id === id ? { ...e, ...patch } : e))
  const removeEdit = (id: string) => setEdits(p => p.filter(e => e.id !== id))

  // ── Learning ───────────────────────────────────────────────────────────────
  const [learningTopic, setLearningTopic] = useState("")
  const [learningHours, setLearningHours] = useState(1)
  const [learningNotes, setLearningNotes] = useState("")

  // ── Error / success ────────────────────────────────────────────────────────
  const [error, setError]       = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)

  // ── Derived totals ─────────────────────────────────────────────────────────
  const totalShootHours = useMemo(() => shoots.reduce((s, e) => s + e.durationHours, 0), [shoots])
  const totalEditHours  = useMemo(() => edits.reduce((s, e) => s + e.durationHours, 0), [edits])
  const totalHours      = tab === "working" ? totalShootHours + totalEditHours : learningHours
  const productivity    = useMemo(() => {
    if (tab === "learning") return learningHours > 0 ? 80 : 0
    const filled = shoots.filter(s => s.clientName && s.title).length + edits.filter(e => e.clientName && e.title).length
    const total  = shoots.length + edits.length
    if (total === 0) return 0
    return Math.round((filled / total) * 100)
  }, [tab, shoots, edits, learningHours])

  // ── Submit ─────────────────────────────────────────────────────────────────
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
        duration_hours: e.durationHours,
        notes:          e.notes,
        video_uploaded: null,
        screenshot_url: "",
        video_link:     e.videoLink,
        editing_videos: [],
      })),
    ]

    startTransition(async () => {
      const res = await submitDailyUpdate({
        active_tab:        tab,
        work_entries,
        links:             [],
        shoot_count:       shoots.length,
        editing_count:     edits.length,
        shoot_time_hours:  totalShootHours,
        editing_time_hours: totalEditHours,
        learning_hours:    tab === "learning" ? learningHours : 0,
        learning_topic:    tab === "learning" ? learningTopic : undefined,
        learning_notes:    tab === "learning" ? learningNotes : undefined,
      })
      if (!res.success) setError(res.error ?? "Submission failed.")
      else { setSubmitted(true); router.refresh() }
    })
  }

  // ── Shared section header ──────────────────────────────────────────────────
  function SectionHead({ icon, label, count, color }: { icon: React.ReactNode; label: string; count: number; color: string }) {
    return (
      <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:14 }}>
        <div style={{ width:34, height:34, borderRadius:10, background:`${color}18`, display:"flex", alignItems:"center", justifyContent:"center" }}>
          {icon}
        </div>
        <div>
          <p style={{ fontSize:14, fontWeight:800, color:"#111111", margin:0 }}>{label}</p>
          <p style={{ fontSize:10, color:"#9CA3AF", margin:0 }}>{count} entr{count !== 1 ? "ies" : "y"} today</p>
        </div>
      </div>
    )
  }

  return (
    <div style={{ background:"#F5F6FA", minHeight:"100vh", padding:"20px 24px 40px" }}>

      {/* ── PAGE HEADER ───────────────────────────────────────────────────── */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:20, flexWrap:"wrap", gap:12 }}>
        <div>
          <h1 style={{ fontSize:28, fontWeight:900, color:"#111111", fontFamily:"var(--font-jakarta)", margin:"0 0 3px" }}>
            Daily <span style={{ color:"#DE1A1A" }}>Update</span>
          </h1>
          <p style={{ fontSize:12, color:"#6B7280", margin:0 }}>{dateLabel}</p>
        </div>

        {/* Greeting card */}
        <div style={{ display:"flex", alignItems:"center", gap:0, borderRadius:16, overflow:"hidden", background:"#fff", border:"1px solid #EBEDF2", boxShadow:"0 2px 10px rgba(0,0,0,0.05)" }}>
          <div style={{ position:"relative", width:68, height:78, flexShrink:0 }}>
            <Image src="/brand/assistant-girl.jpg" alt="" fill style={{ objectFit:"cover", objectPosition:"top center" }} />
          </div>
          <div style={{ padding:"10px 16px" }}>
            <p style={{ fontSize:13, fontWeight:800, color:"#111111", margin:"0 0 2px", fontFamily:"var(--font-jakarta)" }}>{greeting}, {firstName}! 👋</p>
            <p style={{ fontSize:11, color:"#6B7280", margin:0 }}>Log your media work for today.</p>
          </div>
        </div>

        {/* Total hours pill */}
        {totalHours > 0 && (
          <div style={{ display:"flex", alignItems:"center", gap:8, padding:"10px 18px", borderRadius:16, background:"#fff", border:"1px solid #EBEDF2", boxShadow:"0 2px 10px rgba(0,0,0,0.05)" }}>
            <Clock size={15} style={{ color:"#DE1A1A" }} />
            <div>
              <p style={{ fontSize:13, fontWeight:800, color:"#111111", margin:0 }}>{totalHours}h logged</p>
              <p style={{ fontSize:10, color:"#9CA3AF", margin:0 }}>today so far</p>
            </div>
          </div>
        )}
      </div>

      {/* ── MAIN LAYOUT ───────────────────────────────────────────────────── */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 280px", gap:18, alignItems:"start" }}>

        {/* LEFT ── Form ────────────────────────────────────────────────────── */}
        <div style={{ display:"flex", flexDirection:"column", gap:16 }}>

          {/* Tab selector */}
          <div style={{ display:"flex", gap:6, background:"#fff", borderRadius:14, padding:5, border:"1px solid #EBEDF2", width:"fit-content", boxShadow:"0 1px 4px rgba(0,0,0,0.04)" }}>
            {(["working","learning"] as const).map(t => (
              <button key={t} onClick={() => setTab(t)}
                style={{ padding:"9px 22px", borderRadius:10, fontSize:13, fontWeight:700, border:"none", cursor:"pointer", transition:"all 0.18s",
                  background: tab === t ? "#DE1A1A" : "transparent",
                  color:      tab === t ? "#fff"     : "#9CA3AF",
                  boxShadow:  tab === t ? "0 4px 14px rgba(222,26,26,0.35)" : "none",
                }}>
                {t === "working" ? "🎬  Working" : "📚  Learning"}
              </button>
            ))}
          </div>

          {tab === "working" && (<>

            {/* ── SHOOTS SECTION ─────────────────────────────────────────── */}
            <div style={{ background:"#fff", borderRadius:20, border:"1px solid #EBEDF2", padding:"20px 22px", boxShadow:"0 2px 10px rgba(0,0,0,0.05)" }}>
              <SectionHead icon={<Camera size={16} style={{ color:"#EF4444" }} />} label="Shoots Today" count={shoots.length} color="#EF4444" />

              {shoots.length === 0 ? (
                <div onClick={addShoot} style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:8, padding:"28px 0", borderRadius:14, border:"2px dashed #FECACA", background:"rgba(239,68,68,0.02)", cursor:"pointer" }}>
                  <Camera size={24} style={{ color:"#FECACA" }} />
                  <p style={{ fontSize:13, fontWeight:600, color:"#9CA3AF", margin:0 }}>No shoots logged yet</p>
                  <span style={{ fontSize:12, color:"#DE1A1A", fontWeight:700 }}>+ Add shoot</span>
                </div>
              ) : (
                <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
                  {shoots.map((s, i) => (
                    <div key={s.id} style={{ background:"#FAFBFC", borderRadius:14, border:"1px solid #F0F1F5", padding:"14px 16px", position:"relative" }}>
                      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:12 }}>
                        <span style={{ fontSize:11, fontWeight:800, color:"#EF4444", textTransform:"uppercase", letterSpacing:"0.1em" }}>
                          Shoot #{i + 1}
                        </span>
                        <button onClick={() => removeShoot(s.id)}
                          style={{ width:26, height:26, borderRadius:8, background:"rgba(239,68,68,0.08)", border:"none", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>
                          <Trash2 size={12} style={{ color:"#EF4444" }} />
                        </button>
                      </div>

                      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:10 }}>
                        {/* Client */}
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
                            <input value={s.clientName} onChange={e => patchShoot(s.id, { clientName: e.target.value })}
                              placeholder="Client name…" style={F} />
                          )}
                        </div>
                        {/* Title */}
                        <div>
                          <label style={{ display:"block", fontSize:10, fontWeight:700, color:"#374151", textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:5 }}>Shoot Type / Title *</label>
                          <input value={s.title} onChange={e => patchShoot(s.id, { title: e.target.value })}
                            placeholder="e.g. Basketball Tournament Shoot" style={F} />
                        </div>
                      </div>

                      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 100px", gap:10, marginBottom:10 }}>
                        {/* Start */}
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
                        {/* End */}
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
                        {/* Duration */}
                        <div>
                          <label style={{ display:"block", fontSize:10, fontWeight:700, color:"#374151", textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:5 }}>Duration</label>
                          <DurationPicker value={s.durationHours} onChange={v => patchShoot(s.id, { durationHours: v })} />
                        </div>
                      </div>

                      <div style={{ display:"grid", gridTemplateColumns:"1fr auto", gap:10, alignItems:"start" }}>
                        <div>
                          <label style={{ display:"block", fontSize:10, fontWeight:700, color:"#374151", textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:5 }}>Notes</label>
                          <input value={s.notes} onChange={e => patchShoot(s.id, { notes: e.target.value })}
                            placeholder="Location, shots taken, any issues…" style={F} />
                        </div>
                        {/* Video uploaded toggle */}
                        <div style={{ paddingTop:24 }}>
                          <button onClick={() => patchShoot(s.id, { videoUploaded: !s.videoUploaded })}
                            style={{ display:"flex", alignItems:"center", gap:6, padding:"9px 14px", borderRadius:10, border:"1.5px solid", cursor:"pointer", fontSize:11, fontWeight:700, transition:"all 0.15s",
                              background:   s.videoUploaded ? "rgba(34,197,94,0.1)"  : "#F9FAFB",
                              borderColor:  s.videoUploaded ? "rgba(34,197,94,0.4)"  : "#EBEDF2",
                              color:        s.videoUploaded ? "#16A34A" : "#9CA3AF",
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

            {/* ── EDITS SECTION ──────────────────────────────────────────── */}
            <div style={{ background:"#fff", borderRadius:20, border:"1px solid #EBEDF2", padding:"20px 22px", boxShadow:"0 2px 10px rgba(0,0,0,0.05)" }}>
              <SectionHead icon={<Film size={16} style={{ color:"#6366F1" }} />} label="Editing Today" count={edits.length} color="#6366F1" />

              {edits.length === 0 ? (
                <div onClick={addEdit} style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:8, padding:"28px 0", borderRadius:14, border:"2px dashed #C7D2FE", background:"rgba(99,102,241,0.02)", cursor:"pointer" }}>
                  <Film size={24} style={{ color:"#C7D2FE" }} />
                  <p style={{ fontSize:13, fontWeight:600, color:"#9CA3AF", margin:0 }}>No editing logged yet</p>
                  <span style={{ fontSize:12, color:"#6366F1", fontWeight:700 }}>+ Add edit</span>
                </div>
              ) : (
                <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
                  {edits.map((e, i) => (
                    <div key={e.id} style={{ background:"#FAFBFC", borderRadius:14, border:"1px solid #F0F1F5", padding:"14px 16px" }}>
                      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:12 }}>
                        <span style={{ fontSize:11, fontWeight:800, color:"#6366F1", textTransform:"uppercase", letterSpacing:"0.1em" }}>Edit #{i + 1}</span>
                        <button onClick={() => removeEdit(e.id)}
                          style={{ width:26, height:26, borderRadius:8, background:"rgba(99,102,241,0.08)", border:"none", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>
                          <Trash2 size={12} style={{ color:"#6366F1" }} />
                        </button>
                      </div>

                      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 100px", gap:10, marginBottom:10 }}>
                        <div>
                          <label style={{ display:"block", fontSize:10, fontWeight:700, color:"#374151", textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:5 }}>Client / Project *</label>
                          {projects.length > 0 ? (
                            <div style={{ position:"relative" }}>
                              <select value={e.clientName} onChange={ev => patchEdit(e.id, { clientName: ev.target.value })} style={{ ...F, paddingRight:28, appearance:"none" }}>
                                <option value="">Select project…</option>
                                {projects.map(p => <option key={p.id} value={p.business_name}>{p.business_name}</option>)}
                              </select>
                              <ChevronDown size={11} style={{ position:"absolute", right:10, top:"50%", transform:"translateY(-50%)", color:"#9CA3AF", pointerEvents:"none" }} />
                            </div>
                          ) : (
                            <input value={e.clientName} onChange={ev => patchEdit(e.id, { clientName: ev.target.value })}
                              placeholder="Client name…" style={F} />
                          )}
                        </div>
                        <div>
                          <label style={{ display:"block", fontSize:10, fontWeight:700, color:"#374151", textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:5 }}>Video / Project Title *</label>
                          <input value={e.title} onChange={ev => patchEdit(e.id, { title: ev.target.value })}
                            placeholder="e.g. Evan Styles Makeover Reel" style={F} />
                        </div>
                        <div>
                          <label style={{ display:"block", fontSize:10, fontWeight:700, color:"#374151", textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:5 }}>Duration</label>
                          <DurationPicker value={e.durationHours} onChange={v => patchEdit(e.id, { durationHours: v })} />
                        </div>
                      </div>

                      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                        <div>
                          <label style={{ display:"block", fontSize:10, fontWeight:700, color:"#374151", textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:5 }}>Notes</label>
                          <input value={e.notes} onChange={ev => patchEdit(e.id, { notes: ev.target.value })}
                            placeholder="Revisions, software used…" style={F} />
                        </div>
                        <div>
                          <label style={{ display:"block", fontSize:10, fontWeight:700, color:"#374151", textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:5 }}>
                            <Link2 size={9} style={{ display:"inline", marginRight:4 }} />Drive / Video Link
                          </label>
                          <input value={e.videoLink} onChange={ev => patchEdit(e.id, { videoLink: ev.target.value })}
                            placeholder="https://drive.google.com/…" style={F} />
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

          {/* ── LEARNING TAB ──────────────────────────────────────────────── */}
          {tab === "learning" && (
            <div style={{ background:"#fff", borderRadius:20, border:"1px solid #EBEDF2", padding:"20px 22px", boxShadow:"0 2px 10px rgba(0,0,0,0.05)" }}>
              <SectionHead icon={<BookOpen size={16} style={{ color:"#10B981" }} />} label="What did you learn today?" count={0} color="#10B981" />

              <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
                <div>
                  <label style={{ display:"block", fontSize:10, fontWeight:700, color:"#374151", textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:6 }}>Topic / Course *</label>
                  <input value={learningTopic} onChange={e => setLearningTopic(e.target.value)}
                    placeholder="e.g. DaVinci Resolve color grading, Adobe Premiere…" style={F} />
                </div>
                <div style={{ display:"grid", gridTemplateColumns:"160px 1fr", gap:14 }}>
                  <div>
                    <label style={{ display:"block", fontSize:10, fontWeight:700, color:"#374151", textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:6 }}>Hours Spent *</label>
                    <DurationPicker value={learningHours} onChange={setLearningHours} />
                  </div>
                  <div>
                    <label style={{ display:"block", fontSize:10, fontWeight:700, color:"#374151", textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:6 }}>Notes</label>
                    <input value={learningNotes} onChange={e => setLearningNotes(e.target.value)}
                      placeholder="Key takeaways, resources used…" style={F} />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── SUBMIT BAR ────────────────────────────────────────────────── */}
          <div style={{ background:"#fff", borderRadius:16, border:"1px solid #EBEDF2", padding:"14px 18px", display:"flex", alignItems:"center", justifyContent:"space-between", gap:12, boxShadow:"0 2px 10px rgba(0,0,0,0.05)" }}>
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
              {isPending   ? <Loader2  size={14} className="animate-spin" /> :
               submitted   ? <CheckCircle2 size={14} /> :
                             <SendHorizonal size={14} />}
              {isPending ? "Submitting…" : submitted ? "Submitted! ✓" : "Submit Daily Update"}
            </button>
          </div>
        </div>

        {/* RIGHT ── Summary panel ─────────────────────────────────────────── */}
        <div style={{ display:"flex", flexDirection:"column", gap:14 }}>

          {/* Today's Overview */}
          <div style={{ background:"#fff", borderRadius:20, border:"1px solid #EBEDF2", overflow:"hidden", boxShadow:"0 2px 10px rgba(0,0,0,0.05)" }}>
            <div style={{ position:"relative", height:150 }}>
              <Image src="/brand/daily-boy.png" alt="" fill style={{ objectFit:"cover", objectPosition:"center top" }} />
            </div>
            <div style={{ padding:"14px 16px" }}>
              <p style={{ fontSize:13, fontWeight:800, color:"#111111", margin:"0 0 12px" }}>Today&apos;s Overview</p>
              <div style={{ display:"flex", flexDirection:"column", gap:9 }}>
                {[
                  { icon:"⏱", label:"Hours Logged",   value: totalHours > 0 ? `${totalHours}h` : "—",            color: totalHours >= 8 ? "#22C55E" : "#111111" },
                  { icon:"🎬", label:"Shoots",          value: String(shoots.length),                                color: shoots.length  > 0 ? "#EF4444" : "#9CA3AF" },
                  { icon:"🎞️", label:"Edits",           value: String(edits.length),                                color: edits.length   > 0 ? "#6366F1" : "#9CA3AF" },
                  { icon:"⚡", label:"Status",          value: totalHours === 0 ? "Not started" : totalHours >= 8 ? "On track" : "In Progress",
                    color: totalHours >= 8 ? "#22C55E" : totalHours > 0 ? "#F59E0B" : "#9CA3AF" },
                ].map(r => (
                  <div key={r.label} style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                    <span style={{ fontSize:11, color:"#9CA3AF", display:"flex", alignItems:"center", gap:6 }}>
                      <span>{r.icon}</span>{r.label}
                    </span>
                    <span style={{ fontSize:11, fontWeight:700, color:r.color }}>{r.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Productivity Score */}
          <div style={{ background:"#fff", borderRadius:20, border:"1px solid #EBEDF2", padding:"16px", boxShadow:"0 2px 10px rgba(0,0,0,0.05)" }}>
            <div style={{ display:"flex", alignItems:"center", gap:7, marginBottom:12 }}>
              <BarChart2 size={14} style={{ color:"#DE1A1A" }} />
              <p style={{ fontSize:13, fontWeight:800, color:"#111111", margin:0 }}>Productivity Score</p>
            </div>
            <GaugeChart score={productivity} />
            <p style={{ fontSize:10, color:"#9CA3AF", textAlign:"center", marginTop:8 }}>
              {productivity === 0 ? "Fill in your entries above ✍️" : productivity >= 70 ? "You&apos;re on fire! 🔥" : "Keep going! 💪"}
            </p>
          </div>

          {/* Hours breakdown */}
          {(totalShootHours > 0 || totalEditHours > 0) && (
            <div style={{ background:"#fff", borderRadius:20, border:"1px solid #EBEDF2", padding:"16px", boxShadow:"0 2px 10px rgba(0,0,0,0.05)" }}>
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
