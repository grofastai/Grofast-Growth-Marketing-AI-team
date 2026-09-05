"use client"

import { useCallback, useEffect, useMemo, useState, useTransition } from "react"
import Image from "next/image"
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors,
  useDraggable, useDroppable,
  type DragEndEvent, type DragStartEvent,
} from "@dnd-kit/core"
import {
  Plus, X, GripVertical, Video, Image as ImageIcon, Camera, PlaySquare, ThumbsUp,
  Building2, Store, Search, Trash2, Sparkles, Pencil, AtSign,
  Layers, History, ArrowRight, Check, ChevronDown, Megaphone, Target, AlertTriangle, CalendarDays, RotateCcw, LayoutDashboard,
  MoreVertical, XCircle, ExternalLink, Clock,
} from "lucide-react"
import { PageHero } from "@/components/admin/PageHero"
import ClientSelector from "@/components/ui/ClientSelector"
import { useConfirm } from "@/components/ui/ConfirmDialog"
import { buildClientOptions } from "@/lib/utils/client-options"
import { todayIST } from "@/lib/utils/ist-date"
import { latestEntry, isUnderperforming, cpc, cpm, frequency, costPerResult, type AdPerformanceEntry } from "@/lib/ads-tracker/performance-metrics"
import {
  createContentItem, updateContentItem, updateContentItemStatus, deleteContentItem,
  addContentPost, deleteContentPost, updateContentPost,
  createAd, updateAd, updateAdStatus, deleteAd, addAdRevision, addAdPerformanceEntry, requestCorrection,
  createAdsVideoScript, recordVoiceOver, updateAdsVideoScript, updateVoiceOver, setClientMonthlyTarget,
  rescheduleContentItem,
} from "@/lib/actions/media-tracker"
import { createTrackerShoot, completeShootWithTitles, updateShootStatus, updateShootCrew, updateTrackerShoot, deleteShoot, moveScriptToShoot, renameShootTitle, deleteShootTitle, addShootTitle, updateShootActualTime, updateShootDriveLink, type CreatedShootItem } from "@/lib/actions/shoots"
import { isValidShootTransition } from "@/lib/shoots/status-transitions"
import { isValidPipelineTransition } from "@/lib/media-tracker/pipeline-transitions"
import { computeOverview, type AttentionItem } from "@/lib/media-tracker/overview"
import { isValidDriveLink } from "@/lib/utils/drive-link"
import { scheduleBadgeState, type ScheduleEntry } from "@/lib/media-tracker/schedule"
import { ScheduleTab } from "./schedule/schedule-tab"
import { OverviewDashboard } from "./overview/overview-dashboard"
import { MonthSelect, FILTER_FIELD } from "./month-select"

// ── Types ────────────────────────────────────────────────────────────────────
// "ads" is a real posting destination — an Ads Video can be scheduled/posted straight
// to Ads with no organic platform attached, so it lives in Platform, not just UseFor.
type Platform = "instagram" | "youtube" | "facebook" | "linkedin" | "gmb" | "twitter" | "ads" | "meta_ads" | "google_ads" | "other"
type UseFor = Platform
type Priority = "low" | "medium" | "high" | "urgent"
type ContentSource = "shoot" | "ads_video" | "poster"
type ContentStatus =
  | "scripting" | "voiceover" | "design" | "ready_to_edit" | "edited"
  | "on_review" | "branding_ready" | "ads_ready" | "posted" | "cancelled"
type TargetingType = "broad" | "interest" | "lookalike" | "retargeting"
type AdStatus = "active" | "paused" | "testing" | "stopped"
type ShootType = "ads_shoot" | "branding_shoot"
type ShootTag = "branding" | "advertisement" | "promotion"
type CancelledBy = "client" | "us"

type Person = { id: string; name: string } | null

export type ContentPost = {
  id: string
  content_item_id: string
  platform: Platform
  posted_date: string
  post_link: string | null
  ad_run_date: string | null
  other_platform_label?: string | null
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
  shoot_type: ShootType | null
  voiceover_date: string | null
  reviewed_at: string | null
  // Derived from posts — see addContentPost/deleteContentPost. Independent of status:
  // an item can be posted_branding, posted_ads, or both at once.
  posted_branding: boolean
  posted_ads: boolean
  cancelled_by: CancelledBy | null
  // Required at the Edited -> Completed Edit (on_review) move — where the edit actually lives.
  edited_drive_link: string | null
  script_drive_link: string | null
  // Ticked independently at Mark as Posted/Ads — one-way, never unset by the app.
  is_promotion: boolean
  shotByUsers?: Member[]
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

export type ShootStatus = "scheduled" | "completed" | "cancelled"
export type ShootTitleRef = { id: string; title: string; content_item_id: string | null }
export type Shoot = {
  id: string
  client: string
  legacyTitle: string
  start_time: string
  end_time: string | null
  created_at: string
  notes: string | null
  status: ShootStatus
  shoot_type: ShootType | null
  tags: ShootTag[]
  // Set when this shoot was spun off an Ads Video item via "Move to Shoot" — completing
  // it advances that linked item straight to Ready to Edit instead of creating new titles.
  source_content_item_id: string | null
  // Required at Mark Done — where the raw footage actually lives.
  drive_link: string | null
  goingByUsers: { id: string; name: string }[]
  titles: ShootTitleRef[]
}

export type Member = { id: string; name: string }

// Monthly posting target for a client, scoped to branding vs ads — set inline
// from the per-client stats box next to Waiting to Post.
export type ClientTarget = {
  client_name: string
  kind: "branding" | "ads"
  content_type: "video" | "poster"
  month: string // 'YYYY-MM'
  target: number
}

type Props = {
  initialItems: ContentItem[]
  initialAds: Ad[]
  initialShoots: Shoot[]
  members: Member[]
  currentUserId: string
  clients: { id: string; name: string }[]
  pastClients: { id: string; name: string }[]
  voiceoverFreelancers: VoiceFreelancer[]
  // Media Tracker's own pickable-people tags — who's eligible to be picked for each stage.
  // Filtered strictly: a stage with nobody tagged yet shows an empty picker rather than
  // falling back to the full member list, by explicit choice.
  scriptingMembers: Member[]
  editingMembers: Member[]
  shootingMembers: Member[]
  voiceoverMembers: Member[]
  initialClientTargets: ClientTarget[]
}

// ── Design tokens ────────────────────────────────────────────────────────────
const STATUS_CFG: Record<ContentStatus, { label: string; accent: string }> = {
  scripting:       { label: "Scripting",       accent: "#F97316" },
  voiceover:       { label: "Voice Over",      accent: "#1E3A8A" },
  design:          { label: "Design",          accent: "#F59E0B" },
  ready_to_edit:   { label: "Ready to Edit",   accent: "#0D9488" },
  edited:          { label: "Editing",         accent: "#8B5CF6" },
  // Renamed from "On Review" — this is the admin sign-off gate now that editor hand-off
  // has its own Edited stage before it; the DB value stays on_review, display-only rename.
  // Was #EC4899 (pink) — too close to neighboring stages once darkened for the badge fill.
  // Rose reads as its own distinct hue in the lineup.
  on_review:       { label: "Completed Edit",  accent: "#F43F5E" },
  branding_ready:  { label: "Branding Ready",  accent: "#0EA5E9" },
  ads_ready:       { label: "Ads Ready",       accent: "#D97706" },
  posted:          { label: "Posted",          accent: "#22C55E" },
  cancelled:       { label: "Cancelled",       accent: "#EF4444" },
}
// Darkens a #RRGGBB hex color by blending it toward black — computed in JS instead of the
// CSS color-mix() function, which silently drops the whole declaration (no fallback, no
// partial degrade) on browsers that don't support it, e.g. older Android WebViews. That was
// making every gradient/accent built with color-mix() render with no color at all on mobile.
function darken(hex: string, keepPct: number): string {
  const n = parseInt(hex.replace("#", ""), 16)
  const r = Math.round(((n >> 16) & 255) * keepPct)
  const g = Math.round(((n >> 8) & 255) * keepPct)
  const b = Math.round((n & 255) * keepPct)
  return `rgb(${r}, ${g}, ${b})`
}
// Advance-button fill — same bright-to-dark two-stop language as MODE_ACCENT.grad and
// OVERVIEW_TILE_GRADIENTS, just derived from each status's accent instead of a hardcoded pair.
function statusButtonGradient(status: ContentStatus): string {
  const accent = STATUS_CFG[status].accent
  return `linear-gradient(135deg, ${accent}, ${darken(accent, 0.6)})`
}
// The production board's column order — differs by content type only in its first column
// (shoot/ads-video video enters at Ready to Edit; posters enter at Design). Both then pass
// through the shared Edited checkpoint before the Completed Edit review gate.
const VIDEO_PIPELINE_ORDER: ContentStatus[] = ["ready_to_edit", "edited", "on_review", "branding_ready", "ads_ready", "cancelled"]
const POSTER_PIPELINE_ORDER: ContentStatus[] = ["design", "edited", "on_review", "branding_ready", "ads_ready", "cancelled"]
// The Ads Video sub-tab's own draggable columns — feeds INTO Ready to Edit, doesn't include it.
// A 3rd, non-draggable "Completed" column (not a real ContentStatus) sits alongside these —
// see adsVideoCompletedItems.
const ADS_VIDEO_ORDER: ContentStatus[] = ["scripting", "voiceover"]
const ADS_VIDEO_COMPLETED_CFG = { label: "Completed", accent: "#22C55E" }
// The default "move forward" target for the generic advance button. on_review is
// deliberately absent — it branches three ways (Branding/Ads/Cancelled) via its own Move
// dialog. branding_ready/ads_ready are also absent — each gets its own dedicated
// "Mark as Posted"/"Ads Completed" button instead of the generic advance.
const NEXT_STATUS: Partial<Record<ContentStatus, ContentStatus>> = {
  scripting: "voiceover",
  voiceover: "ready_to_edit",
  design: "edited",
  ready_to_edit: "edited",
  edited: "on_review",
}

const PLATFORM_CFG: Record<Platform, { label: string; color: string; icon: typeof Camera }> = {
  instagram:  { label: "Instagram",  color: "#E1306C", icon: Camera },
  youtube:    { label: "YouTube",    color: "#DE1A1A", icon: PlaySquare },
  facebook:   { label: "Facebook",   color: "#1877F2", icon: ThumbsUp },
  linkedin:   { label: "LinkedIn",   color: "#0A66C2", icon: Building2 },
  gmb:        { label: "GMB",        color: "#1E8E3E", icon: Store },
  twitter:    { label: "Twitter/X",  color: "#000000", icon: AtSign },
  ads:        { label: "Ads",        color: "#D97706", icon: Megaphone },
  meta_ads:   { label: "Meta Ads",   color: "#0866FF", icon: Target },
  google_ads: { label: "Google Ads", color: "#EA4335", icon: Target },
  other:      { label: "Other",      color: "#6B7280", icon: MoreVertical },
}

const SHOOT_TYPE_CFG: Record<ShootType, { label: string; color: string }> = {
  ads_shoot:      { label: "Ads Shoot",      color: "#D97706" },
  branding_shoot: { label: "Branding Shoot", color: "#0D9488" },
}

const SHOOT_TAG_CFG: Record<ShootTag, { label: string; color: string }> = {
  branding:      { label: "Branding",      color: "#3B82F6" },
  advertisement: { label: "Advertisement", color: "#D97706" },
  promotion:     { label: "Promotion",     color: "#8B5CF6" },
}

const USE_FOR_CFG: Record<UseFor, { label: string; color: string; icon: typeof Camera }> = PLATFORM_CFG

// Mirrors ADS_PLATFORMS in lib/actions/media-tracker.ts — used only for optimistic
// local state right after a backfill create; the server always recomputes the real value.
const ADS_PLATFORM_SET = new Set<Platform>(["ads", "meta_ads", "google_ads"])

// "Ads" as a standalone platform choice is redundant now that Meta Ads/Google Ads exist —
// kept in PLATFORM_CFG (and ADS_PLATFORM_SET) only so any already-logged "ads" posts still
// render correctly; every picker offers this list instead of the full PLATFORM_CFG so it's
// no longer offered going forward.
const SELECTABLE_PLATFORMS: Platform[] = (Object.keys(PLATFORM_CFG) as Platform[]).filter(p => p !== "ads")

// Which side "owns" a dual-posted item for reporting purposes — a video posted both
// organically and to Ads still has exactly one true origin. An Ads Video script's origin
// is Ads even if also posted to Branding; anything else (a regular shoot or poster)
// originates as Branding even if also pushed to Ads via "Also post to Ads/Branding".
function primaryPostedKind(postedBranding: boolean, postedAds: boolean, source: ContentSource): "branding" | "ads" | null {
  if (!postedBranding && !postedAds) return null
  return postedAds && (!postedBranding || source === "ads_video") ? "ads" : "branding"
}

// Per-client Posted / Unposted (edited, awaiting THIS kind's post) / Unedited breakdown for
// one kind — powers the Overview "Per-Client KPIs" tables. Combines video + poster by default
// (Overview is a bird's-eye view, not scoped to one content type) — pass contentType to scope
// it, as the Waiting to Post stats box does, so its numbers match the queue right next to it.
// primaryOnly credits a dual-posted item to its origin only (Overview's business-analytics
// tables) instead of both sides (the per-client stats box on the Branding/Ads log tabs,
// where a reused item should still show up under whichever tab you're viewing).
function buildClientKPIs(items: ContentItem[], kind: "branding" | "ads", monthFilter: string, contentType?: "video" | "poster", primaryOnly = false) {
  const isDone = (i: ContentItem) => primaryOnly
    ? primaryPostedKind(i.posted_branding, i.posted_ads, i.source) === kind
    : kind === "branding" ? i.posted_branding : i.posted_ads
  // On Review hasn't branched yet, so an item sitting there isn't known to be Branding or
  // Ads — it only counts as "unposted" for THIS kind once it's actually reached this kind's
  // own Ready lane. The other kind's Ready lane (or a posted-via-the-other-side item) means
  // it was never headed here at all, so it's excluded rather than double-counted.
  const readyStatus = kind === "branding" ? "branding_ready" : "ads_ready"
  const inMonth = (d: string | null) => monthFilter === "all" || (!!d && d.slice(0, 7) === monthFilter)
  const map = new Map<string, { posted: number; unposted: number; unedited: number }>()
  for (const item of items) {
    if (item.status === "cancelled") continue
    if (contentType && item.content_type !== contentType) continue
    if (!map.has(item.client_name)) map.set(item.client_name, { posted: 0, unposted: 0, unedited: 0 })
    const rec = map.get(item.client_name)!
    if (isDone(item)) {
      const relevant = item.posts.filter(p => kind === "ads" ? ADS_PLATFORM_SET.has(p.platform) : !ADS_PLATFORM_SET.has(p.platform))
      if (monthFilter === "all" || relevant.some(p => p.posted_date.slice(0, 7) === monthFilter)) {
        rec.posted++
      }
    } else if (item.status === readyStatus) {
      if (inMonth(item.edited_date)) rec.unposted++
    } else if (item.status === "scripting" || item.status === "voiceover" || item.status === "design" || item.status === "ready_to_edit") {
      if (inMonth(item.shot_date)) rec.unedited++
    }
  }
  return Array.from(map.entries())
    .map(([client, v]) => ({ client, ...v, total: v.posted + v.unposted + v.unedited }))
    .filter(r => r.total > 0)
    .sort((a, b) => b.total - a.total)
}

// A single, non-duplicated count for Overview, matching primaryOnly attribution in
// buildClientKPIs above — every posted item counts exactly once, credited to its origin.
function countUniquePosted(items: ContentItem[], monthFilter: string, contentType: "video" | "poster") {
  const inMonth = (kind: "branding" | "ads") => (item: ContentItem) => {
    if (monthFilter === "all") return true
    const relevant = item.posts.filter(p => kind === "ads" ? ADS_PLATFORM_SET.has(p.platform) : !ADS_PLATFORM_SET.has(p.platform))
    return relevant.some(p => p.posted_date.slice(0, 7) === monthFilter)
  }
  let ads = 0, branding = 0
  for (const item of items) {
    if (item.status === "cancelled") continue
    if (item.content_type !== contentType) continue
    const postedAds = item.posted_ads && inMonth("ads")(item)
    const postedBranding = item.posted_branding && inMonth("branding")(item)
    const primary = primaryPostedKind(postedBranding, postedAds, item.source)
    if (primary === "ads") ads++
    else if (primary === "branding") branding++
  }
  return { ads, branding, total: ads + branding }
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
  completed: { label: "Completed", color: "#22C55E" },
  cancelled: { label: "Cancelled", color: "#EF4444" },
}
const SHOOT_STATUS_ORDER: ShootStatus[] = ["scheduled", "completed", "cancelled"]
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
// Team-member names render in caps everywhere in this feature — display-only, never
// mutates the stored name.
function upper(name?: string | null) {
  return name ? name.toUpperCase() : ""
}
// HH:MM in IST, for pre-filling a <input type="time"> from a stored timestamptz.
function toISTTimeString(iso?: string | null): string {
  if (!iso) return ""
  return new Date(iso).toLocaleTimeString("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: false })
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
          <h3 style={{ fontSize: 13, fontWeight: 800, color: "#111827", margin: 0, textTransform: "uppercase", letterSpacing: "0.03em" }}>{title}</h3>
          <button onClick={onClose} style={{ padding: 6, borderRadius: 8, background: "#F9FAFB", border: "none", cursor: "pointer" }}>
            <X size={14} style={{ color: "#6B7280" }} />
          </button>
        </div>
        <div style={{ padding: 20 }}>{children}</div>
      </div>
    </div>
  )
}

// Centered in-app success confirmation — NOT a browser alert/toast. Sits above the
// modal it's called from (higher z-index), auto-dismisses on its own after a beat, or
// dismiss immediately by clicking anywhere.
function SuccessFlash({ message, onDone }: { message: string; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 1400)
    return () => clearTimeout(t)
  }, [onDone])
  return (
    <div onClick={onDone} style={{
      position: "fixed", inset: 0, zIndex: 400, background: "rgba(10,10,15,0.45)", backdropFilter: "blur(4px)",
      display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
    }}>
      <div style={{
        background: "#fff", borderRadius: 20, padding: "28px 36px", textAlign: "center", minWidth: 220,
        boxShadow: "0 30px 80px rgba(0,0,0,0.3), 0 4px 16px rgba(0,0,0,0.12)",
      }}>
        <div style={{
          width: 50, height: 50, borderRadius: 15, margin: "0 auto 12px",
          background: "linear-gradient(145deg,#22C55E,#15803D)", display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "0 10px 24px rgba(34,197,94,0.35)",
        }}>
          <Check size={26} color="#fff" strokeWidth={3} />
        </div>
        <p style={{ margin: 0, fontSize: 14, fontWeight: 800, color: "#111827" }}>{message}</p>
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
type TrackerMode = "overview" | "video" | "poster" | "schedule" | "ads"
const MODE_ACCENT: Record<TrackerMode, { solid: string; grad: string; glow: string; soft: string }> = {
  overview: { solid: "#0EA5E9", grad: "linear-gradient(135deg,#38BDF8,#0EA5E9)", glow: "rgba(14,165,233,0.45)", soft: "rgba(14,165,233,0.10)" },
  video: { solid: "#DE1A1A", grad: "linear-gradient(135deg,#FF4D4D,#DE1A1A)", glow: "rgba(222,26,26,0.45)", soft: "rgba(222,26,26,0.10)" },
  poster: { solid: "#7C3AED", grad: "linear-gradient(135deg,#A78BFA,#7C3AED)", glow: "rgba(124,58,237,0.45)", soft: "rgba(124,58,237,0.10)" },
  schedule: { solid: "#0D9488", grad: "linear-gradient(135deg,#2DD4BF,#0D9488)", glow: "rgba(13,148,136,0.45)", soft: "rgba(13,148,136,0.10)" },
  ads: { solid: "#D97706", grad: "linear-gradient(135deg,#FBBF24,#D97706)", glow: "rgba(217,119,6,0.45)", soft: "rgba(217,119,6,0.10)" },
}

// Overview screen — full-saturation tile gradients, the same two-stop
// bright-to-dark treatment the Expenses hero/stat cards already use. Reusing
// that language (rather than inventing a new one) keeps Overview feeling
// like part of the same product instead of a one-off skin.
const OVERVIEW_TILE_GRADIENTS = {
  brandingWaiting: "linear-gradient(135deg,#0EA5E9,#075985)",
  adsWaiting: "linear-gradient(135deg,#D97706,#92400E)",
  video: "linear-gradient(135deg,#DE1A1A,#8B1212)",
  poster: "linear-gradient(135deg,#7C3AED,#5B21B6)",
  shoots: "linear-gradient(135deg,#3B82F6,#1D4ED8)",
  ads: "linear-gradient(135deg,#D97706,#92400E)",
}

// "Ads" (the Active/Testing/Paused/Stopped campaign board) is deliberately left out of
// this list — it's moving to its own dedicated sidebar item in future work. The mode,
// its accent, and its render block all stay intact below; this is the only line that
// makes it unreachable from the nav.
const NAV_MODES: { key: TrackerMode; label: string; icon: typeof Layers }[] = [
  { key: "overview", label: "Overview", icon: LayoutDashboard },
  { key: "video", label: "Video", icon: Video },
  { key: "poster", label: "Poster", icon: ImageIcon },
  { key: "schedule", label: "Schedule", icon: CalendarDays },
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
              className="flex-1 md:flex-none min-w-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
              style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                padding: "9px clamp(6px,2.4vw,20px)", borderRadius: 12, border: "none", cursor: "pointer",
                background: on ? a.grad : "transparent",
                boxShadow: on ? `0 6px 18px ${a.glow}` : "none",
                transition: "background .18s ease, box-shadow .18s ease",
                minWidth: 0,
              }}>
              <span style={{
                display: "grid", placeItems: "center", width: 24, height: 24, borderRadius: 8, flexShrink: 0,
                background: on ? "rgba(255,255,255,0.22)" : "rgba(255,255,255,0.07)",
                color: on ? "#fff" : "#94A3B8",
              }}>
                <Icon size={13} />
              </span>
              <span style={{ fontSize: 12.5, fontWeight: 800, letterSpacing: "-0.01em", color: on ? "#fff" : "#94A3B8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{m.label}</span>
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
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5"
          style={{ gap: 10, padding: "clamp(10px,2.4vw,16px)", background: "#F8FAFC", borderTop: "1px solid #E5E7EB" }}>
          {sections.map(s => {
            const on = s.key === tab
            const Icon = s.icon
            return (
              <button key={s.key} onClick={() => onTab(s.key)} aria-current={on ? "page" : undefined}
                className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
                style={{
                  display: "flex", alignItems: "center", gap: 9, cursor: "pointer",
                  padding: "11px 14px", borderRadius: 14,
                  border: on ? "none" : "1px solid #E2E8F0",
                  background: on ? accent.grad : "linear-gradient(180deg,#FFFFFF,#F8FAFC)",
                  boxShadow: on
                    ? `0 8px 20px ${accent.glow}, inset 0 1px 0 rgba(255,255,255,0.35)`
                    : "0 1px 2px rgba(16,24,40,0.06), inset 0 1px 0 #fff",
                  transform: on ? "translateY(-1px)" : "none",
                  transition: "transform .15s ease, box-shadow .15s ease, background .15s ease",
                }}>
                <span style={{
                  display: "grid", placeItems: "center", width: 30, height: 30, borderRadius: 10, flexShrink: 0,
                  background: on ? "rgba(255,255,255,0.24)" : accent.soft,
                  color: on ? "#fff" : accent.solid,
                }}>
                  <Icon size={15} />
                </span>
                <span style={{ minWidth: 0, textAlign: "left" }}>
                  <span style={{
                    display: "block", fontSize: 11, fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase",
                    color: on ? "#fff" : "#334155", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                  }}>{s.label}</span>
                  <span style={{
                    display: "block", fontSize: 13, fontWeight: 900, fontVariantNumeric: "tabular-nums", lineHeight: 1.2,
                    color: on ? "#fff" : "#0F172A",
                  }}>{s.count}</span>
                </span>
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
  item, isDraggable, isDragging, onAdvance, onDelete, onAddPlatform, onEdit, onMove, onSchedule,
}: {
  item: ContentItem
  isDraggable?: boolean
  isDragging?: boolean
  onAdvance: (item: ContentItem, next: ContentStatus) => void
  onDelete: (id: string) => void
  onAddPlatform: (item: ContentItem, kind?: "branding" | "ads") => void
  onEdit?: (item: ContentItem) => void
  onMove: (item: ContentItem) => void
  onSchedule: (item: ContentItem) => void
}) {
  const TypeIcon = item.content_type === "video" ? Video : ImageIcon
  // The card's own column/status color, not a fixed video-vs-poster color — a card sitting
  // in the teal Ready to Edit column shouldn't carry a red border into it. Content type is
  // still legible from the icon (Video vs Image), it just no longer fights the column's hue.
  const typeAccent = STATUS_CFG[item.status].accent
  // Every "who/when" tag on the card (shot by, voiced by, edited by, ads-video source,
  // scheduled slot, corrections) shades off this same accent instead of its own unrelated
  // hue, so nothing on the card fights the card's own color.
  const typeAccentDark = darken(typeAccent, 0.7)
  const age = (item.status === "ready_to_edit" || item.status === "design" || item.status === "edited") ? daysAgo(originDate(item)) : null
  const stale = age !== null && age >= 3

  // The drag overlay renders this card with no handlers, so an empty menu is expected there
  // and the kebab is simply omitted.
  const cardMenu: CardMenuItem[] = []
  if (onEdit) cardMenu.push({ label: "Edit details", icon: Pencil, onClick: () => onEdit(item) })
  // Footage or a design that came out unusable — kept as a record instead of deleted outright.
  // Edited cards can still be cancelled too — nothing has been approved out of review yet.
  if (item.status === "ready_to_edit" || item.status === "design" || item.status === "edited") {
    cardMenu.push({ label: "Cancel", icon: XCircle, onClick: () => onAdvance(item, "cancelled"), danger: true })
  }
  // Branding/Ads Ready can also be cancelled — a client can still pull an approved
  // piece before it's actually posted.
  if (item.status === "branding_ready" || item.status === "ads_ready") {
    cardMenu.push({ label: "Cancel", icon: XCircle, onClick: () => onAdvance(item, "cancelled"), danger: true })
  }
  // Moving back/forward a stage now lives inside the Edit dialog (one common place)
  // instead of also being a separate 3-dot menu item here.
  if (onEdit) cardMenu.push({ label: "Delete", icon: Trash2, onClick: () => onDelete(item.id), danger: true })

  const next = NEXT_STATUS[item.status]

  return (
    <div className="rounded-2xl p-4 mb-2.5 group transition-all select-none"
      style={{
        background: isDragging ? "#F3F4F6" : "#fff",
        boxShadow: isDragging ? "0 8px 24px rgba(0,0,0,0.15)" : "0 2px 10px rgba(0,0,0,0.05)",
        border: stale ? "1px solid rgba(245,158,11,0.3)" : "1px solid transparent",
        borderLeft: `4px solid ${typeAccent}`,
        opacity: isDragging ? 0.5 : 1,
      }}>
      <div className="flex items-start gap-2 mb-2">
        {isDraggable && (
          <span className="flex-shrink-0 mt-0.5 opacity-30 group-hover:opacity-70 transition-opacity" title="Drag anywhere on the card to move it">
            <GripVertical size={13} style={{ color: "#6B7280" }} />
          </span>
        )}
        <div style={{ width: 22, height: 22, borderRadius: 7, background: `${typeAccent}18`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <TypeIcon size={13} style={{ color: typeAccent }} />
        </div>
        <p className="text-[14px] font-semibold leading-snug line-clamp-2 flex-1" style={{ color: "#111111" }}>{item.title}</p>
        {cardMenu.length > 0 && <CardMenu items={cardMenu} />}
      </div>

      <div className="flex flex-wrap items-center gap-1 mb-2.5">
        <span className="text-[11px] font-medium px-1.5 py-0.5 rounded-full truncate max-w-[110px]"
          style={{ background: `${typeAccent}14`, color: typeAccent }}>{item.client_name}</span>
        {item.source === "ads_video" && (
          <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: `${typeAccent}18`, color: typeAccentDark }}>
            🎙️ Ads Video
          </span>
        )}
        {stale && (
          <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-full ml-auto" style={{ background: "rgba(245,158,11,0.1)", color: "#D97706" }}>
            {age}d stuck
          </span>
        )}
      </div>

      {item.priority && (
        <div className="flex flex-wrap items-center gap-1 mb-2.5">
          <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: `${PRIORITY_CFG[item.priority].color}18`, color: PRIORITY_CFG[item.priority].color }}>
            {PRIORITY_CFG[item.priority].label}
          </span>
          {item.hook_count !== null && (
            <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: "#F3F4F6", color: "#374151" }}>
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
              <span key={p.id} className="flex items-center gap-1 text-[11px] font-bold px-1.5 py-0.5 rounded-full"
                style={{ background: `${cfg.color}18`, color: cfg.color }}>
                <Icon size={10} /> {p.platform === "other" && p.other_platform_label ? p.other_platform_label : cfg.label}
              </span>
            )
          })}
        </div>
      )}

      {(item.posted_branding || item.posted_ads) && (
        <div className="flex flex-wrap items-center gap-1 mb-2.5">
          {item.posted_branding && (
            <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: "rgba(34,197,94,0.12)", color: "#16A34A" }}>
              Branding ✓
            </span>
          )}
          {item.posted_ads && (
            <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: "rgba(217,119,6,0.12)", color: "#D97706" }}>
              Ads ✓
            </span>
          )}
        </div>
      )}

      <div className="flex items-center gap-2 mb-2">
        {item.shotByUsers && item.shotByUsers.length > 0 && (
          <div className="flex items-center -space-x-1.5">
            {item.shotByUsers.map(u => (
              <div key={u.id} className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-black flex-shrink-0" title={`Shot by ${u.name}`}
                style={{ background: typeAccentDark, color: "#fff", border: "1.5px solid #fff" }}>
                {initials(u.name)}
              </div>
            ))}
          </div>
        )}
        {item.voiceoverBy && (item.status === "voiceover" || item.status === "ready_to_edit" || item.status === "edited") && (
          <div className="flex items-center gap-1" title={`Voiced by ${item.voiceoverBy.name}`}>
            <div className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-black flex-shrink-0" style={{ background: typeAccentDark, color: "#fff" }}>
              {initials(item.voiceoverBy.name)}
            </div>
          </div>
        )}
        {/* Once it's Edited, name the editor and date outright — the point of asking "who
            edited this?" is that the rest of the team can see it without hovering. */}
        {item.editedByUser ? (
          <span className="flex items-center gap-1 text-[11px] font-bold px-1.5 py-0.5 rounded-full"
            title={`Edited by ${item.editedByUser.name}${item.edited_date ? ` on ${fmtDate(item.edited_date)}` : ""}`}
            style={{
              background: item.status === "on_review" ? `${typeAccent}18` : "#F1F5F9",
              color: item.status === "on_review" ? typeAccentDark : "#475569",
            }}>
            <span className="w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-black flex-shrink-0"
              style={{ background: typeAccentDark, color: "#fff" }}>
              {initials(item.editedByUser.name)}
            </span>
            {upper(item.editedByUser.name)}{item.edited_date ? ` · ${fmtDate(item.edited_date)}` : ""}
          </span>
        ) : null}
        {/* The written script's home — captured when Scripting is completed (Voice Over
            or Move to Shoot), so it stays openable for the rest of the item's life. */}
        {item.script_drive_link && (
          <a href={item.script_drive_link} target="_blank" rel="noopener noreferrer"
            onPointerDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()}
            title="Open script Drive link" className="flex items-center gap-1 text-[11px] font-bold px-1.5 py-0.5 rounded-full"
            style={{ background: "rgba(168,85,247,0.1)", color: "#A855F7", textDecoration: "none" }}>
            <ExternalLink size={10} /> Script
          </a>
        )}
        {/* The edit's actual home — captured once, at the Ready to Edit -> On Review move. */}
        {item.edited_drive_link && (
          <a href={item.edited_drive_link} target="_blank" rel="noopener noreferrer"
            onPointerDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()}
            title="Open Drive link" className="flex items-center gap-1 text-[11px] font-bold px-1.5 py-0.5 rounded-full"
            style={{ background: "rgba(59,130,246,0.1)", color: "#3B82F6", textDecoration: "none" }}>
            <ExternalLink size={10} /> Drive
          </a>
        )}
        {/* Who caused the cancellation — the whole point of asking at cancel time is that
            it's visible on the card afterwards without opening anything. */}
        {item.status === "cancelled" && item.cancelled_by && (
          <span className="flex items-center gap-1 text-[11px] font-bold px-1.5 py-0.5 rounded-full"
            style={{ background: "rgba(239,68,68,0.12)", color: "#EF4444" }}>
            Cancelled by {item.cancelled_by === "client" ? "Client" : "Us"}
          </span>
        )}
        {/* Once the editor badge above is showing (and carrying its own date), the shot
            date is redundant clutter — only shown pre-review, where it's the only date
            on the card at all. */}
        {!["on_review", "branding_ready", "ads_ready", "cancelled"].includes(item.status) && (
          <span className="text-[11px]" style={{ color: "#374151", fontWeight: 600 }}>{fmtDate(originDate(item))}</span>
        )}
      </div>

      {/* Correction round-trips — shows this went back N times, and what for. */}
      {item.corrections.length > 0 && (
        <div className="mb-2">
          <span className="flex items-center gap-1 text-[11px] font-bold px-1.5 py-0.5 rounded-full w-fit"
            title={item.corrections.map(c => c.notes).join(" · ")}
            style={{ background: `${typeAccent}18`, color: typeAccentDark }}>
            <RotateCcw size={10} /> {item.corrections.length} correction{item.corrections.length > 1 ? "s" : ""}
          </span>
          <p className="text-[11px] mt-1 line-clamp-2" style={{ color: "#6B7280" }}>
            {item.corrections[0].notes}
          </p>
        </div>
      )}

      {/* Whether this approved piece has been scheduled yet, and for when. "No date set" is
          the normal state right after approval — it's the prompt to use the Schedule button.
          Overdue is the reason this is on the card at all: a piece whose date has passed
          without a post logged should be obvious without opening anything. */}
      {(item.status === "branding_ready" || item.status === "ads_ready") && (() => {
        const state = scheduleBadgeState(item.scheduled_post_date, todayIST())
        const cfg = state === "overdue" ? { bg: "rgba(239,68,68,0.12)", fg: "#EF4444" }
          : state === "today" ? { bg: "rgba(245,158,11,0.14)", fg: "#B45309" }
          : state === "upcoming" ? { bg: `${typeAccent}18`, fg: typeAccentDark }
          : { bg: "#F3F4F6", fg: "#6B7280" }
        return (
          <div className="mb-2">
            <span className="flex items-center gap-1 text-[11px] font-bold px-1.5 py-0.5 rounded-full w-fit"
              style={{ background: cfg.bg, color: cfg.fg }}>
              <CalendarDays size={10} />
              {state === "none" ? "No date set"
                : state === "today" ? "Post today"
                : `${fmtDate(item.scheduled_post_date)}${state === "overdue" ? " · Overdue" : ""}`}
            </span>
          </div>
        )
      })()}

      {/* The review gate: one Move button opens the 3-way choice (Branding/Ads/Cancelled). */}
      {item.status === "on_review" ? (
        <button
          onPointerDown={e => e.stopPropagation()}
          onClick={() => onMove(item)}
          className="w-full py-1.5 rounded-xl text-[11px] font-bold transition-all hover:opacity-90 flex items-center justify-center gap-1"
          style={{ background: statusButtonGradient("on_review"), color: "#fff" }}>
          Move <ArrowRight size={11} />
        </button>
      ) : next && (
        <button
          onPointerDown={e => e.stopPropagation()}
          onClick={() => onAdvance(item, next)}
          className="w-full py-1.5 rounded-xl text-[11px] font-bold transition-all hover:opacity-90 flex items-center justify-center gap-1"
          style={{ background: statusButtonGradient(next), color: "#fff" }}>
          Move to {STATUS_CFG[next].label} <ArrowRight size={11} />
        </button>
      )}
      {/* Two separate decisions, so two buttons: "it goes out later" (move the date) and
          "it's out now" (log the post). Schedule takes the narrower share so the longer
          "Mark as Posted"/"Ads Completed" label still fits on one line on a phone. */}
      {(item.status === "branding_ready" || item.status === "ads_ready") && (
        <div className="flex gap-1">
          <button onPointerDown={e => e.stopPropagation()} onClick={() => onSchedule(item)}
            className="py-1.5 rounded-xl text-[11px] font-bold transition-all hover:opacity-80 flex items-center justify-center gap-1"
            style={{ flex: "0 0 36%", background: `${typeAccent}14`, color: typeAccentDark }}>
            <CalendarDays size={11} /> Schedule
          </button>
          <button onPointerDown={e => e.stopPropagation()} onClick={() => onAddPlatform(item, item.status === "ads_ready" ? "ads" : "branding")}
            className="flex-1 min-w-0 py-1.5 rounded-xl text-[11px] font-bold transition-all hover:opacity-90 flex items-center justify-center gap-1"
            style={{ background: statusButtonGradient(item.status), color: "#fff" }}>
            <span className="truncate">{item.status === "ads_ready" ? "Ads Completed" : "Mark as Posted"}</span>
            <ArrowRight size={11} className="flex-shrink-0" />
          </button>
        </div>
      )}
      {/* A posted video can go out on both fronts — e.g. one ad shoot's hook+body also gets
          reused as a single organic post. Both buttons stay available regardless of which
          kind it's already posted under, so either side can be added or topped up. */}
      {item.status === "posted" && (
        <div className="flex gap-1">
          <button onPointerDown={e => e.stopPropagation()} onClick={() => onAddPlatform(item, "branding")}
            className="flex-1 py-1.5 rounded-xl text-[11px] font-bold transition-all hover:opacity-80 flex items-center justify-center gap-1"
            style={{ background: "rgba(34,197,94,0.08)", color: "#16A34A" }}>
            <Plus size={11} /> {item.posted_branding ? "Branding" : "Also Branding"}
          </button>
          <button onPointerDown={e => e.stopPropagation()} onClick={() => onAddPlatform(item, "ads")}
            className="flex-1 py-1.5 rounded-xl text-[11px] font-bold transition-all hover:opacity-80 flex items-center justify-center gap-1"
            style={{ background: "rgba(217,119,6,0.08)", color: "#D97706" }}>
            <Plus size={11} /> {item.posted_ads ? "Ads" : "Also Ads"}
          </button>
        </div>
      )}

    </div>
  )
}

