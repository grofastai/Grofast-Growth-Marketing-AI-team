"use client"

import { useState, useTransition, useMemo } from "react"
import { useRouter } from "next/navigation"
import {
  ChevronLeft, ChevronRight, ChevronDown, Camera, Clock,
  CheckCircle2, Plus, X, Loader2, Send,
} from "lucide-react"
import { updateContentPostStatus, createContentPost } from "@/lib/actions/content-calendar"

interface Post {
  id: string; title: string; platform: string; content_type: string
  client_name: string; scheduled_date: string; status: string
  assigned_to: string | null; drive_link: string | null
  content_pillar?: string | null; priority?: string | null
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
  pending:     { label: "Scheduled",   color: "#F59E0B", bg: "rgba(245,158,11,0.1)"  },
  in_progress: { label: "In Progress", color: "#3B82F6", bg: "rgba(59,130,246,0.1)"  },
  ready:       { label: "Ready",       color: "#8B5CF6", bg: "rgba(139,92,246,0.1)"  },
  posted:      { label: "Posted ✓",    color: "#10B981", bg: "rgba(16,185,129,0.1)"  },
  cancelled:   { label: "Cancelled",   color: "#EF4444", bg: "rgba(239,68,68,0.1)"   },
  missed:      { label: "Missed",      color: "#EF4444", bg: "rgba(239,68,68,0.08)"  },
}
const PRIORITY_CFG: Record<string, { label: string; color: string; bg: string }> = {
  low:    { label: "Low",    color: "#6B7280", bg: "rgba(107,114,128,0.1)" },
  medium: { label: "Medium", color: "#F59E0B", bg: "rgba(245,158,11,0.1)" },
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

export default function MemberContentCalendarClient({ posts: initial, shoots, tasks, members, clientNames, userId, initialYear, initialMonth }: Props) {
  const router = useRouter()
  const [posts, setPosts] = useState(initial)
  const [year, setYear]   = useState(initialYear)
  const [month, setMonth] = useState(initialMonth)
  const [view, setView]   = useState<"calendar" | "list">("calendar")
  const [filter, setFilter] = useState<"all" | "mine">("all")
  const [, start]           = useTransition()
  const [isPending, startCreate] = useTransition()

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
    return [...new Set([...clientNames, ...fromPosts])].sort()
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
    if (!post || post.assigned_to !== userId) return
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
        client_name: clientName || "Internal",
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

  return (
    <div className="p-4 md:p-6 xl:p-8" style={{ background: "#F5F6FA", minHeight: "100vh" }}>

      {/* ── Header ── */}
      <div style={{ background: "linear-gradient(135deg, #DE1A1A 0%, #9B1C1C 60%, #450A0A 100%)", borderRadius: 20, padding: "22px 28px", marginBottom: 24, boxShadow: "0 8px 32px rgba(222,26,26,0.25)" }}>
        <div className="flex items-center gap-4 flex-wrap">
          <div>
            <h1 className="text-[26px] font-black text-white">Content Calendar</h1>
            <p style={{ color: "rgba(255,255,255,0.6)", fontSize: 13, marginTop: 2 }}>Your scheduled posts, reels & shoots</p>
          </div>
          <div className="ml-auto flex items-center gap-3 flex-wrap">
            <button onClick={() => openAdd()}
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 20px", background: "#FFFFFF", color: "#DE1A1A", borderRadius: 12, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 800 }}>
              <Plus size={14} /> Add Content
            </button>
            <div className="flex rounded-xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.2)" }}>
              {(["all", "mine"] as const).map(f => (
                <button key={f} onClick={() => setFilter(f)}
                  style={{ padding: "8px 16px", fontSize: 12, fontWeight: 700, background: filter === f ? "rgba(255,255,255,0.2)" : "transparent", color: "#FFFFFF", border: "none", cursor: "pointer" }}>
                  {f === "all" ? "All Content" : "My Tasks"}
                </button>
              ))}
            </div>
            <div className="flex rounded-xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.2)" }}>
              {(["calendar","list"] as const).map(v => (
                <button key={v} onClick={() => setView(v)}
                  style={{ padding: "8px 16px", fontSize: 12, fontWeight: 700, background: view === v ? "rgba(255,255,255,0.2)" : "transparent", color: "#FFFFFF", border: "none", cursor: "pointer", textTransform: "capitalize" }}>
                  {v}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Stats ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        {[
          { label: "Total Content",  value: totalContent, color: "#3B82F6" },
          { label: "Ready To Post",  value: readyCount,   color: "#8B5CF6" },
          { label: "In Progress",    value: inProgCount,  color: "#F59E0B" },
          { label: "Posted",         value: postedCount,  color: "#10B981" },
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
              if (!day) return <div key={i} style={{ minHeight: 90, borderRight: i % 7 !== 6 ? "1px solid #F9FAFB" : "none", borderBottom: "1px solid #F9FAFB" }} />
              const ds        = dateStr(day)
              const dayPosts  = postsOnDay(day)
              const dayShoots = shootsOnDay(day)
              const dayTasks  = tasksOnDay(day)
              const isToday   = ds === today
              return (
                <div key={i} style={{ minHeight: 90, padding: "7px 5px", borderRight: i % 7 !== 6 ? "1px solid #F3F4F6" : "none", borderBottom: "1px solid #F3F4F6", background: isToday ? "rgba(222,26,26,0.03)" : "transparent" }}>
                  <span style={{ fontSize: 13, fontWeight: isToday ? 900 : 500, width: 24, height: 24, display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: "50%", background: isToday ? "#DE1A1A" : "transparent", color: isToday ? "#FFFFFF" : "#374151", marginBottom: 4 }}>{day}</span>
                  {dayShoots.map(s => (
                    <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 3, padding: "2px 5px", borderRadius: 4, background: "rgba(59,130,246,0.1)", marginBottom: 2 }}>
                      <Camera size={8} color="#3B82F6" />
                      <span style={{ fontSize: 9, fontWeight: 600, color: "#3B82F6", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.title || s.client}</span>
                    </div>
                  ))}
                  {dayTasks.map(t => (
                    <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 3, padding: "2px 5px", borderRadius: 4, background: "rgba(245,158,11,0.1)", marginBottom: 2 }}>
                      <Clock size={8} color="#F59E0B" />
                      <span style={{ fontSize: 9, fontWeight: 600, color: "#F59E0B", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title}</span>
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
            <span style={{ fontSize: 11, color: "#3B82F6", fontWeight: 600 }}>📷 Shoot</span>
            <span style={{ fontSize: 11, color: "#F59E0B", fontWeight: 600 }}>⏰ My Task</span>
            {PLATFORMS.slice(0, 4).map(p => (
              <span key={p.id} style={{ fontSize: 11, fontWeight: 600, color: p.color }}>● {p.label}</span>
            ))}
          </div>
        </div>
      ) : (
        <div style={{ background: "#FFFFFF", borderRadius: 20, border: "1px solid #E5E7EB", overflow: "hidden" }}>
          <div style={{ padding: "18px 24px", borderBottom: "1px solid #F3F4F6" }}>
            <h2 style={{ fontSize: 16, fontWeight: 800, color: "#111827", margin: 0 }}>
              {filter === "mine" ? "My Content Tasks" : "All Scheduled Content"} — {MONTHS[month]} {year}
            </h2>
          </div>
          {filteredPosts.length === 0 ? (
            <div style={{ padding: "60px 24px", textAlign: "center" }}>
              <p style={{ fontSize: 32, margin: "0 0 12px" }}>📭</p>
              <p style={{ fontSize: 14, fontWeight: 700, color: "#111827", margin: "0 0 6px" }}>No content scheduled</p>
              <p style={{ fontSize: 12, color: "#9CA3AF", margin: 0 }}>{filter === "mine" ? "No content assigned to you this month." : "Nothing scheduled for this month yet."}</p>
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
                        {p.content_pillar && <span style={{ marginLeft: 6, padding: "1px 6px", borderRadius: 8, background: "rgba(99,102,241,0.1)", color: "#6366F1", fontWeight: 700, fontSize: 10 }}>{p.content_pillar}</span>}
                      </p>
                    </div>
                    <span style={{ fontSize: 11, color: "#6B7280", whiteSpace: "nowrap", flexShrink: 0 }}>{p.scheduled_date}</span>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 8, background: priCfg.bg, color: priCfg.color, whiteSpace: "nowrap", flexShrink: 0 }}>{priCfg.label}</span>
                    {isMine ? (
                      <select value={p.status} onChange={e => handleStatusChange(p.id, e.target.value)}
                        style={{ fontSize: 11, fontWeight: 700, padding: "5px 10px", borderRadius: 8, border: `1.5px solid ${cfg.color}`, background: cfg.bg, color: cfg.color, cursor: "pointer", outline: "none", flexShrink: 0 }}>
                        {Object.entries(STATUS_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                      </select>
                    ) : (
                      <span style={{ fontSize: 11, fontWeight: 700, padding: "5px 10px", borderRadius: 8, background: cfg.bg, color: cfg.color, flexShrink: 0 }}>{cfg.label}</span>
                    )}
                  </div>
                )
              })}
            </div>
          )}
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
                  <select value={p.status} onChange={e => handleStatusChange(p.id, e.target.value)}
                    style={{ fontSize: 11, fontWeight: 700, padding: "5px 10px", borderRadius: 8, border: `1.5px solid ${cfg.color}`, background: cfg.bg, color: cfg.color, cursor: "pointer", outline: "none", flexShrink: 0 }}>
                    {Object.entries(STATUS_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
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
                style={{ flex: 2, padding: "12px", borderRadius: 10, border: "none", background: savingPostLink ? "#9CA3AF" : "#10B981", color: "#FFFFFF", fontSize: 13, fontWeight: 800, cursor: savingPostLink ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
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
                  { key: "shoot", emoji: "📹", label: "Video Shoot", sub: "Schedule a shoot session", color: "#6366F1", bg: "rgba(99,102,241,0.06)", border: "rgba(99,102,241,0.25)" },
                  { key: "post",  emoji: "📱", label: "Post",        sub: "Videos, Reels & Posters",  color: "#DE1A1A", bg: "rgba(222,26,26,0.06)",   border: "rgba(222,26,26,0.25)" },
                ].map(opt => (
                  <button key={opt.key} type="button"
                    onClick={() => { setSchedType(opt.key as "shoot" | "post"); setContentType(opt.key === "shoot" ? "shoot" : "post"); setPlatform(opt.key === "shoot" ? "offline" : "instagram") }}
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
                          style={{ padding: "5px 10px", borderRadius: 8, border: `1.5px solid ${contentPillar === cp ? "#6366F1" : "#E2E8F0"}`, background: contentPillar === cp ? "rgba(99,102,241,0.1)" : "#FAFAFA", color: contentPillar === cp ? "#6366F1" : "#718096", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
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
                  <label style={L}>Client</label>
                  <select value={clientName} onChange={e => setClientName(e.target.value)} style={F}>
                    <option value="">— Select client —</option>
                    {clientOptions.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
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
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", background: "rgba(16,185,129,0.08)", borderRadius: 8 }}>
                  <span style={{ fontSize: 12, color: "#10B981", fontWeight: 600 }}>✓ Content scheduled!</span>
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
