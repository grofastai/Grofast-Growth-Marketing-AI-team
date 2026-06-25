// Shared design tokens for the Support surfaces (member chat + handler inbox).
// One accent (brand red) + a disciplined 4-step status scale. Categories are
// quiet monochrome chips with an emoji, never a rainbow.

export type StatusKey = 'open' | 'in_progress' | 'resolved' | 'closed'

export const STATUS: Record<StatusKey, {
  label: string
  color: string   // text / dot
  bg: string      // soft chip background
  ring: string    // ribbon track fill
}> = {
  open:        { label: 'Open',        color: '#DE1A1A', bg: 'rgba(222,26,26,0.10)', ring: '#DE1A1A' },
  in_progress: { label: 'In Progress', color: '#D97706', bg: 'rgba(245,158,11,0.14)', ring: '#F59E0B' },
  resolved:    { label: 'Resolved',    color: '#15803D', bg: 'rgba(34,197,94,0.12)',  ring: '#22C55E' },
  closed:      { label: 'Closed',      color: '#6B7280', bg: 'rgba(130,133,140,0.14)', ring: '#9CA3AF' },
}

export function statusOf(s: string) {
  return STATUS[(s as StatusKey)] ?? STATUS.closed
}

// Ribbon progression — order the request moves through.
export const STATUS_FLOW: StatusKey[] = ['open', 'in_progress', 'resolved']

export const PRIORITY: Record<string, { label: string; color: string; bg: string }> = {
  low:    { label: 'Low',    color: '#6B7280', bg: 'rgba(130,133,140,0.12)' },
  medium: { label: 'Medium', color: '#D97706', bg: 'rgba(245,158,11,0.12)' },
  normal: { label: 'Normal', color: '#2563EB', bg: 'rgba(37,99,235,0.10)' },
  high:   { label: 'High',   color: '#DE1A1A', bg: 'rgba(222,26,26,0.10)' },
  urgent: { label: 'Urgent', color: '#DE1A1A', bg: 'rgba(222,26,26,0.16)' },
}

export function priorityOf(p: string) {
  return PRIORITY[p] ?? PRIORITY.normal
}

export type Category = { key: string; label: string; emoji: string }

export const CATEGORIES: Category[] = [
  { key: 'attendance', label: 'Attendance',    emoji: '📅' },
  { key: 'leave',      label: 'Leave',         emoji: '🌴' },
  { key: 'task',       label: 'Task',          emoji: '✅' },
  { key: 'client',     label: 'Client',        emoji: '🤝' },
  { key: 'payment',    label: 'Payment',       emoji: '💰' },
  { key: 'freelancer', label: 'Freelancer',    emoji: '👷' },
  { key: 'design',     label: 'Design',        emoji: '🎨' },
  { key: 'video',      label: 'Video Editing', emoji: '🎬' },
  { key: 'marketing',  label: 'Marketing',     emoji: '📢' },
  { key: 'automation', label: 'Automation',    emoji: '🤖' },
  { key: 'other',      label: 'Other',         emoji: '📋' },
]

export function categoryOf(key: string): Category {
  return CATEGORIES.find(c => c.key === key) ?? { key, label: key, emoji: '📋' }
}

export const PRIORITY_OPTIONS = ['low', 'medium', 'high', 'urgent'] as const

// Brand gradient used across the app's hero banners (matches the Profile banner).
export const HERO_GRADIENT = 'linear-gradient(135deg, #DE1A1A 0%, #8B1212 55%, #1A0808 100%)'

// Relative time helper shared by both surfaces.
export function timeAgo(iso: string): string {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  return `${d}d ago`
}

export function ticketNum(i: number): string {
  return `#TKT-${String(1001 + i).padStart(5, '0')}`
}
