"use client"

import { useState, useTransition, useMemo, useEffect } from "react"
import { useRouter } from "next/navigation"
import {
  ChevronLeft, ChevronRight, ChevronDown, Plus, X, Camera,
  Loader2, CheckCircle2, Clock,
  PlayCircle, Image, Film, Layers, Send, Trash2, Pencil,
} from "lucide-react"
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors,
  useDraggable, useDroppable,
  type DragStartEvent, type DragEndEvent,
} from "@dnd-kit/core"
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
  medium: { label: "Medium", color: "#FFA53A", bg: "rgba(255,165,58,0.1)" },
  high:   { label: "High",   color: "#EF4444", bg: "rgba(239,68,68,0.1)"  },
  urgent: { label: "Urgent", color: "#7C3AED", bg: "rgba(124,58,237,0.1)" },
}
const STATUS_CFG: Record<string, { label: string; color: string; bg: string }> = {
  pending:     { label: "Scheduled",   color: "#FFA53A", bg: "rgba(255,165,58,0.1)"  },
  in_progress: { label: "In Progress", color: "#4D8CFF", bg: "rgba(77,140,255,0.1)"  },
  ready:       { label: "Ready",       color: "#9B6BFF", bg: "rgba(155,107,255,0.1)"  },
  posted:      { label: "Posted ✓",    color: "#32D27A", bg: "rgba(50,210,122,0.1)"  },
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

// ── Content Pipeline (Kanban) ─────────────────────────────────────────────────
type PipelineCol = { key: string; label: string; color: string; emoji: string; headerBg: string }
const PIPELINE_COLS: PipelineCol[] = [
  { key: "pending",     label: "Ideas",   color: "#F59E0B", emoji: "💡", headerBg: "linear-gradient(135deg,#92400E 0%,#D97706 100%)" },
  { key: "ready",       label: "Ready",   color: "#2563EB", emoji: "📤", headerBg: "linear-gradient(135deg,#1E3A8A 0%,#3B82F6 100%)" },
  { key: "in_progress", label: "Editing", color: "#EA580C", emoji: "✂️", headerBg: "linear-gradient(135deg,#7C2D12 0%,#F97316 100%)" },
  { key: "posted",      label: "Posted",  color: "#16A34A", emoji: "✅", headerBg: "linear-gradient(135deg,#14532D 0%,#22C55E 100%)" },
]

function PipelineCard({ post, onClick }: { post: Post; onClick: () => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: post.id, data: { status: post.status } })
  const pColor = platformColor(post.platform)
  const time   = formatTime(post.scheduled_time)
  return (
    <div ref={setNodeRef} {...attributes} {...listeners} onClick={onClick}
      style={{
        transform: transform ? `translate3d(${transform.x}px,${transform.y}px,0)` : undefined,
        opacity: isDragging ? 0.35 : 1,
        background: "#FFFFFF", borderRadius: 14, padding: "12px 14px",
        border: `1px solid ${pColor}22`,
        boxShadow: `0 2px 10px rgba(0,0,0,0.06), 0 0 0 0 ${pColor}`,
        cursor: "grab", display: "flex", flexDirection: "column", gap: 8, touchAction: "none",
      }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
        <span style={{ width: 30, height: 30, borderRadius: 9, background: `${pColor}18`, border: `1px solid ${pColor}30`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, flexShrink: 0 }}>{platformEmoji(post.platform)}</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: "#111827", lineHeight: 1.4, flex: 1 }}>{post.title}</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: "#6B7280", padding: "2px 7px", borderRadius: 6, background: "#F3F4F6" }}>{post.client_name || "—"}</span>
        <span style={{ fontSize: 10, color: "#9CA3AF", whiteSpace: "nowrap" }}>{post.scheduled_date.slice(5)}{time ? ` · ${time}` : ""}</span>
      </div>
    </div>
  )
}

