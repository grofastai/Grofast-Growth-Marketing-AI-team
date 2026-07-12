"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors,
  useDraggable, useDroppable,
  type DragEndEvent, type DragStartEvent,
} from "@dnd-kit/core"
import {
  Plus, X, ChevronLeft, ChevronRight, ChevronDown, GripVertical,
  Image as ImageIcon, Film, PlayCircle, Layers, Send, Trash2, Pencil,
  Loader2, CheckCircle2, Camera, Link2, CalendarDays, Clock,
} from "lucide-react"
import { createContentPost, updateContentPost, updateContentPostStatus, deleteContentPost } from "@/lib/actions/content-calendar"
import { useToast } from "@/components/ui/useToast"
import { PageHero } from "@/components/admin/PageHero"
import ClientSelector, { resolveClientName } from "@/components/ui/ClientSelector"

const INTERNAL_BRANDS = ["GROFAST DIGITAL", "KARTHICK BRANDS", "GROFAST AI"]

// ── Types ──────────────────────────────────────────────────────────────────────
export interface BoardPost {
  id: string; title: string; platform: string; content_type: string
  client_name: string; scheduled_date: string; status: string
  assigned_to: string | null; drive_link: string | null
  content_pillar?: string | null; priority?: string | null
  notes?: string | null; scheduled_time?: string | null
  assignee?: { name: string } | null
  shoot_team?: string[] | null
  created_by?: string | null
}
export interface BoardMember { id: string; name: string }

export interface ContentCalendarBoardProps {
  posts: BoardPost[]
  members: BoardMember[]
  clientOptions: string[]        // active client names (internal brands prepended by board)
  pastClientOptions: string[]
  role: "ADMIN" | "MEMBER"
  currentUserId: string
  basePath: string               // "/admin/content-calendar" | "/member/content-calendar"
  initialYear: number
  initialMonth: number           // 0-based
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
const CONTENT_TYPE_ICON: Record<string, typeof Layers> = {
  post: ImageIcon, reel: Film, video: PlayCircle, story: Layers, carousel: Layers, other: Layers,
}
const CONTENT_TYPES = [
  { id: "post",     label: "Post"     },
  { id: "reel",     label: "Reel"     },
  { id: "video",    label: "Video"    },
  { id: "story",    label: "Story"    },
  { id: "carousel", label: "Carousel" },
  { id: "other",    label: "Other"    },
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

// Board columns — mapped 1:1 to content_posts.status
type ColStatus = "pending" | "in_progress" | "ready" | "posted"
const COLUMNS: { status: ColStatus; label: string; accent: string }[] = [
  { status: "pending",     label: "Scheduled",   accent: "#FFA53A" },
  { status: "in_progress", label: "In Progress", accent: "#4D8CFF" },
  { status: "ready",       label: "Ready",       accent: "#9B6BFF" },
  { status: "posted",      label: "Uploaded",    accent: "#32D27A" },
]
const COL_STATUSES: ColStatus[] = COLUMNS.map(c => c.status)
// Exception (terminal) states — not columns; shown as a badge inside "Scheduled" when opted in
const EXCEPTION_CFG: Record<string, { label: string; color: string; bg: string }> = {
  cancelled: { label: "Cancelled", color: "#EF4444", bg: "rgba(239,68,68,0.1)"  },
  missed:    { label: "Missed",    color: "#EF4444", bg: "rgba(239,68,68,0.08)" },
}
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"]

function platformColor(p: string) { return PLATFORMS.find(x => x.id === p)?.color ?? "#6B7280" }
function platformEmoji(p: string) { return PLATFORMS.find(x => x.id === p)?.emoji ?? "📱" }
function initials(name?: string | null) {
  if (!name) return "?"
  return name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()
}
function formatTime(t: string | null | undefined): string | null {
  if (!t) return null
  const [h, m] = t.split(":").map(Number)
  const period = h >= 12 ? "PM" : "AM"
  const hr = h % 12 || 12
  return `${hr}:${String(m).padStart(2, "0")} ${period}`
}
function formatDate(d: string): string {
  return new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })
}
function isShootPost(p: BoardPost) { return (p.shoot_team?.length ?? 0) > 0 || p.platform === "other" }

const FIELD: React.CSSProperties = {
  width: "100%", padding: "10px 14px", borderRadius: 10,
  border: "1.5px solid #E2E8F0", fontSize: 13, background: "#FAFAFA",
  color: "#1A202C", outline: "none", fontFamily: "inherit", boxSizing: "border-box",
}
const LABEL: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, color: "#4A5568",
  textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 5, display: "block",
}

