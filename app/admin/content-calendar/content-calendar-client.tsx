"use client"

import { useState, useTransition, useMemo, useEffect } from "react"
import { useRouter } from "next/navigation"
import {
  ChevronLeft, ChevronRight, ChevronDown, Plus, X, Camera,
  Loader2, CheckCircle2, Clock,
  PlayCircle, Image, Film, Layers, Send, Trash2, Pencil,
} from "lucide-react"
import { createContentPost, updateContentPost, updateContentPostStatus, deleteContentPost } from "@/lib/actions/content-calendar"
import ClientSelector, { resolveClientName } from "@/components/ui/ClientSelector"

// ── Types ──────────────────────────────────────────────────────────────────────
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

// ── Constants ─────────────────────────────────────────────────────────────────
const PLATFORMS = [
  { id: "instagram", label: "Instagram", color: "#E1306C", emoji: "📸" },
  { id: "youtube",   label: "YouTube",   color: "#FF0000", emoji: "▶️" },
  { id: "facebook",  label: "Facebook",  color: "#1877F2", emoji: "👥" },
  { id: "linkedin",  label: "LinkedIn",  color: "#0A66C2", emoji: "💼" },
  { id: "twitter",   label: "Twitter/X", color: "#000000", emoji: "𝕏"  },
  { id: "whatsapp",  label: "WhatsApp",  color: "#25D366", emoji: "💬" },
  { id: "other",     label: "Other",     color: "#6B7280", emoji: "📱" },
]
const CONTENT_TYPES = [
  { id: "post",     label: "Post",     icon: Image      },
  { id: "reel",     label: "Reel",     icon: Film       },
  { id: "video",    label: "Video",    icon: PlayCircle },
  { id: "story",    label: "Story",    icon: Layers     },
  { id: "carousel", label: "Carousel", icon: Layers     },
  { id: "other",    label: "Other",    icon: Layers     },
]
const CONTENT_PILLARS = [
  "Branding","Cinematic","Educational","Offer","Testimonial",
  "Behind The Scenes","Trending","Festival","Engagement",
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
function platformEmoji(p: string) { return PLATFORMS.find(x => x.id === p)?.emoji ?? "📱" }

function formatTime(t: string | null | undefined): string | null {
  if (!t) return null
  const [h, m] = t.split(":").map(Number)
  const period = h >= 12 ? "PM" : "AM"
  const hr = h % 12 || 12
  return `${hr}:${String(m).padStart(2, "0")} ${period}`
}

// ── Sub-components ────────────────────────────────────────────────────────────
function Sparkline({ color }: { color: string }) {
  return (
    <svg width="108" height="40" style={{ overflow: "visible", flexShrink: 0 }}>
      <defs>
        <linearGradient id={`sg-${color.replace("#","")}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.15" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polyline
        points="4,32 18,25 30,28 44,18 56,22 70,12 84,16 104,6"
        fill="none" stroke={color} strokeWidth="2.5"
        strokeLinecap="round" strokeLinejoin="round" opacity={0.9}
      />
      <circle cx="104" cy="6" r="3.5" fill={color} />
    </svg>
  )
}

function DonutChart({ total, posted, inProgress, ready, pending }: {
  total: number; posted: number; inProgress: number; ready: number; pending: number
}) {
  const r = 42, cx = 65, cy = 65, circ = 2 * Math.PI * r
  if (total === 0) return (
    <svg width="130" height="130">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#E5E7EB" strokeWidth="15" />
      <text x={cx} y={cy - 4} textAnchor="middle" fontSize="20" fontWeight="900" fill="#111827">0</text>
      <text x={cx} y={cy + 13} textAnchor="middle" fontSize="9" fill="#9CA3AF">Total Content</text>
    </svg>
  )
  const segs = [
    { val: ready,      color: "#3B82F6" },
    { val: inProgress, color: "#F59E0B" },
    { val: posted,     color: "#10B981" },
    { val: pending,    color: "#8B5CF6" },
  ]
  let cum = 0
  return (
    <svg width="130" height="130">
      {segs.map((s, i) => {
        if (!s.val) return null
        const pct  = s.val / total
        const dash = pct * circ
        const rot  = cum * 360 - 90
        cum += pct
        return (
          <circle key={i} cx={cx} cy={cy} r={r}
            fill="none" stroke={s.color} strokeWidth="15"
            strokeDasharray={`${dash} ${circ}`}
            transform={`rotate(${rot} ${cx} ${cy})`}
          />
        )
      })}
      <text x={cx} y={cy - 4} textAnchor="middle" fontSize="20" fontWeight="900" fill="#111827">{total}</text>
      <text x={cx} y={cy + 13} textAnchor="middle" fontSize="9" fill="#9CA3AF">Total Content</text>
    </svg>
  )
}

const FIELD: React.CSSProperties = {
  width: "100%", padding: "10px 14px", borderRadius: 10,
  border: "1.5px solid #E2E8F0", fontSize: 13, background: "#FAFAFA",
  color: "#1A202C", outline: "none", fontFamily: "inherit", boxSizing: "border-box",
}
const LABEL: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, color: "#4A5568",
  textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 5, display: "block",
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function ContentCalendarClient({ posts: initial, shoots, tasks, members, clients, initialYear, initialMonth }: Props) {
  const router = useRouter()
  const [posts, setPosts]     = useState(initial)
  useEffect(() => { setPosts(initial) }, [initial])
  const [year,  setYear]      = useState(initialYear)
  const [month, setMonth]     = useState(initialMonth)
  const [view,  setView]      = useState<"calendar" | "list">("calendar")
  const [isPending, start]    = useTransition()
  const [clientFilter, setClientFilter] = useState<string>("all")

  const [modalMode,   setModalMode]   = useState<"add" | "edit" | null>(null)
  const [editingPost, setEditingPost] = useState<Post | null>(null)
  const [schedType,   setSchedType]   = useState<"" | "shoot" | "post">("")

  const [title,         setTitle]         = useState("")
  const [platform,      setPlatform]      = useState("instagram")
  const [contentType,   setContentType]   = useState("post")
  const [clientId,      setClientId]      = useState("")
  const [clientName,    setClientName]    = useState("")
  const [clientBrand,   setClientBrand]   = useState("")
  const [clientCustom,  setClientCustom]  = useState("")
  const [assignedTo,    setAssignedTo]    = useState("")
  const [instructions,  setInstructions]  = useState("")
  const [contentPillar, setContentPillar] = useState("")
  const [priority,      setPriority]      = useState("medium")
  const [schedDates,    setSchedDates]    = useState<string[]>([])
  const [schedDateInput,setSchedDateInput]= useState("")
  const [schedTime,     setSchedTime]     = useState("")
  const [shootFrom,     setShootFrom]     = useState("")
  const [shootTo,       setShootTo]       = useState("")
  const [shootLocation, setShootLocation] = useState("")
  const [formError,     setFormError]     = useState("")
  const [formSuccess,   setFormSuccess]   = useState(false)

  const firstDay  = new Date(year, month, 1).getDay()
  const daysCount = new Date(year, month + 1, 0).getDate()
  const cells     = Array.from({ length: firstDay + daysCount }, (_, i) => i < firstDay ? null : i - firstDay + 1)
  while (cells.length % 7 !== 0) cells.push(null)

  function prevMonth() { if (month === 0) { setYear(y => y - 1); setMonth(11) } else setMonth(m => m - 1) }
  function nextMonth() { if (month === 11) { setYear(y => y + 1); setMonth(0) }  else setMonth(m => m + 1) }
  function dateStr(d: number) { return `${year}-${String(month + 1).padStart(2,"0")}-${String(d).padStart(2,"0")}` }

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
    setFormError(""); setFormSuccess(false); setSchedType("")
    setShootFrom(""); setShootTo(""); setShootLocation("")
    setClientBrand(""); setClientCustom("")
  }

  function openAdd(d: number) { resetForm(); setSchedDates([dateStr(d)]); setModalMode("add") }

  function openEdit(post: Post) {
    setEditingPost(post)
    setTitle(post.title); setPlatform(post.platform); setContentType(post.content_type)
    const cl = clients.find(c => c.name === post.client_name)
    setClientId(cl?.id ?? ""); setClientName(post.client_name)
    setAssignedTo(post.assigned_to ?? ""); setInstructions(post.notes ?? "")
    setContentPillar(post.content_pillar ?? ""); setPriority(post.priority ?? "medium")
    setSchedDates([post.scheduled_date]); setSchedDateInput("")
    setSchedTime(post.scheduled_time ?? "")
    setFormError(""); setFormSuccess(false); setModalMode("edit")
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) { setFormError("Title is required"); return }
    if (schedDates.length === 0) { setFormError("Select at least one date"); return }
    setFormError("")
    start(async () => {
      const selectedClient = clients.find(c => c.id === clientId)
      const resolvedName = resolveClientName(clientName, clientBrand, clientCustom) || selectedClient?.name || ""
      const shootMeta = schedType === "shoot" && (shootFrom || shootTo || shootLocation)
        ? `\nTime: ${shootFrom || "—"} → ${shootTo || "—"}${shootLocation ? `\nLocation: ${shootLocation}` : ""}`
        : ""
      const results = await Promise.all(schedDates.map(date =>
        createContentPost({
          title, platform, content_type: contentType,
          client_id: clientId || null, client_name: resolvedName,
          scheduled_date: date, scheduled_time: schedTime || null,
          assigned_to: assignedTo || null,
          notes: (instructions + shootMeta).trim() || undefined,
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
        assigned_to: assignedTo || null, notes: instructions || undefined,
        content_pillar: contentPillar || null, priority: priority || "medium",
      })
      if (!res.success) { setFormError(res.error ?? "Something went wrong") }
      else {
        setPosts(prev => prev.map(p => p.id === editingPost.id ? {
          ...p, title, platform, content_type: contentType,
          client_name: resolvedName, scheduled_date: schedDates[0],
          assigned_to: assignedTo || null, notes: instructions || null,
          content_pillar: contentPillar || null, priority,
        } : p))
        setFormSuccess(true); router.refresh()
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

  const today        = new Date().toISOString().split("T")[0]
  const totalContent = filteredPosts.length
  const readyCount   = filteredPosts.filter(p => p.status === "ready").length
  const inProgCount  = filteredPosts.filter(p => p.status === "in_progress").length
  const postedCount  = filteredPosts.filter(p => p.status === "posted").length
  const pendingCount = filteredPosts.filter(p => p.status === "pending").length

  const showModal = modalMode !== null
  const isEdit    = modalMode === "edit"

  const upcomingPosts = useMemo(() =>
    [...filteredPosts]
      .filter(p => p.scheduled_date >= today && p.status !== "posted" && p.status !== "cancelled")
      .sort((a, b) => {
        if (a.scheduled_date !== b.scheduled_date) return a.scheduled_date.localeCompare(b.scheduled_date)
        return (a.scheduled_time ?? "").localeCompare(b.scheduled_time ?? "")
      })
      .slice(0, 5),
    [filteredPosts, today]
  )

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div style={{ background: "#F0F3FA", minHeight: "100vh", padding: 24 }}>

      {/* ── Hero Header ── */}
      <div style={{
        background: "linear-gradient(120deg, #FFFFFF 0%, #F5F0FF 60%, #EBF0FF 100%)",
        borderRadius: 24, marginBottom: 24, position: "relative", overflow: "hidden",
        display: "flex", alignItems: "center",
        padding: "28px 32px",
        boxShadow: "0 4px 24px rgba(0,0,0,0.07)",
        minHeight: 152,
      }}>
        {/* Text — left */}
        <div style={{ position: "relative", zIndex: 2, maxWidth: 500 }}>
          <h1 style={{ fontSize: 36, fontWeight: 900, color: "#111827", margin: "0 0 6px", lineHeight: 1.1 }}>
            Content Calendar <span style={{ fontSize: 32 }}>📅</span>
          </h1>
          <p style={{ color: "#6B7280", fontSize: 13, margin: "0 0 20px" }}>
            Plan, schedule &amp; track your content in one place 🚀
          </p>
          <button onClick={() => { resetForm(); setSchedDates([today]); setModalMode("add") }}
            style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "11px 22px", background: "#DE1A1A", color: "#FFF", borderRadius: 12, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 800, boxShadow: "0 4px 14px rgba(222,26,26,0.35)" }}>
            <Plus size={15} /> Add Content
          </button>
        </div>

        {/* Floating icons — right side only */}
        {[
          { e: "📸", top: 18,  right: 340, size: 30 },
          { e: "▶️", top: 55,  right: 295, size: 28 },
          { e: "📅", bottom: 20, right: 355, size: 25 },
          { e: "🔔", top: 22,  right: 230, size: 22 },
        ].map((ic, i) => (
          <span key={i} style={{
            position: "absolute", top: ic.top, bottom: ic.bottom, right: ic.right,
            fontSize: ic.size, zIndex: 1,
            filter: "drop-shadow(0 2px 8px rgba(0,0,0,0.12))",
          }}>{ic.e}</span>
        ))}

        {/* Character — right side only */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/content-cal-hero-boy.png" alt=""
          style={{ position: "absolute", right: 24, bottom: 0, height: 166, objectFit: "contain", zIndex: 1 }} />
      </div>

      {/* ── Stats Row ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 24 }}>
        {[
          { label: "Total Content",  value: totalContent, sub: "All time",    color: "#6366F1", bg: "rgba(99,102,241,0.12)",  icon: "📄" },
          { label: "Ready To Post",  value: readyCount,   sub: "Waiting",     color: "#3B82F6", bg: "rgba(59,130,246,0.12)",  icon: "📤" },
          { label: "In Progress",    value: inProgCount,  sub: "In progress", color: "#F59E0B", bg: "rgba(245,158,11,0.12)",  icon: "⏳" },
          { label: "Posted",         value: postedCount,  sub: "Completed",   color: "#10B981", bg: "rgba(16,185,129,0.12)",  icon: "✅" },
        ].map(s => (
          <div key={s.label} style={{
            background: "#FFFFFF", borderRadius: 18, padding: "20px 22px",
            border: "1px solid #E5E7EB", boxShadow: "0 2px 12px rgba(0,0,0,0.04)",
            display: "flex", alignItems: "center", justifyContent: "space-between",
          }}>
            <div>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: s.bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, marginBottom: 10 }}>
                {s.icon}
              </div>
              <p style={{ fontSize: 34, fontWeight: 900, color: "#111827", margin: "0 0 2px", lineHeight: 1 }}>{s.value}</p>
              <p style={{ fontSize: 12, fontWeight: 700, color: "#111827", margin: "0 0 2px" }}>{s.label}</p>
              <p style={{ fontSize: 11, color: s.color, fontWeight: 600, margin: 0 }}>{s.sub}</p>
            </div>
            <Sparkline color={s.color} />
          </div>
        ))}
      </div>

      {/* ── Two-Column Layout ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 308px", gap: 20, alignItems: "start" }}>

        {/* ── LEFT: Calendar + Quick Actions ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Calendar card */}
          <div style={{ background: "#FFFFFF", borderRadius: 20, border: "1px solid #E5E7EB", overflow: "hidden" }}>

            {/* Calendar toolbar */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid #F3F4F6", flexWrap: "wrap", gap: 10 }}>
              {/* Nav */}
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <button onClick={prevMonth} style={{ width: 34, height: 34, borderRadius: 10, border: "1px solid #E5E7EB", background: "#FAFAFA", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <ChevronLeft size={15} color="#6B7280" />
                </button>
                <button onClick={() => { setYear(initialYear); setMonth(initialMonth) }}
                  style={{ padding: "7px 16px", fontSize: 12, fontWeight: 700, color: "#374151", background: "#F3F4F6", borderRadius: 9, border: "none", cursor: "pointer" }}>
                  Today
                </button>
                <button onClick={nextMonth} style={{ width: 34, height: 34, borderRadius: 10, border: "1px solid #E5E7EB", background: "#FAFAFA", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <ChevronRight size={15} color="#6B7280" />
                </button>
              </div>

              {/* Month / Year */}
              <h2 style={{ fontSize: 17, fontWeight: 800, color: "#111827", margin: 0 }}>{MONTHS[month]} {year}</h2>

              {/* Right controls */}
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {clientOptions.length > 0 && (
                  <div style={{ position: "relative" }}>
                    <select value={clientFilter} onChange={e => setClientFilter(e.target.value)}
                      style={{ fontSize: 11, fontWeight: 600, color: clientFilter === "all" ? "#6B7280" : "#DE1A1A", background: clientFilter === "all" ? "#F9FAFB" : "rgba(222,26,26,0.05)", border: `1.5px solid ${clientFilter === "all" ? "#E5E7EB" : "rgba(222,26,26,0.3)"}`, borderRadius: 9, padding: "6px 26px 6px 10px", cursor: "pointer", outline: "none", appearance: "none" }}>
                      <option value="all">All Clients</option>
                      {clientOptions.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <ChevronDown size={11} style={{ position: "absolute", right: 7, top: "50%", transform: "translateY(-50%)", color: "#9CA3AF", pointerEvents: "none" }} />
                  </div>
                )}
                <div style={{ display: "flex", borderRadius: 10, overflow: "hidden", border: "1.5px solid #E5E7EB" }}>
                  {([{ k: "calendar" as const, l: "Month" }, { k: "list" as const, l: "List" }]).map(v => (
                    <button key={v.k} onClick={() => setView(v.k)}
                      style={{ padding: "7px 16px", fontSize: 12, fontWeight: 700, background: view === v.k ? "#DE1A1A" : "transparent", color: view === v.k ? "#FFF" : "#6B7280", border: "none", cursor: "pointer" }}>
                      {v.l}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {view === "calendar" ? (
              <>
                {/* Day headers */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}>
                  {DAYS.map(d => (
                    <div key={d} style={{ padding: "10px 0", textAlign: "center", fontSize: 11, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.07em", borderBottom: "1px solid #F3F4F6" }}>{d}</div>
                  ))}
                </div>
                {/* Grid cells */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}>
                  {cells.map((day, i) => {
                    if (!day) return (
                      <div key={i} style={{ minHeight: 112, borderRight: i % 7 !== 6 ? "1px solid #F3F4F6" : "none", borderBottom: "1px solid #F3F4F6", background: "#FAFAFA" }} />
                    )
                    const ds = dateStr(day)
                    const dayPosts  = postsOnDay(day)
                    const dayShoots = shootsOnDay(day)
                    const dayTasks  = tasksOnDay(day)
                    const isToday   = ds === today
                    return (
                      <div key={i} style={{ minHeight: 112, padding: "8px 6px", borderRight: i % 7 !== 6 ? "1px solid #F3F4F6" : "none", borderBottom: "1px solid #F3F4F6", background: isToday ? "rgba(222,26,26,0.025)" : "transparent" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 5 }}>
                          <span style={{ fontSize: 13, fontWeight: isToday ? 900 : 500, width: 26, height: 26, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "50%", background: isToday ? "#DE1A1A" : "transparent", color: isToday ? "#FFF" : "#374151" }}>
                            {day}
                          </span>
                          <button onClick={() => openAdd(day)} style={{ width: 18, height: 18, borderRadius: 5, border: "1px solid #E5E7EB", background: "#FAFAFA", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", opacity: 0.5 }}>
                            <Plus size={10} color="#6B7280" />
                          </button>
                        </div>
                        {dayShoots.map(s => (
                          <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 4, padding: "3px 6px", borderRadius: 6, background: "rgba(99,102,241,0.1)", marginBottom: 3, border: "1px solid rgba(99,102,241,0.2)" }}>
                            <Camera size={9} color="#6366F1" />
                            <span style={{ fontSize: 10, fontWeight: 600, color: "#6366F1", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{s.title || s.client}</span>
                          </div>
                        ))}
                        {dayTasks.map(t => (
                          <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 4, padding: "3px 6px", borderRadius: 6, background: "rgba(245,158,11,0.1)", marginBottom: 3 }}>
                            <Clock size={9} color="#F59E0B" />
                            <span style={{ fontSize: 10, fontWeight: 600, color: "#D97706", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{t.title}</span>
                          </div>
                        ))}
                        {dayPosts.map(p => {
                          const pColor   = platformColor(p.platform)
                          const isPosted = p.status === "posted"
                          const time     = formatTime(p.scheduled_time)
                          return (
                            <div key={p.id} onClick={() => openEdit(p)} style={{
                              display: "flex", alignItems: "flex-start", gap: 5,
                              padding: "4px 6px", borderRadius: 7, marginBottom: 3,
                              background: isPosted ? "rgba(16,185,129,0.1)" : `${pColor}16`,
                              border: `1px solid ${isPosted ? "rgba(16,185,129,0.25)" : pColor + "35"}`,
                              cursor: "pointer",
                            }}>
                              <span style={{ width: 16, height: 16, borderRadius: 5, background: pColor, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, flexShrink: 0, marginTop: 1 }}>
                                {platformEmoji(p.platform)}
                              </span>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <span style={{ fontSize: 10, fontWeight: 700, color: isPosted ? "#10B981" : pColor, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }}>{p.title}</span>
                                {time && <span style={{ fontSize: 9, color: "#9CA3AF", display: "block" }}>{time}</span>}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )
                  })}
                </div>
                {/* Legend */}
                <div style={{ padding: "12px 20px", borderTop: "1px solid #F3F4F6", display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
                  <span style={{ fontSize: 11, color: "#9CA3AF", fontWeight: 600 }}>Legend:</span>
                  <span style={{ fontSize: 11, color: "#6366F1", fontWeight: 600 }}>🎥 Shoot</span>
                  <span style={{ fontSize: 11, color: "#D97706", fontWeight: 600 }}>⏰ Task</span>
                  {PLATFORMS.slice(0, 4).map(p => (
                    <span key={p.id} style={{ fontSize: 11, fontWeight: 600, color: p.color }}>● {p.label}</span>
                  ))}
                </div>
              </>
            ) : (
              <div>
                <div style={{ padding: "16px 20px", borderBottom: "1px solid #F3F4F6" }}>
                  <h3 style={{ fontSize: 14, fontWeight: 800, color: "#111827", margin: 0 }}>All Scheduled Content — {MONTHS[month]} {year}</h3>
                </div>
                {filteredPosts.length === 0 ? (
                  <div style={{ padding: "60px 24px", textAlign: "center", color: "#9CA3AF", fontSize: 13 }}>No content scheduled this month.</div>
                ) : (
                  <div>
                    {filteredPosts.map((p, i) => {
                      const cfg    = STATUS_CFG[p.status] ?? STATUS_CFG.pending
                      const priCfg = PRIORITY_CFG[p.priority ?? "medium"] ?? PRIORITY_CFG.medium
                      return (
                        <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 20px", borderTop: i > 0 ? "1px solid #F9FAFB" : "none", flexWrap: "wrap" }}>
                          <div style={{ width: 36, height: 36, borderRadius: 10, background: `${platformColor(p.platform)}15`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 18 }}>
                            {platformEmoji(p.platform)}
                          </div>
                          <div style={{ flex: 1, minWidth: 120 }}>
                            <p style={{ fontSize: 13, fontWeight: 700, color: "#111827", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.title}</p>
                            <p style={{ fontSize: 11, color: "#6B7280", margin: "2px 0 0" }}>
                              {platformLabel(p.platform)} · {p.client_name || "—"} · {p.assignee?.name ?? "Unassigned"}
                              {p.content_pillar && <span style={{ marginLeft: 6, padding: "1px 7px", borderRadius: 10, background: "rgba(99,102,241,0.1)", color: "#6366F1", fontWeight: 600 }}>{p.content_pillar}</span>}
                            </p>
                          </div>
                          <span style={{ fontSize: 11, color: "#6B7280", whiteSpace: "nowrap" }}>{p.scheduled_date}{formatTime(p.scheduled_time) ? ` · ${formatTime(p.scheduled_time)}` : ""}</span>
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
          </div>

          {/* ── Quick Actions ── */}
          <div style={{ background: "#FFFFFF", borderRadius: 18, padding: "18px 20px", border: "1px solid #E5E7EB" }}>
            <h3 style={{ fontSize: 14, fontWeight: 800, color: "#111827", margin: "0 0 14px" }}>Quick Actions</h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
              {[
                { icon: "✏️", label: "Create Post",    sub: "Design & plan",    color: "#DE1A1A", bg: "rgba(222,26,26,0.07)",   action: () => { resetForm(); setSchedDates([today]); setModalMode("add") } },
                { icon: "☁️", label: "Upload Media",   sub: "Images / Videos",  color: "#3B82F6", bg: "rgba(59,130,246,0.07)",  action: () => setView("list") },
                { icon: "📋", label: "View Posts",     sub: "All scheduled",    color: "#6366F1", bg: "rgba(99,102,241,0.07)",  action: () => setView("list") },
                { icon: "💡", label: "Content Ideas",  sub: "AI Suggestions",   color: "#F59E0B", bg: "rgba(245,158,11,0.07)",  action: () => {} },
              ].map(a => (
                <button key={a.label} onClick={a.action}
                  style={{ padding: "14px 12px", borderRadius: 14, background: a.bg, border: `1.5px solid ${a.color}22`, cursor: "pointer", textAlign: "left", display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 22, flexShrink: 0 }}>{a.icon}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 12, fontWeight: 800, color: a.color, margin: 0 }}>{a.label}</p>
                    <p style={{ fontSize: 10, color: "#9CA3AF", margin: "2px 0 0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.sub}</p>
                  </div>
                  <span style={{ color: a.color, fontSize: 16, fontWeight: 700, flexShrink: 0 }}>›</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── RIGHT: Sidebar ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Upcoming Posts */}
          <div style={{ background: "#FFFFFF", borderRadius: 18, padding: "18px 20px", border: "1px solid #E5E7EB" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <h3 style={{ fontSize: 14, fontWeight: 800, color: "#111827", margin: 0 }}>Upcoming Posts</h3>
              <button onClick={() => setView("list")} style={{ fontSize: 11, fontWeight: 700, color: "#DE1A1A", background: "none", border: "none", cursor: "pointer" }}>View All</button>
            </div>
            {upcomingPosts.length === 0 ? (
              <p style={{ fontSize: 12, color: "#9CA3AF", textAlign: "center", padding: "16px 0", margin: 0 }}>No upcoming posts</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {upcomingPosts.map(p => {
                  const pColor = platformColor(p.platform)
                  const time   = formatTime(p.scheduled_time)
                  return (
                    <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }} onClick={() => openEdit(p)}>
                      <div style={{ width: 36, height: 36, borderRadius: 10, background: `${pColor}18`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, flexShrink: 0 }}>
                        {platformEmoji(p.platform)}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 12, fontWeight: 700, color: "#111827", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.title}</p>
                        <p style={{ fontSize: 10, color: "#9CA3AF", margin: "2px 0 0", whiteSpace: "nowrap" }}>
                          {p.scheduled_date}{time ? ` • ${time}` : ""}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Content Overview */}
          <div style={{ background: "#FFFFFF", borderRadius: 18, padding: "18px 20px", border: "1px solid #E5E7EB" }}>
            <h3 style={{ fontSize: 14, fontWeight: 800, color: "#111827", margin: "0 0 14px" }}>Content Overview</h3>
            <div style={{ display: "flex", justifyContent: "center" }}>
              <DonutChart total={totalContent} posted={postedCount} inProgress={inProgCount} ready={readyCount} pending={pendingCount} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 14 }}>
              {[
                { label: "Ready to Post", count: readyCount,   color: "#3B82F6" },
                { label: "In Progress",   count: inProgCount,  color: "#F59E0B" },
                { label: "Posted",        count: postedCount,  color: "#10B981" },
                { label: "Planned",       count: pendingCount, color: "#8B5CF6" },
              ].map(row => (
                <div key={row.label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                    <span style={{ width: 10, height: 10, borderRadius: 3, background: row.color, flexShrink: 0, display: "inline-block" }} />
                    <span style={{ fontSize: 11, fontWeight: 600, color: "#374151" }}>{row.label}</span>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#6B7280" }}>
                    {row.count} ({totalContent ? Math.round(row.count / totalContent * 100) : 0}%)
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Motivational card */}
          <div style={{ background: "linear-gradient(135deg, #FFF5F5 0%, #FFF0FC 100%)", borderRadius: 18, padding: "18px 16px 0", border: "1px solid #FCE7E7", position: "relative", overflow: "hidden", minHeight: 120 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/content-cal-analytics-girl.png" alt=""
              style={{ position: "absolute", right: -8, bottom: 0, height: 118, objectFit: "contain" }} />
            <div style={{ paddingRight: 90, paddingBottom: 18 }}>
              <p style={{ fontSize: 13, fontWeight: 900, color: "#111827", margin: "0 0 6px", lineHeight: 1.35 }}>
                Great content builds great connections! 🚀
              </p>
              <p style={{ fontSize: 11, color: "#9CA3AF", margin: 0, lineHeight: 1.5 }}>
                Stay consistent &amp; keep growing.
              </p>
            </div>
          </div>

        </div>
      </div>

      {/* ── Add / Edit Modal ── */}
      {showModal && (
        <div style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)" }} onClick={() => setModalMode(null)} />
          <div style={{ position: "relative", background: "#FFFFFF", borderRadius: 20, padding: 28, width: "100%", maxWidth: 580, maxHeight: "92vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
              <div>
                <h3 style={{ fontSize: 17, fontWeight: 800, color: "#111827", margin: 0 }}>
                  {isEdit ? "Edit Content" : "Schedule Content"}
                </h3>
                {!isEdit && <p style={{ fontSize: 12, color: "#6B7280", margin: "2px 0 0" }}>
                  {schedType === "shoot" ? "📹 Video Shoot Schedule" : schedType === "post" ? "📱 Post (Videos & Poster)" : "Choose what to schedule"}
                </p>}
              </div>
              <button onClick={() => setModalMode(null)} style={{ background: "none", border: "none", cursor: "pointer" }}>
                <X size={18} color="#6B7280" />
              </button>
            </div>

            {!isEdit && !schedType && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 4 }}>
                {[
                  { key: "shoot", emoji: "📹", label: "Video Shoot", sub: "Schedule a shoot session", color: "#6366F1", bg: "rgba(99,102,241,0.06)", border: "rgba(99,102,241,0.25)" },
                  { key: "post",  emoji: "📱", label: "Post",        sub: "Videos, Reels & Posters",  color: "#DE1A1A", bg: "rgba(222,26,26,0.06)",   border: "rgba(222,26,26,0.25)" },
                ].map(opt => (
                  <button key={opt.key} type="button"
                    onClick={() => { setSchedType(opt.key as "shoot" | "post"); setContentType(opt.key === "shoot" ? "video" : "post"); setPlatform(opt.key === "shoot" ? "other" : "instagram") }}
                    style={{ padding: "22px 16px", borderRadius: 16, border: `2px solid ${opt.border}`, background: opt.bg, cursor: "pointer", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 32 }}>{opt.emoji}</span>
                    <span style={{ fontSize: 14, fontWeight: 800, color: opt.color }}>{opt.label}</span>
                    <span style={{ fontSize: 11, color: "#6B7280" }}>{opt.sub}</span>
                  </button>
                ))}
              </div>
            )}
            {!isEdit && schedType && (
              <button type="button" onClick={() => setSchedType("")}
                style={{ fontSize: 11, fontWeight: 700, color: "#9CA3AF", background: "none", border: "none", cursor: "pointer", padding: "0 0 6px", textAlign: "left" }}>
                ← Change type
              </button>
            )}

            <form onSubmit={isEdit ? handleEdit : handleCreate} style={{ display: isEdit || schedType ? "flex" : "none", flexDirection: "column", gap: 16 }}>
              <div>
                <label style={LABEL}>Title *</label>
                <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Diwali Sale Reel" required style={FIELD} />
              </div>

              {(isEdit || schedType === "post") && (
                <>
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
                </>
              )}

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

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={LABEL}>Post Time <span style={{ fontWeight: 400, color: "#9CA3AF", textTransform: "none" }}>(optional)</span></label>
                  <input type="time" value={schedTime} onChange={e => setSchedTime(e.target.value)} style={FIELD} />
                </div>
                <div>
                  <label style={LABEL}>Assign To</label>
                  <select value={assignedTo} onChange={e => setAssignedTo(e.target.value)} style={{ ...FIELD, appearance: "none" }}>
                    <option value="">— Select —</option>
                    {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </div>
              </div>

              <ClientSelector
                clientOptions={clients.map(c => c.name)}
                value={clientName} brand={clientBrand} customClient={clientCustom}
                onValueChange={v => { setClientName(v); setClientId(clients.find(c => c.name === v)?.id ?? "") }}
                onBrandChange={setClientBrand} onCustomChange={setClientCustom}
                label="Client"
                fieldStyle={{ ...FIELD, appearance: "none" as const }}
              />

              {(isEdit ? contentType === "shoot" : schedType === "shoot") && (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <div>
                      <label style={LABEL}>Shoot From</label>
                      <input type="time" value={shootFrom} onChange={e => setShootFrom(e.target.value)} style={FIELD} />
                    </div>
                    <div>
                      <label style={LABEL}>Shoot To</label>
                      <input type="time" value={shootTo} onChange={e => setShootTo(e.target.value)} style={FIELD} />
                    </div>
                  </div>
                  <div>
                    <label style={LABEL}>Location</label>
                    <input value={shootLocation} onChange={e => setShootLocation(e.target.value)} placeholder="e.g. Studio A, Client Office, Outdoor — MG Road…" style={FIELD} />
                  </div>
                </>
              )}

              <div>
                <label style={LABEL}>Instructions <span style={{ fontWeight: 400, color: "#9CA3AF", textTransform: "none" }}>(optional)</span></label>
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

              {formError && <p style={{ fontSize: 12, color: "#EF4444", background: "rgba(239,68,68,0.07)", padding: "10px 14px", borderRadius: 8, margin: 0 }}>{formError}</p>}
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
