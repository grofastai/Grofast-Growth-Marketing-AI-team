"use client"

import { useState, useTransition, useMemo, useEffect } from "react"
import { useRouter } from "next/navigation"
import {
  ChevronLeft, ChevronRight, ChevronDown, Camera, Clock,
  CheckCircle2, Plus, X, Loader2, Send, Pencil, Trash2,
} from "lucide-react"
import { updateContentPostStatus, createContentPost, updateContentPost, deleteContentPost } from "@/lib/actions/content-calendar"
import ClientSelector, { resolveClientName, OWN_BRANDS } from "@/components/ui/ClientSelector"

interface Post {
  id: string; title: string; platform: string; content_type: string
  client_name: string; scheduled_date: string; status: string
  assigned_to: string | null; drive_link: string | null
  content_pillar?: string | null; priority?: string | null
  scheduled_time?: string | null; notes?: string | null
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
  const [view, setView]   = useState<"calendar" | "list">("calendar")
  const [filter] = useState<"all" | "mine">("mine")
  const [selectedDay, setSelectedDay] = useState(() => new Date().toISOString().split("T")[0])
  const [isMobile, setIsMobile] = useState(false)
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener("resize", check)
    return () => window.removeEventListener("resize", check)
  }, [])
  const [, start]           = useTransition()
  const [isPending, startCreate] = useTransition()

  // Client filter
  const [clientFilter, setClientFilter] = useState("all")

  // Create / Edit form
  const [showAdd, setShowAdd]         = useState(false)
  const [editingPost, setEditingPost] = useState<Post | null>(null)
  const [schedType, setSchedType]     = useState<"" | "shoot" | "post">("")
  const [schedDate, setSchedDate]     = useState("")
  const [schedTime, setSchedTime]     = useState("")
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
    setEditingPost(null)
    setSchedDate(date ?? new Date().toISOString().split("T")[0])
    setSchedTime("")
    setTitle(""); setPlatform("instagram"); setContentType("post")
    setClientName(""); setAssignedTo(""); setInstructions("")
    setContentPillar(""); setPriority("medium")
    setFormError(""); setFormSuccess(false)
    setSchedType(""); setShootFrom(""); setShootTo(""); setShootLocation("")
    setClientBrand(""); setClientCustom("")
    setShowAdd(true)
  }

  function openEdit(post: Post) {
    setEditingPost(post)
    setSchedDate(post.scheduled_date)
    setSchedTime(post.scheduled_time ?? "")
    setTitle(post.title); setPlatform(post.platform); setContentType(post.content_type)
    setClientName(post.client_name ?? ""); setAssignedTo(post.assigned_to ?? "")
    setInstructions(post.notes ?? ""); setContentPillar(post.content_pillar ?? "")
    setPriority(post.priority ?? "medium")
    setFormError(""); setFormSuccess(false)
    setSchedType("post"); setShootFrom(""); setShootTo(""); setShootLocation("")
    setClientBrand(""); setClientCustom("")
    setShowAdd(true)
  }

  function handleDelete(postId: string) {
    start(async () => {
      await deleteContentPost(postId)
      setPosts(prev => prev.filter(p => p.id !== postId))
    })
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) { setFormError("Title is required"); return }
    if (!schedDate)    { setFormError("Date is required");  return }
    setFormError("")

    if (editingPost) {
      startCreate(async () => {
        const res = await updateContentPost(editingPost.id, {
          title, platform, content_type: contentType,
          client_name: resolveClientName(clientName, clientBrand, clientCustom) || clientName || "Internal",
          scheduled_date: schedDate,
          scheduled_time: schedTime || null,
          assigned_to: assignedTo || userId,
          notes: instructions || undefined,
          content_pillar: contentPillar || null,
          priority: priority || "medium",
        })
        if (res.success) {
          setPosts(prev => prev.map(p => p.id === editingPost.id ? {
            ...p, title, platform, content_type: contentType,
            client_name: resolveClientName(clientName, clientBrand, clientCustom) || clientName || "Internal",
            scheduled_date: schedDate, scheduled_time: schedTime || null,
            assigned_to: assignedTo || userId,
            notes: instructions || null, content_pillar: contentPillar || null, priority,
          } : p))
          setFormSuccess(true); router.refresh()
          setTimeout(() => { setShowAdd(false); setFormSuccess(false); setEditingPost(null) }, 1000)
        } else { setFormError(res.error ?? "Something went wrong") }
      })
      return
    }

    startCreate(async () => {
      const shootMeta = schedType === "shoot" && (shootFrom || shootTo || shootLocation)
        ? `\nTime: ${shootFrom || "—"} → ${shootTo || "—"}${shootLocation ? `\nLocation: ${shootLocation}` : ""}`
        : ""
      const res = await createContentPost({
        title, platform, content_type: contentType,
        client_name: resolveClientName(clientName, clientBrand, clientCustom) || "Internal",
        scheduled_date: schedDate,
        scheduled_time: schedTime || null,
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
        {/* Radial glows */}
        <div style={{ position: "absolute", top: "50%", left: -60, transform: "translateY(-50%)", width: 320, height: 320, borderRadius: "50%", background: "radial-gradient(circle, rgba(255,80,80,0.18) 0%, transparent 65%)", pointerEvents: "none" }} />
        <div style={{ position: "absolute", top: "50%", right: -40, transform: "translateY(-50%)", width: 240, height: 240, borderRadius: "50%", background: "radial-gradient(circle, rgba(255,255,255,0.04) 0%, transparent 70%)", pointerEvents: "none" }} />

        {/* ── LEFT: badge + title + controls ── */}
        <div style={{ flex: 1, position: "relative", zIndex: 3, paddingTop: 28, paddingBottom: 28 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(255,255,255,0.18)", backdropFilter: "blur(8px)", borderRadius: 20, padding: "4px 12px 4px 8px", marginBottom: 10, border: "1px solid rgba(255,255,255,0.25)" }}>
            <span style={{ fontSize: 14 }}>⭐</span>
            <span style={{ fontSize: 11, fontWeight: 800, color: "#FFF", letterSpacing: "0.04em" }}>My Content</span>
          </div>
          <h1 style={{ fontSize: isMobile ? 22 : 36, fontWeight: 900, color: "#FFFFFF", margin: "0 0 4px", lineHeight: 1.1, textShadow: "0 2px 12px rgba(0,0,0,0.3)" }}>
            My Content
          </h1>
          <p style={{ color: "rgba(255,255,255,0.65)", fontSize: isMobile ? 11 : 13, margin: "0 0 20px", fontWeight: 500 }}>
            {new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button onClick={() => openAdd()}
              style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 20px", background: "rgba(255,255,255,0.22)", backdropFilter: "blur(8px)", color: "#FFF", borderRadius: 12, border: "1.5px solid rgba(255,255,255,0.35)", cursor: "pointer", fontSize: 12, fontWeight: 800, whiteSpace: "nowrap" }}>
              <Plus size={14} strokeWidth={3} /> Add Content
            </button>
            <div style={{ display: "flex", background: "rgba(0,0,0,0.25)", backdropFilter: "blur(8px)", borderRadius: 10, padding: 3, gap: 2, border: "1px solid rgba(255,255,255,0.12)" }}>
              {([
                { v: "calendar" as const, label: "📅 Calendar" },
                { v: "list"     as const, label: "☰ List"     },
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
                } as React.CSSProperties}>{label}</button>
              ))}
            </div>
          </div>
        </div>

        {/* ── CENTER: Character + greeting card ── */}
        <div style={{ position: "relative", zIndex: 3, display: isMobile ? "none" : "flex", alignItems: "flex-end", gap: 16, padding: "0 32px" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/content-cal-hero-girl.png" alt=""
            style={{ height: 160, width: "auto", objectFit: "contain", objectPosition: "bottom", flexShrink: 0, filter: "drop-shadow(0 6px 20px rgba(0,0,0,0.4))" }} />
          <div style={{ background: "rgba(255,255,255,0.12)", backdropFilter: "blur(12px)", borderRadius: 16, padding: "14px 18px", border: "1px solid rgba(255,255,255,0.2)", minWidth: 180, marginBottom: 16 }}>
            <p style={{ fontSize: 15, fontWeight: 800, color: "#FFF", margin: "0 0 4px" }}>Your schedule! 📅</p>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.65)", margin: 0 }}>What are you posting today?</p>
          </div>
        </div>

        {/* ── RIGHT: Glass stat cards ── */}
        <div style={{ display: isMobile ? "none" : "flex", gap: 12, position: "relative", zIndex: 3, flexShrink: 0 }}>
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
          <div style={{ background: "rgba(255,255,255,0.1)", backdropFilter: "blur(12px)", borderRadius: 18, padding: "16px 20px", textAlign: "center", border: "1px solid rgba(255,255,255,0.15)", minWidth: 90 }}>
            <p style={{ fontSize: 10, fontWeight: 800, color: "rgba(255,255,255,0.6)", margin: "0 0 2px", letterSpacing: "0.06em" }}>TOTAL</p>
            <p style={{ fontSize: 38, fontWeight: 900, color: "#FFFFFF", margin: "0 0 2px", lineHeight: 1 }}>{totalContent}</p>
            <p style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", margin: 0, fontWeight: 600 }}>Posts</p>
          </div>
          <div style={{ background: "rgba(255,255,255,0.1)", backdropFilter: "blur(12px)", borderRadius: 18, padding: "16px 20px", textAlign: "center", border: "1px solid rgba(255,255,255,0.15)", minWidth: 90 }}>
            <p style={{ fontSize: 10, fontWeight: 800, color: "rgba(255,255,255,0.6)", margin: "0 0 2px", letterSpacing: "0.06em" }}>POSTED</p>
            <p style={{ fontSize: 38, fontWeight: 900, color: "#FFFFFF", margin: "0 0 2px", lineHeight: 1 }}>{postedCount}</p>
            <p style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", margin: 0, fontWeight: 600 }}>Done ✓</p>
          </div>
        </div>
      </div>

      {/* ── Stats ── */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)", gap: isMobile ? 10 : 16, marginBottom: isMobile ? 14 : 24 }}>
        {[
          { label: "Total Content", value: totalContent, sub: "All time",  icon: "📄", headerBg: "linear-gradient(135deg,#8B0000 0%,#C41230 100%)", accent: "#DE1A1A", shadow: "rgba(139,0,0,0.22)" },
          { label: "Ready To Post", value: readyCount,   sub: "Scheduled", icon: "📤", headerBg: "linear-gradient(135deg,#1E3A8A 0%,#3B82F6 100%)", accent: "#3B82F6", shadow: "rgba(37,99,235,0.2)"  },
          { label: "In Progress",   value: inProgCount,  sub: "Creating",  icon: "⏳", headerBg: "linear-gradient(135deg,#92400E 0%,#F59E0B 100%)", accent: "#F59E0B", shadow: "rgba(146,64,14,0.2)"  },
          { label: "Posted",        value: postedCount,  sub: "Published", icon: "✅", headerBg: "linear-gradient(135deg,#14532D 0%,#22C55E 100%)", accent: "#22C55E", shadow: "rgba(20,83,45,0.2)"   },
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

        {/* ── LEFT: Calendar OR full list ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Calendar / List card */}
          <div style={{ background: "#FFFFFF", borderRadius: 20, border: "1px solid #E5E7EB", overflow: "hidden" }}>

            {/* Toolbar */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", borderBottom: "1px solid #F3F4F6", flexWrap: "wrap", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <button onClick={prevMonth} style={{ width: 30, height: 30, borderRadius: 8, border: "1px solid #E5E7EB", background: "#FAFAFA", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <ChevronLeft size={13} color="#6B7280" />
                </button>
                <button onClick={() => { setYear(initialYear); setMonth(initialMonth); setSelectedDay(today) }}
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
                <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}>
                  {DAYS.map(d => (
                    <div key={d} style={{ padding: "8px 0", textAlign: "center", fontSize: 10, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.07em", borderBottom: "1px solid #F3F4F6" }}>{d}</div>
                  ))}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}>
                  {cells.map((day, i) => {
                    if (!day) return <div key={i} style={{ minHeight: isMobile ? 52 : 95, borderRight: i % 7 !== 6 ? "1px solid #F3F4F6" : "none", borderBottom: "1px solid #F3F4F6", background: "#FAFAFA" }} />
                    const ds         = dateStr(day)
                    const dayPosts   = postsOnDay(day)
                    const dayShoots  = shootsOnDay(day)
                    const dayTasks   = tasksOnDay(day)
                    const isToday    = ds === today
                    const isSelected = ds === selectedDay
                    const total      = dayPosts.length + dayShoots.length + dayTasks.length
                    const visible    = [...dayShoots.map(s => ({ id: s.id, color: "#4D8CFF", label: s.title || s.client })), ...dayTasks.map(t => ({ id: t.id, color: "#FFA53A", label: t.title })), ...dayPosts.map(p => ({ id: p.id, color: platformColor(p.platform), label: p.title }))]
                    const shown      = visible.slice(0, 2)
                    const more       = total - shown.length
                    return (
                      <div key={i} onClick={() => setSelectedDay(ds)} style={{
                        minHeight: isMobile ? 52 : 95, padding: isMobile ? "5px 4px" : "7px 6px", cursor: "pointer",
                        borderRight: i % 7 !== 6 ? "1px solid #F3F4F6" : "none",
                        borderBottom: "1px solid #F3F4F6",
                        background: isSelected ? "rgba(222,26,26,0.06)" : isToday ? "rgba(222,26,26,0.025)" : "transparent",
                        outline: isSelected ? "2px solid rgba(222,26,26,0.25)" : "none",
                        outlineOffset: -1, transition: "background 0.12s",
                      }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: isMobile ? 3 : 4 }}>
                          <span style={{ fontSize: isMobile ? 10 : 12, fontWeight: isToday ? 900 : 500, width: isMobile ? 18 : 22, height: isMobile ? 18 : 22, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "50%", background: isToday ? "#DE1A1A" : "transparent", color: isToday ? "#FFF" : isSelected ? "#DE1A1A" : "#374151" }}>
                            {day}
                          </span>
                          {total > 0 && <span style={{ fontSize: 9, fontWeight: 700, color: "#DE1A1A", background: "rgba(222,26,26,0.1)", borderRadius: 5, padding: "1px 4px" }}>{total}</span>}
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
                        {!isMobile && more > 0 && <span style={{ fontSize: 9, fontWeight: 700, color: "#9CA3AF", paddingLeft: 5 }}>+{more} more</span>}
                      </div>
                    )
                  })}
                </div>
                <div style={{ padding: "10px 18px", borderTop: "1px solid #F3F4F6", display: "flex", gap: 14, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 10, color: "#6B7280", fontWeight: 600 }}>Legend:</span>
                  <span style={{ fontSize: 10, color: "#4D8CFF", fontWeight: 600 }}>📷 Shoot</span>
                  <span style={{ fontSize: 10, color: "#FFA53A", fontWeight: 600 }}>⏰ My Task</span>
                  {PLATFORMS.slice(0, 4).map(p => (
                    <span key={p.id} style={{ fontSize: 10, fontWeight: 600, color: p.color }}>● {p.label}</span>
                  ))}
                </div>
              </>
            ) : (
              <div>
                <div style={{ padding: "14px 18px", borderBottom: "1px solid #F3F4F6" }}>
                  <h2 style={{ fontSize: 14, fontWeight: 800, color: "#111827", margin: 0 }}>My Content — {MONTHS[month]} {year}</h2>
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
                      const pColor = platformColor(p.platform)
                      return (
                        <div key={p.id} style={{ padding: "12px 18px", borderBottom: i < filteredPosts.length - 1 ? "1px solid #F9FAFB" : "none", background: isMine ? "rgba(222,26,26,0.02)" : "transparent" }}>
                          {/* Top row: icon + title + date + priority + status */}
                          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                            <div style={{ width: 38, height: 38, borderRadius: 11, background: `${pColor}15`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 19 }}>
                              {platformEmoji(p.platform)}
                            </div>
                            <div style={{ flex: 1, minWidth: 100 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                                <p style={{ fontSize: 13, fontWeight: 700, color: "#111827", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.title}</p>
                                {isMine && <span style={{ fontSize: 9, fontWeight: 800, padding: "1px 6px", borderRadius: 99, background: "rgba(222,26,26,0.1)", color: "#DE1A1A", flexShrink: 0 }}>MINE</span>}
                              </div>
                              <p style={{ fontSize: 11, color: "#6B7280", margin: 0 }}>{platformLabel(p.platform)} · {p.client_name} · {p.scheduled_date}</p>
                            </div>
                            <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 8, background: priCfg.bg, color: priCfg.color, whiteSpace: "nowrap", flexShrink: 0 }}>{priCfg.label}</span>
                            <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 8, background: cfg.bg, color: cfg.color, whiteSpace: "nowrap", flexShrink: 0 }}>{cfg.label}</span>
                          </div>
                          {/* Action row: Edit + Delete + Mark as Posted */}
                          <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                            <button onClick={() => openEdit(p)}
                              style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 14px", borderRadius: 9, border: "1.5px solid rgba(155,107,255,0.35)", background: "rgba(155,107,255,0.07)", color: "#9B6BFF", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                              <Pencil size={11} /> Edit
                            </button>
                            <button onClick={() => handleDelete(p.id)}
                              style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 14px", borderRadius: 9, border: "1.5px solid rgba(239,68,68,0.3)", background: "rgba(239,68,68,0.06)", color: "#EF4444", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                              <Trash2 size={11} /> Delete
                            </button>
                            {p.status === "posted" ? (
                              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                                <span style={{ fontSize: 11, fontWeight: 800, padding: "5px 10px", borderRadius: 8, background: "rgba(50,210,122,0.1)", color: "#32D27A", display: "flex", alignItems: "center", gap: 4 }}>
                                  <CheckCircle2 size={12} /> Posted ✓
                                </span>
                                <button onClick={() => handleStatusChange(p.id, "pending")} style={{ fontSize: 10, fontWeight: 700, padding: "5px 8px", borderRadius: 8, border: "1.5px solid #E5E7EB", background: "#F9FAFB", color: "#6B7280", cursor: "pointer" }}>Undo</button>
                              </div>
                            ) : (
                              <button onClick={() => handleStatusChange(p.id, "posted")}
                                style={{ fontSize: 11, fontWeight: 800, padding: "6px 14px", borderRadius: 9, border: "none", background: "linear-gradient(135deg,#32D27A,#22B36A)", color: "#FFF", cursor: "pointer", display: "flex", alignItems: "center", gap: 5 }}>
                                <CheckCircle2 size={12} /> Mark as Posted
                              </button>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Quick Actions */}
          <div style={{
            background: "linear-gradient(135deg, #0D0D0D 0%, #1A0000 45%, #3D0000 100%)",
            borderRadius: 20, padding: "18px 20px",
            border: "1px solid rgba(222,26,26,0.25)",
            boxShadow: "0 8px 32px rgba(0,0,0,0.25)",
            position: "relative", overflow: "hidden",
          }}>
            {/* Background glow */}
            <div style={{ position: "absolute", top: -30, right: -30, width: 160, height: 160, borderRadius: "50%", background: "radial-gradient(circle, rgba(222,26,26,0.2) 0%, transparent 70%)", pointerEvents: "none" }} />
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14, position: "relative", zIndex: 1 }}>
              <span style={{ fontSize: 14 }}>⚡</span>
              <h3 style={{ fontSize: 13, fontWeight: 900, color: "#FFFFFF", margin: 0, letterSpacing: "0.03em" }}>Quick Actions</h3>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)", gap: 10, position: "relative", zIndex: 1 }}>
              {[
                {
                  icon: "✏️", label: "Create Post",  sub: "Schedule now",
                  gradient: "linear-gradient(135deg, #DE1A1A 0%, #8B0000 100%)",
                  shadow: "rgba(222,26,26,0.45)",
                  action: () => openAdd(selectedDay),
                },
                {
                  icon: "📋", label: "View All",     sub: "List view",
                  gradient: "linear-gradient(135deg, #1E1E2E 0%, #2D2D44 100%)",
                  shadow: "rgba(0,0,0,0.4)",
                  action: () => setView("list"),
                },
                {
                  icon: "✅", label: "Mark Posted",  sub: "Update status",
                  gradient: "linear-gradient(135deg, #16A34A 0%, #22C55E 100%)",
                  shadow: "rgba(22,163,74,0.4)",
                  action: () => setView("list"),
                },
                {
                  icon: "📅", label: "Calendar",     sub: "Monthly view",
                  gradient: "linear-gradient(135deg, #7C3AED 0%, #9B6BFF 100%)",
                  shadow: "rgba(124,58,237,0.4)",
                  action: () => setView("calendar"),
                },
              ].map(a => (
                <button key={a.label} onClick={a.action} style={{
                  padding: isMobile ? "12px 10px" : "14px 12px",
                  borderRadius: 14, background: a.gradient,
                  border: "none", cursor: "pointer", textAlign: "left",
                  display: "flex", flexDirection: "column", gap: 8,
                  boxShadow: `0 4px 20px ${a.shadow}`,
                  transition: "opacity 0.15s",
                }}>
                  <span style={{ fontSize: isMobile ? 20 : 24 }}>{a.icon}</span>
                  <div>
                    <p style={{ fontSize: 11, fontWeight: 800, color: "#FFFFFF", margin: 0 }}>{a.label}</p>
                    <p style={{ fontSize: 10, color: "rgba(255,255,255,0.6)", margin: "2px 0 0" }}>{a.sub}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── RIGHT: Day Detail Panel (calendar view) ── */}
        {view === "calendar" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14, ...(isMobile ? {} : { position: "sticky", top: 24 }) }}>

            {/* Day header + posts */}
            <div style={{ background: "#FFFFFF", borderRadius: 20, border: "1px solid #E5E7EB", overflow: "hidden" }}>
              <div style={{ background: "linear-gradient(135deg, #8B0000 0%, #C41230 55%, #DE1A1A 100%)", padding: "18px 20px", position: "relative", overflow: "hidden" }}>
                <div style={{ position: "absolute", top: -24, right: -24, width: 90, height: 90, borderRadius: "50%", background: "rgba(255,255,255,0.1)", pointerEvents: "none" }} />
                <p style={{ fontSize: 10, fontWeight: 800, color: "rgba(255,255,255,0.65)", margin: "0 0 2px", letterSpacing: "0.12em" }}>
                  {selectedDay === today ? "TODAY" : "SELECTED DATE"}
                </p>
                <h3 style={{ fontSize: 17, fontWeight: 900, color: "#FFFFFF", margin: "0 0 14px", lineHeight: 1.2 }}>
                  {new Date(selectedDay + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
                </h3>
                <button onClick={() => openAdd(selectedDay)}
                  style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 14px", background: "rgba(255,255,255,0.18)", backdropFilter: "blur(6px)", color: "#FFF", borderRadius: 10, border: "1px solid rgba(255,255,255,0.3)", cursor: "pointer", fontSize: 12, fontWeight: 700 }}>
                  <Plus size={12} strokeWidth={3} /> Add Post
                </button>
              </div>

              {(() => {
                const selectedDateNum = new Date(selectedDay + "T12:00:00").getDate()
                const isInCurrentMonth = selectedDay.startsWith(`${year}-${String(month + 1).padStart(2, "0")}`)
                const dayPosts   = isInCurrentMonth ? postsOnDay(selectedDateNum) : filteredPosts.filter(p => p.scheduled_date === selectedDay)
                const dayShoots  = shoots.filter(s => s.start_time.split("T")[0] === selectedDay)
                const dayTasks   = tasks.filter(t => t.due_date === selectedDay)
                const total      = dayPosts.length + dayShoots.length + dayTasks.length

                if (total === 0) return (
                  <div style={{ padding: "28px 20px", textAlign: "center" }}>
                    <div style={{ fontSize: 30, marginBottom: 8 }}>📭</div>
                    <p style={{ fontSize: 13, color: "#9CA3AF", margin: "0 0 4px", fontWeight: 600 }}>No content scheduled</p>
                    <p style={{ fontSize: 11, color: "#D1D5DB", margin: 0 }}>Click Add Post to schedule something</p>
                  </div>
                )
                return (
                  <div style={{ maxHeight: 380, overflowY: "auto" }}>
                    {dayShoots.map(s => (
                      <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 20px", borderBottom: "1px solid #F9FAFB" }}>
                        <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(77,140,255,0.12)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                          <Camera size={16} color="#4D8CFF" />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontSize: 13, fontWeight: 700, color: "#111827", margin: 0 }}>{s.title || s.client}</p>
                          <p style={{ fontSize: 11, color: "#4D8CFF", margin: "2px 0 0", fontWeight: 600 }}>📹 Video Shoot</p>
                        </div>
                      </div>
                    ))}
                    {dayTasks.map(t => (
                      <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 20px", borderBottom: "1px solid #F9FAFB" }}>
                        <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(255,165,58,0.12)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                          <Clock size={16} color="#FFA53A" />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontSize: 13, fontWeight: 700, color: "#111827", margin: 0 }}>{t.title}</p>
                          <p style={{ fontSize: 11, color: "#D97706", margin: "2px 0 0", fontWeight: 600 }}>⏰ Task due</p>
                        </div>
                      </div>
                    ))}
                    {dayPosts.map(p => {
                      const pColor   = platformColor(p.platform)
                      const cfg      = STATUS_CFG[p.status] ?? STATUS_CFG.pending
                      const isPosted = p.status === "posted"
                      return (
                        <div key={p.id} style={{ padding: "12px 20px", borderBottom: "1px solid #F3F4F6" }}>
                          {/* Info row */}
                          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                            <div style={{ width: 36, height: 36, borderRadius: 10, background: `${pColor}18`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, flexShrink: 0 }}>
                              {platformEmoji(p.platform)}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <p style={{ fontSize: 13, fontWeight: 700, color: "#111827", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.title}</p>
                              <p style={{ fontSize: 11, color: "#9CA3AF", margin: "2px 0 0" }}>{platformLabel(p.platform)}{p.client_name ? ` · ${p.client_name}` : ""}</p>
                            </div>
                            <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 6, background: cfg.bg, color: cfg.color, whiteSpace: "nowrap", flexShrink: 0 }}>{cfg.label}</span>
                          </div>
                          {/* Action buttons */}
                          <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                            <button onClick={() => openEdit(p)}
                              style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 5, padding: "7px 0", borderRadius: 9, border: "1.5px solid rgba(155,107,255,0.35)", background: "rgba(155,107,255,0.07)", color: "#9B6BFF", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                              <Pencil size={12} /> Edit
                            </button>
                            <button onClick={() => handleDelete(p.id)}
                              style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 5, padding: "7px 0", borderRadius: 9, border: "1.5px solid rgba(239,68,68,0.3)", background: "rgba(239,68,68,0.06)", color: "#EF4444", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                              <Trash2 size={12} /> Delete
                            </button>
                          </div>
                          {/* Posted status row */}
                          {!isPosted ? (
                            <button onClick={() => handleStatusChange(p.id, "posted")}
                              style={{ width: "100%", padding: "8px 0", borderRadius: 10, border: "none", background: "linear-gradient(135deg,#32D27A,#22B36A)", color: "#FFF", fontSize: 12, fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                              <CheckCircle2 size={13} /> Mark as Posted
                            </button>
                          ) : (
                            <div style={{ display: "flex", gap: 8 }}>
                              <div style={{ flex: 1, padding: "8px 0", borderRadius: 10, background: "rgba(50,210,122,0.1)", border: "1.5px solid rgba(50,210,122,0.3)", color: "#32D27A", fontSize: 12, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}>
                                <CheckCircle2 size={13} /> Posted ✓
                              </div>
                              <button onClick={() => handleStatusChange(p.id, "pending")} style={{ padding: "8px 12px", borderRadius: 10, border: "1.5px solid #E5E7EB", background: "#F9FAFB", color: "#6B7280", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>Undo</button>
                            </div>
                          )}
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
                    const pColor = platformColor(p.platform)
                    return (
                      <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 18px", borderBottom: "1px solid #F9FAFB" }}>
                        <div style={{ width: 30, height: 30, borderRadius: 8, background: `${pColor}18`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, flexShrink: 0 }}>
                          {platformEmoji(p.platform)}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontSize: 12, fontWeight: 700, color: "#111827", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.title}</p>
                          <p style={{ fontSize: 10, color: "#9CA3AF", margin: "1px 0 0" }}>{p.scheduled_date === today ? "Today" : p.scheduled_date.slice(5)}</p>
                        </div>
                        <span style={{ width: 7, height: 7, borderRadius: "50%", background: pColor, flexShrink: 0 }} />
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Motivational card */}
            <div style={{ background: "linear-gradient(135deg, #1A0000 0%, #5B0000 50%, #8B0000 100%)", borderRadius: 20, padding: "20px 18px 0", position: "relative", overflow: "hidden", minHeight: 155, border: "1px solid rgba(222,26,26,0.3)", boxShadow: "0 8px 32px rgba(90,0,0,0.4)" }}>
              <div style={{ position: "absolute", top: -30, right: -30, width: 110, height: 110, borderRadius: "50%", background: "radial-gradient(circle,rgba(255,75,75,0.3) 0%,transparent 70%)", pointerEvents: "none" }} />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brand/content-cal-boy-sidebar.png" alt=""
                style={{ position: "absolute", right: -4, bottom: 0, height: 140, objectFit: "contain", filter: "drop-shadow(0 4px 12px rgba(0,0,0,0.4))" }} />
              <div style={{ paddingRight: 130, paddingBottom: 20, position: "relative", zIndex: 1 }}>
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
                <h3 style={{ fontSize: 17, fontWeight: 800, color: "#111827", margin: 0 }}>
                  {editingPost ? "Edit Content" : "Schedule Content"}
                </h3>
                <p style={{ fontSize: 12, color: "#6B7280", margin: "2px 0 0" }}>
                  {editingPost ? "Update post details" : schedType === "shoot" ? "📹 Video Shoot Schedule" : schedType === "post" ? "📱 Post (Videos & Poster)" : "Choose what to schedule"}
                </p>
              </div>
              <button onClick={() => { setShowAdd(false); setEditingPost(null) }} style={{ background: "none", border: "none", cursor: "pointer" }}><X size={18} color="#6B7280" /></button>
            </div>

            {/* ── Type picker (new posts only) ── */}
            {!schedType && !editingPost && (
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

            {schedType && !editingPost && <button type="button" onClick={() => setSchedType("")}
              style={{ fontSize: 11, fontWeight: 700, color: "#9CA3AF", background: "none", border: "none", cursor: "pointer", padding: "0 0 10px", textAlign: "left" }}>
              ← Change type
            </button>}

            <form onSubmit={handleCreate} style={{ display: (schedType || editingPost) ? "flex" : "none", flexDirection: "column", gap: 14 }}>
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
                  <label style={L}>Time <span style={{ color: "#9CA3AF", fontWeight: 400 }}>(optional)</span></label>
                  <input type="time" value={schedTime} onChange={e => setSchedTime(e.target.value)} style={F} />
                </div>
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
