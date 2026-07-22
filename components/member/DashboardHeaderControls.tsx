"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Search, X, Bell, Megaphone, CheckCircle2, ClipboardList, Calendar, Loader2 } from "lucide-react"
import Link from "next/link"
import { createBrowserClient } from "@/lib/supabase/client"

type TaskHit = { id: string; title: string }
type AnnHit  = { id: string; title: string }

const QUICK_LINKS = [
  { label: "My Tasks",      href: "/member/tasks" },
  { label: "Attendance",    href: "/member/attendance" },
  { label: "Daily Update",  href: "/member/update" },
  { label: "Leaves",        href: "/member/leaves" },
  { label: "Announcements", href: "/member/announcements" },
  { label: "Profile",       href: "/member/profile" },
]

type Notif = {
  id: string
  type: "announcement" | "leave" | "task"
  title: string
  body: string
  time: string
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1)  return "Just now"
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 7)  return `${d}d ago`
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" })
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short" })
}

const STORAGE_KEY = "gf_read_notifs"
function getRead(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]")) } catch { return new Set() }
}
function markRead(ids: string[]) {
  try {
    const prev = getRead()
    ids.forEach(id => prev.add(id))
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...prev].slice(-200)))
  } catch {}
}

export default function DashboardHeaderControls({
  pendingLeaves: _pendingLeaves,
  employeeId,
}: {
  pendingLeaves: number
  employeeId: string
}) {
  const router = useRouter()
  const [query, setQuery]       = useState("")
  const [open, setOpen]         = useState(false)
  const inputRef                = useRef<HTMLInputElement>(null)
  const debounceRef             = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [searching, setSearching] = useState(false)
  const [taskHits, setTaskHits]   = useState<TaskHit[]>([])
  const [annHits, setAnnHits]     = useState<AnnHit[]>([])

  const [notifOpen, setNotifOpen]     = useState(false)
  const [notifs, setNotifs]           = useState<Notif[]>([])
  const [loading, setLoading]         = useState(false)
  const [unread, setUnread]           = useState(0)
  const [fetched, setFetched]         = useState(false)
  const notifRef                      = useRef<HTMLDivElement>(null)

  const filtered = query.trim().length > 0
    ? QUICK_LINKS.filter(l => l.label.toLowerCase().includes(query.toLowerCase()))
    : QUICK_LINKS

  // Live search over real content (tasks assigned to me, announcements) once the
  // query is long enough to be meaningful — the quick-links list above only ever
  // matches 6 hardcoded nav labels, so anything else typed needs real data.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    const q = query.trim()
    if (q.length < 2) { setTaskHits([]); setAnnHits([]); setSearching(false); return }

    setSearching(true)
    debounceRef.current = setTimeout(async () => {
      const supabase = createBrowserClient()
      const { data: { user } } = await supabase.auth.getUser()
      const [taskRes, annRes] = await Promise.all([
        user
          ? supabase.from("tasks").select("id, title").eq("assigned_to", user.id).ilike("title", `%${q}%`).limit(5)
          : Promise.resolve({ data: [] as TaskHit[] }),
        supabase.from("announcements").select("id, title").ilike("title", `%${q}%`).limit(5),
      ])
      setTaskHits((taskRes.data ?? []) as TaskHit[])
      setAnnHits((annRes.data ?? []) as AnnHit[])
      setSearching(false)
    }, 300)

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [query])

  function goTasks(title: string) { router.push(`/member/tasks?search=${encodeURIComponent(title)}`); setOpen(false); setQuery("") }
  function goAnnouncements(title: string) { router.push(`/member/announcements?search=${encodeURIComponent(title)}`); setOpen(false); setQuery("") }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const match = QUICK_LINKS.find(l => l.label.toLowerCase().includes(query.toLowerCase()))
    if (match) { router.push(match.href); setOpen(false); setQuery(""); return }
    const q = query.trim()
    if (!q) { setOpen(false); return }
    if (taskHits.length > 0) { goTasks(q); return }
    if (annHits.length > 0) { goAnnouncements(q); return }
    goTasks(q)
  }

  const fetchNotifs = useCallback(async () => {
    setLoading(true)
    try {
      const supabase = createBrowserClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const [annRes, leaveRes, taskRes] = await Promise.all([
        supabase.from("announcements")
          .select("id, title, message, created_at")
          .order("created_at", { ascending: false })
          .limit(8),
        supabase.from("leaves")
          .select("id, status, from_date, to_date, leave_type, created_at")
          .eq("user_id", user.id)
          .in("status", ["approved", "rejected"])
          .order("created_at", { ascending: false })
          .limit(6),
        supabase.from("tasks")
          .select("id, title, status, created_at")
          .eq("assigned_to", user.id)
          .order("created_at", { ascending: false })
          .limit(6),
      ])

      const all: Notif[] = []

      for (const a of annRes.data ?? []) {
        all.push({
          id: `ann_${a.id}`,
          type: "announcement",
          title: a.title ?? "Announcement",
          body: (a.message ?? "").slice(0, 90) + ((a.message ?? "").length > 90 ? "…" : ""),
          time: a.created_at,
        })
      }
      for (const l of leaveRes.data ?? []) {
        const lbl = l.leave_type === "permission" ? "Permission" : l.leave_type === "half_day" ? "Half Day Leave" : "Full Day Leave"
        all.push({
          id: `leave_${l.id}`,
          type: "leave",
          title: l.status === "approved" ? `${lbl} Approved` : `${lbl} Rejected`,
          body: `Your ${lbl.toLowerCase()} request has been ${l.status}.`,
          time: l.created_at,
        })
      }
      for (const t of taskRes.data ?? []) {
        all.push({
          id: `task_${t.id}`,
          type: "task",
          title: "Task Assigned",
          body: t.title ?? "A new task has been assigned to you.",
          time: t.created_at,
        })
      }

      all.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
      const sorted = all.slice(0, 20)
      setNotifs(sorted)
      const read = getRead()
      setUnread(sorted.filter(n => !read.has(n.id)).length)
    } finally {
      setLoading(false)
      setFetched(true)
    }
  }, [])

  // Fetch on mount to get unread count
  useEffect(() => { fetchNotifs() }, [fetchNotifs])

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false)
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [])

  function openPanel() {
    setNotifOpen(v => {
      if (!v) {
        if (!fetched) fetchNotifs()
        // Mark all as read
        setTimeout(() => {
          markRead(notifs.map(n => n.id))
          setUnread(0)
        }, 800)
      }
      return !v
    })
  }

  const NOTIF_ICON: Record<Notif["type"], React.ReactNode> = {
    announcement: <Megaphone    size={15} style={{ color: "#6366F1" }} />,
    leave:        <Calendar     size={15} style={{ color: "#10B981" }} />,
    task:         <ClipboardList size={15} style={{ color: "#F59E0B" }} />,
  }
  const NOTIF_BG: Record<Notif["type"], string> = {
    announcement: "rgba(99,102,241,0.1)",
    leave:        "rgba(16,185,129,0.1)",
    task:         "rgba(245,158,11,0.1)",
  }

  return (
    <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">

      {/* ── Search ── */}
      <div className="relative">
        <form onSubmit={handleSubmit}
          className="flex items-center gap-2 px-3 py-2 rounded-xl transition-all"
          style={{ background: "rgba(255,255,255,0.14)", backdropFilter: "blur(8px)", border: `1px solid ${open ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.25)"}`, minWidth: open ? 200 : undefined }}>
          <Search size={14} style={{ color: "rgba(255,255,255,0.75)", flexShrink: 0 }} />
          <input
            ref={inputRef}
            value={query}
            onChange={e => { setQuery(e.target.value); setOpen(true) }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            placeholder="Search..."
            className="bg-transparent outline-none text-[13px] w-[120px] sm:w-[180px] placeholder:text-white/50"
            style={{ color: "#FFFFFF" }}
          />
          {query && (
            <button type="button" onClick={() => { setQuery(""); inputRef.current?.focus() }}>
              <X size={12} style={{ color: "rgba(255,255,255,0.75)" }} />
            </button>
          )}
        </form>

        {/* Search Dropdown */}
        {open && (
          <div className="absolute top-full mt-1.5 left-0 right-0 rounded-xl overflow-hidden z-50"
            style={{ background: "#FFFFFF", boxShadow: "0 8px 24px rgba(0,0,0,0.12)", border: "1px solid #E5E7EB", minWidth: 220 }}>
            {query.trim().length === 0 ? (
              filtered.map(l => (
                <Link key={l.href} href={l.href}
                  className="flex items-center gap-2 px-4 py-2.5 text-[13px] font-medium transition-colors hover:bg-gray-50"
                  style={{ color: "#374151" }}
                  onMouseDown={() => { router.push(l.href); setOpen(false) }}>
                  <Search size={11} style={{ color: "#9CA3AF" }} />
                  {l.label}
                </Link>
              ))
            ) : searching ? (
              <div className="flex items-center gap-2 px-4 py-3" style={{ color: "#9CA3AF" }}>
                <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} />
                <span className="text-[12px]">Searching…</span>
              </div>
            ) : filtered.length === 0 && taskHits.length === 0 && annHits.length === 0 ? (
              <p className="px-4 py-3 text-[12px]" style={{ color: "#9CA3AF" }}>No results for &ldquo;{query.trim()}&rdquo;</p>
            ) : (
              <>
                {filtered.map(l => (
                  <Link key={l.href} href={l.href}
                    className="flex items-center gap-2 px-4 py-2.5 text-[13px] font-medium transition-colors hover:bg-gray-50"
                    style={{ color: "#374151" }}
                    onMouseDown={() => { router.push(l.href); setOpen(false) }}>
                    <Search size={11} style={{ color: "#9CA3AF" }} />
                    {l.label}
                  </Link>
                ))}
                {taskHits.length > 0 && (
                  <div>
                    <p className="px-4 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wide" style={{ color: "#9CA3AF" }}>Tasks</p>
                    {taskHits.map(t => (
                      <button key={t.id} type="button" onMouseDown={() => goTasks(t.title)}
                        className="w-full flex items-center gap-2 px-4 py-2 text-[13px] font-medium text-left hover:bg-gray-50"
                        style={{ color: "#374151" }}>
                        <ClipboardList size={12} style={{ color: "#9CA3AF" }} />
                        {t.title}
                      </button>
                    ))}
                  </div>
                )}
                {annHits.length > 0 && (
                  <div>
                    <p className="px-4 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wide" style={{ color: "#9CA3AF" }}>Announcements</p>
                    {annHits.map(a => (
                      <button key={a.id} type="button" onMouseDown={() => goAnnouncements(a.title)}
                        className="w-full flex items-center gap-2 px-4 py-2 text-[13px] font-medium text-left hover:bg-gray-50"
                        style={{ color: "#374151" }}>
                        <Megaphone size={12} style={{ color: "#9CA3AF" }} />
                        {a.title}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* ── Notification Bell ── */}
      <div className="relative" ref={notifRef}>
        <button onClick={openPanel}
          style={{ position: "relative", width: 38, height: 38, borderRadius: 12, background: "rgba(255,255,255,0.14)", backdropFilter: "blur(8px)", border: "1px solid rgba(255,255,255,0.25)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>
          <Bell size={16} style={{ color: notifOpen ? "#fff" : "rgba(255,255,255,0.75)" }} />
          {unread > 0 && (
            <span style={{ position: "absolute", top: -4, right: -4, minWidth: 17, height: 17, borderRadius: 99, background: "#fff", color: "#de1a1a", fontSize: 10, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 4px", border: "2px solid #8B1212" }}>
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>

        {/* Notification Panel */}
        {notifOpen && (
          <div style={{ position: "absolute", top: "calc(100% + 10px)", right: 0, width: 340, maxWidth: "calc(100vw - 24px)", background: "#fff", borderRadius: 20, border: "1px solid #E5E7EB", boxShadow: "0 16px 48px rgba(0,0,0,0.16)", zIndex: 9999, overflow: "hidden" }}>

            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 18px 12px", borderBottom: "1px solid #F3F4F6" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 30, height: 30, borderRadius: 9, background: "rgba(222,26,26,0.08)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Bell size={14} style={{ color: "#de1a1a" }} />
                </div>
                <div>
                  <p style={{ fontSize: 14, fontWeight: 800, color: "#111", margin: 0 }}>Notifications</p>
                  <p style={{ fontSize: 10, color: "#9CA3AF", margin: 0 }}>{notifs.length} messages</p>
                </div>
              </div>
              <button onClick={() => setNotifOpen(false)}
                style={{ width: 28, height: 28, borderRadius: "50%", background: "#F5F6FA", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <X size={12} style={{ color: "#6B7280" }} />
              </button>
            </div>

            {/* Messages list */}
            <div style={{ maxHeight: 420, overflowY: "auto" }}>
              {loading ? (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 32, gap: 10 }}>
                  <Loader2 size={18} style={{ color: "#9CA3AF", animation: "spin 1s linear infinite" }} />
                  <span style={{ fontSize: 13, color: "#9CA3AF" }}>Loading…</span>
                </div>
              ) : notifs.length === 0 ? (
                <div style={{ textAlign: "center", padding: "32px 16px" }}>
                  <div style={{ fontSize: 36, marginBottom: 10 }}>🔔</div>
                  <p style={{ fontSize: 13, fontWeight: 700, color: "#374151", margin: "0 0 4px" }}>All caught up!</p>
                  <p style={{ fontSize: 11, color: "#9CA3AF", margin: 0 }}>No notifications yet.</p>
                </div>
              ) : (
                notifs.map((n, i) => {
                  const read = !getRead().has(n.id) ? false : true
                  return (
                    <div key={n.id}
                      style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "13px 18px", borderBottom: i < notifs.length - 1 ? "1px solid #F9FAFB" : "none", background: !read ? "rgba(222,26,26,0.025)" : "#fff", transition: "background 0.2s" }}>
                      {/* Icon bubble */}
                      <div style={{ width: 36, height: 36, borderRadius: 11, background: NOTIF_BG[n.type], display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>
                        {NOTIF_ICON[n.type]}
                      </div>

                      {/* Text */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, marginBottom: 2 }}>
                          <p style={{ fontSize: 13, fontWeight: 700, color: "#111", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{n.title}</p>
                          {!read && <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#de1a1a", flexShrink: 0 }} />}
                        </div>
                        <p style={{ fontSize: 12, color: "#6B7280", margin: "0 0 4px", lineHeight: 1.5, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{n.body}</p>
                        <p style={{ fontSize: 10, color: "#9CA3AF", margin: 0, fontWeight: 600 }}>{timeAgo(n.time)}</p>
                      </div>
                    </div>
                  )
                })
              )}
            </div>

            {/* Footer */}
            {notifs.length > 0 && (
              <div style={{ padding: "10px 18px", borderTop: "1px solid #F3F4F6", display: "flex", justifyContent: "center" }}>
                <Link href="/member/notifications"
                  style={{ fontSize: 12, fontWeight: 700, color: "#de1a1a", textDecoration: "none" }}
                  onClick={() => setNotifOpen(false)}>
                  View all notifications →
                </Link>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Employee ID (hidden on very small screens) ── */}
      <div className="text-right hidden xs:block">
        <p className="text-[9px] uppercase tracking-[0.2em] font-bold" style={{ color: "rgba(255,255,255,0.6)" }}>Employee ID</p>
        <p className="text-[15px] font-black" style={{ color: "#FFFFFF", fontFamily: "var(--font-jakarta)" }}>
          {employeeId ? `#${employeeId}` : "—"}
        </p>
      </div>

    </div>
  )
}
