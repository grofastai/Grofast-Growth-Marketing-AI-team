"use client"

import { useState, useMemo, useEffect, useRef } from "react"
import Image from "next/image"
import { Bell, Search, ChevronDown, Pin, Settings } from "lucide-react"

type AnnouncementRow = {
  id: string
  title: string
  message: string
  pinned: boolean
  category: string
  created_at: string
  users: { name: string } | null
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

const CATEGORIES = ["All Categories", "General", "Policy", "Events", "Urgent"]

export default function AnnouncementsClient({ announcements }: { announcements: AnnouncementRow[] }) {
  const [search, setSearch]     = useState("")
  const [category, setCategory] = useState("All Categories")
  const [catOpen, setCatOpen]   = useState(false)
  const catRef                  = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (catRef.current && !catRef.current.contains(e.target as Node)) setCatOpen(false)
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [])

  const now          = new Date()
  const todayStr     = now.toISOString().split("T")[0]
  const thisMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`

  const stats = useMemo(() => ({
    newToday:  announcements.filter(a => a.created_at.startsWith(todayStr)).length,
    unread:    announcements.length,
    thisMonth: announcements.filter(a => a.created_at.startsWith(thisMonthStr)).length,
    total:     announcements.length,
  }), [announcements, todayStr, thisMonthStr])

  const filtered = useMemo(() =>
    announcements.filter(a =>
      (category === "All Categories" || a.category === category) &&
      (a.title.toLowerCase().includes(search.toLowerCase()) ||
       a.message.toLowerCase().includes(search.toLowerCase()))
    ), [announcements, search, category])

  const STAT_CARDS = [
    { emoji: "📢", label1: "New Announcements", label2: "Today",         value: stats.newToday,  bg: "rgba(239,68,68,0.08)"  },
    { emoji: "🔔", label1: "Unread",             label2: "Announcements", value: stats.unread,    bg: "rgba(245,158,11,0.08)" },
    { emoji: "📅", label1: "",                   label2: "This Month",    value: stats.thisMonth, bg: "rgba(34,197,94,0.08)"  },
    { emoji: "👥", label1: "Total",              label2: "Announcements", value: stats.total,     bg: "rgba(99,102,241,0.08)" },
  ]

  return (
    <div style={{ background: "#F8F9FC", minHeight: "100vh" }}>

      {/* ── HERO BANNER ─────────────────────────────────────────────────────── */}
      <div style={{ background: "linear-gradient(135deg, #DE1A1A 0%, #8B1212 55%, #1A0808 100%)", position: "relative", boxShadow: "0 8px 32px rgba(180,0,0,0.35)" }}>
        {/* Decorative circles clipped in their own layer so the dropdown can escape */}
        <div style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" }}>
          <div style={{ position: "absolute", top: -50, right: -50, width: 240, height: 240, borderRadius: "50%", background: "rgba(255,255,255,0.05)" }}/>
          <div style={{ position: "absolute", bottom: -40, left: 80, width: 160, height: 160, borderRadius: "50%", background: "rgba(255,255,255,0.04)" }}/>
        </div>
        <div className="p-4 md:p-[20px_28px]" style={{ position: "relative", zIndex: 1, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 700, padding: "4px 12px", borderRadius: 99, background: "rgba(255,255,255,0.15)", color: "#fff", marginBottom: 10, border: "1px solid rgba(255,255,255,0.2)", letterSpacing: "0.04em" }}>
              ⭐ Announcements
            </span>
            <h1 style={{ fontSize: 28, fontWeight: 900, color: "#fff", fontFamily: "var(--font-jakarta)", margin: 0 }}>
              Announcements
            </h1>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", margin: "3px 0 0" }}>Updates and notices from your team</p>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            {/* Search */}
            <div style={{ position: "relative" }}>
              <Search size={14} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "rgba(255,255,255,0.6)" }} />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search announcements..."
                style={{ width: "min(230px, 100%)", background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 12, padding: "9px 12px 9px 34px", fontSize: 13, color: "#fff", outline: "none" }}
              />
            </div>

            {/* Category dropdown */}
            <div ref={catRef} style={{ position: "relative" }}>
              <button onClick={() => setCatOpen(o => !o)}
                style={{ display: "flex", alignItems: "center", gap: 7, padding: "9px 14px", borderRadius: 12, background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.2)", fontSize: 13, fontWeight: 600, color: "#fff", cursor: "pointer", whiteSpace: "nowrap" }}>
                <span style={{ fontSize: 15 }}>⊟</span>
                {category}
                <ChevronDown size={12} style={{ transform: catOpen ? "rotate(180deg)" : "none", transition: "0.2s" }} />
              </button>
              {catOpen && (
                <div style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12, boxShadow: "0 8px 24px rgba(0,0,0,0.2)", zIndex: 9999, minWidth: 170, overflow: "hidden" }}>
                  {CATEGORIES.map(c => (
                    <button key={c} onClick={() => { setCategory(c); setCatOpen(false) }}
                      style={{ display: "block", width: "100%", textAlign: "left", padding: "10px 16px", fontSize: 13, fontWeight: c === category ? 700 : 500, color: c === category ? "#DE1A1A" : "#374151", background: c === category ? "rgba(222,26,26,0.05)" : "transparent", border: "none", cursor: "pointer" }}>
                      {c}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="p-4 md:p-[20px_28px_40px]">

        {/* ── STATS ROW ──────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-[14px] mb-5">
          {STAT_CARDS.map((s, i) => (
            <div key={i} style={{ background: "linear-gradient(135deg, #1E3A8A 0%, #1D4ED8 55%, #3B82F6 100%)", borderRadius: 18, padding: "18px 20px", display: "flex", alignItems: "center", gap: 16, boxShadow: "0 6px 24px rgba(29,78,216,0.35)", position: "relative", overflow: "hidden" }}>
              <div style={{ position: "absolute", top: -20, right: -20, width: 90, height: 90, borderRadius: "50%", background: "rgba(255,255,255,0.07)", pointerEvents: "none" }} />
              <div style={{ width: 54, height: 54, borderRadius: 16, background: "rgba(255,255,255,0.18)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, flexShrink: 0, position: "relative", zIndex: 1 }}>
                {s.emoji}
              </div>
              <div style={{ position: "relative", zIndex: 1 }}>
                <p style={{ fontSize: 30, fontWeight: 900, color: "#FFFFFF", margin: "0 0 3px", fontFamily: "var(--font-jakarta)", lineHeight: 1 }}>{s.value}</p>
                <p style={{ fontSize: 11, color: "rgba(255,255,255,0.7)", margin: 0, lineHeight: 1.5 }}>
                  {s.label1 && <>{s.label1}<br /></>}{s.label2}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* ── MAIN CONTENT ───────────────────────────────────────────────────── */}
        {filtered.length === 0 ? (
          <>
            {/* Empty state card */}
            <div style={{ background: "#fff", borderRadius: 22, border: "1px solid #EBEDF2", boxShadow: "0 2px 16px rgba(0,0,0,0.05)", display: "flex", alignItems: "center", overflow: "hidden", marginBottom: 16, minHeight: 320 }}>

              {/* Left: illustration */}
              <div style={{ flex: "0 0 400px", display: "flex", alignItems: "center", justifyContent: "center", position: "relative", padding: "32px 24px 0 36px" }}>
                {/* Pink circle */}
                <div style={{ width: 290, height: 290, borderRadius: "50%", background: "rgba(252,220,220,0.35)", position: "absolute" }} />
                {/* Sparkle decorations */}
                <span style={{ position: "absolute", top: 38, left: 52, fontSize: 13, color: "#EF4444", opacity: 0.5 }}>✦</span>
                <span style={{ position: "absolute", top: 58, right: 50, fontSize: 9,  color: "#EF4444", opacity: 0.35 }}>✦</span>
                <span style={{ position: "absolute", bottom: 40, left: 68, fontSize: 9, color: "#6366F1", opacity: 0.35 }}>✦</span>
                <span style={{ position: "absolute", bottom: 64, right: 64, fontSize: 11, color: "#F59E0B", opacity: 0.3 }}>✦</span>
                {/* Dashed circle outline */}
                <svg style={{ position: "absolute", right: 30, bottom: 30, opacity: 0.2 }} width="80" height="80" viewBox="0 0 80 80">
                  <circle cx="40" cy="40" r="36" fill="none" stroke="#DE1A1A" strokeWidth="1.5" strokeDasharray="6 4"/>
                </svg>
                <Image
                  src="/brand/announcement-girl.png"
                  alt=""
                  width={340}
                  height={300}
                  style={{ objectFit: "contain", position: "relative", zIndex: 1 }}
                  priority
                />
              </div>

              {/* Right: empty state message */}
              <div style={{ flex: 1, padding: "44px 60px 44px 16px" }}>
                {/* Megaphone icon with rays */}
                <div style={{ position: "relative", width: 88, height: 88, marginBottom: 24 }}>
                  <div style={{ width: 88, height: 88, borderRadius: "50%", background: "rgba(239,68,68,0.07)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <div style={{ width: 64, height: 64, borderRadius: "50%", background: "rgba(239,68,68,0.14)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30 }}>
                      📢
                    </div>
                  </div>
                  {/* Ray lines */}
                  <span style={{ position: "absolute", top: -4, right: -14, fontSize: 14, color: "#EF4444", fontWeight: 300, opacity: 0.7 }}>╱</span>
                  <span style={{ position: "absolute", top: 8,  right: -22, fontSize: 10, color: "#EF4444", opacity: 0.5 }}>─</span>
                  <span style={{ position: "absolute", top: 20, right: -18, fontSize: 8,  color: "#EF4444", opacity: 0.4 }}>─</span>
                </div>

                <h2 style={{ fontSize: 24, fontWeight: 900, color: "#111111", margin: "0 0 10px", fontFamily: "var(--font-jakarta)" }}>
                  No announcements yet!
                </h2>
                <p style={{ fontSize: 14, color: "#6B7280", margin: "0 0 28px", lineHeight: 1.7, maxWidth: 360 }}>
                  You&apos;re all caught up. When there are updates from your team, they&apos;ll appear here.
                </p>
                <button style={{ display: "inline-flex", alignItems: "center", gap: 9, padding: "12px 22px", borderRadius: 12, background: "none", border: "1.5px solid #DE1A1A", fontSize: 13, fontWeight: 700, color: "#DE1A1A", cursor: "pointer" }}>
                  <Bell size={14} /> We&apos;ll notify you when something&apos;s new
                </button>
              </div>
            </div>

          </>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {filtered.map(ann => {
              const creator = Array.isArray(ann.users) ? ann.users[0] : ann.users
              return (
                <div key={ann.id} style={{ background: ann.pinned ? "rgba(255,246,246,1)" : "#fff", borderRadius: 18, padding: "18px 22px", border: ann.pinned ? "1px solid rgba(222,26,26,0.2)" : "1px solid #EBEDF2", boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
                    <div style={{ width: 46, height: 46, borderRadius: 14, background: ann.pinned ? "rgba(222,26,26,0.1)" : "rgba(239,68,68,0.07)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 22 }}>
                      📢
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                        {ann.pinned && (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 10px", borderRadius: 99, background: "rgba(222,26,26,0.1)", fontSize: 10, fontWeight: 700, color: "#DE1A1A" }}>
                            <Pin size={9} /> Pinned
                          </span>
                        )}
                        <h3 style={{ fontSize: 15, fontWeight: 800, color: "#111111", margin: 0 }}>{ann.title}</h3>
                      </div>
                      <p style={{ fontSize: 13, color: "#374151", margin: "0 0 8px", lineHeight: 1.6 }}>{ann.message}</p>
                      <p style={{ fontSize: 11, color: "#9CA3AF", margin: 0 }}>
                        By {creator?.name ?? "Admin"} · {timeAgo(ann.created_at)}
                      </p>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
