"use client"

import { useMemo, useState, useTransition } from "react"
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors,
  useDraggable, useDroppable,
  type DragEndEvent, type DragStartEvent,
} from "@dnd-kit/core"
import {
  Plus, X, GripVertical, Video, Image as ImageIcon, Camera, PlaySquare, ThumbsUp,
  Building2, Store, Search, Trash2, Sparkles, Pencil,
  Layers, History, ArrowRight, Check, ChevronDown, Megaphone, Target, AlertTriangle, CalendarDays, RotateCcw, LayoutDashboard,
  MoreVertical, Users,
} from "lucide-react"
import { PageHero } from "@/components/admin/PageHero"
import ClientSelector from "@/components/ui/ClientSelector"
import { buildClientOptions } from "@/lib/utils/client-options"
import { latestEntry, isUnderperforming, cpc, cpm, frequency, costPerResult, type AdPerformanceEntry } from "@/lib/ads-tracker/performance-metrics"
import {
  createContentItem, updateContentItem, updateContentItemStatus, deleteContentItem,
  addContentPost, deleteContentPost,
  createAd, updateAd, updateAdStatus, deleteAd, addAdRevision, addAdPerformanceEntry, markReadyToPost, requestCorrection,
  createAdsVideoScript, recordVoiceOver, updateAdsVideoScript,
} from "@/lib/actions/content-tracker"
import { createTrackerShoot, completeShootWithTitles, updateShootStatus, updateShootCrew, updateTrackerShoot, deleteShoot, type CreatedShootItem } from "@/lib/actions/shoots"
import { isValidShootTransition } from "@/lib/shoots/status-transitions"
import { isValidPipelineTransition } from "@/lib/content-tracker/pipeline-transitions"
import { computeOverview, type AttentionItem } from "@/lib/content-tracker/overview"

// ── Types ────────────────────────────────────────────────────────────────────
type Platform = "instagram" | "youtube" | "facebook" | "linkedin" | "gmb"
type UseFor = Platform | "ads"
type Priority = "low" | "medium" | "high" | "urgent"
type ContentSource = "shoot" | "ads_video" | "poster"
type ContentStatus =
  | "scripting" | "voiceover" | "design" | "ready_to_edit"
  | "editing" | "edited" | "on_review" | "ready_to_post" | "posted"
type TargetingType = "broad" | "interest" | "lookalike" | "retargeting"
type AdStatus = "active" | "paused" | "testing" | "stopped"

type Person = { id: string; name: string } | null

export type ContentPost = {
  id: string
  content_item_id: string
  platform: Platform
  posted_date: string
  post_link: string | null
  postedByUser?: Person
}

export type ContentCorrection = {
  id: string
  content_item_id: string
  correction_date: string
  notes: string
  requestedByUser: Person
  assignedToUser: Person
}

export type ContentItem = {
  id: string
  client_name: string
  title: string
  content_type: "video" | "poster"
  status: ContentStatus
  source: ContentSource
  shot_date: string | null
  edited_date: string | null
  notes: string | null
  created_at: string
  // Set when the item is scheduled into "Ready to Post" — the intent, not the record.
  ready_platforms: Platform[]
  scheduled_post_date: string | null
  scheduled_post_time: string | null
  // Ads Video (Scripting) fields — null/empty for shoot- and poster-sourced items.
  hook_count: number | null
  use_for: UseFor[]
  priority: Priority | null
  voiceover_date: string | null
  reviewed_at: string | null
  shotByUser?: Person
  editedByUser?: Person
  scriptedByUser?: Person
  reviewedByUser?: Person
  voiceoverBy?: { id: string; name: string } | null
  corrections: ContentCorrection[]
  posts: ContentPost[]
}

export type VoiceFreelancer = { id: string; name: string }

export type AdRevision = {
  id: string
  ad_id: string
  revision_date: string
  notes: string
  hook_count_after: number | null
  targeting_type_after: TargetingType | null
}

export type Ad = {
  id: string
  client_name: string
  ad_name: string
  platform: string
  launch_date: string | null
  hook_count: number
  targeting_type: TargetingType | null
  targeting_notes: string | null
  status: AdStatus
  created_at: string
  revisions: AdRevision[]
  performanceEntries: AdPerformanceEntry[]
}

export type ShootStatus = "scheduled" | "going" | "completed" | "cancelled"
export type ShootTitleRef = { id: string; title: string; content_item_id: string | null }
export type Shoot = {
  id: string
  client: string
  legacyTitle: string
  start_time: string
  notes: string | null
  status: ShootStatus
  goingByUsers: { id: string; name: string }[]
  titles: ShootTitleRef[]
}

export type Member = { id: string; name: string }

type Props = {
  initialItems: ContentItem[]
  initialAds: Ad[]
  initialShoots: Shoot[]
  members: Member[]
  currentUserId: string
  clients: { id: string; name: string }[]
  pastClients: { id: string; name: string }[]
  voiceoverFreelancers: VoiceFreelancer[]
}

// ── Design tokens ────────────────────────────────────────────────────────────
const STATUS_CFG: Record<ContentStatus, { label: string; accent: string }> = {
  scripting:     { label: "Scripting",     accent: "#F97316" },
  voiceover:     { label: "Voice Over",    accent: "#EAB308" },
  design:        { label: "Design",        accent: "#F59E0B" },
  ready_to_edit: { label: "Ready to Edit", accent: "#F59E0B" },
  editing:       { label: "Editing",       accent: "#6366F1" },
  edited:        { label: "Edited",        accent: "#9B6BFF" },
  on_review:     { label: "On Review",     accent: "#EC4899" },
  ready_to_post: { label: "Ready to Post", accent: "#0EA5E9" },
  posted:        { label: "Posted",        accent: "#22C55E" },
}
// The production board's column order — differs by content type only in its first column
// (shoot/ads-video video enters at Ready to Edit; posters enter at Design).
const VIDEO_PIPELINE_ORDER: ContentStatus[] = ["ready_to_edit", "editing", "edited", "on_review", "ready_to_post"]
const POSTER_PIPELINE_ORDER: ContentStatus[] = ["design", "editing", "edited", "on_review", "ready_to_post"]
// The Ads Video sub-tab's own two-column board — feeds INTO Ready to Edit, doesn't include it.
const ADS_VIDEO_ORDER: ContentStatus[] = ["scripting", "voiceover"]
// The default "move forward" target for the generic advance button. on_review is
// deliberately absent — it branches two ways (approve / correction) and gets its own
// two-button UI instead of a single generic button. posted is terminal.
const NEXT_STATUS: Partial<Record<ContentStatus, ContentStatus>> = {
  scripting: "voiceover",
  voiceover: "ready_to_edit",
  design: "editing",
  ready_to_edit: "editing",
  editing: "edited",
  edited: "on_review",
  ready_to_post: "posted",
}

const PLATFORM_CFG: Record<Platform, { label: string; color: string; icon: typeof Camera }> = {
  instagram: { label: "Instagram", color: "#E1306C", icon: Camera },
  youtube:   { label: "YouTube",   color: "#DE1A1A", icon: PlaySquare },
  facebook:  { label: "Facebook",  color: "#1877F2", icon: ThumbsUp },
  linkedin:  { label: "LinkedIn",  color: "#0A66C2", icon: Building2 },
  gmb:       { label: "GMB",       color: "#1E8E3E", icon: Store },
}

const USE_FOR_CFG: Record<UseFor, { label: string; color: string; icon: typeof Camera }> = {
  ...PLATFORM_CFG,
  ads: { label: "Ads", color: "#D97706", icon: Megaphone },
}

const PRIORITY_CFG: Record<Priority, { label: string; color: string }> = {
  low:    { label: "Low",    color: "#6B7280" },
  medium: { label: "Medium", color: "#3B82F6" },
  high:   { label: "High",   color: "#F59E0B" },
  urgent: { label: "Urgent", color: "#DE1A1A" },
}

const TARGETING_CFG: Record<TargetingType, { label: string; color: string }> = {
  broad:       { label: "Broad",       color: "#6B7280" },
  interest:    { label: "Interest-based", color: "#6366F1" },
  lookalike:   { label: "Lookalike",   color: "#9B6BFF" },
  retargeting: { label: "Retargeting", color: "#F59E0B" },
}

const AD_STATUS_CFG: Record<AdStatus, { label: string; color: string }> = {
  active:  { label: "Active",  color: "#22C55E" },
  testing: { label: "Testing", color: "#6366F1" },
  paused:  { label: "Paused",  color: "#F59E0B" },
  stopped: { label: "Stopped", color: "#EF4444" },
}

const SHOOT_STATUS_CFG: Record<ShootStatus, { label: string; color: string }> = {
  scheduled: { label: "Scheduled", color: "#F59E0B" },
  going:     { label: "Going",     color: "#3B82F6" },
  completed: { label: "Completed", color: "#22C55E" },
  cancelled: { label: "Cancelled", color: "#EF4444" },
}
const SHOOT_STATUS_ORDER: ShootStatus[] = ["scheduled", "going", "completed", "cancelled"]
const AD_STATUS_ORDER: AdStatus[] = ["active", "testing", "paused", "stopped"]

const LABEL: React.CSSProperties = {
  display: "block", fontSize: 10, fontWeight: 700, color: "#374151",
  textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 5,
}
const FIELD: React.CSSProperties = {
  width: "100%", fontSize: 12, fontWeight: 600, color: "#374151",
  background: "#fff", border: "1.5px solid #EBEDF2", borderRadius: 10,
  padding: "8px 10px", outline: "none",
}

function initials(name?: string | null) {
  if (!name) return "?"
  return name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()
}
function fmtDate(d?: string | null) {
  if (!d) return "—"
  return new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })
}
function daysAgo(d?: string | null) {
  if (!d) return null
  const diff = Math.floor((Date.now() - new Date(d + "T00:00:00").getTime()) / 86400000)
  return diff
}
// The date that anchors "how long has this been sitting here" — shot_date for shoot
// video, voiceover_date for ads video, falling back to created_at for either if neither
// is set yet (an ads-video item still in Scripting has no voiceover_date at all).
function originDate(item: ContentItem): string | null {
  return item.shot_date ?? item.voiceover_date ?? item.created_at?.slice(0, 10) ?? null
}
function fmtMonth(ym: string) {
  const [y, m] = ym.split("-").map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "short", year: "2-digit" })
}
function fmtDateRange(dates: string[]) {
  const sorted = Array.from(new Set(dates)).sort()
  if (sorted.length === 1) return fmtDate(sorted[0])
  return `${fmtDate(sorted[0])} – ${fmtDate(sorted[sorted.length - 1])}`
}
// "14:30:00" / "14:30" -> "2:30 PM"
function fmtTime(t?: string | null): string {
  if (!t) return ""
  const [h, m] = t.split(":").map(Number)
  const period = h >= 12 ? "PM" : "AM"
  const hr = h % 12 || 12
  return `${hr}:${String(m).padStart(2, "0")} ${period}`
}
function fmtCompactNumber(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}K`
  return String(Math.round(n))
}
function fmtCurrency(n: number): string {
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`
}
function fmtMetric(n: number | null, formatter: (n: number) => string = String): string {
  return n === null ? "—" : formatter(n)
}

// ── Modal shell ──────────────────────────────────────────────────────────────
function Modal({ title, onClose, children, width = 440 }: { title: string; onClose: () => void; children: React.ReactNode; width?: number }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(17,17,17,0.5)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
      onClick={onClose}>
      <div style={{ background: "#fff", borderRadius: 20, width: "100%", maxWidth: width, maxHeight: "88vh", overflowY: "auto", boxShadow: "0 24px 64px rgba(0,0,0,0.25)" }}
        onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid #F3F4F6" }}>
          <h3 style={{ fontSize: 14, fontWeight: 800, color: "#111827", margin: 0 }}>{title}</h3>
          <button onClick={onClose} style={{ padding: 6, borderRadius: 8, background: "#F9FAFB", border: "none", cursor: "pointer" }}>
            <X size={14} style={{ color: "#6B7280" }} />
          </button>
        </div>
        <div style={{ padding: 20 }}>{children}</div>
      </div>
    </div>
  )
}

function PrimaryButton({ children, onClick, disabled, type = "button" }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean; type?: "button" | "submit" }) {
  return (
    <button type={type} onClick={onClick} disabled={disabled}
      style={{
        width: "100%", padding: "10px 16px", borderRadius: 12, border: "none",
        background: disabled ? "#E5E7EB" : "linear-gradient(135deg,#FF4D4D,#DE1A1A)",
        color: disabled ? "#9CA3AF" : "#fff", fontSize: 13, fontWeight: 800,
        cursor: disabled ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
      }}>
      {children}
    </button>
  )
}

// ── Pill toggle (tab switcher) ───────────────────────────────────────────────
// Each mode owns an accent so you always know which board you're on at a glance —
// the section rail below picks it up, tying the two levels together.
type TrackerMode = "overview" | "video" | "poster" | "ads"
const MODE_ACCENT: Record<TrackerMode, { solid: string; grad: string; glow: string; soft: string }> = {
  overview: { solid: "#0EA5E9", grad: "linear-gradient(135deg,#38BDF8,#0EA5E9)", glow: "rgba(14,165,233,0.45)", soft: "rgba(14,165,233,0.10)" },
  video: { solid: "#DE1A1A", grad: "linear-gradient(135deg,#FF4D4D,#DE1A1A)", glow: "rgba(222,26,26,0.45)", soft: "rgba(222,26,26,0.10)" },
  poster: { solid: "#7C3AED", grad: "linear-gradient(135deg,#A78BFA,#7C3AED)", glow: "rgba(124,58,237,0.45)", soft: "rgba(124,58,237,0.10)" },
  ads: { solid: "#D97706", grad: "linear-gradient(135deg,#FBBF24,#D97706)", glow: "rgba(217,119,6,0.45)", soft: "rgba(217,119,6,0.10)" },
}

const NAV_MODES: { key: TrackerMode; label: string; icon: typeof Layers }[] = [
  { key: "overview", label: "Overview", icon: LayoutDashboard },
  { key: "video", label: "Video", icon: Video },
  { key: "poster", label: "Poster", icon: ImageIcon },
  { key: "ads", label: "Ads", icon: Megaphone },
]

