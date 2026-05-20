import { getAllNotifications, markAllRead, type NotificationRow } from '@/lib/actions/notifications'
import { Bell, CheckCircle2, ClipboardList, Megaphone } from 'lucide-react'
import Link from 'next/link'

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
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

function typeIcon(type: string) {
  if (type === 'leave_status') return <CheckCircle2 size={16} style={{ color: '#10B981' }} />
  if (type === 'task_assigned') return <ClipboardList size={16} style={{ color: '#6366F1' }} />
  if (type === 'announcement') return <Megaphone size={16} style={{ color: '#F59E0B' }} />
  return <Bell size={16} style={{ color: '#9CA3AF' }} />
}

function NotificationItem({ n }: { n: NotificationRow }) {
  const content = (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 12, padding: '14px 16px',
      background: n.read ? '#FFFFFF' : '#F0F4FF',
      borderBottom: '1px solid #F3F4F6',
      cursor: n.link ? 'pointer' : 'default',
    }}>
      <div style={{ marginTop: 2, flexShrink: 0 }}>{typeIcon(n.type)}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: '#111111', margin: '0 0 2px' }}>{n.title}</p>
        {n.body && <p style={{ fontSize: 12, color: '#6B7280', margin: '0 0 4px' }}>{n.body}</p>}
        <p style={{ fontSize: 11, color: '#9CA3AF', margin: 0 }}>{timeAgo(n.created_at)}</p>
      </div>
      {n.link && (
        <span style={{ fontSize: 11, color: '#DE1A1A', fontWeight: 700, flexShrink: 0, marginTop: 2 }}>Go →</span>
      )}
    </div>
  )
  return n.link ? <Link href={n.link} style={{ textDecoration: 'none' }}>{content}</Link> : <>{content}</>
}

function Section({ title, items }: { title: string; items: NotificationRow[] }) {
  if (items.length === 0) return null
  return (
    <div style={{ marginBottom: 24 }}>
      <p style={{ fontSize: 11, fontWeight: 800, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 8px', padding: '0 16px' }}>{title}</p>
      <div style={{ background: '#FFFFFF', borderRadius: 16, border: '1px solid #EBEDF2', overflow: 'hidden' }}>
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
  const hasAny = notifications.length > 0

  return (
    <div style={{ background: '#F8F9FC', minHeight: '100vh' }}>
      <div style={{ background: '#fff', borderBottom: '1px solid #EBEDF2' }} className="px-4 md:px-7 py-4 flex items-center justify-between">
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 900, color: '#111111', fontFamily: 'var(--font-jakarta)', margin: 0 }}>
            Notifications
          </h1>
          <p style={{ fontSize: 12, color: '#9CA3AF', margin: 0 }}>Your activity feed</p>
        </div>
        {hasAny && (
          <form action={markAllReadAction}>
            <button type="submit"
              style={{ fontSize: 12, fontWeight: 700, color: '#DE1A1A', background: 'rgba(222,26,26,0.06)', border: '1px solid rgba(222,26,26,0.2)', padding: '8px 16px', borderRadius: 10, cursor: 'pointer' }}>
              Mark all as read
            </button>
          </form>
        )}
      </div>

      <div className="px-4 md:px-7 pt-5 pb-10">
        {!hasAny ? (
          <div style={{ textAlign: 'center', paddingTop: 80 }}>
            <Bell size={48} style={{ color: '#E5E7EB', margin: '0 auto 16px' }} />
            <p style={{ fontSize: 16, fontWeight: 700, color: '#374151', margin: '0 0 6px' }}>No notifications yet</p>
            <p style={{ fontSize: 13, color: '#9CA3AF' }}>You&apos;ll see updates about leaves, tasks, and announcements here.</p>
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