// ── Card ──────────────────────────────────────────────────────────────────────
function CardInner({ post, memberName, isDragging, canEdit, onEdit, onDelete }: {
  post: BoardPost; memberName: (id: string) => string; isDragging?: boolean
  canEdit: boolean; onEdit: (p: BoardPost) => void; onDelete: (id: string) => void
}) {
  const TypeIcon = CONTENT_TYPE_ICON[post.content_type] ?? Layers
  const pri = post.priority ? PRIORITY_CFG[post.priority] : null
  const exception = EXCEPTION_CFG[post.status]
  const shoot = isShootPost(post)
  const team = post.shoot_team ?? []

  return (
    <div className="rounded-2xl p-3.5 mb-2.5 group transition-all select-none"
      style={{
        background: isDragging ? "#F3F4F6" : "#FFFFFF",
        boxShadow: isDragging ? "0 8px 24px rgba(0,0,0,0.15)" : "0 2px 10px rgba(0,0,0,0.05)",
        border: exception ? `1px solid ${exception.color}55` : "1px solid transparent",
        opacity: isDragging ? 0.5 : 1,
      }}>
      {/* title row */}
      <div className="flex items-start gap-2 mb-2">
        {canEdit && (
          <span className="flex-shrink-0 mt-0.5 opacity-30 group-hover:opacity-70 transition-opacity" title="Drag anywhere on the card to move it">
            <GripVertical size={13} style={{ color: "#6B7280" }} />
          </span>
        )}
        <div style={{ width: 22, height: 22, borderRadius: 7, background: `${platformColor(post.platform)}18`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <TypeIcon size={12} style={{ color: platformColor(post.platform) }} />
        </div>
        <p className="text-[12px] font-semibold leading-snug line-clamp-2 flex-1" style={{ color: "#111111" }}>
          <span style={{ marginRight: 4 }}>{platformEmoji(post.platform)}</span>{post.title}
        </p>
      </div>

      {/* badges row */}
      <div className="flex flex-wrap items-center gap-1 mb-2">
        <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-full truncate max-w-[120px]"
          style={{ background: "rgba(99,102,241,0.08)", color: "#6366F1" }}>{post.client_name || "—"}</span>
        {shoot && (
          <span className="flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full"
            style={{ background: "rgba(155,107,255,0.12)", color: "#9B6BFF" }}>
            <Camera size={9} /> Shoot
          </span>
        )}
        {pri && (
          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: pri.bg, color: pri.color }}>{pri.label}</span>
        )}
        {exception && (
          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: exception.bg, color: exception.color }}>{exception.label}</span>
        )}
      </div>

      {post.content_pillar && (
        <div className="mb-2">
          <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-full" style={{ background: "rgba(155,107,255,0.08)", color: "#9B6BFF" }}>{post.content_pillar}</span>
        </div>
      )}

      {/* date/time + people */}
      <div className="flex items-center flex-wrap gap-x-2 gap-y-1 mb-1">
        <span className="flex items-center gap-1 text-[9px]" style={{ color: "#6B7280" }}>
          <CalendarDays size={9} /> {formatDate(post.scheduled_date)}
        </span>
        {formatTime(post.scheduled_time) && (
          <span className="flex items-center gap-1 text-[9px]" style={{ color: "#6B7280" }}>
            <Clock size={9} /> {formatTime(post.scheduled_time)}
          </span>
        )}
        {post.drive_link && (
          <a href={post.drive_link} target="_blank" rel="noopener noreferrer" onPointerDown={e => e.stopPropagation()}
            className="flex items-center gap-1 text-[9px] font-semibold" style={{ color: "#2563EB" }}>
            <Link2 size={9} /> Link
          </a>
        )}
      </div>

      {/* avatars */}
      <div className="flex items-center gap-1 mb-1 flex-wrap">
        {post.assignee?.name && !shoot && (
          <div className="flex items-center gap-1" title={`Assigned to ${post.assignee.name}`}>
            <div className="w-4 h-4 rounded-full flex items-center justify-center text-[7px] font-black flex-shrink-0" style={{ background: "#DE1A1A", color: "#fff" }}>
              {initials(post.assignee.name)}
            </div>
          </div>
        )}
        {shoot && team.map(id => (
          <div key={id} className="w-4 h-4 rounded-full flex items-center justify-center text-[7px] font-black flex-shrink-0" title={memberName(id)} style={{ background: "#9B6BFF", color: "#fff" }}>
            {initials(memberName(id))}
          </div>
        ))}
      </div>

      {/* actions */}
      {canEdit && (
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 4, marginTop: 6 }}>
          <button onPointerDown={e => e.stopPropagation()} onClick={() => onEdit(post)} title="Edit"
            style={{ padding: "3px 6px", borderRadius: 6, background: "transparent", border: "none", cursor: "pointer", opacity: 0.4 }}
            onMouseEnter={e => (e.currentTarget.style.opacity = "1")} onMouseLeave={e => (e.currentTarget.style.opacity = "0.4")}>
            <Pencil size={11} style={{ color: "#6366F1" }} />
          </button>
          <button onPointerDown={e => e.stopPropagation()} onClick={() => onDelete(post.id)} title="Delete"
            style={{ padding: "3px 6px", borderRadius: 6, background: "transparent", border: "none", cursor: "pointer", opacity: 0.4 }}
            onMouseEnter={e => (e.currentTarget.style.opacity = "1")} onMouseLeave={e => (e.currentTarget.style.opacity = "0.4")}>
            <Trash2 size={11} style={{ color: "#de1a1a" }} />
          </button>
        </div>
      )}
    </div>
  )
}

