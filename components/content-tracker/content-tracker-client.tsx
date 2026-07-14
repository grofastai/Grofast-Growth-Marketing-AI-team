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
  Layers, History, ArrowRight, Check, ChevronDown, Megaphone, Target, AlertTriangle, CalendarDays,
} from "lucide-react"
import { PageHero } from "@/components/admin/PageHero"
import ClientSelector from "@/components/ui/ClientSelector"
import { buildClientOptions } from "@/lib/utils/client-options"
import { latestEntry, isUnderperforming, cpc, cpm, frequency, costPerResult, type AdPerformanceEntry } from "@/lib/ads-tracker/performance-metrics"
import {
  createContentItem, updateContentItem, updateContentItemStatus, deleteContentItem,
  addContentPost, deleteContentPost,
  createAd, updateAdStatus, deleteAd, addAdRevision, addAdPerformanceEntry, markReadyToPost,
} from "@/lib/actions/content-tracker"
import { createTrackerShoot, completeShootWithTitles, updateShootStatus, type CreatedShootItem } from "@/lib/actions/shoots"
import { isValidShootTransition } from "@/lib/shoots/status-transitions"

// ── Types ────────────────────────────────────────────────────────────────────
type Platform = "instagram" | "youtube" | "facebook" | "linkedin" | "gmb"
type ContentStatus = "shot" | "editing" | "edited" | "ready" | "posted"
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

export type ContentItem = {
  id: string
  client_name: string
  title: string
  content_type: "video" | "poster"
  status: ContentStatus
  shot_date: string | null
  edited_date: string | null
  notes: string | null
  created_at: string
  // Set when the item is scheduled into "Ready to Post" — the intent, not the record.
  ready_platforms: Platform[]
  scheduled_post_date: string | null
  scheduled_post_time: string | null
  shotByUser?: Person
  editedByUser?: Person
  posts: ContentPost[]
}

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
}

// ── Design tokens ────────────────────────────────────────────────────────────
const STATUS_CFG: Record<ContentStatus, { label: string; accent: string }> = {
  shot:    { label: "Shot",          accent: "#F59E0B" },
  editing: { label: "Editing",       accent: "#6366F1" },
  edited:  { label: "Edited",        accent: "#9B6BFF" },
  ready:   { label: "Ready to Post", accent: "#0EA5E9" },
  posted:  { label: "Posted",        accent: "#22C55E" },
}
const STATUS_ORDER: ContentStatus[] = ["shot", "editing", "edited", "ready", "posted"]

