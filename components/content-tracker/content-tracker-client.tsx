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
  Layers, History, ArrowRight, Check, ChevronDown, Megaphone, Target,
} from "lucide-react"
import { PageHero } from "@/components/admin/PageHero"
import ClientSelector from "@/components/ui/ClientSelector"
import { buildClientOptions } from "@/lib/utils/client-options"
import {
  createContentItem, updateContentItem, updateContentItemStatus, deleteContentItem,
  addContentPost, deleteContentPost,
  createAd, updateAdStatus, deleteAd, addAdRevision,
} from "@/lib/actions/content-tracker"

// ── Types ────────────────────────────────────────────────────────────────────
type Platform = "instagram" | "youtube" | "facebook" | "linkedin" | "gmb"
type ContentStatus = "shot" | "editing" | "edited" | "posted"
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
}

type Props = {
  initialItems: ContentItem[]
  initialAds: Ad[]
  currentUserId: string
  clients: { id: string; name: string }[]
  pastClients: { id: string; name: string }[]
}

// ── Design tokens ────────────────────────────────────────────────────────────
const STATUS_CFG: Record<ContentStatus, { label: string; accent: string }> = {
  shot:    { label: "Shot",    accent: "#F59E0B" },
  editing: { label: "Editing", accent: "#6366F1" },
  edited:  { label: "Edited",  accent: "#9B6BFF" },
  posted:  { label: "Posted",  accent: "#22C55E" },
}
const STATUS_ORDER: ContentStatus[] = ["shot", "editing", "edited", "posted"]

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