function DraggableCard(props: {
  post: BoardPost; memberName: (id: string) => string; isDragging: boolean
  onEdit: (p: BoardPost) => void; onDelete: (id: string) => void
}) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({ id: props.post.id, data: { status: props.post.status } })
  const style = transform ? { transform: `translate3d(${transform.x}px,${transform.y}px,0)` } : undefined
  return (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    <div ref={setNodeRef} style={{ ...style, touchAction: "none" }} {...(listeners as any)} {...(attributes as any)} className="cursor-grab active:cursor-grabbing">
      <CardInner {...props} canEdit isDragging={props.isDragging} />
    </div>
  )
}

function DroppableColumn({ status, accent, isOver, children }: { status: ColStatus; accent: string; isOver: boolean; children: React.ReactNode }) {
  const { setNodeRef } = useDroppable({ id: status })
  return (
    <div ref={setNodeRef} className="rounded-2xl transition-all flex flex-col"
      style={{ border: isOver ? `2px solid ${accent}` : "1px solid #E8E9EF", background: isOver ? `${accent}08` : "#F9FAFB", minHeight: 200 }}>
      {children}
    </div>
  )
}

// ── Main board ────────────────────────────────────────────────────────────────
export default function ContentCalendarBoard({
  posts: initial, members, clientOptions, pastClientOptions,
  role, currentUserId, basePath, initialYear, initialMonth,
}: ContentCalendarBoardProps) {
  const router = useRouter()
  const { toastEl, showToast } = useToast()
  const [posts, setPosts] = useState(initial)
  // Re-sync local posts when the server sends a fresh list (month change / router.refresh)
  const [prevInitial, setPrevInitial] = useState(initial)
  if (prevInitial !== initial) { setPrevInitial(initial); setPosts(initial) }
  const [year, setYear]   = useState(initialYear)
  const [month, setMonth] = useState(initialMonth)
  const [isPending, start] = useTransition()

  // filters
  const [clientFilter, setClientFilter] = useState("all")
  const [modeFilter, setModeFilter]     = useState<"all" | "post" | "shoot">("all")
  const [showExceptions, setShowExceptions] = useState(false)
  const [dayFilter, setDayFilter]       = useState("")   // "" = all days in the month

  // dnd
  const [dragId, setDragId]   = useState<string | null>(null)
  const [overCol, setOverCol] = useState<string | null>(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  // mobile
  const [activeMobileCol, setActiveMobileCol] = useState<ColStatus>("pending")

  const memberName = useMemo(() => {
    const map = new Map(members.map(m => [m.id, m.name]))
    return (id: string) => map.get(id) ?? "Member"
  }, [members])

  const canEditPost = (p: BoardPost) =>
    role === "ADMIN" || p.assigned_to === currentUserId || p.created_by === currentUserId

  // ── month navigation (reloads server data for that month) ──
  function goMonth(y: number, m: number) {
    setYear(y); setMonth(m)
    router.push(`${basePath}?year=${y}&month=${m}`)
  }
  // Changing month always drops the day filter — otherwise a day from the old month
  // stays active and silently empties the board (Jun selected, Jul 8 still filtering).
  function prevMonth() { setDayFilter(""); if (month === 0) goMonth(year - 1, 11); else goMonth(year, month - 1) }
  function nextMonth() { setDayFilter(""); if (month === 11) goMonth(year + 1, 0); else goMonth(year, month + 1) }

  // ── day filter — posts are loaded a month at a time, so picking a day outside the
  // loaded month navigates to that month first, then filters to the day.
  function pickDay(d: string) {
    setDayFilter(d)
    if (!d) return
    const [y, m] = d.split("-").map(Number)
    if (y !== year || m - 1 !== month) goMonth(y, m - 1)
  }

  // Bound the native picker to the month on screen so it opens on that month
  // (an unbounded date input opens on today's month, which is what caused the mismatch).
  const monthStart = `${year}-${String(month + 1).padStart(2, "0")}-01`
  const monthEnd   = `${year}-${String(month + 1).padStart(2, "0")}-${String(new Date(year, month + 1, 0).getDate()).padStart(2, "0")}`

  const clientNames = useMemo(() => {
    const fromPosts = [...new Set(posts.map(p => p.client_name).filter(Boolean))] as string[]
    const merged = [...new Set([...clientOptions, ...fromPosts])].filter(n => !INTERNAL_BRANDS.includes(n)).sort()
    return [...INTERNAL_BRANDS, ...merged]
  }, [posts, clientOptions])

  const filtered = useMemo(() => {
    let p = posts
    if (dayFilter) p = p.filter(x => x.scheduled_date === dayFilter)
    if (clientFilter !== "all") p = p.filter(x => x.client_name === clientFilter)
    if (modeFilter === "shoot") p = p.filter(isShootPost)
    else if (modeFilter === "post") p = p.filter(x => !isShootPost(x))
    return p
  }, [posts, clientFilter, modeFilter, dayFilter])

  function colPosts(status: ColStatus): BoardPost[] {
    if (status === "pending") {
      return filtered.filter(p =>
        p.status === "pending" || (showExceptions && (p.status === "cancelled" || p.status === "missed")))
    }
    return filtered.filter(p => p.status === status)
  }

  const counts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const s of COL_STATUSES) c[s] = colPosts(s).length
    return c
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, showExceptions])

  // ── status change (drag or programmatic) ──
  function changeStatus(id: string, status: ColStatus) {
    setPosts(prev => prev.map(p => p.id === id ? { ...p, status } : p))
    start(async () => { await updateContentPostStatus(id, status as "posted") })
  }

  function handleDragStart(e: DragStartEvent) { setDragId(String(e.active.id)) }
  function handleDragOver(e: { over: { id: string } | null }) { setOverCol(e.over?.id ?? null) }
  function handleDragEnd(e: DragEndEvent) {
    const overId = e.over?.id as ColStatus | undefined
    if (overId && COL_STATUSES.includes(overId)) {
      const post = posts.find(p => p.id === e.active.id)
      if (post && post.status !== overId && canEditPost(post)) changeStatus(post.id, overId)
    }
    setDragId(null); setOverCol(null)
  }
  const draggedPost = posts.find(p => p.id === dragId)

  function handleDelete(id: string) {
    const post = posts.find(p => p.id === id)
    if (post && !canEditPost(post)) { showToast("You can only delete your own content"); return }
    start(async () => {
      const res = await deleteContentPost(id)
      if (res?.success) { setPosts(prev => prev.filter(p => p.id !== id)); router.refresh() }
      else showToast(res?.error ?? "Failed to delete. Please try again.")
    })
  }

  // ── modal state ──
  const [modalMode, setModalMode]   = useState<"add" | "edit" | null>(null)
  const [editingPost, setEditingPost] = useState<BoardPost | null>(null)
  const [schedType, setSchedType]   = useState<"" | "shoot" | "post">("")
  const [title, setTitle]           = useState("")
  const [platform, setPlatform]     = useState("instagram")
  const [contentType, setContentType] = useState("post")
  const [clientId, setClientId]     = useState("")
  const [clientName, setClientName] = useState("")
  const [clientBrand, setClientBrand] = useState("")
  const [clientCustom, setClientCustom] = useState("")
  const [assignedTo, setAssignedTo] = useState("")
  const [shootTeam, setShootTeam]   = useState<string[]>([])
  const [instructions, setInstructions] = useState("")
  const [contentPillar, setContentPillar] = useState("")
  const [priority, setPriority]     = useState("medium")
  const [schedDates, setSchedDates] = useState<string[]>([])
  const [schedTime, setSchedTime]   = useState("")
  const [shootFrom, setShootFrom]   = useState("")
  const [shootTo, setShootTo]       = useState("")
  const [shootLocation, setShootLocation] = useState("")
  const [formError, setFormError]   = useState("")
  const [formSuccess, setFormSuccess] = useState(false)

  const today = new Date().toISOString().split("T")[0]
  const isEdit = modalMode === "edit"

  function resetForm() {
    setTitle(""); setPlatform("instagram"); setContentType("post")
    setClientId(""); setClientName(""); setClientBrand(""); setClientCustom("")
    setAssignedTo(""); setShootTeam([]); setInstructions("")
    setContentPillar(""); setPriority("medium"); setSchedTime(""); setSchedDates([])
    setShootFrom(""); setShootTo(""); setShootLocation("")
    setFormError(""); setFormSuccess(false); setSchedType("")
  }
  function openAdd() { resetForm(); setSchedDates([today]); setModalMode("add") }
  function openEdit(post: BoardPost) {
    setEditingPost(post)
    setTitle(post.title); setPlatform(post.platform); setContentType(post.content_type)
    setClientName(post.client_name); setClientBrand(""); setClientCustom("")
    setClientId("")
    setAssignedTo(post.assigned_to ?? ""); setShootTeam(post.shoot_team ?? [])
    setInstructions(post.notes ?? ""); setContentPillar(post.content_pillar ?? "")
    setPriority(post.priority ?? "medium")
    setSchedDates([post.scheduled_date]); setSchedTime(post.scheduled_time ?? "")
    setShootFrom(""); setShootTo(""); setShootLocation("")
    setFormError(""); setFormSuccess(false); setModalMode("edit")
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) { setFormError("Title is required"); return }
    if (schedDates.length === 0) { setFormError("Select at least one date"); return }
    setFormError("")
    start(async () => {
      const resolvedName = resolveClientName(clientName, clientBrand, clientCustom) || ""
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
      if (failed) setFormError(failed.error ?? "Something went wrong")
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
      const resolvedName = resolveClientName(clientName, clientBrand, clientCustom) || clientName || ""
      const isShoot = contentType === "shoot" || schedType === "shoot" || (editingPost.shoot_team?.length ?? 0) > 0
      const res = await updateContentPost(editingPost.id, {
        title, platform, content_type: contentType,
        client_id: clientId || null, client_name: resolvedName,
        scheduled_date: schedDates[0], scheduled_time: schedTime || null,
        assigned_to: isShoot ? (shootTeam[0] || null) : (assignedTo || null),
        shoot_team: isShoot ? shootTeam : [],
        notes: instructions || undefined,
        content_pillar: contentPillar || null, priority: priority || "medium",
      })
      if (!res.success) setFormError(res.error ?? "Something went wrong")
      else {
        setPosts(prev => prev.map(p => p.id === editingPost.id ? {
          ...p, title, platform, content_type: contentType, client_name: resolvedName,
          scheduled_date: schedDates[0], scheduled_time: schedTime || null,
          assigned_to: isShoot ? (shootTeam[0] || null) : (assignedTo || null),
          shoot_team: isShoot ? shootTeam : [],
          notes: instructions || null, content_pillar: contentPillar || null, priority,
        } : p))
        setFormSuccess(true); router.refresh()
        setTimeout(() => { setModalMode(null); setFormSuccess(false) }, 1000)
      }
    })
  }

  const totalContent = filtered.length
  const postedCount = filtered.filter(p => p.status === "posted").length
  const showModal = modalMode !== null
  const shootPickerOn = isEdit ? (contentType === "shoot" || (editingPost?.shoot_team?.length ?? 0) > 0) : schedType === "shoot"

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div style={{ background: "#F9FAFB", minHeight: "100vh", padding: "clamp(12px,3vw,24px)", display: "flex", flexDirection: "column", gap: 18 }}>
      {toastEl}

      <PageHero
        eyebrow="CONTENT CALENDAR"
        eyebrowIcon={<span style={{ fontSize: 14 }}>⭐</span>}
        title="Content Calendar"
        subtitle="Plan every post & shoot on one board — drag a card to move it through the pipeline."
        belowSubtitle={
          <button onClick={openAdd}
            style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 20px", background: "rgba(255,255,255,0.22)", backdropFilter: "blur(8px)", color: "#FFF", borderRadius: 12, border: "1.5px solid rgba(255,255,255,0.35)", cursor: "pointer", fontSize: 12, fontWeight: 800, whiteSpace: "nowrap" }}>
            <Plus size={14} strokeWidth={3} /> Add Content
          </button>
        }
        rightSlot={
          /* One scrollable row on mobile (keeps the hero short), wraps naturally on md+ */
          <div className="flex flex-nowrap overflow-x-auto md:flex-wrap md:overflow-visible" style={{ alignItems: "center", gap: 12, scrollbarWidth: "none", maxWidth: "100%" }}>
            {/* Character + greeting card */}
            <div style={{ display: "flex", alignItems: "flex-end", gap: 12, flexShrink: 0 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brand/content-cal-hero-girl.png" alt=""
                style={{ height: "clamp(64px,16vw,130px)", width: "auto", objectFit: "contain", objectPosition: "bottom", flexShrink: 0, filter: "drop-shadow(0 6px 20px rgba(0,0,0,0.4))" }} />
              <div style={{ background: "rgba(255,255,255,0.12)", backdropFilter: "blur(12px)", borderRadius: 16, padding: "12px 16px", border: "1px solid rgba(255,255,255,0.2)", minWidth: 180 }}>
                <p style={{ fontSize: 14, fontWeight: 800, color: "#FFF", margin: "0 0 4px" }}>Plan your content! 📅</p>
                <p style={{ fontSize: 11, color: "rgba(255,255,255,0.65)", margin: 0 }}>What are you scheduling today?</p>
              </div>
            </div>
            {/* Date + stat glass cards */}
            <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
              <div style={{ background: "rgba(255,255,255,0.1)", backdropFilter: "blur(12px)", borderRadius: 14, padding: "clamp(8px,2vw,12px) clamp(10px,2.5vw,16px)", textAlign: "center", border: "1px solid rgba(255,255,255,0.15)", minWidth: 72 }}>
                <p style={{ fontSize: 9, fontWeight: 800, color: "rgba(255,255,255,0.6)", margin: "0 0 2px", letterSpacing: "0.1em" }}>
                  {MONTHS[month].slice(0,3).toUpperCase()} {year}
                </p>
                <p style={{ fontSize: "clamp(22px,5.5vw,30px)", fontWeight: 900, color: "#FFFFFF", margin: "0 0 2px", lineHeight: 1 }}>{new Date().getDate()}</p>
                <p style={{ fontSize: 10, color: "rgba(255,255,255,0.6)", margin: 0, fontWeight: 600 }}>
                  {new Date().toLocaleDateString("en-US", { weekday: "long" })}
                </p>
              </div>
              <div style={{ background: "rgba(255,255,255,0.1)", backdropFilter: "blur(12px)", borderRadius: 14, padding: "clamp(8px,2vw,12px) clamp(10px,2.5vw,16px)", textAlign: "center", border: "1px solid rgba(255,255,255,0.15)", minWidth: 72 }}>
                <p style={{ fontSize: 9, fontWeight: 800, color: "rgba(255,255,255,0.6)", margin: "0 0 2px", letterSpacing: "0.06em" }}>
                  {dayFilter ? formatDate(dayFilter).toUpperCase() : "TOTAL"}
                </p>
                <p style={{ fontSize: "clamp(22px,5.5vw,30px)", fontWeight: 900, color: "#FFFFFF", margin: "0 0 2px", lineHeight: 1 }}>{totalContent}</p>
                <p style={{ fontSize: 10, color: "rgba(255,255,255,0.6)", margin: 0, fontWeight: 600 }}>Posts</p>
              </div>
              <div style={{ background: "rgba(255,255,255,0.1)", backdropFilter: "blur(12px)", borderRadius: 14, padding: "clamp(8px,2vw,12px) clamp(10px,2.5vw,16px)", textAlign: "center", border: "1px solid rgba(255,255,255,0.15)", minWidth: 72 }}>
                <p style={{ fontSize: 9, fontWeight: 800, color: "rgba(255,255,255,0.6)", margin: "0 0 2px", letterSpacing: "0.06em" }}>UPLOADED</p>
                <p style={{ fontSize: "clamp(22px,5.5vw,30px)", fontWeight: 900, color: "#FFFFFF", margin: "0 0 2px", lineHeight: 1 }}>{postedCount}</p>
                <p style={{ fontSize: 10, color: "rgba(255,255,255,0.6)", margin: 0, fontWeight: 600 }}>Done ✓</p>
              </div>
            </div>
          </div>
        }
      />

      {/* ── Filter bar ── */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex gap-2 flex-wrap items-center">
          {/* Month nav */}
          <div className="flex items-center gap-1" style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12, padding: "4px 6px" }}>
            <button onClick={prevMonth} style={{ padding: 6, borderRadius: 8, border: "none", background: "transparent", cursor: "pointer" }}><ChevronLeft size={16} style={{ color: "#6B7280" }} /></button>
            <span style={{ fontSize: 12, fontWeight: 800, color: "#111827", minWidth: 96, textAlign: "center" }}>{MONTHS[month].slice(0,3)} {year}</span>
            <button onClick={nextMonth} style={{ padding: 6, borderRadius: 8, border: "none", background: "transparent", cursor: "pointer" }}><ChevronRight size={16} style={{ color: "#6B7280" }} /></button>
          </div>
          {/* Day filter */}
          <div className="flex items-center gap-1" style={{ background: "#fff", border: `1px solid ${dayFilter ? "#DE1A1A" : "#E5E7EB"}`, borderRadius: 12, padding: "3px 6px" }}>
            <CalendarDays size={13} style={{ color: dayFilter ? "#DE1A1A" : "#9CA3AF", flexShrink: 0 }} />
            <input type="date" value={dayFilter} min={monthStart} max={monthEnd}
              onChange={e => pickDay(e.target.value)}
              aria-label={`Filter by day in ${MONTHS[month]} ${year}`}
              style={{ border: "none", outline: "none", background: "transparent", fontSize: 12, fontWeight: 700, color: dayFilter ? "#DE1A1A" : "#6B7280", fontFamily: "inherit", cursor: "pointer", padding: "5px 2px" }} />
            {dayFilter ? (
              <button onClick={() => setDayFilter("")} title="Show all days in this month"
                style={{ padding: "3px 6px", borderRadius: 8, border: "none", background: "rgba(222,26,26,0.08)", color: "#DE1A1A", fontSize: 11, fontWeight: 800, cursor: "pointer", lineHeight: 1 }}>
                ✕
              </button>
            ) : (
              <button onClick={() => pickDay(today)} title="Jump to today"
                style={{ padding: "4px 8px", borderRadius: 8, border: "none", background: "#F3F4F6", color: "#6B7280", fontSize: 10, fontWeight: 800, cursor: "pointer" }}>
                Today
              </button>
            )}
          </div>
          {/* Client filter */}
          <div style={{ position: "relative" }}>
            <select value={clientFilter} onChange={e => setClientFilter(e.target.value)}
              style={{ ...FIELD, width: "auto", paddingRight: 30, cursor: "pointer", fontWeight: 700, appearance: "none", WebkitAppearance: "none", MozAppearance: "none" }}>
              <option value="all">All Clients</option>
              {clientNames.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <ChevronDown size={12} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: "#7A4B00", pointerEvents: "none" }} />
          </div>
          {/* Post / Shoot toggle */}
          <div style={{ display: "flex", gap: 2, background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12, padding: 3 }}>
            {([
              { v: "all"   as const, label: "All" },
              { v: "post"  as const, label: "Posts" },
              { v: "shoot" as const, label: "Shoots" },
            ]).map(({ v, label }) => (
              <button key={v} onClick={() => setModeFilter(v)} style={{
                padding: "6px 12px", borderRadius: 9, border: "none", cursor: "pointer", fontSize: 11, fontWeight: 700,
                background: modeFilter === v ? "linear-gradient(135deg,#FF4D4D,#DE1A1A)" : "transparent",
                color: modeFilter === v ? "#fff" : "#6B7280",
              }}>{label}</button>
            ))}
          </div>
          {/* Exceptions toggle */}
          <button onClick={() => setShowExceptions(s => !s)} style={{
            padding: "8px 14px", borderRadius: 12, cursor: "pointer", fontSize: 11, fontWeight: 700,
            border: `1.5px solid ${showExceptions ? "#EF4444" : "#E5E7EB"}`,
            background: showExceptions ? "rgba(239,68,68,0.06)" : "#fff",
            color: showExceptions ? "#EF4444" : "#6B7280",
          }}>{showExceptions ? "✓ " : ""}Cancelled/Missed</button>
        </div>
      </div>

      {/* ── Column count chips ── */}
      <div className="flex gap-2 flex-wrap">
        {COLUMNS.map(c => (
          <div key={c.status} style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 16, padding: "10px 16px", flex: "1 1 120px", minWidth: 100 }}>
            <p style={{ fontSize: 22, fontWeight: 900, color: c.accent, margin: 0, letterSpacing: "-0.02em" }}>{counts[c.status]}</p>
            <p style={{ fontSize: 10, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.06em", margin: "2px 0 0" }}>{c.label}</p>
          </div>
        ))}
      </div>

      {/* ── Mobile column switcher ── */}
      <div className="flex md:hidden gap-2 overflow-x-auto pb-1">
        {COLUMNS.map(c => (
          <button key={c.status} onClick={() => setActiveMobileCol(c.status)}
            style={{ flexShrink: 0, padding: "6px 14px", borderRadius: 10, border: `1.5px solid ${activeMobileCol === c.status ? c.accent : "#E5E7EB"}`, background: activeMobileCol === c.status ? `${c.accent}14` : "#fff", color: activeMobileCol === c.status ? c.accent : "#6B7280", fontSize: 11, fontWeight: 700 }}>
            {c.label} ({counts[c.status]})
          </button>
        ))}
      </div>
      <div className="md:hidden">
        {colPosts(activeMobileCol).length === 0 ? (
          <p style={{ fontSize: 12, color: "#9CA3AF", textAlign: "center", padding: "24px 0" }}>No content</p>
        ) : colPosts(activeMobileCol).map(post => (
          <CardInner key={post.id} post={post} memberName={memberName} canEdit={canEditPost(post)} onEdit={openEdit} onDelete={handleDelete} />
        ))}
      </div>

      {/* ── Desktop board ── */}
      <div className="hidden md:block">
        <DndContext sensors={sensors} onDragStart={handleDragStart} onDragOver={handleDragOver as never} onDragEnd={handleDragEnd}>
          <div className="grid grid-cols-4 gap-4">
            {COLUMNS.map(({ status, label, accent }) => {
              const list = colPosts(status)
              return (
                <DroppableColumn key={status} status={status} accent={accent} isOver={overCol === status}>
                  <div className="flex items-center justify-between px-4 py-3 rounded-t-2xl" style={{ background: "#FFFFFF", borderBottom: "1px solid #E8E9EF" }}>
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-black" style={{ color: "#111111" }}>{label}</span>
                      <span className="w-5 h-5 rounded-full text-[9px] font-black flex items-center justify-center" style={{ background: `${accent}20`, color: accent }}>{list.length}</span>
                    </div>
                  </div>
                  <div className="p-3 flex-1">
                    {list.length === 0 ? (
                      <div className="flex items-center justify-center py-8 rounded-xl transition-all" style={{ border: `2px dashed ${overCol === status ? accent : "#E5E7EB"}` }}>
                        <p className="text-[11px]" style={{ color: overCol === status ? accent : "#D1D5DB" }}>{overCol === status ? "Drop here" : "No content"}</p>
                      </div>
                    ) : list.map(post => (
                      canEditPost(post)
                        ? <DraggableCard key={post.id} post={post} memberName={memberName} isDragging={dragId === post.id} onEdit={openEdit} onDelete={handleDelete} />
                        : <CardInner key={post.id} post={post} memberName={memberName} canEdit={false} onEdit={openEdit} onDelete={handleDelete} />
                    ))}
                  </div>
                </DroppableColumn>
              )
            })}
          </div>
          <DragOverlay>
            {draggedPost ? (
              <div style={{ width: 260, opacity: 0.95, transform: "rotate(2deg)" }}>
                <CardInner post={draggedPost} memberName={memberName} canEdit={false} onEdit={() => {}} onDelete={() => {}} />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>

      {/* ── Motivational card ── */}
      <div style={{ background: "linear-gradient(135deg, #1A0000 0%, #5B0000 50%, #8B0000 100%)", borderRadius: 24, padding: "clamp(22px,3.5vw,36px) clamp(20px,3vw,32px) 0", position: "relative", overflow: "hidden", minHeight: "clamp(180px,20vw,260px)", border: "1px solid rgba(222,26,26,0.3)", boxShadow: "0 8px 32px rgba(90,0,0,0.4)" }}>
        <div style={{ position: "absolute", top: -50, right: -40, width: 190, height: 190, borderRadius: "50%", background: "radial-gradient(circle,rgba(255,75,75,0.3) 0%,transparent 70%)", pointerEvents: "none" }} />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/content-cal-boy-sidebar.png" alt=""
          style={{ position: "absolute", right: 0, bottom: 0, height: "clamp(150px,20vw,260px)", maxWidth: "clamp(130px,26vw,330px)", objectFit: "contain", objectPosition: "right bottom", filter: "drop-shadow(0 4px 16px rgba(0,0,0,0.45))", pointerEvents: "none" }} />
        {/* paddingRight reserves space for the illustration so text can never run under it */}
        <div style={{ paddingRight: "clamp(140px,28vw,360px)", paddingBottom: 24, position: "relative", zIndex: 1 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(222,26,26,0.85)", borderRadius: 20, padding: "5px 14px", marginBottom: 14 }}>
            <span style={{ fontSize: "clamp(10px,1.2vw,12px)", fontWeight: 800, color: "#FFF", letterSpacing: "0.05em" }}>🔥 PRO TIP</span>
          </div>
          <p style={{ fontSize: "clamp(15px,2.2vw,24px)", fontWeight: 900, color: "#FFFFFF", margin: "0 0 8px", lineHeight: 1.3 }}>Consistent content = consistent growth!</p>
          <p style={{ fontSize: "clamp(11px,1.4vw,15px)", color: "rgba(255,255,255,0.6)", margin: 0 }}>Post daily across all platforms 🚀</p>
        </div>
      </div>

      {/* ── Add / Edit Modal ── */}
      {showModal && (
        <div style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)" }} onClick={() => setModalMode(null)} />
          <div style={{ position: "relative", background: "#FFFFFF", borderRadius: 20, padding: 28, width: "100%", maxWidth: 580, maxHeight: "92vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
              <div>
                <h3 style={{ fontSize: 17, fontWeight: 800, color: "#111827", margin: 0 }}>{isEdit ? "Edit Content" : "Schedule Content"}</h3>
                {!isEdit && <p style={{ fontSize: 12, color: "#7A4B00", margin: "2px 0 0" }}>
                  {schedType === "shoot" ? "📹 Video Shoot Schedule" : schedType === "post" ? "📱 Post (Videos & Poster)" : "Choose what to schedule"}
                </p>}
              </div>
              <button onClick={() => setModalMode(null)} style={{ background: "none", border: "none", cursor: "pointer" }}><X size={18} color="#7A4B00" /></button>
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
                    <span style={{ fontSize: 11, color: "#7A4B00" }}>{opt.sub}</span>
                  </button>
                ))}
              </div>
            )}
            {!isEdit && schedType && (
              <button type="button" onClick={() => setSchedType("")}
                style={{ fontSize: 11, fontWeight: 700, color: "#7A4B00", background: "none", border: "none", cursor: "pointer", padding: "0 0 6px", textAlign: "left" }}>
                ← Change type
              </button>
            )}

            <form onSubmit={isEdit ? handleEdit : handleCreate} style={{ display: isEdit || schedType ? "flex" : "none", flexDirection: "column", gap: 16 }}>
              <div>
                <label style={LABEL}>Title *</label>
                <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Diwali Sale Reel" required style={FIELD} />
              </div>

              {(isEdit || schedType === "post") && !shootPickerOn && (
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
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {Object.entries(PRIORITY_CFG).map(([k, v]) => (
                    <button key={k} type="button" onClick={() => setPriority(k)}
                      style={{ padding: "6px 14px", borderRadius: 8, border: `1.5px solid ${priority === k ? v.color : "#E2E8F0"}`, background: priority === k ? v.bg : "#FAFAFA", color: priority === k ? v.color : "#718096", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                      {v.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label style={LABEL}>Date{!isEdit ? "s" : ""} * {!isEdit && <span style={{ fontWeight: 600, color: "#7A4B00", textTransform: "none" }}>— select one or more</span>}</label>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <input type="date" max="2099-12-31"
                    onChange={e => { const d = e.target.value; if (d) setSchedDates(p => isEdit ? [d] : (p.includes(d) ? p : [...p, d].sort())) }}
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

              {!shootPickerOn && (
                <div>
                  <label style={LABEL}>Post Time <span style={{ fontWeight: 600, color: "#7A4B00", textTransform: "none" }}>(optional)</span></label>
                  <input type="time" value={schedTime} onChange={e => setSchedTime(e.target.value)} style={FIELD} />
                </div>
              )}

              {shootPickerOn ? (
                <div>
                  <label style={LABEL}>Assign To <span style={{ fontWeight: 600, color: "#7A4B00", textTransform: "none" }}>(select all crew members)</span></label>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 6 }}>
                    {members.map(m => {
                      const sel = shootTeam.includes(m.id)
                      return (
                        <button key={m.id} type="button"
                          onClick={() => setShootTeam(prev => sel ? prev.filter(id => id !== m.id) : [...prev, m.id])}
                          style={{ padding: "6px 14px", borderRadius: 20, border: `1.5px solid ${sel ? "#DE1A1A" : "#E2E8F0"}`, background: sel ? "rgba(222,26,26,0.08)" : "#FAFAFA", color: sel ? "#DE1A1A" : "#7A4B00", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
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
                clientOptions={[...INTERNAL_BRANDS, ...clientOptions.filter(n => !INTERNAL_BRANDS.includes(n))]}
                pastClientOptions={pastClientOptions.filter(n => !INTERNAL_BRANDS.includes(n))}
                value={clientName} brand={clientBrand} customClient={clientCustom}
                onValueChange={v => { setClientName(v); setClientId("") }}
                onBrandChange={setClientBrand} onCustomChange={setClientCustom}
                label="Client"
                fieldStyle={{ ...FIELD, appearance: "none" as const }}
              />

              {shootPickerOn && (
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
                <label style={LABEL}>Instructions <span style={{ fontWeight: 600, color: "#7A4B00", textTransform: "none" }}>(optional)</span></label>
                <textarea value={instructions} onChange={e => setInstructions(e.target.value)} rows={3}
                  placeholder="Content guidelines, reminders, or instructions…"
                  style={{ ...FIELD, resize: "vertical", lineHeight: 1.5 }} />
              </div>

              {!isEdit && assignedTo && !shootPickerOn && (
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
                  style={{ flex: 1, padding: "12px", borderRadius: 10, border: "1px solid #E2E8F0", background: "#FAFAFA", fontSize: 13, fontWeight: 700, cursor: "pointer", color: "#7A4B00" }}>
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
