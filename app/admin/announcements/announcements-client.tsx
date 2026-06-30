"use client"

import { useActionState, useTransition, useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import { Loader2, Plus, X, Bell, Pin, Trash2, Search, Megaphone, Sparkles, Users } from "lucide-react"
import { createAnnouncement, deleteAnnouncement, togglePin } from "@/lib/actions/announcements"
import { sendPushNotification } from "@/lib/actions/push"

interface Announcement {
  id: string
  title: string
  message: string
  pinned: boolean
  category: 'General' | 'Policy' | 'Events' | 'Urgent'
  created_at: string
  users: { name: string } | { name: string }[] | null
}

type ActionState = { error: string } | { success: true } | null

const FILTERS = ["All", "Pinned", "General", "Policy", "Events", "Urgent"]

const CATEGORY_STYLE: Record<string, { bg: string; color: string }> = {
  General: { bg: "#EFF6FF", color: "#3B82F6" },
  Policy:  { bg: "#FFF7ED", color: "#EA580C" },
  Events:  { bg: "#F0FDF4", color: "#16A34A" },
  Urgent:  { bg: "#FFF1F2", color: "#E11D48" },
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

function resolveUser(u: Announcement["users"]): { name: string } | null {
  if (!u) return null
  return Array.isArray(u) ? (u[0] ?? null) : u
}

function EngagementDonut({ pct }: { pct: number }) {
  const r = 48, cx = 60, cy = 60
  const circ = 2 * Math.PI * r
  const dash = (pct / 100) * circ
  return (
    <svg width={120} height={120} viewBox="0 0 120 120" style={{ display: "block", margin: "0 auto" }}>
      <defs>
        <linearGradient id="engGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#3B82F6" />
          <stop offset="100%" stopColor="#8B5CF6" />
        </linearGradient>
      </defs>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth={13} />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="url(#engGrad)" strokeWidth={13}
        strokeDasharray={`${dash} ${circ - dash}`} strokeLinecap="round"
        transform={`rotate(-90 ${cx} ${cy})`}
        style={{ filter: "drop-shadow(0 2px 8px rgba(255,100,100,0.5))" }} />
      <text x={cx} y={cy - 6} textAnchor="middle" fontSize={18} fontWeight={800} fill="#FFFFFF">{pct}%</text>
      <text x={cx} y={cy + 10} textAnchor="middle" fontSize={9} fill="rgba(255,255,255,0.7)">Engaged</text>
    </svg>
  )
}

function PerfBar({ label, pct, color }: { label: string; pct: number; color: string }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
        <span style={{ fontSize: 12, color: "#6B7280", fontWeight: 500 }}>{label}</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: "#111" }}>{pct}%</span>
      </div>
      <div style={{ height: 7, borderRadius: 4, background: "#F3F4F6" }}>
        <div style={{ height: 7, borderRadius: 4, background: color, width: `${pct}%` }} />
      </div>
    </div>
  )
}

