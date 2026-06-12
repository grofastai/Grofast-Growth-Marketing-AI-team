"use client"

import { useState, useTransition, useMemo, useEffect } from "react"
import { useRouter } from "next/navigation"
import {
  ChevronLeft, ChevronRight, ChevronDown, Camera, Clock,
  CheckCircle2, Plus, X, Loader2, Send,
} from "lucide-react"
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors,
  useDraggable, useDroppable,
  type DragStartEvent, type DragEndEvent,
} from "@dnd-kit/core"
import { updateContentPostStatus, createContentPost } from "@/lib/actions/content-calendar"
import ClientSelector, { resolveClientName, OWN_BRANDS } from "@/components/ui/ClientSelector"

interface Post {
  id: string; title: string; platform: string; content_type: string
  client_name: string; scheduled_date: string; status: string
  assigned_to: string | null; drive_link: string | null
  content_pillar?: string | null; priority?: string | null
  scheduled_time?: string | null
  assignee?: { name: string } | null
}
interface Shoot  { id: string; title: string; start_time: string; client: string; status: string }
interface Task   { id: string; title: string; due_date: string; status: string }
interface Member { id: string; name: string }

interface Props {
  posts: Post[]; shoots: Shoot[]; tasks: Task[]
  members: Member[]
  clientNames: string[]
  userId: string; initialYear: number; initialMonth: number
}

const PLATFORMS = [
  { id: "instagram", label: "Instagram", color: "#E1306C", emoji: "📸" },
  { id: "youtube",   label: "YouTube",   color: "#FF0000", emoji: "▶️" },
  { id: "facebook",  label: "Facebook",  color: "#1877F2", emoji: "👥" },
  { id: "linkedin",  label: "LinkedIn",  color: "#0A66C2", emoji: "💼" },
  { id: "twitter",   label: "Twitter/X", color: "#000000", emoji: "𝕏" },
  { id: "whatsapp",  label: "WhatsApp",  color: "#25D366", emoji: "💬" },
  { id: "other",     label: "Other",     color: "#6B7280", emoji: "📱" },
]
const STATUS_CFG: Record<string, { label: string; color: string; bg: string }> = {
  pending:     { label: "Scheduled",   color: "#FFA53A", bg: "rgba(255,165,58,0.1)"  },
  in_progress: { label: "In Progress", color: "#4D8CFF", bg: "rgba(77,140,255,0.1)"  },
  ready:       { label: "Ready",       color: "#9B6BFF", bg: "rgba(155,107,255,0.1)"  },
  posted:      { label: "Posted ✓",    color: "#32D27A", bg: "rgba(50,210,122,0.1)"  },
  cancelled:   { label: "Cancelled",   color: "#EF4444", bg: "rgba(239,68,68,0.1)"   },
  missed:      { label: "Missed",      color: "#EF4444", bg: "rgba(239,68,68,0.08)"  },
}
const PRIORITY_CFG: Record<string, { label: string; color: string; bg: string }> = {
  low:    { label: "Low",    color: "#6B7280", bg: "rgba(107,114,128,0.1)" },
  medium: { label: "Medium", color: "#FFA53A", bg: "rgba(255,165,58,0.1)" },
  high:   { label: "High",   color: "#EF4444", bg: "rgba(239,68,68,0.1)"  },
  urgent: { label: "Urgent", color: "#7C3AED", bg: "rgba(124,58,237,0.1)" },
}
const CONTENT_PILLARS = ["Branding","Cinematic","Educational","Offer","Testimonial","Behind The Scenes","Trending","Festival","Engagement"]
const CONTENT_TYPES   = ["post", "reel", "video", "story", "carousel", "other"]
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"]
const DAYS   = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"]

function platformColor(p: string) { return PLATFORMS.find(x => x.id === p)?.color ?? "#6B7280" }
function platformLabel(p: string) { return PLATFORMS.find(x => x.id === p)?.label ?? p }
function platformEmoji(p: string) { return PLATFORMS.find(x => x.id === p)?.emoji ?? "📱" }

const F: React.CSSProperties = {
  width: "100%", padding: "10px 14px", borderRadius: 10,
  border: "1.5px solid #E2E8F0", fontSize: 13, background: "#FAFAFA",
  color: "#1A202C", outline: "none", fontFamily: "inherit", boxSizing: "border-box",
}
const L: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, color: "#4A5568",
  textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 5, display: "block",
}

function formatTime(t: string | null | undefined): string | null {
  if (!t) return null
  const [h, m] = t.split(":").map(Number)
  const period = h >= 12 ? "PM" : "AM"
  const hr = h % 12 || 12
  return `${hr}:${String(m).padStart(2, "0")} ${period}`
}

// ── Content Pipeline (Kanban) ─────────────────────────────────────────────────
const PIPELINE_COLS = [
  { key: "pending",     label: "Ideas",   color: "#9B6BFF", emoji: "💡" },
  { key: "ready",       label: "Ready",   color: "#4D8CFF", emoji: "📤" },
  { key: "in_progress", label: "Editing", color: "#FFA53A", emoji: "✂️" },
  { key: "posted",      label: "Posted",  color: "#32D27A", emoji: "✅" },
] as const