function PipelineColumn({ col, posts, isOver, onCardClick }: {
  col: PipelineCol; posts: Post[]; isOver: boolean; onCardClick: (p: Post) => void
}) {
  const { setNodeRef } = useDroppable({ id: col.key })
  return (
    <div ref={setNodeRef} style={{
      background: "#FFFFFF", borderRadius: 20, overflow: "hidden",
      border: `1px solid ${col.color}20`,
      boxShadow: isOver ? `0 6px 28px ${col.color}30` : `0 2px 12px ${col.color}12`,
      transition: "box-shadow 0.2s",
    }}>
      {/* Coloured header */}
      <div style={{ background: col.headerBg, padding: "14px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: -24, right: -24, width: 80, height: 80, borderRadius: "50%", background: "rgba(255,255,255,0.12)", pointerEvents: "none" }} />
        <div style={{ display: "flex", alignItems: "center", gap: 8, zIndex: 1 }}>
          <span style={{ width: 32, height: 32, borderRadius: 10, background: "rgba(255,255,255,0.22)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>{col.emoji}</span>
          <span style={{ fontSize: 13, fontWeight: 900, color: "#FFFFFF", textTransform: "uppercase", letterSpacing: "0.07em" }}>{col.label}</span>
        </div>
        <span style={{ width: 28, height: 28, borderRadius: "50%", background: "rgba(255,255,255,0.25)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 900, color: "#FFF", zIndex: 1 }}>{posts.length}</span>
      </div>
      {/* Drop zone */}
      <div style={{ minHeight: 150, padding: "12px", background: isOver ? `${col.color}05` : "transparent", transition: "background 0.15s" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {posts.map(p => <PipelineCard key={p.id} post={p} onClick={() => onCardClick(p)} />)}
          {posts.length === 0 && (
            <div style={{ minHeight: 110, display: "flex", alignItems: "center", justifyContent: "center", border: `1.5px dashed ${col.color}35`, borderRadius: 12, background: `${col.color}04` }}>
              <p style={{ fontSize: 12, color: `${col.color}70`, margin: 0, fontWeight: 600 }}>Drop here</p>
            </div>
          )}
        </div>
      </div>
    </div>
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
  const [view,  setView]      = useState<"pipeline" | "calendar" | "list">("calendar")
  const [calView, setCalView] = useState<"month" | "week">("month")
  const [weekOffset, setWeekOffset] = useState(0)
  const [isPending, start]    = useTransition()
  const [clientFilter, setClientFilter] = useState<string>("all")
  const [dragId,  setDragId]  = useState<string | null>(null)
  const [overCol, setOverCol] = useState<string | null>(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

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

  // ── Pipeline drag handlers ──
  function handleDragStart(e: DragStartEvent) { setDragId(String(e.active.id)) }
  function handleDragOver(e: { over: { id: string } | null }) { setOverCol(e.over?.id ?? null) }
  function handleDragEnd(e: DragEndEvent) {
    setDragId(null); setOverCol(null)
    const overId = e.over?.id as string | undefined
    const valid = ["pending", "ready", "in_progress", "posted"]
    if (overId && valid.includes(overId)) {
      const post = posts.find(p => p.id === e.active.id)
      if (post && post.status !== overId) handleStatusChange(String(e.active.id), overId)
    }
  }
  const dragPost = dragId ? posts.find(p => p.id === dragId) ?? null : null

  const today        = new Date().toISOString().split("T")[0]

  const weekDates = useMemo(() => {
    const base = new Date(today)
    const dow = base.getDay()
    const startMs = base.getTime() - dow * 86400000 + weekOffset * 7 * 86400000
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(startMs + i * 86400000)
      return d.toISOString().split("T")[0]
    })
  }, [today, weekOffset])

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

  // ── Pipeline-view derived data ──
  const todaySchedule = useMemo(() =>
    filteredPosts.filter(p => p.scheduled_date === today)
      .sort((a, b) => (a.scheduled_time ?? "99").localeCompare(b.scheduled_time ?? "99")),
    [filteredPosts, today]
  )

  const clientCards = useMemo(() => {
    const map = new Map<string, { name: string; count: number; next: string | null }>()
    for (const p of filteredPosts) {
      const name = p.client_name || "Internal"
      const e = map.get(name) ?? { name, count: 0, next: null }
      e.count++
      if (p.scheduled_date >= today && p.status !== "posted" && p.status !== "cancelled") {
        if (!e.next || p.scheduled_date < e.next) e.next = p.scheduled_date
      }
      map.set(name, e)
    }
    return [...map.values()].sort((a, b) => b.count - a.count)
  }, [filteredPosts, today])

  const teamWorkload = useMemo(() => {
    const rows = members.map(m => ({
      name: m.name,
      count: posts.filter(p => p.assigned_to === m.id && p.status !== "posted" && p.status !== "cancelled").length,
    }))
    const max = Math.max(1, ...rows.map(r => r.count))
    return rows.map(r => ({ ...r, pct: Math.round((r.count / max) * 100) })).sort((a, b) => b.count - a.count)
  }, [members, posts])

  const upcomingTable = useMemo(() =>
    [...filteredPosts]
      .filter(p => p.scheduled_date >= today && p.status !== "cancelled")
      .sort((a, b) => {
        if (a.scheduled_date !== b.scheduled_date) return a.scheduled_date.localeCompare(b.scheduled_date)
        return (a.scheduled_time ?? "").localeCompare(b.scheduled_time ?? "")
      })
      .slice(0, 10),
    [filteredPosts, today]
  )

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div style={{ background: "#F9FAFB", minHeight: "100vh", padding: 24 }}>

      {/* ── Hero Header — double-colour banner ── */}
      <div style={{
        background: "linear-gradient(105deg, #E8000A 0%, #C00008 28%, #7B0000 58%, #1A0000 100%)",
        borderRadius: 24, marginBottom: 24, position: "relative", overflow: "hidden",
        padding: "0 32px",
        boxShadow: "0 12px 48px rgba(139,0,0,0.55)",
        minHeight: 160,
        display: "flex", alignItems: "center",
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
          <h1 style={{ fontSize: 36, fontWeight: 900, color: "#FFFFFF", margin: "0 0 4px", lineHeight: 1.1, textShadow: "0 2px 12px rgba(0,0,0,0.3)" }}>
            Content Calendar
          </h1>
          <p style={{ color: "rgba(255,255,255,0.65)", fontSize: 13, margin: "0 0 20px", fontWeight: 500 }}>
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
                { v: "pipeline" as const, label: "⚡ Pipeline" },
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
        <div style={{ position: "relative", zIndex: 3, display: "flex", alignItems: "flex-end", gap: 16, padding: "0 32px" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/content-cal-hero-girl.png" alt=""
            style={{ height: 160, width: "auto", objectFit: "contain", objectPosition: "bottom", flexShrink: 0, filter: "drop-shadow(0 6px 20px rgba(0,0,0,0.4))" }} />
          <div style={{ background: "rgba(255,255,255,0.12)", backdropFilter: "blur(12px)", borderRadius: 16, padding: "14px 18px", border: "1px solid rgba(255,255,255,0.2)", minWidth: 200, marginBottom: 16 }}>
            <p style={{ fontSize: 15, fontWeight: 800, color: "#FFF", margin: "0 0 4px" }}>Plan your content! 📅</p>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.65)", margin: 0 }}>What are you scheduling today?</p>
          </div>
        </div>

        {/* ── RIGHT: Date card + Stats glass cards ── */}
        <div style={{ display: "flex", gap: 12, position: "relative", zIndex: 3, flexShrink: 0 }}>
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
            <p style={{ fontSize: 10, fontWeight: 800, color: "rgba(255,255,255,0.6)", margin: "0 0 2px", letterSpacing: "0.06em" }}>POSTED</p>
            <p style={{ fontSize: 38, fontWeight: 900, color: "#FFFFFF", margin: "0 0 2px", lineHeight: 1 }}>{postedCount}</p>
            <p style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", margin: 0, fontWeight: 600 }}>Done ✓</p>
          </div>
        </div>
      </div>

      {/* ── Stats Row ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 24 }}>
        {[
          { label: "Total Content", value: totalContent, sub: "All time",   icon: "📄", headerBg: "linear-gradient(135deg,#8B0000 0%,#C41230 100%)", accent: "#DE1A1A", shadow: "rgba(139,0,0,0.22)" },
          { label: "Ready To Post", value: readyCount,   sub: "Scheduled",  icon: "📤", headerBg: "linear-gradient(135deg,#1E3A8A 0%,#3B82F6 100%)", accent: "#3B82F6", shadow: "rgba(37,99,235,0.2)"  },
          { label: "In Progress",   value: inProgCount,  sub: "Creating",   icon: "⏳", headerBg: "linear-gradient(135deg,#92400E 0%,#F59E0B 100%)", accent: "#F59E0B", shadow: "rgba(146,64,14,0.2)"  },
          { label: "Posted",        value: postedCount,  sub: "Published",  icon: "✅", headerBg: "linear-gradient(135deg,#14532D 0%,#22C55E 100%)", accent: "#22C55E", shadow: "rgba(20,83,45,0.2)"   },
        ].map(s => (
          <div key={s.label} style={{
            background: "#FFFFFF", borderRadius: 22, overflow: "hidden",
            boxShadow: `0 4px 24px ${s.shadow}`,
            border: "1px solid rgba(0,0,0,0.06)",
            display: "flex", flexDirection: "column",
          }}>
            {/* Coloured header strip */}
            <div style={{ background: s.headerBg, padding: "20px 22px 16px", position: "relative", overflow: "hidden" }}>
              <div style={{ position: "absolute", top: -20, right: -20, width: 80, height: 80, borderRadius: "50%", background: "rgba(255,255,255,0.12)", pointerEvents: "none" }} />
              <span style={{ fontSize: 28, display: "block", marginBottom: 8 }}>{s.icon}</span>
              <p style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.85)", margin: 0 }}>{s.label}</p>
            </div>
            {/* White body */}
            <div style={{ padding: "18px 22px 10px" }}>
              <p style={{ fontSize: 44, fontWeight: 900, color: "#0F172A", margin: "0 0 4px", lineHeight: 1, letterSpacing: "-0.03em" }}>{s.value}</p>
              <p style={{ fontSize: 11, color: s.accent, fontWeight: 700, margin: 0, display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: s.accent, display: "inline-block", flexShrink: 0 }} />
                {s.sub}
              </p>
            </div>
            <div style={{ marginTop: "auto" }}>
              <Sparkline color={s.accent} />
            </div>
          </div>
        ))}
      </div>

      {/* ═══════════════ PIPELINE / OPERATIONS VIEW ═══════════════ */}
      {view === "pipeline" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

          {/* Content Pipeline (Kanban) */}
          <div style={{ background: "#FFFFFF", borderRadius: 20, border: "1px solid #E5E7EB", padding: "20px 22px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 800, color: "#111827", margin: 0 }}>Content Pipeline</h3>
                <p style={{ fontSize: 12, color: "#9CA3AF", margin: "2px 0 0" }}>Drag cards between stages to update status</p>
              </div>
            </div>
            <DndContext sensors={sensors} onDragStart={handleDragStart} onDragOver={handleDragOver as never} onDragEnd={handleDragEnd}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
                {PIPELINE_COLS.map(col => (
                  <PipelineColumn key={col.key} col={col} isOver={overCol === col.key}
                    posts={filteredPosts.filter(p => p.status === col.key)}
                    onCardClick={openEdit} />
                ))}
              </div>
              <DragOverlay>
                {dragPost ? (
                  <div style={{ background: "#FFFFFF", borderRadius: 12, padding: "10px 12px", border: "1px solid #EDEFF3", boxShadow: "0 8px 24px rgba(0,0,0,0.18)", display: "flex", alignItems: "center", gap: 7, cursor: "grabbing" }}>
                    <span style={{ width: 22, height: 22, borderRadius: 6, background: `${platformColor(dragPost.platform)}1A`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12 }}>{platformEmoji(dragPost.platform)}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "#1A202C" }}>{dragPost.title}</span>
                  </div>
                ) : null}
              </DragOverlay>
            </DndContext>
          </div>

          {/* Today's Schedule + Team Workload */}
          <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 20, alignItems: "start" }}>

            {/* Today's Posting Schedule */}
            <div style={{ background: "#FFFFFF", borderRadius: 20, border: "1px solid #E5E7EB", padding: "20px 22px" }}>
              <h3 style={{ fontSize: 16, fontWeight: 800, color: "#111827", margin: "0 0 16px" }}>Today&apos;s Posting Schedule</h3>
              {todaySchedule.length === 0 ? (
                <p style={{ fontSize: 13, color: "#9CA3AF", textAlign: "center", padding: "24px 0", margin: 0 }}>Nothing scheduled for today 🎉</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column" }}>
                  {todaySchedule.map((p, i) => {
                    const pColor = platformColor(p.platform)
                    const cfg = STATUS_CFG[p.status] ?? STATUS_CFG.pending
                    return (
                      <div key={p.id} onClick={() => openEdit(p)} style={{ display: "flex", gap: 14, cursor: "pointer" }}>
                        <div style={{ width: 64, flexShrink: 0, textAlign: "right", paddingTop: 2 }}>
                          <span style={{ fontSize: 12, fontWeight: 800, color: "#374151" }}>{formatTime(p.scheduled_time) ?? "—"}</span>
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
                          <span style={{ width: 12, height: 12, borderRadius: "50%", background: pColor, border: "2px solid #FFF", boxShadow: `0 0 0 2px ${pColor}40`, marginTop: 4 }} />
                          {i < todaySchedule.length - 1 && <span style={{ width: 2, flex: 1, background: "#EDEFF3", minHeight: 28 }} />}
                        </div>
                        <div style={{ flex: 1, minWidth: 0, paddingBottom: 18 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                            <span style={{ fontSize: 14 }}>{platformEmoji(p.platform)}</span>
                            <span style={{ fontSize: 13, fontWeight: 700, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.title}</span>
                            <span style={{ fontSize: 9, fontWeight: 800, padding: "2px 7px", borderRadius: 8, background: cfg.bg, color: cfg.color, flexShrink: 0 }}>{cfg.label}</span>
                          </div>
                          <p style={{ fontSize: 11, color: "#9CA3AF", margin: "2px 0 0" }}>{platformLabel(p.platform)} · {p.client_name || "—"}</p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Team Workload */}
            <div style={{ background: "#FFFFFF", borderRadius: 20, border: "1px solid #E5E7EB", padding: "20px 22px" }}>
              <h3 style={{ fontSize: 16, fontWeight: 800, color: "#111827", margin: "0 0 16px" }}>Team Workload</h3>
              {teamWorkload.length === 0 ? (
                <p style={{ fontSize: 13, color: "#9CA3AF", textAlign: "center", padding: "24px 0", margin: 0 }}>No team members</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  {teamWorkload.map(m => {
                    const barColor = m.pct >= 80 ? "#DE1A1A" : m.pct >= 50 ? "#FFA53A" : "#32D27A"
                    return (
                      <div key={m.name}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 5 }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: "#374151" }}>{m.name}</span>
                          <span style={{ fontSize: 11, fontWeight: 700, color: "#9CA3AF" }}>{m.count} active</span>
                        </div>
                        <div style={{ height: 8, borderRadius: 99, background: "#F0F1F5", overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${Math.max(m.count > 0 ? 8 : 0, m.pct)}%`, background: barColor, borderRadius: 99, transition: "width 0.3s" }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Clients */}
          <div style={{ background: "#FFFFFF", borderRadius: 20, border: "1px solid #E5E7EB", padding: "20px 22px" }}>
            <h3 style={{ fontSize: 16, fontWeight: 800, color: "#111827", margin: "0 0 16px" }}>Clients</h3>
            {clientCards.length === 0 ? (
              <p style={{ fontSize: 13, color: "#9CA3AF", textAlign: "center", padding: "24px 0", margin: 0 }}>No clients with content yet</p>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 14 }}>
                {clientCards.map(c => (
                  <div key={c.name} onClick={() => { setClientFilter(c.name); setView("list") }}
                    style={{ borderRadius: 16, padding: "16px 18px", border: "1px solid #EDEFF3", background: "linear-gradient(135deg, #FAFBFF, #F4F6FF)", cursor: "pointer", transition: "transform 0.15s, box-shadow 0.15s" }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = "translateY(-3px)"; (e.currentTarget as HTMLElement).style.boxShadow = "0 8px 20px rgba(0,0,0,0.08)" }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = "none"; (e.currentTarget as HTMLElement).style.boxShadow = "none" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                      <div style={{ width: 38, height: 38, borderRadius: 11, background: "linear-gradient(135deg, #9B6BFF, #4D8CFF)", display: "flex", alignItems: "center", justifyContent: "center", color: "#FFF", fontSize: 16, fontWeight: 900, flexShrink: 0 }}>
                        {c.name.charAt(0).toUpperCase()}
                      </div>
                      <span style={{ fontSize: 13, fontWeight: 800, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</span>
                    </div>
                    <p style={{ fontSize: 12, color: "#6B7280", margin: 0, fontWeight: 600 }}>{c.count} {c.count === 1 ? "post" : "posts"}</p>
                    <p style={{ fontSize: 11, color: c.next ? "#9B6BFF" : "#C0C4CC", margin: "3px 0 0", fontWeight: 700 }}>
                      {c.next ? `Next: ${c.next === today ? "Today" : c.next.slice(5)}` : "No upcoming"}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Upcoming Content table */}
          <div style={{ background: "#FFFFFF", borderRadius: 20, border: "1px solid #E5E7EB", overflow: "hidden" }}>
            <div style={{ padding: "18px 22px", borderBottom: "1px solid #F3F4F6", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <h3 style={{ fontSize: 16, fontWeight: 800, color: "#111827", margin: 0 }}>Upcoming Content</h3>
              <button onClick={() => setView("list")} style={{ fontSize: 11, fontWeight: 700, color: "#9B6BFF", background: "none", border: "none", cursor: "pointer" }}>View All</button>
            </div>
            {upcomingTable.length === 0 ? (
              <p style={{ fontSize: 13, color: "#9CA3AF", textAlign: "center", padding: "40px 0", margin: 0 }}>No upcoming content</p>
            ) : (
              <div>
                <div style={{ display: "grid", gridTemplateColumns: "110px 1fr 1.2fr 110px", gap: 12, padding: "10px 22px", borderBottom: "1px solid #F3F4F6", background: "#FAFBFF" }}>
                  {["Date", "Client", "Content", "Status"].map(h => (
                    <span key={h} style={{ fontSize: 10, fontWeight: 800, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.06em" }}>{h}</span>
                  ))}
                </div>
                {upcomingTable.map((p, i) => {
                  const cfg = STATUS_CFG[p.status] ?? STATUS_CFG.pending
                  return (
                    <div key={p.id} onClick={() => openEdit(p)} style={{ display: "grid", gridTemplateColumns: "110px 1fr 1.2fr 110px", gap: 12, padding: "12px 22px", borderTop: i > 0 ? "1px solid #F9FAFB" : "none", cursor: "pointer", alignItems: "center" }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: p.scheduled_date === today ? "#DE1A1A" : "#374151" }}>{p.scheduled_date === today ? "Today" : p.scheduled_date.slice(5)}</span>
                      <span style={{ fontSize: 12, color: "#6B7280", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.client_name || "—"}</span>
                      <span style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
                        <span style={{ fontSize: 14, flexShrink: 0 }}>{platformEmoji(p.platform)}</span>
                        <span style={{ fontSize: 12, fontWeight: 600, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.title}</span>
                      </span>
                      <span style={{ fontSize: 10, fontWeight: 800, padding: "3px 9px", borderRadius: 8, background: cfg.bg, color: cfg.color, justifySelf: "start", whiteSpace: "nowrap" }}>{cfg.label}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Calendar / List Layout ── */}
      {view !== "pipeline" && (
      <div style={{ display: "grid", gridTemplateColumns: view === "list" ? "1fr 360px" : "1fr", gap: 20, alignItems: "start" }}>

        {/* ── MAIN: Calendar + Quick Actions ── */}
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
                {/* Month / Week / List sub-tabs */}
                <div style={{ display: "flex", background: "#F3F4F6", borderRadius: 10, padding: 3, gap: 2 }}>
                  {[
                    { key: "month", label: "Month" },
                    { key: "week",  label: "Week"  },
                    { key: "list",  label: "List"  },
                  ].map(({ key, label }) => {
                    const isActive = key === "list" ? view === "list" : calView === key
                    return (
                      <button key={key}
                        onClick={() => key === "list" ? setView("list") : (setView("calendar"), setCalView(key as "month" | "week"))}
                        style={{
                          padding: "5px 14px", borderRadius: 7, border: "none", cursor: "pointer",
                          fontSize: 12, fontWeight: 700, transition: "all 0.15s",
                          background: isActive ? "linear-gradient(135deg, #FF4D4D, #DE1A1A)" : "transparent",
                          color: isActive ? "#FFFFFF" : "#6B7280",
                          boxShadow: isActive ? "0 2px 8px rgba(222,26,26,0.3)" : "none",
                        }}>
                        {label}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>

            {view === "calendar" ? (
              <>
                {calView === "week" ? (
                  /* ── Week View ── */
                  <>
                    {/* Week navigation */}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 20px", borderBottom: "1px solid #F3F4F6", background: "#FAFBFF" }}>
                      <button onClick={() => setWeekOffset(w => w - 1)} style={{ width: 30, height: 30, borderRadius: 8, border: "1px solid #E5E7EB", background: "#FFF", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <ChevronLeft size={13} color="#6B7280" />
                      </button>
                      <span style={{ fontSize: 13, fontWeight: 700, color: "#374151" }}>
                        {new Date(weekDates[0] + "T12:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" })} — {new Date(weekDates[6] + "T12:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                      </span>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button onClick={() => setWeekOffset(0)} style={{ padding: "5px 12px", fontSize: 11, fontWeight: 700, color: "#374151", background: "#F3F4F6", borderRadius: 7, border: "none", cursor: "pointer" }}>This Week</button>
                        <button onClick={() => setWeekOffset(w => w + 1)} style={{ width: 30, height: 30, borderRadius: 8, border: "1px solid #E5E7EB", background: "#FFF", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <ChevronRight size={13} color="#6B7280" />
                        </button>
                      </div>
                    </div>
                    {/* 7-column day grid */}
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", borderBottom: "1px solid #F3F4F6" }}>
                      {weekDates.map((ds, i) => {
                        const d = new Date(ds + "T12:00:00")
                        const isToday = ds === today
                        return (
                          <div key={ds} style={{ padding: "8px 4px", textAlign: "center", borderRight: i < 6 ? "1px solid #F3F4F6" : "none", background: isToday ? "rgba(222,26,26,0.03)" : "transparent" }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 4 }}>
                              {DAYS[d.getDay()]}
                            </div>
                            <div style={{ width: 28, height: 28, borderRadius: "50%", background: isToday ? "#DE1A1A" : "transparent", color: isToday ? "#FFF" : "#374151", fontSize: 13, fontWeight: isToday ? 900 : 500, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                              {d.getDate()}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", minHeight: 200 }}>
                      {weekDates.map((ds, i) => {
                        const dayPosts  = filteredPosts.filter(p => p.scheduled_date === ds)
                        const dayShoots = shoots.filter(s => s.start_time.split("T")[0] === ds)
                        const isToday   = ds === today
                        return (
                          <div key={ds} style={{ padding: "8px 6px", borderRight: i < 6 ? "1px solid #F3F4F6" : "none", background: isToday ? "rgba(222,26,26,0.025)" : "transparent", minHeight: 180 }}>
                            {dayShoots.map(s => (
                              <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 6px", borderRadius: 7, background: "rgba(155,107,255,0.1)", marginBottom: 4, border: "1px solid rgba(155,107,255,0.2)" }}>
                                <Camera size={9} color="#9B6BFF" />
                                <span style={{ fontSize: 10, fontWeight: 600, color: "#9B6BFF", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.title || s.client}</span>
                              </div>
                            ))}
                            {dayPosts.map(p => {
                              const pColor   = platformColor(p.platform)
                              const isPosted = p.status === "posted"
                              const time     = formatTime(p.scheduled_time)
                              return (
                                <div key={p.id} onClick={() => openEdit(p)} style={{
                                  padding: "5px 7px", borderRadius: 8, marginBottom: 5,
                                  background: isPosted ? "rgba(50,210,122,0.1)" : `${pColor}16`,
                                  border: `1px solid ${isPosted ? "rgba(50,210,122,0.25)" : pColor + "35"}`,
                                  cursor: "pointer",
                                }}>
                                  <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                                    <span style={{ width: 16, height: 16, borderRadius: 5, background: pColor, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, flexShrink: 0 }}>{platformEmoji(p.platform)}</span>
                                    <span style={{ fontSize: 10, fontWeight: 700, color: isPosted ? "#32D27A" : pColor, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.title}</span>
                                  </div>
                                  {time && <p style={{ fontSize: 9, color: "#9CA3AF", margin: "2px 0 0 21px" }}>{time}</p>}
                                </div>
                              )
                            })}
                            {dayPosts.length === 0 && dayShoots.length === 0 && (
                              <button onClick={() => openAdd(new Date(ds + "T12:00:00").getDate())} style={{ width: "100%", padding: "8px 0", borderRadius: 8, border: "1.5px dashed #E5E7EB", background: "transparent", cursor: "pointer", fontSize: 11, color: "#D1D5DB", marginTop: 4 }}>+</button>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </>
                ) : (
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
                      <div key={i} style={{ minHeight: 140, borderRight: i % 7 !== 6 ? "1px solid #F3F4F6" : "none", borderBottom: "1px solid #F3F4F6", background: "#FAFAFA" }} />
                    )
                    const ds = dateStr(day)
                    const dayPosts  = postsOnDay(day)
                    const dayShoots = shootsOnDay(day)
                    const dayTasks  = tasksOnDay(day)
                    const isToday   = ds === today
                    return (
                      <div key={i} style={{ minHeight: 140, padding: "10px 8px", borderRight: i % 7 !== 6 ? "1px solid #F3F4F6" : "none", borderBottom: "1px solid #F3F4F6", background: isToday ? "rgba(222,26,26,0.025)" : "transparent" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 5 }}>
                          <span style={{ fontSize: 13, fontWeight: isToday ? 900 : 500, width: 26, height: 26, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "50%", background: isToday ? "#DE1A1A" : "transparent", color: isToday ? "#FFF" : "#374151" }}>
                            {day}
                          </span>
                          <button onClick={() => openAdd(day)} style={{ width: 18, height: 18, borderRadius: 5, border: "1px solid #E5E7EB", background: "#FAFAFA", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", opacity: 0.5 }}>
                            <Plus size={10} color="#6B7280" />
                          </button>
                        </div>
                        {dayShoots.map(s => (
                          <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 4, padding: "3px 6px", borderRadius: 6, background: "rgba(155,107,255,0.1)", marginBottom: 3, border: "1px solid rgba(155,107,255,0.2)" }}>
                            <Camera size={9} color="#9B6BFF" />
                            <span style={{ fontSize: 10, fontWeight: 600, color: "#9B6BFF", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{s.title || s.client}</span>
                          </div>
                        ))}
                        {dayTasks.map(t => (
                          <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 4, padding: "3px 6px", borderRadius: 6, background: "rgba(255,165,58,0.1)", marginBottom: 3 }}>
                            <Clock size={9} color="#FFA53A" />
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
                              background: isPosted ? "rgba(50,210,122,0.1)" : `${pColor}16`,
                              border: `1px solid ${isPosted ? "rgba(50,210,122,0.25)" : pColor + "35"}`,
                              cursor: "pointer",
                            }}>
                              <span style={{ width: 16, height: 16, borderRadius: 5, background: pColor, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, flexShrink: 0, marginTop: 1 }}>
                                {platformEmoji(p.platform)}
                              </span>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <span style={{ fontSize: 10, fontWeight: 700, color: isPosted ? "#32D27A" : pColor, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }}>{p.title}</span>
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
                  <span style={{ fontSize: 11, color: "#9B6BFF", fontWeight: 600 }}>🎥 Shoot</span>
                  <span style={{ fontSize: 11, color: "#D97706", fontWeight: 600 }}>⏰ Task</span>
                  {PLATFORMS.slice(0, 4).map(p => (
                    <span key={p.id} style={{ fontSize: 11, fontWeight: 600, color: p.color }}>● {p.label}</span>
                  ))}
                </div>
                </>
                )}
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
                              {p.content_pillar && <span style={{ marginLeft: 6, padding: "1px 7px", borderRadius: 10, background: "rgba(155,107,255,0.1)", color: "#9B6BFF", fontWeight: 600 }}>{p.content_pillar}</span>}
                            </p>
                          </div>
                          <span style={{ fontSize: 11, color: "#6B7280", whiteSpace: "nowrap" }}>{p.scheduled_date}{formatTime(p.scheduled_time) ? ` · ${formatTime(p.scheduled_time)}` : ""}</span>
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

          {/* ── Quick Actions + calendar-only info strip ── */}
          <div style={{ display: "grid", gridTemplateColumns: view === "calendar" ? "1fr 320px" : "1fr", gap: 16 }}>

            {/* Quick Actions */}
            <div style={{ background: "#FFFFFF", borderRadius: 18, padding: "18px 20px", border: "1px solid #E5E7EB" }}>
              <h3 style={{ fontSize: 14, fontWeight: 800, color: "#111827", margin: "0 0 14px" }}>Quick Actions</h3>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
                {[
                  { icon: "✏️", label: "Create Post",    sub: "Design & plan",  color: "#DE1A1A", bg: "rgba(222,26,26,0.07)",  action: () => { resetForm(); setSchedDates([today]); setModalMode("add") } },
                  { icon: "☁️", label: "Upload Media",   sub: "Images/Videos",  color: "#C41230", bg: "rgba(196,18,48,0.07)",  action: () => setView("list") },
                  { icon: "📋", label: "View Posts",     sub: "All scheduled",  color: "#8B0000", bg: "rgba(139,0,0,0.07)",    action: () => setView("list") },
                  { icon: "💡", label: "Content Ideas",  sub: "AI Suggestions", color: "#B71C1C", bg: "rgba(183,28,28,0.07)", action: () => {} },
                ].map(a => (
                  <button key={a.label} onClick={a.action}
                    style={{ padding: "14px 10px", borderRadius: 14, background: a.bg, border: `1.5px solid ${a.color}22`, cursor: "pointer", textAlign: "left", display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 20, flexShrink: 0 }}>{a.icon}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 11, fontWeight: 800, color: a.color, margin: 0 }}>{a.label}</p>
                      <p style={{ fontSize: 10, color: "#9CA3AF", margin: "2px 0 0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.sub}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Calendar-only: upcoming posts mini-list */}
            {view === "calendar" && (
              <div style={{ background: "#FFFFFF", borderRadius: 18, padding: "18px 20px", border: "1px solid #E5E7EB" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                  <h3 style={{ fontSize: 14, fontWeight: 800, color: "#111827", margin: 0 }}>Upcoming Posts</h3>
                  <button onClick={() => setView("list")} style={{ fontSize: 11, fontWeight: 700, color: "#DE1A1A", background: "none", border: "none", cursor: "pointer" }}>View All →</button>
                </div>
                {upcomingPosts.length === 0 ? (
                  <p style={{ fontSize: 12, color: "#9CA3AF", textAlign: "center", padding: "12px 0", margin: 0 }}>No upcoming posts</p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {upcomingPosts.slice(0, 4).map(p => {
                      const pColor = platformColor(p.platform)
                      return (
                        <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }} onClick={() => openEdit(p)}>
                          <div style={{ width: 32, height: 32, borderRadius: 9, background: `${pColor}18`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, flexShrink: 0 }}>
                            {platformEmoji(p.platform)}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ fontSize: 12, fontWeight: 700, color: "#111827", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.title}</p>
                            <p style={{ fontSize: 10, color: "#9CA3AF", margin: "1px 0 0" }}>{p.scheduled_date === today ? "Today" : p.scheduled_date.slice(5)}</p>
                          </div>
                          <span style={{ width: 8, height: 8, borderRadius: "50%", background: pColor, flexShrink: 0 }} />
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── RIGHT: Sidebar (list view only) ── */}
        {view === "list" && <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

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
                { label: "Ready to Post", count: readyCount,   color: "#4D8CFF" },
                { label: "In Progress",   count: inProgCount,  color: "#FFA53A" },
                { label: "Posted",        count: postedCount,  color: "#32D27A" },
                { label: "Planned",       count: pendingCount, color: "#9B6BFF" },
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

          {/* Motivational card — boy with social media icons */}
          <div style={{ background: "linear-gradient(135deg, #1A0000 0%, #5B0000 50%, #8B0000 100%)", borderRadius: 20, padding: "22px 18px 0", position: "relative", overflow: "hidden", minHeight: 170, border: "1px solid rgba(222,26,26,0.3)", boxShadow: "0 8px 32px rgba(90,0,0,0.45)" }}>
            {/* Glow orbs */}
            <div style={{ position: "absolute", top: -30, right: -30, width: 120, height: 120, borderRadius: "50%", background: "radial-gradient(circle, rgba(255,75,75,0.3) 0%, transparent 70%)", pointerEvents: "none" }} />
            <div style={{ position: "absolute", bottom: -20, left: -20, width: 100, height: 100, borderRadius: "50%", background: "radial-gradient(circle, rgba(222,26,26,0.35) 0%, transparent 70%)", pointerEvents: "none" }} />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/content-cal-boy-sidebar.png" alt=""
              style={{ position: "absolute", right: -4, bottom: 0, height: 155, objectFit: "contain", objectPosition: "right bottom", filter: "drop-shadow(0 4px 12px rgba(0,0,0,0.4))" }} />
            <div style={{ paddingRight: 100, paddingBottom: 22, position: "relative", zIndex: 1 }}>
              <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(222,26,26,0.85)", borderRadius: 20, padding: "3px 10px", marginBottom: 10 }}>
                <span style={{ fontSize: 10, fontWeight: 800, color: "#FFF", letterSpacing: "0.05em" }}>🔥 PRO TIP</span>
              </div>
              <p style={{ fontSize: 13, fontWeight: 900, color: "#FFFFFF", margin: "0 0 6px", lineHeight: 1.4 }}>
                Consistent content = consistent growth!
              </p>
              <p style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", margin: 0, lineHeight: 1.5 }}>
                Post daily across all platforms 🚀
              </p>
            </div>
          </div>

        </div>}
      </div>
      )}

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