// Two levels, two different visual languages: the mode rail is a solid switch on dark,
// the section rail is an underlined tab strip on white. Stacking two identical pill bars
// made them read as siblings when one actually governs the other.
function TrackerNav({ mode, onMode, tab, onTab, modeCounts, sections }: {
  mode: TrackerMode
  onMode: (m: TrackerMode) => void
  tab: string
  onTab: (t: string) => void
  modeCounts: Record<TrackerMode, number>
  sections: { key: string; label: string; icon: typeof Layers; count: number }[]
}) {
  const accent = MODE_ACCENT[mode]
  return (
    <div style={{ borderRadius: 18, overflow: "hidden", border: "1px solid #E5E7EB", background: "#fff", boxShadow: "0 1px 2px rgba(16,24,40,0.05)" }}>
      <div style={{ display: "flex", gap: 4, background: "#0F172A", padding: 6 }}>
        {NAV_MODES.map(m => {
          const on = m.key === mode
          const a = MODE_ACCENT[m.key]
          const Icon = m.icon
          return (
            <button key={m.key} onClick={() => onMode(m.key)} aria-pressed={on}
              className="flex-1 md:flex-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
              style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                padding: "9px clamp(10px,2.4vw,20px)", borderRadius: 12, border: "none", cursor: "pointer",
                background: on ? a.grad : "transparent",
                boxShadow: on ? `0 6px 18px ${a.glow}` : "none",
                transition: "background .18s ease, box-shadow .18s ease",
              }}>
              <span style={{
                display: "grid", placeItems: "center", width: 24, height: 24, borderRadius: 8, flexShrink: 0,
                background: on ? "rgba(255,255,255,0.22)" : "rgba(255,255,255,0.07)",
                color: on ? "#fff" : "#94A3B8",
              }}>
                <Icon size={13} />
              </span>
              <span style={{ fontSize: 12.5, fontWeight: 800, letterSpacing: "-0.01em", color: on ? "#fff" : "#94A3B8" }}>{m.label}</span>
              <span className="hidden md:inline-block" style={{
                fontSize: 10.5, fontWeight: 800, fontVariantNumeric: "tabular-nums", lineHeight: "16px",
                minWidth: 20, textAlign: "center", padding: "0 5px", borderRadius: 6,
                color: on ? "#fff" : "#64748B",
                background: on ? "rgba(255,255,255,0.20)" : "rgba(255,255,255,0.06)",
              }}>{modeCounts[m.key]}</span>
            </button>
          )
        })}
      </div>

      {sections.length > 0 && (
        <div style={{ display: "flex", gap: "clamp(14px,3vw,26px)", padding: "0 clamp(12px,3vw,18px)", overflowX: "auto" }}>
          {sections.map(s => {
            const on = s.key === tab
            const Icon = s.icon
            return (
              <button key={s.key} onClick={() => onTab(s.key)} aria-current={on ? "page" : undefined}
                className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:rounded"
                style={{
                  position: "relative", display: "flex", alignItems: "center", gap: 7, flexShrink: 0,
                  padding: "13px 2px", background: "none", border: "none", cursor: "pointer",
                }}>
                {/* Icons are decoration here — dropped on small screens so all three labels fit without scrolling. */}
                <Icon size={13} className="hidden md:block" style={{ color: on ? accent.solid : "#94A3B8" }} />
                <span style={{
                  fontSize: 11, fontWeight: 800, letterSpacing: "0.07em", textTransform: "uppercase",
                  color: on ? "#0F172A" : "#94A3B8", whiteSpace: "nowrap",
                }}>{s.label}</span>
                <span style={{
                  fontSize: 10, fontWeight: 800, fontVariantNumeric: "tabular-nums", lineHeight: "15px",
                  padding: "0 5px", borderRadius: 5,
                  color: on ? accent.solid : "#94A3B8",
                  background: on ? accent.soft : "#F1F5F9",
                }}>{s.count}</span>
                <span aria-hidden style={{
                  position: "absolute", left: 0, right: 0, bottom: 0, height: 2.5, borderRadius: "3px 3px 0 0",
                  background: on ? accent.grad : "transparent",
                }} />
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Kanban card ──────────────────────────────────────────────────────────────
function ContentCardInner({
  item, isDraggable, isDragging, onAdvance, onDelete, onAddPlatform, onEdit, onRequestCorrection,
}: {
  item: ContentItem
  isDraggable?: boolean
  isDragging?: boolean
  onAdvance: (item: ContentItem, next: ContentStatus) => void
  onDelete: (id: string) => void
  onRequestCorrection?: (item: ContentItem) => void
  onAddPlatform: (item: ContentItem) => void
  onEdit?: (item: ContentItem) => void
}) {
  const TypeIcon = item.content_type === "video" ? Video : ImageIcon
  const age = (item.status === "ready_to_edit" || item.status === "design") ? daysAgo(originDate(item))
    : item.status === "edited" ? daysAgo(item.edited_date) : null
  const stale = age !== null && age >= 3

  // The drag overlay renders this card with no handlers, so an empty menu is expected there
  // and the kebab is simply omitted.
  const cardMenu: CardMenuItem[] = []
  if (onEdit) cardMenu.push({ label: "Edit details", icon: Pencil, onClick: () => onEdit(item) })
  if (onRequestCorrection && item.status === "on_review") {
    cardMenu.push({ label: "Needs correction", icon: RotateCcw, onClick: () => onRequestCorrection(item) })
  }
  if (onEdit) cardMenu.push({ label: "Delete", icon: Trash2, onClick: () => onDelete(item.id), danger: true })

  const next = NEXT_STATUS[item.status]

  return (
    <div className="rounded-2xl p-3.5 mb-2.5 group transition-all select-none"
      style={{
        background: isDragging ? "#F3F4F6" : "#FFFFFF",
        boxShadow: isDragging ? "0 8px 24px rgba(0,0,0,0.15)" : "0 2px 10px rgba(0,0,0,0.05)",
        border: stale ? "1px solid rgba(245,158,11,0.3)" : "1px solid transparent",
        opacity: isDragging ? 0.5 : 1,
      }}>
      <div className="flex items-start gap-2 mb-2">
        {isDraggable && (
          <span className="flex-shrink-0 mt-0.5 opacity-30 group-hover:opacity-70 transition-opacity" title="Drag anywhere on the card to move it">
            <GripVertical size={13} style={{ color: "#6B7280" }} />
          </span>
        )}
        <div style={{ width: 22, height: 22, borderRadius: 7, background: "rgba(99,102,241,0.1)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <TypeIcon size={12} style={{ color: "#6366F1" }} />
        </div>
        <p className="text-[12px] font-semibold leading-snug line-clamp-2 flex-1" style={{ color: "#111111" }}>{item.title}</p>
        {cardMenu.length > 0 && <CardMenu items={cardMenu} />}
      </div>

      <div className="flex flex-wrap items-center gap-1 mb-2.5">
        <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-full truncate max-w-[110px]"
          style={{ background: "rgba(99,102,241,0.08)", color: "#6366F1" }}>{item.client_name}</span>
        {item.source === "ads_video" && (
          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: "rgba(217,119,6,0.1)", color: "#D97706" }}>
            🎙️ Ads Video
          </span>
        )}
        {stale && (
          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full ml-auto" style={{ background: "rgba(245,158,11,0.1)", color: "#D97706" }}>
            {age}d stuck
          </span>
        )}
      </div>

      {item.priority && (
        <div className="flex flex-wrap items-center gap-1 mb-2.5">
          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: `${PRIORITY_CFG[item.priority].color}18`, color: PRIORITY_CFG[item.priority].color }}>
            {PRIORITY_CFG[item.priority].label}
          </span>
          {item.hook_count !== null && (
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: "#F3F4F6", color: "#374151" }}>
              {item.hook_count} hook{item.hook_count === 1 ? "" : "s"}
            </span>
          )}
        </div>
      )}

      {item.status === "posted" && item.posts.length > 0 && (
        <div className="flex flex-wrap items-center gap-1 mb-2.5">
          {item.posts.map(p => {
            const cfg = PLATFORM_CFG[p.platform]
            const Icon = cfg.icon
            return (
              <span key={p.id} className="flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                style={{ background: `${cfg.color}18`, color: cfg.color }}>
                <Icon size={9} /> {cfg.label}
              </span>
            )
          })}
        </div>
      )}

      <div className="flex items-center gap-2 mb-2">
        {item.shotByUser && (
          <div className="flex items-center gap-1" title={`Shot by ${item.shotByUser.name}`}>
            <div className="w-4 h-4 rounded-full flex items-center justify-center text-[7px] font-black flex-shrink-0" style={{ background: "#F59E0B", color: "#fff" }}>
              {initials(item.shotByUser.name)}
            </div>
          </div>
        )}
        {item.voiceoverBy && (item.status === "voiceover" || item.status === "ready_to_edit") && (
          <div className="flex items-center gap-1" title={`Voiced by ${item.voiceoverBy.name}`}>
            <div className="w-4 h-4 rounded-full flex items-center justify-center text-[7px] font-black flex-shrink-0" style={{ background: "#EAB308", color: "#fff" }}>
              {initials(item.voiceoverBy.name)}
            </div>
          </div>
        )}
        {/* While it's in Editing, name the editor outright — the point of asking "who's
            starting this?" is that the rest of the team can see it without hovering. */}
        {item.editedByUser && item.status === "editing" ? (
          <span className="flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full"
            title={`${item.editedByUser.name} is editing this`}
            style={{ background: "rgba(155,107,255,0.12)", color: "#9B6BFF" }}>
            <span className="w-3.5 h-3.5 rounded-full flex items-center justify-center text-[7px] font-black"
              style={{ background: "#9B6BFF", color: "#fff" }}>
              {initials(item.editedByUser.name)}
            </span>
            {item.editedByUser.name}
          </span>
        ) : item.editedByUser ? (
          <div className="flex items-center gap-1" title={`Edited by ${item.editedByUser.name}`}>
            <div className="w-4 h-4 rounded-full flex items-center justify-center text-[7px] font-black flex-shrink-0" style={{ background: "#9B6BFF", color: "#fff" }}>
              {initials(item.editedByUser.name)}
            </div>
          </div>
        ) : null}
        <span className="text-[9px]" style={{ color: "#374151", fontWeight: 600 }}>{fmtDate(originDate(item))}</span>
      </div>

      {/* Scheduled slot — shown while it's queued in Ready to Post. */}
      {item.status === "ready_to_post" && item.scheduled_post_date && (
        <div className="mb-2 p-2 rounded-xl" style={{ background: "rgba(14,165,233,0.08)" }}>
          <div className="flex items-center gap-1 mb-1">
            <CalendarDays size={10} style={{ color: "#0EA5E9" }} />
            <span className="text-[9px] font-bold" style={{ color: "#0EA5E9" }}>
              {fmtDate(item.scheduled_post_date)}{item.scheduled_post_time ? ` · ${fmtTime(item.scheduled_post_time)}` : ""}
            </span>
          </div>
          <div className="flex flex-wrap gap-1">
            {item.ready_platforms.map(p => {
              const cfg = PLATFORM_CFG[p]
              const Icon = cfg.icon
              return (
                <span key={p} className="flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                  style={{ background: `${cfg.color}18`, color: cfg.color }}>
                  <Icon size={9} /> {cfg.label}
                </span>
              )
            })}
          </div>
        </div>
      )}

      {/* Correction round-trips — shows this went back N times, and what for. */}
      {item.corrections.length > 0 && (
        <div className="mb-2">
          <span className="flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full w-fit"
            title={item.corrections.map(c => c.notes).join(" · ")}
            style={{ background: "rgba(245,158,11,0.12)", color: "#D97706" }}>
            <RotateCcw size={9} /> {item.corrections.length} correction{item.corrections.length > 1 ? "s" : ""}
          </span>
          <p className="text-[9px] mt-1 line-clamp-2" style={{ color: "#6B7280" }}>
            {item.corrections[0].notes}
          </p>
        </div>
      )}

      {/* The review gate: approve moves it on, a correction sends it back to Editing. */}
      {item.status === "on_review" ? (
        <div className="flex flex-col gap-1.5">
          <button
            onPointerDown={e => e.stopPropagation()}
            onClick={() => onAdvance(item, "ready_to_post")}
            className="w-full py-1.5 rounded-xl text-[9px] font-bold transition-all hover:opacity-80 flex items-center justify-center gap-1"
            style={{ background: `${STATUS_CFG.ready_to_post.accent}14`, color: STATUS_CFG.ready_to_post.accent }}>
            Approve <ArrowRight size={10} />
          </button>
          {onRequestCorrection && (
            <button
              onPointerDown={e => e.stopPropagation()}
              onClick={() => onRequestCorrection(item)}
              className="w-full py-1.5 rounded-xl text-[9px] font-bold transition-all hover:opacity-80 flex items-center justify-center gap-1"
              style={{ background: "rgba(245,158,11,0.1)", color: "#D97706" }}>
              <RotateCcw size={10} /> Needs Correction
            </button>
          )}
        </div>
      ) : next && (
        <button
          onPointerDown={e => e.stopPropagation()}
          onClick={() => onAdvance(item, next)}
          className="w-full py-1.5 rounded-xl text-[9px] font-bold transition-all hover:opacity-80 flex items-center justify-center gap-1"
          style={{ background: `${STATUS_CFG[next].accent}14`, color: STATUS_CFG[next].accent }}>
          {item.status === "ready_to_post" ? <>Mark Posted <ArrowRight size={10} /></> : <>Move to {STATUS_CFG[next].label} <ArrowRight size={10} /></>}
        </button>
      )}
      {item.status === "posted" && (
        <button onPointerDown={e => e.stopPropagation()} onClick={() => onAddPlatform(item)}
          className="w-full py-1.5 rounded-xl text-[9px] font-bold transition-all hover:opacity-80 flex items-center justify-center gap-1"
          style={{ background: "rgba(34,197,94,0.08)", color: "#16A34A" }}>
          <Plus size={10} /> Add Platform
        </button>
      )}

    </div>
  )
}

// ── Ads Video card — the Scripting/Voice Over board's card, distinct from
// ContentCardInner because its fields (hooks, use-for, priority) don't apply once an
// item reaches the shared Ready to Edit board (which reuses ContentCardInner).
function AdsVideoCardInner({ item, isDragging, onAdvance, onEdit, onDelete }: {
  item: ContentItem
  isDragging?: boolean
  onAdvance: (item: ContentItem, next: ContentStatus) => void
  onEdit: (item: ContentItem) => void
  onDelete: (id: string) => void
}) {
  const cardMenu: CardMenuItem[] = [
    { label: "Edit details", icon: Pencil, onClick: () => onEdit(item) },
    { label: "Delete", icon: Trash2, onClick: () => onDelete(item.id), danger: true },
  ]
  const next = NEXT_STATUS[item.status]

  return (
    <div className="rounded-2xl p-3.5 mb-2.5 group transition-all select-none"
      style={{
        background: isDragging ? "#F3F4F6" : "#FFFFFF",
        boxShadow: isDragging ? "0 8px 24px rgba(0,0,0,0.15)" : "0 2px 10px rgba(0,0,0,0.05)",
        border: "1px solid transparent",
        opacity: isDragging ? 0.5 : 1,
      }}>
      <div className="flex items-start gap-2 mb-2">
        <span className="flex-shrink-0 mt-0.5 opacity-30 group-hover:opacity-70 transition-opacity" title="Drag anywhere on the card to move it">
          <GripVertical size={13} style={{ color: "#6B7280" }} />
        </span>
        <div style={{ width: 22, height: 22, borderRadius: 7, background: "rgba(217,119,6,0.1)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Video size={12} style={{ color: "#D97706" }} />
        </div>
        <p className="text-[12px] font-semibold leading-snug line-clamp-2 flex-1" style={{ color: "#111111" }}>{item.title}</p>
        <CardMenu items={cardMenu} />
      </div>

      <div className="flex flex-wrap items-center gap-1 mb-2.5">
        <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-full truncate max-w-[110px]"
          style={{ background: "rgba(99,102,241,0.08)", color: "#6366F1" }}>{item.client_name}</span>
        {item.priority && (
          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: `${PRIORITY_CFG[item.priority].color}18`, color: PRIORITY_CFG[item.priority].color }}>
            {PRIORITY_CFG[item.priority].label}
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1 mb-2.5">
        {item.hook_count !== null && (
          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: "#F3F4F6", color: "#374151" }}>
            {item.hook_count} hook{item.hook_count === 1 ? "" : "s"}
          </span>
        )}
        {item.use_for.map(u => {
          const cfg = USE_FOR_CFG[u]
          const Icon = cfg.icon
          return (
            <span key={u} className="flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full"
              style={{ background: `${cfg.color}18`, color: cfg.color }}>
              <Icon size={9} /> {cfg.label}
            </span>
          )
        })}
      </div>

      {item.voiceoverBy && (
        <div className="flex items-center gap-1 mb-2" title={`Voiced by ${item.voiceoverBy.name}`}>
          <div className="w-4 h-4 rounded-full flex items-center justify-center text-[7px] font-black flex-shrink-0" style={{ background: "#EAB308", color: "#fff" }}>
            {initials(item.voiceoverBy.name)}
          </div>
          <span className="text-[9px]" style={{ color: "#374151", fontWeight: 600 }}>{item.voiceoverBy.name}</span>
        </div>
      )}

      {next && (
        <button
          onPointerDown={e => e.stopPropagation()}
          onClick={() => onAdvance(item, next)}
          className="w-full py-1.5 rounded-xl text-[9px] font-bold transition-all hover:opacity-80 flex items-center justify-center gap-1"
          style={{ background: `${STATUS_CFG[next].accent}14`, color: STATUS_CFG[next].accent }}>
          {item.status === "voiceover" ? <>Send to Ready to Edit <ArrowRight size={10} /></> : <>Move to {STATUS_CFG[next].label} <ArrowRight size={10} /></>}
        </button>
      )}
    </div>
  )
}

function DraggableCard(props: { item: ContentItem; isDragging: boolean; onAdvance: (item: ContentItem, next: ContentStatus) => void; onDelete: (id: string) => void; onAddPlatform: (item: ContentItem) => void; onEdit: (item: ContentItem) => void; onRequestCorrection: (item: ContentItem) => void }) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({ id: props.item.id, data: { status: props.item.status } })
  const style = transform ? { transform: `translate3d(${transform.x}px,${transform.y}px,0)` } : undefined
  return (
    // Drag handle is the whole card, not just the grip icon — a plain click still
    // reaches the buttons underneath because dnd-kit's activation distance (6px)
    // means "click with no movement" never starts a drag in the first place.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    <div ref={setNodeRef} style={{ ...style, touchAction: "none" }} {...(listeners as any)} {...(attributes as any)} className="cursor-grab active:cursor-grabbing">
      <ContentCardInner item={props.item} isDraggable isDragging={props.isDragging}
        onAdvance={props.onAdvance} onDelete={props.onDelete} onAddPlatform={props.onAddPlatform} onEdit={props.onEdit}
        onRequestCorrection={props.onRequestCorrection} />
    </div>
  )
}

function DroppableColumn({ status, isOver, children }: { status: ContentStatus; isOver: boolean; children: React.ReactNode }) {
  const { setNodeRef } = useDroppable({ id: status })
  const accent = STATUS_CFG[status].accent
  return (
    <div ref={setNodeRef} className="rounded-2xl transition-all flex flex-col"
      style={{ border: isOver ? `2px solid ${accent}` : "1px solid #E8E9EF", background: isOver ? `${accent}08` : "#F9FAFB", minHeight: 200 }}>
      {children}
    </div>
  )
}

// ── Generic kanban primitives — used by the Shoots and Ads boards. The Pipeline
// board keeps its own ContentItem-typed DraggableCard/DroppableColumn above.
function KanbanCard({ id, children }: { id: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({ id })
  const style = transform ? { transform: `translate3d(${transform.x}px,${transform.y}px,0)` } : undefined
  return (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    <div ref={setNodeRef} style={{ ...style, touchAction: "none" }} {...(listeners as any)} {...(attributes as any)} className="cursor-grab active:cursor-grabbing">
      {children}
    </div>
  )
}

function KanbanColumn({ id, accent, isOver, children }: { id: string; accent: string; isOver: boolean; children: React.ReactNode }) {
  const { setNodeRef } = useDroppable({ id })
  return (
    <div ref={setNodeRef} className="rounded-2xl transition-all flex flex-col"
      style={{ border: isOver ? `2px solid ${accent}` : "1px solid #E8E9EF", background: isOver ? `${accent}08` : "#F9FAFB", minHeight: 200 }}>
      {children}
    </div>
  )
}

function KanbanColumnHeader({ label, count, accent }: { label: string; count: number; accent: string }) {
  return (
    <div className="flex items-center justify-between px-4 py-3 rounded-t-2xl" style={{ background: "#FFFFFF", borderBottom: "1px solid #E8E9EF" }}>
      <div className="flex items-center gap-2">
        <span className="text-[13px] font-black" style={{ color: "#111111" }}>{label}</span>
        <span className="w-5 h-5 rounded-full text-[9px] font-black flex items-center justify-center" style={{ background: `${accent}20`, color: accent }}>{count}</span>
      </div>
    </div>
  )
}

// ── Shared date filters — every board gets the same month + day controls ──────
function MonthSelect({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)}
      style={{ ...FIELD, width: "auto", cursor: "pointer" }}>
      <option value="all">All Time</option>
      {options.map(m => <option key={m} value={m}>{fmtMonth(m)}</option>)}
    </select>
  )
}

function DayFilter({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-1"
      style={{ background: "#fff", border: `1.5px solid ${value ? "#DE1A1A" : "#EBEDF2"}`, borderRadius: 10, padding: "0 6px" }}>
      <CalendarDays size={13} style={{ color: value ? "#DE1A1A" : "#9CA3AF", flexShrink: 0 }} />
      <input type="date" value={value} onChange={e => onChange(e.target.value)} aria-label="Filter by day"
        style={{ border: "none", outline: "none", background: "transparent", fontSize: 12, fontWeight: 600, color: value ? "#DE1A1A" : "#6B7280", fontFamily: "inherit", cursor: "pointer", padding: "7px 2px" }} />
      {value && (
        <button onClick={() => onChange("")} title="Clear day"
          style={{ padding: "2px 6px", borderRadius: 6, border: "none", background: "rgba(222,26,26,0.08)", color: "#DE1A1A", fontSize: 11, fontWeight: 800, cursor: "pointer", lineHeight: 1 }}>
          ✕
        </button>
      )}
    </div>
  )
}

// ── Card actions menu ────────────────────────────────────────────────────────
// One kebab on every card, so Edit/Delete live in the same place no matter what you're
// looking at. onPointerDown is stopped throughout — these cards are drag handles, and
// without it opening the menu would start a drag instead.
type CardMenuItem = { label: string; icon: typeof Layers; onClick: () => void; danger?: boolean }