// ── Ads Video card — the Scripting/Voice Over board's card, distinct from
// ContentCardInner because its fields (hooks, use-for, priority) don't apply once an
// item reaches the shared Ready to Edit board (which reuses ContentCardInner).
function AdsVideoCardInner({ item, isDragging, isCompleted, onAdvance, onEdit, onDelete, onMoveToShoot, onEditVoiceOver }: {
  item: ContentItem
  isDragging?: boolean
  // Sent to a shoot, or moved on past Voice Over — this sub-flow's work is done, so the
  // card is read-only: no advance/cancel/move actions, just a Completed badge.
  isCompleted?: boolean
  onAdvance: (item: ContentItem, next: ContentStatus) => void
  onEdit: (item: ContentItem) => void
  onDelete: (id: string) => void
  onMoveToShoot: (item: ContentItem) => void
  onEditVoiceOver: (item: ContentItem) => void
}) {
  const cardMenu: CardMenuItem[] = isCompleted
    ? [
        { label: "Edit details", icon: Pencil, onClick: () => onEdit(item) },
        // The artist can change or the date can be wrong even after this moved on past
        // Voice Over — correctable from here instead of only while it was in that column.
        ...(item.voiceoverBy ? [{ label: "Edit Voice Over", icon: Pencil, onClick: () => onEditVoiceOver(item) }] : []),
        { label: "Delete", icon: Trash2, onClick: () => onDelete(item.id), danger: true },
      ]
    : [
        { label: "Edit details", icon: Pencil, onClick: () => onEdit(item) },
        ...(item.voiceoverBy ? [{ label: "Edit Voice Over", icon: Pencil, onClick: () => onEditVoiceOver(item) }] : []),
        // A script/voice-over can turn out unusable before it ever reaches a shoot or edit —
        // kept as a record instead of deleted outright, same as Ready to Edit/Design.
        { label: "Cancel", icon: XCircle, onClick: () => onAdvance(item, "cancelled"), danger: true },
        { label: "Delete", icon: Trash2, onClick: () => onDelete(item.id), danger: true },
      ]
  const next = isCompleted ? undefined : NEXT_STATUS[item.status]

  const accent = STATUS_CFG[item.status].accent
  const accentDark = darken(accent, 0.7)
  return (
    <div className="rounded-2xl p-4 mb-2.5 group transition-all select-none"
      style={{
        background: isDragging ? "#F3F4F6" : "#fff",
        boxShadow: isDragging ? "0 8px 24px rgba(0,0,0,0.15)" : "0 2px 10px rgba(0,0,0,0.05)",
        border: "1px solid transparent",
        borderLeft: `4px solid ${accent}`,
        opacity: isDragging ? 0.5 : 1,
      }}>
      <div className="flex items-start gap-2 mb-2">
        <span className="flex-shrink-0 mt-0.5 opacity-30 group-hover:opacity-70 transition-opacity" title="Drag anywhere on the card to move it">
          <GripVertical size={13} style={{ color: "#6B7280" }} />
        </span>
        <div style={{ width: 22, height: 22, borderRadius: 7, background: `${accent}18`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Video size={13} style={{ color: accent }} />
        </div>
        <p className="text-[14px] font-semibold leading-snug line-clamp-2 flex-1" style={{ color: "#111111" }}>{item.title}</p>
        <CardMenu items={cardMenu} />
      </div>

      <div className="flex flex-wrap items-center gap-1.5 mb-2">
        <span className="text-[11px] font-medium px-2 py-1 rounded-full"
          style={{ background: `${accent}14`, color: accent, lineHeight: 1 }}>{item.client_name}</span>
      </div>

      {/* Hook count and "use for" platforms are intentionally left off the card — still
          editable via Edit details, just not needed for a glance at the board. Scripted By
          (and Shoot Type alongside it) only shows at Scripting or once Completed — while a
          script's out for Voice Over, showing who scripted it too is just clutter, not the
          "who's doing this" the card needs to answer at that point. */}
      {(isCompleted || item.status === "scripting") && item.scriptedByUser && (
        <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: "#37415114", color: "#374151" }}>
            <div className="w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-black flex-shrink-0" style={{ background: "#374151", color: "#fff" }}>
              {initials(item.scriptedByUser.name)}
            </div>
            Script: {upper(item.scriptedByUser.name)}
          </span>
          {item.shoot_type && (
            <span className="text-[11px] font-bold px-2 py-1 rounded-full" style={{ background: `${SHOOT_TYPE_CFG[item.shoot_type].color}18`, color: SHOOT_TYPE_CFG[item.shoot_type].color, lineHeight: 1 }}>
              {SHOOT_TYPE_CFG[item.shoot_type].label}
            </span>
          )}
        </div>
      )}
      {item.voiceoverBy && (
        <div className="flex items-center gap-1.5 mb-3 flex-wrap">
          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: `${accent}18`, color: accentDark }}>
            <div className="w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-black flex-shrink-0" style={{ background: accentDark, color: "#fff" }}>
              {initials(item.voiceoverBy.name)}
            </div>
            VO: {upper(item.voiceoverBy.name)}
          </span>
        </div>
      )}

      {isCompleted && (
        <div className="w-full py-2 rounded-xl text-[12px] font-bold flex items-center justify-center gap-1.5"
          style={{ background: `${ADS_VIDEO_COMPLETED_CFG.accent}14`, color: ADS_VIDEO_COMPLETED_CFG.accent, marginTop: item.voiceoverBy || item.scriptedByUser ? 0 : 4 }}>
          <Check size={11} /> Completed
        </div>
      )}
      {!isCompleted && next && (
        <button
          onPointerDown={e => e.stopPropagation()}
          onClick={() => onAdvance(item, next)}
          className="w-full py-2 rounded-xl text-[12px] font-bold transition-all hover:opacity-90 flex items-center justify-center gap-1.5"
          style={{ background: statusButtonGradient(next), color: "#fff", marginTop: item.voiceoverBy ? 0 : 4 }}>
          {item.status === "voiceover" ? <>Send to Ready to Edit <ArrowRight size={11} /></> : <>Move to {STATUS_CFG[next].label} <ArrowRight size={11} /></>}
        </button>
      )}
      {!isCompleted && item.status === "scripting" && (
        <button
          onPointerDown={e => e.stopPropagation()}
          onClick={() => onMoveToShoot(item)}
          className="w-full py-2 rounded-xl text-[12px] font-bold transition-all hover:opacity-90 flex items-center justify-center gap-1.5"
          style={{ background: "#fff", color: "#374151", border: "1.5px solid #E5E7EB", marginTop: 6 }}>
          <Camera size={11} /> Move to Shoot
        </button>
      )}
    </div>
  )
}

function DraggableCard(props: { item: ContentItem; isDragging: boolean; onAdvance: (item: ContentItem, next: ContentStatus) => void; onDelete: (id: string) => void; onAddPlatform: (item: ContentItem, kind?: "branding" | "ads") => void; onEdit: (item: ContentItem) => void; onMove: (item: ContentItem) => void; onSchedule: (item: ContentItem) => void }) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({ id: props.item.id, data: { status: props.item.status } })
  const style = transform ? { transform: `translate3d(${transform.x}px,${transform.y}px,0)` } : undefined
  return (
    // Drag handle is the whole card, not just the grip icon — a plain click still
    // reaches the buttons underneath because dnd-kit's activation distance (6px)
    // means "click with no movement" never starts a drag in the first place.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    <div ref={setNodeRef} style={{ ...style, touchAction: "none" }} {...(listeners as any)} {...(attributes as any)} className="cursor-grab active:cursor-grabbing">
      <ContentCardInner item={props.item} isDraggable isDragging={props.isDragging}
        onAdvance={props.onAdvance} onDelete={props.onDelete} onAddPlatform={props.onAddPlatform} onEdit={props.onEdit} onMove={props.onMove} onSchedule={props.onSchedule} />
    </div>
  )
}

function DroppableColumn({ status, isOver, children }: { status: ContentStatus; isOver: boolean; children: React.ReactNode }) {
  const { setNodeRef } = useDroppable({ id: status })
  const accent = STATUS_CFG[status].accent
  return (
    // Capped height + hidden overflow here (the scrollable body lives inside, in the
    // "p-3 flex-1 overflow-y-auto" div each caller renders) — otherwise a column with 100+
    // cards stretches the whole row to match via CSS Grid's default row-stretch, dragging
    // every other column's background down with it and pushing the horizontal scrollbar
    // for the row way down the page instead of staying near the filters.
    <div ref={setNodeRef} className="rounded-2xl transition-all flex flex-col"
      style={{
        border: isOver ? `2px solid ${accent}` : "1px solid #E8E9EF",
        background: isOver
          ? `linear-gradient(165deg, ${accent} 0%, ${darken(accent, 0.4)} 100%)`
          : `linear-gradient(165deg, ${accent} 0%, ${darken(accent, 0.55)} 100%)`,
        minHeight: 200,
        maxHeight: "min(70vh, 720px)",
        overflow: "hidden",
        scrollSnapAlign: "start",
      }}>
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
      style={{
        border: isOver ? `2px solid ${accent}` : "1px solid #E8E9EF",
        background: isOver
          ? `linear-gradient(165deg, ${accent} 0%, ${darken(accent, 0.4)} 100%)`
          : `linear-gradient(165deg, ${accent} 0%, ${darken(accent, 0.55)} 100%)`,
        minHeight: 200,
        maxHeight: "min(70vh, 720px)",
        overflow: "hidden",
      }}>
      {children}
    </div>
  )
}

function KanbanColumnHeader({ label, count, accent }: { label: string; count: number; accent: string }) {
  return (
    <div className="flex items-center justify-between px-4 py-3 rounded-t-2xl" style={{ background: "#FFFFFF", borderBottom: "1px solid #E8E9EF" }}>
      <div className="flex items-center gap-2">
        <span className="text-[13px] font-black" style={{ color: "#111111" }}>{label}</span>
        <span className="w-5 h-5 rounded-full text-[9px] font-black flex items-center justify-center" style={{ background: darken(accent, 0.8), color: "#fff" }}>{count}</span>
      </div>
    </div>
  )
}

// ── Shared date filters — every board gets the same month + day controls ──────
// MonthSelect + FILTER_FIELD live in ./month-select so the Overview dashboard shares
// the identical control (importing them from here would be a cycle).

function DayFilter({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-1"
      style={{
        background: value ? "#F3F4F6" : "#fff",
        border: `1.5px solid ${value ? "#9CA3AF" : "#E5E7EB"}`, borderRadius: 10, padding: "0 6px",
      }}>
      <CalendarDays size={13} style={{ color: "#6B7280", flexShrink: 0 }} />
      <input type="date" value={value} onChange={e => onChange(e.target.value)} aria-label="Filter by day"
        style={{ border: "none", outline: "none", background: "transparent", fontSize: 12, fontWeight: 700, color: "#374151", fontFamily: "inherit", cursor: "pointer", padding: "7px 2px", colorScheme: "light" }} />
      {value && (
        <button onClick={() => onChange("")} title="Clear day"
          style={{ padding: "2px 6px", borderRadius: 6, border: "none", background: "rgba(107,114,128,0.15)", color: "#374151", fontSize: 11, fontWeight: 800, cursor: "pointer", lineHeight: 1 }}>
          ✕
        </button>
      )}
    </div>
  )
}

// ── Per-client stats box — sits beside Waiting to Post once a single client is picked ──
export type ClientStatsShape = {
  target: number
  // The month the target above applies to — always resolved (falls back to the current
  // month when the Log tab's own month filter is "All Time"), so target editing works
  // no matter which month filter is selected.
  targetMonth: string
  posted: number
  unposted: number
  edited: number
  unedited: number
  remaining: number
  completionPct: number | null
  // Independent of Branding/Ads (logKind) — same count shows on both tabs since the
  // Promotion flag isn't tied to which side it posted to.
  promotion: number
}