function PipelineCard({ post, onClick }: { post: Post; onClick: () => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: post.id, data: { status: post.status } })
  const pColor = platformColor(post.platform)
  const time   = formatTime(post.scheduled_time)
  return (
    <div ref={setNodeRef} {...attributes} {...listeners} onClick={onClick}
      style={{
        transform: transform ? `translate3d(${transform.x}px,${transform.y}px,0)` : undefined,
        opacity: isDragging ? 0.4 : 1,
        background: "#FFFFFF", borderRadius: 12, padding: "10px 12px",
        border: "1px solid #EDEFF3", boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
        cursor: "grab", display: "flex", flexDirection: "column", gap: 6, touchAction: "none",
      }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
        <span style={{ width: 22, height: 22, borderRadius: 6, background: `${pColor}1A`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, flexShrink: 0 }}>{platformEmoji(post.platform)}</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: "#1A202C", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{post.title}</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
        <span style={{ fontSize: 10, color: "#9CA3AF", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{post.client_name || "—"}</span>
        <span style={{ fontSize: 10, color: "#9CA3AF", whiteSpace: "nowrap", flexShrink: 0 }}>{post.scheduled_date.slice(5)}{time ? ` · ${time}` : ""}</span>
      </div>
    </div>
  )
}

function PipelineColumn({ col, posts, isOver, onCardClick }: {
  col: typeof PIPELINE_COLS[number]; posts: Post[]; isOver: boolean; onCardClick: (p: Post) => void
}) {
  const { setNodeRef } = useDroppable({ id: col.key })
  return (
    <div ref={setNodeRef} style={{
      background: isOver ? `${col.color}12` : "#F7F8FB",
      borderRadius: 16, padding: 12, minHeight: 140,
      border: isOver ? `1.5px dashed ${col.color}` : "1.5px solid transparent",
      display: "flex", flexDirection: "column", gap: 10, transition: "background 0.15s",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
        <span style={{ fontSize: 14 }}>{col.emoji}</span>
        <span style={{ fontSize: 12, fontWeight: 800, color: "#374151", textTransform: "uppercase", letterSpacing: "0.05em" }}>{col.label}</span>
        <span style={{ marginLeft: "auto", fontSize: 11, fontWeight: 800, color: col.color, background: `${col.color}1A`, borderRadius: 8, padding: "2px 8px" }}>{posts.length}</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {posts.map(p => <PipelineCard key={p.id} post={p} onClick={() => onCardClick(p)} />)}
        {posts.length === 0 && <p style={{ fontSize: 11, color: "#C0C4CC", textAlign: "center", padding: "14px 0", margin: 0 }}>Drop here</p>}
      </div>
    </div>
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

export default function MemberContentCalendarClient({ posts: initial, shoots, tasks, members, clientNames, userId, initialYear, initialMonth }: Props) {
  const router = useRouter()
  const [posts, setPosts] = useState(initial)
  useEffect(() => { setPosts(initial) }, [initial])
  const [year, setYear]   = useState(initialYear)
  const [month, setMonth] = useState(initialMonth)
  const [view, setView]   = useState<"pipeline" | "calendar" | "list">("pipeline")
  const [filter] = useState<"all" | "mine">("mine")
  const [selectedDay, setSelectedDay] = useState<string | null>(null)
  const [, start]           = useTransition()
  const [isPending, startCreate] = useTransition()
  const [dragId,  setDragId]  = useState<string | null>(null)
  const [overCol, setOverCol] = useState<string | null>(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  // Client filter
  const [clientFilter, setClientFilter] = useState("all")

  // Create form
  const [showAdd, setShowAdd]         = useState(false)
  const [schedType, setSchedType]     = useState<"" | "shoot" | "post">("")
  const [schedDate, setSchedDate]     = useState("")
  const [shootFrom, setShootFrom]     = useState("")
  const [shootTo,   setShootTo]       = useState("")
  const [shootLocation, setShootLocation] = useState("")
  const [title, setTitle]             = useState("")
  const [platform, setPlatform]       = useState("instagram")
  const [contentType, setContentType] = useState("post")
  const [clientName, setClientName]   = useState("")
  const [clientBrand, setClientBrand] = useState("")
  const [clientCustom, setClientCustom] = useState("")
  const [assignedTo, setAssignedTo]   = useState("")
  const [instructions, setInstructions] = useState("")
  const [contentPillar, setContentPillar] = useState("")
  const [priority, setPriority]       = useState("medium")
  const [formError, setFormError]     = useState("")
  const [formSuccess, setFormSuccess] = useState(false)

  // Post link modal
  const [postLinkModal, setPostLinkModal] = useState<{ postId: string; title: string } | null>(null)
  const [postLink, setPostLink]           = useState("")
  const [savingPostLink, setSavingPostLink] = useState(false)

  const firstDay  = new Date(year, month, 1).getDay()
  const daysCount = new Date(year, month + 1, 0).getDate()
  const cells     = Array.from({ length: firstDay + daysCount }, (_, i) => i < firstDay ? null : i - firstDay + 1)
  while (cells.length % 7 !== 0) cells.push(null)

  function prevMonth() { if (month === 0) { setYear(y => y - 1); setMonth(11) } else setMonth(m => m - 1) }
  function nextMonth() { if (month === 11) { setYear(y => y + 1); setMonth(0) } else setMonth(m => m + 1) }
  function dateStr(d: number) { return `${year}-${String(month + 1).padStart(2,"0")}-${String(d).padStart(2,"0")}` }

  const clientOptions = useMemo(() => {
    const fromPosts = posts.map(p => p.client_name).filter(Boolean) as string[]
    return [...new Set([...OWN_BRANDS, ...clientNames, ...fromPosts])].sort()
  }, [posts, clientNames])

  const filteredPosts = useMemo(() => {
    let p = filter === "mine" ? posts.filter(p => p.assigned_to === userId) : posts
    if (clientFilter !== "all") p = p.filter(p => p.client_name === clientFilter)
    return p
  }, [posts, filter, clientFilter, userId])

  function postsOnDay(d: number)  { const ds = dateStr(d); return filteredPosts.filter(p => p.scheduled_date === ds) }
  function shootsOnDay(d: number) { const ds = dateStr(d); return shoots.filter(s => s.start_time.split("T")[0] === ds) }
  function tasksOnDay(d: number)  { const ds = dateStr(d); return tasks.filter(t => t.due_date === ds) }

  function handleStatusChange(postId: string, status: string) {
    const post = posts.find(p => p.id === postId)
    if (!post) return
    if (status === "posted") { setPostLink(""); setPostLinkModal({ postId, title: post.title }); return }
    start(async () => {
      await updateContentPostStatus(postId, status as "posted")
      setPosts(prev => prev.map(p => p.id === postId ? { ...p, status } : p))
      router.refresh()
    })
  }

  async function confirmPosted() {
    if (!postLinkModal) return
    setSavingPostLink(true)
    await updateContentPostStatus(postLinkModal.postId, "posted")
    if (postLink.trim()) {
      const { updatePostLink } = await import("@/lib/actions/content-calendar")
      await updatePostLink(postLinkModal.postId, postLink.trim())
    }
    setPosts(prev => prev.map(p => p.id === postLinkModal.postId ? { ...p, status: "posted", drive_link: postLink.trim() || p.drive_link } : p))
    setSavingPostLink(false)
    setPostLinkModal(null)
    router.refresh()
  }

  function openAdd(date?: string) {
    setSchedDate(date ?? new Date().toISOString().split("T")[0])
    setTitle(""); setPlatform("instagram"); setContentType("post")
    setClientName(""); setAssignedTo(""); setInstructions("")
    setContentPillar(""); setPriority("medium")
    setFormError(""); setFormSuccess(false)
    setSchedType(""); setShootFrom(""); setShootTo(""); setShootLocation("")
    setClientName(""); setClientBrand(""); setClientCustom("")
    setShowAdd(true)
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) { setFormError("Title is required"); return }
    if (!schedDate)    { setFormError("Date is required");  return }
    setFormError("")
    startCreate(async () => {
      const shootMeta = schedType === "shoot" && (shootFrom || shootTo || shootLocation)
        ? `\nTime: ${shootFrom || "—"} → ${shootTo || "—"}${shootLocation ? `\nLocation: ${shootLocation}` : ""}`
        : ""
      const res = await createContentPost({
        title, platform, content_type: contentType,
        client_name: resolveClientName(clientName, clientBrand, clientCustom) || "Internal",
        scheduled_date: schedDate,
        assigned_to: assignedTo || userId,
        notes: (instructions + shootMeta).trim() || undefined,
        content_pillar: contentPillar || null,
        priority: priority || "medium",
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

  const today        = new Date().toISOString().split("T")[0]
  const myPosts      = posts.filter(p => p.assigned_to === userId)
  const totalContent = filteredPosts.length
  const readyCount   = filteredPosts.filter(p => p.status === "ready").length
  const inProgCount  = filteredPosts.filter(p => p.status === "in_progress").length
  const postedCount  = filteredPosts.filter(p => p.status === "posted").length
  const pendingCount = filteredPosts.filter(p => p.status === "pending").length

  const upcomingPosts = useMemo(() =>
    [...filteredPosts]
      .filter(p => p.scheduled_date >= today && p.status !== "posted" && p.status !== "cancelled")
      .sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date))
      .slice(0, 5),
    [filteredPosts, today]
  )

  const todaySchedule = useMemo(() =>
    filteredPosts.filter(p => p.scheduled_date === today)
      .sort((a, b) => (a.scheduled_time ?? "99").localeCompare(b.scheduled_time ?? "99")),
    [filteredPosts, today]
  )

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

  function openPipelineCard(post: Post) {
    if (post.status !== "posted") {
      setPostLink(""); setPostLinkModal({ postId: post.id, title: post.title })
    }
  }

  return (
    <div className="p-4 md:p-6 xl:p-8" style={{ background: "#F5F3FF", minHeight: "100vh" }}>

      {/* ── Hero Header ── */}
      <div style={{
        background: "linear-gradient(120deg, #FFFFFF 0%, #F5EEFF 45%, #EBE4FF 100%)",
        borderRadius: 28, marginBottom: 24, position: "relative", overflow: "hidden",
        padding: "32px 36px 0 36px",
        boxShadow: "0 8px 40px rgba(139,92,246,0.12)",
        minHeight: 240,
        border: "1px solid rgba(139,92,246,0.08)",
      }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", position: "relative", zIndex: 3, marginBottom: 20 }}>
          <div style={{ maxWidth: 440 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <div style={{ width: 44, height: 44, borderRadius: 14, background: "linear-gradient(135deg,#DE1A1A,#FF4B4B)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, boxShadow: "0 4px 14px rgba(222,26,26,0.35)" }}>📅</div>
              <h1 style={{ fontSize: 38, fontWeight: 900, color: "#0F172A", margin: 0, lineHeight: 1.1 }}>
                My Content
              </h1>
            </div>
            <p style={{ color: "#64748B", fontSize: 14, margin: "0 0 24px", fontWeight: 500, lineHeight: 1.6 }}>
              Your scheduled posts, reels &amp; shoots 🚀
            </p>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <button onClick={() => openAdd()}
                style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "11px 22px", background: "linear-gradient(135deg, #DE1A1A 0%, #FF4B4B 100%)", color: "#FFF", borderRadius: 14, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 800, boxShadow: "0 6px 20px rgba(222,26,26,0.35)", whiteSpace: "nowrap", letterSpacing: "0.01em" }}>
                <Plus size={15} strokeWidth={3} /> Add Content
              </button>
              <div style={{ display: "flex", background: "rgba(255,255,255,0.85)", borderRadius: 12, padding: 4, border: "1.5px solid rgba(139,92,246,0.15)", boxShadow: "0 2px 10px rgba(0,0,0,0.06)", gap: 2 }}>
                {([
                  { v: "pipeline" as const, label: "⚡ Pipeline" },
                  { v: "calendar" as const, label: "📅 Calendar" },
                  { v: "list"     as const, label: "☰ List"     },
                ]).map(({ v, label }) => (
                  <button key={v} onClick={() => setView(v)} style={{
                    padding: "7px 14px", borderRadius: 9, border: "none", cursor: "pointer",
                    fontSize: 12, fontWeight: 700, transition: "all 0.15s",
                    background: view === v
                      ? v === "pipeline" ? "linear-gradient(135deg,#DE1A1A,#FF4B4B)"
                      : v === "calendar" ? "linear-gradient(135deg,#7C3AED,#8B5CF6)"
                      : "#374151"
                      : "transparent",
                    color: view === v ? "#fff" : "#6B7280",
                    boxShadow: view === v ? "0 2px 8px rgba(0,0,0,0.2)" : "none",
                  }}>{label}</button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Hero girl character */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/content-cal-hero-girl.png" alt=""
          style={{ position: "absolute", right: 40, bottom: 0, height: 250, width: "auto", objectFit: "contain", objectPosition: "right bottom", zIndex: 1, pointerEvents: "none", filter: "drop-shadow(0 8px 24px rgba(139,92,246,0.2))" }} />

        <div style={{ position: "absolute", top: -40, right: 320, width: 180, height: 180, borderRadius: "50%", background: "radial-gradient(circle, rgba(139,92,246,0.08) 0%, transparent 70%)", pointerEvents: "none", zIndex: 0 }} />
        <div style={{ position: "absolute", bottom: -20, left: "40%", width: 120, height: 120, borderRadius: "50%", background: "radial-gradient(circle, rgba(222,26,26,0.06) 0%, transparent 70%)", pointerEvents: "none", zIndex: 0 }} />
      </div>

      {/* ── Stats ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 24 }}>
        {[
          { label: "Total Content",  value: totalContent, sub: "All time",  color: "#7C3AED", accent: "#8B5CF6", bg: "linear-gradient(135deg, #EDE9FE 0%, #C4B5FD 100%)", icon: "📄", shadow: "rgba(124,58,237,0.28)",  cardBg: "linear-gradient(160deg, #FFFFFF 0%, #F5F0FF 100%)" },
          { label: "Ready To Post",  value: readyCount,   sub: "Scheduled", color: "#2563EB", accent: "#3B82F6", bg: "linear-gradient(135deg, #DBEAFE 0%, #93C5FD 100%)", icon: "📤", shadow: "rgba(37,99,235,0.25)",   cardBg: "linear-gradient(160deg, #FFFFFF 0%, #EFF6FF 100%)" },
          { label: "In Progress",    value: inProgCount,  sub: "Creating",  color: "#D97706", accent: "#F59E0B", bg: "linear-gradient(135deg, #FEF3C7 0%, #FCD34D 100%)", icon: "⏳", shadow: "rgba(217,119,6,0.25)",   cardBg: "linear-gradient(160deg, #FFFFFF 0%, #FFFBEB 100%)" },
          { label: "Posted",         value: postedCount,  sub: "Published", color: "#16A34A", accent: "#22C55E", bg: "linear-gradient(135deg, #DCFCE7 0%, #86EFAC 100%)", icon: "✅", shadow: "rgba(22,163,74,0.25)",   cardBg: "linear-gradient(160deg, #FFFFFF 0%, #F0FDF4 100%)" },
        ].map(s => (
          <div key={s.label} style={{
            background: s.cardBg, borderRadius: 24, overflow: "hidden",
            border: `1px solid ${s.color}18`, boxShadow: `0 4px 24px ${s.shadow}, 0 1px 4px rgba(0,0,0,0.04)`,
            display: "flex", flexDirection: "column",
          }}>
            <div style={{ padding: "22px 24px 14px" }}>
              <div style={{ width: 54, height: 54, borderRadius: 18, background: s.bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, marginBottom: 14, boxShadow: `0 6px 16px ${s.shadow}` }}>
                {s.icon}
              </div>
              <p style={{ fontSize: 40, fontWeight: 900, color: "#0F172A", margin: "0 0 3px", lineHeight: 1, letterSpacing: "-0.02em" }}>{s.value}</p>
              <p style={{ fontSize: 13, fontWeight: 800, color: "#1E293B", margin: "0 0 3px" }}>{s.label}</p>
              <p style={{ fontSize: 11, color: s.color, fontWeight: 600, margin: 0, display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: s.accent, display: "inline-block" }} />
                {s.sub}
              </p>
            </div>
            <div style={{ marginTop: "auto" }}>
              <svg viewBox="0 0 120 40" preserveAspectRatio="none" style={{ width: "100%", height: 44, display: "block" }}>
                <defs>
                  <linearGradient id={`msg-${s.accent.replace("#","")}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={s.accent} stopOpacity="0.18" />
                    <stop offset="100%" stopColor={s.accent} stopOpacity="0" />
                  </linearGradient>
                </defs>
                <polygon points="0,40 0,34 14,28 28,31 44,20 56,24 72,13 86,18 104,7 120,9 120,40" fill={`url(#msg-${s.accent.replace("#","")})`} />
                <polyline points="0,34 14,28 28,31 44,20 56,24 72,13 86,18 104,7 120,9" fill="none" stroke={s.accent} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                {[[14,28],[28,31],[44,20],[56,24],[72,13],[86,18],[104,7],[120,9]].map(([cx,cy],di) => (
                  <circle key={di} cx={cx} cy={cy} r="2.6" fill="#FFFFFF" stroke={s.accent} strokeWidth="1.6" />
                ))}
              </svg>
            </div>
          </div>
        ))}
      </div>

      {/* ═══════════════ PIPELINE VIEW ═══════════════ */}
      {view === "pipeline" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

          {/* My Content Pipeline (Kanban) */}
          <div style={{ background: "#FFFFFF", borderRadius: 20, border: "1px solid #E5E7EB", padding: "20px 22px" }}>
            <div style={{ marginBottom: 16 }}>
              <h3 style={{ fontSize: 16, fontWeight: 800, color: "#111827", margin: 0 }}>My Content Pipeline</h3>
              <p style={{ fontSize: 12, color: "#9CA3AF", margin: "2px 0 0" }}>Drag cards to update status · click to mark as posted</p>
            </div>
            <DndContext sensors={sensors} onDragStart={handleDragStart} onDragOver={handleDragOver as never} onDragEnd={handleDragEnd}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
                {PIPELINE_COLS.map(col => (
                  <PipelineColumn key={col.key} col={col} isOver={overCol === col.key}
                    posts={filteredPosts.filter(p => p.status === col.key)}
                    onCardClick={openPipelineCard} />
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

          {/* Today's Schedule + Upcoming */}
          <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 20, alignItems: "start" }}>

            {/* Today's Schedule */}
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
                      <div key={p.id} onClick={() => openPipelineCard(p)} style={{ display: "flex", gap: 14, cursor: "pointer" }}>
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

            {/* Sidebar: Upcoming + Donut */}
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ background: "#FFFFFF", borderRadius: 20, border: "1px solid #E5E7EB", padding: "20px 22px" }}>
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
                        <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }} onClick={() => openPipelineCard(p)}>
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

              <div style={{ background: "#FFFFFF", borderRadius: 18, border: "1px solid #E5E7EB", padding: "18px 20px" }}>
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
            </div>
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
                    <div key={p.id} onClick={() => openPipelineCard(p)} style={{ display: "grid", gridTemplateColumns: "110px 1fr 1.2fr 110px", gap: 12, padding: "12px 22px", borderTop: i > 0 ? "1px solid #F9FAFB" : "none", cursor: "pointer", alignItems: "center" }}>
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

      {/* ── Two-Column Layout ── */}
      {view !== "pipeline" && (
      <div style={{ display: "grid", gridTemplateColumns: "1fr 308px", gap: 20, alignItems: "start" }}>

        {/* ── LEFT: Calendar + Quick Actions ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

        {/* ── Calendar / List ── */}
        <div style={{ background: "#FFFFFF", borderRadius: 20, border: "1px solid #E5E7EB", overflow: "hidden" }}>

          {/* Calendar toolbar */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid #F3F4F6", flexWrap: "wrap", gap: 10 }}>
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
            <h2 style={{ fontSize: 17, fontWeight: 800, color: "#111827", margin: 0 }}>{MONTHS[month]} {year}</h2>
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
            </div>
          </div>

          {view === "calendar" ? (
          <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", borderBottom: "1px solid #F3F4F6" }}>
            {DAYS.map(d => (
              <div key={d} style={{ padding: "10px 0", textAlign: "center", fontSize: 11, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.07em" }}>{d}</div>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}>
            {cells.map((day, i) => {
              if (!day) return <div key={i} style={{ minHeight: 90, borderRight: i % 7 !== 6 ? "1px solid #F9FAFB" : "none", borderBottom: "1px solid #F9FAFB" }} />
              const ds        = dateStr(day)
              const dayPosts  = postsOnDay(day)
              const dayShoots = shootsOnDay(day)
              const dayTasks  = tasksOnDay(day)
              const isToday   = ds === today
              const isSelected = ds === selectedDay
              return (
                <div key={i} onClick={() => setSelectedDay(ds === selectedDay ? null : ds)} style={{ minHeight: 90, padding: "7px 5px", borderRight: i % 7 !== 6 ? "1px solid #F3F4F6" : "none", borderBottom: "1px solid #F3F4F6", background: isSelected ? "rgba(222,26,26,0.06)" : isToday ? "rgba(222,26,26,0.03)" : "transparent", cursor: "pointer", transition: "background 0.15s", outline: isSelected ? "2px solid rgba(222,26,26,0.3)" : "none", outlineOffset: -2 }}>
                  <span style={{ fontSize: 13, fontWeight: isToday ? 900 : 500, width: 24, height: 24, display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: "50%", background: isToday ? "#DE1A1A" : "transparent", color: isToday ? "#FFFFFF" : "#374151", marginBottom: 4 }}>{day}</span>
                  {dayShoots.map(s => (
                    <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 3, padding: "2px 5px", borderRadius: 4, background: "rgba(77,140,255,0.1)", marginBottom: 2 }}>
                      <Camera size={8} color="#4D8CFF" />
                      <span style={{ fontSize: 9, fontWeight: 600, color: "#4D8CFF", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.title || s.client}</span>
                    </div>
                  ))}
                  {dayTasks.map(t => (
                    <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 3, padding: "2px 5px", borderRadius: 4, background: "rgba(255,165,58,0.1)", marginBottom: 2 }}>
                      <Clock size={8} color="#FFA53A" />
                      <span style={{ fontSize: 9, fontWeight: 600, color: "#FFA53A", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title}</span>
                    </div>
                  ))}
                  {dayPosts.map(p => {
                    const isMine = p.assigned_to === userId
                    const cfg = STATUS_CFG[p.status] ?? STATUS_CFG.pending
                    return (
                      <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 3, padding: "2px 5px", borderRadius: 4, marginBottom: 2, background: `${platformColor(p.platform)}18`, border: isMine ? `1px solid ${platformColor(p.platform)}40` : "none" }}>
                        <span style={{ width: 5, height: 5, borderRadius: "50%", background: cfg.color, flexShrink: 0 }} />
                        <span style={{ fontSize: 9, fontWeight: 600, color: platformColor(p.platform), overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.title}</span>
                        {isMine && <span style={{ fontSize: 7, fontWeight: 800, color: platformColor(p.platform), marginLeft: "auto", flexShrink: 0 }}>YOU</span>}
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
          <div style={{ padding: "12px 24px", borderTop: "1px solid #F3F4F6", display: "flex", gap: 16, flexWrap: "wrap" }}>
            <span style={{ fontSize: 11, color: "#6B7280", fontWeight: 600 }}>Legend:</span>
            <span style={{ fontSize: 11, color: "#4D8CFF", fontWeight: 600 }}>📷 Shoot</span>
            <span style={{ fontSize: 11, color: "#FFA53A", fontWeight: 600 }}>⏰ My Task</span>
            {PLATFORMS.slice(0, 4).map(p => (
              <span key={p.id} style={{ fontSize: 11, fontWeight: 600, color: p.color }}>● {p.label}</span>
            ))}
          </div>

          {/* ── Day Detail Panel ── */}
          {selectedDay && (() => {
            const selDate = new Date(selectedDay + "T00:00:00")
            const label = selDate.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
            const dayNum = selDate.getDate()
            const dp = postsOnDay(dayNum)
            const ds2 = shootsOnDay(dayNum)
            const dt = tasksOnDay(dayNum)
            const total = dp.length + ds2.length + dt.length
            return (
              <div style={{ margin: "0 0 0 0", borderTop: "2px solid rgba(222,26,26,0.15)", background: "#FAFBFF" }}>
                {/* Header */}
                <div style={{ padding: "14px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", background: "linear-gradient(135deg, rgba(222,26,26,0.07), rgba(222,26,26,0.02))" }}>
                  <div>
                    <p style={{ margin: 0, fontSize: 15, fontWeight: 800, color: "#111827" }}>{label}</p>
                    <p style={{ margin: 0, fontSize: 11, color: "#9CA3AF", marginTop: 2 }}>{total} item{total !== 1 ? "s" : ""} scheduled</p>
                  </div>
                  <button onClick={() => setSelectedDay(null)} style={{ width: 28, height: 28, borderRadius: 8, border: "1px solid #E5E7EB", background: "#FFF", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <X size={13} color="#6B7280" />
                  </button>
                </div>

                {total === 0 && (
                  <p style={{ padding: "24px 20px", fontSize: 13, color: "#9CA3AF", textAlign: "center", margin: 0 }}>Nothing scheduled on this day.</p>
                )}

                {/* Shoots */}
                {ds2.length > 0 && (
                  <div style={{ padding: "12px 20px", borderBottom: "1px solid #F3F4F6" }}>
                    <p style={{ margin: "0 0 8px", fontSize: 10, fontWeight: 800, color: "#4D8CFF", textTransform: "uppercase", letterSpacing: "0.1em" }}>📷 Video Shoots</p>
                    {ds2.map(s => (
                      <div key={s.id} style={{ padding: "10px 12px", borderRadius: 10, background: "rgba(77,140,255,0.06)", border: "1px solid rgba(77,140,255,0.15)", marginBottom: 6 }}>
                        <p style={{ margin: "0 0 4px", fontSize: 13, fontWeight: 700, color: "#1E40AF" }}>{s.title || s.client}</p>
                        <p style={{ margin: 0, fontSize: 11, color: "#4D8CFF" }}>Client: {s.client} · Status: {s.status}</p>
                      </div>
                    ))}
                  </div>
                )}

                {/* Tasks */}
                {dt.length > 0 && (
                  <div style={{ padding: "12px 20px", borderBottom: "1px solid #F3F4F6" }}>
                    <p style={{ margin: "0 0 8px", fontSize: 10, fontWeight: 800, color: "#FFA53A", textTransform: "uppercase", letterSpacing: "0.1em" }}>⏰ Tasks Due</p>
                    {dt.map(t => (
                      <div key={t.id} style={{ padding: "10px 12px", borderRadius: 10, background: "rgba(255,165,58,0.06)", border: "1px solid rgba(255,165,58,0.2)", marginBottom: 6 }}>
                        <p style={{ margin: "0 0 4px", fontSize: 13, fontWeight: 700, color: "#92400E" }}>{t.title}</p>
                        <p style={{ margin: 0, fontSize: 11, color: "#D97706" }}>Status: {t.status}</p>
                      </div>
                    ))}
                  </div>
                )}

                {/* Content Posts */}
                {dp.length > 0 && (
                  <div style={{ padding: "12px 20px" }}>
                    <p style={{ margin: "0 0 8px", fontSize: 10, fontWeight: 800, color: "#374151", textTransform: "uppercase", letterSpacing: "0.1em" }}>📱 Content Posts</p>
                    {dp.map(p => {
                      const cfg = STATUS_CFG[p.status] ?? STATUS_CFG.pending
                      const priCfg = PRIORITY_CFG[p.priority ?? "medium"] ?? PRIORITY_CFG.medium
                      const isMine = p.assigned_to === userId
                      const pColor = platformColor(p.platform)
                      const isPosted = p.status === "posted"
                      return (
                        <div key={p.id} style={{ padding: "12px 14px", borderRadius: 12, background: "#FFF", border: `1.5px solid ${isPosted ? "#32D27A40" : pColor + "30"}`, marginBottom: 8, boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
                          {/* Top row — platform + title + status badge */}
                          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <span style={{ fontSize: 20 }}>{platformEmoji(p.platform)}</span>
                              <div>
                                <p style={{ margin: 0, fontSize: 13, fontWeight: 800, color: "#111827" }}>{p.title}</p>
                                <p style={{ margin: 0, fontSize: 11, color: pColor, fontWeight: 600 }}>{platformLabel(p.platform)}</p>
                              </div>
                            </div>
                            <span style={{ fontSize: 10, fontWeight: 700, padding: "4px 8px", borderRadius: 8, background: cfg.bg, color: cfg.color, flexShrink: 0, whiteSpace: "nowrap" }}>{cfg.label}</span>
                          </div>
                          {/* Meta tags */}
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, fontSize: 11, marginBottom: isMine ? 10 : 0 }}>
                            <span style={{ padding: "2px 8px", borderRadius: 6, background: "#F3F4F6", color: "#374151", fontWeight: 600 }}>👤 {p.assignee?.name ?? "Unassigned"}</span>
                            <span style={{ padding: "2px 8px", borderRadius: 6, background: "#F3F4F6", color: "#374151", fontWeight: 600 }}>🏢 {p.client_name || "—"}</span>
                            <span style={{ padding: "2px 8px", borderRadius: 6, background: "#F3F4F6", color: "#374151", fontWeight: 600 }}>📂 {p.content_type || "—"}</span>
                            <span style={{ padding: "2px 8px", borderRadius: 6, background: priCfg.bg, color: priCfg.color, fontWeight: 700 }}>{priCfg.label}</span>
                            {p.content_pillar && <span style={{ padding: "2px 8px", borderRadius: 6, background: "rgba(155,107,255,0.1)", color: "#9B6BFF", fontWeight: 700 }}>{p.content_pillar}</span>}
                          </div>
                          {/* Done / Not Done buttons */}
                          {(
                            <div style={{ display: "flex", gap: 8 }}>
                              {!isPosted ? (
                                <button
                                  onClick={() => handleStatusChange(p.id, "posted")}
                                  style={{ flex: 1, padding: "9px 0", borderRadius: 10, border: "none", background: "linear-gradient(135deg,#32D27A,#22B36A)", color: "#FFF", fontSize: 12, fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                                  <CheckCircle2 size={14} /> Done — Mark as Posted
                                </button>
                              ) : (
                                <>
                                  <div style={{ flex: 1, padding: "9px 0", borderRadius: 10, background: "rgba(50,210,122,0.1)", border: "1.5px solid rgba(50,210,122,0.3)", color: "#32D27A", fontSize: 12, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                                    <CheckCircle2 size={14} /> Posted ✓
                                  </div>
                                  <button
                                    onClick={() => handleStatusChange(p.id, "pending")}
                                    style={{ padding: "9px 14px", borderRadius: 10, border: "1.5px solid #E5E7EB", background: "#F9FAFB", color: "#6B7280", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                                    Undo
                                  </button>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })()}
          </>
      ) : (
        <div>
          <div style={{ padding: "18px 24px", borderBottom: "1px solid #F3F4F6" }}>
            <h2 style={{ fontSize: 16, fontWeight: 800, color: "#111827", margin: 0 }}>
              My Content — {MONTHS[month]} {year}
            </h2>
          </div>
          {filteredPosts.length === 0 ? (
            <div style={{ padding: "60px 24px", textAlign: "center" }}>
              <p style={{ fontSize: 32, margin: "0 0 12px" }}>📭</p>
              <p style={{ fontSize: 14, fontWeight: 700, color: "#111827", margin: "0 0 6px" }}>No content scheduled</p>
              <p style={{ fontSize: 12, color: "#9CA3AF", margin: 0 }}>No content assigned to you this month.</p>
            </div>
          ) : (
            <div>
              {filteredPosts.map((p, i) => {
                const cfg    = STATUS_CFG[p.status] ?? STATUS_CFG.pending
                const priCfg = PRIORITY_CFG[p.priority ?? "medium"] ?? PRIORITY_CFG.medium
                const isMine = p.assigned_to === userId
                return (
                  <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 24px", borderBottom: i < filteredPosts.length - 1 ? "1px solid #F9FAFB" : "none", background: isMine ? "rgba(222,26,26,0.02)" : "transparent", flexWrap: "wrap" }}>
                    <div style={{ width: 40, height: 40, borderRadius: 12, background: `${platformColor(p.platform)}15`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 20 }}>
                      {platformEmoji(p.platform)}
                    </div>
                    <div style={{ flex: 1, minWidth: 100 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                        <p style={{ fontSize: 13, fontWeight: 700, color: "#111827", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.title}</p>
                        {isMine && <span style={{ fontSize: 9, fontWeight: 800, padding: "1px 6px", borderRadius: 99, background: "rgba(222,26,26,0.1)", color: "#DE1A1A", flexShrink: 0 }}>MINE</span>}
                      </div>
                      <p style={{ fontSize: 11, color: "#6B7280", margin: 0 }}>
                        {platformLabel(p.platform)} · {p.client_name}
                        {p.content_pillar && <span style={{ marginLeft: 6, padding: "1px 6px", borderRadius: 8, background: "rgba(155,107,255,0.1)", color: "#9B6BFF", fontWeight: 700, fontSize: 10 }}>{p.content_pillar}</span>}
                      </p>
                    </div>
                    <span style={{ fontSize: 11, color: "#6B7280", whiteSpace: "nowrap", flexShrink: 0 }}>{p.scheduled_date}</span>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 8, background: priCfg.bg, color: priCfg.color, whiteSpace: "nowrap", flexShrink: 0 }}>{priCfg.label}</span>
                    {p.status === "posted" ? (
                      <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
                        <span style={{ fontSize: 11, fontWeight: 800, padding: "5px 10px", borderRadius: 8, background: "rgba(50,210,122,0.1)", color: "#32D27A", display: "flex", alignItems: "center", gap: 4 }}>
                          <CheckCircle2 size={12} /> Posted ✓
                        </span>
                        <button onClick={() => handleStatusChange(p.id, "pending")}
                          style={{ fontSize: 10, fontWeight: 700, padding: "5px 8px", borderRadius: 8, border: "1.5px solid #E5E7EB", background: "#F9FAFB", color: "#6B7280", cursor: "pointer" }}>
                          Undo
                        </button>
                      </div>
                    ) : (
                      <button onClick={() => handleStatusChange(p.id, "posted")}
                        style={{ fontSize: 11, fontWeight: 800, padding: "7px 14px", borderRadius: 10, border: "none", background: "linear-gradient(135deg,#32D27A,#22B36A)", color: "#FFF", cursor: "pointer", display: "flex", alignItems: "center", gap: 5, flexShrink: 0 }}>
                        <CheckCircle2 size={13} /> Mark as Posted
                      </button>
                    )}
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
                { icon: "✏️", label: "Create Post",   sub: "Design & plan",   color: "#DE1A1A", bg: "rgba(222,26,26,0.07)",   action: () => openAdd() },
                { icon: "☁️", label: "Upload Media",  sub: "Images / Videos", color: "#4D8CFF", bg: "rgba(77,140,255,0.07)",  action: () => setView("list") },
                { icon: "📋", label: "View Posts",    sub: "All scheduled",   color: "#9B6BFF", bg: "rgba(155,107,255,0.07)",  action: () => setView("list") },
                { icon: "✅", label: "Mark Posted",   sub: "Update status",   color: "#32D27A", bg: "rgba(50,210,122,0.07)",  action: () => setView("list") },
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
                  return (
                    <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ width: 36, height: 36, borderRadius: 10, background: `${pColor}18`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, flexShrink: 0 }}>
                        {platformEmoji(p.platform)}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 12, fontWeight: 700, color: "#111827", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.title}</p>
                        <p style={{ fontSize: 10, color: "#9CA3AF", margin: "2px 0 0", whiteSpace: "nowrap" }}>{p.scheduled_date}</p>
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

          {/* Motivational card */}
          <div style={{ background: "linear-gradient(135deg, #1A0533 0%, #2D0A5B 50%, #3D1A78 100%)", borderRadius: 20, padding: "22px 18px 0", position: "relative", overflow: "hidden", minHeight: 170, border: "1px solid rgba(155,107,255,0.3)", boxShadow: "0 8px 32px rgba(45,10,91,0.35)" }}>
            <div style={{ position: "absolute", top: -30, right: -30, width: 120, height: 120, borderRadius: "50%", background: "radial-gradient(circle, rgba(155,107,255,0.3) 0%, transparent 70%)", pointerEvents: "none" }} />
            <div style={{ position: "absolute", bottom: -20, left: -20, width: 100, height: 100, borderRadius: "50%", background: "radial-gradient(circle, rgba(222,26,26,0.25) 0%, transparent 70%)", pointerEvents: "none" }} />
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

        </div>
      </div>
      )}

      {/* ── My Pending Content ── */}
      {myPosts.filter(p => p.status !== "posted" && p.status !== "cancelled" && p.status !== "missed").length > 0 && (
        <div style={{ marginTop: 20, background: "#FFFFFF", borderRadius: 20, border: "1px solid #E5E7EB", overflow: "hidden" }}>
          <div style={{ padding: "16px 24px", borderBottom: "1px solid #F3F4F6", display: "flex", alignItems: "center", gap: 8 }}>
            <CheckCircle2 size={16} style={{ color: "#DE1A1A" }} />
            <h3 style={{ fontSize: 14, fontWeight: 800, color: "#111827", margin: 0 }}>My Pending Content</h3>
          </div>
          <div>
            {myPosts.filter(p => p.status !== "posted" && p.status !== "cancelled" && p.status !== "missed").map((p, i, arr) => {
              const cfg = STATUS_CFG[p.status] ?? STATUS_CFG.pending
              const isOverdue = p.scheduled_date < today
              return (
                <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 24px", borderBottom: i < arr.length - 1 ? "1px solid #F9FAFB" : "none", background: isOverdue ? "rgba(239,68,68,0.03)" : "transparent" }}>
                  <span style={{ fontSize: 20, flexShrink: 0 }}>{platformEmoji(p.platform)}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 700, color: "#111827", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.title}</p>
                    <p style={{ fontSize: 11, color: isOverdue ? "#EF4444" : "#6B7280", margin: "2px 0 0", fontWeight: isOverdue ? 700 : 400 }}>
                      {isOverdue ? "⚠ Overdue · " : ""}{p.scheduled_date} · {platformLabel(p.platform)}
                    </p>
                  </div>
                  <button onClick={() => handleStatusChange(p.id, "posted")}
                    style={{ fontSize: 11, fontWeight: 800, padding: "7px 14px", borderRadius: 10, border: "none", background: "linear-gradient(135deg,#32D27A,#22B36A)", color: "#FFF", cursor: "pointer", display: "flex", alignItems: "center", gap: 5, flexShrink: 0 }}>
                    <CheckCircle2 size={13} /> Mark as Posted
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Post Link Modal ── */}
      {postLinkModal && (
        <div style={{ position: "fixed", inset: 0, zIndex: 110, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)" }} onClick={() => setPostLinkModal(null)} />
          <div style={{ position: "relative", background: "#FFFFFF", borderRadius: 20, padding: 28, width: "100%", maxWidth: 420, boxShadow: "0 20px 60px rgba(0,0,0,0.25)" }}>
            <div style={{ textAlign: "center", marginBottom: 20 }}>
              <div style={{ fontSize: 36, marginBottom: 8 }}>🎉</div>
              <h3 style={{ fontSize: 18, fontWeight: 900, color: "#111827", margin: "0 0 6px" }}>Content Posted!</h3>
              <p style={{ fontSize: 12, color: "#6B7280", margin: 0 }}><strong>{postLinkModal.title}</strong> — add the live post link.</p>
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={L}>Live Post Link (optional)</label>
              <input type="url" value={postLink} onChange={e => setPostLink(e.target.value)} placeholder="https://instagram.com/p/…" autoFocus style={F} />
              <p style={{ fontSize: 11, color: "#9CA3AF", margin: "5px 0 0" }}>Instagram, YouTube, Facebook post URL etc.</p>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setPostLinkModal(null)} style={{ flex: 1, padding: "12px", borderRadius: 10, border: "1px solid #E2E8F0", background: "#FAFAFA", fontSize: 13, fontWeight: 700, cursor: "pointer", color: "#6B7280" }}>Cancel</button>
              <button onClick={confirmPosted} disabled={savingPostLink}
                style={{ flex: 2, padding: "12px", borderRadius: 10, border: "none", background: savingPostLink ? "#9CA3AF" : "#32D27A", color: "#FFFFFF", fontSize: 13, fontWeight: 800, cursor: savingPostLink ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                {savingPostLink ? <><Loader2 size={14} className="animate-spin" /> Saving…</> : "✓ Mark as Posted"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add Content Modal ── */}
      {showAdd && (
        <div style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)" }} onClick={() => setShowAdd(false)} />
          <div style={{ position: "relative", background: "#FFFFFF", borderRadius: 20, padding: 28, width: "100%", maxWidth: 540, maxHeight: "92vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
              <div>
                <h3 style={{ fontSize: 17, fontWeight: 800, color: "#111827", margin: 0 }}>Schedule Content</h3>
                <p style={{ fontSize: 12, color: "#6B7280", margin: "2px 0 0" }}>
                  {schedType === "shoot" ? "📹 Video Shoot Schedule" : schedType === "post" ? "📱 Post (Videos & Poster)" : "Choose what to schedule"}
                </p>
              </div>
              <button onClick={() => setShowAdd(false)} style={{ background: "none", border: "none", cursor: "pointer" }}><X size={18} color="#6B7280" /></button>
            </div>

            {/* ── Type picker ── */}
            {!schedType && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 4 }}>
                {[
                  { key: "shoot", emoji: "📹", label: "Video Shoot", sub: "Schedule a shoot session", color: "#9B6BFF", bg: "rgba(155,107,255,0.06)", border: "rgba(155,107,255,0.25)" },
                  { key: "post",  emoji: "📱", label: "Post",        sub: "Videos, Reels & Posters",  color: "#DE1A1A", bg: "rgba(222,26,26,0.06)",   border: "rgba(222,26,26,0.25)" },
                ].map(opt => (
                  <button key={opt.key} type="button"
                    onClick={() => { setSchedType(opt.key as "shoot" | "post"); setContentType(opt.key === "shoot" ? "video" : "post"); setPlatform(opt.key === "shoot" ? "other" : "instagram") }}
                    style={{ padding: "22px 16px", borderRadius: 16, border: `2px solid ${opt.border}`, background: opt.bg, cursor: "pointer", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 8, transition: "all 0.15s" }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.transform = "translateY(-2px)"}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.transform = "none"}>
                    <span style={{ fontSize: 32 }}>{opt.emoji}</span>
                    <span style={{ fontSize: 14, fontWeight: 800, color: opt.color }}>{opt.label}</span>
                    <span style={{ fontSize: 11, color: "#6B7280" }}>{opt.sub}</span>
                  </button>
                ))}
              </div>
            )}

            {schedType && <button type="button" onClick={() => setSchedType("")}
              style={{ fontSize: 11, fontWeight: 700, color: "#9CA3AF", background: "none", border: "none", cursor: "pointer", padding: "0 0 10px", textAlign: "left" }}>
              ← Change type
            </button>}

            <form onSubmit={handleCreate} style={{ display: schedType ? "flex" : "none", flexDirection: "column", gap: 14 }}>
              <div>
                <label style={L}>Title *</label>
                <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Diwali Sale Reel" required style={F} />
              </div>

              {schedType === "post" && (
                <>
                  <div>
                    <label style={L}>Platform</label>
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
                    <label style={L}>Content Type</label>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {CONTENT_TYPES.map(ct => (
                        <button key={ct} type="button" onClick={() => setContentType(ct)}
                          style={{ padding: "6px 12px", borderRadius: 8, border: `1.5px solid ${contentType === ct ? "#DE1A1A" : "#E2E8F0"}`, background: contentType === ct ? "rgba(222,26,26,0.08)" : "#FAFAFA", color: contentType === ct ? "#DE1A1A" : "#718096", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                          {ct.charAt(0).toUpperCase() + ct.slice(1)}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label style={L}>Content Pillar</label>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {CONTENT_PILLARS.map(cp => (
                        <button key={cp} type="button" onClick={() => setContentPillar(contentPillar === cp ? "" : cp)}
                          style={{ padding: "5px 10px", borderRadius: 8, border: `1.5px solid ${contentPillar === cp ? "#9B6BFF" : "#E2E8F0"}`, background: contentPillar === cp ? "rgba(155,107,255,0.1)" : "#FAFAFA", color: contentPillar === cp ? "#9B6BFF" : "#718096", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                          {cp}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}

              <div>
                <label style={L}>Priority</label>
                <div style={{ display: "flex", gap: 8 }}>
                  {Object.entries(PRIORITY_CFG).map(([k, v]) => (
                    <button key={k} type="button" onClick={() => setPriority(k)}
                      style={{ padding: "6px 14px", borderRadius: 8, border: `1.5px solid ${priority === k ? v.color : "#E2E8F0"}`, background: priority === k ? v.bg : "#FAFAFA", color: priority === k ? v.color : "#718096", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                      {v.label}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={L}>Date *</label>
                  <input type="date" value={schedDate} onChange={e => setSchedDate(e.target.value)} required style={F} />
                </div>
                <div>
                  <ClientSelector
                    clientOptions={clientOptions}
                    value={clientName} brand={clientBrand} customClient={clientCustom}
                    onValueChange={setClientName} onBrandChange={setClientBrand} onCustomChange={setClientCustom}
                    label="Client"
                    fieldStyle={F}
                  />
                </div>
              </div>

              {schedType === "shoot" && (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <div>
                      <label style={L}>Shoot From</label>
                      <input type="time" value={shootFrom} onChange={e => setShootFrom(e.target.value)} style={F} />
                    </div>
                    <div>
                      <label style={L}>Shoot To</label>
                      <input type="time" value={shootTo} onChange={e => setShootTo(e.target.value)} style={F} />
                    </div>
                  </div>
                  <div>
                    <label style={L}>Location</label>
                    <input value={shootLocation} onChange={e => setShootLocation(e.target.value)} placeholder="e.g. Studio A, Client Office, Outdoor — MG Road…" style={F} />
                  </div>
                </>
              )}

              <div>
                <label style={L}>Assign To</label>
                <select value={assignedTo} onChange={e => setAssignedTo(e.target.value)} style={F}>
                  <option value="">— Myself —</option>
                  {members.filter(m => m.id !== userId).map(m => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={L}>Instructions / Keep Remember Points <span style={{ fontWeight: 400, color: "#9CA3AF", textTransform: "none" }}>(optional)</span></label>
                <textarea value={instructions} onChange={e => setInstructions(e.target.value)} rows={2}
                  placeholder="Content guidelines, reminders, or notes…"
                  style={{ ...F, resize: "vertical", lineHeight: 1.5 }} />
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", background: "rgba(37,211,102,0.07)", borderRadius: 8, border: "1px solid rgba(37,211,102,0.2)" }}>
                <Send size={13} color="#25D366" />
                <span style={{ fontSize: 12, color: "#25D366", fontWeight: 600 }}>
                  {assignedTo ? `WhatsApp notification will be sent to ${members.find(m => m.id === assignedTo)?.name ?? "assignee"}` : "This post will be assigned to you"}
                </span>
              </div>

              {formError && <p style={{ fontSize: 12, color: "#EF4444", background: "rgba(239,68,68,0.07)", padding: "10px 14px", borderRadius: 8, margin: 0 }}>{formError}</p>}
              {formSuccess && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", background: "rgba(50,210,122,0.08)", borderRadius: 8 }}>
                  <span style={{ fontSize: 12, color: "#32D27A", fontWeight: 600 }}>✓ Content scheduled!</span>
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
