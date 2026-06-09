"use client"

import { useState, useTransition, useMemo } from "react"
import { useRouter } from "next/navigation"
import {
  ChevronLeft, ChevronRight, ChevronDown, Plus, X, Camera,
  Loader2, CheckCircle2, Clock,
  PlayCircle, Image, Film, Layers, Send, Trash2, Pencil,
} from "lucide-react"
import { createContentPost, updateContentPost, updateContentPostStatus, deleteContentPost } from "@/lib/actions/content-calendar"

// ── Types ─────────────────────────────────────────────────────────────────────
interface Post {
  id: string; title: string; platform: string; content_type: string
  client_name: string; scheduled_date: string; status: string
  assigned_to: string | null; drive_link: string | null
  content_pillar?: string | null; priority?: string | null
  notes?: string | null; scheduled_time?: string | null
  assignee?: { name: string } | null
}
interface Shoot  { id: string; title: string; start_time: string; client: string; status: string }
interface Task   { id: string; title: string; due_date: string; status: string }
interface Member { id: string; name: string; employee_id: string }
interface Client { id: string; name: string }

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
  { id: "post",      label: "Post",      icon: Image     },
  { id: "reel",      label: "Reel",      icon: Film      },
  { id: "video",     label: "Video",     icon: PlayCircle },
  { id: "story",     label: "Story",     icon: Layers    },
  { id: "carousel",  label: "Carousel",  icon: Layers    },
  { id: "other",     label: "Other",     icon: Layers    },
]
const CONTENT_PILLARS = [
  "Branding", "Cinematic", "Educational", "Offer", "Testimonial",
  "Behind The Scenes", "Trending", "Festival", "Engagement",
]
const PRIORITY_CFG: Record<string, { label: string; color: string; bg: string }> = {
  low:    { label: "Low",    color: "#6B7280", bg: "rgba(107,114,128,0.1)" },
  medium: { label: "Medium", color: "#F59E0B", bg: "rgba(245,158,11,0.1)" },
  high:   { label: "High",   color: "#EF4444", bg: "rgba(239,68,68,0.1)"  },
  urgent: { label: "Urgent", color: "#7C3AED", bg: "rgba(124,58,237,0.1)" },
}
const STATUS_CFG: Record<string, { label: string; color: string; bg: string }> = {
  pending:     { label: "Scheduled",   color: "#F59E0B", bg: "rgba(245,158,11,0.1)"  },
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
  const [posts, setPosts] = useState(initial)
  const [year, setYear]   = useState(initialYear)
  const [month, setMonth] = useState(initialMonth)
  const [view, setView]   = useState<"calendar" | "list">("calendar")
  const [isPending, start] = useTransition()

  // Filters
  const [clientFilter, setClientFilter] = useState<string>("all")

  // Modal mode: "add" | "edit" | null
  const [modalMode, setModalMode] = useState<"add" | "edit" | null>(null)
  const [editingPost, setEditingPost] = useState<Post | null>(null)

  // Form state
  const [title, setTitle]               = useState("")
  const [platform, setPlatform]         = useState("instagram")
  const [contentType, setContentType]   = useState("post")
  const [clientId, setClientId]         = useState("")
  const [clientName, setClientName]     = useState("")
  const [assignedTo, setAssignedTo]     = useState("")
  const [instructions, setInstructions] = useState("")
  const [contentPillar, setContentPillar] = useState("")
  const [priority, setPriority]         = useState("medium")
  const [schedDates, setSchedDates]     = useState<string[]>([])
  const [schedDateInput, setSchedDateInput] = useState("")
  const [schedTime, setSchedTime]       = useState("")
  const [formError, setFormError]       = useState("")
  const [formSuccess, setFormSuccess]   = useState(false)

  // Calendar grid
  const firstDay  = new Date(year, month, 1).getDay()
  const daysCount = new Date(year, month + 1, 0).getDate()
  const cells     = Array.from({ length: firstDay + daysCount }, (_, i) => i < firstDay ? null : i - firstDay + 1)
  while (cells.length % 7 !== 0) cells.push(null)

  function prevMonth() { if (month === 0) { setYear(y => y - 1); setMonth(11) } else setMonth(m => m - 1) }
  function nextMonth() { if (month === 11) { setYear(y => y + 1); setMonth(0) } else setMonth(m => m + 1) }
  function dateStr(d: number) { return `${year}-${String(month + 1).padStart(2,"0")}-${String(d).padStart(2,"0")}` }

  // Unique clients from posts for filter bar
  const clientOptions = useMemo(() => {
    const names = [...new Set(posts.map(p => p.client_name).filter(Boolean))]
    return names.sort()
  }, [posts])

  const filteredPosts = useMemo(() =>
    clientFilter === "all" ? posts : posts.filter(p => p.client_name === clientFilter),
    [posts, clientFilter]
  )

  function postsOnDay(d: number)  { const ds = dateStr(d); return filteredPosts.filter(p => p.scheduled_date === ds) }
  function shootsOnDay(d: number) { const ds = dateStr(d); return shoots.filter(s => s.start_time.split("T")[0] === ds) }
  function tasksOnDay(d: number)  { const ds = dateStr(d); return tasks.filter(t => t.due_date === ds) }

  function resetForm() {
    setTitle(""); setPlatform("instagram"); setContentType("post")
    setClientId(""); setClientName(""); setAssignedTo("")
    setInstructions(""); setContentPillar(""); setPriority("medium")
    setSchedTime(""); setSchedDates([]); setSchedDateInput("")
    setFormError(""); setFormSuccess(false)
  }

  function openAdd(d: number) {
    resetForm()
    const ds = dateStr(d)
    setSchedDates([ds])
    setModalMode("add")
  }

  function openEdit(post: Post) {
    setEditingPost(post)
    setTitle(post.title)
    setPlatform(post.platform)
    setContentType(post.content_type)
    const cl = clients.find(c => c.name === post.client_name)
    setClientId(cl?.id ?? "")
    setClientName(post.client_name)
    setAssignedTo(post.assigned_to ?? "")
    setInstructions(post.notes ?? "")
    setContentPillar(post.content_pillar ?? "")
    setPriority(post.priority ?? "medium")
    setSchedDates([post.scheduled_date])
    setSchedDateInput("")
    setSchedTime(post.scheduled_time ?? "")
    setFormError(""); setFormSuccess(false)
    setModalMode("edit")
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) { setFormError("Title is required"); return }
    if (schedDates.length === 0) { setFormError("Select at least one date"); return }
    setFormError("")
    start(async () => {
      const selectedClient = clients.find(c => c.id === clientId)
      const resolvedName = clientName || selectedClient?.name || ""
      const results = await Promise.all(schedDates.map(date =>
        createContentPost({
          title, platform, content_type: contentType,
          client_id: clientId || null, client_name: resolvedName,
          scheduled_date: date, scheduled_time: schedTime || null,
          assigned_to: assignedTo || null,
          notes: instructions || undefined,
          content_pillar: contentPillar || null,
          priority: priority || "medium",
        })
      ))
      const failed = results.find(r => !r.success)
      if (failed) { setFormError(failed.error ?? "Something went wrong") }
      else { setFormSuccess(true); router.refresh(); setTimeout(() => { setModalMode(null); setFormSuccess(false) }, 1200) }
    })
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault()
    if (!editingPost) return
    if (!title.trim()) { setFormError("Title is required"); return }
    if (schedDates.length === 0) { setFormError("Select at least one date"); return }
    setFormError("")
    start(async () => {
      const selectedClient = clients.find(c => c.id === clientId)
      const resolvedName = clientName || selectedClient?.name || ""
      const res = await updateContentPost(editingPost.id, {
        title, platform, content_type: contentType,
        client_id: clientId || null, client_name: resolvedName,
        scheduled_date: schedDates[0], scheduled_time: schedTime || null,
        assigned_to: assignedTo || null,
        notes: instructions || undefined,
        content_pillar: contentPillar || null,
        priority: priority || "medium",
      })
      if (!res.success) { setFormError(res.error ?? "Something went wrong") }
      else {
        setPosts(prev => prev.map(p => p.id === editingPost.id ? {
          ...p, title, platform, content_type: contentType,
          client_name: resolvedName, scheduled_date: schedDates[0],
          assigned_to: assignedTo || null, notes: instructions || null,
          content_pillar: contentPillar || null, priority,
        } : p))
        setFormSuccess(true)
        router.refresh()
        setTimeout(() => { setModalMode(null); setFormSuccess(false) }, 1000)
      }
    })
  }

  function handleStatusChange(postId: string, status: string) {
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

  const today         = new Date().toISOString().split("T")[0]
  const totalContent  = filteredPosts.length
  const readyCount    = filteredPosts.filter(p => p.status === "ready").length
  const inProgCount   = filteredPosts.filter(p => p.status === "in_progress").length
  const postedCount   = filteredPosts.filter(p => p.status === "posted").length

  const showModal = modalMode !== null
  const isEdit    = modalMode === "edit"

  return (
    <div className="p-4 md:p-6 xl:p-8" style={{ background: "#F5F6FA", minHeight: "100vh" }}>

      {/* ── Header ── */}
      <div style={{ background: "linear-gradient(135deg, #DE1A1A 0%, #9B1C1C 60%, #450A0A 100%)", borderRadius: 20, padding: "22px 28px", marginBottom: 24, boxShadow: "0 8px 32px rgba(222,26,26,0.25)" }}>
        <div className="flex items-center gap-4 flex-wrap">
          <div>
            <h1 className="text-[26px] font-black text-white">Content Calendar</h1>
            <p style={{ color: "rgba(255,255,255,0.6)", fontSize: 13, marginTop: 2 }}>Schedule posts, reels, videos & shoots in one view</p>
          </div>
          <div className="ml-auto flex items-center gap-3 flex-wrap">
            <div className="flex rounded-xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.2)" }}>
              {(["calendar","list"] as const).map(v => (
                <button key={v} onClick={() => setView(v)}
                  style={{ padding: "8px 16px", fontSize: 12, fontWeight: 700, background: view === v ? "rgba(255,255,255,0.2)" : "transparent", color: "#FFFFFF", border: "none", cursor: "pointer", textTransform: "capitalize" }}>
                  {v}
                </button>
              ))}
            </div>
            <button onClick={() => { resetForm(); setSchedDates([today]); setModalMode("add") }}
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 20px", background: "#FFFFFF", color: "#DE1A1A", borderRadius: 12, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 800 }}>
              <Plus size={14} /> Add Content
            </button>
          </div>
        </div>
      </div>

      {/* ── Stats ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        {[
          { label: "Total Content",   value: totalContent, color: "#3B82F6" },
          { label: "Ready To Post",   value: readyCount,   color: "#8B5CF6" },
          { label: "In Progress",     value: inProgCount,  color: "#F59E0B" },
          { label: "Posted",          value: postedCount,  color: "#10B981" },
        ].map(s => (
          <div key={s.label} style={{ background: "#FFFFFF", borderRadius: 16, padding: "18px 20px", border: "1px solid #E5E7EB" }}>
            <p style={{ fontSize: 30, fontWeight: 900, color: s.color, margin: 0 }}>{s.value}</p>
            <p style={{ fontSize: 12, color: "#6B7280", margin: "4px 0 0", fontWeight: 600 }}>{s.label}</p>
          </div>
        ))}
      </div>

      {/* ── Client Filter dropdown ── */}
      {clientOptions.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.06em", whiteSpace: "nowrap" }}>Filter:</span>
          <div style={{ position: "relative", width: 220 }}>
            <select value={clientFilter} onChange={e => setClientFilter(e.target.value)}
              style={{ width: "100%", fontSize: 12, fontWeight: 600, color: clientFilter === "all" ? "#6B7280" : "#DE1A1A", background: clientFilter === "all" ? "#FAFAFA" : "rgba(222,26,26,0.05)", border: `1.5px solid ${clientFilter === "all" ? "#E5E7EB" : "rgba(222,26,26,0.3)"}`, borderRadius: 10, padding: "7px 28px 7px 10px", cursor: "pointer", outline: "none", appearance: "none" }}>
              <option value="all">All Clients</option>
              {clientOptions.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <ChevronDown size={12} style={{ position: "absolute", right: 9, top: "50%", transform: "translateY(-50%)", color: "#9CA3AF", pointerEvents: "none" }} />
          </div>
        </div>
      )}

      {/* ── Calendar / List ── */}
      {view === "calendar" ? (
        <div style={{ background: "#FFFFFF", borderRadius: 20, border: "1px solid #E5E7EB", overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 24px", borderBottom: "1px solid #F3F4F6" }}>
            <button onClick={prevMonth} style={{ width: 34, height: 34, borderRadius: 10, border: "1px solid #E5E7EB", background: "#FAFAFA", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <ChevronLeft size={16} color="#6B7280" />
            </button>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: "#111827" }}>{MONTHS[month]} {year}</h2>
            <button onClick={nextMonth} style={{ width: 34, height: 34, borderRadius: 10, border: "1px solid #E5E7EB", background: "#FAFAFA", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <ChevronRight size={16} color="#6B7280" />
            </button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", borderBottom: "1px solid #F3F4F6" }}>
            {DAYS.map(d => (
              <div key={d} style={{ padding: "10px 0", textAlign: "center", fontSize: 11, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.07em" }}>{d}</div>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}>
            {cells.map((day, i) => {
              if (!day) return <div key={i} style={{ minHeight: 100, borderRight: i % 7 !== 6 ? "1px solid #F3F4F6" : "none", borderBottom: "1px solid #F3F4F6" }} />
              const ds = dateStr(day)
              const dayPosts  = postsOnDay(day)
              const dayShoots = shootsOnDay(day)
              const dayTasks  = tasksOnDay(day)
              const isToday   = ds === today
              return (
                <div key={i} style={{ minHeight: 100, padding: "8px 6px", borderRight: i % 7 !== 6 ? "1px solid #F3F4F6" : "none", borderBottom: "1px solid #F3F4F6", background: isToday ? "rgba(222,26,26,0.03)" : "transparent" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ fontSize: 13, fontWeight: isToday ? 900 : 500, width: 24, height: 24, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "50%", background: isToday ? "#DE1A1A" : "transparent", color: isToday ? "#FFFFFF" : "#374151" }}>{day}</span>
                    <button onClick={() => openAdd(day)} style={{ width: 18, height: 18, borderRadius: 5, border: "1px solid #E5E7EB", background: "#FAFAFA", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", opacity: 0.6 }}>
                      <Plus size={10} color="#6B7280" />
                    </button>
                  </div>
                  {dayShoots.map(s => (
                    <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 4, padding: "3px 6px", borderRadius: 5, background: "rgba(59,130,246,0.1)", marginBottom: 2 }}>
                      <Camera size={9} color="#3B82F6" />
                      <span style={{ fontSize: 10, fontWeight: 600, color: "#3B82F6", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.title || s.client}</span>
                    </div>
                  ))}
                  {dayTasks.map(t => (
                    <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 4, padding: "3px 6px", borderRadius: 5, background: "rgba(245,158,11,0.1)", marginBottom: 2 }}>
                      <Clock size={9} color="#F59E0B" />
                      <span style={{ fontSize: 10, fontWeight: 600, color: "#F59E0B", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title}</span>
                    </div>
                  ))}
                  {dayPosts.map(p => {
                    const cfg = STATUS_CFG[p.status] ?? STATUS_CFG.pending
                    return (
                      <div key={p.id} onClick={() => openEdit(p)} style={{ display: "flex", alignItems: "center", gap: 4, padding: "3px 6px", borderRadius: 5, marginBottom: 2, background: `${platformColor(p.platform)}18`, cursor: "pointer" }}>
                        <span style={{ width: 6, height: 6, borderRadius: "50%", background: cfg.color, flexShrink: 0 }} />
                        <span style={{ fontSize: 10, fontWeight: 600, color: platformColor(p.platform), overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{p.title}</span>
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
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
        <div style={{ background: "#FFFFFF", borderRadius: 20, border: "1px solid #E5E7EB", overflow: "hidden" }}>
          <div style={{ padding: "18px 24px", borderBottom: "1px solid #F3F4F6" }}>
            <h2 style={{ fontSize: 16, fontWeight: 800, color: "#111827", margin: 0 }}>All Scheduled Content — {MONTHS[month]} {year}</h2>
          </div>
          {filteredPosts.length === 0 ? (
            <div style={{ padding: "60px 24px", textAlign: "center", color: "#9CA3AF" }}>No content scheduled this month.</div>
          ) : (
            <div>
              {filteredPosts.map((p, i) => {
                const cfg   = STATUS_CFG[p.status] ?? STATUS_CFG.pending
                const priCfg = PRIORITY_CFG[p.priority ?? "medium"] ?? PRIORITY_CFG.medium
                return (
                  <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 24px", borderBottom: i < filteredPosts.length - 1 ? "1px solid #F9FAFB" : "none", flexWrap: "wrap" }}>
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: `${platformColor(p.platform)}15`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <span style={{ fontSize: 16 }}>
                        {p.platform === "instagram" ? "📸" : p.platform === "youtube" ? "▶️" : p.platform === "facebook" ? "👥" : "📱"}
                      </span>
                    </div>
                    <div style={{ flex: 1, minWidth: 120 }}>
                      <p style={{ fontSize: 13, fontWeight: 700, color: "#111827", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.title}</p>
                      <p style={{ fontSize: 11, color: "#6B7280", margin: "2px 0 0" }}>
                        {platformLabel(p.platform)} · {p.client_name || "—"} · {p.assignee?.name ?? "Unassigned"}
                        {p.content_pillar && <span style={{ marginLeft: 6, padding: "1px 7px", borderRadius: 10, background: "rgba(99,102,241,0.1)", color: "#6366F1", fontWeight: 600 }}>{p.content_pillar}</span>}
                      </p>
                    </div>
                    <span style={{ fontSize: 11, color: "#6B7280", whiteSpace: "nowrap" }}>{p.scheduled_date}</span>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 8, background: priCfg.bg, color: priCfg.color, whiteSpace: "nowrap" }}>{priCfg.label}</span>
                    <select value={p.status} onChange={e => handleStatusChange(p.id, e.target.value)}
                      style={{ fontSize: 11, fontWeight: 700, padding: "4px 8px", borderRadius: 8, border: `1.5px solid ${cfg.color}`, background: cfg.bg, color: cfg.color, cursor: "pointer", outline: "none" }}>
                      {Object.entries(STATUS_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select>
                    <button onClick={() => openEdit(p)} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }} title="Edit">
                      <Pencil size={14} color="#6366F1" />
                    </button>
                    <button onClick={() => handleDelete(p.id)} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }} title="Delete">
                      <Trash2 size={14} color="#EF4444" />
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Add / Edit Modal ── */}
      {showModal && (
        <div style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)" }} onClick={() => setModalMode(null)} />
          <div style={{ position: "relative", background: "#FFFFFF", borderRadius: 20, padding: 28, width: "100%", maxWidth: 580, maxHeight: "92vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
              <h3 style={{ fontSize: 17, fontWeight: 800, color: "#111827", margin: 0 }}>
                {isEdit ? "Edit Content" : "Schedule Content"}
              </h3>
              <button onClick={() => setModalMode(null)} style={{ background: "none", border: "none", cursor: "pointer" }}>
                <X size={18} color="#6B7280" />
              </button>
            </div>

            <form onSubmit={isEdit ? handleEdit : handleCreate} style={{ display: "flex", flexDirection: "column", gap: 16 }}>

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

              {/* Content Pillar */}
              <div>
                <label style={LABEL}>Content Pillar</label>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {CONTENT_PILLARS.map(cp => (
                    <button key={cp} type="button" onClick={() => setContentPillar(contentPillar === cp ? "" : cp)}
                      style={{ padding: "5px 12px", borderRadius: 8, border: `1.5px solid ${contentPillar === cp ? "#6366F1" : "#E2E8F0"}`, background: contentPillar === cp ? "rgba(99,102,241,0.1)" : "#FAFAFA", color: contentPillar === cp ? "#6366F1" : "#718096", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                      {cp}
                    </button>
                  ))}
                </div>
              </div>

              {/* Priority */}
              <div>
                <label style={LABEL}>Priority</label>
                <div style={{ display: "flex", gap: 8 }}>
                  {Object.entries(PRIORITY_CFG).map(([k, v]) => (
                    <button key={k} type="button" onClick={() => setPriority(k)}
                      style={{ padding: "6px 14px", borderRadius: 8, border: `1.5px solid ${priority === k ? v.color : "#E2E8F0"}`, background: priority === k ? v.bg : "#FAFAFA", color: priority === k ? v.color : "#718096", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                      {v.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Dates */}
              <div>
                <label style={LABEL}>Date{!isEdit ? "s" : ""} * {!isEdit && <span style={{ fontWeight: 400, color: "#9CA3AF", textTransform: "none" }}>— select one or more</span>}</label>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <input type="date" value={schedDateInput}
                    onChange={e => {
                      const d = e.target.value
                      if (d && !schedDates.includes(d)) setSchedDates(p => isEdit ? [d] : [...p, d].sort())
                      setSchedDateInput("")
                    }}
                    style={{ ...FIELD, width: "auto", flex: "0 0 auto" }} />
                  {schedDates.map(d => (
                    <span key={d} style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 10px", borderRadius: 20, background: "rgba(222,26,26,0.08)", border: "1.5px solid rgba(222,26,26,0.25)", fontSize: 12, fontWeight: 600, color: "#de1a1a" }}>
                      {d}
                      <button type="button" onClick={() => setSchedDates(p => p.filter(x => x !== d))}
                        style={{ background: "none", border: "none", cursor: "pointer", padding: 0, lineHeight: 1, color: "#de1a1a", fontSize: 14, fontWeight: 700 }}>×</button>
                    </span>
                  ))}
                </div>
              </div>

              {/* Time + Client + Assigned */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                <div>
                  <label style={LABEL}>Post Time <span style={{ fontWeight: 400, color: "#9CA3AF", textTransform: "none" }}>(optional)</span></label>
                  <input type="time" value={schedTime} onChange={e => setSchedTime(e.target.value)} style={FIELD} />
                </div>
                <div>
                  <label style={LABEL}>Client</label>
                  <select value={clientId} onChange={e => { setClientId(e.target.value); setClientName("") }} style={{ ...FIELD, appearance: "none" }}>
                    <option value="">— Select —</option>
                    {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
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

              {/* Instructions */}
              <div>
                <label style={LABEL}>Instructions / Keep Remember Points <span style={{ fontWeight: 400, color: "#9CA3AF", textTransform: "none" }}>(optional)</span></label>
                <textarea value={instructions} onChange={e => setInstructions(e.target.value)} rows={3}
                  placeholder="Content guidelines, reminders, or instructions…"
                  style={{ ...FIELD, resize: "vertical", lineHeight: 1.5 }} />
              </div>

              {!isEdit && assignedTo && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", background: "rgba(37,211,102,0.07)", borderRadius: 8, border: "1px solid rgba(37,211,102,0.2)" }}>
                  <Send size={13} color="#25D366" />
                  <span style={{ fontSize: 12, color: "#25D366", fontWeight: 600 }}>WhatsApp notification will be sent to assigned member</span>
                </div>
              )}

              {formError && <p style={{ fontSize: 12, color: "#EF4444", background: "rgba(239,68,68,0.07)", padding: "10px 14px", borderRadius: 8 }}>{formError}</p>}
              {formSuccess && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", background: "rgba(16,185,129,0.08)", borderRadius: 8 }}>
                  <CheckCircle2 size={14} color="#10B981" />
                  <span style={{ fontSize: 12, color: "#10B981", fontWeight: 600 }}>{isEdit ? "Updated!" : "Content scheduled!"}</span>
                </div>
              )}

              <div style={{ display: "flex", gap: 10 }}>
                <button type="button" onClick={() => setModalMode(null)}
                  style={{ flex: 1, padding: "12px", borderRadius: 10, border: "1px solid #E2E8F0", background: "#FAFAFA", fontSize: 13, fontWeight: 700, cursor: "pointer", color: "#6B7280" }}>
                  Cancel
                </button>
                <button type="submit" disabled={isPending}
                  style={{ flex: 2, padding: "12px", borderRadius: 10, border: "none", background: isPending ? "#718096" : "#DE1A1A", color: "#FFFFFF", fontSize: 13, fontWeight: 700, cursor: isPending ? "not-allowed" : "pointer" }}>
                  {isPending
                    ? <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}><Loader2 size={14} className="animate-spin" />Saving…</span>
                    : isEdit ? "Save Changes" : "Schedule Content"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
