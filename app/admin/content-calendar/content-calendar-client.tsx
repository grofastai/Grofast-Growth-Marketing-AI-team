"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  ChevronLeft, ChevronRight, Plus, X, Camera, Scissors,
  Loader2, CheckCircle2, Clock,
  PlayCircle, Image, Film, Layers, Send, Trash2,
} from "lucide-react"
import { createContentPost, updateContentPostStatus, deleteContentPost } from "@/lib/actions/content-calendar"

// ── Types ─────────────────────────────────────────────────────────────────────
interface Post {
  id: string; title: string; platform: string; content_type: string
  client_name: string; scheduled_date: string; status: string
  assigned_to: string | null; drive_link: string | null
  assignee?: { name: string } | null
}
interface Shoot { id: string; title: string; start_time: string; client: string; status: string }
interface Task  { id: string; title: string; due_date: string; status: string }
interface Member { id: string; name: string; employee_id: string }
interface Client { id: string; business_name: string; client_name: string }

interface Props {
  posts: Post[]; shoots: Shoot[]; tasks: Task[]
  members: Member[]; clients: Client[]
  companyId: string; initialYear: number; initialMonth: number
}

// ── Constants ──────────────────────────────────────────────────────────────────
const PLATFORMS = [
  { id: "instagram", label: "Instagram", color: "#E1306C" },
  { id: "youtube",   label: "YouTube",   color: "#FF0000" },
  { id: "facebook",  label: "Facebook",  color: "#1877F2" },
  { id: "linkedin",  label: "LinkedIn",  color: "#0A66C2" },
  { id: "twitter",   label: "Twitter/X", color: "#000000" },
  { id: "whatsapp",  label: "WhatsApp",  color: "#25D366" },
  { id: "other",     label: "Other",     color: "#6B7280" },
]
const CONTENT_TYPES = [
  { id: "post",      label: "Post",      icon: Image    },
  { id: "reel",      label: "Reel",      icon: Film     },
  { id: "video",     label: "Video",     icon: PlayCircle },
  { id: "story",     label: "Story",     icon: Layers   },
  { id: "carousel",  label: "Carousel",  icon: Layers   },
  { id: "other",     label: "Other",     icon: Layers   },
]
const STATUS_CFG: Record<string, { label: string; color: string; bg: string }> = {
  pending:     { label: "Pending",     color: "#F59E0B", bg: "rgba(245,158,11,0.1)"  },
  in_progress: { label: "In Progress", color: "#3B82F6", bg: "rgba(59,130,246,0.1)"  },
  ready:       { label: "Ready",       color: "#8B5CF6", bg: "rgba(139,92,246,0.1)"  },
  posted:      { label: "Posted ✓",    color: "#10B981", bg: "rgba(16,185,129,0.1)"  },
  cancelled:   { label: "Cancelled",   color: "#EF4444", bg: "rgba(239,68,68,0.1)"   },
  missed:      { label: "Missed",      color: "#EF4444", bg: "rgba(239,68,68,0.08)"  },
}
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"]
const DAYS   = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"]

function platformColor(p: string) { return PLATFORMS.find(x => x.id === p)?.color ?? "#6B7280" }
function platformLabel(p: string) { return PLATFORMS.find(x => x.id === p)?.label ?? p }

