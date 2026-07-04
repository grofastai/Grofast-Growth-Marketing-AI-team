import { getAllNotifications, markAllRead } from '@/lib/actions/notifications'
import { NotificationItem } from './notification-item'
import type { NotificationRow } from './notification-item'
import { Bell, ChevronRight } from 'lucide-react'
import Link from 'next/link'
import Image from 'next/image'

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
    <div style={{ background: '#F8F9FC', minHeight: '100vh' }} className="p-4 md:p-6 xl:p-8 max-w-[1400px]">

      {/* ── HERO BANNER ─────────────────────────────────────────────────── */}
      <div style={{ background: 'linear-gradient(135deg, #DE1A1A 0%, #8B1212 55%, #1A0808 100%)', borderRadius: 20, marginBottom: 20, position: 'relative', overflow: 'hidden', padding: '22px 24px', boxShadow: '0 8px 32px rgba(180,0,0,0.35)' }}>
        <div style={{ position: 'absolute', top: -40, right: -40, width: 220, height: 220, borderRadius: '50%', background: 'rgba(255,255,255,0.05)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: -30, left: 60, width: 150, height: 150, borderRadius: '50%', background: 'rgba(255,255,255,0.04)', pointerEvents: 'none' }} />

        {/* Illustration — centered in the banner, behind the text/button row; visible at every width, just smaller on mobile */}
        <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', zIndex: 0, pointerEvents: 'none', opacity: 0.9, width: 'clamp(60px,16vw,100px)' }}>
          <Image src="/brand/notifications-hero.png" alt="" width={100} height={100}
            style={{ objectFit: 'contain', display: 'block', width: '100%', height: 'auto', filter: 'drop-shadow(0 6px 20px rgba(0,0,0,0.3))' }} priority />
        </div>

        <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, padding: '4px 12px', borderRadius: 99, background: 'rgba(255,255,255,0.15)', color: '#fff', marginBottom: 10, border: '1px solid rgba(255,255,255,0.2)', letterSpacing: '0.04em' }}>
              <Bell size={12} /> Notifications
            </span>
            <h1 style={{ fontSize: 26, fontWeight: 900, color: '#fff', fontFamily: 'var(--font-jakarta)', margin: '0 0 4px' }}>
              Notifications
            </h1>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', margin: 0 }}>
              {unread > 0 ? `${unread} unread message${unread !== 1 ? 's' : ''}` : 'All caught up'}
            </p>
          </div>
          {unread > 0 && (
            <form action={markAllReadAction}>
              <button type="submit" style={{
                fontSize: 12, fontWeight: 700, color: '#fff',
                background: 'rgba(255,255,255,0.16)', border: '1px solid rgba(255,255,255,0.3)',
                padding: '9px 18px', borderRadius: 10, cursor: 'pointer',
              }}>
                Mark all read
              </button>
            </form>
          )}
        </div>

        {/* Quick-links row */}
        {hasAny && (
          <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap', position: 'relative', zIndex: 1 }}>
            {[
              { label: 'Leaves', href: '/member/leaves' },
              { label: 'My Tasks', href: '/member/tasks' },
              { label: 'Announcements', href: '/member/announcements' },
              { label: 'Support', href: '/member/support' },
            ].map(({ label, href }) => (
              <Link key={href} href={href} style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                fontSize: 11, fontWeight: 700, color: '#fff',
                background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)',
                padding: '5px 12px', borderRadius: 20, textDecoration: 'none',
              }}>
                {label} <ChevronRight size={10} />
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* List */}
      <div>
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