function CardMenu({ items }: { items: CardMenuItem[] }) {
  const [open, setOpen] = useState(false)

  return (
    <div style={{ position: "relative", flexShrink: 0 }}>
      <button
        onPointerDown={e => e.stopPropagation()}
        onClick={e => { e.stopPropagation(); setOpen(o => !o) }}
        title="Actions"
        aria-haspopup="menu"
        aria-expanded={open}
        className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 rounded"
        style={{
          display: "grid", placeItems: "center", width: 22, height: 22, borderRadius: 6,
          border: "none", background: open ? "#F1F5F9" : "transparent", cursor: "pointer",
          color: "#9CA3AF",
        }}>
        <MoreVertical size={13} />
      </button>

      {open && (
        <>
          {/* Click-away catcher. Fixed, so it also closes when you click elsewhere on the board. */}
          <div
            onPointerDown={e => e.stopPropagation()}
            onClick={e => { e.stopPropagation(); setOpen(false) }}
            style={{ position: "fixed", inset: 0, zIndex: 40 }} />

          <div role="menu"
            onPointerDown={e => e.stopPropagation()}
            style={{
              position: "absolute", right: 0, top: 24, zIndex: 41,
              minWidth: 148, overflow: "hidden",
              background: "#fff", border: "1px solid #E5E7EB", borderRadius: 10,
              boxShadow: "0 10px 28px rgba(16,24,40,0.14)",
            }}>
            {items.map(it => {
              const Icon = it.icon
              return (
                <button key={it.label} role="menuitem"
                  onClick={e => { e.stopPropagation(); setOpen(false); it.onClick() }}
                  className="w-full hover:bg-slate-50"
                  style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "8px 12px", border: "none", background: "transparent",
                    cursor: "pointer", textAlign: "left",
                    fontSize: 11.5, fontWeight: 700,
                    color: it.danger ? "#DE1A1A" : "#374151",
                  }}>
                  <Icon size={12} />
                  {it.label}
                </button>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

// ── Overview building blocks ─────────────────────────────────────────────────
function OverviewStat({ label, value, accent, onClick }: {
  label: string; value: number; accent: string; onClick: () => void
}) {
  return (
    <button onClick={onClick}
      className="text-left hover:opacity-90 transition-opacity"
      style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 16, padding: "14px 16px", cursor: "pointer" }}>
      <p style={{ fontSize: 26, fontWeight: 900, color: accent, margin: 0, letterSpacing: "-0.02em" }}>{value}</p>
      <p style={{ fontSize: 10, fontWeight: 700, color: "#374151", textTransform: "uppercase", letterSpacing: "0.06em", margin: "2px 0 0" }}>{label}</p>
    </button>
  )
}

function OverviewBlock({ title, accent, icon: Icon, rows }: {
  title: string
  accent: string
  icon: typeof Layers
  rows: { key: string; label: string; value: number; onClick: () => void }[]
}) {
  return (
    <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 18, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "12px 16px", borderBottom: "1px solid #F3F4F6" }}>
        <Icon size={13} style={{ color: accent }} />
        <span style={{ fontSize: 10, fontWeight: 700, color: "#374151", textTransform: "uppercase", letterSpacing: "0.06em" }}>{title}</span>
      </div>
      <div className="flex flex-col">
        {rows.map(r => (
          <button key={r.key} onClick={r.onClick}
            className="flex items-center justify-between hover:bg-slate-50"
            style={{ padding: "9px 16px", borderBottom: "1px solid #F9FAFB", border: "none", background: "transparent", cursor: "pointer" }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>{r.label}</span>
            <span style={{ fontSize: 13, fontWeight: 800, color: r.value > 0 ? accent : "#9CA3AF", fontVariantNumeric: "tabular-nums" }}>
              {r.value}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

function KanbanEmptyCell({ isOver, accent }: { isOver: boolean; accent: string }) {
  return (
    <div className="flex items-center justify-center py-8 rounded-xl transition-all" style={{ border: `2px dashed ${isOver ? accent : "#E5E7EB"}` }}>
      <p className="text-[11px] font-semibold" style={{ color: isOver ? accent : "#9CA3AF" }}>{isOver ? "Drop here" : "Empty"}</p>
    </div>
  )
}

// A shoot can produce a lot of videos. Wrapping 8 of them as pills turns the card into
// unreadable soup in a narrow kanban column, so: a count, then a scannable list capped at
// three, with the rest a click away. Dots rather than numbers — the videos aren't a
// sequence, and numbering would imply an order that doesn't exist.
function ShootTitleList({ titles }: { titles: ShootTitleRef[] }) {
  const [expanded, setExpanded] = useState(false)
  const COLLAPSED = 3
  const shown = expanded ? titles : titles.slice(0, COLLAPSED)
  const hidden = titles.length - shown.length

  return (
    <div style={{ marginTop: 8 }}>
      <span className="inline-flex items-center gap-1.5 text-[10px] font-bold px-2 py-1 rounded-lg"
        style={{ background: "rgba(99,102,241,0.09)", color: "#6366F1" }}>
        <Video size={10} /> {titles.length} video{titles.length === 1 ? "" : "s"}
      </span>

      <div className="flex flex-col" style={{ marginTop: 6 }}>
        {shown.map(t => (
          <div key={t.id} className="flex items-center gap-2"
            style={{ padding: "5px 0", borderBottom: "1px solid #F3F4F6" }}>
            <span style={{ width: 4, height: 4, borderRadius: "50%", background: "#6366F1", flexShrink: 0 }} />
            <span className="text-[11px] truncate" style={{ color: "#374151" }}>{t.title}</span>
          </div>
        ))}
      </div>

      {titles.length > COLLAPSED && (
        <button onPointerDown={e => e.stopPropagation()} onClick={() => setExpanded(v => !v)}
          className="text-[10px] font-bold"
          style={{ marginTop: 6, background: "none", border: "none", padding: 0, cursor: "pointer", color: expanded ? "#9CA3AF" : "#6366F1" }}>
          {expanded ? "Show less" : `+ ${hidden} more`}
        </button>
      )}
    </div>
  )
}

// ── Shoot kanban card ────────────────────────────────────────────────────────
function ShootCardInner({ shoot, isDragging, onStatus, onEditCrew, onEdit, onDelete }: {
  shoot: Shoot; isDragging?: boolean
  onStatus: (id: string, status: ShootStatus) => void
  onEditCrew?: (shoot: Shoot) => void
  onEdit?: (shoot: Shoot) => void
  onDelete?: (shoot: Shoot) => void
}) {
  const menu: CardMenuItem[] = []
  if (onEdit) menu.push({ label: "Edit shoot", icon: Pencil, onClick: () => onEdit(shoot) })
  if (onEditCrew) menu.push({ label: "Who went", icon: Users, onClick: () => onEditCrew(shoot) })
  if (onDelete) menu.push({ label: "Delete", icon: Trash2, onClick: () => onDelete(shoot), danger: true })

  return (
    <div className="rounded-2xl p-3.5 mb-2.5 select-none"
      style={{
        background: isDragging ? "#F3F4F6" : "#FFFFFF",
        boxShadow: isDragging ? "0 8px 24px rgba(0,0,0,0.15)" : "0 2px 10px rgba(0,0,0,0.05)",
        opacity: isDragging ? 0.5 : 1,
      }}>
      <div className="flex items-start justify-between gap-2">
        <div style={{ minWidth: 0 }}>
          <p className="text-[12px] font-bold leading-snug" style={{ color: "#111827", margin: 0 }}>{shoot.legacyTitle}</p>
          <p className="text-[10px]" style={{ color: "#6B7280", margin: "2px 0 0" }}>
            {shoot.client} · {fmtDate(shoot.start_time.split("T")[0])}
          </p>
        </div>
        {menu.length > 0 && <CardMenu items={menu} />}
      </div>

      {/* Video titles only exist once the shoot is marked Done — that's when they're captured. */}
      {shoot.titles.length > 0 && <ShootTitleList titles={shoot.titles} />}

      {/* Who covered the shoot. Always shown — an empty crew is itself worth seeing, and it's
          editable at any point so older shoots with nobody recorded can be filled in. */}
      {onEditCrew && (
        <div style={{ marginTop: 8 }}>
          <span className="text-[9px] font-bold uppercase tracking-[0.06em]" style={{ color: "#9CA3AF" }}>Who went</span>
          {shoot.goingByUsers.length === 0 ? (
            <button onPointerDown={e => e.stopPropagation()} onClick={() => onEditCrew(shoot)}
              className="block text-[10px] font-bold"
              style={{ marginTop: 3, background: "none", border: "none", padding: 0, cursor: "pointer", color: "#3B82F6" }}>
              + Add crew
            </button>
          ) : (
            <div className="flex flex-wrap items-center gap-1" style={{ marginTop: 3 }}>
              {shoot.goingByUsers.map(u => (
                <span key={u.id} className="flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                  title={u.name}
                  style={{ background: "rgba(59,130,246,0.1)", color: "#3B82F6" }}>
                  <span className="w-3.5 h-3.5 rounded-full flex items-center justify-center text-[7px] font-black"
                    style={{ background: "#3B82F6", color: "#fff" }}>
                    {initials(u.name)}
                  </span>
                  {u.name}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {shoot.notes && <p className="text-[10px]" style={{ color: "#6B7280", margin: "6px 0 0" }}>{shoot.notes}</p>}

      {(shoot.status === "scheduled" || shoot.status === "going") && (
        <div className="flex flex-wrap gap-1.5" style={{ marginTop: 10 }}>
          {shoot.status === "scheduled" && (
            <button onPointerDown={e => e.stopPropagation()} onClick={() => onStatus(shoot.id, "going")}
              className="text-[9px] font-bold px-2.5 py-1 rounded-lg"
              style={{ border: "none", background: "rgba(59,130,246,0.1)", color: "#3B82F6", cursor: "pointer" }}>
              Mark Going
            </button>
          )}
          {shoot.status === "going" && (
            <button onPointerDown={e => e.stopPropagation()} onClick={() => onStatus(shoot.id, "completed")}
              className="text-[9px] font-bold px-2.5 py-1 rounded-lg"
              style={{ border: "none", background: "rgba(34,197,94,0.1)", color: "#16A34A", cursor: "pointer" }}>
              Mark Done
            </button>
          )}
          <button onPointerDown={e => e.stopPropagation()} onClick={() => onStatus(shoot.id, "cancelled")}
            className="text-[9px] font-bold px-2.5 py-1 rounded-lg"
            style={{ border: "none", background: "rgba(239,68,68,0.08)", color: "#EF4444", cursor: "pointer" }}>
            Cancel
          </button>
        </div>
      )}
    </div>
  )
}

// ── Ad kanban card ───────────────────────────────────────────────────────────
function AdCardInner({ ad, expanded, isDragging, onToggleExpand, onLogPerformance, onLogCorrection, onDelete, onEdit }: {
  ad: Ad; expanded?: boolean; isDragging?: boolean
  onToggleExpand: (id: string) => void
  onLogPerformance: (ad: Ad) => void
  onLogCorrection: (ad: Ad) => void
  onDelete: (id: string) => void
  onEdit?: (ad: Ad) => void
}) {
  const latest = latestEntry(ad.performanceEntries)
  const underperforming = isUnderperforming(ad.performanceEntries)

  // The drag overlay passes no-op handlers, so the kebab is omitted there.
  const cardMenu: CardMenuItem[] = []
  if (onEdit) {
    cardMenu.push({ label: "Edit ad", icon: Pencil, onClick: () => onEdit(ad) })
    cardMenu.push({ label: "Log performance", icon: Target, onClick: () => onLogPerformance(ad) })
    cardMenu.push({ label: "Log correction", icon: RotateCcw, onClick: () => onLogCorrection(ad) })
    cardMenu.push({ label: "Delete", icon: Trash2, onClick: () => onDelete(ad.id), danger: true })
  }

  return (
    <div className="rounded-2xl mb-2.5 select-none" style={{
      background: isDragging ? "#F3F4F6" : "#FFFFFF",
      border: `1px solid ${underperforming ? "#FCA5A5" : "transparent"}`,
      boxShadow: isDragging ? "0 8px 24px rgba(0,0,0,0.15)" : "0 2px 10px rgba(0,0,0,0.05)",
      opacity: isDragging ? 0.5 : 1,
      // Not `hidden` — the kebab's dropdown escapes the card bounds and would be clipped.
      overflow: "visible",
    }}>
      <div className="p-3.5 cursor-pointer" onClick={() => onToggleExpand(ad.id)}>
        <div className="flex items-start justify-between gap-2">
          <p className="text-[12px] font-bold leading-snug" style={{ color: "#111827", margin: 0 }}>{ad.ad_name}</p>
          <div className="flex items-center gap-1 flex-shrink-0">
            {cardMenu.length > 0 && <CardMenu items={cardMenu} />}
            <ChevronDown size={13} style={{ color: "#9CA3AF", transform: expanded ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
          </div>
        </div>
        <p className="text-[10px]" style={{ color: "#6B7280", margin: "2px 0 0" }}>{ad.client_name} · {ad.platform}</p>
        <p className="text-[10px]" style={{ color: "#6B7280", margin: "4px 0 0" }}>
          {latest
            ? `${fmtCurrency(latest.spend)} · ${latest.ctr}% CTR · ${latest.results} results`
            : "No performance logged"}
        </p>

        <div className="flex flex-wrap items-center gap-1" style={{ marginTop: 8 }}>
          {underperforming && (
            <span className="flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full"
              style={{ background: "rgba(239,68,68,0.1)", color: "#EF4444" }}>
              <AlertTriangle size={9} /> Underperforming
            </span>
          )}
          <span className="flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full"
            style={{ background: "rgba(99,102,241,0.1)", color: "#6366F1" }}>
            <Target size={9} /> {ad.hook_count} hooks
          </span>
          {ad.targeting_type && (
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
              style={{ background: `${TARGETING_CFG[ad.targeting_type].color}14`, color: TARGETING_CFG[ad.targeting_type].color }}>
              {TARGETING_CFG[ad.targeting_type].label}
            </span>
          )}
        </div>
      </div>

      {expanded && (
        <div style={{ padding: "0 14px 14px", borderTop: "1px solid #F3F4F6" }} onPointerDown={e => e.stopPropagation()}>
          {ad.targeting_notes && <p className="text-[10px]" style={{ color: "#6B7280", margin: "10px 0" }}>{ad.targeting_notes}</p>}

          <div className="flex items-center justify-between" style={{ marginTop: 10, marginBottom: 6 }}>
            <span className="text-[10px] font-bold uppercase tracking-[0.06em]" style={{ color: "#16A34A" }}>Performance</span>
            <button onClick={() => onLogPerformance(ad)}
              className="flex items-center gap-1 text-[9px] font-bold px-2 py-1 rounded-lg"
              style={{ border: "none", background: "rgba(34,197,94,0.08)", color: "#16A34A", cursor: "pointer" }}>
              <Plus size={10} /> Log
            </button>
          </div>
          {ad.performanceEntries.length === 0 ? (
            <p className="text-[10px]" style={{ color: "#6B7280" }}>No performance logged yet</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {[...ad.performanceEntries].sort((a, b) => b.entry_date.localeCompare(a.entry_date)).map(entry => (
                <div key={entry.id} style={{ padding: "6px 10px", borderRadius: 8, background: "#F9FAFB", border: "1px solid #F3F4F6" }}>
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] font-bold" style={{ color: "#374151" }}>{fmtDate(entry.entry_date)}</span>
                    <span className="text-[9px] font-bold" style={{ color: entry.ctr < 1 ? "#EF4444" : "#16A34A" }}>{entry.ctr}% CTR</span>
                  </div>
                  <div className="flex flex-wrap gap-x-2 gap-y-0.5" style={{ marginTop: 3 }}>
                    <span className="text-[9px]" style={{ color: "#6B7280" }}>{fmtCurrency(entry.spend)} spend</span>
                    <span className="text-[9px]" style={{ color: "#6B7280" }}>{fmtCompactNumber(entry.reach)} reach</span>
                    <span className="text-[9px]" style={{ color: "#6B7280" }}>{entry.clicks} clicks</span>
                    <span className="text-[9px]" style={{ color: "#6B7280" }}>{entry.results} results</span>
                    <span className="text-[9px]" style={{ color: "#6B7280" }}>CPC {fmtMetric(cpc(entry), fmtCurrency)}</span>
                    <span className="text-[9px]" style={{ color: "#6B7280" }}>CPM {fmtMetric(cpm(entry), fmtCurrency)}</span>
                    <span className="text-[9px]" style={{ color: "#6B7280" }}>Freq {fmtMetric(frequency(entry), n => n.toFixed(2))}</span>
                    <span className="text-[9px]" style={{ color: "#6B7280" }}>Cost/Result {fmtMetric(costPerResult(entry), fmtCurrency)}</span>
                  </div>
                  {entry.note && <p className="text-[9px]" style={{ color: "#6B7280", margin: "3px 0 0" }}>{entry.note}</p>}
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center justify-between" style={{ marginTop: 12, marginBottom: 6 }}>
            <span className="text-[10px] font-bold uppercase tracking-[0.06em]" style={{ color: "#6366F1" }}>Correction History</span>
            <button onClick={() => onLogCorrection(ad)}
              className="flex items-center gap-1 text-[9px] font-bold px-2 py-1 rounded-lg"
              style={{ border: "none", background: "rgba(99,102,241,0.08)", color: "#6366F1", cursor: "pointer" }}>
              <Plus size={10} /> Log
            </button>
          </div>
          {ad.revisions.length === 0 ? (
            <p className="text-[10px]" style={{ color: "#6B7280" }}>No corrections logged yet</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {ad.revisions.map(rev => (
                <div key={rev.id} style={{ padding: "6px 10px", borderRadius: 8, background: "#F9FAFB", border: "1px solid #F3F4F6" }}>
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] font-bold" style={{ color: "#374151" }}>{fmtDate(rev.revision_date)}</span>
                    <div className="flex gap-1">
                      {rev.hook_count_after !== null && <span className="text-[9px] font-bold" style={{ color: "#6366F1" }}>{rev.hook_count_after} hooks</span>}
                      {rev.targeting_type_after && <span className="text-[9px] font-bold" style={{ color: TARGETING_CFG[rev.targeting_type_after].color }}>· {TARGETING_CFG[rev.targeting_type_after].label}</span>}
                    </div>
                  </div>
                  <p className="text-[9px]" style={{ color: "#6B7280", margin: "3px 0 0" }}>{rev.notes}</p>
                </div>
              ))}
            </div>
          )}

          <button onClick={() => onDelete(ad.id)}
            className="flex items-center gap-1 text-[9px] font-bold px-2 py-1 rounded-lg"
            style={{ marginTop: 10, border: "none", background: "rgba(222,26,26,0.06)", color: "#de1a1a", cursor: "pointer" }}>
            <Trash2 size={10} /> Delete Ad
          </button>
        </div>
      )}
    </div>
  )
}

// ── New Content modal ────────────────────────────────────────────────────────
function NewContentModal({ clients, pastClients, defaultContentType = "video", onClose, onCreated }: {
  defaultContentType?: "video" | "poster"
  clients: { id: string; name: string }[]; pastClients: { id: string; name: string }[]
  onClose: () => void; onCreated: (item: ContentItem) => void
}) {
  const { activeOptions: activeClientOptions, pastOptions: pastClientOptions } = useMemo(
    () => buildClientOptions(clients.map(c => c.name), pastClients.map(c => c.name)),
    [clients, pastClients]
  )
  const [client, setClient] = useState("")
  const [title, setTitle] = useState("")
  // Fixed by the tab you're in (Video vs Poster) — no picker, so you can't create a video
  // from Poster mode and have it immediately vanish from the board.
  const contentType = defaultContentType
  const [shotDate, setShotDate] = useState(new Date().toISOString().split("T")[0])
  const [notes, setNotes] = useState("")
  const [alreadyPosted, setAlreadyPosted] = useState(false)
  const [postedPlatforms, setPostedPlatforms] = useState<Platform[]>([])
  const [postedDate, setPostedDate] = useState(new Date().toISOString().split("T")[0])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function togglePlatform(p: Platform) {
    setPostedPlatforms(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p])
  }

  async function submit() {
    if (!client || !title.trim()) { setError("Client and title are required"); return }
    if (alreadyPosted && postedPlatforms.length === 0) { setError("Pick at least one platform it was posted to"); return }
    setSaving(true); setError(null)
    const res = await createContentItem({
      client_name: client, title: title.trim(), content_type: contentType, shot_date: shotDate, notes: notes.trim() || undefined,
      posted_platforms: alreadyPosted ? postedPlatforms : undefined,
      posted_date: alreadyPosted ? postedDate : undefined,
    })
    setSaving(false)
    if (!res.success || !res.id) { setError(res.error ?? "Failed to save"); return }
    onCreated({
      id: res.id, client_name: client, title: title.trim(), content_type: contentType,
      status: alreadyPosted ? "posted" : (contentType === "poster" ? "design" : "ready_to_edit"),
      source: contentType === "poster" ? "poster" : "shoot",
      ready_platforms: [], scheduled_post_date: null, scheduled_post_time: null, corrections: [],
      hook_count: null, use_for: [], priority: null, voiceover_date: null, reviewed_at: null,
      shot_date: shotDate, edited_date: alreadyPosted ? postedDate : null, notes: notes.trim() || null, created_at: new Date().toISOString(),
      posts: alreadyPosted ? postedPlatforms.map((platform, i) => ({ id: `${res.id}-${i}`, content_item_id: res.id!, platform, posted_date: postedDate, post_link: null })) : [],
    })
  }

  return (
    <Modal title="New Content Item" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <ClientSelector clientOptions={activeClientOptions} pastClientOptions={pastClientOptions} value={client} onValueChange={setClient} required />
        <div>
          <label style={LABEL}>Title *</label>
          <input style={FIELD} value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Sports Day Highlights" />
        </div>
        <div>
          <label style={LABEL}>Shot Date</label>
          <input type="date" style={FIELD} value={shotDate} onChange={e => setShotDate(e.target.value)} />
        </div>
        <div>
          <label style={LABEL}>Notes</label>
          <textarea style={{ ...FIELD, minHeight: 60, resize: "vertical" }} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional" />
        </div>

        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", padding: "10px 12px", borderRadius: 10, background: alreadyPosted ? "rgba(34,197,94,0.06)" : "#F9FAFB", border: `1.5px solid ${alreadyPosted ? "rgba(34,197,94,0.3)" : "#E5E7EB"}` }}>
          <input type="checkbox" checked={alreadyPosted} onChange={e => setAlreadyPosted(e.target.checked)} style={{ width: 15, height: 15, accentColor: "#22C55E" }} />
          <span style={{ fontSize: 12, fontWeight: 700, color: alreadyPosted ? "#16A34A" : "#374151" }}>Already posted</span>
          <span style={{ fontSize: 10, color: "#374151", fontWeight: 600 }}>— skip Editing/Edited, log it straight as Posted</span>
        </label>

        {alreadyPosted && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: 12, borderRadius: 12, background: "#F9FAFB", border: "1px solid #F3F4F6" }}>
            <div>
              <label style={LABEL}>Posted To (pick all platforms) *</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {(Object.keys(PLATFORM_CFG) as Platform[]).map(p => {
                  const cfg = PLATFORM_CFG[p]
                  const on = postedPlatforms.includes(p)
                  return (
                    <button key={p} type="button" onClick={() => togglePlatform(p)}
                      style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 10, border: `1.5px solid ${on ? cfg.color : "#E5E7EB"}`, background: on ? `${cfg.color}14` : "#fff", color: on ? cfg.color : "#6B7280", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                      <cfg.icon size={12} /> {cfg.label} {on && <Check size={10} />}
                    </button>
                  )
                })}
              </div>
            </div>
            <div>
              <label style={LABEL}>Posted Date *</label>
              <input type="date" style={FIELD} value={postedDate} onChange={e => setPostedDate(e.target.value)} />
            </div>
          </div>
        )}

        {error && <p style={{ fontSize: 11, color: "#DE1A1A", margin: 0 }}>{error}</p>}
        <PrimaryButton onClick={submit} disabled={saving}>{saving ? "Saving…" : "Add Content Item"}</PrimaryButton>
      </div>
    </Modal>
  )
}

// ── New Ads Video modal — Scripting stage ────────────────────────────────────
function NewAdsVideoModal({ clients, pastClients, onClose, onCreated }: {
  clients: { id: string; name: string }[]; pastClients: { id: string; name: string }[]
  onClose: () => void; onCreated: (item: ContentItem) => void
}) {
  const { activeOptions: activeClientOptions, pastOptions: pastClientOptions } = useMemo(
    () => buildClientOptions(clients.map(c => c.name), pastClients.map(c => c.name)),
    [clients, pastClients]
  )
  const [client, setClient] = useState("")
  const [title, setTitle] = useState("")
  const [hookCount, setHookCount] = useState(1)
  const [useFor, setUseFor] = useState<UseFor[]>([])
  const [priority, setPriority] = useState<Priority>("medium")
  const [notes, setNotes] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function toggleUseFor(u: UseFor) {
    setUseFor(prev => prev.includes(u) ? prev.filter(x => x !== u) : [...prev, u])
  }

  async function submit() {
    if (!client || !title.trim()) { setError("Client and title are required"); return }
    if (useFor.length === 0) { setError("Pick at least one \"use for\""); return }
    setSaving(true); setError(null)
    const res = await createAdsVideoScript({ client_name: client, title: title.trim(), hook_count: hookCount, use_for: useFor, priority, notes: notes.trim() || undefined })
    setSaving(false)
    if (!res.success || !res.id) { setError(res.error ?? "Failed to save"); return }
    onCreated({
      id: res.id, client_name: client, title: title.trim(), content_type: "video", source: "ads_video",
      status: "scripting", shot_date: null, edited_date: null, notes: notes.trim() || null, created_at: new Date().toISOString(),
      ready_platforms: [], scheduled_post_date: null, scheduled_post_time: null, corrections: [],
      hook_count: hookCount, use_for: useFor, priority, voiceover_date: null, reviewed_at: null, posts: [],
    })
  }

  return (
    <Modal title="New Ads Video" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <ClientSelector clientOptions={activeClientOptions} pastClientOptions={pastClientOptions} value={client} onValueChange={setClient} required />
        <div>
          <label style={LABEL}>Title *</label>
          <input style={FIELD} value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Diwali Offer Hook Set" />
        </div>
        <div>
          <label style={LABEL}>How many hooks?</label>
          <input type="number" min={0} style={FIELD} value={hookCount} onChange={e => setHookCount(Math.max(0, Number(e.target.value)))} />
        </div>
        <div>
          <label style={LABEL}>Use For * <span style={{ fontWeight: 600, textTransform: "none" }}>(pick one or more)</span></label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {(Object.keys(USE_FOR_CFG) as UseFor[]).map(u => {
              const cfg = USE_FOR_CFG[u]
              const Icon = cfg.icon
              const on = useFor.includes(u)
              return (
                <button key={u} type="button" onClick={() => toggleUseFor(u)}
                  style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 10, border: `1.5px solid ${on ? cfg.color : "#E5E7EB"}`, background: on ? `${cfg.color}14` : "#fff", color: on ? cfg.color : "#6B7280", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                  <Icon size={12} /> {cfg.label} {on && <Check size={10} />}
                </button>
              )
            })}
          </div>
        </div>
        <div>
          <label style={LABEL}>Priority</label>
          <select style={{ ...FIELD, cursor: "pointer" }} value={priority} onChange={e => setPriority(e.target.value as Priority)}>
            {(Object.keys(PRIORITY_CFG) as Priority[]).map(p => <option key={p} value={p}>{PRIORITY_CFG[p].label}</option>)}
          </select>
        </div>
        <div>
          <label style={LABEL}>Notes <span style={{ fontWeight: 600, textTransform: "none" }}>(the script brief)</span></label>
          <textarea style={{ ...FIELD, minHeight: 60, resize: "vertical" }} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional" />
        </div>
        {error && <p style={{ fontSize: 11, color: "#DE1A1A", margin: 0 }}>{error}</p>}
        <PrimaryButton onClick={submit} disabled={saving}>{saving ? "Saving…" : "Add to Scripting"}</PrimaryButton>
      </div>
    </Modal>
  )
}

// ── Edit Ads Video modal — same field set as creation, pre-filled ───────────
function EditAdsVideoModal({ item, clients, pastClients, onClose, onSaved }: {
  item: ContentItem
  clients: { id: string; name: string }[]; pastClients: { id: string; name: string }[]
  onClose: () => void
  onSaved: (updates: { client_name: string; title: string; hook_count: number; use_for: UseFor[]; priority: Priority; notes: string }) => void
}) {
  const { activeOptions: activeClientOptions, pastOptions: pastClientOptions } = useMemo(
    () => buildClientOptions(clients.map(c => c.name), pastClients.map(c => c.name)),
    [clients, pastClients]
  )
  const [client, setClient] = useState(item.client_name)
  const [title, setTitle] = useState(item.title)
  const [hookCount, setHookCount] = useState(item.hook_count ?? 0)
  const [useFor, setUseFor] = useState<UseFor[]>(item.use_for)
  const [priority, setPriority] = useState<Priority>(item.priority ?? "medium")
  const [notes, setNotes] = useState(item.notes || "")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function toggleUseFor(u: UseFor) {
    setUseFor(prev => prev.includes(u) ? prev.filter(x => x !== u) : [...prev, u])
  }

  async function submit() {
    if (!client || !title.trim()) { setError("Client and title are required"); return }
    if (useFor.length === 0) { setError("Pick at least one \"use for\""); return }
    setSaving(true); setError(null)
    const res = await updateAdsVideoScript({ content_item_id: item.id, client_name: client, title: title.trim(), hook_count: hookCount, use_for: useFor, priority, notes: notes.trim() || undefined })
    setSaving(false)
    if (!res.success) { setError(res.error ?? "Failed to save"); return }
    onSaved({ client_name: client, title: title.trim(), hook_count: hookCount, use_for: useFor, priority, notes: notes.trim() })
  }

  return (
    <Modal title="Edit Ads Video" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <ClientSelector clientOptions={activeClientOptions} pastClientOptions={pastClientOptions} value={client} onValueChange={setClient} required />
        <div>
          <label style={LABEL}>Title *</label>
          <input style={FIELD} value={title} onChange={e => setTitle(e.target.value)} />
        </div>
        <div>
          <label style={LABEL}>How many hooks?</label>
          <input type="number" min={0} style={FIELD} value={hookCount} onChange={e => setHookCount(Math.max(0, Number(e.target.value)))} />
        </div>
        <div>
          <label style={LABEL}>Use For * <span style={{ fontWeight: 600, textTransform: "none" }}>(pick one or more)</span></label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {(Object.keys(USE_FOR_CFG) as UseFor[]).map(u => {
              const cfg = USE_FOR_CFG[u]
              const Icon = cfg.icon
              const on = useFor.includes(u)
              return (
                <button key={u} type="button" onClick={() => toggleUseFor(u)}
                  style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 10, border: `1.5px solid ${on ? cfg.color : "#E5E7EB"}`, background: on ? `${cfg.color}14` : "#fff", color: on ? cfg.color : "#6B7280", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                  <Icon size={12} /> {cfg.label} {on && <Check size={10} />}
                </button>
              )
            })}
          </div>
        </div>
        <div>
          <label style={LABEL}>Priority</label>
          <select style={{ ...FIELD, cursor: "pointer" }} value={priority} onChange={e => setPriority(e.target.value as Priority)}>
            {(Object.keys(PRIORITY_CFG) as Priority[]).map(p => <option key={p} value={p}>{PRIORITY_CFG[p].label}</option>)}
          </select>
        </div>
        <div>
          <label style={LABEL}>Notes</label>
          <textarea style={{ ...FIELD, minHeight: 60, resize: "vertical" }} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional" />
        </div>
        {error && <p style={{ fontSize: 11, color: "#DE1A1A", margin: 0 }}>{error}</p>}
        <PrimaryButton onClick={submit} disabled={saving}>{saving ? "Saving…" : "Save Changes"}</PrimaryButton>
      </div>
    </Modal>
  )
}

// ── Edit Content modal ───────────────────────────────────────────────────────
function EditContentModal({ item, clients, pastClients, onClose, onSaved }: {
  item: ContentItem
  clients: { id: string; name: string }[]; pastClients: { id: string; name: string }[]
  onClose: () => void; onSaved: (updates: { client_name: string; title: string; content_type: "video" | "poster"; shot_date: string; notes: string }) => void
}) {
  const { activeOptions: activeClientOptions, pastOptions: pastClientOptions } = useMemo(
    () => buildClientOptions(clients.map(c => c.name), pastClients.map(c => c.name)),
    [clients, pastClients]
  )
  const [client, setClient] = useState(item.client_name)
  const [title, setTitle] = useState(item.title)
  // Not editable — changing a poster into a video (or vice versa) would move it to the
  // other tab and make it look like it disappeared.
  const contentType = item.content_type
  const [shotDate, setShotDate] = useState(item.shot_date || new Date().toISOString().split("T")[0])
  const [notes, setNotes] = useState(item.notes || "")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    if (!client || !title.trim()) { setError("Client and title are required"); return }
    setSaving(true); setError(null)
    const res = await updateContentItem(item.id, { client_name: client, title: title.trim(), content_type: contentType, shot_date: shotDate, notes: notes.trim() || undefined })
    setSaving(false)
    if (!res.success) { setError(res.error ?? "Failed to save"); return }
    onSaved({ client_name: client, title: title.trim(), content_type: contentType, shot_date: shotDate, notes: notes.trim() })
  }

  return (
    <Modal title="Edit Content Item" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <ClientSelector clientOptions={activeClientOptions} pastClientOptions={pastClientOptions} value={client} onValueChange={setClient} required />
        <div>
          <label style={LABEL}>Title *</label>
          <input style={FIELD} value={title} onChange={e => setTitle(e.target.value)} />
        </div>
        <div>
          <label style={LABEL}>Shot Date</label>
          <input type="date" style={FIELD} value={shotDate} onChange={e => setShotDate(e.target.value)} />
        </div>
        <div>
          <label style={LABEL}>Notes</label>
          <textarea style={{ ...FIELD, minHeight: 60, resize: "vertical" }} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional" />
        </div>
        {error && <p style={{ fontSize: 11, color: "#DE1A1A", margin: 0 }}>{error}</p>}
        <PrimaryButton onClick={submit} disabled={saving}>{saving ? "Saving…" : "Save Changes"}</PrimaryButton>
      </div>
    </Modal>
  )
}

// ── Add Platform Post modal ──────────────────────────────────────────────────
function AddPlatformModal({ item, members, currentUserId, onClose, onAdded }: {
  item: ContentItem; members: Member[]; currentUserId: string
  onClose: () => void; onAdded: (posts: ContentPost[]) => void
}) {
  const already = useMemo(() => new Set(item.posts.map(p => p.platform)), [item.posts])
  // Prefill from what was scheduled at "Ready to Post" — you already picked the platforms
  // and date then, so don't make anyone pick them twice. Still editable in case it changed.
  const [platforms, setPlatforms] = useState<Platform[]>(
    () => (item.ready_platforms ?? []).filter(p => !already.has(p))
  )
  const [postedDate, setPostedDate] = useState(
    item.scheduled_post_date || new Date().toISOString().split("T")[0]
  )
  const [postLink, setPostLink] = useState("")
  // Who's posting — defaults to whoever clicked, but can be assigned to someone else.
  const [postedBy, setPostedBy] = useState(
    members.some(m => m.id === currentUserId) ? currentUserId : (members[0]?.id ?? "")
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function toggle(p: Platform) {
    setPlatforms(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p])
  }

  async function submit() {
    if (platforms.length === 0) { setError("Pick at least one platform"); return }
    setSaving(true); setError(null)

    // One post row per platform — the date, link and poster are shared across the batch.
    const results = await Promise.all(platforms.map(platform =>
      addContentPost({
        content_item_id: item.id, platform, posted_date: postedDate,
        post_link: postLink.trim() || undefined,
        posted_by: postedBy || undefined,
      }).then(res => ({ res, platform }))
    ))
    setSaving(false)

    const failed = results.find(r => !r.res.success || !r.res.id)
    if (failed) { setError(failed.res.error ?? "Failed to save"); return }

    const poster = members.find(m => m.id === postedBy) ?? null
    onAdded(results.map(({ res, platform }) => ({
      id: res.id!, content_item_id: item.id, platform,
      posted_date: postedDate, post_link: postLink.trim() || null,
      postedByUser: poster,
    })))
  }

  return (
    <Modal title={`Post "${item.title}"`} onClose={onClose}>
      <div className="flex flex-col gap-3">
        <div>
          <label style={LABEL}>Platforms * <span style={{ fontWeight: 600, textTransform: "none" }}>(pick one or more)</span></label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {(Object.keys(PLATFORM_CFG) as Platform[]).map(p => {
              const cfg = PLATFORM_CFG[p]
              const Icon = cfg.icon
              const done = already.has(p)
              const on = platforms.includes(p)
              return (
                <button key={p} onClick={() => toggle(p)} disabled={done}
                  style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 10, border: `1.5px solid ${on ? cfg.color : "#E5E7EB"}`, background: on ? `${cfg.color}14` : done ? "#F9FAFB" : "#fff", color: done ? "#D1D5DB" : on ? cfg.color : "#6B7280", fontSize: 11, fontWeight: 700, cursor: done ? "not-allowed" : "pointer" }}>
                  <Icon size={12} /> {cfg.label} {done ? <Check size={10} /> : on ? <Check size={10} /> : null}
                </button>
              )
            })}
          </div>
          {already.size > 0 && (
            <p className="text-[10px]" style={{ color: "#6B7280", margin: "6px 0 0" }}>
              Greyed-out platforms are already posted.
            </p>
          )}
        </div>
        {members.length > 0 && (
          <div>
            <label style={LABEL}>Posted By *</label>
            <select style={{ ...FIELD, cursor: "pointer" }} value={postedBy} onChange={e => setPostedBy(e.target.value)}>
              {members.map(m => (
                <option key={m.id} value={m.id}>{m.name}{m.id === currentUserId ? " (me)" : ""}</option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label style={LABEL}>Posted Date *</label>
          <input type="date" style={FIELD} value={postedDate} onChange={e => setPostedDate(e.target.value)} />
        </div>
        <div>
          <label style={LABEL}>Post Link</label>
          <input style={FIELD} value={postLink} onChange={e => setPostLink(e.target.value)} placeholder="Optional URL" />
        </div>
        {error && <p style={{ fontSize: 11, color: "#DE1A1A", margin: 0 }}>{error}</p>}
        <PrimaryButton onClick={submit} disabled={saving}>
          {saving ? "Saving…" : `Confirm Posted${platforms.length > 0 ? ` (${platforms.length})` : ""}`}
        </PrimaryButton>
      </div>
    </Modal>
  )
}

// ── New Ad modal ─────────────────────────────────────────────────────────────
function NewAdModal({ clients, pastClients, onClose, onCreated }: {
  clients: { id: string; name: string }[]; pastClients: { id: string; name: string }[]
  onClose: () => void; onCreated: (ad: Ad) => void
}) {
  const { activeOptions: activeClientOptions, pastOptions: pastClientOptions } = useMemo(
    () => buildClientOptions(clients.map(c => c.name), pastClients.map(c => c.name)),
    [clients, pastClients]
  )
  const [client, setClient] = useState("")
  const [adName, setAdName] = useState("")
  const [platform, setPlatform] = useState("Meta Ads")
  const [launchDate, setLaunchDate] = useState(new Date().toISOString().split("T")[0])
  const [hookCount, setHookCount] = useState(1)
  const [targeting, setTargeting] = useState<TargetingType | "">("")
  const [notes, setNotes] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    if (!client || !adName.trim()) { setError("Client and ad name are required"); return }
    setSaving(true); setError(null)
    const res = await createAd({ client_name: client, ad_name: adName.trim(), platform, launch_date: launchDate, hook_count: hookCount, targeting_type: targeting || undefined, targeting_notes: notes.trim() || undefined })
    setSaving(false)
    if (!res.success || !res.id) { setError(res.error ?? "Failed to save"); return }
    onCreated({
      id: res.id, client_name: client, ad_name: adName.trim(), platform, launch_date: launchDate, hook_count: hookCount,
      targeting_type: targeting || null, targeting_notes: notes.trim() || null, status: "active", created_at: new Date().toISOString(), revisions: [],
      performanceEntries: [],
    })
  }

  return (
    <Modal title="New Ad" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <ClientSelector clientOptions={activeClientOptions} pastClientOptions={pastClientOptions} value={client} onValueChange={setClient} required />
        <div>
          <label style={LABEL}>Ad / Video Name *</label>
          <input style={FIELD} value={adName} onChange={e => setAdName(e.target.value)} placeholder="e.g. Summer Offer Hook Test" />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div>
            <label style={LABEL}>Platform</label>
            <input style={FIELD} value={platform} onChange={e => setPlatform(e.target.value)} placeholder="Meta Ads / Google Ads" />
          </div>
          <div>
            <label style={LABEL}>Launch Date</label>
            <input type="date" style={FIELD} value={launchDate} onChange={e => setLaunchDate(e.target.value)} />
          </div>
        </div>
        <div>
          <label style={LABEL}>Hook Count</label>
          <input type="number" min={0} style={FIELD} value={hookCount} onChange={e => setHookCount(Number(e.target.value))} />
        </div>
        <div>
          <label style={LABEL}>Targeting Strategy</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {(Object.keys(TARGETING_CFG) as TargetingType[]).map(t => (
              <button key={t} onClick={() => setTargeting(targeting === t ? "" : t)}
                style={{ padding: "6px 12px", borderRadius: 10, border: `1.5px solid ${targeting === t ? TARGETING_CFG[t].color : "#E5E7EB"}`, background: targeting === t ? `${TARGETING_CFG[t].color}14` : "#fff", color: targeting === t ? TARGETING_CFG[t].color : "#6B7280", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                {TARGETING_CFG[t].label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label style={LABEL}>Strategy Notes</label>
          <textarea style={{ ...FIELD, minHeight: 50, resize: "vertical" }} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional" />
        </div>
        {error && <p style={{ fontSize: 11, color: "#DE1A1A", margin: 0 }}>{error}</p>}
        <PrimaryButton onClick={submit} disabled={saving}>{saving ? "Saving…" : "Add Ad"}</PrimaryButton>
      </div>
    </Modal>
  )
}

// ── Log Correction modal ─────────────────────────────────────────────────────
function AdRevisionModal({ ad, onClose, onAdded }: { ad: Ad; onClose: () => void; onAdded: (rev: AdRevision) => void }) {
  const [notes, setNotes] = useState("")
  const [hookCount, setHookCount] = useState<number | "">("")
  const [targeting, setTargeting] = useState<TargetingType | "">("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    if (!notes.trim()) { setError("Describe what changed"); return }
    setSaving(true); setError(null)
    const res = await addAdRevision({ ad_id: ad.id, notes: notes.trim(), hook_count_after: hookCount === "" ? undefined : hookCount, targeting_type_after: targeting || undefined })
    setSaving(false)
    if (!res.success || !res.id) { setError(res.error ?? "Failed to save"); return }
    onAdded({ id: res.id, ad_id: ad.id, revision_date: new Date().toISOString().split("T")[0], notes: notes.trim(), hook_count_after: hookCount === "" ? null : hookCount, targeting_type_after: targeting || null })
  }

  return (
    <Modal title={`Log Correction — ${ad.ad_name}`} onClose={onClose}>
      <div className="flex flex-col gap-3">
        <div>
          <label style={LABEL}>What changed? *</label>
          <textarea style={{ ...FIELD, minHeight: 70, resize: "vertical" }} value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. Switched broad to interest-based after week 1, added 2 new hooks" />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div>
            <label style={LABEL}>New Hook Count</label>
            <input type="number" min={0} style={FIELD} value={hookCount} onChange={e => setHookCount(e.target.value === "" ? "" : Number(e.target.value))} placeholder={String(ad.hook_count)} />
          </div>
          <div>
            <label style={LABEL}>New Targeting</label>
            <select style={{ ...FIELD, cursor: "pointer" }} value={targeting} onChange={e => setTargeting(e.target.value as TargetingType | "")}>
              <option value="">No change</option>
              {(Object.keys(TARGETING_CFG) as TargetingType[]).map(t => <option key={t} value={t}>{TARGETING_CFG[t].label}</option>)}
            </select>
          </div>
        </div>
        {error && <p style={{ fontSize: 11, color: "#DE1A1A", margin: 0 }}>{error}</p>}
        <PrimaryButton onClick={submit} disabled={saving}>{saving ? "Saving…" : "Log Correction"}</PrimaryButton>
      </div>
    </Modal>
  )
}

// ── Log Performance modal ────────────────────────────────────────────────────
function AdPerformanceModal({ ad, onClose, onAdded }: { ad: Ad; onClose: () => void; onAdded: (entry: AdPerformanceEntry) => void }) {
  const [entryDate, setEntryDate] = useState(new Date().toISOString().split("T")[0])
  const [spend, setSpend] = useState<number | "">("")
  const [impressions, setImpressions] = useState<number | "">("")
  const [reach, setReach] = useState<number | "">("")
  const [clicks, setClicks] = useState<number | "">("")
  const [ctr, setCtr] = useState<number | "">("")
  const [results, setResults] = useState<number | "">("")
  const [note, setNote] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    if (spend === "" || impressions === "" || reach === "" || clicks === "" || ctr === "" || results === "") {
      setError("All 6 metrics are required")
      return
    }
    setSaving(true); setError(null)
    const res = await addAdPerformanceEntry({
      ad_id: ad.id, entry_date: entryDate,
      spend, impressions, reach, clicks, ctr, results,
      note: note.trim() || undefined,
    })
    setSaving(false)
    if (!res.success || !res.id) { setError(res.error ?? "Failed to save"); return }
    onAdded({
      id: res.id, ad_id: ad.id, entry_date: entryDate,
      spend, impressions, reach, clicks, ctr, results,
      note: note.trim() || null,
    })
  }

  return (
    <Modal title={`Log Performance — ${ad.ad_name}`} onClose={onClose}>
      <div className="flex flex-col gap-3">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div>
            <label style={LABEL}>Spend (₹) *</label>
            <input type="number" min={0} step="0.01" style={FIELD} value={spend} onChange={e => setSpend(e.target.value === "" ? "" : Number(e.target.value))} />
          </div>
          <div>
            <label style={LABEL}>Results *</label>
            <input type="number" min={0} style={FIELD} value={results} onChange={e => setResults(e.target.value === "" ? "" : Number(e.target.value))} placeholder="Leads / messages / purchases" />
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div>
            <label style={LABEL}>Impressions *</label>
            <input type="number" min={0} style={FIELD} value={impressions} onChange={e => setImpressions(e.target.value === "" ? "" : Number(e.target.value))} />
          </div>
          <div>
            <label style={LABEL}>Reach *</label>
            <input type="number" min={0} style={FIELD} value={reach} onChange={e => setReach(e.target.value === "" ? "" : Number(e.target.value))} />
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div>
            <label style={LABEL}>Clicks *</label>
            <input type="number" min={0} style={FIELD} value={clicks} onChange={e => setClicks(e.target.value === "" ? "" : Number(e.target.value))} />
          </div>
          <div>
            <label style={LABEL}>CTR % *</label>
            <input type="number" min={0} step="0.01" style={FIELD} value={ctr} onChange={e => setCtr(e.target.value === "" ? "" : Number(e.target.value))} />
          </div>
        </div>
        <div>
          <label style={LABEL}>Date</label>
          <input type="date" style={FIELD} value={entryDate} onChange={e => setEntryDate(e.target.value)} />
        </div>
        <div>
          <label style={LABEL}>Note</label>
          <textarea style={{ ...FIELD, minHeight: 50, resize: "vertical" }} value={note} onChange={e => setNote(e.target.value)} placeholder="Optional — e.g. why it's lagging, what changed" />
        </div>
        {error && <p style={{ fontSize: 11, color: "#DE1A1A", margin: 0 }}>{error}</p>}
        <PrimaryButton onClick={submit} disabled={saving}>{saving ? "Saving…" : "Log Performance"}</PrimaryButton>
      </div>
    </Modal>
  )
}

// ── New Shoot modal ──────────────────────────────────────────────────────────
function NewShootModal({ clients, pastClients, onClose, onCreated }: {
  clients: { id: string; name: string }[]; pastClients: { id: string; name: string }[]
  onClose: () => void; onCreated: (shoot: Shoot) => void
}) {
  const { activeOptions: activeClientOptions, pastOptions: pastClientOptions } = useMemo(
    () => buildClientOptions(clients.map(c => c.name), pastClients.map(c => c.name)),
    [clients, pastClients]
  )
  const [client, setClient] = useState("")
  const [title, setTitle] = useState("")
  const [shotDate, setShotDate] = useState(new Date().toISOString().split("T")[0])
  const [shotTime, setShotTime] = useState("")
  const [notes, setNotes] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    if (!client) { setError("Client is required"); return }
    if (!title.trim()) { setError("Shoot title is required"); return }
    setSaving(true); setError(null)
    const res = await createTrackerShoot({
      client, title: title.trim(), shot_date: shotDate, shot_time: shotTime || undefined, notes: notes.trim() || undefined,
    })
    setSaving(false)
    if (!res.success || !res.id) { setError(res.error ?? "Failed to save"); return }
    onCreated({
      id: res.id,
      client,
      legacyTitle: title.trim(),
      start_time: `${shotDate}T${shotTime || "09:00"}:00`,
      notes: notes.trim() || null,
      status: "scheduled",
      goingByUsers: [],
      titles: [],
    })
  }

  return (
    <Modal title="New Shoot" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <ClientSelector clientOptions={activeClientOptions} pastClientOptions={pastClientOptions} value={client} onValueChange={setClient} required />
        <div>
          <label style={LABEL}>Shoot Title *</label>
          <input style={FIELD} value={title} onChange={e => setTitle(e.target.value)}
            placeholder="e.g. SKB Silks Diwali Shoot" />
          <p className="text-[10px]" style={{ color: "#6B7280", margin: "5px 0 0" }}>
            The video titles are captured later, when you mark the shoot Done.
          </p>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div>
            <label style={LABEL}>Shot Date *</label>
            <input type="date" style={FIELD} value={shotDate} onChange={e => setShotDate(e.target.value)} />
          </div>
          <div>
            <label style={LABEL}>Time <span style={{ fontWeight: 600, textTransform: "none" }}>(optional)</span></label>
            <input type="time" style={FIELD} value={shotTime} onChange={e => setShotTime(e.target.value)} />
          </div>
        </div>
        <div>
          <label style={LABEL}>Notes</label>
          <textarea style={{ ...FIELD, minHeight: 50, resize: "vertical" }} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional" />
        </div>
        {error && <p style={{ fontSize: 11, color: "#DE1A1A", margin: 0 }}>{error}</p>}
        <PrimaryButton onClick={submit} disabled={saving}>{saving ? "Saving…" : "Schedule Shoot"}</PrimaryButton>
      </div>
    </Modal>
  )
}

// ── "Needs correction" — sends an Edited item back to Editing with what to fix ──────
function RequestCorrectionModal({ item, members, onClose, onRequested }: {
  item: ContentItem
  members: Member[]
  onClose: () => void
  onRequested: (correction: ContentCorrection) => void
}) {
  const [notes, setNotes] = useState("")
  // Defaults to whoever last edited it — they're the one who'd fix it.
  const [assignedTo, setAssignedTo] = useState(item.editedByUser?.id ?? "")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    if (!notes.trim()) { setError("Describe what needs fixing"); return }
    setSaving(true); setError(null)
    const res = await requestCorrection({
      content_item_id: item.id,
      notes: notes.trim(),
      assigned_to: assignedTo || undefined,
    })
    setSaving(false)
    if (!res.success || !res.correction) { setError(res.error ?? "Failed to save"); return }
    onRequested(res.correction)
  }

  return (
    <Modal title="Needs Correction" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <p className="text-[11px]" style={{ color: "#6B7280", margin: 0 }}>
          <strong style={{ color: "#111827" }}>{item.title}</strong> goes back to Editing. The round-trip
          is logged, so you can see how many rounds it took.
        </p>
        <div>
          <label style={LABEL}>What needs fixing? *</label>
          <textarea style={{ ...FIELD, minHeight: 70, resize: "vertical" }} value={notes} onChange={e => setNotes(e.target.value)}
            placeholder="e.g. Trim the intro, fix the logo placement at 0:12" />
        </div>
        {members.length > 0 && (
          <div>
            <label style={LABEL}>Back to</label>
            <select style={{ ...FIELD, cursor: "pointer" }} value={assignedTo} onChange={e => setAssignedTo(e.target.value)}>
              <option value="">— Keep current editor —</option>
              {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
        )}
        {error && <p style={{ fontSize: 11, color: "#DE1A1A", margin: 0 }}>{error}</p>}
        <PrimaryButton onClick={submit} disabled={saving}>{saving ? "Saving…" : "Send Back for Correction"}</PrimaryButton>
      </div>
    </Modal>
  )
}

// ── "Ready to Post" — schedules WHICH platforms and WHEN, before it actually goes out ──
function ReadyToPostModal({ item, onClose, onScheduled }: {
  item: ContentItem
  onClose: () => void
  onScheduled: (platforms: Platform[], date: string, time: string) => void
}) {
  const [platforms, setPlatforms] = useState<Platform[]>([])
  const [date, setDate] = useState(new Date().toISOString().split("T")[0])
  const [time, setTime] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function toggle(p: Platform) {
    setPlatforms(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p])
  }

  async function submit() {
    if (platforms.length === 0) { setError("Pick at least one platform"); return }
    if (!date) { setError("Pick the posting date"); return }
    setSaving(true); setError(null)
    const res = await markReadyToPost({
      content_item_id: item.id,
      ready_platforms: platforms,
      scheduled_post_date: date,
      scheduled_post_time: time || undefined,
    })
    setSaving(false)
    if (!res.success) { setError(res.error ?? "Failed to schedule"); return }
    onScheduled(platforms, date, time)
  }

  return (
    <Modal title="Ready to Post" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <p className="text-[11px]" style={{ color: "#6B7280", margin: 0 }}>
          <strong style={{ color: "#111827" }}>{item.title}</strong> — where and when is this going out?
          It&apos;ll queue up on the Posted tab until you mark it Posted.
        </p>
        <div>
          <label style={LABEL}>Platforms * <span style={{ fontWeight: 600, textTransform: "none" }}>(pick one or more)</span></label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {(Object.keys(PLATFORM_CFG) as Platform[]).map(p => {
              const cfg = PLATFORM_CFG[p]
              const Icon = cfg.icon
              const on = platforms.includes(p)
              return (
                <button key={p} onClick={() => toggle(p)}
                  style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 10, border: `1.5px solid ${on ? cfg.color : "#E5E7EB"}`, background: on ? `${cfg.color}14` : "#fff", color: on ? cfg.color : "#6B7280", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                  <Icon size={12} /> {cfg.label} {on && <Check size={10} />}
                </button>
              )
            })}
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div>
            <label style={LABEL}>Posting Date *</label>
            <input type="date" style={FIELD} value={date} onChange={e => setDate(e.target.value)} />
          </div>
          <div>
            <label style={LABEL}>Time <span style={{ fontWeight: 600, textTransform: "none" }}>(optional)</span></label>
            <input type="time" style={FIELD} value={time} onChange={e => setTime(e.target.value)} />
          </div>
        </div>
        {error && <p style={{ fontSize: 11, color: "#DE1A1A", margin: 0 }}>{error}</p>}
        <PrimaryButton onClick={submit} disabled={saving}>{saving ? "Saving…" : "Schedule Post"}</PrimaryButton>
      </div>
    </Modal>
  )
}

// ── "Who's starting the edit?" — the accountability prompt when a video enters Editing ──
function StartEditingModal({ item, members, currentUserId, onClose, onConfirm }: {
  item: ContentItem
  members: Member[]
  currentUserId: string
  onClose: () => void
  onConfirm: (editorId: string, editorName: string) => void
}) {
  // Defaults to whoever clicked — the common case is "I'm starting this" — but a manager
  // can reassign to anyone.
  const [editorId, setEditorId] = useState(
    members.some(m => m.id === currentUserId) ? currentUserId : (members[0]?.id ?? "")
  )
  const [error, setError] = useState<string | null>(null)

  function submit() {
    const editor = members.find(m => m.id === editorId)
    if (!editor) { setError("Pick who's starting this edit"); return }
    onConfirm(editor.id, editor.name)
  }

  return (
    <Modal title="Who's starting this edit?" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <p className="text-[11px]" style={{ color: "#6B7280", margin: 0 }}>
          <strong style={{ color: "#111827" }}>{item.title}</strong> is moving to Editing. Recording who
          started it means the rest of the team can see it&apos;s being worked on.
        </p>
        <div>
          <label style={LABEL}>Editor *</label>
          <select style={{ ...FIELD, cursor: "pointer" }} value={editorId} onChange={e => setEditorId(e.target.value)}>
            {members.map(m => (
              <option key={m.id} value={m.id}>{m.name}{m.id === currentUserId ? " (me)" : ""}</option>
            ))}
          </select>
        </div>
        {error && <p style={{ fontSize: 11, color: "#DE1A1A", margin: 0 }}>{error}</p>}
        <PrimaryButton onClick={submit}>Start Editing</PrimaryButton>
      </div>
    </Modal>
  )
}

// ── "Who recorded this?" — the accountability prompt when a script enters Voice Over ──
function VoiceOverModal({ item, freelancers, onClose, onConfirm }: {
  item: ContentItem
  freelancers: VoiceFreelancer[]
  onClose: () => void
  onConfirm: (voiceoverBy: VoiceFreelancer, date: string) => void
}) {
  const [voiceoverId, setVoiceoverId] = useState(freelancers[0]?.id ?? "")
  const [date, setDate] = useState(new Date().toISOString().split("T")[0])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    const freelancer = freelancers.find(f => f.id === voiceoverId)
    if (!freelancer) { setError("Pick who recorded the voice-over"); return }
    setSaving(true); setError(null)
    const res = await recordVoiceOver({ content_item_id: item.id, voiceover_by: freelancer.id, voiceover_date: date })
    setSaving(false)
    if (!res.success) { setError(res.error ?? "Failed to save"); return }
    onConfirm(freelancer, date)
  }

  return (
    <Modal title="Who recorded the voice-over?" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <p className="text-[11px]" style={{ color: "#6B7280", margin: 0 }}>
          <strong style={{ color: "#111827" }}>{item.title}</strong> is moving to Voice Over.
        </p>
        {freelancers.length === 0 ? (
          <p style={{ fontSize: 11, color: "#DE1A1A", margin: 0 }}>
            No active Freelance RJ Voiceover artists found — add one under Freelancers first.
          </p>
        ) : (
          <div>
            <label style={LABEL}>Voice Artist *</label>
            <select style={{ ...FIELD, cursor: "pointer" }} value={voiceoverId} onChange={e => setVoiceoverId(e.target.value)}>
              {freelancers.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </div>
        )}
        <div>
          <label style={LABEL}>Date</label>
          <input type="date" style={FIELD} value={date} onChange={e => setDate(e.target.value)} />
        </div>
        {error && <p style={{ fontSize: 11, color: "#DE1A1A", margin: 0 }}>{error}</p>}
        <PrimaryButton onClick={submit} disabled={saving || freelancers.length === 0}>{saving ? "Saving…" : "Confirm Voice Over"}</PrimaryButton>
      </div>
    </Modal>
  )
}

// ── "Who's going?" — the accountability prompt when a shoot is marked Going ──────
function GoingCrewModal({ shoot, members, currentUserId, onClose, onConfirm }: {
  shoot: Shoot
  members: Member[]
  currentUserId: string
  onClose: () => void
  onConfirm: (crew: Member[]) => void
}) {
  const [crew, setCrew] = useState<string[]>(
    members.some(m => m.id === currentUserId) ? [currentUserId] : []
  )
  const [error, setError] = useState<string | null>(null)

  function toggle(id: string) {
    setCrew(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  function submit() {
    if (crew.length === 0) { setError("Pick at least one person going"); return }
    onConfirm(members.filter(m => crew.includes(m.id)))
  }

  return (
    <Modal title="Who's going on this shoot?" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <p className="text-[11px]" style={{ color: "#6B7280", margin: 0 }}>
          <strong style={{ color: "#111827" }}>{shoot.legacyTitle}</strong> — pick everyone covering it.
        </p>
        <div>
          <label style={LABEL}>Crew * <span style={{ fontWeight: 600, textTransform: "none" }}>(pick one or more)</span></label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {members.map(m => {
              const on = crew.includes(m.id)
              return (
                <button key={m.id} onClick={() => toggle(m.id)}
                  style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 10, border: `1.5px solid ${on ? "#3B82F6" : "#E5E7EB"}`, background: on ? "rgba(59,130,246,0.08)" : "#fff", color: on ? "#3B82F6" : "#6B7280", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                  {on && <Check size={11} />} {m.name}{m.id === currentUserId ? " (me)" : ""}
                </button>
              )
            })}
          </div>
        </div>
        {error && <p style={{ fontSize: 11, color: "#DE1A1A", margin: 0 }}>{error}</p>}
        <PrimaryButton onClick={submit}>
          Mark Going{crew.length > 0 ? ` (${crew.length})` : ""}
        </PrimaryButton>
      </div>
    </Modal>
  )
}

// ── Complete Shoot modal — captures the video titles that came out of the shoot ──
function CompleteShootModal({ shoot, members, currentUserId, onClose, onCompleted }: {
  shoot: Shoot
  members: Member[]
  currentUserId: string
  onClose: () => void
  onCompleted: (created: CreatedShootItem[], crew: Member[]) => void
}) {
  const [titleInput, setTitleInput] = useState("")
  const [titles, setTitles] = useState<string[]>([])
  // Crew is asked here too, not just at Going — a shoot dragged straight to Completed would
  // otherwise end up Done with no record of who went. Pre-filled with whoever was marked
  // Going, so the common path is just "confirm".
  const [crew, setCrew] = useState<string[]>(() => {
    if (shoot.goingByUsers.length > 0) return shoot.goingByUsers.map(u => u.id)
    return members.some(m => m.id === currentUserId) ? [currentUserId] : []
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function addTitle() {
    const t = titleInput.trim()
    if (t && !titles.includes(t)) setTitles(prev => [...prev, t])
    setTitleInput("")
  }

  function toggleCrew(id: string) {
    setCrew(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  async function submit() {
    if (titles.length === 0) { setError("Add at least one video title"); return }
    setSaving(true); setError(null)
    const res = await completeShootWithTitles(shoot.id, titles, crew)
    setSaving(false)
    if (!res.success) { setError(res.error ?? "Failed to complete shoot"); return }
    onCompleted(res.createdItems ?? [], members.filter(m => crew.includes(m.id)))
  }

  return (
    <Modal title={`Shoot Done — ${shoot.legacyTitle}`} onClose={onClose}>
      <div className="flex flex-col gap-3">
        <p className="text-[11px]" style={{ color: "#6B7280", margin: 0 }}>
          What videos came out of this shoot? Each one becomes a card in the Pipeline at <strong>Shot</strong>.
        </p>
        <div>
          <label style={LABEL}>Video Titles *</label>
          <div style={{ display: "flex", gap: 8 }}>
            <input style={FIELD} value={titleInput} onChange={e => setTitleInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addTitle() } }}
              placeholder="e.g. Sports Day Highlights" />
            <button type="button" onClick={addTitle}
              style={{ padding: "8px 14px", borderRadius: 10, border: "none", background: "#DE1A1A", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}>
              Add
            </button>
          </div>
          {titles.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
              {titles.map(t => (
                <span key={t} style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 10px", borderRadius: 20, background: "rgba(222,26,26,0.08)", border: "1.5px solid rgba(222,26,26,0.25)", fontSize: 12, fontWeight: 600, color: "#de1a1a" }}>
                  {t}
                  <button type="button" onClick={() => setTitles(prev => prev.filter(x => x !== t))}
                    style={{ background: "none", border: "none", cursor: "pointer", padding: 0, lineHeight: 1, color: "#de1a1a", fontSize: 14, fontWeight: 700 }}>×</button>
                </span>
              ))}
            </div>
          )}
        </div>

        {members.length > 0 && (
          <div>
            <label style={LABEL}>Who went? <span style={{ fontWeight: 600, textTransform: "none" }}>(pick one or more)</span></label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {members.map(m => {
                const on = crew.includes(m.id)
                return (
                  <button key={m.id} type="button" onClick={() => toggleCrew(m.id)}
                    style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 10, border: `1.5px solid ${on ? "#3B82F6" : "#E5E7EB"}`, background: on ? "rgba(59,130,246,0.08)" : "#fff", color: on ? "#3B82F6" : "#6B7280", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                    {on && <Check size={11} />} {m.name}{m.id === currentUserId ? " (me)" : ""}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {error && <p style={{ fontSize: 11, color: "#DE1A1A", margin: 0 }}>{error}</p>}
        <PrimaryButton onClick={submit} disabled={saving}>
          {saving ? "Saving…" : `Mark Done${titles.length > 0 ? ` (${titles.length} video${titles.length > 1 ? "s" : ""})` : ""}`}
        </PrimaryButton>
      </div>
    </Modal>
  )
}

// ── Set / correct who went — usable at any point, including after the shoot is Done, so an
// older shoot with no crew recorded can be backfilled. ─────────────────────────
function EditCrewModal({ shoot, members, currentUserId, onClose, onSaved }: {
  shoot: Shoot
  members: Member[]
  currentUserId: string
  onClose: () => void
  onSaved: (crew: Member[]) => void
}) {
  const [crew, setCrew] = useState<string[]>(shoot.goingByUsers.map(u => u.id))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function toggle(id: string) {
    setCrew(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  async function submit() {
    setSaving(true); setError(null)
    const res = await updateShootCrew(shoot.id, crew)
    setSaving(false)
    if (!res.success) { setError(res.error ?? "Failed to save"); return }
    onSaved(members.filter(m => crew.includes(m.id)))
  }

  return (
    <Modal title={`Who went — ${shoot.legacyTitle}`} onClose={onClose}>
      <div className="flex flex-col gap-3">
        <p className="text-[11px]" style={{ color: "#6B7280", margin: 0 }}>
          Set or correct who covered this shoot. Works even after it&apos;s Done.
        </p>
        <div>
          <label style={LABEL}>Crew</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {members.map(m => {
              const on = crew.includes(m.id)
              return (
                <button key={m.id} type="button" onClick={() => toggle(m.id)}
                  style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 10, border: `1.5px solid ${on ? "#3B82F6" : "#E5E7EB"}`, background: on ? "rgba(59,130,246,0.08)" : "#fff", color: on ? "#3B82F6" : "#6B7280", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                  {on && <Check size={11} />} {m.name}{m.id === currentUserId ? " (me)" : ""}
                </button>
              )
            })}
          </div>
        </div>
        {error && <p style={{ fontSize: 11, color: "#DE1A1A", margin: 0 }}>{error}</p>}
        <PrimaryButton onClick={submit} disabled={saving}>
          {saving ? "Saving…" : `Save Crew${crew.length > 0 ? ` (${crew.length})` : ""}`}
        </PrimaryButton>
      </div>
    </Modal>
  )
}

// ── Edit shoot details ───────────────────────────────────────────────────────
function EditShootModal({ shoot, clients, pastClients, onClose, onSaved }: {
  shoot: Shoot
  clients: { id: string; name: string }[]; pastClients: { id: string; name: string }[]
  onClose: () => void
  onSaved: (patch: { client: string; legacyTitle: string; start_time: string; notes: string | null }) => void
}) {
  const { activeOptions: activeClientOptions, pastOptions: pastClientOptions } = useMemo(
    () => buildClientOptions(clients.map(c => c.name), pastClients.map(c => c.name)),
    [clients, pastClients]
  )
  const [client, setClient] = useState(shoot.client)
  const [title, setTitle] = useState(shoot.legacyTitle)
  const [shotDate, setShotDate] = useState(shoot.start_time.split("T")[0])
  const [shotTime, setShotTime] = useState(() => {
    const t = shoot.start_time.split("T")[1]
    return t ? t.slice(0, 5) : ""
  })
  const [notes, setNotes] = useState(shoot.notes ?? "")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    if (!client) { setError("Client is required"); return }
    if (!title.trim()) { setError("Shoot title is required"); return }
    setSaving(true); setError(null)
    const res = await updateTrackerShoot(shoot.id, {
      client, title: title.trim(), shot_date: shotDate,
      shot_time: shotTime || undefined, notes: notes.trim() || undefined,
    })
    setSaving(false)
    if (!res.success) { setError(res.error ?? "Failed to save"); return }
    onSaved({
      client,
      legacyTitle: title.trim(),
      start_time: `${shotDate}T${shotTime || "09:00"}:00`,
      notes: notes.trim() || null,
    })
  }

  return (
    <Modal title="Edit Shoot" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <ClientSelector clientOptions={activeClientOptions} pastClientOptions={pastClientOptions} value={client} onValueChange={setClient} required />
        <div>
          <label style={LABEL}>Shoot Title *</label>
          <input style={FIELD} value={title} onChange={e => setTitle(e.target.value)} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div>
            <label style={LABEL}>Shot Date *</label>
            <input type="date" style={FIELD} value={shotDate} onChange={e => setShotDate(e.target.value)} />
          </div>
          <div>
            <label style={LABEL}>Time</label>
            <input type="time" style={FIELD} value={shotTime} onChange={e => setShotTime(e.target.value)} />
          </div>
        </div>
        <div>
          <label style={LABEL}>Notes</label>
          <textarea style={{ ...FIELD, minHeight: 50, resize: "vertical" }} value={notes} onChange={e => setNotes(e.target.value)} />
        </div>
        <p className="text-[10px]" style={{ color: "#9CA3AF", margin: 0 }}>
          Crew and video titles are edited from their own actions — they aren&apos;t changed here.
        </p>
        {error && <p style={{ fontSize: 11, color: "#DE1A1A", margin: 0 }}>{error}</p>}
        <PrimaryButton onClick={submit} disabled={saving}>{saving ? "Saving…" : "Save Changes"}</PrimaryButton>
      </div>
    </Modal>
  )
}

// ── Edit ad details ──────────────────────────────────────────────────────────
function EditAdModal({ ad, clients, pastClients, onClose, onSaved }: {
  ad: Ad
  clients: { id: string; name: string }[]; pastClients: { id: string; name: string }[]
  onClose: () => void
  onSaved: (patch: Pick<Ad, "client_name" | "ad_name" | "platform" | "launch_date" | "targeting_type" | "targeting_notes">) => void
}) {
  const { activeOptions: activeClientOptions, pastOptions: pastClientOptions } = useMemo(
    () => buildClientOptions(clients.map(c => c.name), pastClients.map(c => c.name)),
    [clients, pastClients]
  )
  const [client, setClient] = useState(ad.client_name)
  const [adName, setAdName] = useState(ad.ad_name)
  const [platform, setPlatform] = useState(ad.platform)
  const [launchDate, setLaunchDate] = useState(ad.launch_date ?? "")
  const [targeting, setTargeting] = useState<TargetingType | "">(ad.targeting_type ?? "")
  const [notes, setNotes] = useState(ad.targeting_notes ?? "")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    if (!client) { setError("Client is required"); return }
    if (!adName.trim()) { setError("Ad name is required"); return }
    setSaving(true); setError(null)
    const res = await updateAd({
      ad_id: ad.id, client_name: client, ad_name: adName.trim(), platform,
      launch_date: launchDate || undefined,
      targeting_type: targeting || undefined,
      targeting_notes: notes.trim() || undefined,
    })
    setSaving(false)
    if (!res.success) { setError(res.error ?? "Failed to save"); return }
    onSaved({
      client_name: client, ad_name: adName.trim(), platform,
      launch_date: launchDate || null,
      targeting_type: targeting || null,
      targeting_notes: notes.trim() || null,
    })
  }

  return (
    <Modal title="Edit Ad" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <ClientSelector clientOptions={activeClientOptions} pastClientOptions={pastClientOptions} value={client} onValueChange={setClient} required />
        <div>
          <label style={LABEL}>Ad / Video Name *</label>
          <input style={FIELD} value={adName} onChange={e => setAdName(e.target.value)} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div>
            <label style={LABEL}>Platform</label>
            <input style={FIELD} value={platform} onChange={e => setPlatform(e.target.value)} />
          </div>
          <div>
            <label style={LABEL}>Launch Date</label>
            <input type="date" style={FIELD} value={launchDate} onChange={e => setLaunchDate(e.target.value)} />
          </div>
        </div>
        <div>
          <label style={LABEL}>Targeting Strategy</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {(Object.keys(TARGETING_CFG) as TargetingType[]).map(t => (
              <button key={t} type="button" onClick={() => setTargeting(targeting === t ? "" : t)}
                style={{ padding: "6px 12px", borderRadius: 10, border: `1.5px solid ${targeting === t ? TARGETING_CFG[t].color : "#E5E7EB"}`, background: targeting === t ? `${TARGETING_CFG[t].color}14` : "#fff", color: targeting === t ? TARGETING_CFG[t].color : "#6B7280", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                {TARGETING_CFG[t].label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label style={LABEL}>Strategy Notes</label>
          <textarea style={{ ...FIELD, minHeight: 50, resize: "vertical" }} value={notes} onChange={e => setNotes(e.target.value)} />
        </div>
        <p className="text-[10px]" style={{ color: "#9CA3AF", margin: 0 }}>
          Status, hooks, performance and corrections have their own actions — they aren&apos;t changed here.
        </p>
        {error && <p style={{ fontSize: 11, color: "#DE1A1A", margin: 0 }}>{error}</p>}
        <PrimaryButton onClick={submit} disabled={saving}>{saving ? "Saving…" : "Save Changes"}</PrimaryButton>
      </div>
    </Modal>
  )
}

// ── Main component ───────────────────────────────────────────────────────────
export default function ContentTrackerClient({ initialItems, initialAds, initialShoots, members, currentUserId, clients, pastClients, voiceoverFreelancers }: Props) {
  const [items, setItems] = useState(initialItems)
  const [ads, setAds] = useState(initialAds)
  const [shoots, setShoots] = useState(initialShoots)
  // Top-level mode (Video / Poster / Ads) with sub-tabs beneath it. Posters aren't shot,
  // so the Shoots sub-tab only exists in Video mode.
  const [mode, setMode] = useState<TrackerMode>("overview")
  const [subTab, setSubTab] = useState<"shoots" | "adsvideo" | "pipeline" | "log">("shoots")
  // Derived rather than reset via an effect — avoids a cascading-render setState-in-effect.
  // Posters have neither Shoots nor Ads Video, so both fall back to Pipeline.
  const tab = mode === "poster" && (subTab === "shoots" || subTab === "adsvideo") ? "pipeline" : subTab
  // Overview and Ads have no content type of their own; falling back to "video" keeps the
  // Pipeline/Log memos below well-defined even while those boards aren't rendered.
  const contentTypeForMode: "video" | "poster" = mode === "poster" ? "poster" : "video"
  const [, startTransition] = useTransition()

  const [dragId, setDragId] = useState<string | null>(null)
  const [overCol, setOverCol] = useState<string | null>(null)
  const [showNewContent, setShowNewContent] = useState(false)
  const [platformModalItem, setPlatformModalItem] = useState<ContentItem | null>(null)
  const [editingItem, setEditingItem] = useState<ContentItem | null>(null)
  const [showNewAd, setShowNewAd] = useState(false)
  const [revisionModalAd, setRevisionModalAd] = useState<Ad | null>(null)
  const [performanceModalAd, setPerformanceModalAd] = useState<Ad | null>(null)
  const [adsClientFilter, setAdsClientFilter] = useState<string>("all")
  const [adsSearch, setAdsSearch] = useState("")
  const [showNewShoot, setShowNewShoot] = useState(false)
  const [completeShootFor, setCompleteShootFor] = useState<Shoot | null>(null)
  const [startEditingItem, setStartEditingItem] = useState<ContentItem | null>(null)
  const [voiceOverItem, setVoiceOverItem] = useState<ContentItem | null>(null)
  const [readyToPostItem, setReadyToPostItem] = useState<ContentItem | null>(null)
  const [correctionItem, setCorrectionItem] = useState<ContentItem | null>(null)
  const [goingCrewFor, setGoingCrewFor] = useState<Shoot | null>(null)
  const [editCrewFor, setEditCrewFor] = useState<Shoot | null>(null)
  const [editShootFor, setEditShootFor] = useState<Shoot | null>(null)
  const [editAdFor, setEditAdFor] = useState<Ad | null>(null)
  const [shootsClientFilter, setShootsClientFilter] = useState<string>("all")
  // Separate drag state per board — only one board is mounted at a time, but keeping
  // them distinct avoids any chance of a stale id leaking across boards.
  const [shootDragId, setShootDragId] = useState<string | null>(null)
  const [shootOverCol, setShootOverCol] = useState<string | null>(null)
  const [activeShootCol, setActiveShootCol] = useState<ShootStatus>("scheduled")
  const [adsVideoDragId, setAdsVideoDragId] = useState<string | null>(null)
  const [adsVideoOverCol, setAdsVideoOverCol] = useState<string | null>(null)
  const [showNewAdsVideo, setShowNewAdsVideo] = useState(false)
  const [editAdsVideoFor, setEditAdsVideoFor] = useState<ContentItem | null>(null)
  const [adDragId, setAdDragId] = useState<string | null>(null)
  const [adOverCol, setAdOverCol] = useState<string | null>(null)
  const [activeAdCol, setActiveAdCol] = useState<AdStatus>("active")
  const [expandedAd, setExpandedAd] = useState<string | null>(null)
  const [logSearch, setLogSearch] = useState("")
  const [logPlatformFilter, setLogPlatformFilter] = useState<Platform | "all">("all")
  const [logClientFilter, setLogClientFilter] = useState<string>("all")
  const [logMonthFilter, setLogMonthFilter] = useState<string>("all")
  const [logDayFilter, setLogDayFilter] = useState("")
  const [pipelineDayFilter, setPipelineDayFilter] = useState("")
  const [shootsMonthFilter, setShootsMonthFilter] = useState<string>("all")
  const [shootsDayFilter, setShootsDayFilter] = useState("")
  const [adsMonthFilter, setAdsMonthFilter] = useState<string>("all")
  const [adsDayFilter, setAdsDayFilter] = useState("")
  const [pipelineClientFilter, setPipelineClientFilter] = useState<string>("all")
  const [pipelineMonthFilter, setPipelineMonthFilter] = useState<string>("all")
  const [activeMobileCol, setActiveMobileCol] = useState<ContentStatus>("ready_to_edit")

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  // Shared client/month option lists used by both the Pipeline and Posting Log tabs'
  // filters. Client options use the universal dropdown (internal brands pinned first,
  // then active clients, then past clients) rather than just clients that already have
  // a content item — otherwise a client with nothing tracked yet can't be filtered to.
  // Any item's client_name not found in the clients table (legacy/freeform entries)
  // still gets included so no existing data becomes unfilterable.
  const { activeOptions: activeClientOptions, pastOptions: pastClientOptions } = useMemo(
    () => buildClientOptions(clients.map(c => c.name), pastClients.map(c => c.name)),
    [clients, pastClients]
  )
  const allClientOptions = useMemo(() => {
    const known = new Set([...activeClientOptions, ...pastClientOptions])
    const extra = Array.from(new Set(items.map(i => i.client_name))).filter(n => !known.has(n)).sort()
    return [...activeClientOptions, ...extra]
  }, [activeClientOptions, pastClientOptions, items])
  const allMonthOptions = useMemo(() => {
    const months = new Set<string>()
    for (const i of items) {
      if (i.shot_date) months.add(i.shot_date.slice(0, 7))
      if (i.edited_date) months.add(i.edited_date.slice(0, 7))
      for (const p of i.posts) months.add(p.posted_date.slice(0, 7))
    }
    return Array.from(months).sort().reverse()
  }, [items])

  // The item's own "current stage" date — shot/editing by shot date, edited by edited
  // date, posted by its (latest) post date. Month and day filters both key off this.
  function itemStageDate(item: ContentItem): string | null {
    if (item.status === "posted") {
      const dates = item.posts.map(p => p.posted_date).sort()
      return dates.length ? dates[dates.length - 1] : null
    }
    if (item.status === "edited") return item.edited_date
    return item.shot_date
  }
  function itemMonthBucket(item: ContentItem): string | null {
    return itemStageDate(item)?.slice(0, 7) ?? null
  }

  const pipelineItems = useMemo(() => {
    return items.filter(i => {
      if (i.content_type !== contentTypeForMode) return false
      if (pipelineClientFilter !== "all" && i.client_name !== pipelineClientFilter) return false
      if (pipelineDayFilter) return itemStageDate(i) === pipelineDayFilter
      if (pipelineMonthFilter !== "all" && itemMonthBucket(i) !== pipelineMonthFilter) return false
      return true
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, pipelineClientFilter, pipelineMonthFilter, pipelineDayFilter, contentTypeForMode])

  const pipelineOrder = contentTypeForMode === "poster" ? POSTER_PIPELINE_ORDER : VIDEO_PIPELINE_ORDER

  function colItems(status: ContentStatus) { return pipelineItems.filter(i => i.status === status) }

  const adsVideoItems = useMemo(
    () => items.filter(i => i.content_type === "video" && i.source === "ads_video" && ADS_VIDEO_ORDER.includes(i.status)),
    [items]
  )
  function adsVideoColItems(status: ContentStatus) { return adsVideoItems.filter(i => i.status === status) }

  function advance(item: ContentItem, next: ContentStatus) {
    if (next === "posted") { setPlatformModalItem(item); return }
    // Ready to Post asks where and when it's going out — used both for the normal forward
    // path and for approving out of On Review.
    if (next === "ready_to_post") { setReadyToPostItem(item); return }
    // Entering Editing asks who's starting it — that's the accountability moment.
    if (next === "editing" && members.length > 0) { setStartEditingItem(item); return }
    // Entering Voice Over asks who recorded it.
    if (next === "voiceover") { setVoiceOverItem(item); return }
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: next, ...(next === "edited" ? { edited_date: new Date().toISOString().split("T")[0] } : {}) } : i))
    startTransition(async () => { await updateContentItemStatus(item.id, next) })
  }

  function handleCorrectionRequested(correction: ContentCorrection) {
    setItems(prev => prev.map(i => i.id === correction.content_item_id ? {
      ...i,
      status: "editing",
      corrections: [correction, ...i.corrections],
      // If it was reassigned, that person is now the editor.
      editedByUser: correction.assignedToUser ?? i.editedByUser,
    } : i))
    setCorrectionItem(null)
  }

  function handleReadyToPost(item: ContentItem, platforms: Platform[], date: string, time: string) {
    setItems(prev => prev.map(i => i.id === item.id ? {
      ...i, status: "ready_to_post",
      ready_platforms: platforms,
      scheduled_post_date: date,
      scheduled_post_time: time || null,
    } : i))
    setReadyToPostItem(null)
  }

  function handleStartEditing(item: ContentItem, editorId: string, editorName: string) {
    setItems(prev => prev.map(i => i.id === item.id
      ? { ...i, status: "editing", editedByUser: { id: editorId, name: editorName } }
      : i))
    setStartEditingItem(null)
    startTransition(async () => { await updateContentItemStatus(item.id, "editing", editorId) })
  }

  function handleVoiceOverRecorded(item: ContentItem, voiceoverBy: VoiceFreelancer, date: string) {
    setItems(prev => prev.map(i => i.id === item.id
      ? { ...i, status: "voiceover", voiceoverBy, voiceover_date: date }
      : i))
    setVoiceOverItem(null)
  }

  function handleDeleteItem(id: string) {
    setItems(prev => prev.filter(i => i.id !== id))
    startTransition(async () => { await deleteContentItem(id) })
  }

  function handleDragStart(e: DragStartEvent) { setDragId(String(e.active.id)) }
  function handleDragOver(e: { over: { id: string } | null }) { setOverCol(e.over?.id ?? null) }
  function handleDragEnd(e: DragEndEvent) {
    const overId = e.over?.id as ContentStatus | undefined
    if (overId) {
      const item = items.find(i => i.id === e.active.id)
      if (item && item.status !== overId && isValidPipelineTransition(item.status, overId)) advance(item, overId)
    }
    setDragId(null); setOverCol(null)
  }

  function handleAdsVideoDragOver(e: { over: { id: string } | null }) { setAdsVideoOverCol(e.over?.id ?? null) }
  function handleAdsVideoDragEnd(e: DragEndEvent) {
    const overId = e.over?.id as ContentStatus | undefined
    if (overId) {
      const item = items.find(i => i.id === e.active.id)
      if (item && item.status !== overId && isValidPipelineTransition(item.status, overId)) advance(item, overId)
    }
    setAdsVideoDragId(null); setAdsVideoOverCol(null)
  }
  const draggedAdsVideo = items.find(i => i.id === adsVideoDragId)

  // Overview numbers are navigation, not decoration — clicking one lands you on the board
  // it came from, so you can act on it.
  function goTo(target: AttentionItem["target"]) {
    setMode(target.mode)
    if (target.tab) setSubTab(target.tab)
  }

  const draggedItem = items.find(i => i.id === dragId)

  // Stats — global totals, always unfiltered (shown in the hero chips)
  // Nav badges. Modes count live work (anything not yet posted / ads still running);
  // sections count what you'd actually find on that board for the current mode.
  // Overview's badge is the count of things actually needing action — it's the number you'd
  // want to see without opening the tab.
  const overview = useMemo(
    () => computeOverview({
      items, shoots, ads,
      today: new Date().toISOString().split("T")[0],
    }),
    [items, shoots, ads]
  )

  const navCounts = useMemo(() => ({
    overview: overview.attention.reduce((sum, a) => sum + a.count, 0),
    video: items.filter(i => i.content_type === "video" && i.status !== "posted").length,
    poster: items.filter(i => i.content_type === "poster" && i.status !== "posted").length,
    ads: ads.filter(a => a.status === "active").length,
  }), [items, ads, overview])

  const navSections = useMemo(() => {
    if (mode === "ads" || mode === "overview") return []
    const ofMode = items.filter(i => i.content_type === contentTypeForMode)
    const activeAdsVideo = items.filter(i => i.content_type === "video" && i.source === "ads_video" && (i.status === "scripting" || i.status === "voiceover"))
    return [
      ...(mode === "video"
        ? [{ key: "shoots", label: "Shoots", icon: Camera, count: shoots.filter(s => s.status === "scheduled" || s.status === "going").length }]
        : []),
      ...(mode === "video"
        ? [{ key: "adsvideo", label: "Ads Video", icon: Sparkles, count: activeAdsVideo.length }]
        : []),
      { key: "pipeline", label: "Ready to Edit", icon: Layers, count: ofMode.filter(i => pipelineOrder.includes(i.status)).length },
      { key: "log", label: "Posted", icon: History, count: ofMode.filter(i => i.status === "posted").length },
    ]
  }, [mode, items, shoots, contentTypeForMode, pipelineOrder])

  const stats = useMemo(() => {
    const readyToEdit = items.filter(i => i.status === "ready_to_edit").length
    const editing = items.filter(i => i.status === "editing").length
    const edited = items.filter(i => i.status === "edited").length
    const readyToPost = items.filter(i => i.status === "ready_to_post").length
    const posted = items.filter(i => i.status === "posted").length
    const totalPosts = items.reduce((s, i) => s + i.posts.length, 0)
    return { readyToEdit, editing, edited, readyToPost, posted, totalPosts }
  }, [items])

  // The "what's due next" queue — items scheduled into Ready to Post, soonest first.
  const readyQueue = useMemo(
    () => items
      .filter(i => i.status === "ready_to_post" && i.content_type === contentTypeForMode && i.scheduled_post_date)
      .sort((a, b) => {
        const byDate = (a.scheduled_post_date ?? "").localeCompare(b.scheduled_post_date ?? "")
        if (byDate !== 0) return byDate
        // No time set sorts last within the day — a specific slot is more urgent than "sometime".
        return (a.scheduled_post_time ?? "99:99").localeCompare(b.scheduled_post_time ?? "99:99")
      }),
    [items, contentTypeForMode]
  )

  // Posting log — one row per content item (not per platform); platforms shown as badges within the row
  const postedItems = useMemo(
    () => items.filter(i => i.posts.length > 0 && i.content_type === contentTypeForMode),
    [items, contentTypeForMode]
  )
  const logClientOptions = allClientOptions
  const logMonthOptions = allMonthOptions

  // Per-client KPI strip: Posted / Unposted (edited, awaiting a platform) / Unedited (shot or editing)
  // — bucketed by whichever date is relevant to that item's current stage, so "All Time" vs a
  // specific month both mean something for items that haven't reached posting yet.
  const clientKPIs = useMemo(() => {
    const inMonth = (d: string | null) => logMonthFilter === "all" || (!!d && d.slice(0, 7) === logMonthFilter)
    const map = new Map<string, { posted: number; unposted: number; unedited: number }>()
    for (const item of items) {
      if (item.content_type !== contentTypeForMode) continue
      if (!map.has(item.client_name)) map.set(item.client_name, { posted: 0, unposted: 0, unedited: 0 })
      const rec = map.get(item.client_name)!
      if (item.status === "posted") {
        if (logMonthFilter === "all" || item.posts.some(p => p.posted_date.slice(0, 7) === logMonthFilter)) rec.posted++
      } else if (item.status === "edited") {
        if (inMonth(item.edited_date)) rec.unposted++
      } else {
        if (inMonth(item.shot_date)) rec.unedited++
      }
    }
    return Array.from(map.entries())
      .map(([client, v]) => ({ client, ...v, total: v.posted + v.unposted + v.unedited }))
      .filter(r => r.total > 0)
      .sort((a, b) => b.total - a.total)
  }, [items, logMonthFilter, contentTypeForMode])

  const logRows = useMemo(() => {
    let rows = postedItems
    if (logPlatformFilter !== "all") rows = rows.filter(i => i.posts.some(p => p.platform === logPlatformFilter))
    if (logClientFilter !== "all") rows = rows.filter(i => i.client_name === logClientFilter)
    if (logDayFilter) rows = rows.filter(i => i.posts.some(p => p.posted_date === logDayFilter))
    else if (logMonthFilter !== "all") rows = rows.filter(i => i.posts.some(p => p.posted_date.slice(0, 7) === logMonthFilter))
    if (logSearch) rows = rows.filter(i => `${i.title} ${i.client_name}`.toLowerCase().includes(logSearch.toLowerCase()))
    return [...rows].sort((a, b) => {
      const aLatest = a.posts.map(p => p.posted_date).sort().reverse()[0]
      const bLatest = b.posts.map(p => p.posted_date).sort().reverse()[0]
      return bLatest.localeCompare(aLatest)
    })
  }, [postedItems, logSearch, logPlatformFilter, logClientFilter, logMonthFilter, logDayFilter])

  const adsMonthOptions = useMemo(
    () => Array.from(new Set(ads.map(a => a.launch_date?.slice(0, 7)).filter(Boolean) as string[])).sort().reverse(),
    [ads]
  )

  // Status isn't filtered here — the kanban columns are the status view.
  // Month/day key off launch_date; ads with no launch date are hidden when either is set.
  const filteredAds = useMemo(() => {
    return ads.filter(a => {
      if (adsClientFilter !== "all" && a.client_name !== adsClientFilter) return false
      if (adsSearch && !`${a.ad_name} ${a.client_name}`.toLowerCase().includes(adsSearch.toLowerCase())) return false
      if (adsDayFilter) return a.launch_date === adsDayFilter
      if (adsMonthFilter !== "all" && a.launch_date?.slice(0, 7) !== adsMonthFilter) return false
      return true
    })
  }, [ads, adsClientFilter, adsSearch, adsMonthFilter, adsDayFilter])

  const shootDate = (s: Shoot) => s.start_time.split("T")[0]

  const shootsMonthOptions = useMemo(
    () => Array.from(new Set(shoots.map(s => shootDate(s).slice(0, 7)))).sort().reverse(),
    [shoots]
  )

  // Status isn't filtered here — the kanban columns are the status view.
  const filteredShoots = useMemo(() => {
    return shoots.filter(s => {
      if (shootsClientFilter !== "all" && s.client !== shootsClientFilter) return false
      if (shootsDayFilter) return shootDate(s) === shootsDayFilter
      if (shootsMonthFilter !== "all" && shootDate(s).slice(0, 7) !== shootsMonthFilter) return false
      return true
    })
  }, [shoots, shootsClientFilter, shootsMonthFilter, shootsDayFilter])

  // Completing needs the video titles, and Going needs the crew — both route through a
  // modal rather than firing the action directly. Cancelled is immediate.
  function handleShootStatus(shootId: string, status: ShootStatus) {
    const shoot = shoots.find(s => s.id === shootId)
    if (status === "completed") {
      if (shoot) setCompleteShootFor(shoot)
      return
    }
    if (status === "going" && members.length > 0) {
      if (shoot) setGoingCrewFor(shoot)
      return
    }
    const previous = shoot?.status
    setShoots(prev => prev.map(s => s.id === shootId ? { ...s, status } : s))
    startTransition(async () => {
      const res = await updateShootStatus(shootId, status)
      if (!res.success && previous) {
        setShoots(prev => prev.map(s => s.id === shootId ? { ...s, status: previous } : s))
      }
    })
  }

  function handleGoingCrew(shootId: string, crew: Member[]) {
    setShoots(prev => prev.map(s => s.id === shootId ? { ...s, status: "going", goingByUsers: crew } : s))
    setGoingCrewFor(null)
    startTransition(async () => { await updateShootStatus(shootId, "going", crew.map(m => m.id)) })
  }

  function handleShootCompleted(shootId: string, created: CreatedShootItem[], crew: Member[]) {
    const newItems: ContentItem[] = created.map(ci => ({
      id: ci.id, client_name: ci.client_name, title: ci.title, content_type: "video", source: "shoot",
      status: "ready_to_edit", shot_date: ci.shot_date, edited_date: null, notes: ci.notes,
      ready_platforms: [], scheduled_post_date: null, scheduled_post_time: null, corrections: [],
      hook_count: null, use_for: [], priority: null, voiceover_date: null, reviewed_at: null,
      created_at: new Date().toISOString(), posts: [],
    }))
    setItems(prev => [...newItems, ...prev])
    setShoots(prev => prev.map(s => s.id === shootId ? {
      ...s,
      status: "completed",
      goingByUsers: crew.length > 0 ? crew : s.goingByUsers,
      titles: created.map(ci => ({ id: ci.shoot_title_id, title: ci.title, content_item_id: ci.id })),
    } : s))
    setCompleteShootFor(null)
  }

  function handleCrewSaved(shootId: string, crew: Member[]) {
    setShoots(prev => prev.map(s => s.id === shootId ? { ...s, goingByUsers: crew } : s))
    setEditCrewFor(null)
  }

  function handleDeleteShoot(shoot: Shoot) {
    // Deleting a completed shoot cascades its shoot_titles away, but the content items it
    // produced are their own records and survive — say so, rather than letting someone
    // assume the videos vanish too.
    const warning = shoot.titles.length > 0
      ? `Delete "${shoot.legacyTitle}"?\n\nThe ${shoot.titles.length} video(s) it produced stay in the Pipeline — only the shoot record is removed.`
      : `Delete "${shoot.legacyTitle}"?`
    if (!confirm(warning)) return
    setShoots(prev => prev.filter(s => s.id !== shoot.id))
    startTransition(async () => { await deleteShoot(shoot.id) })
  }

  function handleShootSaved(shootId: string, patch: { client: string; legacyTitle: string; start_time: string; notes: string | null }) {
    setShoots(prev => prev.map(s => s.id === shootId ? { ...s, ...patch } : s))
    setEditShootFor(null)
  }

  function handleAdSaved(adId: string, patch: Pick<Ad, "client_name" | "ad_name" | "platform" | "launch_date" | "targeting_type" | "targeting_notes">) {
    setAds(prev => prev.map(a => a.id === adId ? { ...a, ...patch } : a))
    setEditAdFor(null)
  }

  function handleAdStatus(adId: string, status: AdStatus) {
    setAds(prev => prev.map(a => a.id === adId ? { ...a, status } : a))
    startTransition(async () => { await updateAdStatus(adId, status) })
  }

  function handleDeleteAd(adId: string) {
    if (!confirm("Delete this ad?")) return
    setAds(prev => prev.filter(a => a.id !== adId))
    startTransition(async () => { await deleteAd(adId) })
  }

  function handleShootDragOver(e: { over: { id: string } | null }) { setShootOverCol(e.over?.id ?? null) }
  function handleAdDragOver(e: { over: { id: string } | null }) { setAdOverCol(e.over?.id ?? null) }

  // Shoots board — a drag is only honoured if it's a legal transition (the same rule the
  // server enforces), so dragging out of a terminal Completed/Cancelled column is a no-op.
  function handleShootDragEnd(e: DragEndEvent) {
    const target = e.over?.id as ShootStatus | undefined
    if (target && SHOOT_STATUS_ORDER.includes(target)) {
      const shoot = shoots.find(s => s.id === e.active.id)
      if (shoot && shoot.status !== target && isValidShootTransition(shoot.status, target)) {
        handleShootStatus(shoot.id, target)
      }
    }
    setShootDragId(null); setShootOverCol(null)
  }

  // Ads board — any status can move to any other, matching the existing dropdown.
  function handleAdDragEnd(e: DragEndEvent) {
    const target = e.over?.id as AdStatus | undefined
    if (target && AD_STATUS_ORDER.includes(target)) {
      const ad = ads.find(a => a.id === e.active.id)
      if (ad && ad.status !== target) handleAdStatus(ad.id, target)
    }
    setAdDragId(null); setAdOverCol(null)
  }

  const draggedShoot = shoots.find(s => s.id === shootDragId)
  const draggedAd = ads.find(a => a.id === adDragId)

  function handlePostAdded(posts: ContentPost[]) {
    if (posts.length === 0) return
    const itemId = posts[0].content_item_id
    setItems(prev => prev.map(i => i.id === itemId ? { ...i, status: "posted", posts: [...i.posts, ...posts] } : i))
    setPlatformModalItem(null)
  }

  function handleDeletePost(postId: string, contentItemId: string) {
    setItems(prev => prev.map(i => {
      if (i.id !== contentItemId) return i
      const posts = i.posts.filter(p => p.id !== postId)
      // Mirrors the server: back to the queue if it still has a slot, else to Edited.
      const fallback: ContentStatus = i.scheduled_post_date ? "ready_to_post" : "edited"
      return { ...i, posts, status: posts.length === 0 ? fallback : i.status }
    }))
    startTransition(async () => { await deleteContentPost(postId, contentItemId) })
  }

  return (
    <div style={{ background: "#F9FAFB", minHeight: "100vh", padding: "clamp(12px,3vw,24px)", display: "flex", flexDirection: "column", gap: 20 }}>
      <PageHero
        eyebrow="MEDIA OPERATIONS"
        eyebrowIcon={<Sparkles size={14} style={{ color: "#FFD700" }} />}
        title="Content & Ads Tracker"
        subtitle="Every video and poster from shoot to post — plus a full ad hooks & targeting history."
        chips={[
          { icon: <Video size={11} />, label: `${stats.readyToEdit + stats.editing + stats.edited} in pipeline` },
          { icon: <CalendarDays size={11} />, label: `${stats.readyToPost} ready to post` },
          { icon: <Check size={11} />, label: `${stats.posted} posted` },
          { icon: <Megaphone size={11} />, label: `${ads.filter(a => a.status === "active").length} active ads` },
        ]}
      />

      <TrackerNav
        mode={mode}
        onMode={setMode}
        tab={tab}
        onTab={k => setSubTab(k as typeof subTab)}
        modeCounts={navCounts}
        sections={navSections}
      />

      {mode === "overview" && (
        <div className="flex flex-col gap-4">
          {/* Needs attention — actionable problems first, or an all-clear. */}
          <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 18, overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "12px 16px", borderBottom: "1px solid #F3F4F6" }}>
              <AlertTriangle size={13} style={{ color: overview.attention.length > 0 ? "#D97706" : "#16A34A" }} />
              <span style={{ fontSize: 10, fontWeight: 700, color: "#374151", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Needs Attention
              </span>
            </div>
            {overview.attention.length === 0 ? (
              <p style={{ fontSize: 12, fontWeight: 600, color: "#16A34A", padding: "16px", margin: 0 }}>
                All clear — nothing overdue or stalled.
              </p>
            ) : (
              <div className="flex flex-col">
                {overview.attention.map(a => (
                  <button key={a.kind} onClick={() => goTo(a.target)}
                    className="flex items-center justify-between text-left hover:bg-slate-50"
                    style={{ padding: "10px 16px", borderBottom: "1px solid #F9FAFB", border: "none", background: "transparent", cursor: "pointer" }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>{a.label}</span>
                    <ArrowRight size={13} style={{ color: "#9CA3AF" }} />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Posting — the time-sensitive block. */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <OverviewStat label="Due Today" value={overview.posting.dueToday} accent="#0EA5E9"
              onClick={() => goTo({ mode: "video", tab: "log" })} />
            <OverviewStat label="Due This Week" value={overview.posting.dueThisWeek} accent="#6366F1"
              onClick={() => goTo({ mode: "video", tab: "log" })} />
            <OverviewStat label="Overdue" value={overview.posting.overdue} accent="#EF4444"
              onClick={() => goTo({ mode: "video", tab: "log" })} />
          </div>

          {/* Videos and Posters — stage counts. */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <OverviewBlock title="Videos" accent={MODE_ACCENT.video.solid} icon={Video}
              rows={STATUS_ORDER.map(s => ({
                key: s,
                label: STATUS_CFG[s].label,
                value: overview.videos[s],
                onClick: () => goTo({ mode: "video", tab: s === "posted" ? "log" : "pipeline" }),
              }))} />
            <OverviewBlock title="Posters" accent={MODE_ACCENT.poster.solid} icon={ImageIcon}
              rows={STATUS_ORDER.map(s => ({
                key: s,
                label: STATUS_CFG[s].label,
                value: overview.posters[s],
                onClick: () => goTo({ mode: "poster", tab: s === "posted" ? "log" : "pipeline" }),
              }))} />
          </div>

          {/* Shoots and Ads. Ads is status-counts-only on purpose — the campaign/budget
              restructure is owned separately, so this stays deliberately shallow. */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <OverviewBlock title="Shoots" accent="#3B82F6" icon={Camera}
              rows={SHOOT_STATUS_ORDER.map(s => ({
                key: s,
                label: SHOOT_STATUS_CFG[s].label,
                value: overview.shoots[s],
                onClick: () => goTo({ mode: "video", tab: "shoots" }),
              }))} />
            <OverviewBlock title="Ads" accent={MODE_ACCENT.ads.solid} icon={Megaphone}
              rows={AD_STATUS_ORDER.map(s => ({
                key: s,
                label: AD_STATUS_CFG[s].label,
                value: overview.ads[s],
                onClick: () => goTo({ mode: "ads", tab: null }),
              }))} />
          </div>
        </div>
      )}

      {(mode === "video" || mode === "poster") && tab === "pipeline" && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex gap-2 flex-wrap">
              <select value={pipelineClientFilter} onChange={e => setPipelineClientFilter(e.target.value)}
                style={{ ...FIELD, width: "auto", cursor: "pointer" }}>
                <option value="all">All Clients</option>
                {allClientOptions.map(c => <option key={c} value={c}>{c}</option>)}
                {pastClientOptions.length > 0 && (
                  <optgroup label="📁 Past Clients">
                    {pastClientOptions.map(c => <option key={c} value={c}>{c}</option>)}
                  </optgroup>
                )}
              </select>
              <MonthSelect value={pipelineMonthFilter} onChange={setPipelineMonthFilter} options={allMonthOptions} />
              <DayFilter value={pipelineDayFilter} onChange={setPipelineDayFilter} />
            </div>
            <button onClick={() => setShowNewContent(true)}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 16px", borderRadius: 12, border: "none", background: "linear-gradient(135deg,#FF4D4D,#DE1A1A)", color: "#fff", fontSize: 12, fontWeight: 800, cursor: "pointer" }}>
              <Plus size={14} /> New Content
            </button>
          </div>

          {/* Mobile column switcher */}
          <div className="flex md:hidden gap-2 overflow-x-auto pb-1">
            {pipelineOrder.map(s => (
              <button key={s} onClick={() => setActiveMobileCol(s)}
                style={{ flexShrink: 0, padding: "6px 14px", borderRadius: 10, border: `1.5px solid ${activeMobileCol === s ? STATUS_CFG[s].accent : "#E5E7EB"}`, background: activeMobileCol === s ? `${STATUS_CFG[s].accent}14` : "#fff", color: activeMobileCol === s ? STATUS_CFG[s].accent : "#6B7280", fontSize: 11, fontWeight: 700 }}>
                {STATUS_CFG[s].label} ({colItems(s).length})
              </button>
            ))}
          </div>
          <div className="md:hidden">
            {colItems(activeMobileCol).length === 0 ? (
              <p style={{ fontSize: 12, color: "#374151", fontWeight: 600, textAlign: "center", padding: "24px 0" }}>No items</p>
            ) : colItems(activeMobileCol).map(item => (
              <ContentCardInner key={item.id} item={item} onAdvance={advance} onDelete={handleDeleteItem} onAddPlatform={setPlatformModalItem} onEdit={setEditingItem} onRequestCorrection={setCorrectionItem} />
            ))}
          </div>

          <div className="hidden md:block">
            <DndContext sensors={sensors} onDragStart={handleDragStart} onDragOver={handleDragOver as never} onDragEnd={handleDragEnd}>
              <div className="grid grid-cols-5 gap-3">
                {pipelineOrder.map(status => {
                  const list = colItems(status)
                  const cfg = STATUS_CFG[status]
                  return (
                    <DroppableColumn key={status} status={status} isOver={overCol === status}>
                      <div className="flex items-center justify-between px-4 py-3 rounded-t-2xl" style={{ background: "#FFFFFF", borderBottom: "1px solid #E8E9EF" }}>
                        <div className="flex items-center gap-2">
                          <span className="text-[13px] font-black" style={{ color: "#111111" }}>{cfg.label}</span>
                          <span className="w-5 h-5 rounded-full text-[9px] font-black flex items-center justify-center" style={{ background: `${cfg.accent}20`, color: cfg.accent }}>{list.length}</span>
                        </div>
                      </div>
                      <div className="p-3 flex-1">
                        {list.length === 0 ? (
                          <div className="flex items-center justify-center py-8 rounded-xl transition-all" style={{ border: `2px dashed ${overCol === status ? cfg.accent : "#E5E7EB"}` }}>
                            <p className="text-[11px]" style={{ color: overCol === status ? cfg.accent : "#374151", fontWeight: 600 }}>{overCol === status ? "Drop here" : "No items"}</p>
                          </div>
                        ) : list.map(item => (
                          <DraggableCard key={item.id} item={item} isDragging={dragId === item.id} onAdvance={advance} onDelete={handleDeleteItem} onAddPlatform={setPlatformModalItem} onEdit={setEditingItem} onRequestCorrection={setCorrectionItem} />
                        ))}
                      </div>
                    </DroppableColumn>
                  )
                })}
              </div>
              <DragOverlay>
                {draggedItem ? (
                  <div style={{ width: 260, opacity: 0.95, transform: "rotate(2deg)" }}>
                    <ContentCardInner item={draggedItem} onAdvance={() => {}} onDelete={() => {}} onAddPlatform={() => {}} />
                  </div>
                ) : null}
              </DragOverlay>
            </DndContext>
          </div>
        </div>
      )}

      {mode === "video" && tab === "adsvideo" && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <p className="text-[11px]" style={{ color: "#6B7280", margin: 0 }}>
              Video that starts as a script, not a shoot — scripting and voice-over here, then it joins the shared production board at Ready to Edit.
            </p>
            <button onClick={() => setShowNewAdsVideo(true)}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 16px", borderRadius: 12, border: "none", background: "linear-gradient(135deg,#FF4D4D,#DE1A1A)", color: "#fff", fontSize: 12, fontWeight: 800, cursor: "pointer" }}>
              <Plus size={14} /> New Ads Video
            </button>
          </div>

          <div className="md:hidden flex flex-col gap-3">
            {ADS_VIDEO_ORDER.map(status => (
              <div key={status}>
                <p className="text-[11px] font-black mb-2" style={{ color: "#111111" }}>{STATUS_CFG[status].label} ({adsVideoColItems(status).length})</p>
                {adsVideoColItems(status).length === 0 ? (
                  <p style={{ fontSize: 12, color: "#374151", fontWeight: 600, textAlign: "center", padding: "16px 0" }}>No items</p>
                ) : adsVideoColItems(status).map(item => (
                  <AdsVideoCardInner key={item.id} item={item} onAdvance={advance} onEdit={setEditAdsVideoFor} onDelete={handleDeleteItem} />
                ))}
              </div>
            ))}
          </div>

          <div className="hidden md:block">
            <DndContext sensors={sensors} onDragStart={e => setAdsVideoDragId(String(e.active.id))} onDragOver={handleAdsVideoDragOver as never} onDragEnd={handleAdsVideoDragEnd}>
              <div className="grid grid-cols-2 gap-3">
                {ADS_VIDEO_ORDER.map(status => {
                  const list = adsVideoColItems(status)
                  const cfg = STATUS_CFG[status]
                  return (
                    <KanbanColumn key={status} id={status} accent={cfg.accent} isOver={adsVideoOverCol === status}>
                      <KanbanColumnHeader label={cfg.label} count={list.length} accent={cfg.accent} />
                      <div className="p-3 flex-1">
                        {list.length === 0 ? (
                          <KanbanEmptyCell isOver={adsVideoOverCol === status} accent={cfg.accent} />
                        ) : list.map(item => (
                          <KanbanCard key={item.id} id={item.id}>
                            <AdsVideoCardInner item={item} isDragging={adsVideoDragId === item.id} onAdvance={advance} onEdit={setEditAdsVideoFor} onDelete={handleDeleteItem} />
                          </KanbanCard>
                        ))}
                      </div>
                    </KanbanColumn>
                  )
                })}
              </div>
              <DragOverlay>
                {draggedAdsVideo ? (
                  <div style={{ width: 260, opacity: 0.95, transform: "rotate(2deg)" }}>
                    <AdsVideoCardInner item={draggedAdsVideo} onAdvance={() => {}} onEdit={() => {}} onDelete={() => {}} />
                  </div>
                ) : null}
              </DragOverlay>
            </DndContext>
          </div>
        </div>
      )}

      {(mode === "video" || mode === "poster") && tab === "log" && (
        <div className="flex flex-col gap-4">
          {/* Upcoming queue — what's scheduled but hasn't gone out yet, soonest first. */}
          {readyQueue.length > 0 && (
            <div style={{ background: "#fff", border: "1px solid #BAE6FD", borderRadius: 18, overflow: "hidden" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "12px 16px", borderBottom: "1px solid #F3F4F6", background: "rgba(14,165,233,0.05)" }}>
                <CalendarDays size={13} style={{ color: "#0EA5E9" }} />
                <span style={{ fontSize: 10, fontWeight: 700, color: "#0EA5E9", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  Ready to Post — {readyQueue.length} queued
                </span>
              </div>
              <div className="flex flex-col">
                {readyQueue.map(item => (
                  <div key={item.id} className="flex items-center justify-between flex-wrap gap-2"
                    style={{ padding: "10px 16px", borderBottom: "1px solid #F9FAFB" }}>
                    <div style={{ minWidth: 0 }}>
                      <p className="text-[12px] font-bold" style={{ color: "#111827", margin: 0 }}>{item.title}</p>
                      <p className="text-[10px]" style={{ color: "#6B7280", margin: "2px 0 0" }}>{item.client_name}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full"
                        style={{ background: "rgba(14,165,233,0.1)", color: "#0EA5E9" }}>
                        <CalendarDays size={10} />
                        {fmtDate(item.scheduled_post_date)}{item.scheduled_post_time ? ` · ${fmtTime(item.scheduled_post_time)}` : ""}
                      </span>
                      {item.ready_platforms.map(p => {
                        const cfg = PLATFORM_CFG[p]
                        const Icon = cfg.icon
                        return (
                          <span key={p} className="flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full"
                            style={{ background: `${cfg.color}14`, color: cfg.color }}>
                            <Icon size={10} /> {cfg.label}
                          </span>
                        )
                      })}
                      <button onClick={() => setPlatformModalItem(item)}
                        className="text-[10px] font-bold px-2.5 py-1 rounded-lg"
                        style={{ border: "none", background: "rgba(34,197,94,0.1)", color: "#16A34A", cursor: "pointer" }}>
                        Mark Posted
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 18, overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderBottom: "1px solid #F3F4F6" }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: "#374151", textTransform: "uppercase", letterSpacing: "0.06em" }}>Per-Client KPIs</span>
              <select value={logMonthFilter} onChange={e => setLogMonthFilter(e.target.value)}
                style={{ ...FIELD, width: "auto", cursor: "pointer", padding: "5px 10px", fontSize: 11 }}>
                <option value="all">All Time</option>
                {logMonthOptions.map(m => <option key={m} value={m}>{fmtMonth(m)}</option>)}
              </select>
            </div>
            {clientKPIs.length === 0 ? (
              <p style={{ fontSize: 12, color: "#374151", fontWeight: 600, textAlign: "center", padding: "20px 0", margin: 0 }}>No activity {logMonthFilter === "all" ? "yet" : `in ${fmtMonth(logMonthFilter)}`}</p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: "#F9FAFB" }}>
                      {["Client", "Posted", "Unposted", "Unedited"].map(h => (
                        <th key={h} style={{ textAlign: h === "Client" ? "left" : "center", padding: "8px 14px", fontSize: 10, fontWeight: 700, color: "#374151", textTransform: "uppercase", letterSpacing: "0.06em" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {clientKPIs.map(row => (
                      <tr key={row.client} style={{ borderTop: "1px solid #F3F4F6", cursor: "pointer" }}
                        onClick={() => setLogClientFilter(prev => prev === row.client ? "all" : row.client)}>
                        <td style={{ padding: "9px 14px", fontWeight: 700, color: logClientFilter === row.client ? "#DE1A1A" : "#111827" }}>{row.client}</td>
                        <td style={{ padding: "9px 14px", textAlign: "center", fontWeight: 800, color: STATUS_CFG.posted.accent }}>{row.posted}</td>
                        <td style={{ padding: "9px 14px", textAlign: "center", fontWeight: 800, color: STATUS_CFG.edited.accent }}>{row.unposted}</td>
                        <td style={{ padding: "9px 14px", textAlign: "center", fontWeight: 800, color: STATUS_CFG.ready_to_edit.accent }}>{row.unedited}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <div style={{ position: "relative", flex: "1 1 200px" }}>
              <Search size={13} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#9CA3AF" }} />
              <input value={logSearch} onChange={e => setLogSearch(e.target.value)} placeholder="Search title or client…"
                style={{ ...FIELD, paddingLeft: 30 }} />
            </div>
            <select value={logClientFilter} onChange={e => setLogClientFilter(e.target.value)}
              style={{ ...FIELD, width: "auto", cursor: "pointer", flex: "0 0 auto" }}>
              <option value="all">All Clients</option>
              {logClientOptions.map(c => <option key={c} value={c}>{c}</option>)}
              {pastClientOptions.length > 0 && (
                <optgroup label="📁 Past Clients">
                  {pastClientOptions.map(c => <option key={c} value={c}>{c}</option>)}
                </optgroup>
              )}
            </select>
            <MonthSelect value={logMonthFilter} onChange={setLogMonthFilter} options={logMonthOptions} />
            <DayFilter value={logDayFilter} onChange={setLogDayFilter} />
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={() => setLogPlatformFilter("all")}
              style={{ padding: "8px 12px", borderRadius: 10, border: `1.5px solid ${logPlatformFilter === "all" ? "#DE1A1A" : "#E5E7EB"}`, background: logPlatformFilter === "all" ? "rgba(222,26,26,0.08)" : "#fff", color: logPlatformFilter === "all" ? "#DE1A1A" : "#6B7280", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
              All Platforms
            </button>
            {(Object.keys(PLATFORM_CFG) as Platform[]).map(p => {
              const cfg = PLATFORM_CFG[p]
              return (
                <button key={p} onClick={() => setLogPlatformFilter(p)}
                  style={{ display: "flex", alignItems: "center", gap: 5, padding: "8px 12px", borderRadius: 10, border: `1.5px solid ${logPlatformFilter === p ? cfg.color : "#E5E7EB"}`, background: logPlatformFilter === p ? `${cfg.color}14` : "#fff", color: logPlatformFilter === p ? cfg.color : "#6B7280", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                  <cfg.icon size={11} /> {cfg.label}
                </button>
              )
            })}
          </div>

          <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 18, overflow: "hidden" }}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ background: "#F9FAFB", borderBottom: "1px solid #E5E7EB" }}>
                    {["Video/Poster", "Client", "Type", "Platforms", "Posted By", "Posted Date"].map(h => (
                      <th key={h} style={{ textAlign: "left", padding: "10px 14px", fontSize: 10, fontWeight: 700, color: "#374151", textTransform: "uppercase", letterSpacing: "0.06em" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {logRows.length === 0 ? (
                    <tr><td colSpan={6} style={{ padding: "32px 14px", textAlign: "center", color: "#374151", fontWeight: 600, fontSize: 12 }}>No posts logged yet</td></tr>
                  ) : logRows.map(item => (
                    <tr key={item.id} style={{ borderBottom: "1px solid #F3F4F6" }}>
                      <td style={{ padding: "10px 14px", fontWeight: 700, color: "#111827" }}>{item.title}</td>
                      <td style={{ padding: "10px 14px", color: "#6366F1", fontWeight: 600 }}>{item.client_name}</td>
                      <td style={{ padding: "10px 14px", color: "#374151", fontWeight: 600, textTransform: "capitalize" }}>{item.content_type}</td>
                      <td style={{ padding: "10px 14px" }}>
                        <div className="flex flex-wrap items-center gap-1">
                          {item.posts.map(post => {
                            const cfg = PLATFORM_CFG[post.platform]
                            return (
                              <span key={post.id} className="inline-flex items-center gap-1 group/badge"
                                style={{ background: `${cfg.color}14`, color: cfg.color, padding: "3px 6px 3px 8px", borderRadius: 99, fontSize: 10, fontWeight: 700 }}>
                                <cfg.icon size={10} /> {cfg.label}
                                <button onClick={() => handleDeletePost(post.id, item.id)} title="Remove this platform"
                                  style={{ background: "transparent", border: "none", cursor: "pointer", padding: 0, display: "flex", opacity: 0.5 }}
                                  onMouseEnter={e => (e.currentTarget.style.opacity = "1")} onMouseLeave={e => (e.currentTarget.style.opacity = "0.5")}>
                                  <X size={9} />
                                </button>
                              </span>
                            )
                          })}
                        </div>
                      </td>
                      <td style={{ padding: "10px 14px" }}>
                        {/* One item can be posted to different platforms by different people. */}
                        <div className="flex flex-wrap items-center gap-1">
                          {Array.from(new Map(
                            item.posts
                              .filter(p => p.postedByUser)
                              .map(p => [p.postedByUser!.id, p.postedByUser!])
                          ).values()).map(u => (
                            <span key={u.id} className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                              style={{ background: "rgba(34,197,94,0.1)", color: "#16A34A" }}>
                              <span className="w-3.5 h-3.5 rounded-full flex items-center justify-center text-[7px] font-black"
                                style={{ background: "#16A34A", color: "#fff" }}>
                                {initials(u.name)}
                              </span>
                              {u.name}
                            </span>
                          ))}
                          {item.posts.every(p => !p.postedByUser) && (
                            <span className="text-[10px]" style={{ color: "#9CA3AF" }}>—</span>
                          )}
                        </div>
                      </td>
                      <td style={{ padding: "10px 14px", color: "#374151" }}>{fmtDateRange(item.posts.map(p => p.posted_date))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {mode === "ads" && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2 flex-wrap" style={{ flex: "1 1 auto" }}>
              <div style={{ position: "relative", flex: "1 1 200px" }}>
                <Search size={13} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#9CA3AF" }} />
                <input value={adsSearch} onChange={e => setAdsSearch(e.target.value)} placeholder="Search ad or client…"
                  style={{ ...FIELD, paddingLeft: 30 }} />
              </div>
              <select value={adsClientFilter} onChange={e => setAdsClientFilter(e.target.value)}
                style={{ ...FIELD, width: "auto", cursor: "pointer" }}>
                <option value="all">All Clients</option>
                {activeClientOptions.map(c => <option key={c} value={c}>{c}</option>)}
                {pastClientOptions.length > 0 && (
                  <optgroup label="📁 Past Clients">
                    {pastClientOptions.map(c => <option key={c} value={c}>{c}</option>)}
                  </optgroup>
                )}
              </select>
              <MonthSelect value={adsMonthFilter} onChange={setAdsMonthFilter} options={adsMonthOptions} />
              <DayFilter value={adsDayFilter} onChange={setAdsDayFilter} />
            </div>
            <button onClick={() => setShowNewAd(true)}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 16px", borderRadius: 12, border: "none", background: "linear-gradient(135deg,#FF4D4D,#DE1A1A)", color: "#fff", fontSize: 12, fontWeight: 800, cursor: "pointer" }}>
              <Plus size={14} /> New Ad
            </button>
          </div>

          {/* Mobile column switcher */}
          <div className="flex md:hidden gap-2 overflow-x-auto pb-1">
            {AD_STATUS_ORDER.map(s => {
              const cfg = AD_STATUS_CFG[s]
              const count = filteredAds.filter(a => a.status === s).length
              return (
                <button key={s} onClick={() => setActiveAdCol(s)}
                  style={{ flexShrink: 0, padding: "6px 14px", borderRadius: 10, border: `1.5px solid ${activeAdCol === s ? cfg.color : "#E5E7EB"}`, background: activeAdCol === s ? `${cfg.color}14` : "#fff", color: activeAdCol === s ? cfg.color : "#6B7280", fontSize: 11, fontWeight: 700 }}>
                  {cfg.label} ({count})
                </button>
              )
            })}
          </div>
          <div className="md:hidden">
            {filteredAds.filter(a => a.status === activeAdCol).length === 0 ? (
              <p style={{ fontSize: 12, color: "#374151", fontWeight: 600, textAlign: "center", padding: "24px 0" }}>No ads</p>
            ) : filteredAds.filter(a => a.status === activeAdCol).map(ad => (
              <AdCardInner key={ad.id} ad={ad} expanded={expandedAd === ad.id}
                onToggleExpand={id => setExpandedAd(expandedAd === id ? null : id)}
                onLogPerformance={setPerformanceModalAd} onLogCorrection={setRevisionModalAd}
                onDelete={handleDeleteAd} onEdit={setEditAdFor} />
            ))}
          </div>

          {/* Desktop kanban */}
          <div className="hidden md:block">
            <DndContext sensors={sensors}
              onDragStart={e => setAdDragId(String(e.active.id))}
              onDragOver={handleAdDragOver as never}
              onDragEnd={handleAdDragEnd}>
              <div className="grid grid-cols-4 gap-4">
                {AD_STATUS_ORDER.map(status => {
                  const cfg = AD_STATUS_CFG[status]
                  const list = filteredAds.filter(a => a.status === status)
                  return (
                    <KanbanColumn key={status} id={status} accent={cfg.color} isOver={adOverCol === status}>
                      <KanbanColumnHeader label={cfg.label} count={list.length} accent={cfg.color} />
                      <div className="p-3 flex-1">
                        {list.length === 0 ? (
                          <KanbanEmptyCell isOver={adOverCol === status} accent={cfg.color} />
                        ) : list.map(ad => (
                          <KanbanCard key={ad.id} id={ad.id}>
                            <AdCardInner ad={ad} expanded={expandedAd === ad.id} isDragging={adDragId === ad.id}
                              onToggleExpand={id => setExpandedAd(expandedAd === id ? null : id)}
                              onLogPerformance={setPerformanceModalAd} onLogCorrection={setRevisionModalAd}
                              onDelete={handleDeleteAd} onEdit={setEditAdFor} />
                          </KanbanCard>
                        ))}
                      </div>
                    </KanbanColumn>
                  )
                })}
              </div>
              <DragOverlay>
                {draggedAd ? (
                  <div style={{ width: 260, opacity: 0.95, transform: "rotate(2deg)" }}>
                    <AdCardInner ad={draggedAd} onToggleExpand={() => {}} onLogPerformance={() => {}} onLogCorrection={() => {}} onDelete={() => {}} />
                  </div>
                ) : null}
              </DragOverlay>
            </DndContext>
          </div>
        </div>
      )}

      {mode === "video" && tab === "shoots" && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <select value={shootsClientFilter} onChange={e => setShootsClientFilter(e.target.value)}
                style={{ ...FIELD, width: "auto", cursor: "pointer" }}>
                <option value="all">All Clients</option>
                {activeClientOptions.map(c => <option key={c} value={c}>{c}</option>)}
                {pastClientOptions.length > 0 && (
                  <optgroup label="📁 Past Clients">
                    {pastClientOptions.map(c => <option key={c} value={c}>{c}</option>)}
                  </optgroup>
                )}
              </select>
              <MonthSelect value={shootsMonthFilter} onChange={setShootsMonthFilter} options={shootsMonthOptions} />
              <DayFilter value={shootsDayFilter} onChange={setShootsDayFilter} />
            </div>
            <button onClick={() => setShowNewShoot(true)}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 16px", borderRadius: 12, border: "none", background: "linear-gradient(135deg,#FF4D4D,#DE1A1A)", color: "#fff", fontSize: 12, fontWeight: 800, cursor: "pointer" }}>
              <Plus size={14} /> New Shoot
            </button>
          </div>

          {/* Mobile column switcher */}
          <div className="flex md:hidden gap-2 overflow-x-auto pb-1">
            {SHOOT_STATUS_ORDER.map(s => {
              const cfg = SHOOT_STATUS_CFG[s]
              const count = filteredShoots.filter(x => x.status === s).length
              return (
                <button key={s} onClick={() => setActiveShootCol(s)}
                  style={{ flexShrink: 0, padding: "6px 14px", borderRadius: 10, border: `1.5px solid ${activeShootCol === s ? cfg.color : "#E5E7EB"}`, background: activeShootCol === s ? `${cfg.color}14` : "#fff", color: activeShootCol === s ? cfg.color : "#6B7280", fontSize: 11, fontWeight: 700 }}>
                  {cfg.label} ({count})
                </button>
              )
            })}
          </div>
          <div className="md:hidden">
            {filteredShoots.filter(s => s.status === activeShootCol).length === 0 ? (
              <p style={{ fontSize: 12, color: "#374151", fontWeight: 600, textAlign: "center", padding: "24px 0" }}>No shoots</p>
            ) : filteredShoots.filter(s => s.status === activeShootCol).map(shoot => (
              <ShootCardInner key={shoot.id} shoot={shoot} onStatus={handleShootStatus} onEditCrew={setEditCrewFor} onEdit={setEditShootFor} onDelete={handleDeleteShoot} />
            ))}
          </div>

          {/* Desktop kanban */}
          <div className="hidden md:block">
            <DndContext sensors={sensors}
              onDragStart={e => setShootDragId(String(e.active.id))}
              onDragOver={handleShootDragOver as never}
              onDragEnd={handleShootDragEnd}>
              <div className="grid grid-cols-4 gap-4">
                {SHOOT_STATUS_ORDER.map(status => {
                  const cfg = SHOOT_STATUS_CFG[status]
                  const list = filteredShoots.filter(s => s.status === status)
                  return (
                    <KanbanColumn key={status} id={status} accent={cfg.color} isOver={shootOverCol === status}>
                      <KanbanColumnHeader label={cfg.label} count={list.length} accent={cfg.color} />
                      <div className="p-3 flex-1">
                        {list.length === 0 ? (
                          <KanbanEmptyCell isOver={shootOverCol === status} accent={cfg.color} />
                        ) : list.map(shoot => (
                          <KanbanCard key={shoot.id} id={shoot.id}>
                            <ShootCardInner shoot={shoot} isDragging={shootDragId === shoot.id} onStatus={handleShootStatus} onEditCrew={setEditCrewFor} onEdit={setEditShootFor} onDelete={handleDeleteShoot} />
                          </KanbanCard>
                        ))}
                      </div>
                    </KanbanColumn>
                  )
                })}
              </div>
              <DragOverlay>
                {draggedShoot ? (
                  <div style={{ width: 260, opacity: 0.95, transform: "rotate(2deg)" }}>
                    <ShootCardInner shoot={draggedShoot} onStatus={() => {}} />
                  </div>
                ) : null}
              </DragOverlay>
            </DndContext>
          </div>
        </div>
      )}

      {showNewContent && (
        <NewContentModal clients={clients} pastClients={pastClients} defaultContentType={contentTypeForMode} onClose={() => setShowNewContent(false)}
          onCreated={item => { setItems(prev => [item, ...prev]); setShowNewContent(false) }} />
      )}
      {platformModalItem && (
        <AddPlatformModal item={platformModalItem} members={members} currentUserId={currentUserId}
          onClose={() => setPlatformModalItem(null)} onAdded={handlePostAdded} />
      )}
      {editingItem && (
        <EditContentModal item={editingItem} clients={clients} pastClients={pastClients} onClose={() => setEditingItem(null)}
          onSaved={updates => {
            setItems(prev => prev.map(i => i.id === editingItem.id ? { ...i, ...updates, notes: updates.notes || null } : i))
            setEditingItem(null)
          }} />
      )}
      {showNewAd && (
        <NewAdModal clients={clients} pastClients={pastClients} onClose={() => setShowNewAd(false)}
          onCreated={ad => { setAds(prev => [ad, ...prev]); setShowNewAd(false) }} />
      )}
      {revisionModalAd && (
        <AdRevisionModal ad={revisionModalAd} onClose={() => setRevisionModalAd(null)}
          onAdded={rev => {
            setAds(prev => prev.map(a => a.id === rev.ad_id ? {
              ...a, revisions: [rev, ...a.revisions],
              hook_count: rev.hook_count_after ?? a.hook_count,
              targeting_type: rev.targeting_type_after ?? a.targeting_type,
            } : a))
            setRevisionModalAd(null)
          }} />
      )}
      {performanceModalAd && (
        <AdPerformanceModal ad={performanceModalAd} onClose={() => setPerformanceModalAd(null)}
          onAdded={entry => {
            setAds(prev => prev.map(a => a.id === entry.ad_id ? { ...a, performanceEntries: [entry, ...a.performanceEntries] } : a))
            setPerformanceModalAd(null)
          }} />
      )}
      {showNewShoot && (
        <NewShootModal clients={clients} pastClients={pastClients} onClose={() => setShowNewShoot(false)}
          onCreated={shoot => { setShoots(prev => [shoot, ...prev]); setShowNewShoot(false) }} />
      )}
      {completeShootFor && (
        <CompleteShootModal shoot={completeShootFor} members={members} currentUserId={currentUserId}
          onClose={() => setCompleteShootFor(null)}
          onCompleted={(created, crew) => handleShootCompleted(completeShootFor.id, created, crew)} />
      )}
      {editCrewFor && (
        <EditCrewModal shoot={editCrewFor} members={members} currentUserId={currentUserId}
          onClose={() => setEditCrewFor(null)}
          onSaved={crew => handleCrewSaved(editCrewFor.id, crew)} />
      )}
      {editShootFor && (
        <EditShootModal shoot={editShootFor} clients={clients} pastClients={pastClients}
          onClose={() => setEditShootFor(null)}
          onSaved={patch => handleShootSaved(editShootFor.id, patch)} />
      )}
      {editAdFor && (
        <EditAdModal ad={editAdFor} clients={clients} pastClients={pastClients}
          onClose={() => setEditAdFor(null)}
          onSaved={patch => handleAdSaved(editAdFor.id, patch)} />
      )}
      {startEditingItem && (
        <StartEditingModal item={startEditingItem} members={members} currentUserId={currentUserId}
          onClose={() => setStartEditingItem(null)}
          onConfirm={(editorId, editorName) => handleStartEditing(startEditingItem, editorId, editorName)} />
      )}
      {showNewAdsVideo && (
        <NewAdsVideoModal
          clients={clients} pastClients={pastClients}
          onClose={() => setShowNewAdsVideo(false)}
          onCreated={item => { setItems(prev => [item, ...prev]); setShowNewAdsVideo(false) }}
        />
      )}
      {voiceOverItem && (
        <VoiceOverModal
          item={voiceOverItem} freelancers={voiceoverFreelancers}
          onClose={() => setVoiceOverItem(null)}
          onConfirm={(freelancer, date) => handleVoiceOverRecorded(voiceOverItem, freelancer, date)}
        />
      )}
      {editAdsVideoFor && (
        <EditAdsVideoModal
          item={editAdsVideoFor} clients={clients} pastClients={pastClients}
          onClose={() => setEditAdsVideoFor(null)}
          onSaved={updates => {
            setItems(prev => prev.map(i => i.id === editAdsVideoFor.id ? { ...i, ...updates, notes: updates.notes || null } : i))
            setEditAdsVideoFor(null)
          }}
        />
      )}
      {readyToPostItem && (
        <ReadyToPostModal item={readyToPostItem} onClose={() => setReadyToPostItem(null)}
          onScheduled={(platforms, date, time) => handleReadyToPost(readyToPostItem, platforms, date, time)} />
      )}
      {correctionItem && (
        <RequestCorrectionModal item={correctionItem} members={members}
          onClose={() => setCorrectionItem(null)} onRequested={handleCorrectionRequested} />
      )}
      {goingCrewFor && (
        <GoingCrewModal shoot={goingCrewFor} members={members} currentUserId={currentUserId}
          onClose={() => setGoingCrewFor(null)}
          onConfirm={crew => handleGoingCrew(goingCrewFor.id, crew)} />
      )}
    </div>
  )
}
