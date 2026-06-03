"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  ChevronLeft, ChevronRight, Camera, Clock,
  CheckCircle2, Plus, X, Loader2, Send,
} from "lucide-react"
import { updateContentPostStatus, createContentPost } from "@/lib/actions/content-calendar"

interface Post {
  id: string; title: string; platform: string; content_type: string
  client_name: string; scheduled_date: string; status: string
  assigned_to: string | null; drive_link: string | null
  assignee?: { name: string } | null
}
interface Shoot { id: string; title: string; start_time: string; client: string; status: string }
interface Task  { id: string; title: string; due_date: string; status: string }

interface Props {
  posts: Post[]; shoots: Shoot[]; tasks: Task[]
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
  pending:     { label: "Pending",     color: "#F59E0B", bg: "rgba(245,158,11,0.1)" },
  in_progress: { label: "In Progress", color: "#3B82F6", bg: "rgba(59,130,246,0.1)" },
  ready:       { label: "Ready",       color: "#8B5CF6", bg: "rgba(139,92,246,0.1)" },
  posted:      { label: "Posted ✓",    color: "#10B981", bg: "rgba(16,185,129,0.1)" },
  cancelled:   { label: "Cancelled",   color: "#EF4444", bg: "rgba(239,68,68,0.1)"  },
}
const CONTENT_TYPES = ["post", "reel", "video", "story", "carousel", "other"]
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"]
const DAYS   = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"]

function platformColor(p: string) { return PLATFORMS.find(x => x.id === p)?.color ?? "#6B7280" }
function platformLabel(p: string) { return PLATFORMS.find(x => x.id === p)?.label ?? p }
function platformEmoji(p: string) { return PLATFORMS.find(x => x.id === p)?.emoji ?? "📱" }