const FIELD: React.CSSProperties = {
  width: "100%", padding: "10px 14px", borderRadius: 10,
  border: "1.5px solid #E2E8F0", fontSize: 13, background: "#FAFAFA",
  color: "#1A202C", outline: "none", fontFamily: "inherit", boxSizing: "border-box",
}
const LABEL: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, color: "#4A5568",
  textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 5, display: "block",
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function ContentCalendarClient({ posts: initial, shoots, tasks, members, clients, initialYear, initialMonth }: Props) {
  const router = useRouter()
  const [posts, setPosts]       = useState(initial)
  const [year, setYear]         = useState(initialYear)
  const [month, setMonth]       = useState(initialMonth)
  const [showAdd, setShowAdd]   = useState(false)
  const [selectedDate, setSelectedDate] = useState("")
  const [isPending, start]      = useTransition()
  const [view, setView]         = useState<"calendar" | "list">("calendar")

  // Form state
  const [title, setTitle]           = useState("")
  const [platform, setPlatform]     = useState("instagram")
  const [contentType, setContentType] = useState("post")
  const [clientId, setClientId]     = useState("")
  const [clientName, setClientName] = useState("")
  const [assignedTo, setAssignedTo] = useState("")
  const [driveLink, setDriveLink]   = useState("")
  const [caption, setCaption]       = useState("")
  const [schedDate, setSchedDate]   = useState("")
  const [schedTime, setSchedTime]   = useState("")
  const [formError, setFormError]   = useState("")
  const [formSuccess, setFormSuccess] = useState(false)

  // Calendar grid
  const firstDay  = new Date(year, month, 1).getDay()
  const daysCount = new Date(year, month + 1, 0).getDate()
  const cells     = Array.from({ length: firstDay + daysCount }, (_, i) =>
    i < firstDay ? null : i - firstDay + 1
  )
  while (cells.length % 7 !== 0) cells.push(null)

  function prevMonth() { if (month === 0) { setYear(y => y - 1); setMonth(11) } else setMonth(m => m - 1) }
  function nextMonth() { if (month === 11) { setYear(y => y + 1); setMonth(0) } else setMonth(m => m + 1) }

  function dateStr(d: number) {
    return `${year}-${String(month + 1).padStart(2,"0")}-${String(d).padStart(2,"0")}`
  }

  function postsOnDay(d: number) {
    const ds = dateStr(d)
    return posts.filter(p => p.scheduled_date === ds)
  }
  function shootsOnDay(d: number) {
    const ds = dateStr(d)
    return shoots.filter(s => s.start_time.split("T")[0] === ds)
  }
  function tasksOnDay(d: number) {
    const ds = dateStr(d)
    return tasks.filter(t => t.due_date === ds)
  }

  function openAdd(d: number) {
    setSchedDate(dateStr(d))
    setSelectedDate(dateStr(d))
    setShowAdd(true)
    setFormError(""); setFormSuccess(false)
    setTitle(""); setPlatform("instagram"); setContentType("post")
    setClientId(""); setClientName(""); setAssignedTo(""); setDriveLink(""); setCaption(""); setSchedTime("")
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) { setFormError("Title is required"); return }
    if (!schedDate) { setFormError("Date is required"); return }
    setFormError("")
    start(async () => {
      const selectedClient = clients.find(c => c.id === clientId)
      const resolvedName = clientName || selectedClient?.client_name || selectedClient?.business_name || ""
      const res = await createContentPost({
        title, platform, content_type: contentType,
        client_id: clientId || null, client_name: resolvedName,
        scheduled_date: schedDate, scheduled_time: schedTime || null,
        assigned_to: assignedTo || null,
        drive_link: driveLink || undefined, caption: caption || undefined,
      })
      if (res.success) {
        setFormSuccess(true)
        router.refresh()
        setTimeout(() => { setShowAdd(false); setFormSuccess(false) }, 1200)
      } else {
        setFormError(res.error ?? "Something went wrong")
      }
    })
  }

  function handleStatusChange(postId: string, status: Post["status"]) {
    start(async () => {
      await updateContentPostStatus(postId, status as "posted")
      setPosts(prev => prev.map(p => p.id === postId ? { ...p, status } : p))
    })
  }

  function handleDelete(postId: string) {
    start(async () => {
      await deleteContentPost(postId)
      setPosts(prev => prev.filter(p => p.id !== postId))
    })
  }

  const today = new Date().toISOString().split("T")[0]
  const totalPosts   = posts.length
  const postedCount  = posts.filter(p => p.status === "posted").length
  const pendingCount = posts.filter(p => p.status === "pending").length

  return (
    <div className="p-4 md:p-6 xl:p-8" style={{ background: "#F5F6FA", minHeight: "100vh" }}>

      {/* ── Header ── */}
      <div style={{ background: "linear-gradient(135deg, #DE1A1A 0%, #9B1C1C 60%, #450A0A 100%)", borderRadius: 20, padding: "22px 28px", marginBottom: 24, boxShadow: "0 8px 32px rgba(222,26,26,0.25)" }}>
        <div className="flex items-center gap-4 flex-wrap">
          <div>
            <h1 className="text-[26px] font-black text-white">Content Calendar</h1>
            <p style={{ color: "rgba(255,255,255,0.6)", fontSize: 13, marginTop: 2 }}>Schedule posts, reels, videos & shoots in one view</p>
          </div>
          <div className="ml-auto flex items-center gap-3">
            {/* View toggle */}
            <div className="flex rounded-xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.2)" }}>
              {(["calendar","list"] as const).map(v => (
                <button key={v} onClick={() => setView(v)}
                  style={{ padding: "8px 16px", fontSize: 12, fontWeight: 700, background: view === v ? "rgba(255,255,255,0.2)" : "transparent", color: "#FFFFFF", border: "none", cursor: "pointer", textTransform: "capitalize" }}>
                  {v}
                </button>
              ))}
            </div>
            <button onClick={() => openAdd(new Date().getDate())}
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 20px", background: "#FFFFFF", color: "#DE1A1A", borderRadius: 12, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 800 }}>
              <Plus size={14} /> Add Content
            </button>
          </div>
        </div>
      </div>

      {/* ── Stats ── */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: "Scheduled This Month", value: totalPosts,  color: "#3B82F6", bg: "rgba(59,130,246,0.08)"  },
          { label: "Posted",               value: postedCount, color: "#10B981", bg: "rgba(16,185,129,0.08)"  },
          { label: "Pending",              value: pendingCount,color: "#F59E0B", bg: "rgba(245,158,11,0.08)"  },
        ].map(s => (
          <div key={s.label} style={{ background: "#FFFFFF", borderRadius: 16, padding: "18px 20px", border: "1px solid #E5E7EB" }}>
            <p style={{ fontSize: 32, fontWeight: 900, color: s.color, margin: 0 }}>{s.value}</p>
            <p style={{ fontSize: 12, color: "#6B7280", margin: "4px 0 0", fontWeight: 600 }}>{s.label}</p>
          </div>
        ))}
      </div>

      {/* ── Calendar / List toggle ── */}
      {view === "calendar" ? (
        <div style={{ background: "#FFFFFF", borderRadius: 20, border: "1px solid #E5E7EB", overflow: "hidden" }}>
          {/* Month nav */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 24px", borderBottom: "1px solid #F3F4F6" }}>
            <button onClick={prevMonth} style={{ width: 34, height: 34, borderRadius: 10, border: "1px solid #E5E7EB", background: "#FAFAFA", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <ChevronLeft size={16} color="#6B7280" />
            </button>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: "#111827" }}>{MONTHS[month]} {year}</h2>
            <button onClick={nextMonth} style={{ width: 34, height: 34, borderRadius: 10, border: "1px solid #E5E7EB", background: "#FAFAFA", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <ChevronRight size={16} color="#6B7280" />
            </button>
          </div>

          {/* Day headers */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", borderBottom: "1px solid #F3F4F6" }}>
            {DAYS.map(d => (
              <div key={d} style={{ padding: "10px 0", textAlign: "center", fontSize: 11, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.07em" }}>{d}</div>
            ))}
          </div>

          {/* Cells */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}>
            {cells.map((day, i) => {
              if (!day) return <div key={i} style={{ minHeight: 100, borderRight: i % 7 !== 6 ? "1px solid #F9FAFB" : "none", borderBottom: "1px solid #F9FAFB" }} />
              const ds = dateStr(day)
              const dayPosts  = postsOnDay(day)
              const dayShoots = shootsOnDay(day)
              const dayTasks  = tasksOnDay(day)
              const isToday   = ds === today
              return (
                <div key={i} style={{
                  minHeight: 100, padding: "8px 6px", borderRight: i % 7 !== 6 ? "1px solid #F3F4F6" : "none",
                  borderBottom: "1px solid #F3F4F6",
                  background: isToday ? "rgba(222,26,26,0.03)" : "transparent",
                }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{
                      fontSize: 13, fontWeight: isToday ? 900 : 500, lineHeight: 1,
                      width: 24, height: 24, display: "flex", alignItems: "center", justifyContent: "center",
                      borderRadius: "50%", background: isToday ? "#DE1A1A" : "transparent",
                      color: isToday ? "#FFFFFF" : "#374151",
                    }}>{day}</span>
                    <button onClick={() => openAdd(day)}
                      style={{ width: 18, height: 18, borderRadius: 5, border: "1px solid #E5E7EB", background: "#FAFAFA", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", opacity: 0.6 }}>
                      <Plus size={10} color="#6B7280" />
                    </button>
                  </div>

                  {/* Shoots */}
                  {dayShoots.map(s => (
                    <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 4, padding: "3px 6px", borderRadius: 5, background: "rgba(59,130,246,0.1)", marginBottom: 2 }}>
                      <Camera size={9} color="#3B82F6" />
                      <span style={{ fontSize: 10, fontWeight: 600, color: "#3B82F6", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.title || s.client}</span>
                    </div>
                  ))}

                  {/* Tasks with due dates */}
                  {dayTasks.map(t => (
                    <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 4, padding: "3px 6px", borderRadius: 5, background: "rgba(245,158,11,0.1)", marginBottom: 2 }}>
                      <Clock size={9} color="#F59E0B" />
                      <span style={{ fontSize: 10, fontWeight: 600, color: "#F59E0B", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title}</span>
                    </div>
                  ))}

                  {/* Content posts */}
                  {dayPosts.map(p => (
                    <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 4, padding: "3px 6px", borderRadius: 5, marginBottom: 2, background: `${platformColor(p.platform)}18` }}>
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: platformColor(p.platform), flexShrink: 0 }} />
                      <span style={{ fontSize: 10, fontWeight: 600, color: platformColor(p.platform), overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.title}</span>
                    </div>
                  ))}
                </div>
              )
            })}
          </div>

          {/* Legend */}
          <div style={{ padding: "12px 24px", borderTop: "1px solid #F3F4F6", display: "flex", gap: 16, flexWrap: "wrap" }}>
            <span style={{ fontSize: 11, color: "#6B7280", fontWeight: 600 }}>Legend:</span>
            <span style={{ fontSize: 11, color: "#3B82F6", fontWeight: 600 }}>🎥 Shoot</span>
            <span style={{ fontSize: 11, color: "#F59E0B", fontWeight: 600 }}>⏰ Task Deadline</span>
            {PLATFORMS.slice(0, 4).map(p => (
              <span key={p.id} style={{ fontSize: 11, fontWeight: 600, color: p.color }}>● {p.label}</span>
            ))}
          </div>
        </div>
      ) : (
        /* List view */
        <div style={{ background: "#FFFFFF", borderRadius: 20, border: "1px solid #E5E7EB", overflow: "hidden" }}>
          <div style={{ padding: "18px 24px", borderBottom: "1px solid #F3F4F6" }}>
            <h2 style={{ fontSize: 16, fontWeight: 800, color: "#111827", margin: 0 }}>All Scheduled Content — {MONTHS[month]} {year}</h2>
          </div>
          {posts.length === 0 ? (
            <div style={{ padding: "60px 24px", textAlign: "center", color: "#9CA3AF" }}>No content scheduled this month.</div>
          ) : (
            <div>
              {posts.map((p, i) => {
                const cfg = STATUS_CFG[p.status] ?? STATUS_CFG.pending
                return (
                  <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 24px", borderBottom: i < posts.length - 1 ? "1px solid #F9FAFB" : "none" }}>
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: `${platformColor(p.platform)}15`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <span style={{ fontSize: 16 }}>
                        {p.platform === "instagram" ? "📸" : p.platform === "youtube" ? "▶️" : p.platform === "facebook" ? "👥" : "📱"}
                      </span>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 13, fontWeight: 700, color: "#111827", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.title}</p>
                      <p style={{ fontSize: 11, color: "#6B7280", margin: "2px 0 0" }}>
                        {platformLabel(p.platform)} · {p.client_name} · {p.assignee?.name ?? "Unassigned"}
                      </p>
                    </div>
                    <span style={{ fontSize: 11, color: "#6B7280", whiteSpace: "nowrap" }}>{p.scheduled_date}</span>
                    <select value={p.status} onChange={e => handleStatusChange(p.id, e.target.value as Post["status"])}
                      style={{ fontSize: 11, fontWeight: 700, padding: "4px 8px", borderRadius: 8, border: `1.5px solid ${cfg.color}`, background: cfg.bg, color: cfg.color, cursor: "pointer", outline: "none" }}>
                      {Object.entries(STATUS_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select>
                    <button onClick={() => handleDelete(p.id)} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}>
                      <Trash2 size={14} color="#EF4444" />
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Add Content Modal ── */}
      {showAdd && (
        <div style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)" }} onClick={() => setShowAdd(false)} />
          <div style={{ position: "relative", background: "#FFFFFF", borderRadius: 20, padding: 28, width: "100%", maxWidth: 560, maxHeight: "92vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
              <div>
                <h3 style={{ fontSize: 17, fontWeight: 800, color: "#111827", margin: 0 }}>Schedule Content</h3>
                {selectedDate && <p style={{ fontSize: 12, color: "#6B7280", margin: "2px 0 0" }}>{selectedDate}</p>}
              </div>
              <button onClick={() => setShowAdd(false)} style={{ background: "none", border: "none", cursor: "pointer" }}>
                <X size={18} color="#6B7280" />
              </button>
            </div>

            <form onSubmit={handleCreate} style={{ display: "flex", flexDirection: "column", gap: 16 }}>

              {/* Title */}
              <div>
                <label style={LABEL}>Title *</label>
                <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Diwali Sale Reel" required style={FIELD} />
              </div>

              {/* Platform */}
              <div>
                <label style={LABEL}>Platform</label>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {PLATFORMS.map(p => (
                    <button key={p.id} type="button" onClick={() => setPlatform(p.id)}
                      style={{ padding: "6px 12px", borderRadius: 8, border: `1.5px solid ${platform === p.id ? p.color : "#E2E8F0"}`, background: platform === p.id ? `${p.color}18` : "#FAFAFA", color: platform === p.id ? p.color : "#718096", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Content type */}
              <div>
                <label style={LABEL}>Content Type</label>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {CONTENT_TYPES.map(ct => (
                    <button key={ct.id} type="button" onClick={() => setContentType(ct.id)}
                      style={{ padding: "6px 12px", borderRadius: 8, border: `1.5px solid ${contentType === ct.id ? "#DE1A1A" : "#E2E8F0"}`, background: contentType === ct.id ? "rgba(222,26,26,0.08)" : "#FAFAFA", color: contentType === ct.id ? "#DE1A1A" : "#718096", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                      {ct.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Date + Time + Client + Assigned */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12 }}>
                <div>
                  <label style={LABEL}>Date *</label>
                  <input type="date" value={schedDate} onChange={e => setSchedDate(e.target.value)} required style={FIELD} />
                </div>
                <div>
                  <label style={LABEL}>Post Time <span style={{ fontWeight: 400, color: "#9CA3AF", textTransform: "none" }}>(optional)</span></label>
                  <input type="time" value={schedTime} onChange={e => setSchedTime(e.target.value)} style={FIELD} />
                </div>
                <div>
                  <label style={LABEL}>Client</label>
                  <select value={clientId} onChange={e => { setClientId(e.target.value); setClientName("") }} style={{ ...FIELD, appearance: "none" }}>
                    <option value="">— Select —</option>
                    {clients.map(c => <option key={c.id} value={c.id}>{c.client_name || c.business_name}</option>)}
                  </select>
                </div>
                <div>
                  <label style={LABEL}>Assign To</label>
                  <select value={assignedTo} onChange={e => setAssignedTo(e.target.value)} style={{ ...FIELD, appearance: "none" }}>
                    <option value="">— Select —</option>
                    {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </div>
              </div>

              {/* Caption */}
              <div>
                <label style={LABEL}>Caption (optional)</label>
                <textarea value={caption} onChange={e => setCaption(e.target.value)} rows={2} placeholder="Post caption or script brief…" style={{ ...FIELD, resize: "vertical", lineHeight: 1.5 }} />
              </div>

              {/* Drive link */}
              <div>
                <label style={LABEL}>Drive Link (optional)</label>
                <input type="url" value={driveLink} onChange={e => setDriveLink(e.target.value)} placeholder="https://drive.google.com/…" style={FIELD} />
              </div>

              {assignedTo && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", background: "rgba(37,211,102,0.07)", borderRadius: 8, border: "1px solid rgba(37,211,102,0.2)" }}>
                  <Send size={13} color="#25D366" />
                  <span style={{ fontSize: 12, color: "#25D366", fontWeight: 600 }}>WhatsApp notification will be sent to assigned member</span>
                </div>
              )}

              {formError && <p style={{ fontSize: 12, color: "#EF4444", background: "rgba(239,68,68,0.07)", padding: "10px 14px", borderRadius: 8 }}>{formError}</p>}
              {formSuccess && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", background: "rgba(16,185,129,0.08)", borderRadius: 8 }}>
                  <CheckCircle2 size={14} color="#10B981" />
                  <span style={{ fontSize: 12, color: "#10B981", fontWeight: 600 }}>Content scheduled!</span>
                </div>
              )}

              <div style={{ display: "flex", gap: 10 }}>
                <button type="button" onClick={() => setShowAdd(false)}
                  style={{ flex: 1, padding: "12px", borderRadius: 10, border: "1px solid #E2E8F0", background: "#FAFAFA", fontSize: 13, fontWeight: 700, cursor: "pointer", color: "#6B7280" }}>
                  Cancel
                </button>
                <button type="submit" disabled={isPending}
                  style={{ flex: 2, padding: "12px", borderRadius: 10, border: "none", background: isPending ? "#718096" : "#DE1A1A", color: "#FFFFFF", fontSize: 13, fontWeight: 700, cursor: isPending ? "not-allowed" : "pointer" }}>
                  {isPending ? <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}><Loader2 size={14} className="animate-spin" />Saving…</span> : "Schedule Content"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