function ClientStatsBox({ client, stats, contentType = "video" }: {
  client: string
  stats: ClientStatsShape
  contentType?: "video" | "poster"
}) {
  const isPoster = contentType === "poster"

  function StatRow({ label, value, color }: { label: string; value: string | number; color: string }) {
    return (
      <div className="flex items-center justify-between" style={{ fontSize: 12 }}>
        <span style={{ color: "#6B7280", fontWeight: 600 }}>{label}</span>
        <span style={{ color, fontWeight: 800, fontSize: 12 }}>{value}</span>
      </div>
    )
  }

  function SectionLabel({ children }: { children: React.ReactNode }) {
    return <p className="text-[9px] font-black uppercase" style={{ color: "#9CA3AF", letterSpacing: "0.06em", margin: "4px 0 0" }}>{children}</p>
  }

  return (
    <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 18, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
      <p className="text-[10px] font-black uppercase truncate" style={{ color: "#6B7280", letterSpacing: "0.06em", margin: 0 }} title={client}>
        {client}
      </p>

      <SectionLabel>Monthly Goal</SectionLabel>
      {/* Read-only here — Target is only editable from the Overview tab's Per-Client
          KPIs table, so there's exactly one place admins go to change it. */}
      <StatRow label={`Monthly Target (${fmtMonth(stats.targetMonth)})`} value={stats.target} color="#7C3AED" />
      <StatRow label="Published" value={stats.posted} color="#16A34A" />
      <StatRow label="Remaining" value={stats.remaining} color="#D97706" />
      <StatRow label="Completion %" value={stats.completionPct !== null ? `${stats.completionPct}%` : "—"} color="#0EA5E9" />

      <SectionLabel>Production Status</SectionLabel>
      <StatRow label={isPoster ? "Undesigned" : "Unedited"} value={stats.unedited} color="#F97316" />
      <StatRow label={isPoster ? "Designs Completed" : "Editing"} value={stats.edited} color="#0EA5E9" />
      <StatRow label="Ready to Publish" value={stats.unposted} color="#D97706" />

      <SectionLabel>Publishing Status</SectionLabel>
      <StatRow label="Scheduled" value={stats.unposted} color="#D97706" />
      <StatRow label="Published" value={stats.posted} color="#16A34A" />
      <StatRow label="Promotion" value={stats.promotion} color="#DB2777" />
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
// Full-saturation gradient tiles — the corner-blob + translucent-badge language
// borrowed wholesale from the Expenses hero/stat cards, so the two dashboards
// read as the same product rather than two different design eras.
function TileBlobs() {
  return (
    <>
      <div aria-hidden style={{ position: "absolute", top: -34, right: -26, width: 120, height: 120, borderRadius: "50%", background: "rgba(255,255,255,0.08)", pointerEvents: "none" }} />
      <div aria-hidden style={{ position: "absolute", bottom: -30, left: -18, width: 90, height: 90, borderRadius: "50%", background: "rgba(255,255,255,0.06)", pointerEvents: "none" }} />
    </>
  )
}

function OverviewStat({ label, value, gradient, icon: Icon, onClick }: {
  label: string; value: number; gradient: string; icon: typeof Layers; onClick: () => void
}) {
  return (
    <button onClick={onClick}
      className="text-left transition-transform hover:-translate-y-0.5"
      style={{ background: gradient, border: "none", borderRadius: 16, padding: "16px 18px", cursor: "pointer", position: "relative", overflow: "hidden", boxShadow: "0 10px 24px rgba(0,0,0,0.16)" }}>
      <TileBlobs />
      <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "rgba(255,255,255,0.18)", color: "#fff", position: "relative" }}>
        <Icon size={15} />
      </div>
      <p style={{ position: "relative", fontSize: 30, fontWeight: 900, color: "#fff", margin: "10px 0 0", letterSpacing: "-0.02em", fontFamily: "var(--font-jakarta)", fontVariantNumeric: "tabular-nums" }}>{value}</p>
      <p style={{ position: "relative", fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.78)", textTransform: "uppercase", letterSpacing: "0.06em", margin: "3px 0 0" }}>{label}</p>
    </button>
  )
}

function OverviewBlock({ title, gradient, icon: Icon, rows }: {
  title: string
  gradient: string
  icon: typeof Layers
  rows: { key: string; label: string; value: number; onClick: () => void }[]
}) {
  const total = rows.reduce((sum, r) => sum + r.value, 0)
  return (
    <div style={{ background: gradient, borderRadius: 18, overflow: "hidden", position: "relative", boxShadow: "0 10px 28px rgba(0,0,0,0.18)" }}>
      <TileBlobs />
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", position: "relative", background: "rgba(0,0,0,0.18)", borderBottom: "1px solid rgba(255,255,255,0.12)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: "rgba(255,255,255,0.18)", color: "#fff" }}>
            <Icon size={13} />
          </div>
          <span style={{ fontSize: 10.5, fontWeight: 800, color: "#fff", textTransform: "uppercase", letterSpacing: "0.07em" }}>{title}</span>
        </div>
        <span style={{ fontSize: 11, fontWeight: 800, color: "#fff", fontVariantNumeric: "tabular-nums", background: "rgba(255,255,255,0.18)", padding: "3px 10px", borderRadius: 999 }}>{total}</span>
      </div>
      <div className="flex flex-col" style={{ position: "relative" }}>
        {rows.map(r => (
          <button key={r.key} onClick={r.onClick}
            className="flex items-center justify-between"
            style={{ padding: "9px 16px", border: "none", background: "transparent", cursor: "pointer" }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.88)" }}>{r.label}</span>
            <span style={{ fontSize: 13, fontWeight: 800, color: r.value > 0 ? "#fff" : "rgba(255,255,255,0.4)", fontVariantNumeric: "tabular-nums" }}>
              {r.value}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

// Frosted-glass stat card for the hero's rightSlot — same treatment the old Content
// Calendar used for its date/total/uploaded trio next to the character illustration.
function HeroGlassStat({ label, value, sub }: { label: string; value: number | string; sub: string }) {
  return (
    <div style={{ background: "rgba(255,255,255,0.1)", backdropFilter: "blur(12px)", borderRadius: 14, padding: "clamp(8px,2vw,12px) clamp(10px,2.5vw,16px)", textAlign: "center", border: "1px solid rgba(255,255,255,0.15)", minWidth: 72, flexShrink: 0 }}>
      <p style={{ fontSize: 9, fontWeight: 800, color: "rgba(255,255,255,0.6)", margin: "0 0 2px", letterSpacing: "0.06em" }}>{label}</p>
      <p style={{ fontSize: "clamp(22px,5.5vw,30px)", fontWeight: 900, color: "#FFFFFF", margin: "0 0 2px", lineHeight: 1 }}>{value}</p>
      <p style={{ fontSize: 10, color: "rgba(255,255,255,0.6)", margin: 0, fontWeight: 600 }}>{sub}</p>
    </div>
  )
}

function KanbanEmptyCell({ isOver }: { isOver: boolean }) {
  return (
    <div className="flex items-center justify-center py-8 rounded-xl transition-all" style={{ border: `2px dashed ${isOver ? "#fff" : "rgba(255,255,255,0.45)"}` }}>
      <p className="text-[11px] font-semibold" style={{ color: isOver ? "#fff" : "rgba(255,255,255,0.75)" }}>{isOver ? "Drop here" : "Empty"}</p>
    </div>
  )
}

// A shoot can produce a lot of videos. Wrapping 8 of them as pills turns the card into
// unreadable soup in a narrow kanban column, so: a count, then a scannable list capped at
// three, with the rest a click away. Dots rather than numbers — the videos aren't a
// sequence, and numbering would imply an order that doesn't exist.
function ShootTitleList({ titles, accent }: { titles: ShootTitleRef[]; accent: string }) {
  const [expanded, setExpanded] = useState(false)
  const COLLAPSED = 3
  const shown = expanded ? titles : titles.slice(0, COLLAPSED)
  const hidden = titles.length - shown.length
  const accentDark = darken(accent, 0.7)

  return (
    <div style={{ marginTop: 8 }}>
      <span className="inline-flex items-center gap-1.5 text-[12px] font-bold px-2 py-1 rounded-lg"
        style={{ background: `${accent}18`, color: accentDark }}>
        <Video size={11} /> {titles.length} video{titles.length === 1 ? "" : "s"}
      </span>

      <div className="flex flex-col" style={{ marginTop: 6 }}>
        {shown.map(t => (
          <div key={t.id} className="flex items-center gap-2"
            style={{ padding: "5px 0", borderBottom: "1px solid #F3F4F6" }}>
            <span style={{ width: 4, height: 4, borderRadius: "50%", background: accentDark, flexShrink: 0 }} />
            <span className="text-[13px] truncate" style={{ color: "#374151" }}>{t.title}</span>
          </div>
        ))}
      </div>

      {titles.length > COLLAPSED && (
        <button onPointerDown={e => e.stopPropagation()} onClick={() => setExpanded(v => !v)}
          className="text-[12px] font-bold"
          style={{ marginTop: 6, background: "none", border: "none", padding: 0, cursor: "pointer", color: expanded ? "#9CA3AF" : accentDark }}>
          {expanded ? "Show less" : `+ ${hidden} more`}
        </button>
      )}
    </div>
  )
}

// ── Shoot kanban card ────────────────────────────────────────────────────────
function ShootCardInner({ shoot, isDragging, onStatus, onEdit, onDelete }: {
  shoot: Shoot; isDragging?: boolean
  onStatus: (id: string, status: ShootStatus) => void
  onEdit?: (shoot: Shoot) => void
  onDelete?: (shoot: Shoot) => void
}) {
  const menu: CardMenuItem[] = []
  if (onEdit) menu.push({ label: shoot.status === "completed" ? "Edit shoot" : "Edit Details", icon: Pencil, onClick: () => onEdit(shoot) })
  if (onDelete) menu.push({ label: "Delete", icon: Trash2, onClick: () => onDelete(shoot), danger: true })

  // Every colored element on this card is a shade of the shoot's own status color —
  // a Completed (green) card shouldn't have blue crew badges fighting its own theme.
  const accent = SHOOT_STATUS_CFG[shoot.status].color
  const accentDark = darken(accent, 0.7)

  // The shoot's slot was previously only visible after opening the edit modal — but "when"
  // is the first thing anyone scanning the board wants, so it belongs on the card face.
  const fromLabel = fmtTime(toISTTimeString(shoot.start_time))
  const toLabel = fmtTime(toISTTimeString(shoot.end_time))
  const timeLabel = fromLabel ? (toLabel ? `${fromLabel} – ${toLabel}` : fromLabel) : ""

  return (
    <div className="rounded-2xl p-4 mb-2.5 select-none"
      style={{
        background: isDragging ? "#F3F4F6" : "#fff",
        boxShadow: isDragging ? "0 8px 24px rgba(0,0,0,0.15)" : "0 2px 10px rgba(0,0,0,0.05)",
        border: "1px solid transparent",
        borderLeft: `4px solid ${accent}`,
        opacity: isDragging ? 0.5 : 1,
      }}>
      <div className="flex items-start justify-between gap-2">
        <div style={{ minWidth: 0 }}>
          <p className="text-[14px] font-bold leading-snug" style={{ color: "#111827", margin: 0 }}>{shoot.legacyTitle}</p>
          <p className="text-[12px]" style={{ color: "#6B7280", margin: "2px 0 0" }}>
            {shoot.client} · {fmtDate(shoot.start_time.split("T")[0])}
          </p>
          {timeLabel && (
            <span className="inline-flex items-center gap-1 text-[11px] font-bold px-1.5 py-0.5 rounded-md"
              style={{ marginTop: 4, background: `${accent}14`, color: accentDark, fontVariantNumeric: "tabular-nums" }}>
              <Clock size={10} style={{ flexShrink: 0 }} /> {timeLabel}
            </span>
          )}
          {shoot.tags.length > 0 && (
            <div className="flex flex-wrap gap-1" style={{ marginTop: 4 }}>
              {shoot.tags.map(tag => (
                <span key={tag} className="text-[10px] font-black px-2 py-0.5 rounded-full uppercase"
                  style={{ background: `${SHOOT_TAG_CFG[tag].color}18`, color: SHOOT_TAG_CFG[tag].color }}>
                  {SHOOT_TAG_CFG[tag].label}
                </span>
              ))}
            </div>
          )}
        </div>
        {menu.length > 0 && <CardMenu items={menu} />}
      </div>

      {/* Video titles only exist once the shoot is marked Done — that's when they're captured. */}
      {shoot.titles.length > 0 && <ShootTitleList titles={shoot.titles} accent={accent} />}

      {/* Where the footage actually lives — captured once, at Mark Done. */}
      {shoot.drive_link && (
        <a href={shoot.drive_link} target="_blank" rel="noopener noreferrer"
          onPointerDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()}
          title="Open Drive link" className="inline-flex items-center gap-1 text-[11px] font-bold px-1.5 py-0.5 rounded-full"
          style={{ marginTop: 8, background: "rgba(59,130,246,0.1)", color: "#3B82F6", textDecoration: "none" }}>
          <ExternalLink size={10} /> Drive
        </a>
      )}

      {/* Who covered the shoot. Always shown — an empty crew is itself worth seeing, and it's
          editable at any point so older shoots with nobody recorded can be filled in. */}
      {onEdit && (
        <div style={{ marginTop: 8 }}>
          <span className="text-[11px] font-bold uppercase tracking-[0.06em]" style={{ color: "#9CA3AF" }}>Who went</span>
          {shoot.goingByUsers.length === 0 ? (
            <button onPointerDown={e => e.stopPropagation()} onClick={() => onEdit(shoot)}
              className="block text-[12px] font-bold"
              style={{ marginTop: 3, background: "none", border: "none", padding: 0, cursor: "pointer", color: accentDark }}>
              + Add crew
            </button>
          ) : (
            <div className="flex flex-wrap items-center gap-1" style={{ marginTop: 3 }}>
              {shoot.goingByUsers.map(u => (
                <span key={u.id} className="flex items-center gap-1 text-[11px] font-bold px-1.5 py-0.5 rounded-full"
                  title={u.name}
                  style={{ background: `${accent}18`, color: accentDark }}>
                  <span className="w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-black"
                    style={{ background: accentDark, color: "#fff" }}>
                    {initials(u.name)}
                  </span>
                  {upper(u.name)}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {shoot.notes && <p className="text-[12px]" style={{ color: "#6B7280", margin: "6px 0 0" }}>{shoot.notes}</p>}

      {shoot.status === "scheduled" && (
        <div className="flex flex-wrap gap-1.5" style={{ marginTop: 10 }}>
          <button onPointerDown={e => e.stopPropagation()} onClick={() => onStatus(shoot.id, "completed")}
            className="text-[11px] font-bold px-2.5 py-1 rounded-lg hover:opacity-90"
            style={{ border: "none", background: "#15803D", color: "#fff", cursor: "pointer" }}>
            Shoot Done
          </button>
          <button onPointerDown={e => e.stopPropagation()} onClick={() => onStatus(shoot.id, "cancelled")}
            className="text-[11px] font-bold px-2.5 py-1 rounded-lg hover:opacity-90"
            style={{ border: "none", background: "#B91C1C", color: "#fff", cursor: "pointer" }}>
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

  const accent = AD_STATUS_CFG[ad.status].color
  const accentDark = darken(accent, 0.7)
  const stripeColor = underperforming ? "#EF4444" : accent
  return (
    <div className="rounded-2xl mb-2.5 select-none" style={{
      background: isDragging ? "#F3F4F6" : "#fff",
      border: `1px solid ${underperforming ? "#FCA5A5" : "transparent"}`,
      borderLeft: `4px solid ${stripeColor}`,
      boxShadow: isDragging ? "0 8px 24px rgba(0,0,0,0.15)" : "0 2px 10px rgba(0,0,0,0.05)",
      opacity: isDragging ? 0.5 : 1,
      // Not `hidden` — the kebab's dropdown escapes the card bounds and would be clipped.
      overflow: "visible",
    }}>
      <div className="p-3.5 cursor-pointer" onClick={() => onToggleExpand(ad.id)}>
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div style={{ width: 22, height: 22, borderRadius: 7, background: `${accent}18`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Megaphone size={12} style={{ color: accent }} />
            </div>
            <p className="text-[12px] font-bold leading-snug truncate" style={{ color: "#111827", margin: 0 }}>{ad.ad_name}</p>
          </div>
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
            style={{ background: `${accent}18`, color: accentDark }}>
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
            <span className="text-[10px] font-bold uppercase tracking-[0.06em]" style={{ color: accentDark }}>Performance</span>
            <button onClick={() => onLogPerformance(ad)}
              className="flex items-center gap-1 text-[9px] font-bold px-2 py-1 rounded-lg"
              style={{ border: "none", background: `${accent}14`, color: accentDark, cursor: "pointer" }}>
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
            <span className="text-[10px] font-bold uppercase tracking-[0.06em]" style={{ color: accentDark }}>Correction History</span>
            <button onClick={() => onLogCorrection(ad)}
              className="flex items-center gap-1 text-[9px] font-bold px-2 py-1 rounded-lg"
              style={{ border: "none", background: `${accent}14`, color: accentDark, cursor: "pointer" }}>
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
                      {rev.hook_count_after !== null && <span className="text-[9px] font-bold" style={{ color: accentDark }}>{rev.hook_count_after} hooks</span>}
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
function NewContentModal({ clients, pastClients, members, defaultContentType = "video", onClose, onCreated }: {
  defaultContentType?: "video" | "poster"
  clients: { id: string; name: string }[]; pastClients: { id: string; name: string }[]
  members: Member[]
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
  const [shotDate, setShotDate] = useState(todayIST())
  const [notes, setNotes] = useState("")
  const [alreadyPosted, setAlreadyPosted] = useState(false)
  const [postedPlatforms, setPostedPlatforms] = useState<Platform[]>([])
  const [otherPlatformLabel, setOtherPlatformLabel] = useState("")
  const [postedDate, setPostedDate] = useState(todayIST())
  const [editedBy, setEditedBy] = useState("")
  const [postedBy, setPostedBy] = useState("")
  // Backfilled items skip the Edited -> On Review move where the Drive link is normally
  // asked, so it has to be capturable here — otherwise anything logged as already posted
  // lands on the board with no way back to the file.
  const [driveLink, setDriveLink] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function togglePlatform(p: Platform) {
    setPostedPlatforms(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p])
  }

  async function submit() {
    if (!client || !title.trim()) { setError("Client and title are required"); return }
    if (alreadyPosted && postedPlatforms.length === 0) { setError("Pick at least one platform it was posted to"); return }
    if (alreadyPosted && driveLink.trim() && !isValidDriveLink(driveLink)) { setError("A valid Google Drive link is required"); return }
    setSaving(true); setError(null)
    const res = await createContentItem({
      client_name: client, title: title.trim(), content_type: contentType, shot_date: shotDate, notes: notes.trim() || undefined,
      posted_platforms: alreadyPosted ? postedPlatforms : undefined,
      posted_date: alreadyPosted ? postedDate : undefined,
      edited_by: alreadyPosted ? (editedBy || undefined) : undefined,
      posted_by: alreadyPosted ? (postedBy || undefined) : undefined,
      other_platform_label: alreadyPosted && postedPlatforms.includes("other") ? (otherPlatformLabel.trim() || undefined) : undefined,
      edited_drive_link: alreadyPosted ? (driveLink.trim() || undefined) : undefined,
    })
    setSaving(false)
    if (!res.success || !res.id) { setError(res.error ?? "Failed to save"); return }
    onCreated({
      id: res.id, client_name: client, title: title.trim(), content_type: contentType,
      status: alreadyPosted ? "posted" : (contentType === "poster" ? "design" : "ready_to_edit"),
      source: contentType === "poster" ? "poster" : "shoot",
      ready_platforms: [], scheduled_post_date: null, scheduled_post_time: null, corrections: [],
      hook_count: null, use_for: [], priority: null, shoot_type: null, voiceover_date: null, reviewed_at: null,
      posted_branding: alreadyPosted && postedPlatforms.some(p => !ADS_PLATFORM_SET.has(p)),
      posted_ads: alreadyPosted && postedPlatforms.some(p => ADS_PLATFORM_SET.has(p)),
      cancelled_by: null,
      edited_drive_link: alreadyPosted ? (driveLink.trim() || null) : null,
      script_drive_link: null,
      is_promotion: false,
      shot_date: shotDate, edited_date: alreadyPosted ? postedDate : null, notes: notes.trim() || null, created_at: new Date().toISOString(),
      posts: alreadyPosted ? postedPlatforms.map((platform, i) => ({
        id: `${res.id}-${i}`, content_item_id: res.id!, platform, posted_date: postedDate, post_link: null, ad_run_date: null,
        other_platform_label: platform === "other" ? (otherPlatformLabel.trim() || null) : null,
        postedByUser: postedBy ? (members.find(m => m.id === postedBy) ?? null) : null,
      })) : [],
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
          <label style={LABEL}>Created Date</label>
          <input type="date" style={FIELD} value={shotDate} onChange={e => setShotDate(e.target.value)} />
        </div>
        <div>
          <label style={LABEL}>Notes</label>
          <textarea style={{ ...FIELD, minHeight: 60, resize: "vertical" }} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional" />
        </div>

        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", padding: "10px 12px", borderRadius: 10, background: alreadyPosted ? "rgba(34,197,94,0.06)" : "#F9FAFB", border: `1.5px solid ${alreadyPosted ? "rgba(34,197,94,0.3)" : "#E5E7EB"}` }}>
          <input type="checkbox" checked={alreadyPosted} onChange={e => setAlreadyPosted(e.target.checked)} style={{ width: 15, height: 15, accentColor: "#22C55E" }} />
          <span style={{ fontSize: 12, fontWeight: 700, color: alreadyPosted ? "#16A34A" : "#374151" }}>Already posted</span>
        </label>

        {alreadyPosted && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: 12, borderRadius: 12, background: "#F9FAFB", border: "1px solid #F3F4F6" }}>
            <div>
              <label style={LABEL}>Posted To (pick all platforms) *</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {SELECTABLE_PLATFORMS.map(p => {
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
            {postedPlatforms.includes("other") && (
              <div>
                <label style={LABEL}>Which platform? *</label>
                <input style={FIELD} value={otherPlatformLabel} onChange={e => setOtherPlatformLabel(e.target.value)} placeholder="e.g. Pinterest, WhatsApp Status" />
              </div>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <label style={LABEL}>Posted Date *</label>
                <input type="date" style={FIELD} value={postedDate} onChange={e => setPostedDate(e.target.value)} />
              </div>
              <div>
                <label style={LABEL}>{contentType === "poster" ? "Designed By" : "Edited By"}</label>
                <select style={{ ...FIELD, cursor: "pointer" }} value={editedBy} onChange={e => setEditedBy(e.target.value)}>
                  <option value="">— Not set —</option>
                  {members.map(m => <option key={m.id} value={m.id}>{upper(m.name)}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label style={LABEL}>Posted By</label>
              <select style={{ ...FIELD, cursor: "pointer" }} value={postedBy} onChange={e => setPostedBy(e.target.value)}>
                <option value="">— Not set —</option>
                {members.map(m => <option key={m.id} value={m.id}>{upper(m.name)}</option>)}
              </select>
            </div>
            <div>
              <label style={LABEL}>Drive Link</label>
              <input type="url" style={FIELD} value={driveLink} onChange={e => setDriveLink(e.target.value)}
                placeholder="https://drive.google.com/…" />
              {driveLink.trim().length > 0 && !isValidDriveLink(driveLink) && (
                <p style={{ fontSize: 10, color: "#DE1A1A", margin: "4px 0 0" }}>Must be a Google Drive or Docs link</p>
              )}
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
function NewAdsVideoModal({ clients, pastClients, members, currentUserId, onClose, onCreated }: {
  clients: { id: string; name: string }[]; pastClients: { id: string; name: string }[]
  members: Member[]; currentUserId: string
  onClose: () => void; onCreated: (item: ContentItem) => void
}) {
  const { activeOptions: activeClientOptions, pastOptions: pastClientOptions } = useMemo(
    () => buildClientOptions(clients.map(c => c.name), pastClients.map(c => c.name)),
    [clients, pastClients]
  )
  const [client, setClient] = useState("")
  const [title, setTitle] = useState("")
  const [hookCount, setHookCount] = useState<number | "">(1)
  const [scriptedBy, setScriptedBy] = useState(currentUserId)
  const [notes, setNotes] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    if (!client || !title.trim()) { setError("Client and title are required"); return }
    if (!scriptedBy) { setError("Pick who scripted this"); return }
    setSaving(true); setError(null)
    const finalHookCount = hookCount === "" ? 0 : hookCount
    const res = await createAdsVideoScript({ client_name: client, title: title.trim(), hook_count: finalHookCount, use_for: [], scripted_by: scriptedBy, notes: notes.trim() || undefined })
    setSaving(false)
    if (!res.success || !res.id) { setError(res.error ?? "Failed to save"); return }
    const scriptedByUser = members.find(m => m.id === scriptedBy) ?? null
    onCreated({
      id: res.id, client_name: client, title: title.trim(), content_type: "video", source: "ads_video",
      status: "scripting", shot_date: null, edited_date: null, notes: notes.trim() || null, created_at: new Date().toISOString(),
      ready_platforms: [], scheduled_post_date: null, scheduled_post_time: null, corrections: [],
      hook_count: finalHookCount, use_for: [], priority: null, shoot_type: null, voiceover_date: null, reviewed_at: null,
      posted_branding: false, posted_ads: false, cancelled_by: null, edited_drive_link: null, script_drive_link: null, is_promotion: false, scriptedByUser, posts: [],
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
          <input type="number" min={0} style={FIELD} value={hookCount} onChange={e => setHookCount(e.target.value === "" ? "" : Math.max(0, Number(e.target.value)))} />
        </div>
        <div>
          <label style={LABEL}>Scripted By *</label>
          <select style={{ ...FIELD, cursor: "pointer" }} value={scriptedBy} onChange={e => setScriptedBy(e.target.value)}>
            {members.map(m => (
              <option key={m.id} value={m.id}>{upper(m.name)}{m.id === currentUserId ? " (me)" : ""}</option>
            ))}
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

// ── Edit Script modal — the Scripting-stage entry's own fields, pre-filled ──
function EditAdsVideoModal({ item, clients, pastClients, members, currentUserId, onClose, onSaved, onAdvance }: {
  item: ContentItem
  clients: { id: string; name: string }[]; pastClients: { id: string; name: string }[]
  members: Member[]; currentUserId: string
  onClose: () => void
  onSaved: (updates: { client_name: string; title: string; hook_count: number; use_for: UseFor[]; scriptedByUser: Person; notes: string }) => void
  onAdvance: (item: ContentItem, next: ContentStatus) => void
}) {
  const { activeOptions: activeClientOptions, pastOptions: pastClientOptions } = useMemo(
    () => buildClientOptions(clients.map(c => c.name), pastClients.map(c => c.name)),
    [clients, pastClients]
  )
  const [client, setClient] = useState(item.client_name)
  const [title, setTitle] = useState(item.title)
  const [hookCount, setHookCount] = useState<number | "">(item.hook_count ?? 0)
  const [scriptedBy, setScriptedBy] = useState(item.scriptedByUser?.id ?? currentUserId)
  const [notes, setNotes] = useState(item.notes || "")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    if (!client || !title.trim()) { setError("Client and title are required"); return }
    if (!scriptedBy) { setError("Pick who scripted this"); return }
    setSaving(true); setError(null)
    const finalHookCount = hookCount === "" ? 0 : hookCount
    const res = await updateAdsVideoScript({ content_item_id: item.id, client_name: client, title: title.trim(), hook_count: finalHookCount, use_for: item.use_for, scripted_by: scriptedBy, notes: notes.trim() || undefined })
    setSaving(false)
    if (!res.success) { setError(res.error ?? "Failed to save"); return }
    const scriptedByUser = members.find(m => m.id === scriptedBy) ?? null
    onSaved({ client_name: client, title: title.trim(), hook_count: finalHookCount, use_for: item.use_for, scriptedByUser, notes: notes.trim() })
  }

  return (
    <Modal title="Edit Script" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <ClientSelector clientOptions={activeClientOptions} pastClientOptions={pastClientOptions} value={client} onValueChange={setClient} required />
        <div>
          <label style={LABEL}>Title *</label>
          <input style={FIELD} value={title} onChange={e => setTitle(e.target.value)} />
        </div>
        <div>
          <label style={LABEL}>How many hooks?</label>
          <input type="number" min={0} style={FIELD} value={hookCount} onChange={e => setHookCount(e.target.value === "" ? "" : Math.max(0, Number(e.target.value)))} />
        </div>
        <div>
          <label style={LABEL}>Scripted By *</label>
          <select style={{ ...FIELD, cursor: "pointer" }} value={scriptedBy} onChange={e => setScriptedBy(e.target.value)}>
            {members.map(m => (
              <option key={m.id} value={m.id}>{upper(m.name)}{m.id === currentUserId ? " (me)" : ""}</option>
            ))}
          </select>
        </div>
        <div>
          <label style={LABEL}>Notes</label>
          <textarea style={{ ...FIELD, minHeight: 60, resize: "vertical" }} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional" />
        </div>
        <div style={{ borderTop: "1px solid #F3F4F6", paddingTop: 12 }}>
          <label style={LABEL}>Stage</label>
          <button type="button" onClick={() => onAdvance(item, "voiceover")}
            style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "9px 12px", borderRadius: 10, border: "none", background: STATUS_CFG.voiceover.accent, color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
            Move to Voice Over <ArrowRight size={12} />
          </button>
        </div>
        {error && <p style={{ fontSize: 11, color: "#DE1A1A", margin: 0 }}>{error}</p>}
        <PrimaryButton onClick={submit} disabled={saving}>{saving ? "Saving…" : "Save Changes"}</PrimaryButton>
      </div>
    </Modal>
  )
}

// ── Edit Voice Over modal — reassign the artist or fix the date after the fact ──
function EditVoiceOverModal({ item, freelancers, onClose, onSaved, onAdvance }: {
  item: ContentItem
  freelancers: VoiceFreelancer[]
  onClose: () => void
  onSaved: (voiceoverBy: VoiceFreelancer, date: string, scriptLink: string) => void
  onAdvance: (item: ContentItem, next: ContentStatus) => void
}) {
  const [voiceoverId, setVoiceoverId] = useState(item.voiceoverBy?.id ?? freelancers[0]?.id ?? "")
  const [date, setDate] = useState(item.voiceover_date ?? todayIST())
  const [scriptLink, setScriptLink] = useState(item.script_drive_link ?? "")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    const freelancer = freelancers.find(f => f.id === voiceoverId)
    if (!freelancer) { setError("Pick who recorded the voice-over"); return }
    if (!isValidDriveLink(scriptLink)) { setError("A valid Google Drive link to the script is required"); return }
    setSaving(true); setError(null)
    const res = await updateVoiceOver({
      content_item_id: item.id, voiceover_by: freelancer.id, voiceover_date: date,
      script_drive_link: scriptLink.trim(),
    })
    setSaving(false)
    if (!res.success) { setError(res.error ?? "Failed to save"); return }
    onSaved(freelancer, date, scriptLink.trim())
  }

  return (
    <Modal title="Edit Voice Over" onClose={onClose}>
      <div className="flex flex-col gap-3">
        {freelancers.length === 0 ? (
          <p style={{ fontSize: 11, color: "#DE1A1A", margin: 0 }}>
            No one is set up for Voice Over yet — tag a team member's Media Tracker Roles on the Team page, or add an active Freelance RJ Voiceover artist under Freelancers.
          </p>
        ) : (
          <div>
            <label style={LABEL}>Voice Artist *</label>
            <select style={{ ...FIELD, cursor: "pointer" }} value={voiceoverId} onChange={e => setVoiceoverId(e.target.value)}>
              {freelancers.map(f => <option key={f.id} value={f.id}>{upper(f.name)}</option>)}
            </select>
          </div>
        )}
        <div>
          <label style={LABEL}>Date</label>
          <input type="date" style={FIELD} value={date} onChange={e => setDate(e.target.value)} />
        </div>
        <div>
          <label style={LABEL}>Script Drive Link *</label>
          <input type="url" style={FIELD} value={scriptLink} onChange={e => setScriptLink(e.target.value)}
            placeholder="https://docs.google.com/…" />
          {scriptLink.trim().length > 0 && !isValidDriveLink(scriptLink) && (
            <p style={{ fontSize: 11, color: "#DE1A1A", margin: "4px 0 0" }}>Must be a drive.google.com or docs.google.com link</p>
          )}
        </div>
        <div style={{ borderTop: "1px solid #F3F4F6", paddingTop: 12 }}>
          <label style={LABEL}>Stage</label>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" onClick={() => onAdvance(item, "scripting")}
              style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "9px 12px", borderRadius: 10, border: "1.5px solid #E5E7EB", background: "#fff", color: "#374151", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
              <RotateCcw size={12} /> Move Back to Scripting
            </button>
            <button type="button" onClick={() => onAdvance(item, "ready_to_edit")}
              style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "9px 12px", borderRadius: 10, border: "none", background: STATUS_CFG.ready_to_edit.accent, color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
              Move to Ready to Edit <ArrowRight size={12} />
            </button>
          </div>
        </div>
        {error && <p style={{ fontSize: 11, color: "#DE1A1A", margin: 0 }}>{error}</p>}
        <PrimaryButton onClick={submit} disabled={saving || freelancers.length === 0}>{saving ? "Saving…" : "Save Changes"}</PrimaryButton>
      </div>
    </Modal>
  )
}

// ── Edit Content modal ───────────────────────────────────────────────────────
// Shows only what's actually relevant to the item's current stage — a Ready to Edit item
// has no schedule yet to edit, and only Edited-or-later items have an editor to reassign.
function EditContentModal({ item, clients, pastClients, members, shootingMembers, onClose, onSaved, onAdvance, onAddPlatform, onPostUpdated }: {
  item: ContentItem
  clients: { id: string; name: string }[]; pastClients: { id: string; name: string }[]
  members: Member[]
  shootingMembers: Member[]
  onClose: () => void
  onSaved: (updates: {
    client_name: string; title: string; content_type: "video" | "poster"; shot_date: string; notes: string
    ready_platforms: Platform[]; scheduled_post_date: string; scheduled_post_time: string
    editedByUser?: Person; edited_date?: string; edited_drive_link?: string; shotByUsers?: Member[]; cancelled_by?: CancelledBy
  }) => void
  onAdvance: (item: ContentItem, next: ContentStatus) => void
  onAddPlatform: (item: ContentItem, kind: "branding" | "ads") => void
  onPostUpdated: (postId: string, updates: { posted_date: string; postedByUser?: Person }) => void
}) {
  // Stage movement — the one place to move a card back or forward, replacing the old
  // scattered 3-dot "Move back to..." menu item. "edited" goes back to wherever it
  // actually came from (design for posters, ready_to_edit for shoots/ads video).
  const backTarget: ContentStatus | null =
    item.status === "edited" ? (item.source === "poster" ? "design" : "ready_to_edit")
    : item.status === "on_review" ? "edited"
    : (item.status === "branding_ready" || item.status === "ads_ready") ? "on_review"
    : null
  const forwardTarget = NEXT_STATUS[item.status] ?? null
  const { activeOptions: activeClientOptions, pastOptions: pastClientOptions } = useMemo(
    () => buildClientOptions(clients.map(c => c.name), pastClients.map(c => c.name)),
    [clients, pastClients]
  )
  const showEditor = item.status === "edited" || item.status === "on_review" || item.status === "branding_ready" || item.status === "ads_ready" || item.status === "posted"
  // Shot By only makes sense before editing starts — once the item is Editing or later,
  // Editor is the field that matters (see showEditor above).
  const showShotBy = item.status === "ready_to_edit"
  // Scheduling only matters pre-post — once posted, the real record is the per-platform
  // post log below, not an intent that's already happened.
  const showSchedule = item.status === "branding_ready" || item.status === "ads_ready"
  const showPosts = item.status === "posted"
  const showCancelled = item.status === "cancelled"

  const [client, setClient] = useState(item.client_name)
  const [title, setTitle] = useState(item.title)
  // Not editable — changing a poster into a video (or vice versa) would move it to the
  // other tab and make it look like it disappeared.
  const contentType = item.content_type
  const [shotDate, setShotDate] = useState(item.shot_date || todayIST())
  const [shotBy, setShotBy] = useState<string[]>(item.shotByUsers?.map(u => u.id) ?? [])
  const [editedBy, setEditedBy] = useState(item.editedByUser?.id ?? "")
  const [editedDate, setEditedDate] = useState(item.edited_date || todayIST())
  const [driveLink, setDriveLink] = useState(item.edited_drive_link ?? "")
  const [cancelledBy, setCancelledBy] = useState<CancelledBy>(item.cancelled_by ?? "us")
  const [notes, setNotes] = useState(item.notes || "")
  // Schedule/intent fields — only shown once the item has actually reached Ready to Post.
  // Saving these here never changes item.status; that transition stays owned by the Ready
  // to Post flow.
  const [platforms, setPlatforms] = useState<Platform[]>(item.ready_platforms ?? [])
  const [scheduledDate, setScheduledDate] = useState(item.scheduled_post_date || "")
  const [scheduledTime, setScheduledTime] = useState(item.scheduled_post_time || "")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Per-post "who/when posted" corrections — separate save action per row, since it's a
  // different record (content_item_posts) than the item fields above.
  const [postEdits, setPostEdits] = useState<Record<string, { postedBy: string; postedDate: string }>>(
    () => Object.fromEntries(item.posts.map(p => [p.id, { postedBy: p.postedByUser?.id ?? "", postedDate: p.posted_date }]))
  )
  const [savingPostId, setSavingPostId] = useState<string | null>(null)

  function togglePlatform(p: Platform) {
    setPlatforms(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p])
  }
  function toggleShotBy(id: string) {
    setShotBy(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  async function submit() {
    if (!client || !title.trim()) { setError("Client and title are required"); return }
    if (showEditor && driveLink && !isValidDriveLink(driveLink)) { setError("A valid Google Drive link is required"); return }
    setSaving(true); setError(null)
    const res = await updateContentItem(item.id, {
      client_name: client, title: title.trim(), content_type: contentType, shot_date: shotDate, notes: notes.trim() || undefined,
      shot_by: showShotBy ? shotBy : undefined,
      edited_by: showEditor ? (editedBy || undefined) : undefined,
      edited_date: showEditor ? (editedDate || undefined) : undefined,
      edited_drive_link: showEditor ? (driveLink.trim() || undefined) : undefined,
      ready_platforms: showSchedule ? platforms : undefined,
      scheduled_post_date: showSchedule ? (scheduledDate || undefined) : undefined,
      scheduled_post_time: showSchedule ? (scheduledTime || undefined) : undefined,
      cancelled_by: showCancelled ? cancelledBy : undefined,
    })
    setSaving(false)
    if (!res.success) { setError(res.error ?? "Failed to save"); return }
    onSaved({
      client_name: client, title: title.trim(), content_type: contentType, shot_date: shotDate, notes: notes.trim(),
      ready_platforms: platforms, scheduled_post_date: scheduledDate, scheduled_post_time: scheduledTime,
      editedByUser: showEditor ? (members.find(m => m.id === editedBy) ?? null) : undefined,
      edited_date: showEditor ? editedDate : undefined,
      edited_drive_link: showEditor ? driveLink.trim() : undefined,
      shotByUsers: showShotBy ? shootingMembers.filter(m => shotBy.includes(m.id)) : undefined,
      cancelled_by: showCancelled ? cancelledBy : undefined,
    })
  }

  async function savePost(postId: string) {
    const edit = postEdits[postId]
    if (!edit?.postedDate) return
    setSavingPostId(postId)
    const res = await updateContentPost({ id: postId, content_item_id: item.id, posted_by: edit.postedBy || undefined, posted_date: edit.postedDate })
    setSavingPostId(null)
    if (!res.success) { setError(res.error ?? "Failed to save post"); return }
    onPostUpdated(postId, { posted_date: edit.postedDate, postedByUser: members.find(m => m.id === edit.postedBy) ?? null })
  }

  return (
    <Modal title="Edit Content" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <ClientSelector clientOptions={activeClientOptions} pastClientOptions={pastClientOptions} value={client} onValueChange={setClient} required />
        <div>
          <label style={LABEL}>Title *</label>
          <input style={FIELD} value={title} onChange={e => setTitle(e.target.value)} />
        </div>
        <div>
          <label style={LABEL}>{contentType === "poster" ? "Created Date" : "Shot Date"}</label>
          <input type="date" style={FIELD} value={shotDate} onChange={e => setShotDate(e.target.value)} />
        </div>
        {showShotBy && (
          <div>
            <label style={LABEL}>Shot By <span style={{ fontWeight: 600, textTransform: "none" }}>(pick one or more)</span></label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {shootingMembers.map(m => {
                const on = shotBy.includes(m.id)
                return (
                  <button key={m.id} type="button" onClick={() => toggleShotBy(m.id)}
                    style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 10, border: `1.5px solid ${on ? "#3B82F6" : "#E5E7EB"}`, background: on ? "rgba(59,130,246,0.08)" : "#fff", color: on ? "#3B82F6" : "#6B7280", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                    {on && <Check size={11} />} {upper(m.name)}
                  </button>
                )
              })}
            </div>
          </div>
        )}
        {showEditor && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <label style={LABEL}>{contentType === "poster" ? "Designer" : "Editor"}</label>
              <select style={{ ...FIELD, cursor: "pointer" }} value={editedBy} onChange={e => setEditedBy(e.target.value)}>
                <option value="">— Not set —</option>
                {members.map(m => <option key={m.id} value={m.id}>{upper(m.name)}</option>)}
              </select>
            </div>
            <div>
              <label style={LABEL}>{contentType === "poster" ? "Designed Date" : "Edited Date"}</label>
              <input type="date" style={FIELD} value={editedDate} onChange={e => setEditedDate(e.target.value)} />
            </div>
          </div>
        )}
        {showEditor && contentType !== "poster" && (
          <div>
            <label style={LABEL}>Drive Link</label>
            <input style={FIELD} value={driveLink} onChange={e => setDriveLink(e.target.value)} placeholder="https://drive.google.com/…" />
          </div>
        )}
        {showSchedule && (
          <>
            <div>
              <label style={LABEL}>Platforms <span style={{ fontWeight: 600, textTransform: "none" }}>(where this is going out)</span></label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {SELECTABLE_PLATFORMS.map(p => {
                  const cfg = PLATFORM_CFG[p]
                  const on = platforms.includes(p)
                  return (
                    <button key={p} type="button" onClick={() => togglePlatform(p)}
                      style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 10, border: `1.5px solid ${on ? cfg.color : "#E5E7EB"}`, background: on ? `${cfg.color}14` : "#fff", color: on ? cfg.color : "#6B7280", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                      <cfg.icon size={12} /> {cfg.label} {on && <Check size={10} />}
                    </button>
                  )
                })}
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <label style={LABEL}>Scheduled Post Date</label>
                <input type="date" style={FIELD} value={scheduledDate} onChange={e => setScheduledDate(e.target.value)} />
              </div>
              <div>
                <label style={LABEL}>Scheduled Post Time</label>
                <input type="time" style={FIELD} value={scheduledTime} onChange={e => setScheduledTime(e.target.value)} />
              </div>
            </div>
          </>
        )}
        {showPosts && (
          <div>
            <label style={LABEL}>Platforms — Currently Posted</label>
            {item.posts.length > 0 && (
              <div className="flex flex-col gap-1.5 mb-2">
                {item.posts.map(p => {
                  const cfg = PLATFORM_CFG[p.platform]
                  const edit = postEdits[p.id] ?? { postedBy: "", postedDate: p.posted_date }
                  return (
                    <div key={p.id} className="flex items-center gap-1.5 flex-wrap" style={{ padding: "6px 8px", borderRadius: 10, background: "#F9FAFB" }}>
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0"
                        style={{ background: `${cfg.color}14`, color: cfg.color }}>
                        <cfg.icon size={9} /> {p.platform === "other" && p.other_platform_label ? p.other_platform_label : cfg.label}
                      </span>
                      <select style={{ ...FIELD, height: 28, fontSize: 11, flex: "1 1 120px", cursor: "pointer" }}
                        value={edit.postedBy} onChange={e => setPostEdits(prev => ({ ...prev, [p.id]: { ...edit, postedBy: e.target.value } }))}>
                        <option value="">Posted by — Not set —</option>
                        {members.map(m => <option key={m.id} value={m.id}>{upper(m.name)}</option>)}
                      </select>
                      <input type="date" style={{ ...FIELD, height: 28, fontSize: 11, flex: "1 1 130px" }}
                        value={edit.postedDate} onChange={e => setPostEdits(prev => ({ ...prev, [p.id]: { ...edit, postedDate: e.target.value } }))} />
                      <button type="button" onClick={() => savePost(p.id)} disabled={savingPostId === p.id}
                        style={{ flexShrink: 0, padding: "5px 10px", borderRadius: 8, border: "none", background: "#111827", color: "#fff", fontSize: 10, fontWeight: 700, cursor: "pointer" }}>
                        {savingPostId === p.id ? "…" : "Save"}
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
            <div className="flex gap-1.5">
              <button type="button" onClick={() => { onAddPlatform(item, "branding"); onClose() }}
                style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 5, padding: "8px 12px", borderRadius: 10, border: "none", background: "rgba(34,197,94,0.1)", color: "#16A34A", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                <Plus size={11} /> {item.posted_branding ? "Branding Post" : "Add Branding Post"}
              </button>
              <button type="button" onClick={() => { onAddPlatform(item, "ads"); onClose() }}
                style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 5, padding: "8px 12px", borderRadius: 10, border: "none", background: "rgba(217,119,6,0.1)", color: "#D97706", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                <Plus size={11} /> {item.posted_ads ? "Ads Post" : "Add Ads Post"}
              </button>
            </div>
          </div>
        )}
        <div>
          <label style={LABEL}>Notes</label>
          <textarea style={{ ...FIELD, minHeight: 60, resize: "vertical" }} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional" />
        </div>
        {showCancelled && (
          <div>
            <label style={LABEL}>Cancelled By</label>
            <div className="flex gap-1.5">
              <button type="button" onClick={() => setCancelledBy("client")}
                style={{ flex: 1, padding: "8px 12px", borderRadius: 10, border: `1.5px solid ${cancelledBy === "client" ? "#EF4444" : "#E5E7EB"}`, background: cancelledBy === "client" ? "rgba(239,68,68,0.08)" : "#fff", color: cancelledBy === "client" ? "#EF4444" : "#6B7280", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                Client
              </button>
              <button type="button" onClick={() => setCancelledBy("us")}
                style={{ flex: 1, padding: "8px 12px", borderRadius: 10, border: `1.5px solid ${cancelledBy === "us" ? "#EF4444" : "#E5E7EB"}`, background: cancelledBy === "us" ? "rgba(239,68,68,0.08)" : "#fff", color: cancelledBy === "us" ? "#EF4444" : "#6B7280", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                Us
              </button>
            </div>
          </div>
        )}
        {(backTarget || forwardTarget) && (
          <div style={{ borderTop: "1px solid #F3F4F6", paddingTop: 12 }}>
            <label style={LABEL}>Stage</label>
            <div style={{ display: "flex", gap: 8 }}>
              {backTarget && (
                <button type="button" onClick={() => onAdvance(item, backTarget)}
                  style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "9px 12px", borderRadius: 10, border: "1.5px solid #E5E7EB", background: "#fff", color: "#374151", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                  <RotateCcw size={12} /> Move Back to {STATUS_CFG[backTarget].label}
                </button>
              )}
              {forwardTarget && (
                <button type="button" onClick={() => onAdvance(item, forwardTarget)}
                  style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "9px 12px", borderRadius: 10, border: "none", background: STATUS_CFG[forwardTarget].accent, color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                  Move to {STATUS_CFG[forwardTarget].label} <ArrowRight size={12} />
                </button>
              )}
            </div>
          </div>
        )}

        {error && <p style={{ fontSize: 11, color: "#DE1A1A", margin: 0 }}>{error}</p>}
        <PrimaryButton onClick={submit} disabled={saving}>{saving ? "Saving…" : "Save Changes"}</PrimaryButton>
      </div>
    </Modal>
  )
}

// ── Add Platform Post modal ──────────────────────────────────────────────────
function AddPlatformModal({ item, kind, members, currentUserId, onClose, onAdded }: {
  item: ContentItem; kind: "branding" | "ads"; members: Member[]; currentUserId: string
  onClose: () => void; onAdded: (posts: ContentPost[], isPromotion: boolean) => void
}) {
  const already = useMemo(() => new Set(item.posts.map(p => p.platform)), [item.posts])
  // "Mark as Posted" only offers organic platforms, "Mark as Ads" only offers the ad
  // destinations — matches which of posted_branding/posted_ads this ends up counted under.
  const selectablePlatforms = useMemo(
    () => SELECTABLE_PLATFORMS.filter(p => kind === "ads" ? ADS_PLATFORM_SET.has(p) : !ADS_PLATFORM_SET.has(p)),
    [kind]
  )
  // Prefill from what was scheduled at "Ready to Post" — you already picked the platforms
  // and date then, so don't make anyone pick them twice. Still editable in case it changed.
  const [platforms, setPlatforms] = useState<Platform[]>(
    () => (item.ready_platforms ?? []).filter(p => !already.has(p) && selectablePlatforms.includes(p))
  )
  const [postedDate, setPostedDate] = useState(
    item.scheduled_post_date || todayIST()
  )
  const [adRunDate, setAdRunDate] = useState(todayIST())
  const [postLink, setPostLink] = useState("")
  // Who's posting — defaults to whoever clicked, but can be assigned to someone else.
  const [postedBy, setPostedBy] = useState(
    members.some(m => m.id === currentUserId) ? currentUserId : (members[0]?.id ?? "")
  )
  // A batch of hooks from one ad shoot often gets one hook+body also reused as a single
  // organic post — this is the one place that decision gets made, right when the primary
  // side is being marked posted, instead of a separate always-on control elsewhere.
  const otherKind: "branding" | "ads" = kind === "ads" ? "branding" : "ads"
  const otherAlreadyDone = otherKind === "ads" ? item.posted_ads : item.posted_branding
  const otherSelectablePlatforms = useMemo(
    () => SELECTABLE_PLATFORMS.filter(p => otherKind === "ads" ? ADS_PLATFORM_SET.has(p) : !ADS_PLATFORM_SET.has(p)),
    [otherKind]
  )
  const [alsoOther, setAlsoOther] = useState(false)
  const [otherPlatforms, setOtherPlatforms] = useState<Platform[]>([])
  const [otherPlatformLabel, setOtherPlatformLabel] = useState("")
  // Independent of platform choice entirely — just flags the item as used for promotion.
  const [isPromotion, setIsPromotion] = useState(item.is_promotion)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function toggle(p: Platform) {
    setPlatforms(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p])
  }
  function toggleOther(p: Platform) {
    setOtherPlatforms(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p])
  }

  async function submit() {
    if (platforms.length === 0) { setError("Pick at least one platform"); return }
    if (alsoOther && otherPlatforms.length === 0) { setError(`Pick at least one ${otherKind === "ads" ? "Ads" : "Branding"} platform, or untick "Also post to ${otherKind === "ads" ? "Ads" : "Branding"}"`); return }
    setSaving(true); setError(null)

    const submissions = [
      ...platforms.map(platform => ({ platform, isAds: kind === "ads" })),
      ...(alsoOther ? otherPlatforms.map(platform => ({ platform, isAds: otherKind === "ads" })) : []),
    ]
    // One post row per platform — the date, link and poster are shared across the batch.
    // is_promotion only needs to land once, but sending it on every row is harmless (the
    // server only ever sets it to true, never back to false).
    const results = await Promise.all(submissions.map(({ platform, isAds }) =>
      addContentPost({
        content_item_id: item.id, platform, posted_date: postedDate,
        post_link: postLink.trim() || undefined,
        posted_by: postedBy || undefined,
        ad_run_date: isAds ? adRunDate : undefined,
        is_promotion: isPromotion || undefined,
        other_platform_label: platform === "other" ? (otherPlatformLabel.trim() || undefined) : undefined,
      }).then(res => ({ res, platform, isAds }))
    ))
    setSaving(false)

    const failed = results.find(r => !r.res.success || !r.res.id)
    if (failed) { setError(failed.res.error ?? "Failed to save"); return }

    const poster = members.find(m => m.id === postedBy) ?? null
    onAdded(results.map(({ res, platform, isAds }) => ({
      id: res.id!, content_item_id: item.id, platform,
      posted_date: postedDate, post_link: postLink.trim() || null,
      ad_run_date: isAds ? adRunDate : null,
      other_platform_label: platform === "other" ? (otherPlatformLabel.trim() || null) : null,
      postedByUser: poster,
    })), isPromotion)
  }

  return (
    <Modal title={kind === "ads" ? "Mark as Ads" : "Post"} onClose={onClose}>
      <div className="flex flex-col gap-3">
        <div>
          <label style={LABEL}>Platforms * <span style={{ fontWeight: 600, textTransform: "none" }}>(pick one or more)</span></label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {selectablePlatforms.map(p => {
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
        {(platforms.includes("other") || otherPlatforms.includes("other")) && (
          <div>
            <label style={LABEL}>Which platform? *</label>
            <input style={FIELD} value={otherPlatformLabel} onChange={e => setOtherPlatformLabel(e.target.value)} placeholder="e.g. Pinterest, WhatsApp Status" />
          </div>
        )}
        {members.length > 0 && (
          <div>
            <label style={LABEL}>Posted By *</label>
            <select style={{ ...FIELD, cursor: "pointer" }} value={postedBy} onChange={e => setPostedBy(e.target.value)}>
              {members.map(m => (
                <option key={m.id} value={m.id}>{upper(m.name)}{m.id === currentUserId ? " (me)" : ""}</option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label style={LABEL}>Posted Date *</label>
          <input type="date" style={FIELD} value={postedDate} onChange={e => setPostedDate(e.target.value)} />
        </div>
        {(kind === "ads" || (alsoOther && otherKind === "ads")) && (
          <div>
            <label style={LABEL}>Ad Run Date *</label>
            <input type="date" style={FIELD} value={adRunDate} onChange={e => setAdRunDate(e.target.value)} />
          </div>
        )}
        <div>
          <label style={LABEL}>Post Link</label>
          <input style={FIELD} value={postLink} onChange={e => setPostLink(e.target.value)} placeholder="Optional URL" />
        </div>
        {!otherAlreadyDone && (
          <div>
            <label className="flex items-center gap-2" style={{ cursor: "pointer" }}>
              <span style={{
                width: 16, height: 16, borderRadius: 4, flexShrink: 0, border: "1.5px solid", cursor: "pointer",
                borderColor: alsoOther ? "#DE1A1A" : "#D1D5DB", background: alsoOther ? "#DE1A1A" : "transparent",
                display: "flex", alignItems: "center", justifyContent: "center",
              }} onClick={() => setAlsoOther(v => !v)}>
                {alsoOther && <Check size={11} style={{ color: "#fff" }} />}
              </span>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#374151" }} onClick={() => setAlsoOther(v => !v)}>
                Also post to {otherKind === "ads" ? "Ads" : "Branding"}
              </span>
            </label>
            {alsoOther && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                {otherSelectablePlatforms.map(p => {
                  const cfg = PLATFORM_CFG[p]
                  const Icon = cfg.icon
                  const on = otherPlatforms.includes(p)
                  return (
                    <button key={p} onClick={() => toggleOther(p)}
                      style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 10, border: `1.5px solid ${on ? cfg.color : "#E5E7EB"}`, background: on ? `${cfg.color}14` : "#fff", color: on ? cfg.color : "#6B7280", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                      <Icon size={12} /> {cfg.label} {on && <Check size={10} />}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )}
        <div>
          <label className="flex items-center gap-2" style={{ cursor: "pointer" }}>
            <span style={{
              width: 16, height: 16, borderRadius: 4, flexShrink: 0, border: "1.5px solid", cursor: "pointer",
              borderColor: isPromotion ? "#DB2777" : "#D1D5DB", background: isPromotion ? "#DB2777" : "transparent",
              display: "flex", alignItems: "center", justifyContent: "center",
            }} onClick={() => setIsPromotion(v => !v)}>
              {isPromotion && <Check size={11} style={{ color: "#fff" }} />}
            </span>
            <span style={{ fontSize: 12, fontWeight: 700, color: "#374151" }} onClick={() => setIsPromotion(v => !v)}>
              Also use for Promotion
            </span>
          </label>
        </div>
        {error && <p style={{ fontSize: 11, color: "#DE1A1A", margin: 0 }}>{error}</p>}
        <PrimaryButton onClick={submit} disabled={saving}>
          {saving ? "Saving…" : `${kind === "ads" ? "Confirm Ads" : "Confirm Posted"}${platforms.length > 0 ? ` (${platforms.length})` : ""}`}
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
  const [launchDate, setLaunchDate] = useState(todayIST())
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
    onAdded({ id: res.id, ad_id: ad.id, revision_date: todayIST(), notes: notes.trim(), hook_count_after: hookCount === "" ? null : hookCount, targeting_type_after: targeting || null })
  }

  return (
    <Modal title="Log Correction" onClose={onClose}>
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
  const [entryDate, setEntryDate] = useState(todayIST())
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
    <Modal title="Log Performance" onClose={onClose}>
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
function NewShootModal({ clients, pastClients, shootingMembers, currentUserId, onClose, onCreated }: {
  clients: { id: string; name: string }[]; pastClients: { id: string; name: string }[]
  shootingMembers: Member[]; currentUserId: string
  onClose: () => void; onCreated: (shoot: Shoot) => void
}) {
  const { activeOptions: activeClientOptions, pastOptions: pastClientOptions } = useMemo(
    () => buildClientOptions(clients.map(c => c.name), pastClients.map(c => c.name)),
    [clients, pastClients]
  )
  const [client, setClient] = useState("")
  const [title, setTitle] = useState("")
  const [shotDate, setShotDate] = useState(todayIST())
  const [fromTime, setFromTime] = useState("")
  const [toTime, setToTime] = useState("")
  const [notes, setNotes] = useState("")
  const [tags, setTags] = useState<ShootTag[]>([])
  const [crew, setCrew] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function toggleTag(tag: ShootTag) {
    setTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag])
  }
  function toggleCrew(id: string) {
    setCrew(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  async function submit() {
    if (!client) { setError("Client is required"); return }
    if (!title.trim()) { setError("Shoot title is required"); return }
    if (!fromTime) { setError("From time is required"); return }
    if (!toTime) { setError("To time is required"); return }
    setSaving(true); setError(null)
    const res = await createTrackerShoot({
      client, title: title.trim(), shot_date: shotDate,
      shot_time_from: fromTime, shot_time_to: toTime, notes: notes.trim() || undefined,
      going_by: crew.length > 0 ? crew : undefined, tags: tags.length > 0 ? tags : undefined,
    })
    setSaving(false)
    if (!res.success || !res.id) { setError(res.error ?? "Failed to save"); return }
    onCreated({
      id: res.id,
      client,
      legacyTitle: title.trim(),
      start_time: `${shotDate}T${fromTime}:00`,
      end_time: `${shotDate}T${toTime}:00`,
      created_at: new Date().toISOString(),
      notes: notes.trim() || null,
      status: "scheduled",
      shoot_type: null,
      tags,
      source_content_item_id: null,
      drive_link: null,
      goingByUsers: shootingMembers.filter(m => crew.includes(m.id)),
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
        </div>
        <div>
          <label style={LABEL}>Schedule Date *</label>
          <input type="date" style={FIELD} value={shotDate} onChange={e => setShotDate(e.target.value)} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div>
            <label style={LABEL}>From Time *</label>
            <input type="time" style={FIELD} value={fromTime} onChange={e => setFromTime(e.target.value)} />
          </div>
          <div>
            <label style={LABEL}>To Time *</label>
            <input type="time" style={FIELD} value={toTime} onChange={e => setToTime(e.target.value)} />
          </div>
        </div>
        <div>
          <label style={LABEL}>Notes</label>
          <textarea style={{ ...FIELD, minHeight: 50, resize: "vertical" }} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional" />
        </div>
        <div>
          <label style={LABEL}>Tags <span style={{ fontWeight: 600, textTransform: "none" }}>(optional)</span></label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {(Object.keys(SHOOT_TAG_CFG) as ShootTag[]).map(tag => {
              const cfg = SHOOT_TAG_CFG[tag]
              const on = tags.includes(tag)
              return (
                <button key={tag} type="button" onClick={() => toggleTag(tag)}
                  style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 10, border: `1.5px solid ${on ? cfg.color : "#E5E7EB"}`, background: on ? `${cfg.color}14` : "#fff", color: on ? cfg.color : "#6B7280", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                  {on && <Check size={11} />} {cfg.label}
                </button>
              )
            })}
          </div>
        </div>
        {shootingMembers.length > 0 && (
          <div>
            <label style={LABEL}>Crew <span style={{ fontWeight: 600, textTransform: "none" }}>(optional — pick one or more)</span></label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {shootingMembers.map(m => {
                const on = crew.includes(m.id)
                return (
                  <button key={m.id} type="button" onClick={() => toggleCrew(m.id)}
                    style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 10, border: `1.5px solid ${on ? "#3B82F6" : "#E5E7EB"}`, background: on ? "rgba(59,130,246,0.08)" : "#fff", color: on ? "#3B82F6" : "#6B7280", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                    {on && <Check size={11} />} {upper(m.name)}{m.id === currentUserId ? " (me)" : ""}
                  </button>
                )
              })}
            </div>
          </div>
        )}
        {error && <p style={{ fontSize: 11, color: "#DE1A1A", margin: 0 }}>{error}</p>}
        <PrimaryButton onClick={submit} disabled={saving}>{saving ? "Saving…" : "Schedule Shoot"}</PrimaryButton>
      </div>
    </Modal>
  )
}

// ── "Needs correction" — sends an item back to Edited for rework, with what to fix ──
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
              {members.map(m => <option key={m.id} value={m.id}>{upper(m.name)}</option>)}
            </select>
          </div>
        )}
        {error && <p style={{ fontSize: 11, color: "#DE1A1A", margin: 0 }}>{error}</p>}
        <PrimaryButton onClick={submit} disabled={saving}>{saving ? "Saving…" : "Send Back for Correction"}</PrimaryButton>
      </div>
    </Modal>
  )
}

// ── "Move" — the On Review 3-way branch: Branding, Ads, or Cancelled (with who caused it) ──
// Approving out of review no longer asks for a posting date. Approving and deciding when
// something goes out are separate calls made at different moments, so the date is set
// afterwards with the Schedule button on the Branding/Ads Ready card — an item only shows
// up on the Schedule tab once someone has actually scheduled it.
function MoveOnReviewModal({ item, onClose, onMoved, onCancelled }: {
  item: ContentItem
  onClose: () => void
  onMoved: (next: "branding_ready" | "ads_ready") => void
  onCancelled: (cancelledBy: CancelledBy) => void
}) {
  const [showCancelReasons, setShowCancelReasons] = useState(false)

  return (
    <Modal title="Move" onClose={onClose}>
      <div className="flex flex-col gap-3">
        {item.editedByUser && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl" style={{ background: "#F1F5F9" }}>
            <span className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black flex-shrink-0" style={{ background: "#334155", color: "#fff" }}>
              {initials(item.editedByUser.name)}
            </span>
            <span className="text-[12px] font-bold" style={{ color: "#334155" }}>
              Edited by {upper(item.editedByUser.name)}{item.edited_date ? ` · ${fmtDate(item.edited_date)}` : ""}
            </span>
          </div>
        )}
        {!showCancelReasons ? (
          <>
            <button onClick={() => onMoved("branding_ready")}
              className="w-full py-3 rounded-xl text-[13px] font-bold transition-all hover:opacity-90"
              style={{ background: statusButtonGradient("branding_ready"), color: "#fff" }}>
              Move to Branding
            </button>
            <button onClick={() => onMoved("ads_ready")}
              className="w-full py-3 rounded-xl text-[13px] font-bold transition-all hover:opacity-90"
              style={{ background: statusButtonGradient("ads_ready"), color: "#fff" }}>
              Move to Ads
            </button>
            <button onClick={() => setShowCancelReasons(true)}
              className="w-full py-3 rounded-xl text-[13px] font-bold transition-all hover:opacity-90"
              style={{ background: statusButtonGradient("cancelled"), color: "#fff" }}>
              Move to Cancelled
            </button>
          </>
        ) : (
          <>
            <p className="text-[11px]" style={{ color: "#6B7280", margin: 0 }}>Cancelled by</p>
            <button onClick={() => onCancelled("client")}
              className="w-full py-3 rounded-xl text-[13px] font-bold transition-all hover:opacity-90"
              style={{ background: statusButtonGradient("cancelled"), color: "#fff" }}>
              Cancelled by Client
            </button>
            <button onClick={() => onCancelled("us")}
              className="w-full py-3 rounded-xl text-[13px] font-bold transition-all hover:opacity-90"
              style={{ background: statusButtonGradient("cancelled"), color: "#fff" }}>
              Cancelled by Us
            </button>
            <button onClick={() => setShowCancelReasons(false)}
              className="w-full py-2 rounded-xl text-[12px] font-bold transition-all hover:opacity-90"
              style={{ background: "#fff", color: "#6B7280", border: "1.5px solid #E5E7EB" }}>
              Back
            </button>
          </>
        )}
      </div>
    </Modal>
  )
}

// ── Schedule modal ───────────────────────────────────────────────────────────
// One field on purpose. The posting date is the only thing the Schedule button changes —
// the time slot and the platform intent picked at the Move step stay where they are, and
// stay editable in the Edit dialog. Wording follows the Move modal: Branding items are
// posted, Ads items are published.
function ScheduleModal({ item, onClose, onScheduled }: {
  item: ContentItem
  onClose: () => void
  onScheduled: (date: string) => void
}) {
  const isAds = item.status === "ads_ready"
  const [date, setDate] = useState(item.scheduled_post_date || todayIST())
  const [error, setError] = useState<string | null>(null)

  return (
    <Modal title="Schedule" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <div>
          <label style={LABEL}>{isAds ? "Publishing Date *" : "Posting Date *"}</label>
          <input type="date" style={FIELD} value={date} onChange={e => setDate(e.target.value)} />
        </div>
        {error && <p style={{ fontSize: 11, color: "#DE1A1A", margin: 0 }}>{error}</p>}
        <PrimaryButton onClick={() => {
          if (!date) { setError(`A ${isAds ? "publishing" : "posting"} date is required`); return }
          onScheduled(date)
        }}>
          Save Schedule
        </PrimaryButton>
      </div>
    </Modal>
  )
}

// ── "Cancelled by" — the direct Cancel menu action's own prompt (Ready to Edit, Design,
// Scripting, Voice Over), and drag-to-Cancelled from any stage. Same accountability as the
// On Review Move modal's Cancelled branch, just reached from a shorter path with no
// Branding/Ads choice to show first.
function CancelReasonModal({ item, onClose, onCancelled }: {
  item: ContentItem
  onClose: () => void
  onCancelled: (cancelledBy: CancelledBy) => void
}) {
  return (
    <Modal title="Cancel" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <p className="text-[11px]" style={{ color: "#6B7280", margin: 0 }}>Cancelled by</p>
        <button onClick={() => onCancelled("client")}
          className="w-full py-3 rounded-xl text-[13px] font-bold transition-all hover:opacity-90"
          style={{ background: statusButtonGradient("cancelled"), color: "#fff" }}>
          Cancelled by Client
        </button>
        <button onClick={() => onCancelled("us")}
          className="w-full py-3 rounded-xl text-[13px] font-bold transition-all hover:opacity-90"
          style={{ background: statusButtonGradient("cancelled"), color: "#fff" }}>
          Cancelled by Us
        </button>
      </div>
    </Modal>
  )
}

// ── "Who's editing this?" — the assignment prompt when an item enters Editing ──
// Fires on the Ready to Edit -> Editing / Design -> Editing move, before any actual edit
// or design work exists to record — just picking who's taking it on. No date or drive
// link yet; those are still captured later at the Editing -> Completed Edit move, where
// this same person is pre-filled but can be reassigned if someone else finishes it.
function AssignEditorModal({ item, members, currentUserId, onClose, onConfirm }: {
  item: ContentItem
  members: Member[]
  currentUserId: string
  onClose: () => void
  onConfirm: (editorId: string, editorName: string) => void
}) {
  const isPoster = item.content_type === "poster"
  const [editorId, setEditorId] = useState(
    members.some(m => m.id === currentUserId) ? currentUserId : (members[0]?.id ?? "")
  )
  const [error, setError] = useState<string | null>(null)

  function submit() {
    const editor = members.find(m => m.id === editorId)
    if (!editor) { setError(isPoster ? "Pick who's designing this" : "Pick who's editing this"); return }
    onConfirm(editor.id, editor.name)
  }

  return (
    <Modal title={isPoster ? "Who's designing this?" : "Who's editing this?"} onClose={onClose}>
      <div className="flex flex-col gap-3">
        <div>
          <label style={LABEL}>{isPoster ? "Designer *" : "Editor *"}</label>
          <select style={{ ...FIELD, cursor: "pointer" }} value={editorId} onChange={e => setEditorId(e.target.value)}>
            {members.map(m => (
              <option key={m.id} value={m.id}>{upper(m.name)}{m.id === currentUserId ? " (me)" : ""}</option>
            ))}
          </select>
        </div>
        {error && <p style={{ fontSize: 11, color: "#DE1A1A", margin: 0 }}>{error}</p>}
        <PrimaryButton onClick={submit}>{isPoster ? "Assign Designer" : "Assign Editor"}</PrimaryButton>
      </div>
    </Modal>
  )
}

// ── "Who edited this?" — the accountability prompt when an item moves to Completed Edit ──
// Asked at the Editing -> Completed Edit move, where the date and drive link finally
// exist to capture. Pre-fills whoever was assigned back at Ready to Edit/Design ->
// Editing (AssignEditorModal above), but stays editable — a different person may have
// actually finished the work.
function MarkEditedModal({ item, members, currentUserId, onClose, onConfirm }: {
  item: ContentItem
  members: Member[]
  currentUserId: string
  onClose: () => void
  onConfirm: (editorId: string, editorName: string, editedDate: string, driveLink: string) => void
}) {
  // A poster is designed, not edited — the wording changes, but the finished file still
  // has to be handed over with a Drive link, same as a video's edit.
  const isPoster = item.content_type === "poster"
  // Prefers whoever was already assigned at the Editing hand-off; otherwise defaults to
  // whoever clicked — the common case for an unassigned item is "I edited this" — but a
  // manager can reassign to anyone either way.
  const [editorId, setEditorId] = useState(
    item.editedByUser && members.some(m => m.id === item.editedByUser!.id) ? item.editedByUser.id
    : members.some(m => m.id === currentUserId) ? currentUserId : (members[0]?.id ?? "")
  )
  const [editedDate, setEditedDate] = useState(todayIST())
  // Where the finished file actually lives — required so On Review always has somewhere
  // to open the edit/design from, without asking around for it.
  const [driveLink, setDriveLink] = useState(item.edited_drive_link ?? "")
  const [error, setError] = useState<string | null>(null)

  function submit() {
    const editor = members.find(m => m.id === editorId)
    if (!editor) { setError(isPoster ? "Pick who designed this" : "Pick who edited this"); return }
    if (!isValidDriveLink(driveLink)) { setError("A valid Google Drive link is required"); return }
    onConfirm(editor.id, editor.name, editedDate, driveLink.trim())
  }

  return (
    <Modal title={isPoster ? "Who designed this?" : "Who edited this?"} onClose={onClose}>
      <div className="flex flex-col gap-3">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div>
            <label style={LABEL}>{isPoster ? "Designer *" : "Editor *"}</label>
            <select style={{ ...FIELD, cursor: "pointer" }} value={editorId} onChange={e => setEditorId(e.target.value)}>
              {members.map(m => (
                <option key={m.id} value={m.id}>{upper(m.name)}{m.id === currentUserId ? " (me)" : ""}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={LABEL}>{isPoster ? "Designed Date *" : "Edited Date *"}</label>
            <input type="date" style={FIELD} value={editedDate} onChange={e => setEditedDate(e.target.value)} />
          </div>
        </div>
        <div>
          <label style={LABEL}>Drive Link *</label>
          <input type="url" style={FIELD} value={driveLink} onChange={e => setDriveLink(e.target.value)}
            placeholder="https://drive.google.com/…" />
          {driveLink.trim().length > 0 && !isValidDriveLink(driveLink) && (
            <p style={{ fontSize: 11, color: "#DE1A1A", margin: "4px 0 0" }}>Must be a drive.google.com or docs.google.com link</p>
          )}
        </div>
        {error && <p style={{ fontSize: 11, color: "#DE1A1A", margin: 0 }}>{error}</p>}
        <PrimaryButton onClick={submit}>{isPoster ? "Mark Designed" : "Mark Edited"}</PrimaryButton>
      </div>
    </Modal>
  )
}

// ── "Who recorded this?" — the accountability prompt when a script enters Voice Over ──
// Also where Scripting is completed, so the written script's Drive link is compulsory
// here — the artist can't record from a script nobody can open.
function VoiceOverModal({ item, freelancers, onClose, onConfirm }: {
  item: ContentItem
  freelancers: VoiceFreelancer[]
  onClose: () => void
  onConfirm: (voiceoverBy: VoiceFreelancer, date: string, scriptLink: string) => void
}) {
  const [voiceoverId, setVoiceoverId] = useState(freelancers[0]?.id ?? "")
  const [date, setDate] = useState(todayIST())
  const [scriptLink, setScriptLink] = useState(item.script_drive_link ?? "")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    const freelancer = freelancers.find(f => f.id === voiceoverId)
    if (!freelancer) { setError("Pick who recorded the voice-over"); return }
    if (!isValidDriveLink(scriptLink)) { setError("A valid Google Drive link to the script is required"); return }
    setSaving(true); setError(null)
    const res = await recordVoiceOver({
      content_item_id: item.id, voiceover_by: freelancer.id, voiceover_date: date,
      script_drive_link: scriptLink.trim(),
    })
    setSaving(false)
    if (!res.success) { setError(res.error ?? "Failed to save"); return }
    onConfirm(freelancer, date, scriptLink.trim())
  }

  return (
    <Modal title="Who recorded the voice-over?" onClose={onClose}>
      <div className="flex flex-col gap-3">
        {freelancers.length === 0 ? (
          <p style={{ fontSize: 11, color: "#DE1A1A", margin: 0 }}>
            No one is set up for Voice Over yet — tag a team member's Media Tracker Roles on the Team page, or add an active Freelance RJ Voiceover artist under Freelancers.
          </p>
        ) : (
          <div>
            <label style={LABEL}>Voice Artist *</label>
            <select style={{ ...FIELD, cursor: "pointer" }} value={voiceoverId} onChange={e => setVoiceoverId(e.target.value)}>
              {freelancers.map(f => <option key={f.id} value={f.id}>{upper(f.name)}</option>)}
            </select>
          </div>
        )}
        <div>
          <label style={LABEL}>Date</label>
          <input type="date" style={FIELD} value={date} onChange={e => setDate(e.target.value)} />
        </div>
        <div>
          <label style={LABEL}>Script Drive Link *</label>
          <input type="url" style={FIELD} value={scriptLink} onChange={e => setScriptLink(e.target.value)}
            placeholder="https://docs.google.com/…" />
          {scriptLink.trim().length > 0 && !isValidDriveLink(scriptLink) && (
            <p style={{ fontSize: 11, color: "#DE1A1A", margin: "4px 0 0" }}>Must be a drive.google.com or docs.google.com link</p>
          )}
        </div>
        {error && <p style={{ fontSize: 11, color: "#DE1A1A", margin: 0 }}>{error}</p>}
        <PrimaryButton onClick={submit} disabled={saving || freelancers.length === 0}>{saving ? "Saving…" : "Confirm Voice Over"}</PrimaryButton>
      </div>
    </Modal>
  )
}

// ── Move to Shoot modal — spins a real shoot off a Scripting item, e.g. when the
// client wants to speak the script on camera instead of recording a voice-over at all ──
function MoveToShootModal({ item, onClose, onMoved }: {
  item: ContentItem
  onClose: () => void
  onMoved: (shoot: Shoot, scriptLink: string) => void
}) {
  const [shotDate, setShotDate] = useState(todayIST())
  const [fromTime, setFromTime] = useState("")
  const [toTime, setToTime] = useState("")
  const [notes, setNotes] = useState("")
  // The other route out of Scripting — same compulsory script link as the Voice Over one,
  // so the crew shooting it can actually open what they're reading from.
  const [scriptLink, setScriptLink] = useState(item.script_drive_link ?? "")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    if (!fromTime) { setError("From time is required"); return }
    if (!toTime) { setError("To time is required"); return }
    if (!isValidDriveLink(scriptLink)) { setError("A valid Google Drive link to the script is required"); return }
    setSaving(true); setError(null)
    const res = await moveScriptToShoot({
      content_item_id: item.id, shot_date: shotDate,
      shot_time_from: fromTime, shot_time_to: toTime, notes: notes.trim() || undefined,
      script_drive_link: scriptLink.trim(),
    })
    setSaving(false)
    if (!res.success || !res.shootId) { setError(res.error ?? "Failed to save"); return }
    onMoved({
      id: res.shootId,
      client: item.client_name,
      legacyTitle: item.title,
      start_time: `${shotDate}T${fromTime}:00`,
      end_time: `${shotDate}T${toTime}:00`,
      created_at: new Date().toISOString(),
      notes: notes.trim() || null,
      status: "scheduled",
      shoot_type: null,
      tags: [],
      source_content_item_id: item.id,
      drive_link: null,
      goingByUsers: [],
      titles: [],
    }, scriptLink.trim())
  }

  return (
    <Modal title="Move to Shoot" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <div>
          <label style={LABEL}>Shot Date *</label>
          <input type="date" style={FIELD} value={shotDate} onChange={e => setShotDate(e.target.value)} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div>
            <label style={LABEL}>From Time *</label>
            <input type="time" style={FIELD} value={fromTime} onChange={e => setFromTime(e.target.value)} />
          </div>
          <div>
            <label style={LABEL}>To Time *</label>
            <input type="time" style={FIELD} value={toTime} onChange={e => setToTime(e.target.value)} />
          </div>
        </div>
        <div>
          <label style={LABEL}>Script Drive Link *</label>
          <input type="url" style={FIELD} value={scriptLink} onChange={e => setScriptLink(e.target.value)}
            placeholder="https://docs.google.com/…" />
          {scriptLink.trim().length > 0 && !isValidDriveLink(scriptLink) && (
            <p style={{ fontSize: 11, color: "#DE1A1A", margin: "4px 0 0" }}>Must be a drive.google.com or docs.google.com link</p>
          )}
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

// ── Complete Shoot modal — captures the video titles that came out of the shoot ──
function CompleteShootModal({ shoot, members, currentUserId, onClose, onCompleted }: {
  shoot: Shoot
  members: Member[]
  currentUserId: string
  onClose: () => void
  onCompleted: (created: CreatedShootItem[], crew: Member[], driveLink: string) => void
}) {
  const [titleInput, setTitleInput] = useState("")
  const [titles, setTitles] = useState<string[]>([])
  // The footage's actual home — required so the edit team always has somewhere to pull
  // from without asking around. A plain URL isn't enough; it has to be Drive/Docs.
  const [driveLink, setDriveLink] = useState(shoot.drive_link ?? "")
  // Actual shoot time is re-entered here, at completion — it can run longer than
  // scheduled, and this is saved as the final/authoritative shoot time.
  const [fromTime, setFromTime] = useState(toISTTimeString(shoot.start_time) || "09:00")
  const [toTime, setToTime] = useState(toISTTimeString(shoot.end_time))
  // Crew is captured here, at completion — pre-filled from any crew already recorded
  // (e.g. backfilled via "Who went") so the common path is just "confirm".
  const [crew, setCrew] = useState<string[]>(() => {
    if (shoot.goingByUsers.length > 0) return shoot.goingByUsers.map(u => u.id)
    return members.some(m => m.id === currentUserId) ? [currentUserId] : []
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isLinked = !!shoot.source_content_item_id

  function addTitle() {
    const t = titleInput.trim()
    if (t && !titles.includes(t)) setTitles(prev => [...prev, t])
    setTitleInput("")
  }

  function toggleCrew(id: string) {
    setCrew(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  async function submit() {
    if (!isLinked && titles.length === 0) { setError("Add at least one video title"); return }
    if (!fromTime) { setError("Start time is required"); return }
    if (!toTime) { setError("End time is required"); return }
    if (!isValidDriveLink(driveLink)) { setError("A valid Google Drive link is required"); return }
    setSaving(true); setError(null)
    const res = await completeShootWithTitles(shoot.id, titles, crew, { from: fromTime, to: toTime }, driveLink.trim())
    setSaving(false)
    if (!res.success) { setError(res.error ?? "Failed to complete shoot"); return }
    onCompleted(res.createdItems ?? [], members.filter(m => crew.includes(m.id)), driveLink.trim())
  }

  return (
    <Modal title="Shoot Done" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <div>
          <label style={LABEL}>Video Titles {isLinked ? <span style={{ fontWeight: 600, textTransform: "none" }}>(optional — extra footage beyond the script itself)</span> : "*"}</label>
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
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div>
            <label style={LABEL}>Actual Start Time *</label>
            <input type="time" style={FIELD} value={fromTime} onChange={e => setFromTime(e.target.value)} />
          </div>
          <div>
            <label style={LABEL}>Actual End Time *</label>
            <input type="time" style={FIELD} value={toTime} onChange={e => setToTime(e.target.value)} />
          </div>
        </div>

        <div>
          <label style={LABEL}>Drive Link *</label>
          <input type="url" style={FIELD} value={driveLink} onChange={e => setDriveLink(e.target.value)}
            placeholder="https://drive.google.com/…" />
          {driveLink.trim().length > 0 && !isValidDriveLink(driveLink) && (
            <p style={{ fontSize: 11, color: "#DE1A1A", margin: "4px 0 0" }}>Must be a drive.google.com or docs.google.com link</p>
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
                    {on && <Check size={11} />} {upper(m.name)}{m.id === currentUserId ? " (me)" : ""}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {error && <p style={{ fontSize: 11, color: "#DE1A1A", margin: 0 }}>{error}</p>}
        <PrimaryButton onClick={submit} disabled={saving}>
          {saving ? "Saving…" : `Shoot Done${titles.length > 0 ? ` (${titles.length} video${titles.length > 1 ? "s" : ""})` : ""}`}
        </PrimaryButton>
      </div>
    </Modal>
  )
}

// ── Edit shoot details — client/title/date/time/notes/tags/crew, all in one save.
// Replaces the old separate "Edit shoot" + "Who went" modals for Scheduled shoots. ────────
function EditShootModal({ shoot, members, currentUserId, clients, pastClients, onClose, onSaved }: {
  shoot: Shoot
  members: Member[]
  currentUserId: string
  clients: { id: string; name: string }[]; pastClients: { id: string; name: string }[]
  onClose: () => void
  onSaved: (patch: { client: string; legacyTitle: string; start_time: string; notes: string | null; tags: ShootTag[]; crew: Member[] }) => void
}) {
  const { activeOptions: activeClientOptions, pastOptions: pastClientOptions } = useMemo(
    () => buildClientOptions(clients.map(c => c.name), pastClients.map(c => c.name)),
    [clients, pastClients]
  )
  const [client, setClient] = useState(shoot.client)
  const [title, setTitle] = useState(shoot.legacyTitle)
  const [shotDate, setShotDate] = useState(shoot.start_time.split("T")[0])
  const [fromTime, setFromTime] = useState(() => {
    const t = shoot.start_time.split("T")[1]
    return t ? t.slice(0, 5) : ""
  })
  const [toTime, setToTime] = useState(() => {
    const t = shoot.end_time?.split("T")[1]
    return t ? t.slice(0, 5) : ""
  })
  const [notes, setNotes] = useState(shoot.notes ?? "")
  const [tags, setTags] = useState<ShootTag[]>(shoot.tags)
  const [crew, setCrew] = useState<string[]>(shoot.goingByUsers.map(u => u.id))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function toggleTag(tag: ShootTag) {
    setTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag])
  }
  function toggleCrew(id: string) {
    setCrew(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  async function submit() {
    if (!client) { setError("Client is required"); return }
    if (!title.trim()) { setError("Shoot title is required"); return }
    if (!fromTime) { setError("From time is required"); return }
    if (!toTime) { setError("To time is required"); return }
    setSaving(true); setError(null)
    const [shootRes, crewRes] = await Promise.all([
      updateTrackerShoot(shoot.id, {
        client, title: title.trim(), shot_date: shotDate,
        shot_time_from: fromTime, shot_time_to: toTime, notes: notes.trim() || undefined, tags,
      }),
      updateShootCrew(shoot.id, crew),
    ])
    setSaving(false)
    if (!shootRes.success) { setError(shootRes.error ?? "Failed to save"); return }
    if (!crewRes.success) { setError(crewRes.error ?? "Failed to save crew"); return }
    onSaved({
      client,
      legacyTitle: title.trim(),
      start_time: `${shotDate}T${fromTime}:00`,
      notes: notes.trim() || null,
      tags,
      crew: members.filter(m => crew.includes(m.id)),
    })
  }

  return (
    <Modal title="Edit Details" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <ClientSelector clientOptions={activeClientOptions} pastClientOptions={pastClientOptions} value={client} onValueChange={setClient} required />
        <div>
          <label style={LABEL}>Shoot Title *</label>
          <input style={FIELD} value={title} onChange={e => setTitle(e.target.value)} />
        </div>
        <div>
          <label style={LABEL}>Schedule Date *</label>
          <input type="date" style={FIELD} value={shotDate} onChange={e => setShotDate(e.target.value)} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div>
            <label style={LABEL}>From Time *</label>
            <input type="time" style={FIELD} value={fromTime} onChange={e => setFromTime(e.target.value)} />
          </div>
          <div>
            <label style={LABEL}>To Time *</label>
            <input type="time" style={FIELD} value={toTime} onChange={e => setToTime(e.target.value)} />
          </div>
        </div>
        <div>
          <label style={LABEL}>Notes</label>
          <textarea style={{ ...FIELD, minHeight: 50, resize: "vertical" }} value={notes} onChange={e => setNotes(e.target.value)} />
        </div>
        <div>
          <label style={LABEL}>Tags</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {(Object.keys(SHOOT_TAG_CFG) as ShootTag[]).map(tag => {
              const cfg = SHOOT_TAG_CFG[tag]
              const on = tags.includes(tag)
              return (
                <button key={tag} type="button" onClick={() => toggleTag(tag)}
                  style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 10, border: `1.5px solid ${on ? cfg.color : "#E5E7EB"}`, background: on ? `${cfg.color}14` : "#fff", color: on ? cfg.color : "#6B7280", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                  {on && <Check size={11} />} {cfg.label}
                </button>
              )
            })}
          </div>
        </div>
        {members.length > 0 && (
          <div>
            <label style={LABEL}>Crew <span style={{ fontWeight: 600, textTransform: "none" }}>(pick one or more)</span></label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {members.map(m => {
                const on = crew.includes(m.id)
                return (
                  <button key={m.id} type="button" onClick={() => toggleCrew(m.id)}
                    style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 10, border: `1.5px solid ${on ? "#3B82F6" : "#E5E7EB"}`, background: on ? "rgba(59,130,246,0.08)" : "#fff", color: on ? "#3B82F6" : "#6B7280", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                    {on && <Check size={11} />} {upper(m.name)}{m.id === currentUserId ? " (me)" : ""}
                  </button>
                )
              })}
            </div>
          </div>
        )}
        {error && <p style={{ fontSize: 11, color: "#DE1A1A", margin: 0 }}>{error}</p>}
        <PrimaryButton onClick={submit} disabled={saving}>{saving ? "Saving…" : "Save Changes"}</PrimaryButton>
      </div>
    </Modal>
  )
}

// ── Edit Completed Shoot — everything captured at Mark Done, fixable after the fact: the
// client (kept in sync with the linked Ads Video item, if any), video titles (rename keeps
// the linked content_item's title in sync, add one that was missed), the actual shoot time,
// and who went. ──────────────────────────────────────
function EditCompletedShootModal({ shoot, members, currentUserId, clients, pastClients, onClose, onRenamed, onAdded, onTimeSaved, onCrewSaved, onClientSaved, onDriveLinkSaved, onTitleSaved }: {
  shoot: Shoot
  members: Member[]
  currentUserId: string
  clients: { id: string; name: string }[]; pastClients: { id: string; name: string }[]
  onClose: () => void
  onRenamed: (shootTitleId: string, newTitle: string) => void
  onAdded: (item: CreatedShootItem) => void
  onTimeSaved: (fromTime: string, toTime: string) => void
  onCrewSaved: (crew: Member[]) => void
  onClientSaved: (client: string) => void
  onDriveLinkSaved: (driveLink: string) => void
  onTitleSaved: (title: string) => void
}) {
  const { activeOptions: activeClientOptions, pastOptions: pastClientOptions } = useMemo(
    () => buildClientOptions(clients.map(c => c.name), pastClients.map(c => c.name)),
    [clients, pastClients]
  )
  const confirm = useConfirm()
  const [client, setClient] = useState(shoot.client)
  const [shootTitle, setShootTitle] = useState(shoot.legacyTitle)
  const [titleEdits, setTitleEdits] = useState<Record<string, string>>(
    () => Object.fromEntries(shoot.titles.map(t => [t.id, t.title]))
  )
  const [titles, setTitlesState] = useState(shoot.titles)
  const [newTitle, setNewTitle] = useState("")
  const [fromTime, setFromTime] = useState(toISTTimeString(shoot.start_time))
  const [toTime, setToTime] = useState(toISTTimeString(shoot.end_time))
  const [crew, setCrew] = useState<string[]>(shoot.goingByUsers.map(u => u.id))
  const [driveLink, setDriveLink] = useState(shoot.drive_link ?? "")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  // Everything above (Client, Video Title edits, Actual Shoot Time, Who Went, Drive Link)
  // is submitted together with this one button instead of a separate Save per field —
  // the per-field pattern meant re-editing several things meant clicking Save several
  // times with no single confirmation that it all went through.
  async function handleUpdateAll() {
    if (!client) { setError("Client is required"); return }
    if (!shootTitle.trim()) { setError("Shoot title is required"); return }
    if (!fromTime || !toTime) { setError("Both times are required"); return }
    if (!isValidDriveLink(driveLink)) { setError("A valid Google Drive link is required"); return }
    setSaving(true); setError(null)

    const renamed = titles.filter(t => (titleEdits[t.id] ?? t.title).trim() && titleEdits[t.id] !== t.title)
    const results = await Promise.all([
      updateTrackerShoot(shoot.id, {
        client, title: shootTitle.trim(), shot_date: shoot.start_time.split("T")[0],
        shot_time_from: toISTTimeString(shoot.start_time) || "00:00",
        shot_time_to: toISTTimeString(shoot.end_time) || "00:00",
        notes: shoot.notes ?? undefined,
      }),
      updateShootActualTime(shoot.id, fromTime, toTime),
      updateShootCrew(shoot.id, crew),
      updateShootDriveLink(shoot.id, driveLink.trim()),
      ...renamed.map(t => renameShootTitle(t.id, titleEdits[t.id].trim())),
    ])
    setSaving(false)

    const failed = results.find(r => !r.success)
    if (failed) { setError(failed.error ?? "Failed to save"); return }

    onClientSaved(client)
    onTitleSaved(shootTitle.trim())
    onTimeSaved(fromTime, toTime)
    onCrewSaved(members.filter(m => crew.includes(m.id)))
    onDriveLinkSaved(driveLink.trim())
    for (const t of renamed) onRenamed(t.id, titleEdits[t.id].trim())
    setTitlesState(prev => prev.map(t => renamed.some(r => r.id === t.id) ? { ...t, title: titleEdits[t.id].trim() } : t))
    setSuccessMsg("Shoot Updated Successfully")
  }

  async function addNew() {
    const title = newTitle.trim()
    if (!title) { setError("Title is required"); return }
    setSaving(true); setError(null)
    const res = await addShootTitle(shoot.id, title)
    setSaving(false)
    if (!res.success || !res.item) { setError(res.error ?? "Failed to save"); return }
    onAdded(res.item)
    setTitlesState(prev => [...prev, { id: res.item!.shoot_title_id, title: res.item!.title, content_item_id: res.item!.id }])
    setTitleEdits(prev => ({ ...prev, [res.item!.shoot_title_id]: res.item!.title }))
    setNewTitle("")
  }

  async function handleDeleteTitle(id: string, title: string) {
    if (!(await confirm({ title: "Delete this video?", message: `"${title}" and its record will be permanently removed. This cannot be undone.`, icon: "trash" }))) return
    setSaving(true); setError(null)
    const res = await deleteShootTitle(id)
    setSaving(false)
    if (!res.success) { setError(res.error ?? "Failed to delete"); return }
    setTitlesState(prev => prev.filter(t => t.id !== id))
    setTitleEdits(prev => { const next = { ...prev }; delete next[id]; return next })
  }

  function toggleCrew(id: string) {
    setCrew(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  return (
    <>
      <Modal title="Edit Completed Shoot" onClose={onClose}>
        <div className="flex flex-col gap-3">
          <div>
            <label style={LABEL}>Shoot Title *</label>
            <input style={FIELD} value={shootTitle} onChange={e => setShootTitle(e.target.value)} />
          </div>
          <div>
            <label style={LABEL}>Client</label>
            <ClientSelector clientOptions={activeClientOptions} pastClientOptions={pastClientOptions} value={client} onValueChange={setClient} required />
            {shoot.source_content_item_id && (
              <p style={{ fontSize: 10, color: "#9CA3AF", margin: "4px 0 0" }}>
                This shoot came from an Ads Video script — saving also corrects that script&apos;s client.
              </p>
            )}
          </div>
          <div>
            <label style={LABEL}>Video Titles</label>
            <div className="flex flex-col gap-2">
              {titles.length === 0 && (
                <p style={{ fontSize: 11, color: "#9CA3AF", margin: 0 }}>No videos recorded for this shoot yet.</p>
              )}
              {titles.map(t => (
                <div key={t.id} style={{ display: "flex", gap: 8 }}>
                  <input style={{ ...FIELD, flex: 1 }} value={titleEdits[t.id] ?? t.title}
                    onChange={e => setTitleEdits(prev => ({ ...prev, [t.id]: e.target.value }))} />
                  <button type="button" onClick={() => handleDeleteTitle(t.id, titleEdits[t.id] ?? t.title)} disabled={saving}
                    title="Delete this video"
                    style={{ padding: "8px 10px", borderRadius: 10, border: "1.5px solid #FEE2E2", background: "#FEF2F2", color: "#DC2626", cursor: saving ? "default" : "pointer", flexShrink: 0 }}>
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
          </div>
          <div>
            <label style={LABEL}>Add a Video <span style={{ fontWeight: 600, textTransform: "none" }}>(missed at completion)</span></label>
            <div style={{ display: "flex", gap: 8 }}>
              <input style={FIELD} value={newTitle} onChange={e => setNewTitle(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addNew() } }}
                placeholder="e.g. Extra Behind the Scenes" />
              <button type="button" onClick={addNew} disabled={saving}
                style={{ padding: "8px 14px", borderRadius: 10, border: "none", background: "#DE1A1A", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}>
                Add
              </button>
            </div>
          </div>

          <div style={{ borderTop: "1px solid #F3F4F6", paddingTop: 12 }}>
            <label style={LABEL}>Actual Shoot Time</label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <input type="time" style={FIELD} value={fromTime} onChange={e => setFromTime(e.target.value)} />
              <input type="time" style={FIELD} value={toTime} onChange={e => setToTime(e.target.value)} />
            </div>
          </div>

          <div style={{ borderTop: "1px solid #F3F4F6", paddingTop: 12 }}>
            <label style={LABEL}>Drive Link *</label>
            <input type="url" style={FIELD} value={driveLink} onChange={e => setDriveLink(e.target.value)}
              placeholder="https://drive.google.com/…" />
            {driveLink.trim().length > 0 && !isValidDriveLink(driveLink) && (
              <p style={{ fontSize: 11, color: "#DE1A1A", margin: "4px 0 0" }}>Must be a drive.google.com or docs.google.com link</p>
            )}
          </div>

          <div style={{ borderTop: "1px solid #F3F4F6", paddingTop: 12 }}>
            <label style={LABEL}>Who Went? <span style={{ fontWeight: 600, textTransform: "none" }}>(pick one or more)</span></label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {members.map(m => {
                const on = crew.includes(m.id)
                return (
                  <button key={m.id} type="button" onClick={() => toggleCrew(m.id)}
                    style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 10, border: `1.5px solid ${on ? "#3B82F6" : "#E5E7EB"}`, background: on ? "rgba(59,130,246,0.08)" : "#fff", color: on ? "#3B82F6" : "#6B7280", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                    {on && <Check size={11} />} {upper(m.name)}{m.id === currentUserId ? " (me)" : ""}
                  </button>
                )
              })}
            </div>
          </div>

          {error && <p style={{ fontSize: 11, color: "#DE1A1A", margin: 0 }}>{error}</p>}

          <button type="button" onClick={handleUpdateAll} disabled={saving}
            style={{ width: "100%", padding: "12px 16px", borderRadius: 12, border: "none", marginTop: 4,
              background: saving ? "#E5E7EB" : "linear-gradient(135deg,#22C55E,#15803D)",
              color: saving ? "#9CA3AF" : "#fff", fontSize: 13, fontWeight: 800, cursor: saving ? "not-allowed" : "pointer" }}>
            {saving ? "Updating…" : "Update Shoot"}
          </button>
        </div>
      </Modal>
      {successMsg && <SuccessFlash message={successMsg} onDone={() => setSuccessMsg(null)} />}
    </>
  )
}

// ── Delete shoot — choose whether the videos it produced go with it ─────────
function DeleteShootModal({ shoot, onClose, onConfirm }: {
  shoot: Shoot
  onClose: () => void
  onConfirm: (cascadeVideos: boolean) => void
}) {
  const videoCount = shoot.titles.length
  return (
    <Modal title="Delete Shoot?" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <p style={{ fontSize: 13, color: "#6B7280", margin: 0, lineHeight: 1.5 }}>
          This shoot produced {videoCount} video{videoCount === 1 ? "" : "s"}. Choose what happens to {videoCount === 1 ? "it" : "them"}.
        </p>
        <button onClick={() => onConfirm(false)}
          style={{ width: "100%", padding: "10px 16px", borderRadius: 12, border: "1.5px solid #E5E7EB", background: "#fff", color: "#111827", fontSize: 13, fontWeight: 800, cursor: "pointer" }}>
          Delete shoot only — keep video{videoCount === 1 ? "" : "s"} in Pipeline
        </button>
        <PrimaryButton onClick={() => onConfirm(true)}>
          Delete shoot + {videoCount} video{videoCount === 1 ? "" : "s"}
        </PrimaryButton>
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
export default function MediaTrackerClient({ initialItems, initialAds, initialShoots, members, currentUserId, clients, pastClients, voiceoverFreelancers, scriptingMembers, editingMembers, shootingMembers, voiceoverMembers, initialClientTargets }: Props) {
  const [items, setItems] = useState(initialItems)
  const [ads, setAds] = useState(initialAds)
  const [shoots, setShoots] = useState(initialShoots)
  const [clientTargets, setClientTargets] = useState(initialClientTargets)
  // Voice Over is pickable from two rosters — media-tagged staff and the Freelance RJ
  // Voiceover team — combined into one list for the picker.
  const voiceoverOptions = useMemo(
    () => [...voiceoverMembers, ...voiceoverFreelancers].sort((a, b) => a.name.localeCompare(b.name)),
    [voiceoverMembers, voiceoverFreelancers]
  )
  // Top-level mode (Video / Poster / Ads) with sub-tabs beneath it. Posters aren't shot,
  // so the Shoots sub-tab only exists in Video mode.
  const [mode, setMode] = useState<TrackerMode>("overview")
  const [subTab, setSubTab] = useState<"shoots" | "adsvideo" | "pipeline" | "log" | "adlog">("shoots")
  // Schedule mode's own sub-tab axis — kept separate from `subTab` (rather than widening
  // its union) so switching back to Video/Poster mode never leaves `subTab` on a
  // Schedule-only key that matches none of those modes' render conditions.
  const [scheduleSubTab, setScheduleSubTab] = useState<"shoot" | "video" | "poster" | "ads">("shoot")
  // Derived rather than reset via an effect — avoids a cascading-render setState-in-effect.
  // Posters have neither Shoots nor Ads Video, so both fall back to Pipeline.
  const tab = mode === "poster" && (subTab === "shoots" || subTab === "adsvideo") ? "pipeline" : subTab
  // Overview and Ads have no content type of their own; falling back to "video" keeps the
  // Pipeline/Log memos below well-defined even while those boards aren't rendered.
  const contentTypeForMode: "video" | "poster" = mode === "poster" ? "poster" : "video"
  const [, startTransition] = useTransition()
  const confirm = useConfirm()

  const [dragId, setDragId] = useState<string | null>(null)
  const [overCol, setOverCol] = useState<string | null>(null)
  const [showNewContent, setShowNewContent] = useState(false)
  const [platformModalItem, setPlatformModalItem] = useState<ContentItem | null>(null)
  // Which button opened the platform picker — filters which platforms it offers and which
  // flag (posted_branding vs posted_ads) the resulting post ends up counted under.
  const [platformModalKind, setPlatformModalKind] = useState<"branding" | "ads">("branding")
  const [editingItem, setEditingItem] = useState<ContentItem | null>(null)
  const [showNewAd, setShowNewAd] = useState(false)
  const [revisionModalAd, setRevisionModalAd] = useState<Ad | null>(null)
  const [performanceModalAd, setPerformanceModalAd] = useState<Ad | null>(null)
  const [adsClientFilter, setAdsClientFilter] = useState<string>("all")
  const [adsSearch, setAdsSearch] = useState("")
  const [showNewShoot, setShowNewShoot] = useState(false)
  const [completeShootFor, setCompleteShootFor] = useState<Shoot | null>(null)
  const [markEditedItem, setMarkEditedItem] = useState<ContentItem | null>(null)
  const [assignEditorItem, setAssignEditorItem] = useState<ContentItem | null>(null)
  const [voiceOverItem, setVoiceOverItem] = useState<ContentItem | null>(null)
  const [moveToShootFor, setMoveToShootFor] = useState<ContentItem | null>(null)
  const [moveOnReviewFor, setMoveOnReviewFor] = useState<ContentItem | null>(null)
  // The Schedule button on a Branding/Ads Ready card — moves only the posting date, unlike
  // the full Edit dialog it replaces for this one job.
  const [scheduleFor, setScheduleFor] = useState<ContentItem | null>(null)
  // The direct "Cancel" menu action (Ready to Edit/Design/Scripting/Voice Over cards, and
  // dragging any card straight into the Cancelled column) — same "who caused it" prompt as
  // the On Review Move modal's Cancelled branch, just reached from a shorter path.
  const [cancelReasonFor, setCancelReasonFor] = useState<ContentItem | null>(null)
  const [editShootFor, setEditShootFor] = useState<Shoot | null>(null)
  const [editCompletedShootFor, setEditCompletedShootFor] = useState<Shoot | null>(null)
  // Scheduled -> Edit Shoot (basic details), Completed -> Edit Completed Shoot (the video
  // titles list) — each stage edits only what was actually captured there.
  function handleEditShoot(shoot: Shoot) {
    if (shoot.status === "completed") { setEditCompletedShootFor(shoot); return }
    setEditShootFor(shoot)
  }
  const [deleteShootFor, setDeleteShootFor] = useState<Shoot | null>(null)
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
  const [editVoiceOverFor, setEditVoiceOverFor] = useState<ContentItem | null>(null)
  // Scripting -> Edit Script, Voice Over -> Edit Voice Over — each stage edits only what
  // was actually captured there, instead of one generic form for both.
  function handleEditAdsItem(item: ContentItem) {
    if (item.status === "voiceover") { setEditVoiceOverFor(item); return }
    setEditAdsVideoFor(item)
  }
  const [adDragId, setAdDragId] = useState<string | null>(null)
  const [adOverCol, setAdOverCol] = useState<string | null>(null)
  const [activeAdCol, setActiveAdCol] = useState<AdStatus>("active")
  const [expandedAd, setExpandedAd] = useState<string | null>(null)
  const [logSearch, setLogSearch] = useState("")
  const [logPlatformFilter, setLogPlatformFilter] = useState<Platform | "all">("all")
  const [logClientFilter, setLogClientFilter] = useState<string>("all")
  const [logMonthFilter, setLogMonthFilter] = useState<string>("all")
  // Overview/Shooting/Ads Video default to the CURRENT month, not All Time — Ready to
  // Edit (pipelineMonthFilter below) is the one deliberate exception, left on "all"
  // (confirmed 2026-07-30).
  const [overviewKpiMonth, setOverviewKpiMonth] = useState<string>(todayIST().slice(0, 7))
  const [overviewKpiContentType, setOverviewKpiContentType] = useState<"video" | "poster">("video")
  const [logDayFilter, setLogDayFilter] = useState("")
  const [pipelineDayFilter, setPipelineDayFilter] = useState("")
  const [shootsMonthFilter, setShootsMonthFilter] = useState<string>(todayIST().slice(0, 7))
  const [shootsDayFilter, setShootsDayFilter] = useState("")
  const [adsMonthFilter, setAdsMonthFilter] = useState<string>("all")
  const [adsDayFilter, setAdsDayFilter] = useState("")
  const [adsVideoSearch, setAdsVideoSearch] = useState("")
  const [adsVideoClientFilter, setAdsVideoClientFilter] = useState<string>("all")
  const [adsVideoMonthFilter, setAdsVideoMonthFilter] = useState<string>(todayIST().slice(0, 7))
  const [adsVideoDayFilter, setAdsVideoDayFilter] = useState("")
  const [pipelineClientFilter, setPipelineClientFilter] = useState<string>("all")
  // Ready to Edit stays "all" (All Time) — deliberately the one exception to the
  // current-month default above (confirmed 2026-07-30).
  const [pipelineMonthFilter, setPipelineMonthFilter] = useState<string>("all")
  const [activeMobileCol, setActiveMobileCol] = useState<ContentStatus>("ready_to_edit")
  // Scopes the Overview's stage-count blocks by creation date. Defaults to the current
  // month (see note above) — Needs Attention and the posting tiles never look at this.
  const [overviewRangeMode, setOverviewRangeMode] = useState<"all" | "week" | "month" | "custom">("month")
  const [overviewMonth, setOverviewMonth] = useState<string>(todayIST().slice(0, 7))
  const [overviewCustomFrom, setOverviewCustomFrom] = useState("")
  const [overviewCustomTo, setOverviewCustomTo] = useState("")

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
      // Ads Video items never get a shot_date — without this they'd have no month
      // bucket at all and would vanish from every day/month-filtered view.
      if (i.source === "ads_video" && !i.shot_date) {
        months.add((i.voiceover_date ?? i.created_at).slice(0, 7))
      }
    }
    return Array.from(months).sort().reverse()
  }, [items])

  // The item's own "current stage" date — pre-Edited by shot date, edited by edited
  // date, posted by its (latest) post date. Month and day filters both key off this.
  function itemStageDate(item: ContentItem): string | null {
    if (item.status === "posted") {
      const dates = item.posts.map(p => p.posted_date).sort()
      return dates.length ? dates[dates.length - 1] : null
    }
    if (item.status === "on_review" || item.status === "branding_ready" || item.status === "ads_ready") return item.edited_date
    // Ads Video items have no shot_date — fall back to when voice-over was recorded,
    // or creation date, so a day/month filter doesn't silently hide them.
    return item.shot_date ?? item.voiceover_date ?? item.created_at.slice(0, 10)
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

  // A Scripting item that's been sent to a shoot (Move to Shoot) still has status
  // "scripting" until that shoot completes — this id set is how the board tells "still
  // deciding" scripting apart from "already sent to a shoot" scripting.
  const shootLinkedItemIds = useMemo(
    () => new Set(shoots.filter(s => s.source_content_item_id).map(s => s.source_content_item_id!)),
    [shoots]
  )
  const adsVideoFilter = useCallback((i: ContentItem) => {
    if (adsVideoClientFilter !== "all" && i.client_name !== adsVideoClientFilter) return false
    if (adsVideoSearch && !`${i.title} ${i.client_name}`.toLowerCase().includes(adsVideoSearch.toLowerCase())) return false
    const d = originDate(i)
    if (adsVideoDayFilter) return d === adsVideoDayFilter
    if (adsVideoMonthFilter !== "all" && d?.slice(0, 7) !== adsVideoMonthFilter) return false
    return true
  }, [adsVideoClientFilter, adsVideoSearch, adsVideoDayFilter, adsVideoMonthFilter])
  const adsVideoItems = useMemo(
    () => items.filter(i => i.content_type === "video" && i.source === "ads_video" && ADS_VIDEO_ORDER.includes(i.status)
      && !(i.status === "scripting" && shootLinkedItemIds.has(i.id)) && adsVideoFilter(i)),
    [items, shootLinkedItemIds, adsVideoFilter]
  )
  function adsVideoColItems(status: ContentStatus) { return adsVideoItems.filter(i => i.status === status) }
  const adsVideoMonthOptions = useMemo(
    () => Array.from(new Set(
      items.filter(i => i.content_type === "video" && i.source === "ads_video").map(i => originDate(i)?.slice(0, 7)).filter(Boolean) as string[]
    )).sort().reverse(),
    [items]
  )
  // The Ads Video sub-flow's own work is done once a script has been sent to a shoot, or a
  // voice-over has moved on to Ready to Edit (or beyond) — shown as a 3rd, read-only column.
  const adsVideoCompletedItems = useMemo(
    () => items.filter(i => i.content_type === "video" && i.source === "ads_video" && i.status !== "cancelled" && (
      (i.status === "scripting" && shootLinkedItemIds.has(i.id)) || (i.status !== "scripting" && i.status !== "voiceover")
    ) && adsVideoFilter(i)),
    [items, shootLinkedItemIds, adsVideoFilter]
  )

  function advance(item: ContentItem, next: ContentStatus) {
    // Entering Editing from Ready to Edit/Design asks who's taking it on — the assignment
    // moment, before any actual edit/design work exists to record. Not asked again on an
    // undo move back from Completed Edit (item.status === "on_review") — that's a revert,
    // not a fresh hand-off.
    if (next === "edited" && (item.status === "ready_to_edit" || item.status === "design") && members.length > 0) { setAssignEditorItem(item); return }
    // Reaching On Review (Completed Edit) asks who edited it — the accountability moment,
    // asked at the Edited -> Completed Edit move. Not asked again on an undo move back
    // from Branding/Ads Ready — that's not a fresh edit, just reverting an approval.
    if (next === "on_review" && item.status === "edited" && members.length > 0) { setMarkEditedItem(item); return }
    // Reaching Branding/Ads Ready asks nothing — a drag onto either column is already an
    // unambiguous approval, and the posting date is a separate later decision made with the
    // Schedule button on the card. Falls through to the generic move below.
    // Entering Voice Over asks who recorded it.
    if (next === "voiceover") { setVoiceOverItem(item); return }
    // Cancelling (menu action or a direct drag into the Cancelled column) asks who caused it,
    // same accountability the On Review Move modal's Cancelled branch already captures.
    if (next === "cancelled") { setCancelReasonFor(item); return }
    const previous = item.status
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: next, ...(next === "on_review" ? { edited_date: todayIST() } : {}) } : i))
    startTransition(async () => {
      const res = await updateContentItemStatus(item.id, next)
      if (!res.success) {
        setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: previous } : i))
        alert(res.error ?? `Failed to move to ${STATUS_CFG[next].label}`)
      }
    })
  }

  // Shared by both cancellation paths: the On Review Move modal's Cancelled branch, and the
  // direct Cancel menu action / drag-to-Cancelled from every other stage.
  function handleCancelConfirmed(item: ContentItem, cancelledBy: CancelledBy) {
    const previous = item.status
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: "cancelled", cancelled_by: cancelledBy } : i))
    setMoveOnReviewFor(null)
    setCancelReasonFor(null)
    startTransition(async () => {
      const res = await updateContentItemStatus(item.id, "cancelled", undefined, cancelledBy)
      if (!res.success) {
        setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: previous, cancelled_by: null } : i))
        alert(res.error ?? "Failed to cancel")
      }
    })
  }

  // Approving out of review, and nothing else — the item lands in Branding/Ads Ready with
  // no posting date, and gets one later from the Schedule button on its card.
  function handleMoveToPostingStage(item: ContentItem, next: "branding_ready" | "ads_ready") {
    const previous = item.status
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: next } : i))
    setMoveOnReviewFor(null)
    startTransition(async () => {
      const res = await updateContentItemStatus(item.id, next)
      if (!res.success) {
        setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: previous } : i))
        alert(res.error ?? `Failed to move to ${STATUS_CFG[next].label}`)
      }
    })
  }

  // Moving the date only — the status never changes here, which is the whole difference
  // between this and handleMoveToPostingStage above. Optimistic so the card's date badge
  // updates on click, rolled back to the previous date if the save fails.
  function handleReschedule(item: ContentItem, date: string) {
    const previousDate = item.scheduled_post_date
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, scheduled_post_date: date } : i))
    setScheduleFor(null)
    startTransition(async () => {
      const res = await rescheduleContentItem({ content_item_id: item.id, scheduled_post_date: date })
      if (!res.success) {
        setItems(prev => prev.map(i => i.id === item.id ? { ...i, scheduled_post_date: previousDate } : i))
        alert(res.error ?? "Failed to save schedule")
      }
    })
  }

  function handleAssignEditor(item: ContentItem, editorId: string, editorName: string) {
    const previous = item.status
    setItems(prev => prev.map(i => i.id === item.id
      ? { ...i, status: "edited", editedByUser: { id: editorId, name: editorName } }
      : i))
    setAssignEditorItem(null)
    startTransition(async () => {
      const res = await updateContentItemStatus(item.id, "edited", editorId)
      if (!res.success) {
        setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: previous, editedByUser: item.editedByUser } : i))
        alert(res.error ?? "Failed to move to Editing")
      }
    })
  }

  function handleMarkEdited(item: ContentItem, editorId: string, editorName: string, editedDate: string, driveLink: string) {
    const previous = item.status
    setItems(prev => prev.map(i => i.id === item.id
      ? { ...i, status: "on_review", edited_date: editedDate, edited_drive_link: driveLink, editedByUser: { id: editorId, name: editorName } }
      : i))
    setMarkEditedItem(null)
    startTransition(async () => {
      const res = await updateContentItemStatus(item.id, "on_review", editorId, undefined, editedDate, driveLink)
      if (!res.success) {
        setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: previous, edited_drive_link: item.edited_drive_link } : i))
        alert(res.error ?? "Failed to mark edited")
      }
    })
  }

  function handleVoiceOverRecorded(item: ContentItem, voiceoverBy: VoiceFreelancer, date: string, scriptLink: string) {
    setItems(prev => prev.map(i => i.id === item.id
      ? { ...i, status: "voiceover", voiceoverBy, voiceover_date: date, script_drive_link: scriptLink }
      : i))
    setVoiceOverItem(null)
  }

  function handleDeleteItem(id: string) {
    // A video that came out of a shoot is also listed on that shoot's video-titles list —
    // warn here so a delete from either side doesn't silently orphan the other.
    const linkedShoot = shoots.find(s => s.titles.some(t => t.content_item_id === id))
    const message = linkedShoot
      ? `This video is linked to the shoot "${linkedShoot.legacyTitle}" — deleting it will also remove it from that shoot's video list. This cannot be undone.`
      : "This cannot be undone."
    confirm({ title: "Delete this item?", message, icon: "trash" }).then(ok => {
      if (!ok) return
      setItems(prev => prev.filter(i => i.id !== id))
      setShoots(prev => prev.map(s => ({ ...s, titles: s.titles.filter(t => t.content_item_id !== id) })))
      startTransition(async () => { await deleteContentItem(id) })
    })
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

  const today = todayIST()

  // Distinct creation months across everything Overview counts — independent of
  // allMonthOptions above, which keys off shot/edited/posted dates, not created_at.
  const overviewMonthOptions = useMemo(() => {
    const months = new Set<string>()
    for (const i of items) months.add(i.created_at.slice(0, 7))
    for (const s of shoots) months.add(s.created_at.slice(0, 7))
    for (const a of ads) months.add(a.created_at.slice(0, 7))
    return Array.from(months).sort().reverse()
  }, [items, shoots, ads])

  // "This Week" is the calendar week (Mon-Sun) containing today, not a rolling 7 days —
  // reads more naturally for a "what came in this week" reporting filter.
  const overviewRange = useMemo((): { from: string; to: string } | null => {
    if (overviewRangeMode === "all") return null
    if (overviewRangeMode === "week") {
      const d = new Date(today + "T00:00:00Z")
      const dow = d.getUTCDay() // 0=Sun..6=Sat
      const mondayOffset = dow === 0 ? -6 : 1 - dow
      const monday = new Date(d)
      monday.setUTCDate(d.getUTCDate() + mondayOffset)
      const sunday = new Date(monday)
      sunday.setUTCDate(monday.getUTCDate() + 6)
      return { from: monday.toISOString().split("T")[0], to: sunday.toISOString().split("T")[0] }
    }
    if (overviewRangeMode === "month") {
      if (overviewMonth === "all") return null
      const [y, m] = overviewMonth.split("-").map(Number)
      const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate()
      return { from: `${overviewMonth}-01`, to: `${overviewMonth}-${String(lastDay).padStart(2, "0")}` }
    }
    if (overviewCustomFrom && overviewCustomTo) return { from: overviewCustomFrom, to: overviewCustomTo }
    return null
  }, [overviewRangeMode, overviewMonth, overviewCustomFrom, overviewCustomTo, today])

  // Stats — global totals, always unfiltered (shown in the hero chips)
  // Nav badges. Modes count live work (anything not yet posted / ads still running);
  // sections count what you'd actually find on that board for the current mode.
  // Overview's badge is the count of things actually needing action — it's the number you'd
  // want to see without opening the tab.
  const overview = useMemo(
    () => computeOverview({
      items, shoots, ads,
      today,
      range: overviewRange,
    }),
    [items, shoots, ads, today, overviewRange]
  )

  const navCounts = useMemo(() => ({
    overview: overview.attention.reduce((sum, a) => sum + a.count, 0),
    video: items.filter(i => i.content_type === "video" && i.status !== "posted" && i.status !== "cancelled").length,
    poster: items.filter(i => i.content_type === "poster" && i.status !== "posted" && i.status !== "cancelled").length,
    schedule: shoots.filter(s => s.status === "scheduled").length
      + items.filter(i => (i.status === "branding_ready" || i.status === "ads_ready") && !!i.scheduled_post_date).length,
    ads: ads.filter(a => a.status === "active").length,
  }), [items, shoots, ads, overview])

  const navSections = useMemo(() => {
    if (mode === "schedule") {
      const scheduledContent = items.filter(i => (i.status === "branding_ready" || i.status === "ads_ready") && i.scheduled_post_date)
      return [
        { key: "shoot", label: "Shoot", icon: Camera, count: shoots.filter(s => s.status === "scheduled").length },
        { key: "video", label: "Video", icon: Video, count: scheduledContent.filter(i => i.content_type === "video").length },
        { key: "poster", label: "Poster", icon: ImageIcon, count: scheduledContent.filter(i => i.content_type === "poster").length },
        { key: "ads", label: "Ads", icon: Megaphone, count: scheduledContent.filter(i => i.status === "ads_ready").length },
      ]
    }
    if (mode === "ads" || mode === "overview") return []
    const ofMode = items.filter(i => i.content_type === contentTypeForMode)
    // Excludes scripting items already sent to a shoot — those are done as far as this
    // sub-flow is concerned, so they don't count as "still active" here.
    const activeAdsVideo = items.filter(i => i.content_type === "video" && i.source === "ads_video"
      && (i.status === "voiceover" || (i.status === "scripting" && !shootLinkedItemIds.has(i.id))))
    return [
      ...(mode === "video"
        ? [{ key: "shoots", label: "Shoots", icon: Camera, count: shoots.filter(s => s.status === "scheduled").length }]
        : []),
      ...(mode === "video"
        ? [{ key: "adsvideo", label: "Ads Video", icon: Sparkles, count: activeAdsVideo.length }]
        : []),
      { key: "pipeline", label: "Ready to Edit", icon: Layers, count: ofMode.filter(i => pipelineOrder.includes(i.status) && i.status !== "cancelled").length },
      { key: "log", label: "Branding", icon: History, count: ofMode.filter(i => i.posted_branding).length },
      { key: "adlog", label: "Advertisement", icon: Megaphone, count: ofMode.filter(i => i.posted_ads).length },
    ]
  }, [mode, items, shoots, contentTypeForMode, pipelineOrder, shootLinkedItemIds])

  // Schedule tab — one ScheduleEntry per pending shoot/scheduled post, so its four
  // sub-tabs are just filtered/mapped views over the same shoots/items already loaded
  // for the rest of the tracker. Nothing here is fetched separately, and every action
  // calls a handler that already exists elsewhere in this file.
  const scheduleShootEntries: ScheduleEntry[] = useMemo(() => shoots
    .filter(s => s.status === "scheduled")
    .map(s => {
      const date = s.start_time.split("T")[0]
      return {
        id: s.id,
        date,
        time: toISTTimeString(s.start_time) || null,
        title: s.legacyTitle,
        client: s.client,
        accent: SHOOT_STATUS_CFG.scheduled.color,
        overdue: date < today,
        actions: [
          { label: "Shoot Done", onClick: () => handleShootStatus(s.id, "completed") },
          { label: "Cancel", onClick: () => handleShootStatus(s.id, "cancelled"), danger: true },
        ],
      }
    }), [shoots, today])

  const scheduledContentItems = useMemo(
    () => items.filter(i => (i.status === "branding_ready" || i.status === "ads_ready") && i.scheduled_post_date),
    [items]
  )
  function toScheduleEntry(i: ContentItem): ScheduleEntry {
    return {
      id: i.id,
      date: i.scheduled_post_date!,
      time: i.scheduled_post_time,
      title: i.title,
      client: i.client_name,
      accent: STATUS_CFG[i.status].accent,
      overdue: i.scheduled_post_date! < today,
      actions: [
        { label: "Mark Posted", onClick: () => { setPlatformModalKind(i.status === "ads_ready" ? "ads" : "branding"); setPlatformModalItem(i) } },
        { label: "Reschedule", onClick: () => setEditingItem(i) },
      ],
    }
  }
  const scheduleVideoEntries: ScheduleEntry[] = useMemo(
    () => scheduledContentItems.filter(i => i.content_type === "video").map(toScheduleEntry),
    [scheduledContentItems, today, toScheduleEntry]
  )
  const schedulePosterEntries: ScheduleEntry[] = useMemo(
    () => scheduledContentItems.filter(i => i.content_type === "poster").map(toScheduleEntry),
    [scheduledContentItems, today, toScheduleEntry]
  )
  const scheduleAdsEntries: ScheduleEntry[] = useMemo(
    () => scheduledContentItems.filter(i => i.status === "ads_ready").map(toScheduleEntry),
    [scheduledContentItems, today, toScheduleEntry]
  )
  const activeScheduleEntries: ScheduleEntry[] =
    scheduleSubTab === "shoot" ? scheduleShootEntries
    : scheduleSubTab === "video" ? scheduleVideoEntries
    : scheduleSubTab === "poster" ? schedulePosterEntries
    : scheduleAdsEntries

  const stats = useMemo(() => {
    const readyToEdit = items.filter(i => i.status === "ready_to_edit").length
    const edited = items.filter(i => i.status === "edited").length
    // Renamed from the old "edited" meaning (this table used to treat on_review as the
    // edited/reviewed checkpoint, before Edited became its own real stage).
    const completedEdit = items.filter(i => i.status === "on_review").length
    const readyToPost = items.filter(i => i.status === "branding_ready" || i.status === "ads_ready").length
    const posted = items.filter(i => i.status === "posted").length
    const totalPosts = items.reduce((s, i) => s + i.posts.length, 0)
    return { readyToEdit, edited, completedEdit, readyToPost, posted, totalPosts }
  }, [items])

  // Branding and Advertisement are the same board shape, split by which of the two
  // independent flags they track — Branding tab -&gt; posted_branding, Advertisement tab -&gt;
  // posted_ads. An item can appear in BOTH tabs' "ready" queue at once (e.g. branding-posted
  // already but still awaiting its ads post).
  const logKind: "branding" | "ads" = tab === "adlog" ? "ads" : "branding"
  const isDoneForKind = (i: ContentItem) => logKind === "branding" ? i.posted_branding : i.posted_ads

  // The "waiting to post" queue — items sitting in this kind's Ready lane, oldest first.
  // Respects the client filter, but deliberately NOT the month filter: this is a live
  // "what's pending right now" list, not a historical record, so an item edited last
  // month that's still unposted today must keep showing up — picking a month to look at
  // stats for shouldn't make genuinely-still-waiting work disappear from the queue.
  const readyQueue = useMemo(
    () => items
      .filter(i => i.status === (logKind === "ads" ? "ads_ready" : "branding_ready") && i.content_type === contentTypeForMode)
      .filter(i => logClientFilter === "all" || i.client_name === logClientFilter)
      .sort((a, b) => (a.edited_date ?? a.created_at).localeCompare(b.edited_date ?? b.created_at)),
    [items, contentTypeForMode, logKind, logClientFilter]
  )

  // Posting log — one row per content item (not per platform); platforms shown as badges within the row
  const postedItems = useMemo(
    () => items.filter(i => isDoneForKind(i) && i.content_type === contentTypeForMode),
    [items, contentTypeForMode, logKind]
  )
  const logClientOptions = allClientOptions
  const logMonthOptions = allMonthOptions
  // Branding only ever posts to organic platforms, Ads only to ad destinations — no point
  // offering the other kind's platforms in this filter row.
  const logPlatformOptions = useMemo(
    () => SELECTABLE_PLATFORMS.filter(p => logKind === "ads" ? (ADS_PLATFORM_SET.has(p) || p === "other") : !ADS_PLATFORM_SET.has(p)),
    [logKind]
  )

  // Per-client KPI tables live on Overview now (see overviewBrandingKPIs/overviewAdsKPIs
  // below) — not scoped to a single content type or tab, so they show the full picture.
  // primaryOnly=true: Overview is business analytics, so a dual-posted item is credited to
  // its origin only, matching overviewUniquePosted below (not shown in both tables at once).
  const overviewBrandingKPIs = useMemo(() => buildClientKPIs(items, "branding", overviewKpiMonth, overviewKpiContentType, true), [items, overviewKpiMonth, overviewKpiContentType])
  const overviewAdsKPIs = useMemo(() => buildClientKPIs(items, "ads", overviewKpiMonth, overviewKpiContentType, true), [items, overviewKpiMonth, overviewKpiContentType])
  const overviewUniquePosted = useMemo(() => countUniquePosted(items, overviewKpiMonth, overviewKpiContentType), [items, overviewKpiMonth, overviewKpiContentType])

  // The per-client stats box next to Waiting to Post — only meaningful once a single
  // client is picked (an "all clients" mash-up of targets makes no sense here), so this
  // is null on "all" and the box simply doesn't render.
  const logClientStats = useMemo(() => {
    if (logClientFilter === "all") return null
    const kpiRow = buildClientKPIs(items, logKind, logMonthFilter, contentTypeForMode)
      .find(r => r.client === logClientFilter)
    const edited = items.filter(i =>
      i.client_name === logClientFilter && i.content_type === contentTypeForMode &&
      i.edited_date && (logMonthFilter === "all" || i.edited_date.slice(0, 7) === logMonthFilter)
    ).length
    // Target is a monthly figure — "All Time" falls back to the current month (same as
    // the Overview tab's Per-Client KPIs table) instead of going blank.
    const targetMonth = logMonthFilter === "all" ? today.slice(0, 7) : logMonthFilter
    const targetRow = clientTargets.find(
      t => t.client_name === logClientFilter && t.kind === logKind && t.content_type === contentTypeForMode && t.month === targetMonth
    )
    const posted = kpiRow?.posted ?? 0
    const target = targetRow?.target ?? 0
    // Not scoped to logKind — the same Promotion count shows on both the Branding and
    // Ads tabs, since the flag isn't tied to which side it posted to.
    const promotion = items.filter(i =>
      i.client_name === logClientFilter && i.content_type === contentTypeForMode && i.is_promotion &&
      (logMonthFilter === "all" || i.posts.some(p => p.posted_date.slice(0, 7) === logMonthFilter))
    ).length

    return {
      posted,
      unposted: kpiRow?.unposted ?? 0,
      edited,
      unedited: kpiRow?.unedited ?? 0,
      target,
      targetMonth,
      remaining: Math.max(target - posted, 0),
      completionPct: target ? Math.round((posted / target) * 100) : null,
      promotion,
    }
  }, [items, clientTargets, logClientFilter, logKind, logMonthFilter, contentTypeForMode, today])

  // Target is only ever edited from the Overview tab's Per-Client KPIs table — one
  // client/month per row instead of a single selected client/month, and awaited so
  // the inline cell can show its own per-row saving state.
  async function handleSetOverviewTarget(clientName: string, kind: "branding" | "ads", contentType: "video" | "poster", month: string, newTarget: number) {
    const key = { client_name: clientName, kind, content_type: contentType, month }
    const previous = clientTargets.find(t => t.client_name === key.client_name && t.kind === key.kind && t.content_type === key.content_type && t.month === key.month)
    setClientTargets(prev => {
      const others = prev.filter(t => !(t.client_name === key.client_name && t.kind === key.kind && t.content_type === key.content_type && t.month === key.month))
      return [...others, { ...key, target: newTarget }]
    })
    const res = await setClientMonthlyTarget({ ...key, target: newTarget })
    if (!res.success) {
      setClientTargets(prev => {
        const others = prev.filter(t => !(t.client_name === key.client_name && t.kind === key.kind && t.month === key.month))
        return previous ? [...others, previous] : others
      })
    }
  }

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

  // Completing needs the video titles, so it routes through a modal rather than firing
  // the action directly. Cancelled is immediate.
  function handleShootStatus(shootId: string, status: ShootStatus) {
    const shoot = shoots.find(s => s.id === shootId)
    if (status === "completed") {
      if (shoot) setCompleteShootFor(shoot)
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

  function handleShootCompleted(shoot: Shoot, created: CreatedShootItem[], crew: Member[], driveLink: string) {
    const newItems: ContentItem[] = created.map(ci => ({
      id: ci.id, client_name: ci.client_name, title: ci.title, content_type: "video", source: "shoot",
      status: "ready_to_edit", shot_date: ci.shot_date, edited_date: null, notes: ci.notes,
      ready_platforms: [], scheduled_post_date: null, scheduled_post_time: null, corrections: [],
      hook_count: null, use_for: [], priority: null, shoot_type: null, voiceover_date: null, reviewed_at: null,
      posted_branding: false, posted_ads: false, cancelled_by: null, edited_drive_link: null, script_drive_link: null, is_promotion: false,
      shotByUsers: crew.length > 0 ? crew : undefined,
      created_at: new Date().toISOString(), posts: [],
    }))
    setItems(prev => {
      // A shoot spun off an Ads Video item via "Move to Shoot" advances that already-linked
      // item to Ready to Edit — plus any EXTRA videos listed at completion, same as a
      // regular shoot.
      let next = shoot.source_content_item_id
        ? prev.map(i => i.id === shoot.source_content_item_id ? { ...i, status: "ready_to_edit" as ContentStatus } : i)
        : prev
      if (newItems.length > 0) next = [...newItems, ...next]
      return next
    })
    setShoots(prev => prev.map(s => s.id === shoot.id ? {
      ...s,
      status: "completed",
      drive_link: driveLink,
      goingByUsers: crew.length > 0 ? crew : s.goingByUsers,
      titles: created.map(ci => ({ id: ci.shoot_title_id, title: ci.title, content_item_id: ci.id })),
    } : s))
    setCompleteShootFor(null)
  }

  function handleShootTitleRenamed(shootId: string, shootTitleId: string, newTitle: string) {
    let contentItemId: string | null = null
    const renameTitles = (titles: ShootTitleRef[]) => titles.map(t => {
      if (t.id !== shootTitleId) return t
      contentItemId = t.content_item_id
      return { ...t, title: newTitle }
    })
    setShoots(prev => prev.map(s => s.id === shootId ? { ...s, titles: renameTitles(s.titles) } : s))
    setEditCompletedShootFor(prev => prev && prev.id === shootId ? { ...prev, titles: renameTitles(prev.titles) } : prev)
    if (contentItemId) {
      setItems(prev => prev.map(i => i.id === contentItemId ? { ...i, title: newTitle } : i))
    }
  }

  // The other direction of the same sync — renaming from the Ready to Edit side (or any
  // later stage) keeps the originating shoot's own video-titles list showing the same name.
  function syncShootTitleFromContentItem(contentItemId: string, newTitle: string) {
    const renameByContentItem = (titles: ShootTitleRef[]) => titles.map(t =>
      t.content_item_id === contentItemId ? { ...t, title: newTitle } : t)
    setShoots(prev => prev.map(s => s.titles.some(t => t.content_item_id === contentItemId)
      ? { ...s, titles: renameByContentItem(s.titles) } : s))
    setEditCompletedShootFor(prev => prev && prev.titles.some(t => t.content_item_id === contentItemId)
      ? { ...prev, titles: renameByContentItem(prev.titles) } : prev)
  }

  function handleShootTitleAdded(shootId: string, created: CreatedShootItem) {
    const newItem: ContentItem = {
      id: created.id, client_name: created.client_name, title: created.title, content_type: "video", source: "shoot",
      status: "ready_to_edit", shot_date: created.shot_date, edited_date: null, notes: created.notes,
      ready_platforms: [], scheduled_post_date: null, scheduled_post_time: null, corrections: [],
      hook_count: null, use_for: [], priority: null, shoot_type: null, voiceover_date: null, reviewed_at: null,
      posted_branding: false, posted_ads: false, cancelled_by: null, edited_drive_link: null, script_drive_link: null, is_promotion: false,
      created_at: new Date().toISOString(), posts: [],
    }
    setItems(prev => [newItem, ...prev])
    setShoots(prev => prev.map(s => s.id === shootId
      ? { ...s, titles: [...s.titles, { id: created.shoot_title_id, title: created.title, content_item_id: created.id }] }
      : s))
    setEditCompletedShootFor(prev => prev && prev.id === shootId
      ? { ...prev, titles: [...prev.titles, { id: created.shoot_title_id, title: created.title, content_item_id: created.id }] }
      : prev)
  }

  // Same as handleShootSaved's crew update, but from Edit Completed Shoot — that modal stays open (its
  // own state already reflects the pick), so it doesn't close editCrewFor.
  function handleCompletedShootCrewSaved(shootId: string, crew: Member[]) {
    setShoots(prev => prev.map(s => s.id === shootId ? { ...s, goingByUsers: crew } : s))
  }

  // Same client-sync as handleShootSaved, but from Edit Completed Shoot — that modal stays
  // open (its own state already reflects the pick), so it doesn't close editCompletedShootFor.
  function handleShootCompletedClientSaved(shootId: string, client: string) {
    setShoots(prev => prev.map(s => s.id === shootId ? { ...s, client } : s))
    setEditCompletedShootFor(prev => prev && prev.id === shootId ? { ...prev, client } : prev)
    const shoot = shoots.find(s => s.id === shootId)
    if (shoot?.source_content_item_id) {
      setItems(prev => prev.map(i => i.id === shoot.source_content_item_id ? { ...i, client_name: client } : i))
    }
  }

  // Same as handleShootCompletedClientSaved, but for the shoot's own title — a typo made at
  // Mark Done had no fix short of this modal, since the video-titles list here edits each
  // video's own title, not the shoot's (real incident, 2026-08-01).
  function handleShootCompletedTitleSaved(shootId: string, title: string) {
    setShoots(prev => prev.map(s => s.id === shootId ? { ...s, legacyTitle: title } : s))
    setEditCompletedShootFor(prev => prev && prev.id === shootId ? { ...prev, legacyTitle: title } : prev)
  }

  function handleShootActualTimeSaved(shootId: string, fromTime: string, toTime: string) {
    const shoot = shoots.find(s => s.id === shootId)
    if (!shoot) return
    const shotDate = shoot.start_time.split("T")[0]
    const start_time = `${shotDate}T${fromTime}:00`
    const end_time = `${shotDate}T${toTime}:00`
    setShoots(prev => prev.map(s => s.id === shootId ? { ...s, start_time, end_time } : s))
  }

  function handleShootDriveLinkSaved(shootId: string, driveLink: string) {
    setShoots(prev => prev.map(s => s.id === shootId ? { ...s, drive_link: driveLink } : s))
  }

  function handleDeleteShoot(shoot: Shoot) {
    // A shoot that produced no videos has nothing to choose between — just confirm plainly.
    if (shoot.titles.length === 0) {
      confirm({ title: `Delete "${shoot.legacyTitle}"?`, message: "This cannot be undone.", icon: "trash" }).then(ok => {
        if (!ok) return
        setShoots(prev => prev.filter(s => s.id !== shoot.id))
        startTransition(async () => { await deleteShoot(shoot.id) })
      })
      return
    }
    setDeleteShootFor(shoot)
  }

  async function handleConfirmDeleteShoot(cascadeVideos: boolean) {
    const shoot = deleteShootFor
    if (!shoot) return
    setDeleteShootFor(null)
    const contentItemIds = shoot.titles.map(t => t.content_item_id).filter((id): id is string => !!id)
    setShoots(prev => prev.filter(s => s.id !== shoot.id))
    if (cascadeVideos) setItems(prev => prev.filter(i => !contentItemIds.includes(i.id)))
    startTransition(async () => {
      await deleteShoot(shoot.id)
      if (cascadeVideos) await Promise.all(contentItemIds.map(id => deleteContentItem(id)))
    })
  }

  function handleShootSaved(shootId: string, patch: { client: string; legacyTitle: string; start_time: string; notes: string | null; tags: ShootTag[]; crew: Member[] }) {
    setShoots(prev => prev.map(s => s.id === shootId ? {
      ...s,
      client: patch.client, legacyTitle: patch.legacyTitle, start_time: patch.start_time,
      notes: patch.notes, tags: patch.tags, goingByUsers: patch.crew,
    } : s))
    // A shoot spun off an Ads Video item shares its client — keep the linked item's card
    // in sync instead of leaving it stuck on the shoot's old client.
    const shoot = shoots.find(s => s.id === shootId)
    if (shoot?.source_content_item_id) {
      setItems(prev => prev.map(i => i.id === shoot.source_content_item_id ? { ...i, client_name: patch.client } : i))
    }
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

  async function handleDeleteAd(adId: string) {
    if (!(await confirm({ message: "Delete this ad?", icon: "trash" }))) return
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

  function handlePostAdded(posts: ContentPost[], isPromotion: boolean) {
    if (posts.length === 0) return
    const itemId = posts[0].content_item_id
    setItems(prev => prev.map(i => {
      if (i.id !== itemId) return i
      const allPosts = [...i.posts, ...posts]
      // Mirrors the server's syncPostedFlags — recomputed here too so the Branding ✓ / Ads ✓
      // badges and the dual-post buttons update immediately, not just after revalidation.
      return {
        ...i, status: "posted", posts: allPosts,
        posted_ads: allPosts.some(p => ADS_PLATFORM_SET.has(p.platform)),
        posted_branding: allPosts.some(p => !ADS_PLATFORM_SET.has(p.platform)),
        // One-way — never unset an existing true back to false here.
        is_promotion: i.is_promotion || isPromotion,
      }
    }))
    setPlatformModalItem(null)
  }

  function handleDeletePost(postId: string, contentItemId: string) {
    setItems(prev => prev.map(i => {
      if (i.id !== contentItemId) return i
      const deletedPost = i.posts.find(p => p.id === postId)
      const posts = i.posts.filter(p => p.id !== postId)
      // Mirrors the server: back to its Ready lane once its last post is removed.
      const fallback: ContentStatus = deletedPost && ADS_PLATFORM_SET.has(deletedPost.platform) ? "ads_ready" : "branding_ready"
      return {
        ...i, posts, status: posts.length === 0 ? fallback : i.status,
        // A dual-posted item that loses its last post on one side should stop showing that
        // side's ✓ badge, even though it's still "posted" overall via the other side.
        posted_ads: posts.some(p => ADS_PLATFORM_SET.has(p.platform)),
        posted_branding: posts.some(p => !ADS_PLATFORM_SET.has(p.platform)),
      }
    }))
    startTransition(async () => { await deleteContentPost(postId, contentItemId) })
  }

  return (
    <div style={{ background: "#F9FAFB", minHeight: "100vh", padding: "clamp(12px,3vw,24px)", display: "flex", flexDirection: "column", gap: 20 }}>
      <PageHero
        eyebrow="MEDIA OPERATIONS"
        eyebrowIcon={<Sparkles size={14} style={{ color: "#FFD700" }} />}
        title="Media Tracker"
        chips={[
          { icon: <Video size={11} />, label: `${stats.readyToEdit + stats.edited + stats.completedEdit} in pipeline` },
          { icon: <CalendarDays size={11} />, label: `${stats.readyToPost} ready to post` },
          { icon: <Check size={11} />, label: `${stats.posted} posted` },
          { icon: <Megaphone size={11} />, label: `${ads.filter(a => a.status === "active").length} active ads` },
        ]}
        rightSlot={
          // Reused from the retired Content Calendar hero — same character and the same
          // frosted-glass date/total/posted trio, one scrollable row on mobile.
          <div className="flex flex-nowrap overflow-x-auto md:flex-wrap md:overflow-visible" style={{ alignItems: "center", gap: 12, scrollbarWidth: "none", maxWidth: "100%" }}>
            <Image src="/brand/content-cal-hero-girl.png" alt="" width={1536} height={1024}
              style={{ height: "clamp(64px,16vw,110px)", width: "auto", objectFit: "contain", objectPosition: "bottom", flexShrink: 0, filter: "drop-shadow(0 6px 20px rgba(0,0,0,0.4))" }} />
            <div className="flex gap-2" style={{ flexShrink: 0 }}>
              <HeroGlassStat
                label={`${new Date().toLocaleDateString("en-US", { month: "short" }).toUpperCase()} ${new Date().getFullYear()}`}
                value={new Date().getDate()}
                sub={new Date().toLocaleDateString("en-US", { weekday: "long" })} />
              <HeroGlassStat label="Total" value={items.length} sub="Content" />
              <HeroGlassStat label="Posted" value={stats.posted} sub="Done ✓" />
            </div>
          </div>
        }
      />

      <TrackerNav
        mode={mode}
        onMode={setMode}
        tab={mode === "schedule" ? scheduleSubTab : tab}
        onTab={k => { if (mode === "schedule") setScheduleSubTab(k as typeof scheduleSubTab); else setSubTab(k as typeof subTab) }}
        modeCounts={navCounts}
        sections={navSections}
      />

      {mode === "overview" && (
        <OverviewDashboard
          overview={overview}
          items={items}
          shoots={shoots}
          ads={ads}
          clientTargets={clientTargets}
          clients={clients}
          today={today}
          onAttentionClick={goTo}
          onSetTarget={handleSetOverviewTarget}
        />
      )}

      {(mode === "video" || mode === "poster") && tab === "pipeline" && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-end flex-wrap gap-2">
            <select value={pipelineClientFilter} onChange={e => setPipelineClientFilter(e.target.value)}
              style={FILTER_FIELD}>
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
            <button onClick={() => setShowNewContent(true)}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 16px", borderRadius: 12, border: "none", background: MODE_ACCENT[mode].grad, color: "#fff", fontSize: 12, fontWeight: 800, cursor: "pointer" }}>
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
          {/* Colored panel matches the active tab's status accent, same gradient language as the desktop columns below, so mobile isn't just a plain white list */}
          <div className="md:hidden rounded-2xl p-3" style={{
            background: `linear-gradient(165deg, ${STATUS_CFG[activeMobileCol].accent} 0%, ${darken(STATUS_CFG[activeMobileCol].accent, 0.55)} 100%)`,
            minHeight: 140,
          }}>
            {colItems(activeMobileCol).length === 0 ? (
              <KanbanEmptyCell isOver={false} />
            ) : colItems(activeMobileCol).map(item => (
              <ContentCardInner key={item.id} item={item} onAdvance={advance} onDelete={handleDeleteItem} onAddPlatform={(item, kind) => { setPlatformModalKind(kind ?? "branding"); setPlatformModalItem(item) }} onEdit={setEditingItem} onMove={setMoveOnReviewFor} onSchedule={setScheduleFor} />
            ))}
          </div>

          {/* Fixed-width columns instead of squeezing all of them to fit — comfortable card
              size stays constant regardless of how many stages there are; extra columns
              scroll into view horizontally instead of shrinking. */}
          <div className="hidden md:block overflow-x-auto" style={{ scrollSnapType: "x mandatory" }}>
            <DndContext sensors={sensors} onDragStart={handleDragStart} onDragOver={handleDragOver as never} onDragEnd={handleDragEnd}>
              {/* Exactly 3 columns fill the row (not a partial 4th peeking in) — each
                  column's width is 1/3 of the row minus its share of the gaps, so however
                  wide the screen is, 3 always fit cleanly and the rest scroll-snap into view. */}
              <div className="grid gap-3" style={{ gridAutoFlow: "column", gridAutoColumns: "calc((100% - 24px) / 3)" }}>
                {pipelineOrder.map(status => {
                  const list = colItems(status)
                  const cfg = STATUS_CFG[status]
                  return (
                    <DroppableColumn key={status} status={status} isOver={overCol === status}>
                      <KanbanColumnHeader label={cfg.label} count={list.length} accent={cfg.accent} />
                      <div className="p-3 flex-1 overflow-y-auto">
                        {list.length === 0 ? (
                          <KanbanEmptyCell isOver={overCol === status} />
                        ) : list.map(item => (
                          <DraggableCard key={item.id} item={item} isDragging={dragId === item.id} onAdvance={advance} onDelete={handleDeleteItem} onAddPlatform={(item, kind) => { setPlatformModalKind(kind ?? "branding"); setPlatformModalItem(item) }} onEdit={setEditingItem} onMove={setMoveOnReviewFor} onSchedule={setScheduleFor} />
                        ))}
                      </div>
                    </DroppableColumn>
                  )
                })}
              </div>
              <DragOverlay>
                {draggedItem ? (
                  <div style={{ width: 260, opacity: 0.95, transform: "rotate(2deg)" }}>
                    <ContentCardInner item={draggedItem} onAdvance={() => {}} onDelete={() => {}} onAddPlatform={() => {}} onMove={() => {}} onSchedule={() => {}} />
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
            <div className="flex items-center gap-2 flex-wrap" style={{ flex: "1 1 auto" }}>
              <div style={{ position: "relative", flex: "1 1 200px" }}>
                <Search size={13} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#9CA3AF" }} />
                <input value={adsVideoSearch} onChange={e => setAdsVideoSearch(e.target.value)} placeholder="Search title or client…"
                  style={{ ...FIELD, paddingLeft: 30 }} />
              </div>
              <select value={adsVideoClientFilter} onChange={e => setAdsVideoClientFilter(e.target.value)}
                style={FILTER_FIELD}>
                <option value="all">All Clients</option>
                {activeClientOptions.map(c => <option key={c} value={c}>{c}</option>)}
                {pastClientOptions.length > 0 && (
                  <optgroup label="📁 Past Clients">
                    {pastClientOptions.map(c => <option key={c} value={c}>{c}</option>)}
                  </optgroup>
                )}
              </select>
              <MonthSelect value={adsVideoMonthFilter} onChange={setAdsVideoMonthFilter} options={adsVideoMonthOptions} />
              <DayFilter value={adsVideoDayFilter} onChange={setAdsVideoDayFilter} />
            </div>
            <button onClick={() => setShowNewAdsVideo(true)}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 16px", borderRadius: 12, border: "none", background: "linear-gradient(135deg,#FF4D4D,#DE1A1A)", color: "#fff", fontSize: 12, fontWeight: 800, cursor: "pointer" }}>
              <Plus size={14} /> New Ads Video
            </button>
          </div>

          <div className="md:hidden flex flex-col gap-3">
            {/* Each status section is its own colored panel — same accent + white header strip as the desktop columns below, instead of a plain black-text heading on white */}
            {ADS_VIDEO_ORDER.map(status => {
              const cfg = STATUS_CFG[status]
              const list = adsVideoColItems(status)
              return (
                <div key={status} className="rounded-2xl overflow-hidden" style={{ background: `linear-gradient(165deg, ${cfg.accent} 0%, ${darken(cfg.accent, 0.55)} 100%)` }}>
                  <KanbanColumnHeader label={cfg.label} count={list.length} accent={cfg.accent} />
                  <div className="p-3">
                    {list.length === 0 ? (
                      <KanbanEmptyCell isOver={false} />
                    ) : list.map(item => (
                      <AdsVideoCardInner key={item.id} item={item} onAdvance={advance} onEdit={handleEditAdsItem} onDelete={handleDeleteItem} onMoveToShoot={setMoveToShootFor} onEditVoiceOver={setEditVoiceOverFor} />
                    ))}
                  </div>
                </div>
              )
            })}
            <div className="rounded-2xl overflow-hidden" style={{ background: `linear-gradient(165deg, ${ADS_VIDEO_COMPLETED_CFG.accent} 0%, ${darken(ADS_VIDEO_COMPLETED_CFG.accent, 0.55)} 100%)` }}>
              <KanbanColumnHeader label={ADS_VIDEO_COMPLETED_CFG.label} count={adsVideoCompletedItems.length} accent={ADS_VIDEO_COMPLETED_CFG.accent} />
              <div className="p-3">
                {adsVideoCompletedItems.length === 0 ? (
                  <KanbanEmptyCell isOver={false} />
                ) : adsVideoCompletedItems.map(item => (
                  <AdsVideoCardInner key={item.id} item={item} isCompleted onAdvance={advance} onEdit={handleEditAdsItem} onDelete={handleDeleteItem} onMoveToShoot={setMoveToShootFor} onEditVoiceOver={setEditVoiceOverFor} />
                ))}
              </div>
            </div>
          </div>

          <div className="hidden md:block">
            <DndContext sensors={sensors} onDragStart={e => setAdsVideoDragId(String(e.active.id))} onDragOver={handleAdsVideoDragOver as never} onDragEnd={handleAdsVideoDragEnd}>
              <div className="grid grid-cols-3 gap-3">
                {ADS_VIDEO_ORDER.map(status => {
                  const list = adsVideoColItems(status)
                  const cfg = STATUS_CFG[status]
                  return (
                    <KanbanColumn key={status} id={status} accent={cfg.accent} isOver={adsVideoOverCol === status}>
                      <KanbanColumnHeader label={cfg.label} count={list.length} accent={cfg.accent} />
                      <div className="p-3 flex-1 overflow-y-auto">
                        {list.length === 0 ? (
                          <KanbanEmptyCell isOver={adsVideoOverCol === status} />
                        ) : list.map(item => (
                          <KanbanCard key={item.id} id={item.id}>
                            <AdsVideoCardInner item={item} isDragging={adsVideoDragId === item.id} onAdvance={advance} onEdit={handleEditAdsItem} onDelete={handleDeleteItem} onMoveToShoot={setMoveToShootFor} onEditVoiceOver={setEditVoiceOverFor} />
                          </KanbanCard>
                        ))}
                      </div>
                    </KanbanColumn>
                  )
                })}
                <div className="rounded-2xl flex flex-col" style={{ border: "1px solid #E8E9EF", background: `linear-gradient(165deg, ${ADS_VIDEO_COMPLETED_CFG.accent} 0%, ${darken(ADS_VIDEO_COMPLETED_CFG.accent, 0.55)} 100%)`, minHeight: 200, maxHeight: "min(70vh, 720px)", overflow: "hidden" }}>
                  <KanbanColumnHeader label={ADS_VIDEO_COMPLETED_CFG.label} count={adsVideoCompletedItems.length} accent={ADS_VIDEO_COMPLETED_CFG.accent} />
                  <div className="p-3 flex-1 overflow-y-auto">
                    {adsVideoCompletedItems.length === 0 ? (
                      <KanbanEmptyCell isOver={false} />
                    ) : adsVideoCompletedItems.map(item => (
                      <AdsVideoCardInner key={item.id} item={item} isCompleted onAdvance={advance} onEdit={handleEditAdsItem} onDelete={handleDeleteItem} onMoveToShoot={setMoveToShootFor} onEditVoiceOver={setEditVoiceOverFor} />
                    ))}
                  </div>
                </div>
              </div>
              <DragOverlay>
                {draggedAdsVideo ? (
                  <div style={{ width: 260, opacity: 0.95, transform: "rotate(2deg)" }}>
                    <AdsVideoCardInner item={draggedAdsVideo} onAdvance={() => {}} onEdit={() => {}} onDelete={() => {}} onMoveToShoot={() => {}} onEditVoiceOver={() => {}} />
                  </div>
                ) : null}
              </DragOverlay>
            </DndContext>
          </div>
        </div>
      )}

      {(mode === "video" || mode === "poster") && (tab === "log" || tab === "adlog") && (
        <div className="flex flex-col gap-4">
          {/* Search/client/month/day filters — right at the top, next to the tab buttons
              above, so they're the first thing you see rather than buried mid-page. Also
              scopes the Waiting to Post queue below, not just the log table. */}
          <div className="flex items-center gap-2 flex-wrap">
            <div style={{ position: "relative", flex: "1 1 200px" }}>
              <Search size={13} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#9CA3AF" }} />
              <input value={logSearch} onChange={e => setLogSearch(e.target.value)} placeholder="Search title or client…"
                style={{ ...FIELD, paddingLeft: 30 }} />
            </div>
            <select value={logClientFilter} onChange={e => setLogClientFilter(e.target.value)}
              style={{ ...FILTER_FIELD, flex: "0 0 auto" }}>
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

          {/* Waiting queue — items sitting in this kind's Ready lane, not yet posted. Paired
              with a per-client stats box on the right (stacks below on mobile) once a single
              client is picked — otherwise that side just isn't rendered, no empty gap held open. */}
          {(readyQueue.length > 0 || logClientStats) && (
            <div className="flex flex-col md:flex-row items-start gap-3">
              {readyQueue.length > 0 && (
                <div style={{ flex: "2 1 320px", minWidth: 0, background: "#fff", border: "1px solid #BAE6FD", borderRadius: 18, overflow: "hidden" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "12px 16px", borderBottom: "1px solid #F3F4F6", background: "rgba(14,165,233,0.05)" }}>
                    <CalendarDays size={13} style={{ color: "#0EA5E9" }} />
                    <span style={{ fontSize: 10, fontWeight: 700, color: "#0EA5E9", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                      Waiting to Post — {readyQueue.length} queued
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
                        <div className="flex items-center gap-1.5">
                          <button onClick={() => setCancelReasonFor(item)}
                            title="Cancel" className="flex items-center justify-center rounded-lg"
                            style={{ width: 26, height: 26, border: "none", background: "rgba(239,68,68,0.1)", color: "#EF4444", cursor: "pointer" }}>
                            <XCircle size={13} />
                          </button>
                          <button onClick={() => { setPlatformModalKind(logKind); setPlatformModalItem(item) }}
                            className="text-[10px] font-bold px-2.5 py-1 rounded-lg"
                            style={{ border: "none", background: logKind === "ads" ? "rgba(217,119,6,0.1)" : "rgba(34,197,94,0.1)", color: logKind === "ads" ? "#D97706" : "#16A34A", cursor: "pointer" }}>
                            {logKind === "ads" ? "Ads Completed" : "Mark as Posted"}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {logClientStats && (
                <div style={{ flex: "1 1 220px", minWidth: 0 }}>
                  <ClientStatsBox client={logClientFilter} stats={logClientStats} contentType={contentTypeForMode} />
                </div>
              )}
            </div>
          )}

          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={() => setLogPlatformFilter("all")}
              style={{ padding: "8px 12px", borderRadius: 10, border: `1.5px solid ${logPlatformFilter === "all" ? "#111827" : "#E5E7EB"}`, background: logPlatformFilter === "all" ? "rgba(17,24,39,0.06)" : "#fff", color: logPlatformFilter === "all" ? "#111827" : "#6B7280", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
              All Platforms
            </button>
            {logPlatformOptions.map(p => {
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
            <div style={{ maxHeight: 560, overflowY: "auto", overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ background: "#F9FAFB", borderBottom: "1px solid #E5E7EB" }}>
                    {["Video/Poster", "Client", "Type", "Platforms", "Posted By", "Posted Date", "Actions"].map(h => (
                      <th key={h} style={{ textAlign: "left", padding: "10px 14px", fontSize: 10, fontWeight: 700, color: "#374151", textTransform: "uppercase", letterSpacing: "0.06em" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {logRows.length === 0 ? (
                    <tr><td colSpan={7} style={{ padding: "32px 14px", textAlign: "center", color: "#374151", fontWeight: 600, fontSize: 12 }}>No posts logged yet</td></tr>
                  ) : logRows.map(item => (
                    <tr key={item.id} style={{ borderBottom: "1px solid #F3F4F6" }}>
                      <td style={{ padding: "10px 14px", fontWeight: 700, color: "#111827" }}>
                        <div className="flex items-center gap-1.5">
                          {item.title}
                          {item.is_promotion && (
                            <span style={{ fontSize: 11, fontWeight: 600, color: "#6B7280", flexShrink: 0 }}>(Promotion)</span>
                          )}
                          {/* Informational only — went out both organically and as an ad.
                              The actual "also post" decision happens at Mark as Posted /
                              Ads Completed, not here. */}
                          {item.posted_branding && item.posted_ads && (
                            <span title="Posted to both Branding and Ads" style={{
                              display: "inline-flex", alignItems: "center", padding: "1px 6px", borderRadius: 99,
                              fontSize: 9, fontWeight: 800, color: "#7C3AED", background: "rgba(124,58,237,0.12)", flexShrink: 0,
                            }}>
                              DUAL
                            </span>
                          )}
                        </div>
                      </td>
                      <td style={{ padding: "10px 14px", color: "#6366F1", fontWeight: 600 }}>{item.client_name}</td>
                      <td style={{ padding: "10px 14px", color: "#374151", fontWeight: 600, textTransform: "capitalize" }}>{item.content_type}</td>
                      <td style={{ padding: "10px 14px" }}>
                        <div className="flex flex-wrap items-center gap-1">
                          {item.posts.map(post => {
                            const cfg = PLATFORM_CFG[post.platform]
                            return (
                              <span key={post.id} className="inline-flex items-center gap-1 group/badge"
                                style={{ background: `${cfg.color}14`, color: cfg.color, padding: "3px 6px 3px 8px", borderRadius: 99, fontSize: 10, fontWeight: 700 }}>
                                <cfg.icon size={10} /> {post.platform === "other" && post.other_platform_label ? post.other_platform_label : cfg.label}
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
                              {upper(u.name)}
                            </span>
                          ))}
                          {item.posts.every(p => !p.postedByUser) && (
                            <span className="text-[10px]" style={{ color: "#9CA3AF" }}>—</span>
                          )}
                        </div>
                      </td>
                      <td style={{ padding: "10px 14px", color: "#374151" }}>{fmtDateRange(item.posts.map(p => p.posted_date))}</td>
                      <td style={{ padding: "10px 14px" }}>
                        <div className="flex items-center gap-1 flex-wrap">
                          <button onClick={() => setEditingItem(item)} title="Edit"
                            style={{ display: "flex", padding: 6, borderRadius: 8, border: "1px solid #E5E7EB", background: "#fff", color: "#6B7280", cursor: "pointer" }}>
                            <Pencil size={12} />
                          </button>
                          <button onClick={() => handleDeleteItem(item.id)} title="Delete"
                            style={{ display: "flex", padding: 6, borderRadius: 8, border: "1px solid #FEE2E2", background: "#FEF2F2", color: "#DE1A1A", cursor: "pointer" }}>
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </td>
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
                style={FILTER_FIELD}>
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
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 16px", borderRadius: 12, border: "none", background: MODE_ACCENT.ads.grad, color: "#fff", fontSize: 12, fontWeight: 800, cursor: "pointer" }}>
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
          {/* Colored panel matches the active tab's status accent, same gradient language as the desktop columns below, so mobile isn't just a plain white list */}
          <div className="md:hidden rounded-2xl p-3" style={{
            background: `linear-gradient(165deg, ${AD_STATUS_CFG[activeAdCol].color} 0%, ${darken(AD_STATUS_CFG[activeAdCol].color, 0.55)} 100%)`,
            minHeight: 140,
          }}>
            {filteredAds.filter(a => a.status === activeAdCol).length === 0 ? (
              <KanbanEmptyCell isOver={false} />
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
                      <div className="p-3 flex-1 overflow-y-auto">
                        {list.length === 0 ? (
                          <KanbanEmptyCell isOver={adOverCol === status} />
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

      {mode === "schedule" && (
        <ScheduleTab entries={activeScheduleEntries} activeClientOptions={activeClientOptions} pastClientOptions={pastClientOptions} />
      )}

      {mode === "video" && tab === "shoots" && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-end flex-wrap gap-2">
            <select value={shootsClientFilter} onChange={e => setShootsClientFilter(e.target.value)}
              style={FILTER_FIELD}>
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
          {/* Colored panel matches the active tab's status accent, same gradient language as the desktop columns below, so mobile isn't just a plain white list */}
          <div className="md:hidden rounded-2xl p-3" style={{
            background: `linear-gradient(165deg, ${SHOOT_STATUS_CFG[activeShootCol].color} 0%, ${darken(SHOOT_STATUS_CFG[activeShootCol].color, 0.55)} 100%)`,
            minHeight: 140,
          }}>
            {filteredShoots.filter(s => s.status === activeShootCol).length === 0 ? (
              <KanbanEmptyCell isOver={false} />
            ) : filteredShoots.filter(s => s.status === activeShootCol).map(shoot => (
              <ShootCardInner key={shoot.id} shoot={shoot} onStatus={handleShootStatus} onEdit={handleEditShoot} onDelete={handleDeleteShoot} />
            ))}
          </div>

          {/* Desktop kanban */}
          <div className="hidden md:block">
            <DndContext sensors={sensors}
              onDragStart={e => setShootDragId(String(e.active.id))}
              onDragOver={handleShootDragOver as never}
              onDragEnd={handleShootDragEnd}>
              <div className="grid grid-cols-3 gap-4">
                {SHOOT_STATUS_ORDER.map(status => {
                  const cfg = SHOOT_STATUS_CFG[status]
                  const list = filteredShoots.filter(s => s.status === status)
                  return (
                    <KanbanColumn key={status} id={status} accent={cfg.color} isOver={shootOverCol === status}>
                      <KanbanColumnHeader label={cfg.label} count={list.length} accent={cfg.color} />
                      <div className="p-3 flex-1 overflow-y-auto">
                        {list.length === 0 ? (
                          <KanbanEmptyCell isOver={shootOverCol === status} />
                        ) : list.map(shoot => (
                          <KanbanCard key={shoot.id} id={shoot.id}>
                            <ShootCardInner shoot={shoot} isDragging={shootDragId === shoot.id} onStatus={handleShootStatus} onEdit={handleEditShoot} onDelete={handleDeleteShoot} />
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
        <NewContentModal clients={clients} pastClients={pastClients} members={editingMembers} defaultContentType={contentTypeForMode} onClose={() => setShowNewContent(false)}
          onCreated={item => { setItems(prev => [item, ...prev]); setShowNewContent(false) }} />
      )}
      {platformModalItem && (
        <AddPlatformModal item={platformModalItem} kind={platformModalKind} members={members} currentUserId={currentUserId}
          onClose={() => setPlatformModalItem(null)} onAdded={handlePostAdded} />
      )}
      {editingItem && (
        <EditContentModal item={editingItem} clients={clients} pastClients={pastClients} members={editingMembers} shootingMembers={shootingMembers} onClose={() => setEditingItem(null)}
          onAdvance={(item, next) => { advance(item, next); setEditingItem(null) }}
          onAddPlatform={(item, kind) => { setPlatformModalKind(kind); setPlatformModalItem(item) }}
          onPostUpdated={(postId, updates) => {
            setItems(prev => prev.map(i => i.id !== editingItem.id ? i : {
              ...i, posts: i.posts.map(p => p.id === postId ? { ...p, posted_date: updates.posted_date, postedByUser: updates.postedByUser } : p),
            }))
          }}
          onSaved={updates => {
            setItems(prev => prev.map(i => i.id === editingItem.id ? {
              ...i, ...updates,
              notes: updates.notes || null,
              scheduled_post_date: updates.scheduled_post_date || null,
              scheduled_post_time: updates.scheduled_post_time || null,
              // undefined means "wasn't shown/editable this time" — keep whatever it already was.
              editedByUser: updates.editedByUser !== undefined ? updates.editedByUser : i.editedByUser,
              edited_date: updates.edited_date !== undefined ? updates.edited_date : i.edited_date,
              edited_drive_link: updates.edited_drive_link !== undefined ? updates.edited_drive_link : i.edited_drive_link,
              shotByUsers: updates.shotByUsers !== undefined ? updates.shotByUsers : i.shotByUsers,
              cancelled_by: updates.cancelled_by !== undefined ? updates.cancelled_by : i.cancelled_by,
            } : i))
            if (updates.title !== editingItem.title) syncShootTitleFromContentItem(editingItem.id, updates.title)
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
        <NewShootModal clients={clients} pastClients={pastClients} shootingMembers={shootingMembers} currentUserId={currentUserId} onClose={() => setShowNewShoot(false)}
          onCreated={shoot => { setShoots(prev => [shoot, ...prev]); setShowNewShoot(false) }} />
      )}
      {completeShootFor && (
        <CompleteShootModal shoot={completeShootFor} members={shootingMembers} currentUserId={currentUserId}
          onClose={() => setCompleteShootFor(null)}
          onCompleted={(created, crew, driveLink) => handleShootCompleted(completeShootFor, created, crew, driveLink)} />
      )}
      {deleteShootFor && (
        <DeleteShootModal shoot={deleteShootFor} onClose={() => setDeleteShootFor(null)}
          onConfirm={handleConfirmDeleteShoot} />
      )}
      {editShootFor && (
        <EditShootModal shoot={editShootFor} members={shootingMembers} currentUserId={currentUserId} clients={clients} pastClients={pastClients}
          onClose={() => setEditShootFor(null)}
          onSaved={patch => handleShootSaved(editShootFor.id, patch)} />
      )}
      {editCompletedShootFor && (
        <EditCompletedShootModal shoot={editCompletedShootFor} members={shootingMembers} currentUserId={currentUserId}
          clients={clients} pastClients={pastClients}
          onClose={() => setEditCompletedShootFor(null)}
          onRenamed={(shootTitleId, newTitle) => handleShootTitleRenamed(editCompletedShootFor.id, shootTitleId, newTitle)}
          onAdded={created => handleShootTitleAdded(editCompletedShootFor.id, created)}
          onTimeSaved={(fromTime, toTime) => handleShootActualTimeSaved(editCompletedShootFor.id, fromTime, toTime)}
          onCrewSaved={crew => handleCompletedShootCrewSaved(editCompletedShootFor.id, crew)}
          onDriveLinkSaved={driveLink => handleShootDriveLinkSaved(editCompletedShootFor.id, driveLink)}
          onClientSaved={client => handleShootCompletedClientSaved(editCompletedShootFor.id, client)}
          onTitleSaved={title => handleShootCompletedTitleSaved(editCompletedShootFor.id, title)} />
      )}
      {editAdFor && (
        <EditAdModal ad={editAdFor} clients={clients} pastClients={pastClients}
          onClose={() => setEditAdFor(null)}
          onSaved={patch => handleAdSaved(editAdFor.id, patch)} />
      )}
      {assignEditorItem && (
        <AssignEditorModal item={assignEditorItem} members={editingMembers} currentUserId={currentUserId}
          onClose={() => setAssignEditorItem(null)}
          onConfirm={(editorId, editorName) => handleAssignEditor(assignEditorItem, editorId, editorName)} />
      )}
      {markEditedItem && (
        <MarkEditedModal item={markEditedItem} members={editingMembers} currentUserId={currentUserId}
          onClose={() => setMarkEditedItem(null)}
          onConfirm={(editorId, editorName, editedDate, driveLink) => handleMarkEdited(markEditedItem, editorId, editorName, editedDate, driveLink)} />
      )}
      {showNewAdsVideo && (
        <NewAdsVideoModal
          clients={clients} pastClients={pastClients} members={scriptingMembers} currentUserId={currentUserId}
          onClose={() => setShowNewAdsVideo(false)}
          onCreated={item => { setItems(prev => [item, ...prev]); setShowNewAdsVideo(false) }}
        />
      )}
      {voiceOverItem && (
        <VoiceOverModal
          item={voiceOverItem} freelancers={voiceoverOptions}
          onClose={() => setVoiceOverItem(null)}
          onConfirm={(freelancer, date, scriptLink) => handleVoiceOverRecorded(voiceOverItem, freelancer, date, scriptLink)}
        />
      )}
      {editAdsVideoFor && (
        <EditAdsVideoModal
          item={editAdsVideoFor} clients={clients} pastClients={pastClients} members={scriptingMembers} currentUserId={currentUserId}
          onClose={() => setEditAdsVideoFor(null)}
          onAdvance={(item, next) => { advance(item, next); setEditAdsVideoFor(null) }}
          onSaved={updates => {
            setItems(prev => prev.map(i => i.id === editAdsVideoFor.id ? { ...i, ...updates, notes: updates.notes || null } : i))
            setEditAdsVideoFor(null)
          }}
        />
      )}
      {editVoiceOverFor && (
        <EditVoiceOverModal
          item={editVoiceOverFor} freelancers={voiceoverOptions}
          onClose={() => setEditVoiceOverFor(null)}
          onAdvance={(item, next) => { advance(item, next); setEditVoiceOverFor(null) }}
          onSaved={(voiceoverBy, date, scriptLink) => {
            setItems(prev => prev.map(i => i.id === editVoiceOverFor.id ? { ...i, voiceoverBy, voiceover_date: date, script_drive_link: scriptLink } : i))
            setEditVoiceOverFor(null)
          }}
        />
      )}
      {moveToShootFor && (
        <MoveToShootModal
          item={moveToShootFor}
          onClose={() => setMoveToShootFor(null)}
          onMoved={(shoot, scriptLink) => {
            setShoots(prev => [shoot, ...prev])
            setItems(prev => prev.map(i => i.id === moveToShootFor.id ? { ...i, script_drive_link: scriptLink } : i))
            setMoveToShootFor(null)
          }}
        />
      )}
      {moveOnReviewFor && (
        <MoveOnReviewModal
          item={moveOnReviewFor}
          onClose={() => setMoveOnReviewFor(null)}
          onMoved={next => handleMoveToPostingStage(moveOnReviewFor, next)}
          onCancelled={cancelledBy => handleCancelConfirmed(moveOnReviewFor, cancelledBy)}
        />
      )}
      {cancelReasonFor && (
        <CancelReasonModal
          item={cancelReasonFor}
          onClose={() => setCancelReasonFor(null)}
          onCancelled={cancelledBy => handleCancelConfirmed(cancelReasonFor, cancelledBy)}
        />
      )}
      {scheduleFor && (
        <ScheduleModal
          item={scheduleFor}
          onClose={() => setScheduleFor(null)}
          onScheduled={date => handleReschedule(scheduleFor, date)}
        />
      )}
    </div>
  )
}