const PLATFORM_CFG: Record<Platform, { label: string; color: string; icon: typeof Camera }> = {
  instagram: { label: "Instagram", color: "#E1306C", icon: Camera },
  youtube:   { label: "YouTube",   color: "#DE1A1A", icon: PlaySquare },
  facebook:  { label: "Facebook",  color: "#1877F2", icon: ThumbsUp },
  linkedin:  { label: "LinkedIn",  color: "#0A66C2", icon: Building2 },
  gmb:       { label: "GMB",       color: "#1E8E3E", icon: Store },
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
function TabToggle({ tabs, active, onChange }: { tabs: { key: string; label: string; icon: typeof Layers }[]; active: string; onChange: (k: string) => void }) {
  return (
    <div style={{ display: "flex", gap: 6, background: "#1F2937", borderRadius: 14, padding: 5, flexWrap: "wrap" }}>
      {tabs.map(t => {
        const isActive = t.key === active
        const Icon = t.icon
        return (
          <button key={t.key} onClick={() => onChange(t.key)}
            style={{
              display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 10, border: "none",
              background: isActive ? "linear-gradient(135deg,#FF4D4D,#DE1A1A)" : "transparent",
              color: isActive ? "#fff" : "#D1D5DB",
              boxShadow: isActive ? "0 4px 14px rgba(222,26,26,0.3)" : "none",
              fontSize: 12, fontWeight: 800, cursor: "pointer", transition: "all 0.15s",
            }}>
            <Icon size={13} />
            {t.label}
          </button>
        )
      })}
    </div>
  )
}

// ── Kanban card ──────────────────────────────────────────────────────────────
function ContentCardInner({
  item, isDraggable, isDragging, onAdvance, onDelete, onAddPlatform, onEdit,
}: {
  item: ContentItem
  isDraggable?: boolean
  isDragging?: boolean
  onAdvance: (item: ContentItem, next: ContentStatus) => void
  onDelete: (id: string) => void
  onAddPlatform: (item: ContentItem) => void
  onEdit?: (item: ContentItem) => void
}) {
  const TypeIcon = item.content_type === "video" ? Video : ImageIcon
  const age = item.status === "shot" ? daysAgo(item.shot_date) : item.status === "edited" ? daysAgo(item.edited_date) : null
  const stale = age !== null && age >= 3

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
      </div>

      <div className="flex flex-wrap items-center gap-1 mb-2.5">
        <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-full truncate max-w-[110px]"
          style={{ background: "rgba(99,102,241,0.08)", color: "#6366F1" }}>{item.client_name}</span>
        {stale && (
          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full ml-auto" style={{ background: "rgba(245,158,11,0.1)", color: "#D97706" }}>
            {age}d stuck
          </span>
        )}
      </div>

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
        <span className="text-[9px]" style={{ color: "#374151", fontWeight: 600 }}>{fmtDate(item.shot_date)}</span>
      </div>

      {/* Scheduled slot — shown while it's queued in Ready to Post. */}
      {item.status === "ready" && item.scheduled_post_date && (
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

      {item.status !== "posted" && (
        <button
          onPointerDown={e => e.stopPropagation()}
          onClick={() => onAdvance(item, STATUS_ORDER[STATUS_ORDER.indexOf(item.status) + 1])}
          className="w-full py-1.5 rounded-xl text-[9px] font-bold transition-all hover:opacity-80 flex items-center justify-center gap-1"
          style={{ background: `${STATUS_CFG[STATUS_ORDER[STATUS_ORDER.indexOf(item.status) + 1]].accent}14`, color: STATUS_CFG[STATUS_ORDER[STATUS_ORDER.indexOf(item.status) + 1]].accent }}>
          {item.status === "ready" ? <>Mark Posted <ArrowRight size={10} /></> : <>Move to {STATUS_CFG[STATUS_ORDER[STATUS_ORDER.indexOf(item.status) + 1]].label} <ArrowRight size={10} /></>}
        </button>
      )}
      {item.status === "posted" && (
        <button onPointerDown={e => e.stopPropagation()} onClick={() => onAddPlatform(item)}
          className="w-full py-1.5 rounded-xl text-[9px] font-bold transition-all hover:opacity-80 flex items-center justify-center gap-1"
          style={{ background: "rgba(34,197,94,0.08)", color: "#16A34A" }}>
          <Plus size={10} /> Add Platform
        </button>
      )}

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 4, marginTop: 6 }}>
        {onEdit && (
          <button onPointerDown={e => e.stopPropagation()} onClick={() => onEdit(item)} title="Edit details"
            style={{ padding: "3px 6px", borderRadius: 6, background: "transparent", border: "none", cursor: "pointer", opacity: 0.4 }}
            onMouseEnter={e => (e.currentTarget.style.opacity = "1")} onMouseLeave={e => (e.currentTarget.style.opacity = "0.4")}>
            <Pencil size={11} style={{ color: "#6366F1" }} />
          </button>
        )}
        <button onPointerDown={e => e.stopPropagation()} onClick={() => onDelete(item.id)} title="Delete"
          style={{ padding: "3px 6px", borderRadius: 6, background: "transparent", border: "none", cursor: "pointer", opacity: 0.4 }}
          onMouseEnter={e => (e.currentTarget.style.opacity = "1")} onMouseLeave={e => (e.currentTarget.style.opacity = "0.4")}>
          <Trash2 size={11} style={{ color: "#de1a1a" }} />
        </button>
      </div>
    </div>
  )
}