const LABEL: React.CSSProperties = {
  display: "block", fontSize: 10, fontWeight: 700, color: "#4A5568",
  textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 5,
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

function StatChip({ label, value, color }: { label: string; value: number | string; color: string }) {
  return (
    <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 16, padding: "12px 16px", flex: "1 1 120px", minWidth: 100 }}>
      <p style={{ fontSize: 22, fontWeight: 900, color, margin: 0, letterSpacing: "-0.02em" }}>{value}</p>
      <p style={{ fontSize: 10, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.06em", margin: "2px 0 0" }}>{label}</p>
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
        {item.editedByUser && (
          <div className="flex items-center gap-1" title={`Edited by ${item.editedByUser.name}`}>
            <div className="w-4 h-4 rounded-full flex items-center justify-center text-[7px] font-black flex-shrink-0" style={{ background: "#9B6BFF", color: "#fff" }}>
              {initials(item.editedByUser.name)}
            </div>
          </div>
        )}
        <span className="text-[9px]" style={{ color: "#9CA3AF" }}>{fmtDate(item.shot_date)}</span>
      </div>

      {item.status !== "posted" && (
        <button
          onPointerDown={e => e.stopPropagation()}
          onClick={() => onAdvance(item, STATUS_ORDER[STATUS_ORDER.indexOf(item.status) + 1])}
          className="w-full py-1.5 rounded-xl text-[9px] font-bold transition-all hover:opacity-80 flex items-center justify-center gap-1"
          style={{ background: `${STATUS_CFG[STATUS_ORDER[STATUS_ORDER.indexOf(item.status) + 1]].accent}14`, color: STATUS_CFG[STATUS_ORDER[STATUS_ORDER.indexOf(item.status) + 1]].accent }}>
          {item.status === "edited" ? <>Post Now <ArrowRight size={10} /></> : <>Move to {STATUS_CFG[STATUS_ORDER[STATUS_ORDER.indexOf(item.status) + 1]].label} <ArrowRight size={10} /></>}
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

// ── New Content modal ────────────────────────────────────────────────────────
function NewContentModal({ clients, pastClients, onClose, onCreated }: {
  clients: { id: string; name: string }[]; pastClients: { id: string; name: string }[]
  onClose: () => void; onCreated: (item: ContentItem) => void
}) {
  const { activeOptions: activeClientOptions, pastOptions: pastClientOptions } = useMemo(
    () => buildClientOptions(clients.map(c => c.name), pastClients.map(c => c.name)),
    [clients, pastClients]
  )
  const [client, setClient] = useState("")
  const [title, setTitle] = useState("")
  const [contentType, setContentType] = useState<"video" | "poster">("video")
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
          <label style={LABEL}>Content Type</label>
          <div style={{ display: "flex", gap: 8 }}>
            {(["video", "poster"] as const).map(t => (
              <button key={t} onClick={() => setContentType(t)}
                style={{ flex: 1, padding: "8px 10px", borderRadius: 10, border: `1.5px solid ${contentType === t ? "#6366F1" : "#E5E7EB"}`, background: contentType === t ? "rgba(99,102,241,0.08)" : "#fff", color: contentType === t ? "#6366F1" : "#6B7280", fontSize: 12, fontWeight: 700, cursor: "pointer", textTransform: "capitalize" }}>
                {t}
              </button>
            ))}
          </div>
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
          <span style={{ fontSize: 10, color: "#9CA3AF" }}>— skip Editing/Edited, log it straight as Posted</span>
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
  const [contentType, setContentType] = useState<"video" | "poster">(item.content_type)
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
          <label style={LABEL}>Content Type</label>
          <div style={{ display: "flex", gap: 8 }}>
            {(["video", "poster"] as const).map(t => (
              <button key={t} onClick={() => setContentType(t)}
                style={{ flex: 1, padding: "8px 10px", borderRadius: 10, border: `1.5px solid ${contentType === t ? "#6366F1" : "#E5E7EB"}`, background: contentType === t ? "rgba(99,102,241,0.08)" : "#fff", color: contentType === t ? "#6366F1" : "#6B7280", fontSize: 12, fontWeight: 700, cursor: "pointer", textTransform: "capitalize" }}>
                {t}
              </button>
            ))}
          </div>
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
function AddPlatformModal({ item, onClose, onAdded }: { item: ContentItem; onClose: () => void; onAdded: (post: ContentPost) => void }) {
  const [platform, setPlatform] = useState<Platform>("instagram")
  const [postedDate, setPostedDate] = useState(new Date().toISOString().split("T")[0])
  const [postLink, setPostLink] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const already = new Set(item.posts.map(p => p.platform))

  async function submit() {
    setSaving(true); setError(null)
    const res = await addContentPost({ content_item_id: item.id, platform, posted_date: postedDate, post_link: postLink.trim() || undefined })
    setSaving(false)
    if (!res.success || !res.id) { setError(res.error ?? "Failed to save"); return }
    onAdded({ id: res.id, content_item_id: item.id, platform, posted_date: postedDate, post_link: postLink.trim() || null })
  }

  return (
    <Modal title={`Post "${item.title}"`} onClose={onClose}>
      <div className="flex flex-col gap-3">
        <div>
          <label style={LABEL}>Platform *</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {(Object.keys(PLATFORM_CFG) as Platform[]).map(p => {
              const cfg = PLATFORM_CFG[p]
              const Icon = cfg.icon
              const done = already.has(p)
              return (
                <button key={p} onClick={() => setPlatform(p)} disabled={done}
                  style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 10, border: `1.5px solid ${platform === p ? cfg.color : "#E5E7EB"}`, background: platform === p ? `${cfg.color}14` : done ? "#F9FAFB" : "#fff", color: done ? "#D1D5DB" : platform === p ? cfg.color : "#6B7280", fontSize: 11, fontWeight: 700, cursor: done ? "not-allowed" : "pointer" }}>
                  <Icon size={12} /> {cfg.label} {done && <Check size={10} />}
                </button>
              )
            })}
          </div>
        </div>
        <div>
          <label style={LABEL}>Posted Date *</label>
          <input type="date" style={FIELD} value={postedDate} onChange={e => setPostedDate(e.target.value)} />
        </div>
        <div>
          <label style={LABEL}>Post Link</label>
          <input style={FIELD} value={postLink} onChange={e => setPostLink(e.target.value)} placeholder="Optional URL" />
        </div>
        {error && <p style={{ fontSize: 11, color: "#DE1A1A", margin: 0 }}>{error}</p>}
        <PrimaryButton onClick={submit} disabled={saving}>{saving ? "Saving…" : "Confirm Posted"}</PrimaryButton>
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

// ── Main component ───────────────────────────────────────────────────────────
export default function ContentTrackerClient({ initialItems, initialAds, clients, pastClients }: Props) {
  const [items, setItems] = useState(initialItems)
  const [ads, setAds] = useState(initialAds)
  const [tab, setTab] = useState<"pipeline" | "log" | "ads">("pipeline")
  const [, startTransition] = useTransition()

  const [dragId, setDragId] = useState<string | null>(null)
  const [overCol, setOverCol] = useState<string | null>(null)
  const [showNewContent, setShowNewContent] = useState(false)
  const [platformModalItem, setPlatformModalItem] = useState<ContentItem | null>(null)
  const [editingItem, setEditingItem] = useState<ContentItem | null>(null)
  const [showNewAd, setShowNewAd] = useState(false)
  const [revisionModalAd, setRevisionModalAd] = useState<Ad | null>(null)
  const [expandedAd, setExpandedAd] = useState<string | null>(null)
  const [logSearch, setLogSearch] = useState("")
  const [logPlatformFilter, setLogPlatformFilter] = useState<Platform | "all">("all")
  const [logClientFilter, setLogClientFilter] = useState<string>("all")
  const [logMonthFilter, setLogMonthFilter] = useState<string>("all")
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

  // The item's own "current stage" date — shot/editing bucket by shot date,
  // edited bucket by edited date, posted bucket by its (latest) post date.
  function itemMonthBucket(item: ContentItem): string | null {
    if (item.status === "posted") {
      const dates = item.posts.map(p => p.posted_date).sort()
      return dates.length ? dates[dates.length - 1].slice(0, 7) : null
    }
    if (item.status === "edited") return item.edited_date ? item.edited_date.slice(0, 7) : null
    return item.shot_date ? item.shot_date.slice(0, 7) : null
  }

  const pipelineItems = useMemo(() => {
    return items.filter(i => {
      if (pipelineClientFilter !== "all" && i.client_name !== pipelineClientFilter) return false
      if (pipelineMonthFilter !== "all" && itemMonthBucket(i) !== pipelineMonthFilter) return false
      return true
    })
  }, [items, pipelineClientFilter, pipelineMonthFilter])

  function colItems(status: ContentStatus) { return pipelineItems.filter(i => i.status === status) }

  function advance(item: ContentItem, next: ContentStatus) {
    if (next === "posted") { setPlatformModalItem(item); return }
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: next, ...(next === "edited" ? { edited_date: new Date().toISOString().split("T")[0] } : {}) } : i))
    startTransition(async () => { await updateContentItemStatus(item.id, next) })
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
    const posted = items.filter(i => i.status === "posted").length
    const totalPosts = items.reduce((s, i) => s + i.posts.length, 0)
    return { shot, editing, edited, posted, totalPosts }
  }, [items])

  // Same shape but respecting the Pipeline tab's own client/month filter — used by its stat cards
  const pipelineStats = useMemo(() => ({
    shot: pipelineItems.filter(i => i.status === "shot").length,
    editing: pipelineItems.filter(i => i.status === "editing").length,
    edited: pipelineItems.filter(i => i.status === "edited").length,
    posted: pipelineItems.filter(i => i.status === "posted").length,
  }), [pipelineItems])

  // Posting log — one row per content item (not per platform); platforms shown as badges within the row
  const postedItems = useMemo(() => items.filter(i => i.posts.length > 0), [items])
  const logClientOptions = allClientOptions
  const logMonthOptions = allMonthOptions

  // Per-client KPI strip: Posted / Unposted (edited, awaiting a platform) / Unedited (shot or editing)
  // — bucketed by whichever date is relevant to that item's current stage, so "All Time" vs a
  // specific month both mean something for items that haven't reached posting yet.
  const clientKPIs = useMemo(() => {
    const inMonth = (d: string | null) => logMonthFilter === "all" || (!!d && d.slice(0, 7) === logMonthFilter)
    const map = new Map<string, { posted: number; unposted: number; unedited: number }>()
    for (const item of items) {
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
  }, [items, logMonthFilter])

  const logRows = useMemo(() => {
    let rows = postedItems
    if (logPlatformFilter !== "all") rows = rows.filter(i => i.posts.some(p => p.platform === logPlatformFilter))
    if (logClientFilter !== "all") rows = rows.filter(i => i.client_name === logClientFilter)
    if (logMonthFilter !== "all") rows = rows.filter(i => i.posts.some(p => p.posted_date.slice(0, 7) === logMonthFilter))
    if (logSearch) rows = rows.filter(i => `${i.title} ${i.client_name}`.toLowerCase().includes(logSearch.toLowerCase()))
    return [...rows].sort((a, b) => {
      const aLatest = a.posts.map(p => p.posted_date).sort().reverse()[0]
      const bLatest = b.posts.map(p => p.posted_date).sort().reverse()[0]
      return bLatest.localeCompare(aLatest)
    })
  }, [postedItems, logSearch, logPlatformFilter, logClientFilter, logMonthFilter])

  function handlePostAdded(post: ContentPost) {
    setItems(prev => prev.map(i => i.id === post.content_item_id ? { ...i, status: "posted", posts: [...i.posts, post] } : i))
    setPlatformModalItem(null)
  }

  function handleDeletePost(postId: string, contentItemId: string) {
    setItems(prev => prev.map(i => {
      if (i.id !== contentItemId) return i
      const posts = i.posts.filter(p => p.id !== postId)
      return { ...i, posts, status: posts.length === 0 ? "edited" : i.status }
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
          { icon: <Check size={11} />, label: `${stats.posted} posted` },
          { icon: <Megaphone size={11} />, label: `${ads.filter(a => a.status === "active").length} active ads` },
        ]}
      />

      <TabToggle active={tab} onChange={k => setTab(k as typeof tab)} tabs={[
        { key: "pipeline", label: "Pipeline", icon: Layers },
        { key: "log", label: "Posting Log", icon: History },
        { key: "ads", label: "Ads Tracker", icon: Megaphone },
      ]} />

      {tab === "pipeline" && (
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
              <select value={pipelineMonthFilter} onChange={e => setPipelineMonthFilter(e.target.value)}
                style={{ ...FIELD, width: "auto", cursor: "pointer" }}>
                <option value="all">All Time</option>
                {allMonthOptions.map(m => <option key={m} value={m}>{fmtMonth(m)}</option>)}
              </select>
            </div>
            <button onClick={() => setShowNewContent(true)}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 16px", borderRadius: 12, border: "none", background: "linear-gradient(135deg,#FF4D4D,#DE1A1A)", color: "#fff", fontSize: 12, fontWeight: 800, cursor: "pointer" }}>
              <Plus size={14} /> New Content
            </button>
          </div>

          <div className="flex gap-2 flex-wrap">
            <StatChip label="Shot" value={pipelineStats.shot} color={STATUS_CFG.shot.accent} />
            <StatChip label="Editing" value={pipelineStats.editing} color={STATUS_CFG.editing.accent} />
            <StatChip label="Edited" value={pipelineStats.edited} color={STATUS_CFG.edited.accent} />
            <StatChip label="Posted" value={pipelineStats.posted} color={STATUS_CFG.posted.accent} />
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
              <p style={{ fontSize: 12, color: "#9CA3AF", textAlign: "center", padding: "24px 0" }}>No items</p>
            ) : colItems(activeMobileCol).map(item => (
              <ContentCardInner key={item.id} item={item} onAdvance={advance} onDelete={handleDeleteItem} onAddPlatform={setPlatformModalItem} onEdit={setEditingItem} />
            ))}
          </div>

          <div className="hidden md:block">
            <DndContext sensors={sensors} onDragStart={handleDragStart} onDragOver={handleDragOver as never} onDragEnd={handleDragEnd}>
              <div className="grid grid-cols-4 gap-4">
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
                            <p className="text-[11px]" style={{ color: overCol === status ? cfg.accent : "#D1D5DB" }}>{overCol === status ? "Drop here" : "No items"}</p>
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

      {tab === "log" && (
        <div className="flex flex-col gap-4">
          <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 18, overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderBottom: "1px solid #F3F4F6" }}>
              <span style={{ fontSize: 11, fontWeight: 800, color: "#111827", textTransform: "uppercase", letterSpacing: "0.06em" }}>Per-Client KPIs</span>
              <select value={logMonthFilter} onChange={e => setLogMonthFilter(e.target.value)}
                style={{ ...FIELD, width: "auto", cursor: "pointer", padding: "5px 10px", fontSize: 11 }}>
                <option value="all">All Time</option>
                {logMonthOptions.map(m => <option key={m} value={m}>{fmtMonth(m)}</option>)}
              </select>
            </div>
            {clientKPIs.length === 0 ? (
              <p style={{ fontSize: 12, color: "#9CA3AF", textAlign: "center", padding: "20px 0", margin: 0 }}>No activity {logMonthFilter === "all" ? "yet" : `in ${fmtMonth(logMonthFilter)}`}</p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: "#F9FAFB" }}>
                      {["Client", "Posted", "Unposted", "Unedited"].map(h => (
                        <th key={h} style={{ textAlign: h === "Client" ? "left" : "center", padding: "8px 14px", fontSize: 10, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.06em" }}>{h}</th>
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
                    {["Video/Poster", "Client", "Type", "Platforms", "Posted Date"].map(h => (
                      <th key={h} style={{ textAlign: "left", padding: "10px 14px", fontSize: 10, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.06em" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {logRows.length === 0 ? (
                    <tr><td colSpan={5} style={{ padding: "32px 14px", textAlign: "center", color: "#9CA3AF", fontSize: 12 }}>No posts logged yet</td></tr>
                  ) : logRows.map(item => (
                    <tr key={item.id} style={{ borderBottom: "1px solid #F3F4F6" }}>
                      <td style={{ padding: "10px 14px", fontWeight: 700, color: "#111827" }}>{item.title}</td>
                      <td style={{ padding: "10px 14px", color: "#6366F1", fontWeight: 600 }}>{item.client_name}</td>
                      <td style={{ padding: "10px 14px", color: "#6B7280", textTransform: "capitalize" }}>{item.content_type}</td>
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
                      <td style={{ padding: "10px 14px", color: "#374151" }}>{fmtDateRange(item.posts.map(p => p.posted_date))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {tab === "ads" && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-end">
            <button onClick={() => setShowNewAd(true)}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 16px", borderRadius: 12, border: "none", background: "linear-gradient(135deg,#FF4D4D,#DE1A1A)", color: "#fff", fontSize: 12, fontWeight: 800, cursor: "pointer" }}>
              <Plus size={14} /> New Ad
            </button>
          </div>

          {ads.length === 0 ? (
            <div style={{ background: "#fff", border: "1px dashed #E5E7EB", borderRadius: 18, padding: "40px 20px", textAlign: "center" }}>
              <Megaphone size={24} style={{ color: "#D1D5DB", margin: "0 auto 8px" }} />
              <p style={{ fontSize: 12, color: "#9CA3AF", margin: 0 }}>No ads tracked yet</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {ads.map(ad => {
                const expanded = expandedAd === ad.id
                const statusCfg = AD_STATUS_CFG[ad.status]
                return (
                  <div key={ad.id} style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 18, overflow: "hidden" }}>
                    <div style={{ padding: "14px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10, cursor: "pointer" }}
                      onClick={() => setExpandedAd(expanded ? null : ad.id)}>
                      <div style={{ minWidth: 0 }}>
                        <p style={{ fontSize: 13, fontWeight: 800, color: "#111827", margin: 0 }}>{ad.ad_name}</p>
                        <p style={{ fontSize: 11, color: "#9CA3AF", margin: "2px 0 0" }}>{ad.client_name} · {ad.platform} · Launched {fmtDate(ad.launch_date)}</p>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 10px", borderRadius: 99, background: "rgba(99,102,241,0.1)", color: "#6366F1" }}>
                          <Target size={10} className="inline mr-1" />{ad.hook_count} hooks
                        </span>
                        {ad.targeting_type && (
                          <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 10px", borderRadius: 99, background: `${TARGETING_CFG[ad.targeting_type].color}14`, color: TARGETING_CFG[ad.targeting_type].color }}>
                            {TARGETING_CFG[ad.targeting_type].label}
                          </span>
                        )}
                        <select value={ad.status} onClick={e => e.stopPropagation()}
                          onChange={e => {
                            const next = e.target.value as AdStatus
                            setAds(prev => prev.map(a => a.id === ad.id ? { ...a, status: next } : a))
                            startTransition(async () => { await updateAdStatus(ad.id, next) })
                          }}
                          style={{ fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 99, background: `${statusCfg.color}14`, color: statusCfg.color, border: "none", cursor: "pointer" }}>
                          {(Object.keys(AD_STATUS_CFG) as AdStatus[]).map(s => <option key={s} value={s}>{AD_STATUS_CFG[s].label}</option>)}
                        </select>
                        <ChevronDown size={14} style={{ color: "#9CA3AF", transform: expanded ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
                      </div>
                    </div>
                    {expanded && (
                      <div style={{ padding: "0 18px 18px", borderTop: "1px solid #F3F4F6" }}>
                        {ad.targeting_notes && (
                          <p style={{ fontSize: 11, color: "#6B7280", margin: "12px 0" }}>{ad.targeting_notes}</p>
                        )}
                        <div className="flex items-center justify-between" style={{ marginTop: 12, marginBottom: 8 }}>
                          <span style={{ fontSize: 10, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.06em" }}>Correction History</span>
                          <button onClick={() => setRevisionModalAd(ad)}
                            style={{ display: "flex", alignItems: "center", gap: 4, padding: "5px 10px", borderRadius: 8, border: "none", background: "rgba(99,102,241,0.08)", color: "#6366F1", fontSize: 10, fontWeight: 700, cursor: "pointer" }}>
                            <Plus size={11} /> Log Correction
                          </button>
                        </div>
                        {ad.revisions.length === 0 ? (
                          <p style={{ fontSize: 11, color: "#D1D5DB" }}>No corrections logged yet</p>
                        ) : (
                          <div className="flex flex-col gap-2">
                            {ad.revisions.map(rev => (
                              <div key={rev.id} style={{ padding: "8px 12px", borderRadius: 10, background: "#F9FAFB", border: "1px solid #F3F4F6" }}>
                                <div className="flex items-center justify-between">
                                  <span style={{ fontSize: 10, fontWeight: 700, color: "#374151" }}>{fmtDate(rev.revision_date)}</span>
                                  <div className="flex gap-1">
                                    {rev.hook_count_after !== null && <span style={{ fontSize: 9, fontWeight: 700, color: "#6366F1" }}>{rev.hook_count_after} hooks</span>}
                                    {rev.targeting_type_after && <span style={{ fontSize: 9, fontWeight: 700, color: TARGETING_CFG[rev.targeting_type_after].color }}>· {TARGETING_CFG[rev.targeting_type_after].label}</span>}
                                  </div>
                                </div>
                                <p style={{ fontSize: 11, color: "#6B7280", margin: "4px 0 0" }}>{rev.notes}</p>
                              </div>
                            ))}
                          </div>
                        )}
                        <button onClick={() => { if (confirm("Delete this ad?")) { setAds(prev => prev.filter(a => a.id !== ad.id)); startTransition(async () => { await deleteAd(ad.id) }) } }}
                          style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 4, padding: "5px 10px", borderRadius: 8, border: "none", background: "rgba(222,26,26,0.06)", color: "#de1a1a", fontSize: 10, fontWeight: 700, cursor: "pointer" }}>
                          <Trash2 size={11} /> Delete Ad
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {showNewContent && (
        <NewContentModal clients={clients} pastClients={pastClients} onClose={() => setShowNewContent(false)}
          onCreated={item => { setItems(prev => [item, ...prev]); setShowNewContent(false) }} />
      )}
      {platformModalItem && (
        <AddPlatformModal item={platformModalItem} onClose={() => setPlatformModalItem(null)} onAdded={handlePostAdded} />
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
    </div>
  )
}
