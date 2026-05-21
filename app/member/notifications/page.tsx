import { getAllNotifications, markAllRead, type NotificationRow } from '@/lib/actions/notifications'
import {
  Bell, CheckCircle2, ClipboardList, Megaphone, LifeBuoy,
  MessageSquare, ChevronRight, ArrowRight,
} from 'lucide-react'
import Link from 'next/link'

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

function groupNotifications(rows: NotificationRow[]) {
  const now = new Date()
  const todayStr = now.toDateString()
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  const today: NotificationRow[] = []
  const thisWeek: NotificationRow[] = []
  const earlier: NotificationRow[] = []
  for (const r of rows) {
    const d = new Date(r.created_at)
    if (d.toDateString() === todayStr) today.push(r)
    else if (d >= weekAgo) thisWeek.push(r)
    else earlier.push(r)
  }
  return { today, thisWeek, earlier }
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
    default:
      return { icon: <Bell size={18} style={{ color: '#9CA3AF' }} />, bg: 'rgba(156,163,175,0.12)', label: 'Notification' }
  }
}

function NotificationItem({ n }: { n: NotificationRow }) {
  const meta = getTypeMeta(n.type)

  const card = (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 14, padding: '16px 20px',
      background: n.read ? '#FFFFFF' : 'rgba(222,26,26,0.03)',
      borderBottom: '1px solid #F3F4F6',
      transition: 'background 0.15s',
      cursor: n.link ? 'pointer' : 'default',
    }}>
      {/* Unread dot */}
      <div style={{ paddingTop: 4, flexShrink: 0 }}>
        {!n.read && (
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#DE1A1A', marginBottom: 0 }} />
        )}
        {n.read && <div style={{ width: 8, height: 8 }} />}
      </div>

      {/* Icon bubble */}
      <div style={{
        width: 42, height: 42, borderRadius: 14, background: meta.bg,
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        {meta.icon}
      </div>

      {/* Content */}
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

      {/* Arrow */}
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

function Section({ title, items }: { title: string; items: NotificationRow[] }) {
  if (items.length === 0) return null
  return (
    <div style={{ marginBottom: 28 }}>
      <p style={{
        fontSize: 11, fontWeight: 800, color: '#9CA3AF',
        textTransform: 'uppercase', letterSpacing: '0.12em',
        margin: '0 0 10px', padding: '0 4px',
      }}>{title}</p>
      <div style={{ background: '#FFFFFF', borderRadius: 18, border: '1px solid #EBEDF2', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        {items.map(n => <NotificationItem key={n.id} n={n} />)}
      </div>
    </div>
  )
}

async function markAllReadAction() {
  'use server'
  await markAllRead()
}

export default async function NotificationsPage() {
  const notifications = await getAllNotifications()
  const { today, thisWeek, earlier } = groupNotifications(notifications)
  const unread = notifications.filter(n => !n.read).length
  const hasAny = notifications.length > 0

  return (
    <div style={{ background: '#F8F9FC', minHeight: '100vh' }}>
      {/* Header */}
      <div style={{ background: '#fff', borderBottom: '1px solid #EBEDF2' }} className="px-4 md:px-7 py-5">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 900, color: '#111111', fontFamily: 'var(--font-jakarta)', margin: '0 0 2px' }}>
              Notifications
            </h1>
            <p style={{ fontSize: 12, color: '#9CA3AF', margin: 0 }}>
              {unread > 0 ? `${unread} unread message${unread !== 1 ? 's' : ''}` : 'All caught up'}
            </p>
          </div>
          {unread > 0 && (
            <form action={markAllReadAction}>
              <button type="submit" style={{
                fontSize: 12, fontWeight: 700, color: '#DE1A1A',
                background: 'rgba(222,26,26,0.06)', border: '1px solid rgba(222,26,26,0.2)',
                padding: '8px 16px', borderRadius: 10, cursor: 'pointer',
              }}>
                Mark all read
              </button>
            </form>
          )}
        </div>

        {/* Quick-links row */}
        {hasAny && (
          <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
            {[
              { label: 'Leaves', href: '/member/leaves', color: '#10B981' },
              { label: 'My Tasks', href: '/member/tasks', color: '#6366F1' },
              { label: 'Announcements', href: '/member/announcements', color: '#F59E0B' },
              { label: 'Support', href: '/member/support', color: '#DE1A1A' },
            ].map(({ label, href, color }) => (
              <Link key={href} href={href} style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                fontSize: 11, fontWeight: 700, color,
                background: `${color}12`, border: `1px solid ${color}25`,
                padding: '5px 12px', borderRadius: 20, textDecoration: 'none',
              }}>
                {label} <ChevronRight size={10} />
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* List */}
      <div className="px-4 md:px-7 pt-6 pb-12">
        {!hasAny ? (
          <div style={{ textAlign: 'center', paddingTop: 80 }}>
            <div style={{ width: 72, height: 72, borderRadius: 24, background: '#F3F4F6', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <Bell size={32} style={{ color: '#D1D5DB' }} />
            </div>
            <p style={{ fontSize: 16, fontWeight: 800, color: '#374151', margin: '0 0 6px' }}>No notifications yet</p>
            <p style={{ fontSize: 13, color: '#9CA3AF', maxWidth: 280, margin: '0 auto' }}>
              You&apos;ll be notified about leave updates, task comments, support replies, and announcements.
            </p>
          </div>
        ) : (
          <>
            <Section title="Today" items={today} />
            <Section title="This Week" items={thisWeek} />
            <Section title="Earlier" items={earlier} />
          </>
        )}
      </div>
    </div>
  )
}