function DraggableCard(props: { item: ContentItem; isDragging: boolean; onAdvance: (item: ContentItem, next: ContentStatus) => void; onDelete: (id: string) => void; onAddPlatform: (item: ContentItem) => void; onEdit: (item: ContentItem) => void }) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({ id: props.item.id, data: { status: props.item.status } })
  const style = transform ? { transform: `translate3d(${transform.x}px,${transform.y}px,0)` } : undefined
  return (
    // Drag handle is the whole card, not just the grip icon — a plain click still
    // reaches the buttons underneath because dnd-kit's activation distance (6px)
    // means "click with no movement" never starts a drag in the first place.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    <div ref={setNodeRef} style={{ ...style, touchAction: "none" }} {...(listeners as any)} {...(attributes as any)} className="cursor-grab active:cursor-grabbing">
      <ContentCardInner item={props.item} isDraggable isDragging={props.isDragging}
        onAdvance={props.onAdvance} onDelete={props.onDelete} onAddPlatform={props.onAddPlatform} onEdit={props.onEdit} />
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

function KanbanEmptyCell({ isOver, accent }: { isOver: boolean; accent: string }) {
  return (
    <div className="flex items-center justify-center py-8 rounded-xl transition-all" style={{ border: `2px dashed ${isOver ? accent : "#E5E7EB"}` }}>
      <p className="text-[11px] font-semibold" style={{ color: isOver ? accent : "#9CA3AF" }}>{isOver ? "Drop here" : "Empty"}</p>
    </div>
  )
}

// ── Shoot kanban card ────────────────────────────────────────────────────────
function ShootCardInner({ shoot, isDragging, onStatus }: {
  shoot: Shoot; isDragging?: boolean; onStatus: (id: string, status: ShootStatus) => void
}) {
  return (
    <div className="rounded-2xl p-3.5 mb-2.5 select-none"
      style={{
        background: isDragging ? "#F3F4F6" : "#FFFFFF",
        boxShadow: isDragging ? "0 8px 24px rgba(0,0,0,0.15)" : "0 2px 10px rgba(0,0,0,0.05)",
        opacity: isDragging ? 0.5 : 1,
      }}>
      <p className="text-[12px] font-bold leading-snug" style={{ color: "#111827", margin: 0 }}>{shoot.legacyTitle}</p>
      <p className="text-[10px]" style={{ color: "#6B7280", margin: "2px 0 0" }}>
        {shoot.client} · {fmtDate(shoot.start_time.split("T")[0])}
      </p>

      {/* Video titles only exist once the shoot is marked Done — that's when they're captured. */}
      {shoot.titles.length > 0 && (
        <div className="flex flex-wrap gap-1" style={{ marginTop: 8 }}>
          {shoot.titles.map(t => (
            <span key={t.id} className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full"
              style={{ background: "rgba(99,102,241,0.08)", color: "#6366F1" }}>
              {t.title}
            </span>
          ))}
        </div>
      )}

      {/* Who's covering the shoot — recorded when it's marked Going. */}
      {shoot.goingByUsers.length > 0 && (
        <div className="flex flex-wrap items-center gap-1" style={{ marginTop: 8 }}>
          {shoot.goingByUsers.map(u => (
            <span key={u.id} className="flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full"
              title={`${u.name} is going`}
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
function AdCardInner({ ad, expanded, isDragging, onToggleExpand, onLogPerformance, onLogCorrection, onDelete }: {
  ad: Ad; expanded?: boolean; isDragging?: boolean
  onToggleExpand: (id: string) => void
  onLogPerformance: (ad: Ad) => void
  onLogCorrection: (ad: Ad) => void
  onDelete: (id: string) => void
}) {
  const latest = latestEntry(ad.performanceEntries)
  const underperforming = isUnderperforming(ad.performanceEntries)

  return (
    <div className="rounded-2xl mb-2.5 select-none" style={{
      background: isDragging ? "#F3F4F6" : "#FFFFFF",
      border: `1px solid ${underperforming ? "#FCA5A5" : "transparent"}`,
      boxShadow: isDragging ? "0 8px 24px rgba(0,0,0,0.15)" : "0 2px 10px rgba(0,0,0,0.05)",
      opacity: isDragging ? 0.5 : 1,
      overflow: "hidden",
    }}>
      <div className="p-3.5 cursor-pointer" onClick={() => onToggleExpand(ad.id)}>
        <div className="flex items-start justify-between gap-2">
          <p className="text-[12px] font-bold leading-snug" style={{ color: "#111827", margin: 0 }}>{ad.ad_name}</p>
          <ChevronDown size={13} className="flex-shrink-0" style={{ color: "#9CA3AF", transform: expanded ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
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
      status: alreadyPosted ? "posted" : "shot",
      ready_platforms: [], scheduled_post_date: null, scheduled_post_time: null,
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
          It&apos;ll queue up in the Posting Log until you mark it Posted.
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
function CompleteShootModal({ shoot, onClose, onCompleted }: {
  shoot: Shoot
  onClose: () => void
  onCompleted: (created: CreatedShootItem[]) => void
}) {
  const [titleInput, setTitleInput] = useState("")
  const [titles, setTitles] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function addTitle() {
    const t = titleInput.trim()
    if (t && !titles.includes(t)) setTitles(prev => [...prev, t])
    setTitleInput("")
  }

  async function submit() {
    if (titles.length === 0) { setError("Add at least one video title"); return }
    setSaving(true); setError(null)
    const res = await completeShootWithTitles(shoot.id, titles)
    setSaving(false)
    if (!res.success) { setError(res.error ?? "Failed to complete shoot"); return }
    onCompleted(res.createdItems ?? [])
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
        {error && <p style={{ fontSize: 11, color: "#DE1A1A", margin: 0 }}>{error}</p>}
        <PrimaryButton onClick={submit} disabled={saving}>
          {saving ? "Saving…" : `Mark Done${titles.length > 0 ? ` (${titles.length} video${titles.length > 1 ? "s" : ""})` : ""}`}
        </PrimaryButton>
      </div>
    </Modal>
  )
}

// ── Main component ───────────────────────────────────────────────────────────
export default function ContentTrackerClient({ initialItems, initialAds, initialShoots, members, currentUserId, clients, pastClients }: Props) {
  const [items, setItems] = useState(initialItems)
  const [ads, setAds] = useState(initialAds)
  const [shoots, setShoots] = useState(initialShoots)
  // Top-level mode (Video / Poster / Ads) with sub-tabs beneath it. Posters aren't shot,
  // so the Shoots sub-tab only exists in Video mode.
  const [mode, setMode] = useState<"video" | "poster" | "ads">("video")
  const [subTab, setSubTab] = useState<"shoots" | "pipeline" | "log">("shoots")
  // Derived rather than reset via an effect — avoids a cascading-render setState-in-effect.
  const tab = mode === "poster" && subTab === "shoots" ? "pipeline" : subTab
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
  const [readyToPostItem, setReadyToPostItem] = useState<ContentItem | null>(null)
  const [goingCrewFor, setGoingCrewFor] = useState<Shoot | null>(null)
  const [shootsClientFilter, setShootsClientFilter] = useState<string>("all")
  // Separate drag state per board — only one board is mounted at a time, but keeping
  // them distinct avoids any chance of a stale id leaking across boards.
  const [shootDragId, setShootDragId] = useState<string | null>(null)
  const [shootOverCol, setShootOverCol] = useState<string | null>(null)
  const [activeShootCol, setActiveShootCol] = useState<ShootStatus>("scheduled")
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
  const [activeMobileCol, setActiveMobileCol] = useState<ContentStatus>("shot")

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

  function colItems(status: ContentStatus) { return pipelineItems.filter(i => i.status === status) }

  function advance(item: ContentItem, next: ContentStatus) {
    if (next === "posted") { setPlatformModalItem(item); return }
    // Ready to Post asks where and when it's going out.
    if (next === "ready") { setReadyToPostItem(item); return }
    // Entering Editing asks who's starting it — that's the accountability moment.
    if (next === "editing" && members.length > 0) { setStartEditingItem(item); return }
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: next, ...(next === "edited" ? { edited_date: new Date().toISOString().split("T")[0] } : {}) } : i))
    startTransition(async () => { await updateContentItemStatus(item.id, next) })
  }

  function handleReadyToPost(item: ContentItem, platforms: Platform[], date: string, time: string) {
    setItems(prev => prev.map(i => i.id === item.id ? {
      ...i, status: "ready",
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

  function handleDeleteItem(id: string) {
    setItems(prev => prev.filter(i => i.id !== id))
    startTransition(async () => { await deleteContentItem(id) })
  }

  function handleDragStart(e: DragStartEvent) { setDragId(String(e.active.id)) }
  function handleDragOver(e: { over: { id: string } | null }) { setOverCol(e.over?.id ?? null) }
  function handleDragEnd(e: DragEndEvent) {
    const overId = e.over?.id as ContentStatus | undefined
    if (overId && STATUS_ORDER.includes(overId)) {
      const item = items.find(i => i.id === e.active.id)
      if (item && item.status !== overId) advance(item, overId)
    }
    setDragId(null); setOverCol(null)
  }

  const draggedItem = items.find(i => i.id === dragId)

  // Stats — global totals, always unfiltered (shown in the hero chips)
  const stats = useMemo(() => {
    const shot = items.filter(i => i.status === "shot").length
    const editing = items.filter(i => i.status === "editing").length
    const edited = items.filter(i => i.status === "edited").length
    const ready = items.filter(i => i.status === "ready").length
    const posted = items.filter(i => i.status === "posted").length
    const totalPosts = items.reduce((s, i) => s + i.posts.length, 0)
    return { shot, editing, edited, ready, posted, totalPosts }
  }, [items])

  // The "what's due next" queue — items scheduled into Ready to Post, soonest first.
  const readyQueue = useMemo(
    () => items
      .filter(i => i.status === "ready" && i.content_type === contentTypeForMode && i.scheduled_post_date)
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

  function handleShootCompleted(shootId: string, created: CreatedShootItem[]) {
    const newItems: ContentItem[] = created.map(ci => ({
      id: ci.id, client_name: ci.client_name, title: ci.title, content_type: "video",
      status: "shot", shot_date: ci.shot_date, edited_date: null, notes: ci.notes,
      ready_platforms: [], scheduled_post_date: null, scheduled_post_time: null,
      created_at: new Date().toISOString(), posts: [],
    }))
    setItems(prev => [...newItems, ...prev])
    setShoots(prev => prev.map(s => s.id === shootId ? {
      ...s,
      status: "completed",
      titles: created.map(ci => ({ id: ci.shoot_title_id, title: ci.title, content_item_id: ci.id })),
    } : s))
    setCompleteShootFor(null)
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
      const fallback: ContentStatus = i.scheduled_post_date ? "ready" : "edited"
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
          { icon: <Video size={11} />, label: `${stats.shot + stats.editing + stats.edited} in pipeline` },
          { icon: <CalendarDays size={11} />, label: `${stats.ready} ready to post` },
          { icon: <Check size={11} />, label: `${stats.posted} posted` },
          { icon: <Megaphone size={11} />, label: `${ads.filter(a => a.status === "active").length} active ads` },
        ]}
      />

      <TabToggle active={mode} onChange={k => setMode(k as typeof mode)} tabs={[
        { key: "video", label: "Video", icon: Video },
        { key: "poster", label: "Poster", icon: ImageIcon },
        { key: "ads", label: "Ads", icon: Megaphone },
      ]} />

      {mode !== "ads" && (
        <TabToggle active={tab} onChange={k => setSubTab(k as typeof subTab)} tabs={[
          ...(mode === "video" ? [{ key: "shoots", label: "Shoots", icon: Camera }] : []),
          { key: "pipeline", label: "Pipeline", icon: Layers },
          { key: "log", label: "Posting Log", icon: History },
        ]} />
      )}

      {mode !== "ads" && tab === "pipeline" && (
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
            {STATUS_ORDER.map(s => (
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
              <ContentCardInner key={item.id} item={item} onAdvance={advance} onDelete={handleDeleteItem} onAddPlatform={setPlatformModalItem} onEdit={setEditingItem} />
            ))}
          </div>

          <div className="hidden md:block">
            <DndContext sensors={sensors} onDragStart={handleDragStart} onDragOver={handleDragOver as never} onDragEnd={handleDragEnd}>
              <div className="grid grid-cols-5 gap-3">
                {STATUS_ORDER.map(status => {
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
                          <DraggableCard key={item.id} item={item} isDragging={dragId === item.id} onAdvance={advance} onDelete={handleDeleteItem} onAddPlatform={setPlatformModalItem} onEdit={setEditingItem} />
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

      {mode !== "ads" && tab === "log" && (
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
                        <td style={{ padding: "9px 14px", textAlign: "center", fontWeight: 800, color: STATUS_CFG.shot.accent }}>{row.unedited}</td>
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
                onDelete={handleDeleteAd} />
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
                              onDelete={handleDeleteAd} />
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
              <ShootCardInner key={shoot.id} shoot={shoot} onStatus={handleShootStatus} />
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
                            <ShootCardInner shoot={shoot} isDragging={shootDragId === shoot.id} onStatus={handleShootStatus} />
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
        <CompleteShootModal shoot={completeShootFor} onClose={() => setCompleteShootFor(null)}
          onCompleted={created => handleShootCompleted(completeShootFor.id, created)} />
      )}
      {startEditingItem && (
        <StartEditingModal item={startEditingItem} members={members} currentUserId={currentUserId}
          onClose={() => setStartEditingItem(null)}
          onConfirm={(editorId, editorName) => handleStartEditing(startEditingItem, editorId, editorName)} />
      )}
      {readyToPostItem && (
        <ReadyToPostModal item={readyToPostItem} onClose={() => setReadyToPostItem(null)}
          onScheduled={(platforms, date, time) => handleReadyToPost(readyToPostItem, platforms, date, time)} />
      )}
      {goingCrewFor && (
        <GoingCrewModal shoot={goingCrewFor} members={members} currentUserId={currentUserId}
          onClose={() => setGoingCrewFor(null)}
          onConfirm={crew => handleGoingCrew(goingCrewFor.id, crew)} />
      )}
    </div>
  )
}
