'use client'

import Link from 'next/link'
import {
  Bell, CheckCircle2, ClipboardList, Megaphone, LifeBuoy,
  MessageSquare, ArrowRight, PartyPopper,
} from 'lucide-react'

export interface NotificationRow {
  id: string
  type: string
  title: string
  body: string | null
  read: boolean
  link: string | null
  created_at: string
}

type NotifMeta = { icon: React.ReactNode; bg: string; label: string }

function getTypeMeta(type: string): NotifMeta {
  switch (type) {
    case 'leave_status':
      return { icon: <CheckCircle2 size={18} style={{ color: '#10B981' }} />, bg: 'rgba(16,185,129,0.12)', label: 'Leave' }
    case 'task_assigned':
      return { icon: <ClipboardList size={18} style={{ color: '#6366F1' }} />, bg: 'rgba(99,102,241,0.12)', label: 'Task' }
    case 'task_comment':
      return { icon: <MessageSquare size={18} style={{ color: '#6366F1' }} />, bg: 'rgba(99,102,241,0.12)', label: 'Task' }
    case 'announcement':
      return { icon: <Megaphone size={18} style={{ color: '#F59E0B' }} />, bg: 'rgba(245,158,11,0.12)', label: 'Announcement' }
    case 'support_reply':
      return { icon: <LifeBuoy size={18} style={{ color: '#DE1A1A' }} />, bg: 'rgba(222,26,26,0.10)', label: 'Support' }
    case 'task_completed':
      return { icon: <CheckCircle2 size={18} style={{ color: '#22C55E' }} />, bg: 'rgba(34,197,94,0.12)', label: 'Task Done' }
    case 'holiday_reminder':
      return { icon: <PartyPopper size={18} style={{ color: '#8B5CF6' }} />, bg: 'rgba(139,92,246,0.12)', label: 'Holiday' }
    default:
      return { icon: <Bell size={18} style={{ color: '#9CA3AF' }} />, bg: 'rgba(156,163,175,0.12)', label: 'Notification' }
  }
}

export function NotificationItem({ n }: { n: NotificationRow }) {
  const meta = getTypeMeta(n.type)

  const card = (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 14, padding: '16px 20px',
      background: n.read ? '#FFFFFF' : 'rgba(222,26,26,0.03)',
      borderBottom: '1px solid #F3F4F6',
      transition: 'background 0.15s',
      cursor: n.link ? 'pointer' : 'default',
    }}>
      <div style={{ paddingTop: 4, flexShrink: 0 }}>
        {!n.read && (
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#DE1A1A' }} />
        )}
        {n.read && <div style={{ width: 8, height: 8 }} />}
      </div>

      <div style={{
        width: 42, height: 42, borderRadius: 14, background: meta.bg,
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        {meta.icon}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            {meta.label}
          </span>
          <span style={{ fontSize: 10, color: '#D1D5DB' }}>·</span>
          <span style={{ fontSize: 10, color: '#9CA3AF' }}>{timeAgo(n.created_at)}</span>
        </div>
        <p style={{ fontSize: 14, fontWeight: 700, color: '#111111', margin: '0 0 3px', lineHeight: 1.4 }}>{n.title}</p>
        {n.body && (
          <p style={{ fontSize: 12, color: '#6B7280', margin: 0, lineHeight: 1.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {n.body}
          </p>
        )}
      </div>

      {n.link && (
        <div style={{
          flexShrink: 0, width: 32, height: 32, borderRadius: 10,
          background: 'rgba(222,26,26,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          marginTop: 4,
        }}>
          <ArrowRight size={14} style={{ color: '#DE1A1A' }} />
        </div>
      )}
    </div>
  )

  if (n.link) {
    return (
      <Link href={n.link} style={{ textDecoration: 'none', display: 'block' }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#FAFAFA' }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}>
        {card}
      </Link>
    )
  }
  return <>{card}</>
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d ago`
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}
