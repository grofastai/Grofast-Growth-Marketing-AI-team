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

const INTERNAL_BRANDS = ["GROFAST DIGITAL", "KARTHICK BRANDS", "GROFAST AI"]

// ── Types ──────────────────────────────────────────────────────────────────────
interface Post {
  id: string; title: string; platform: string; content_type: string
  client_name: string; scheduled_date: string; status: string
  assigned_to: string | null; drive_link: string | null
  content_pillar?: string | null; priority?: string | null
  notes?: string | null; scheduled_time?: string | null
  assignee?: { name: string } | null
  shoot_team?: string[] | null
}
interface Shoot  { id: string; title: string; start_time: string; client: string; status: string }
interface Task   { id: string; title: string; due_date: string; status: string }
interface Member { id: string; name: string; employee_id: string }
interface Client { id: string; name: string }

interface Props {
  posts: Post[]; shoots: Shoot[]; tasks: Task[]
  members: Member[]; clients: Client[]; pastClients?: Client[]
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
  medium: { label: "Medium", color: "#FFA53A", bg: "rgba(255,165,58,0.1)" },
  high:   { label: "High",   color: "#EF4444", bg: "rgba(239,68,68,0.1)"  },
  urgent: { label: "Urgent", color: "#7C3AED", bg: "rgba(124,58,237,0.1)" },
}
const STATUS_CFG: Record<string, { label: string; color: string; bg: string }> = {
  pending:     { label: "Scheduled",   color: "#FFA53A", bg: "rgba(255,165,58,0.1)"  },
  in_progress: { label: "In Progress", color: "#4D8CFF", bg: "rgba(77,140,255,0.1)"  },
  ready:       { label: "Ready",       color: "#9B6BFF", bg: "rgba(155,107,255,0.1)"  },
  posted:      { label: "Uploaded ✓",  color: "#32D27A", bg: "rgba(50,210,122,0.1)"  },
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
function isShootPost(p: Post) { return (p.shoot_team?.length ?? 0) > 0 }

// ── Sub-components ────────────────────────────────────────────────────────────
function Sparkline({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 120 40" preserveAspectRatio="none" style={{ width: "100%", height: 44, display: "block" }}>
      <defs>
        <linearGradient id={`sg-${color.replace("#","")}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.18" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon
        points="0,40 0,34 14,28 28,31 44,20 56,24 72,13 86,18 104,7 120,9 120,40"
        fill={`url(#sg-${color.replace("#","")})`}
      />
      <polyline
        points="0,34 14,28 28,31 44,20 56,24 72,13 86,18 104,7 120,9"
        fill="none" stroke={color} strokeWidth="2.5"
        strokeLinecap="round" strokeLinejoin="round"
      />
      {[[14,28],[28,31],[44,20],[56,24],[72,13],[86,18],[104,7],[120,9]].map(([cx,cy],i) => (
        <circle key={i} cx={cx} cy={cy} r="2.6" fill="#FFFFFF" stroke={color} strokeWidth="1.6" />
      ))}
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
    { val: ready,      color: "#4D8CFF" },
    { val: inProgress, color: "#FFA53A" },
    { val: posted,     color: "#32D27A" },
    { val: pending,    color: "#9B6BFF" },
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
export default function ContentCalendarClient({ posts: initial, shoots, tasks, members, clients, pastClients = [], initialYear, initialMonth }: Props) {
  const router = useRouter()
  const [posts, setPosts]     = useState(initial)
  useEffect(() => { setPosts(initial) }, [initial])
  const [year,  setYear]      = useState(initialYear)
  const [month, setMonth]     = useState(initialMonth)
  const [view,  setView]        = useState<"calendar" | "list">("calendar")
  const [contentMode, setContentMode] = useState<"post" | "shoot">("post")
  const [memberFilter, setMemberFilter] = useState<string>("all")
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split("T")[0])
  const [isMobile, setIsMobile] = useState(false)
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener("resize", check)
    return () => window.removeEventListener("resize", check)
  }, [])
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
  const [shootTeam,     setShootTeam]     = useState<string[]>([])
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

  function prevMonth() {
    const newYear = month === 0 ? year - 1 : year
    const newMonth = month === 0 ? 11 : month - 1
    setYear(newYear); setMonth(newMonth)
    router.push(`/admin/content-calendar?year=${newYear}&month=${newMonth}`)
  }
  function nextMonth() {
    const newYear = month === 11 ? year + 1 : year
    const newMonth = month === 11 ? 0 : month + 1
    setYear(newYear); setMonth(newMonth)
    router.push(`/admin/content-calendar?year=${newYear}&month=${newMonth}`)
  }
  function dateStr(d: number) { return `${year}-${String(month + 1).padStart(2,"0")}-${String(d).padStart(2,"0")}` }

  const clientOptions = useMemo(() => {
    const names = [...new Set(posts.map(p => p.client_name).filter(Boolean))] as string[]
    const others = names.filter(n => !INTERNAL_BRANDS.includes(n)).sort()
    return [...INTERNAL_BRANDS, ...others]
  }, [posts])

  const filteredPosts = useMemo(() => {
    let p = clientFilter === "all" ? posts : posts.filter(p => p.client_name === clientFilter)
    if (memberFilter !== "all") p = p.filter(p => p.assigned_to === memberFilter || (p.shoot_team ?? []).includes(memberFilter))
    if (contentMode === "shoot") p = p.filter(p => p.platform === "other")
    else p = p.filter(p => p.platform !== "other")
    return p
  }, [posts, clientFilter, memberFilter, contentMode])

  function postsOnDay(d: number)  { const ds = dateStr(d); return filteredPosts.filter(p => p.scheduled_date === ds) }
  function shootsOnDay(d: number) {
    if (contentMode !== "shoot") return []
    const ds = dateStr(d)
    return shoots.filter(s => s.start_time.split("T")[0] === ds)
  }
  function tasksOnDay(d: number)  { const ds = dateStr(d); return tasks.filter(t => t.due_date === ds) }

  function resetForm() {
    setTitle(""); setPlatform("instagram"); setContentType("post")
    setClientId(""); setClientName(""); setAssignedTo(""); setShootTeam([])
    setInstructions(""); setContentPillar(""); setPriority("medium")
    setSchedTime(""); setSchedDates([]); setSchedDateInput("")
    setFormError(""); setFormSuccess(false); setSchedType("")
    setShootFrom(""); setShootTo(""); setShootLocation("")
    setClientBrand(""); setClientCustom("")
  }

  function openAdd(d: number) {
    resetForm()
    setSchedDates([dateStr(d)])
    if (contentMode === "shoot") { setSchedType("shoot"); setContentType("video"); setPlatform("other") }
    else { setSchedType("post"); setPlatform("instagram") }
    setModalMode("add")
  }

  function openEdit(post: Post) {
    setEditingPost(post)
    setTitle(post.title); setPlatform(post.platform); setContentType(post.content_type)
    const cl = clients.find(c => c.name === post.client_name)
    setClientId(cl?.id ?? ""); setClientName(post.client_name)
    setAssignedTo(post.assigned_to ?? ""); setShootTeam((post as Post & { shoot_team?: string[] }).shoot_team ?? [])
    setInstructions(post.notes ?? "")
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
          scheduled_date: date,
          scheduled_time: schedType !== "shoot" ? (schedTime || null) : null,
          assigned_to: schedType === "shoot" ? (shootTeam[0] || null) : (assignedTo || null),
          shoot_team: schedType === "shoot" ? shootTeam : [],
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
        assigned_to: (contentType === "shoot" ? (shootTeam[0] || null) : (assignedTo || null)),
        shoot_team: contentType === "shoot" ? shootTeam : [],
        notes: instructions || undefined,
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
      const res = await deleteContentPost(postId)
      if (res?.success) {
        setPosts(prev => prev.filter(p => p.id !== postId))
        router.refresh()
      } else {
        alert(res?.error ?? "Failed to delete. Please try again.")
      }
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
    <div style={{ background: "#F9FAFB", minHeight: "100vh", padding: isMobile ? "12px" : "24px" }}>

      {/* ── Hero Header — double-colour banner ── */}
      <div style={{
        background: "linear-gradient(105deg, #E8000A 0%, #C00008 28%, #7B0000 58%, #1A0000 100%)",
        borderRadius: 24, marginBottom: 24, position: "relative", overflow: "hidden",
        padding: isMobile ? "0 16px" : "0 32px",
        boxShadow: "0 12px 48px rgba(139,0,0,0.55)",
        minHeight: isMobile ? 130 : 160,
        display: "flex", alignItems: "center", flexWrap: "wrap",
      }}>
        {/* Left radial glow (bright side) */}
        <div style={{ position: "absolute", top: "50%", left: -60, transform: "translateY(-50%)", width: 320, height: 320, borderRadius: "50%", background: "radial-gradient(circle, rgba(255,80,80,0.18) 0%, transparent 65%)", pointerEvents: "none" }} />
        {/* Right radial glow (dark side) */}
        <div style={{ position: "absolute", top: "50%", right: -40, transform: "translateY(-50%)", width: 240, height: 240, borderRadius: "50%", background: "radial-gradient(circle, rgba(255,255,255,0.04) 0%, transparent 70%)", pointerEvents: "none" }} />

        {/* ── LEFT: badge + title + controls ── */}
        <div style={{ flex: 1, position: "relative", zIndex: 3, paddingTop: 28, paddingBottom: 28 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(255,255,255,0.18)", backdropFilter: "blur(8px)", borderRadius: 20, padding: "4px 12px 4px 8px", marginBottom: 10, border: "1px solid rgba(255,255,255,0.25)" }}>
            <span style={{ fontSize: 14 }}>⭐</span>
            <span style={{ fontSize: 11, fontWeight: 800, color: "#FFF", letterSpacing: "0.04em" }}>Content Calendar</span>
          </div>
          <h1 style={{ fontSize: isMobile ? 22 : 36, fontWeight: 900, color: "#FFFFFF", margin: "0 0 4px", lineHeight: 1.1, textShadow: "0 2px 12px rgba(0,0,0,0.3)" }}>
            Content Calendar
          </h1>
          <p style={{ color: "rgba(255,255,255,0.65)", fontSize: isMobile ? 11 : 13, margin: "0 0 20px", fontWeight: 500 }}>
            {new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
          </p>
          {/* Toggle row */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button onClick={() => { resetForm(); setSchedDates([today]); setModalMode("add") }}
              style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 20px", background: "rgba(255,255,255,0.22)", backdropFilter: "blur(8px)", color: "#FFF", borderRadius: 12, border: "1.5px solid rgba(255,255,255,0.35)", cursor: "pointer", fontSize: 12, fontWeight: 800, whiteSpace: "nowrap" }}>
              <Plus size={14} strokeWidth={3} /> Add Content
            </button>
            <div style={{ display: "flex", background: "rgba(0,0,0,0.25)", backdropFilter: "blur(8px)", borderRadius: 10, padding: 3, gap: 2, border: "1px solid rgba(255,255,255,0.12)" }}>
              {([
                { v: "calendar" as const, label: "📅 Calendar" },
                { v: "list"     as const, label: "☰ List" },
              ]).map(({ v, label }) => (
                <button key={v} onClick={() => setView(v)} style={{
                  padding: "6px 13px", borderRadius: 8, border: "none", cursor: "pointer",
                  fontSize: 11, fontWeight: 700, transition: "all 0.15s",
                  background: view === v ? "rgba(255,255,255,0.22)" : "transparent",
                  color: view === v ? "#FFF" : "rgba(255,255,255,0.5)",
                  boxShadow: view === v ? "0 2px 8px rgba(0,0,0,0.3)" : "none",
                  outline: "none",
                  borderWidth: 1, borderStyle: "solid",
                  borderColor: view === v ? "rgba(255,255,255,0.25)" : "transparent",
                }}>{label}</button>
              ))}
            </div>
          </div>
        </div>

        {/* ── CENTER: Character + greeting card ── */}
        <div style={{ position: "relative", zIndex: 3, display: isMobile ? "none" : "flex", alignItems: "flex-end", gap: 16, padding: "0 32px" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/content-cal-hero-girl.png" alt=""
            style={{ height: 160, width: "auto", objectFit: "contain", objectPosition: "bottom", flexShrink: 0, filter: "drop-shadow(0 6px 20px rgba(0,0,0,0.4))" }} />
          <div style={{ background: "rgba(255,255,255,0.12)", backdropFilter: "blur(12px)", borderRadius: 16, padding: "14px 18px", border: "1px solid rgba(255,255,255,0.2)", minWidth: 200, marginBottom: 16 }}>
            <p style={{ fontSize: 15, fontWeight: 800, color: "#FFF", margin: "0 0 4px" }}>Plan your content! 📅</p>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.65)", margin: 0 }}>What are you scheduling today?</p>
          </div>
        </div>

        {/* ── RIGHT: Date card + Stats glass cards ── */}
        <div style={{ display: isMobile ? "none" : "flex", gap: 12, position: "relative", zIndex: 3, flexShrink: 0 }}>
          {/* Date card */}
          <div style={{ background: "rgba(255,255,255,0.1)", backdropFilter: "blur(12px)", borderRadius: 18, padding: "16px 20px", textAlign: "center", border: "1px solid rgba(255,255,255,0.15)", minWidth: 90 }}>
            <p style={{ fontSize: 10, fontWeight: 800, color: "rgba(255,255,255,0.6)", margin: "0 0 2px", letterSpacing: "0.1em" }}>
              {MONTHS[month].slice(0,3).toUpperCase()} {year}
            </p>
            <p style={{ fontSize: 38, fontWeight: 900, color: "#FFFFFF", margin: "0 0 2px", lineHeight: 1 }}>
              {new Date().getDate()}
            </p>
            <p style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", margin: 0, fontWeight: 600 }}>
              {new Date().toLocaleDateString("en-US", { weekday: "long" })}
            </p>
          </div>
          {/* Posts this month card */}
          <div style={{ background: "rgba(255,255,255,0.1)", backdropFilter: "blur(12px)", borderRadius: 18, padding: "16px 20px", textAlign: "center", border: "1px solid rgba(255,255,255,0.15)", minWidth: 90 }}>
            <p style={{ fontSize: 10, fontWeight: 800, color: "rgba(255,255,255,0.6)", margin: "0 0 2px", letterSpacing: "0.06em" }}>TOTAL</p>
            <p style={{ fontSize: 38, fontWeight: 900, color: "#FFFFFF", margin: "0 0 2px", lineHeight: 1 }}>{totalContent}</p>
            <p style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", margin: 0, fontWeight: 600 }}>Posts</p>
          </div>
          {/* Posted card */}
          <div style={{ background: "rgba(255,255,255,0.1)", backdropFilter: "blur(12px)", borderRadius: 18, padding: "16px 20px", textAlign: "center", border: "1px solid rgba(255,255,255,0.15)", minWidth: 90 }}>
            <p style={{ fontSize: 10, fontWeight: 800, color: "rgba(255,255,255,0.6)", margin: "0 0 2px", letterSpacing: "0.06em" }}>UPLOADED</p>
            <p style={{ fontSize: 38, fontWeight: 900, color: "#FFFFFF", margin: "0 0 2px", lineHeight: 1 }}>{postedCount}</p>
            <p style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", margin: 0, fontWeight: 600 }}>Done ✓</p>
          </div>
        </div>
      </div>

      {/* ── Mode Tabs + Member Filter ── */}
      <div style={{ display: "flex", gap: 12, marginBottom: isMobile ? 14 : 20, flexWrap: "wrap", alignItems: "stretch" }}>
        {/* Post / Shoot tabs */}
        <div style={{ flex: 1, minWidth: 260, display: "flex", gap: 4, background: "#FFFFFF", borderRadius: 18, padding: 4, border: "1px solid #E5E7EB", boxShadow: "0 2px 16px rgba(0,0,0,0.06)" }}>
          {([
            { mode: "post"  as const, icon: "📄", label: "Post Schedule",  desc: "Reels, posters, stories", grad: "linear-gradient(135deg, #C41230 0%, #8B0000 100%)", shadow: "rgba(139,0,0,0.35)" },
            { mode: "shoot" as const, icon: "📹", label: "Shoot Schedule", desc: "Video shoots & locations",  grad: "linear-gradient(135deg, #1D4ED8 0%, #4D8CFF 100%)", shadow: "rgba(29,78,216,0.35)" },
          ]).map(({ mode, icon, label, desc, grad, shadow }) => (
            <button key={mode} onClick={() => setContentMode(mode)} style={{
              flex: 1, padding: isMobile ? "12px 14px" : "16px 20px", borderRadius: 14, border: "none", cursor: "pointer",
              background: contentMode === mode ? grad : "transparent",
              color: contentMode === mode ? "#FFF" : "#6B7280",
              textAlign: "left", transition: "all 0.18s",
              boxShadow: contentMode === mode ? `0 4px 20px ${shadow}` : "none",
            }}>
              <p style={{ fontSize: isMobile ? 13 : 14, fontWeight: 800, margin: "0 0 2px", display: "flex", alignItems: "center", gap: 6 }}>
                <span>{icon}</span> {label}
              </p>
              <p style={{ fontSize: isMobile ? 10 : 11, opacity: contentMode === mode ? 0.75 : 0.6, margin: 0, fontWeight: 500 }}>{desc}</p>
            </button>
          ))}
        </div>
        {/* Member filter */}
        <div style={{ background: "#FFFFFF", borderRadius: 18, padding: "14px 18px", border: "1px solid #E5E7EB", boxShadow: "0 2px 16px rgba(0,0,0,0.06)", display: "flex", flexDirection: "column", justifyContent: "center", minWidth: 200 }}>
          <p style={{ fontSize: 10, fontWeight: 800, color: "#4A5568", textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 8px" }}>View Schedule Of</p>
          <div style={{ position: "relative" }}>
            <select value={memberFilter} onChange={e => setMemberFilter(e.target.value)}
              style={{ width: "100%", padding: "8px 30px 8px 12px", borderRadius: 10, border: `1.5px solid ${memberFilter === "all" ? "#E5E7EB" : "#DE1A1A"}`, background: memberFilter === "all" ? "#FAFAFA" : "rgba(222,26,26,0.04)", fontSize: 13, fontWeight: 700, color: memberFilter === "all" ? "#6B7280" : "#DE1A1A", cursor: "pointer", outline: "none", appearance: "none" }}>
              <option value="all">👥 All Team Members</option>
              {members.map(m => <option key={m.id} value={m.id}>👤 {m.name}</option>)}
            </select>
            <ChevronDown size={11} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: "#9CA3AF", pointerEvents: "none" }} />
          </div>
        </div>
      </div>

      {/* ── Stats Row ── */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)", gap: isMobile ? 10 : 16, marginBottom: isMobile ? 14 : 24 }}>
        {[
          { label: "Total Content", value: totalContent, sub: "All time",   icon: "📄", headerBg: "linear-gradient(135deg,#8B0000 0%,#C41230 100%)", accent: "#DE1A1A", shadow: "rgba(139,0,0,0.22)" },
          { label: "Ready To Post", value: readyCount,   sub: "Scheduled",  icon: "📤", headerBg: "linear-gradient(135deg,#1E3A8A 0%,#3B82F6 100%)", accent: "#3B82F6", shadow: "rgba(37,99,235,0.2)"  },
          { label: "In Progress",   value: inProgCount,  sub: "Creating",   icon: "⏳", headerBg: "linear-gradient(135deg,#92400E 0%,#F59E0B 100%)", accent: "#F59E0B", shadow: "rgba(146,64,14,0.2)"  },
          { label: "Uploaded",      value: postedCount,  sub: "Uploaded ✓", icon: "✅", headerBg: "linear-gradient(135deg,#14532D 0%,#22C55E 100%)", accent: "#22C55E", shadow: "rgba(20,83,45,0.2)"   },
        ].map(s => (
          <div key={s.label} style={{
            background: "#FFFFFF", borderRadius: 22, overflow: "hidden",
            boxShadow: `0 4px 24px ${s.shadow}`,
            border: "1px solid rgba(0,0,0,0.06)",
            display: "flex", flexDirection: "column",
          }}>
            {/* Coloured header strip */}
            <div style={{ background: s.headerBg, padding: isMobile ? "12px 14px 10px" : "20px 22px 16px", position: "relative", overflow: "hidden" }}>
              <div style={{ position: "absolute", top: -20, right: -20, width: 80, height: 80, borderRadius: "50%", background: "rgba(255,255,255,0.12)", pointerEvents: "none" }} />
              <span style={{ fontSize: isMobile ? 20 : 28, display: "block", marginBottom: isMobile ? 4 : 8 }}>{s.icon}</span>
              <p style={{ fontSize: isMobile ? 11 : 13, fontWeight: 700, color: "rgba(255,255,255,0.85)", margin: 0 }}>{s.label}</p>
            </div>
            {/* White body */}
            <div style={{ padding: isMobile ? "10px 14px 14px" : "18px 22px 22px" }}>
              <p style={{ fontSize: isMobile ? 30 : 44, fontWeight: 900, color: "#0F172A", margin: "0 0 6px", lineHeight: 1, letterSpacing: "-0.03em" }}>{s.value}</p>
              <p style={{ fontSize: 11, color: s.accent, fontWeight: 700, margin: 0, display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: s.accent, display: "inline-block", flexShrink: 0 }} />
                {s.sub}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Calendar / List Layout ── */}
      <div style={{ display: "grid", gridTemplateColumns: (view === "calendar" && !isMobile) ? "1fr 360px" : "1fr", gap: 20, alignItems: "start" }}>

        {/* ── MAIN: Calendar OR full list ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Calendar card */}
          <div style={{ background: "#FFFFFF", borderRadius: 20, border: "1px solid #E5E7EB", overflow: "hidden" }}>

            {/* Calendar toolbar */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", borderBottom: "1px solid #F3F4F6", flexWrap: "wrap", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <button onClick={prevMonth} style={{ width: 30, height: 30, borderRadius: 8, border: "1px solid #E5E7EB", background: "#FAFAFA", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <ChevronLeft size={13} color="#6B7280" />
                </button>
                <button onClick={() => { setYear(initialYear); setMonth(initialMonth); setSelectedDate(today) }}
                  style={{ padding: "6px 13px", fontSize: 11, fontWeight: 700, color: "#374151", background: "#F3F4F6", borderRadius: 8, border: "none", cursor: "pointer" }}>
                  Today
                </button>
                <button onClick={nextMonth} style={{ width: 30, height: 30, borderRadius: 8, border: "1px solid #E5E7EB", background: "#FAFAFA", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <ChevronRight size={13} color="#6B7280" />
                </button>
              </div>

              <h2 style={{ fontSize: 15, fontWeight: 800, color: "#111827", margin: 0 }}>{MONTHS[month]} {year}</h2>

              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {clientOptions.length > 0 && (
                  <div style={{ position: "relative" }}>
                    <select value={clientFilter} onChange={e => setClientFilter(e.target.value)}
                      style={{ fontSize: 11, fontWeight: 600, color: clientFilter === "all" ? "#6B7280" : "#DE1A1A", background: clientFilter === "all" ? "#F9FAFB" : "rgba(222,26,26,0.05)", border: `1.5px solid ${clientFilter === "all" ? "#E5E7EB" : "rgba(222,26,26,0.3)"}`, borderRadius: 8, padding: "5px 22px 5px 9px", cursor: "pointer", outline: "none", appearance: "none" }}>
                      <option value="all">All Clients</option>
                      {clientOptions.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <ChevronDown size={10} style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", color: "#9CA3AF", pointerEvents: "none" }} />
                  </div>
                )}
                <div style={{ display: "flex", background: "#F3F4F6", borderRadius: 9, padding: 2, gap: 1 }}>
                  {([{ v: "calendar" as const, label: "📅 Calendar" }, { v: "list" as const, label: "☰ List" }]).map(({ v, label }) => (
                    <button key={v} onClick={() => setView(v)} style={{
                      padding: "5px 12px", borderRadius: 7, border: "none", cursor: "pointer", fontSize: 11, fontWeight: 700,
                      background: view === v ? "linear-gradient(135deg,#FF4D4D,#DE1A1A)" : "transparent",
                      color: view === v ? "#FFF" : "#6B7280",
                      boxShadow: view === v ? "0 2px 8px rgba(222,26,26,0.3)" : "none",
                    }}>{label}</button>
                  ))}
                </div>
              </div>
            </div>

            {view === "calendar" ? (
              <>
                {/* Day headers */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}>
                  {DAYS.map(d => (
                    <div key={d} style={{ padding: "8px 0", textAlign: "center", fontSize: 10, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.07em", borderBottom: "1px solid #F3F4F6" }}>{d}</div>
                  ))}
                </div>
                {/* Grid cells */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}>
                  {cells.map((day, i) => {
                    if (!day) return (
                      <div key={i} style={{ minHeight: isMobile ? 52 : 95, borderRight: i % 7 !== 6 ? "1px solid #F3F4F6" : "none", borderBottom: "1px solid #F3F4F6", background: "#FAFAFA" }} />
                    )
                    const ds         = dateStr(day)
                    const dayPosts   = postsOnDay(day)
                    const dayShoots  = shootsOnDay(day)
                    const dayTasks   = tasksOnDay(day)
                    const isToday    = ds === today
                    const isSelected = ds === selectedDate
                    const total      = dayPosts.length + dayShoots.length + dayTasks.length
                    const visible    = [...dayShoots.map(s => ({ type: "shoot" as const, id: s.id, color: "#9B6BFF", label: s.title || s.client })), ...dayTasks.map(t => ({ type: "task" as const, id: t.id, color: "#FFA53A", label: t.title })), ...dayPosts.map(p => ({ type: isShootPost(p) ? "shoot" as const : "post" as const, id: p.id, color: isShootPost(p) ? "#9B6BFF" : platformColor(p.platform), label: p.title }))]
                    const shown      = visible.slice(0, 2)
                    const more       = total - shown.length
                    return (
                      <div key={i} onClick={() => setSelectedDate(ds)} style={{
                        minHeight: isMobile ? 52 : 95, padding: isMobile ? "5px 4px" : "7px 6px", cursor: "pointer",
                        borderRight: i % 7 !== 6 ? "1px solid #F3F4F6" : "none",
                        borderBottom: "1px solid #F3F4F6",
                        background: isSelected ? "rgba(222,26,26,0.06)" : isToday ? "rgba(222,26,26,0.025)" : "transparent",
                        outline: isSelected ? "2px solid rgba(222,26,26,0.25)" : "none",
                        outlineOffset: -1,
                        transition: "background 0.12s",
                      }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: isMobile ? 3 : 4 }}>
                          <span style={{ fontSize: isMobile ? 10 : 12, fontWeight: isToday ? 900 : 500, width: isMobile ? 18 : 22, height: isMobile ? 18 : 22, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "50%", background: isToday ? "#DE1A1A" : "transparent", color: isToday ? "#FFF" : isSelected ? "#DE1A1A" : "#374151" }}>
                            {day}
                          </span>
                          {total > 0 && (
                            <span style={{ fontSize: 9, fontWeight: 700, color: "#DE1A1A", background: "rgba(222,26,26,0.1)", borderRadius: 5, padding: "1px 4px" }}>{total}</span>
                          )}
                        </div>
                        {!isMobile && shown.map(item => (
                          <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 3, padding: "2px 5px", borderRadius: 5, marginBottom: 2, background: `${item.color}14`, border: `1px solid ${item.color}28` }}>
                            <span style={{ width: 5, height: 5, borderRadius: "50%", background: item.color, flexShrink: 0 }} />
                            <span style={{ fontSize: 9, fontWeight: 600, color: item.color, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.label}</span>
                          </div>
                        ))}
                        {isMobile && total > 0 && (
                          <div style={{ display: "flex", gap: 2, flexWrap: "wrap", paddingTop: 2 }}>
                            {visible.slice(0, 3).map(item => (
                              <span key={item.id} style={{ width: 5, height: 5, borderRadius: "50%", background: item.color, display: "inline-block" }} />
                            ))}
                          </div>
                        )}
                        {!isMobile && more > 0 && (
                          <span style={{ fontSize: 9, fontWeight: 700, color: "#9CA3AF", paddingLeft: 5 }}>+{more} more</span>
                        )}
                      </div>
                    )
                  })}
                </div>
                {/* Legend */}
                <div style={{ padding: "10px 18px", borderTop: "1px solid #F3F4F6", display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center" }}>
                  <span style={{ fontSize: 10, color: "#9CA3AF", fontWeight: 600 }}>Legend:</span>
                  <span style={{ fontSize: 10, color: "#9B6BFF", fontWeight: 600 }}>🎥 Shoot</span>
                  <span style={{ fontSize: 10, color: "#D97706", fontWeight: 600 }}>⏰ Task</span>
                  {PLATFORMS.slice(0, 4).map(p => (
                    <span key={p.id} style={{ fontSize: 10, fontWeight: 600, color: p.color }}>● {p.label}</span>
                  ))}
                </div>
              </>
            ) : (
              <div>
                <div style={{ padding: "14px 18px", borderBottom: "1px solid #F3F4F6", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                  <h3 style={{ fontSize: 14, fontWeight: 800, color: "#111827", margin: 0 }}>
                    {contentMode === "shoot" ? "📹 Shoot Schedule" : "📄 Post Schedule"} — {memberFilter !== "all" ? (members.find(m => m.id === memberFilter)?.name ?? "Team Member") : "All Members"} · {MONTHS[month]} {year}
                  </h3>
                  {memberFilter !== "all" && (
                    <button onClick={() => setMemberFilter("all")} style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 99, border: "1.5px solid #E5E7EB", background: "#F3F4F6", color: "#6B7280", cursor: "pointer" }}>
                      Show All ×
                    </button>
                  )}
                </div>
                {filteredPosts.length === 0 ? (
                  <div style={{ padding: "60px 24px", textAlign: "center", color: "#9CA3AF", fontSize: 13 }}>No content scheduled this month.</div>
                ) : (
                  <div>
                    {filteredPosts.map((p, i) => {
                      const cfg    = STATUS_CFG[p.status] ?? STATUS_CFG.pending
                      const priCfg = PRIORITY_CFG[p.priority ?? "medium"] ?? PRIORITY_CFG.medium
                      return (
                        <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 18px", borderTop: i > 0 ? "1px solid #F9FAFB" : "none", flexWrap: "wrap" }}>
                          <div style={{ width: 36, height: 36, borderRadius: 10, background: `${platformColor(p.platform)}15`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 18 }}>
                            {platformEmoji(p.platform)}
                          </div>
                          <div style={{ flex: 1, minWidth: 120 }}>
                            <p style={{ fontSize: 13, fontWeight: 700, color: "#111827", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.title}</p>
                            <p style={{ fontSize: 11, color: "#6B7280", margin: "2px 0 0" }}>
                              {platformLabel(p.platform)} · {p.client_name || "—"} · {p.assignee?.name ?? "Unassigned"}
                              {p.content_pillar && <span style={{ marginLeft: 6, padding: "1px 7px", borderRadius: 10, background: "rgba(155,107,255,0.1)", color: "#9B6BFF", fontWeight: 600 }}>{p.content_pillar}</span>}
                            </p>
                          </div>
                          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3, flexShrink: 0 }}>
                            <span style={{ fontSize: 11, color: "#6B7280", whiteSpace: "nowrap" }}>{p.scheduled_date}</span>
                            {formatTime(p.scheduled_time) && (
                              <span style={{ fontSize: 11, fontWeight: 800, color: "#DE1A1A", whiteSpace: "nowrap", background: "rgba(222,26,26,0.08)", padding: "2px 8px", borderRadius: 6 }}>🕐 {formatTime(p.scheduled_time)}</span>
                            )}
                          </div>
                          <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 8, background: priCfg.bg, color: priCfg.color, whiteSpace: "nowrap" }}>{priCfg.label}</span>
                          <select value={p.status} onChange={e => handleStatusChange(p.id, e.target.value)}
                            style={{ fontSize: 11, fontWeight: 700, padding: "4px 8px", borderRadius: 8, border: `1.5px solid ${cfg.color}`, background: cfg.bg, color: cfg.color, cursor: "pointer", outline: "none" }}>
                            {Object.entries(STATUS_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                          </select>
                          <button onClick={() => openEdit(p)} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }} title="Edit">
                            <Pencil size={14} color="#9B6BFF" />
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

          {/* Quick Actions */}
          <div style={{ background: "#FFFFFF", borderRadius: 18, padding: "16px 18px", border: "1px solid #E5E7EB" }}>
            <h3 style={{ fontSize: 13, fontWeight: 800, color: "#111827", margin: "0 0 12px" }}>Quick Actions</h3>
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)", gap: 10 }}>
              {[
                { icon: "✏️", label: "Create Post",   sub: "Design & plan", color: "#DE1A1A", bg: "rgba(222,26,26,0.07)",  action: () => { resetForm(); setSchedDates([selectedDate]); setModalMode("add") } },
                { icon: "☁️", label: "Upload Media",  sub: "Images/Videos", color: "#C41230", bg: "rgba(196,18,48,0.07)",  action: () => setView("list") },
                { icon: "📋", label: "View Posts",    sub: "All scheduled", color: "#8B0000", bg: "rgba(139,0,0,0.07)",    action: () => setView("list") },
                { icon: "💡", label: "Content Ideas", sub: "AI Suggestions",color: "#B71C1C", bg: "rgba(183,28,28,0.07)", action: () => {} },
              ].map(a => (
                <button key={a.label} onClick={a.action}
                  style={{ padding: "12px 10px", borderRadius: 14, background: a.bg, border: `1.5px solid ${a.color}22`, cursor: "pointer", textAlign: "left", display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 18, flexShrink: 0 }}>{a.icon}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 11, fontWeight: 800, color: a.color, margin: 0 }}>{a.label}</p>
                    <p style={{ fontSize: 10, color: "#9CA3AF", margin: "2px 0 0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.sub}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── RIGHT: Day Detail Panel (calendar view) ── */}
        {view === "calendar" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14, ...(isMobile ? {} : { position: "sticky", top: 24 }) }}>

            {/* Day header */}
            <div style={{ background: "#FFFFFF", borderRadius: 20, border: "1px solid #E5E7EB", overflow: "hidden" }}>
              <div style={{ background: "linear-gradient(135deg, #8B0000 0%, #C41230 55%, #DE1A1A 100%)", padding: "18px 20px", position: "relative", overflow: "hidden" }}>
                <div style={{ position: "absolute", top: -24, right: -24, width: 90, height: 90, borderRadius: "50%", background: "rgba(255,255,255,0.1)", pointerEvents: "none" }} />
                <p style={{ fontSize: 10, fontWeight: 800, color: "rgba(255,255,255,0.65)", margin: "0 0 2px", letterSpacing: "0.12em" }}>
                  {selectedDate === today ? "TODAY" : "SELECTED DATE"}
                </p>
                <h3 style={{ fontSize: 17, fontWeight: 900, color: "#FFFFFF", margin: "0 0 14px", lineHeight: 1.2 }}>
                  {new Date(selectedDate + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
                </h3>
                <button onClick={() => { resetForm(); setSchedDates([selectedDate]); setModalMode("add") }}
                  style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 14px", background: "rgba(255,255,255,0.18)", backdropFilter: "blur(6px)", color: "#FFF", borderRadius: 10, border: "1px solid rgba(255,255,255,0.3)", cursor: "pointer", fontSize: 12, fontWeight: 700 }}>
                  <Plus size={12} strokeWidth={3} /> Add Post
                </button>
              </div>

              {/* Posts for selected day */}
              {(() => {
                const ds        = selectedDate
                const dayPosts  = filteredPosts.filter(p => p.scheduled_date === ds)
                const dayShoots = contentMode === "shoot" ? shoots.filter(s => s.start_time.split("T")[0] === ds) : []
                const dayTasks  = contentMode === "post" ? tasks.filter(t => t.due_date === ds) : []
                const total     = dayPosts.length + dayShoots.length + dayTasks.length
                if (total === 0) return (
                  <div style={{ padding: "28px 20px", textAlign: "center" }}>
                    <div style={{ fontSize: 30, marginBottom: 8 }}>📭</div>
                    <p style={{ fontSize: 13, color: "#9CA3AF", margin: "0 0 4px", fontWeight: 600 }}>No content scheduled</p>
                    <p style={{ fontSize: 11, color: "#D1D5DB", margin: 0 }}>Click Add Post to schedule something</p>
                  </div>
                )
                return (
                  <div style={{ maxHeight: 340, overflowY: "auto" }}>
                    {dayShoots.map(s => (
                      <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 20px", borderBottom: "1px solid #F9FAFB" }}>
                        <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(155,107,255,0.12)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                          <Camera size={16} color="#9B6BFF" />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontSize: 13, fontWeight: 700, color: "#111827", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.title || s.client}</p>
                          <p style={{ fontSize: 11, color: "#9B6BFF", margin: "2px 0 0", fontWeight: 600 }}>📹 Video Shoot</p>
                        </div>
                      </div>
                    ))}
                    {dayTasks.map(t => (
                      <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 20px", borderBottom: "1px solid #F9FAFB" }}>
                        <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(255,165,58,0.12)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                          <Clock size={16} color="#FFA53A" />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontSize: 13, fontWeight: 700, color: "#111827", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title}</p>
                          <p style={{ fontSize: 11, color: "#D97706", margin: "2px 0 0", fontWeight: 600 }}>⏰ Task due</p>
                        </div>
                      </div>
                    ))}
                    {dayPosts.map(p => {
                      const shoot  = isShootPost(p)
                      const pColor = shoot ? "#9B6BFF" : platformColor(p.platform)
                      const cfg    = STATUS_CFG[p.status] ?? STATUS_CFG.pending
                      const time   = formatTime(p.scheduled_time)
                      return (
                        <div key={p.id} style={{ padding: "12px 20px", borderBottom: "1px solid #F3F4F6" }}>
                          {/* Top: icon + info + status */}
                          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                            <div style={{ width: 36, height: 36, borderRadius: 10, background: `${pColor}18`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, flexShrink: 0 }}>
                              {shoot ? <Camera size={16} color="#9B6BFF" /> : platformEmoji(p.platform)}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <p style={{ fontSize: 13, fontWeight: 700, color: "#111827", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.title}</p>
                              <p style={{ fontSize: 11, color: shoot ? "#9B6BFF" : "#9CA3AF", margin: "2px 0 0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontWeight: shoot ? 600 : 400 }}>
                                {shoot ? "📹 Video Shoot" : platformLabel(p.platform)}{p.client_name ? ` · ${p.client_name}` : ""}{time ? ` · ${time}` : ""}
                              </p>
                            </div>
                            <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 6, background: cfg.bg, color: cfg.color, whiteSpace: "nowrap", flexShrink: 0 }}>{cfg.label}</span>
                          </div>
                          {/* Action buttons row */}
                          <div style={{ display: "flex", gap: 8 }}>
                            <button onClick={() => openEdit(p)}
                              style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "7px 0", borderRadius: 9, border: "1.5px solid rgba(155,107,255,0.35)", background: "rgba(155,107,255,0.07)", color: "#9B6BFF", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                              <Pencil size={13} /> Edit
                            </button>
                            <button onClick={() => handleDelete(p.id)}
                              style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "7px 0", borderRadius: 9, border: "1.5px solid rgba(239,68,68,0.3)", background: "rgba(239,68,68,0.06)", color: "#EF4444", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                              <Trash2 size={13} /> Delete
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )
              })()}
            </div>

            {/* Upcoming posts */}
            <div style={{ background: "#FFFFFF", borderRadius: 18, border: "1px solid #E5E7EB", overflow: "hidden" }}>
              <div style={{ padding: "13px 18px", borderBottom: "1px solid #F3F4F6", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <h3 style={{ fontSize: 13, fontWeight: 800, color: "#111827", margin: 0 }}>Upcoming Posts</h3>
                <button onClick={() => setView("list")} style={{ fontSize: 11, fontWeight: 700, color: "#DE1A1A", background: "none", border: "none", cursor: "pointer" }}>View All →</button>
              </div>
              {upcomingPosts.length === 0 ? (
                <p style={{ fontSize: 12, color: "#9CA3AF", textAlign: "center", padding: "16px", margin: 0 }}>No upcoming posts</p>
              ) : (
                <div>
                  {upcomingPosts.slice(0, 5).map(p => {
                    const shoot  = isShootPost(p)
                    const pColor = shoot ? "#9B6BFF" : platformColor(p.platform)
                    return (
                      <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 18px", borderBottom: "1px solid #F9FAFB", cursor: "pointer" }} onClick={() => openEdit(p)}>
                        <div style={{ width: 30, height: 30, borderRadius: 8, background: `${pColor}18`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, flexShrink: 0 }}>
                          {shoot ? <Camera size={13} color="#9B6BFF" /> : platformEmoji(p.platform)}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontSize: 12, fontWeight: 700, color: "#111827", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.title}</p>
                          <p style={{ fontSize: 10, color: shoot ? "#9B6BFF" : "#9CA3AF", margin: "1px 0 0", fontWeight: shoot ? 600 : 400 }}>{shoot ? "📹 Shoot · " : ""}{p.scheduled_date === today ? "Today" : p.scheduled_date.slice(5)}</p>
                        </div>
                        <span style={{ width: 7, height: 7, borderRadius: "50%", background: pColor, flexShrink: 0 }} />
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Motivational card */}
            <div style={{ background: "linear-gradient(135deg, #1A0000 0%, #5B0000 50%, #8B0000 100%)", borderRadius: 20, padding: "18px 18px 18px", position: "relative", overflow: "hidden", border: "1px solid rgba(222,26,26,0.3)", boxShadow: "0 8px 32px rgba(90,0,0,0.4)" }}>
              <div style={{ position: "absolute", top: -30, right: -30, width: 110, height: 110, borderRadius: "50%", background: "radial-gradient(circle,rgba(255,75,75,0.3) 0%,transparent 70%)", pointerEvents: "none" }} />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brand/content-cal-boy-sidebar.png" alt=""
                style={{ position: "absolute", right: 0, bottom: 0, height: "80%", maxHeight: 110, width: "auto", objectFit: "contain", objectPosition: "right bottom", filter: "drop-shadow(0 4px 12px rgba(0,0,0,0.4))", pointerEvents: "none" }} />
              <div style={{ paddingRight: 90, position: "relative", zIndex: 1 }}>
                <div style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "rgba(222,26,26,0.85)", borderRadius: 20, padding: "3px 10px", marginBottom: 10 }}>
                  <span style={{ fontSize: 10, fontWeight: 800, color: "#FFF", letterSpacing: "0.05em" }}>🔥 PRO TIP</span>
                </div>
                <p style={{ fontSize: 13, fontWeight: 900, color: "#FFFFFF", margin: "0 0 5px", lineHeight: 1.4 }}>Consistent content = consistent growth!</p>
                <p style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", margin: 0 }}>Post daily across all platforms 🚀</p>
              </div>
            </div>
          </div>
        )}
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
                  { key: "shoot", emoji: "📹", label: "Video Shoot", sub: "Schedule a shoot session", color: "#9B6BFF", bg: "rgba(155,107,255,0.06)", border: "rgba(155,107,255,0.25)" },
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
                      {PLATFORMS.filter(p => p.id !== "other").map(p => (
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
                          style={{ padding: "5px 12px", borderRadius: 8, border: `1.5px solid ${contentPillar === cp ? "#9B6BFF" : "#E2E8F0"}`, background: contentPillar === cp ? "rgba(155,107,255,0.1)" : "#FAFAFA", color: contentPillar === cp ? "#9B6BFF" : "#718096", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
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

              {(isEdit ? contentType !== "shoot" : schedType !== "shoot") && (
                <div>
                  <label style={LABEL}>Post Time <span style={{ fontWeight: 400, color: "#9CA3AF", textTransform: "none" }}>(optional)</span></label>
                  <input type="time" value={schedTime} onChange={e => setSchedTime(e.target.value)} style={FIELD} />
                </div>
              )}

              {(isEdit ? contentType === "shoot" : schedType === "shoot") ? (
                <div>
                  <label style={LABEL}>Assign To <span style={{ fontWeight: 400, color: "#9CA3AF", textTransform: "none" }}>(select all crew members)</span></label>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 6 }}>
                    {members.map(m => {
                      const sel = shootTeam.includes(m.id)
                      return (
                        <button key={m.id} type="button"
                          onClick={() => setShootTeam(prev => sel ? prev.filter(id => id !== m.id) : [...prev, m.id])}
                          style={{ padding: "6px 14px", borderRadius: 20, border: `1.5px solid ${sel ? "#DE1A1A" : "#E2E8F0"}`, background: sel ? "rgba(222,26,26,0.08)" : "#FAFAFA", color: sel ? "#DE1A1A" : "#6B7280", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                          {sel ? "✓ " : ""}{m.name}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ) : (
                <div>
                  <label style={LABEL}>Assign To</label>
                  <select value={assignedTo} onChange={e => setAssignedTo(e.target.value)} style={{ ...FIELD, appearance: "none" }}>
                    <option value="">— Select —</option>
                    {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </div>
              )}

              <ClientSelector
                clientOptions={[...INTERNAL_BRANDS, ...clients.map(c => c.name).filter(n => !INTERNAL_BRANDS.includes(n))]}
                pastClientOptions={pastClients.map(c => c.name).filter(n => !INTERNAL_BRANDS.includes(n))}
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
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", background: "rgba(50,210,122,0.08)", borderRadius: 8 }}>
                  <CheckCircle2 size={14} color="#32D27A" />
                  <span style={{ fontSize: 12, color: "#32D27A", fontWeight: 600 }}>{isEdit ? "Updated!" : "Content scheduled!"}</span>
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