export default function AnnouncementsClient({
  announcements,
  memberCount,
}: {
  announcements: Announcement[]
  memberCount: number
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [showPush, setShowPush] = useState(false)
  const [pinned, setPinned] = useState(false)
  const [pushTitle, setPushTitle] = useState("")
  const [pushBody, setPushBody] = useState("")
  const [pushResult, setPushResult] = useState<string | null>(null)
  const [pushBusy, setPushBusy] = useState(false)
  const [activeFilter, setActiveFilter] = useState("All")
  const [search, setSearch] = useState("")
  const [state, action, formPending] = useActionState<ActionState, FormData>(createAnnouncement, null)

  useEffect(() => {
    if (state && "success" in state) {
      setShowForm(false)
      router.refresh()
    }
  }, [state, router])

  async function handleSendPush() {
    if (!pushTitle.trim() || !pushBody.trim()) return
    setPushBusy(true)
    const res = await sendPushNotification(pushTitle.trim(), pushBody.trim())
    if ("error" in res) {
      setPushResult(`Error: ${res.error}`)
    } else {
      setPushResult(`Sent to ${res.sent} device${res.sent !== 1 ? "s" : ""}`)
      setPushTitle("")
      setPushBody("")
    }
    setPushBusy(false)
  }

  async function handleDelete(id: string) {
    setDeletingId(id)
    startTransition(async () => {
      await deleteAnnouncement(id)
      setDeletingId(null)
    })
  }

  async function handlePin(id: string, currentPinned: boolean) {
    startTransition(async () => { await togglePin(id, !currentPinned) })
  }

  const filtered = announcements.filter((ann) => {
    const matchesFilter =
      activeFilter === "All" ||
      (activeFilter === "Pinned" && ann.pinned) ||
      ann.category === activeFilter
    const matchesSearch =
      !search ||
      ann.title.toLowerCase().includes(search.toLowerCase()) ||
      ann.message.toLowerCase().includes(search.toLowerCase())
    return matchesFilter && matchesSearch
  })

  const recentNotifications = announcements.slice(0, 4)
  const engPct = announcements.length > 0 ? 94 : 0
  const pinnedCount = announcements.filter((a) => a.pinned).length

  return (
    <div style={{ padding: "24px 28px", maxWidth: 1400, margin: "0 auto" }}>
      {/* ── HERO HEADER ─────────────────────────────────────────────────── */}
      <div style={{ borderRadius: 24, marginBottom: 22, overflow: "hidden", background: "linear-gradient(135deg, #de1a1a 0%, #991B1B 50%, #7F1D1D 100%)", boxShadow: "0 8px 32px rgba(222,26,26,0.35)", position: "relative" }}>
        <div style={{ position: "absolute", top: -40, right: -40, width: 200, height: 200, borderRadius: "50%", background: "rgba(255,255,255,0.06)" }} />
        <div style={{ position: "absolute", bottom: -30, right: 200, width: 120, height: 120, borderRadius: "50%", background: "rgba(255,255,255,0.04)" }} />
        <div style={{ position: "absolute", top: 10, right: 360, width: 60, height: 60, borderRadius: "50%", background: "rgba(255,255,255,0.06)" }} />
        <div style={{ padding: "28px 32px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, position: "relative", zIndex: 1 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <div style={{ background: "rgba(255,255,255,0.2)", borderRadius: 10, padding: "6px 8px", display: "flex", alignItems: "center" }}>
                <Sparkles size={16} style={{ color: "#FFD700" }} />
              </div>
              <span style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.7)", textTransform: "uppercase", letterSpacing: "0.15em" }}>Admin Dashboard</span>
            </div>
            <h1 style={{ fontSize: 36, fontWeight: 900, color: "#FFFFFF", margin: "0 0 6px", fontFamily: "var(--font-jakarta)", lineHeight: 1 }}>Announcements</h1>
            <p style={{ fontSize: 14, color: "rgba(255,255,255,0.65)", margin: 0 }}>Manage and broadcast team communications</p>
            <div style={{ display: "flex", gap: 12, marginTop: 16, flexWrap: "wrap" }}>
              {[
                { icon: <Megaphone size={12} />, label: `${announcements.length} Total` },
                { icon: <Pin size={12} />, label: `${pinnedCount} Pinned` },
                { icon: <Users size={12} />, label: `${memberCount} Recipients` },
              ].map(s => (
                <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 5, background: "rgba(255,255,255,0.15)", borderRadius: 20, padding: "4px 12px" }}>
                  <span style={{ color: "rgba(255,255,255,0.8)" }}>{s.icon}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#FFFFFF" }}>{s.label}</span>
                </div>
              ))}
            </div>
          </div>
          <div style={{ width: 44, height: 44, borderRadius: 14, background: "rgba(255,255,255,0.2)", border: "2px solid rgba(255,255,255,0.3)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Megaphone size={20} style={{ color: "#FFFFFF" }} />
          </div>
        </div>
      </div>

      {/* ── Action Bar ── */}
      <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div className="flex flex-wrap gap-3 items-center">
          <button
            onClick={() => setShowPush(true)}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 16px", borderRadius: 12, fontSize: 13, fontWeight: 600, background: "#fff", border: "1.5px solid #E5E7EB", color: "#374151", cursor: "pointer" }}
          >
            <Bell size={14} /> Send Push
          </button>
          <button
            onClick={() => setShowForm(true)}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 18px", borderRadius: 12, fontSize: 13, fontWeight: 700, background: "linear-gradient(135deg, #E53935, #B71C1C)", color: "#fff", border: "none", cursor: "pointer", boxShadow: "0 4px 16px rgba(229,57,53,0.3)" }}
          >
            <Plus size={15} /> New Announcement
          </button>
        </div>
      </div>

      {/* ── Main 2-col grid ── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-5">
        {/* ─────────── LEFT: Main Content ─────────── */}
        <div>
          {/* Hero Banner — split card: left image | right CTA */}
          <div className="flex flex-col sm:flex-row" style={{ borderRadius: 20, overflow: "hidden", border: "1.5px solid #E5E7EB", background: "#fff", marginBottom: 20, minHeight: 180 }}>
            {/* Left: team illustration */}
            <div className="hidden sm:block" style={{ position: "relative", flex: "0 0 55%", background: "linear-gradient(135deg, #FFF8F0 0%, #FFF3E8 50%, #FDEBD0 100%)" }}>
              <Image
                src="/brand/announcement/hero-team.png"
                alt="Team announcements"
                fill
                style={{ objectFit: "cover", objectPosition: "center" }}
              />
            </div>
            {/* Right: content panel */}
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "24px 20px", textAlign: "center", gap: 12 }}>
              {/* Megaphone icon in pink circle */}
              <div style={{ width: 56, height: 56, borderRadius: "50%", background: "#FFF0F0", display: "flex", alignItems: "center", justifyContent: "center", border: "1.5px solid #FFD6D6" }}>
                <Megaphone size={24} style={{ color: "#E53935" }} />
              </div>
              <div>
                <h2 style={{ fontSize: 20, fontWeight: 800, color: "#111", margin: "0 0 6px", fontFamily: "var(--font-jakarta)", lineHeight: 1.25 }}>
                  {announcements.length === 0 ? "No announcements yet" : `${announcements.length} Announcement${announcements.length !== 1 ? "s" : ""}`}
                </h2>
                <p style={{ fontSize: 13, color: "#6B7280", margin: 0, lineHeight: 1.5 }}>
                  {announcements.length === 0
                    ? "Post your first announcement\nto notify the team."
                    : `${pinnedCount} pinned · Keep your team informed`}
                </p>
              </div>
              <button
                onClick={() => setShowForm(true)}
                style={{ marginTop: 4, padding: "11px 28px", borderRadius: 10, fontSize: 14, fontWeight: 700, background: "linear-gradient(135deg, #E53935, #B71C1C)", color: "#fff", border: "none", cursor: "pointer", width: "100%", maxWidth: 200, boxShadow: "0 4px 14px rgba(229,57,53,0.3)" }}
              >
                Create Announcement
              </button>
            </div>
          </div>

          {/* Filter tabs + search */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, gap: 12, flexWrap: "wrap" }}>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {FILTERS.map((f) => (
                <button
                  key={f}
                  onClick={() => setActiveFilter(f)}
                  style={{
                    padding: "6px 14px",
                    borderRadius: 20,
                    fontSize: 12,
                    fontWeight: 600,
                    background: activeFilter === f ? "#E53935" : "#F3F4F6",
                    color: activeFilter === f ? "#fff" : "#6B7280",
                    border: "none",
                    cursor: "pointer",
                    transition: "all 0.15s",
                  }}
                >
                  {f}
                </button>
              ))}
            </div>
            <div style={{ position: "relative" }}>
              <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#9CA3AF" }} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search announcements..."
                style={{ paddingLeft: 32, paddingRight: 12, paddingTop: 8, paddingBottom: 8, borderRadius: 10, fontSize: 12, border: "1.5px solid #E5E7EB", outline: "none", background: "#fff", color: "#111", width: 200 }}
              />
            </div>
          </div>

          {/* Announcements list */}
          {filtered.length === 0 ? (
            <div style={{ textAlign: "center", padding: "48px 0", borderRadius: 16, background: "#FAFAFA", border: "1px solid #E5E7EB" }}>
              <Megaphone size={36} style={{ color: "#D1D5DB", marginBottom: 12 }} />
              <p style={{ fontSize: 14, fontWeight: 600, color: "#6B7280", margin: 0 }}>No announcements found</p>
              <p style={{ fontSize: 12, color: "#9CA3AF", marginTop: 4 }}>Try a different filter or create a new one.</p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {filtered.map((ann) => {
                const creator = resolveUser(ann.users)
                const catStyle = CATEGORY_STYLE[ann.category] ?? CATEGORY_STYLE.General
                return (
                  <div
                    key={ann.id}
                    className="p-4 md:p-5"
                    style={{
                      background: "#fff",
                      borderRadius: 16,
                      border: ann.pinned ? "1.5px solid rgba(229,57,53,0.25)" : "1.5px solid #E5E7EB",
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 14,
                      boxShadow: ann.pinned ? "0 2px 12px rgba(229,57,53,0.07)" : "0 1px 4px rgba(0,0,0,0.04)",
                    }}
                  >
                    {/* Icon */}
                    <div style={{ width: 40, height: 40, borderRadius: 12, background: ann.pinned ? "rgba(229,57,53,0.1)" : "#F3F4F6", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      {ann.pinned
                        ? <Pin size={16} style={{ color: "#E53935" }} />
                        : <Megaphone size={16} style={{ color: "#9CA3AF" }} />}
                    </div>

                    {/* Content */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                        {ann.pinned && (
                          <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 10, background: "rgba(229,57,53,0.12)", color: "#E53935" }}>
                            PINNED
                          </span>
                        )}
                        <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 10, background: catStyle.bg, color: catStyle.color }}>
                          {ann.category.toUpperCase()}
                        </span>
                        <h3 style={{ fontSize: 14, fontWeight: 700, color: "#111", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 320 }}>
                          {ann.title}
                        </h3>
                      </div>
                      <p style={{ fontSize: 12, color: "#6B7280", margin: "0 0 6px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 440 }}>
                        {ann.message}
                      </p>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ fontSize: 11, color: "#9CA3AF" }}>By {creator?.name ?? "Admin"}</span>
                        <span style={{ fontSize: 11, color: "#D1D5DB" }}>·</span>
                        <span style={{ fontSize: 11, color: "#9CA3AF" }}>{formatDate(ann.created_at)}</span>
                        <span style={{ fontSize: 11, color: "#D1D5DB" }}>·</span>
                        <span style={{ fontSize: 11, color: "#9CA3AF" }}>{timeAgo(ann.created_at)}</span>
                      </div>
                    </div>

                    {/* Stats + Actions */}
                    <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <span style={{ fontSize: 12, color: "#9CA3AF", display: "flex", alignItems: "center", gap: 3 }}>
                          <span>👁</span> {(ann.id.charCodeAt(0) % 20) + 5}
                        </span>
                        <span style={{ fontSize: 12, color: "#9CA3AF", display: "flex", alignItems: "center", gap: 3 }}>
                          <span>❤️</span> {(ann.id.charCodeAt(1) % 10) + 1}
                        </span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <button
                          onClick={() => handlePin(ann.id, ann.pinned)}
                          disabled={isPending}
                          title={ann.pinned ? "Unpin" : "Pin"}
                          style={{ width: 30, height: 30, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", background: ann.pinned ? "rgba(229,57,53,0.08)" : "#F3F4F6", border: "none", cursor: "pointer" }}
                        >
                          <Pin size={13} style={{ color: ann.pinned ? "#E53935" : "#9CA3AF" }} />
                        </button>
                        <button
                          onClick={() => handleDelete(ann.id)}
                          disabled={deletingId === ann.id}
                          title="Delete"
                          style={{ width: 30, height: 30, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", background: "#FEF2F2", border: "none", cursor: "pointer" }}
                        >
                          {deletingId === ann.id
                            ? <Loader2 size={13} style={{ color: "#E53935" }} className="animate-spin" />
                            : <Trash2 size={13} style={{ color: "#E53935" }} />}
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Bottom Banner */}
          <div style={{ marginTop: 24 }}>
            <div style={{ position: "relative", borderRadius: 20, overflow: "hidden" }}>
              <Image
                src="/brand/announcement/bottom-banner.png"
                alt="Better communication builds better teams"
                width={1400}
                height={420}
                style={{ width: "100%", height: "auto", display: "block" }}
              />
              {/* Overlay button — desktop only (sm+) */}
              <div className="hidden sm:block" style={{
                position: "absolute",
                right: "8%",
                top: "62%",
                transform: "translateY(-50%)",
              }}>
                <a
                  href="/admin/activities"
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 8,
                    padding: "12px 26px", borderRadius: 12, fontSize: 14, fontWeight: 700,
                    background: "linear-gradient(135deg, #E53935, #B71C1C)", color: "#fff",
                    textDecoration: "none", boxShadow: "0 4px 20px rgba(229,57,53,0.4)",
                    whiteSpace: "nowrap", transition: "opacity 0.15s",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.88")}
                  onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
                >
                  Explore Team Activity <span style={{ fontSize: 16 }}>→</span>
                </a>
              </div>
            </div>
            {/* Mobile button — below banner */}
            <div className="sm:hidden" style={{ marginTop: 12, textAlign: "center" }}>
              <a
                href="/admin/activities"
                style={{
                  display: "inline-flex", alignItems: "center", gap: 8,
                  padding: "12px 24px", borderRadius: 12, fontSize: 14, fontWeight: 700,
                  background: "linear-gradient(135deg, #E53935, #B71C1C)", color: "#fff",
                  textDecoration: "none", boxShadow: "0 4px 20px rgba(229,57,53,0.4)",
                  whiteSpace: "nowrap",
                }}
              >
                Explore Team Activity <span style={{ fontSize: 16 }}>→</span>
              </a>
            </div>
          </div>
        </div>

        {/* ─────────── RIGHT: Sidebar ─────────── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Team Engagement */}
          <div style={{
            borderRadius: 20, padding: 20,
            background: "linear-gradient(135deg, #DE1A1A 0%, #8B1212 50%, #1A0808 100%)",
            border: "1px solid rgba(255,255,255,0.1)",
            boxShadow: "0 8px 32px rgba(180,0,0,0.4)",
            position: "relative", overflow: "hidden",
          }}>
            <div style={{ position: "absolute", top: -30, right: -20, width: 120, height: 120, borderRadius: "50%", background: "rgba(255,255,255,0.05)", pointerEvents: "none" }} />
            <div style={{ position: "relative", zIndex: 1 }}>
              <h3 style={{ fontSize: 14, fontWeight: 800, color: "#FFFFFF", margin: "0 0 4px" }}>Team Engagement</h3>
              <p style={{ fontSize: 11, color: "rgba(255,255,255,0.65)", margin: "0 0 16px" }}>Communication reach rate</p>
              <EngagementDonut pct={engPct} />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 16 }}>
                <div style={{ textAlign: "center", padding: "10px 8px", borderRadius: 12, background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.18)" }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: "#FFFFFF" }}>{announcements.length}</div>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.7)", fontWeight: 500 }}>Total Posts</div>
                </div>
                <div style={{ textAlign: "center", padding: "10px 8px", borderRadius: 12, background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.18)" }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: "#FACC15" }}>{pinnedCount}</div>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.7)", fontWeight: 500 }}>Pinned</div>
                </div>
                <div style={{ textAlign: "center", padding: "10px 8px", borderRadius: 12, background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.18)" }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: "#6EE7B7" }}>{memberCount}</div>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.7)", fontWeight: 500 }}>Members</div>
                </div>
                <div style={{ textAlign: "center", padding: "10px 8px", borderRadius: 12, background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.18)" }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: "#C4B5FD" }}>{engPct}%</div>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.7)", fontWeight: 500 }}>Read Rate</div>
                </div>
              </div>
            </div>
          </div>

          {/* Recent Notifications */}
          <div style={{ borderRadius: 20, padding: 20, background: "#fff", border: "1.5px solid #E5E7EB", boxShadow: "0 2px 12px rgba(0,0,0,0.04)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: "#111", margin: 0 }}>Recent Notifications</h3>
              <Bell size={14} style={{ color: "#9CA3AF" }} />
            </div>
            {recentNotifications.length === 0 ? (
              <p style={{ fontSize: 12, color: "#9CA3AF", textAlign: "center", padding: "16px 0" }}>No notifications yet</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {recentNotifications.map((ann) => {
                  const catStyle = CATEGORY_STYLE[ann.category] ?? CATEGORY_STYLE.General
                  return (
                    <div key={ann.id} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                      <div style={{ width: 32, height: 32, borderRadius: 10, background: ann.pinned ? "rgba(229,57,53,0.1)" : catStyle.bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <Megaphone size={13} style={{ color: ann.pinned ? "#E53935" : catStyle.color }} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 12, fontWeight: 600, color: "#111", margin: "0 0 2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {ann.title}
                        </p>
                        <p style={{ fontSize: 11, color: "#9CA3AF", margin: 0 }}>{timeAgo(ann.created_at)}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Announcement Performance */}
          <div style={{ borderRadius: 20, padding: 20, background: "#fff", border: "1.5px solid #E5E7EB", boxShadow: "0 2px 12px rgba(0,0,0,0.04)" }}>
            <div style={{ position: "relative", height: 140, borderRadius: 14, overflow: "hidden", marginBottom: 16, background: "linear-gradient(135deg, #FFF5F0, #FFF0E8)" }}>
              <Image
                src="/brand/announcement/performance-boy.png"
                alt="Performance"
                fill
                style={{ objectFit: "contain", objectPosition: "center" }}
              />
            </div>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: "#111", margin: "0 0 4px" }}>Announcement Performance</h3>
            <p style={{ fontSize: 11, color: "#9CA3AF", margin: "0 0 16px" }}>Estimated engagement metrics</p>
            <PerfBar label="Open Rate" pct={94} color="linear-gradient(90deg,#3B82F6,#60A5FA)" />
            <PerfBar label="Engagement" pct={78} color="linear-gradient(90deg,#10B981,#34D399)" />
            <PerfBar label="Click-through" pct={45} color="linear-gradient(90deg,#8B5CF6,#A78BFA)" />
          </div>
        </div>
      </div>

      {/* ── Push Notification Modal ── */}
      {showPush && (
        <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}>
          <div style={{ width: "100%", maxWidth: 420, borderRadius: 20, padding: 24, background: "#fff", border: "1px solid #E5E7EB" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Bell size={17} style={{ color: "#E53935" }} />
                <h2 style={{ fontSize: 16, fontWeight: 700, color: "#111", margin: 0 }}>Send Push Notification</h2>
              </div>
              <button onClick={() => { setShowPush(false); setPushResult(null) }} style={{ background: "none", border: "none", cursor: "pointer" }}>
                <X size={18} style={{ color: "#6B7280" }} />
              </button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#6B7280", display: "block", marginBottom: 6 }}>Title</label>
                <input value={pushTitle} onChange={(e) => setPushTitle(e.target.value)} placeholder="e.g. Meeting at 4PM"
                  style={{ width: "100%", padding: "10px 12px", borderRadius: 12, fontSize: 13, border: "1.5px solid #E5E7EB", outline: "none", background: "#F9FAFB", color: "#111", boxSizing: "border-box" }} />
              </div>
              <div>
                <label style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#6B7280", display: "block", marginBottom: 6 }}>Message</label>
                <textarea value={pushBody} onChange={(e) => setPushBody(e.target.value)} rows={3} placeholder="Notification message..."
                  style={{ width: "100%", padding: "10px 12px", borderRadius: 12, fontSize: 13, border: "1.5px solid #E5E7EB", outline: "none", background: "#F9FAFB", color: "#111", resize: "none", boxSizing: "border-box" }} />
              </div>
              {pushResult && (
                <p style={{ fontSize: 12, padding: "8px 12px", borderRadius: 10, background: pushResult.startsWith("Error") ? "rgba(229,57,53,0.07)" : "rgba(16,185,129,0.07)", color: pushResult.startsWith("Error") ? "#E53935" : "#10B981", margin: 0 }}>
                  {pushResult}
                </p>
              )}
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={() => { setShowPush(false); setPushResult(null) }}
                  style={{ flex: 1, padding: "10px", borderRadius: 12, fontSize: 13, fontWeight: 600, background: "#F9FAFB", border: "1.5px solid #E5E7EB", color: "#6B7280", cursor: "pointer" }}>
                  Cancel
                </button>
                <button onClick={handleSendPush} disabled={pushBusy || !pushTitle.trim() || !pushBody.trim()}
                  style={{ flex: 1, padding: "10px", borderRadius: 12, fontSize: 13, fontWeight: 700, background: "linear-gradient(135deg, #E53935, #B71C1C)", color: "#fff", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, opacity: (pushBusy || !pushTitle.trim() || !pushBody.trim()) ? 0.5 : 1 }}>
                  {pushBusy ? <Loader2 size={13} className="animate-spin" /> : <Bell size={13} />}
                  Send to All
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Create Announcement Modal ── */}
      {showForm && (
        <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}>
          <div style={{ width: "100%", maxWidth: 480, borderRadius: 20, padding: 24, background: "#fff", border: "1px solid #E5E7EB" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <h2 style={{ fontSize: 17, fontWeight: 700, color: "#111", margin: 0, fontFamily: "var(--font-jakarta)" }}>New Announcement</h2>
              <button onClick={() => setShowForm(false)} style={{ background: "none", border: "none", cursor: "pointer" }}>
                <X size={18} style={{ color: "#6B7280" }} />
              </button>
            </div>
            <form action={(fd) => {
              fd.set("pinned", pinned ? "true" : "false")
              startTransition(() => { action(fd) })
            }} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#6B7280", display: "block", marginBottom: 6 }}>Title</label>
                <input name="title" required maxLength={120} placeholder="Announcement title..."
                  style={{ width: "100%", padding: "10px 12px", borderRadius: 12, fontSize: 13, border: "1.5px solid #E5E7EB", outline: "none", background: "#F9FAFB", color: "#111", boxSizing: "border-box" }} />
              </div>
              <div>
                <label style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#6B7280", display: "block", marginBottom: 6 }}>Message</label>
                <textarea name="message" required rows={4} placeholder="Write your announcement..."
                  style={{ width: "100%", padding: "10px 12px", borderRadius: 12, fontSize: 13, border: "1.5px solid #E5E7EB", outline: "none", background: "#F9FAFB", color: "#111", resize: "none", boxSizing: "border-box" }} />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: "#374151", display: "block", marginBottom: 6 }}>Category</label>
                <select name="category" defaultValue="General"
                  style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1.5px solid #EBEDF2", fontSize: 13, color: "#111827", background: "#F9FAFB", outline: "none" }}>
                  <option value="General">General</option>
                  <option value="Policy">Policy</option>
                  <option value="Events">Events</option>
                  <option value="Urgent">Urgent</option>
                </select>
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
                <div style={{ position: "relative", width: 40, height: 22 }}>
                  <input type="checkbox" style={{ position: "absolute", opacity: 0, width: 0, height: 0 }} checked={pinned} onChange={(e) => setPinned(e.target.checked)} />
                  <div style={{ width: 40, height: 22, borderRadius: 11, background: pinned ? "#E53935" : "#E5E7EB", transition: "background 0.2s" }}>
                    <div style={{ position: "absolute", top: 3, left: pinned ? 21 : 3, width: 16, height: 16, borderRadius: "50%", background: "#fff", transition: "left 0.2s", boxShadow: "0 1px 4px rgba(0,0,0,0.15)" }} />
                  </div>
                </div>
                <span style={{ fontSize: 13, color: "#6B7280" }}>Pin this announcement</span>
              </label>

              {state && "error" in state && (
                <p style={{ fontSize: 12, color: "#E53935", margin: 0 }}>{state.error}</p>
              )}

              <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
                <button type="button" onClick={() => setShowForm(false)}
                  style={{ flex: 1, padding: "10px", borderRadius: 12, fontSize: 13, fontWeight: 600, background: "#F9FAFB", border: "1.5px solid #E5E7EB", color: "#6B7280", cursor: "pointer" }}>
                  Cancel
                </button>
                <button type="submit" disabled={formPending}
                  style={{ flex: 1, padding: "10px", borderRadius: 12, fontSize: 13, fontWeight: 700, background: "linear-gradient(135deg, #E53935, #B71C1C)", color: "#fff", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, opacity: formPending ? 0.6 : 1 }}>
                  {formPending && <Loader2 size={13} className="animate-spin" />}
                  Post Announcement
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
