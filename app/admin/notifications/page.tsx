import { getAllNotifications, markAllRead } from '@/lib/actions/notifications'
import { NotificationItem } from '@/app/member/notifications/notification-item'
import type { NotificationRow } from '@/app/member/notifications/notification-item'
import { Bell, ChevronRight } from 'lucide-react'
import Link from 'next/link'

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

function Section({ title, items }: { title: string; items: NotificationRow[] }) {
  if (items.length === 0) return null
  return (
    <div style={{ marginBottom: 28 }}>
      <p style={{
        fontSize: 11, fontWeight: 800, color: "#7A4B00",
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

export default async function AdminNotificationsPage() {
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
            <p style={{ fontSize: 12, color: "#7A4B00", margin: 0 }}>
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
              { label: 'Leaves',        href: '/admin/leaves',        color: '#10B981' },
              { label: 'Tasks',         href: '/admin/goals',         color: '#6366F1' },
              { label: 'Announcements', href: '/admin/announcements', color: '#F59E0B' },
              { label: 'Support',       href: '/admin/support',       color: '#DE1A1A' },
              { label: 'Attendance',    href: '/admin/attendance',    color: '#06B6D4' },
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
              <Bell size={32} style={{ color: "#7A4B00" }} />
            </div>
            <p style={{ fontSize: 16, fontWeight: 800, color: "#7A4B00", margin: '0 0 6px' }}>No notifications yet</p>
            <p style={{ fontSize: 13, color: "#7A4B00", maxWidth: 280, margin: '0 auto' }}>
              You&apos;ll be notified when team members apply for leave, complete tasks, raise support tickets, and more.
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