export default function MemberContentCalendarClient({ posts: initial, shoots, tasks, userId, initialYear, initialMonth }: Props) {
  const router = useRouter()
  const [posts, setPosts] = useState(initial)
  const [year, setYear]   = useState(initialYear)
  const [month, setMonth] = useState(initialMonth)
  const [view, setView]   = useState<"calendar" | "list">("calendar")
  const [filter, setFilter] = useState<"all" | "mine">("all")
  const [, start]      = useTransition()
  const [isPending, startCreate] = useTransition()

  // Create form state
  const [showAdd, setShowAdd]       = useState(false)
  const [schedDate, setSchedDate]   = useState("")
  const [title, setTitle]           = useState("")
  const [platform, setPlatform]     = useState("instagram")
  const [contentType, setContentType] = useState("post")
  const [clientName, setClientName] = useState("")
  const [driveLink, setDriveLink]   = useState("")
  const [caption, setCaption]       = useState("")
  const [formError, setFormError]   = useState("")
  const [formSuccess, setFormSuccess] = useState(false)

  const firstDay  = new Date(year, month, 1).getDay()
  const daysCount = new Date(year, month + 1, 0).getDate()
  const cells     = Array.from({ length: firstDay + daysCount }, (_, i) => i < firstDay ? null : i - firstDay + 1)
  while (cells.length % 7 !== 0) cells.push(null)

  function prevMonth() { if (month === 0) { setYear(y => y - 1); setMonth(11) } else setMonth(m => m - 1) }
  function nextMonth() { if (month === 11) { setYear(y => y + 1); setMonth(0) } else setMonth(m => m + 1) }
  function dateStr(d: number) { return `${year}-${String(month + 1).padStart(2,"0")}-${String(d).padStart(2,"0")}` }

  const filteredPosts = filter === "mine" ? posts.filter(p => p.assigned_to === userId) : posts

  function postsOnDay(d: number) { const ds = dateStr(d); return filteredPosts.filter(p => p.scheduled_date === ds) }
  function shootsOnDay(d: number) { const ds = dateStr(d); return shoots.filter(s => s.start_time.split("T")[0] === ds) }
  function tasksOnDay(d: number) { const ds = dateStr(d); return tasks.filter(t => t.due_date === ds) }

  function handleStatusChange(postId: string, status: string) {
    const post = posts.find(p => p.id === postId)
    if (!post || post.assigned_to !== userId) return
    start(async () => {
      await updateContentPostStatus(postId, status as "posted")
      setPosts(prev => prev.map(p => p.id === postId ? { ...p, status } : p))
      router.refresh()
    })
  }

  function openAdd(date?: string) {
    setSchedDate(date ?? new Date().toISOString().split("T")[0])
    setTitle(""); setPlatform("instagram"); setContentType("post")
    setClientName(""); setDriveLink(""); setCaption("")
    setFormError(""); setFormSuccess(false)
    setShowAdd(true)
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) { setFormError("Title is required"); return }
    if (!schedDate)    { setFormError("Date is required");  return }
    setFormError("")
    startCreate(async () => {
      const res = await createContentPost({
        title, platform, content_type: contentType,
        client_name: clientName || "Internal",
        scheduled_date: schedDate,
        assigned_to: userId,
        drive_link: driveLink || undefined,
        caption: caption || undefined,
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

  const today      = new Date().toISOString().split("T")[0]
  const myPosts    = posts.filter(p => p.assigned_to === userId)
  const postedCount  = myPosts.filter(p => p.status === "posted").length
  const pendingCount = myPosts.filter(p => p.status === "pending" || p.status === "in_progress").length
  const totalCount   = filteredPosts.length

  return (
    <div className="p-4 md:p-6 xl:p-8" style={{ background: "#F5F6FA", minHeight: "100vh" }}>

      {/* ── Header ── */}
      <div style={{ background: "linear-gradient(135deg, #DE1A1A 0%, #9B1C1C 60%, #450A0A 100%)", borderRadius: 20, padding: "22px 28px", marginBottom: 24, boxShadow: "0 8px 32px rgba(222,26,26,0.25)" }}>
        <div className="flex items-center gap-4 flex-wrap">
          <div>
            <h1 className="text-[26px] font-black text-white">Content Calendar</h1>
            <p style={{ color: "rgba(255,255,255,0.6)", fontSize: 13, marginTop: 2 }}>Your scheduled posts, reels & shoots</p>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <button onClick={() => openAdd()}
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 20px", background: "#FFFFFF", color: "#DE1A1A", borderRadius: 12, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 800 }}>
              <Plus size={14} /> Add Content
            </button>
            {/* Filter toggle */}
            <div className="flex rounded-xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.2)" }}>
              {(["all", "mine"] as const).map(f => (
                <button key={f} onClick={() => setFilter(f)}
                  style={{ padding: "8px 16px", fontSize: 12, fontWeight: 700, background: filter === f ? "rgba(255,255,255,0.2)" : "transparent", color: "#FFFFFF", border: "none", cursor: "pointer" }}>
                  {f === "all" ? "All Content" : "My Tasks"}
                </button>
              ))}
            </div>
            {/* View toggle */}
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
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: "Scheduled This Month", value: totalCount,   color: "#3B82F6" },
          { label: "My Completed",         value: postedCount,  color: "#10B981" },
          { label: "My Pending",           value: pendingCount, color: "#F59E0B" },
        ].map(s => (
          <div key={s.label} style={{ background: "#FFFFFF", borderRadius: 16, padding: "18px 20px", border: "1px solid #E5E7EB" }}>
            <p style={{ fontSize: 32, fontWeight: 900, color: s.color, margin: 0 }}>{s.value}</p>
            <p style={{ fontSize: 12, color: "#6B7280", margin: "4px 0 0", fontWeight: 600 }}>{s.label}</p>
          </div>
        ))}
      </div>

      {/* ── Calendar / List ── */}
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
              if (!day) return <div key={i} style={{ minHeight: 90, borderRight: i % 7 !== 6 ? "1px solid #F9FAFB" : "none", borderBottom: "1px solid #F9FAFB" }} />
              const ds        = dateStr(day)
              const dayPosts  = postsOnDay(day)
              const dayShoots = shootsOnDay(day)
              const dayTasks  = tasksOnDay(day)
              const isToday   = ds === today
              return (
                <div key={i} style={{ minHeight: 90, padding: "7px 5px", borderRight: i % 7 !== 6 ? "1px solid #F3F4F6" : "none", borderBottom: "1px solid #F3F4F6", background: isToday ? "rgba(222,26,26,0.03)" : "transparent" }}>
                  <span style={{
                    fontSize: 13, fontWeight: isToday ? 900 : 500, lineHeight: 1,
                    width: 24, height: 24, display: "inline-flex", alignItems: "center", justifyContent: "center",
                    borderRadius: "50%", background: isToday ? "#DE1A1A" : "transparent",
                    color: isToday ? "#FFFFFF" : "#374151", marginBottom: 4,
                  }}>{day}</span>

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
                    return (
                      <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 3, padding: "2px 5px", borderRadius: 4, marginBottom: 2, background: `${platformColor(p.platform)}18`, border: isMine ? `1px solid ${platformColor(p.platform)}40` : "none" }}>
                        <span style={{ width: 5, height: 5, borderRadius: "50%", background: platformColor(p.platform), flexShrink: 0 }} />
                        <span style={{ fontSize: 9, fontWeight: 600, color: platformColor(p.platform), overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.title}</span>
                        {isMine && <span style={{ fontSize: 7, fontWeight: 800, color: platformColor(p.platform), marginLeft: "auto", flexShrink: 0 }}>YOU</span>}
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>

          {/* Legend */}
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
        /* ── List view ── */
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
              <p style={{ fontSize: 12, color: "#9CA3AF", margin: 0 }}>
                {filter === "mine" ? "No content assigned to you this month." : "Nothing scheduled for this month yet."}
              </p>
            </div>
          ) : (
            <div>
              {filteredPosts.map((p, i) => {
                const cfg    = STATUS_CFG[p.status] ?? STATUS_CFG.pending
                const isMine = p.assigned_to === userId
                return (
                  <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 24px", borderBottom: i < filteredPosts.length - 1 ? "1px solid #F9FAFB" : "none", background: isMine ? "rgba(222,26,26,0.02)" : "transparent" }}>
                    <div style={{ width: 40, height: 40, borderRadius: 12, background: `${platformColor(p.platform)}15`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 20 }}>
                      {platformEmoji(p.platform)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                        <p style={{ fontSize: 13, fontWeight: 700, color: "#111827", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.title}</p>
                        {isMine && (
                          <span style={{ fontSize: 9, fontWeight: 800, padding: "1px 6px", borderRadius: 99, background: "rgba(222,26,26,0.1)", color: "#DE1A1A", flexShrink: 0 }}>MINE</span>
                        )}
                      </div>
                      <p style={{ fontSize: 11, color: "#6B7280", margin: 0 }}>
                        {platformLabel(p.platform)} · {p.client_name}
                        {p.assignee?.name ? ` · ${p.assignee.name}` : ""}
                      </p>
                    </div>
                    <span style={{ fontSize: 11, color: "#6B7280", whiteSpace: "nowrap", flexShrink: 0 }}>{p.scheduled_date}</span>

                    {/* Drive link */}
                    {p.drive_link && (
                      <a href={p.drive_link} target="_blank" rel="noopener noreferrer"
                        style={{ fontSize: 11, fontWeight: 700, color: "#3B82F6", textDecoration: "none", flexShrink: 0 }}>
                        🔗 Drive
                      </a>
                    )}

                    {/* Status: dropdown only for my posts, badge for others */}
                    {isMine ? (
                      <select value={p.status} onChange={e => handleStatusChange(p.id, e.target.value)}
                        style={{ fontSize: 11, fontWeight: 700, padding: "5px 10px", borderRadius: 8, border: `1.5px solid ${cfg.color}`, background: cfg.bg, color: cfg.color, cursor: "pointer", outline: "none", flexShrink: 0 }}>
                        {Object.entries(STATUS_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                      </select>
                    ) : (
                      <span style={{ fontSize: 11, fontWeight: 700, padding: "5px 10px", borderRadius: 8, background: cfg.bg, color: cfg.color, flexShrink: 0 }}>
                        {cfg.label}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── My Upcoming ── */}
      {myPosts.filter(p => p.status !== "posted" && p.status !== "cancelled").length > 0 && (
        <div style={{ marginTop: 20, background: "#FFFFFF", borderRadius: 20, border: "1px solid #E5E7EB", overflow: "hidden" }}>
          <div style={{ padding: "16px 24px", borderBottom: "1px solid #F3F4F6", display: "flex", alignItems: "center", gap: 8 }}>
            <CheckCircle2 size={16} style={{ color: "#DE1A1A" }} />
            <h3 style={{ fontSize: 14, fontWeight: 800, color: "#111827", margin: 0 }}>My Pending Content</h3>
          </div>
          <div>
            {myPosts
              .filter(p => p.status !== "posted" && p.status !== "cancelled")
              .map((p, i, arr) => {
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
                    {p.drive_link && (
                      <a href={p.drive_link} target="_blank" rel="noopener noreferrer"
                        style={{ fontSize: 11, fontWeight: 700, color: "#3B82F6", textDecoration: "none", flexShrink: 0 }}>
                        🔗 Drive
                      </a>
                    )}
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

      {/* ── Add Content Modal ── */}
      {showAdd && (
        <div style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)" }} onClick={() => setShowAdd(false)} />
          <div style={{ position: "relative", background: "#FFFFFF", borderRadius: 20, padding: 28, width: "100%", maxWidth: 520, maxHeight: "92vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
              <div>
                <h3 style={{ fontSize: 17, fontWeight: 800, color: "#111827", margin: 0 }}>Schedule Content</h3>
                <p style={{ fontSize: 12, color: "#6B7280", margin: "2px 0 0" }}>Will be assigned to you</p>
              </div>
              <button onClick={() => setShowAdd(false)} style={{ background: "none", border: "none", cursor: "pointer" }}>
                <X size={18} color="#6B7280" />
              </button>
            </div>

            <form onSubmit={handleCreate} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {/* Title */}
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: "#4A5568", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 5, display: "block" }}>Title *</label>
                <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Diwali Sale Reel" required
                  style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: "1.5px solid #E2E8F0", fontSize: 13, background: "#FAFAFA", color: "#1A202C", outline: "none", boxSizing: "border-box" }} />
              </div>

              {/* Platform */}
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: "#4A5568", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 5, display: "block" }}>Platform</label>
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
                <label style={{ fontSize: 11, fontWeight: 700, color: "#4A5568", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 5, display: "block" }}>Content Type</label>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {CONTENT_TYPES.map(ct => (
                    <button key={ct} type="button" onClick={() => setContentType(ct)}
                      style={{ padding: "6px 12px", borderRadius: 8, border: `1.5px solid ${contentType === ct ? "#DE1A1A" : "#E2E8F0"}`, background: contentType === ct ? "rgba(222,26,26,0.08)" : "#FAFAFA", color: contentType === ct ? "#DE1A1A" : "#718096", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                      {ct.charAt(0).toUpperCase() + ct.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Date + Client */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: "#4A5568", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 5, display: "block" }}>Date *</label>
                  <input type="date" value={schedDate} onChange={e => setSchedDate(e.target.value)} required
                    style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: "1.5px solid #E2E8F0", fontSize: 13, background: "#FAFAFA", color: "#1A202C", outline: "none", boxSizing: "border-box" }} />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: "#4A5568", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 5, display: "block" }}>Client</label>
                  <input value={clientName} onChange={e => setClientName(e.target.value)} placeholder="Client or brand name"
                    style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: "1.5px solid #E2E8F0", fontSize: 13, background: "#FAFAFA", color: "#1A202C", outline: "none", boxSizing: "border-box" }} />
                </div>
              </div>

              {/* Caption */}
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: "#4A5568", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 5, display: "block" }}>Caption (optional)</label>
                <textarea value={caption} onChange={e => setCaption(e.target.value)} rows={2} placeholder="Post caption or script brief…"
                  style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: "1.5px solid #E2E8F0", fontSize: 13, background: "#FAFAFA", color: "#1A202C", outline: "none", resize: "vertical", lineHeight: 1.5, boxSizing: "border-box" }} />
              </div>

              {/* Drive link */}
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: "#4A5568", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 5, display: "block" }}>Drive Link (optional)</label>
                <input type="url" value={driveLink} onChange={e => setDriveLink(e.target.value)} placeholder="https://drive.google.com/…"
                  style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: "1.5px solid #E2E8F0", fontSize: 13, background: "#FAFAFA", color: "#1A202C", outline: "none", boxSizing: "border-box" }} />
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", background: "rgba(37,211,102,0.07)", borderRadius: 8, border: "1px solid rgba(37,211,102,0.2)" }}>
                <Send size={13} color="#25D366" />
                <span style={{ fontSize: 12, color: "#25D366", fontWeight: 600 }}>This post will be assigned to you</span>
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
                  {isPending
                    ? <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}><Loader2 size={14} className="animate-spin" />Saving…</span>
                    : "Schedule Content"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
