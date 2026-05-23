# Chat Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the ticket-based support pages into per-topic WhatsApp-style chat threads with Supabase real-time, on both member and admin sides.

**Architecture:** Member taps a category card → finds (or creates) a ticket for that category → sees a chat bubble thread. Admin sees the same thread in their existing ticket detail panel. Both sides update in real-time via a Supabase `postgres_changes` subscription on `support_responses` filtered by `ticket_id`.

**Tech Stack:** Next.js 15 App Router, Supabase (real-time + server actions), TypeScript, Tailwind CSS, `createBrowserClient` for real-time subscriptions.

---

## Prerequisite: Enable Supabase Realtime on `support_responses`

- [ ] **Step 1: Enable Realtime in Supabase dashboard**

Go to your Supabase project → **Database → Replication** → enable the `support_responses` table for realtime. Without this, the `postgres_changes` subscription will not fire.

---

## Task 1: Update data layer in `lib/actions/support.ts`

**Files:**
- Modify: `lib/actions/support.ts`

- [ ] **Step 1: Add `responder_id` to the responses sub-select in `getTickets`**

Find this line in `getTickets`:
```typescript
support_responses ( id, responder_name, message, created_at )
```
Replace with:
```typescript
support_responses ( id, responder_id, responder_name, message, created_at )
```

- [ ] **Step 2: Export `getCurrentUser` so pages can pass `currentUserId` to clients**

Add this export at the bottom of `lib/actions/support.ts`:
```typescript
export async function getCurrentUser() {
  return getProfile()
}
```

- [ ] **Step 3: Commit**

```bash
git add lib/actions/support.ts
git commit -m "feat: add responder_id to support_responses select + export getCurrentUser"
```

---

## Task 2: Update both support page.tsx files

**Files:**
- Modify: `app/member/support/page.tsx`
- Modify: `app/admin/support/page.tsx`

- [ ] **Step 1: Update `app/member/support/page.tsx`**

Replace the entire file with:
```typescript
import { getTickets, getCurrentUser } from '@/lib/actions/support'
import MemberSupportClient from './support-client'

export const dynamic = 'force-dynamic'

export default async function MemberSupportPage() {
  const [tickets, user] = await Promise.all([
    getTickets('MEMBER'),
    getCurrentUser(),
  ])
  return <MemberSupportClient tickets={tickets as any} currentUserId={user?.id ?? ''} />
}
```

- [ ] **Step 2: Update `app/admin/support/page.tsx`**

Replace the entire file with:
```typescript
import { getTickets, getCurrentUser } from '@/lib/actions/support'
import AdminSupportClient from './support-client'

export const dynamic = 'force-dynamic'

export default async function AdminSupportPage() {
  const [tickets, user] = await Promise.all([
    getTickets('ADMIN'),
    getCurrentUser(),
  ])
  return <AdminSupportClient tickets={tickets as any} currentUserId={user?.id ?? ''} />
}
```

- [ ] **Step 3: Commit**

```bash
git add app/member/support/page.tsx app/admin/support/page.tsx
git commit -m "feat: pass currentUserId to support client components"
```

---

## Task 3: Rewrite member support client

**Files:**
- Modify: `app/member/support/support-client.tsx`

This is a full rewrite. The new component has two views: a category grid and a chat thread.

- [ ] **Step 1: Replace `app/member/support/support-client.tsx` with the following**

```typescript
'use client'

import { useState, useEffect, useRef, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@/lib/supabase/client'
import { createTicket, addResponse } from '@/lib/actions/support'
import { ArrowLeft, Send, Loader2 } from 'lucide-react'

type Response = {
  id: string
  responder_id: string
  responder_name: string
  message: string
  created_at: string
}
type Ticket = {
  id: string
  title: string
  category: string
  description: string
  status: string
  created_at: string
  support_responses: Response[]
}

const CATEGORIES = [
  { key: 'technical', label: 'Technical Issues',       color: '#8B5CF6', emoji: '⚙️' },
  { key: 'payroll',   label: 'Payroll Requests',       color: '#F59E0B', emoji: '💰' },
  { key: 'leave',     label: 'Attendance Corrections', color: '#10B981', emoji: '📅' },
  { key: 'general',   label: 'Client Support',         color: '#3B82F6', emoji: '🤝' },
  { key: 'hr',        label: 'HR Helpdesk',            color: '#EC4899', emoji: '👥' },
  { key: 'other',     label: 'Escalated Issues',       color: '#EF4444', emoji: '🚨' },
]

const STATUS_CONFIG: Record<string, { bg: string; color: string; label: string }> = {
  open:        { bg: '#FEE2E2', color: '#DE1A1A', label: 'Open' },
  in_progress: { bg: '#FEF3C7', color: '#D97706', label: 'In Progress' },
  resolved:    { bg: '#DCFCE7', color: '#15803D', label: 'Resolved' },
  closed:      { bg: '#F3F4F6', color: '#6B7280', label: 'Closed' },
}

function formatTime(s: string) {
  return new Date(s).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
}

export default function MemberSupportClient({
  tickets: initialTickets,
  currentUserId,
}: {
  tickets: Ticket[]
  currentUserId: string
}) {
  const router = useRouter()
  const supabase = createBrowserClient()
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const [realtimeMsgs, setRealtimeMsgs] = useState<Record<string, Response[]>>({})
  const [message, setMessage] = useState('')
  const [isPending, startTransition] = useTransition()
  const bottomRef = useRef<HTMLDivElement>(null)

  const catDef = CATEGORIES.find(c => c.key === activeCategory)
  const activeTicket = activeCategory
    ? initialTickets.find(
        t => t.category === activeCategory && ['open', 'in_progress'].includes(t.status)
      ) ?? null
    : null

  // Combine server-fetched responses with real-time appended ones, deduplicated
  const allResponses: Response[] = activeTicket
    ? [
        ...activeTicket.support_responses,
        ...(realtimeMsgs[activeTicket.id] ?? []),
      ].filter((r, i, arr) => arr.findIndex(x => x.id === r.id) === i)
    : []

  // Build full message list: initial description bubble + all responses
  const messages = activeTicket
    ? [
        {
          id: 'initial',
          responder_id: currentUserId,
          responder_name: 'You',
          message: activeTicket.description,
          created_at: activeTicket.created_at,
        } as Response,
        ...allResponses,
      ]
    : []

  // Scroll to bottom whenever message count changes
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  // Real-time subscription — resets when active ticket changes
  useEffect(() => {
    if (!activeTicket) return
    const ticketId = activeTicket.id
    const channel = supabase
      .channel(`member-support-${ticketId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'support_responses',
          filter: `ticket_id=eq.${ticketId}`,
        },
        (payload) => {
          setRealtimeMsgs(prev => ({
            ...prev,
            [ticketId]: [...(prev[ticketId] ?? []), payload.new as Response],
          }))
        }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [activeTicket?.id])

  function hasUnread(catKey: string) {
    const t = initialTickets.find(
      t => t.category === catKey && ['open', 'in_progress'].includes(t.status)
    )
    if (!t) return false
    const responses = [
      ...t.support_responses,
      ...(realtimeMsgs[t.id] ?? []),
    ]
    if (responses.length === 0) return false
    return responses[responses.length - 1].responder_id !== currentUserId
  }

  function handleSend() {
    const msg = message.trim()
    if (!msg || isPending) return
    setMessage('')
    startTransition(async () => {
      if (!activeTicket) {
        // First message — create the ticket. Description IS the first bubble.
        await createTicket({
          title: catDef?.label ?? activeCategory!,
          category: activeCategory!,
          description: msg,
          priority: 'normal',
        })
        router.refresh()
      } else {
        await addResponse({ ticket_id: activeTicket.id, message: msg })
      }
    })
  }

  // ── CHAT VIEW ────────────────────────────────────────────────────────────────
  if (activeCategory) {
    const status = activeTicket?.status ?? 'open'
    const sc = STATUS_CONFIG[status] ?? STATUS_CONFIG.open

    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', background: '#F8F9FC' }}>

        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '14px 16px', background: '#fff',
          borderBottom: '1px solid #EBEDF2', flexShrink: 0,
        }}>
          <button
            onClick={() => setActiveCategory(null)}
            style={{
              width: 34, height: 34, borderRadius: '50%',
              border: '1px solid #E5E7EB', background: '#F9FAFB',
              display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
            }}
          >
            <ArrowLeft size={16} color="#374151" />
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 15, fontWeight: 800, color: '#111111', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {catDef?.label}
            </p>
            <p style={{ fontSize: 11, color: '#9CA3AF', margin: 0 }}>Media &amp; Tech Team</p>
          </div>
          {activeTicket && (
            <span style={{
              padding: '4px 10px', borderRadius: 99,
              fontSize: 11, fontWeight: 700,
              background: sc.bg, color: sc.color, flexShrink: 0,
            }}>
              {sc.label}
            </span>
          )}
        </div>

        {/* Message list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 16px 8px' }}>
          {messages.length === 0 ? (
            <div style={{
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              height: '100%', gap: 8,
            }}>
              <div style={{ fontSize: 40 }}>{catDef?.emoji}</div>
              <p style={{ fontSize: 15, fontWeight: 700, color: '#111111', margin: 0 }}>No conversation yet</p>
              <p style={{ fontSize: 13, color: '#9CA3AF', margin: 0, textAlign: 'center' }}>
                Send your first message to start
              </p>
            </div>
          ) : (
            messages.map((msg) => {
              const isMine = msg.responder_id === currentUserId
              return (
                <div key={msg.id} style={{
                  display: 'flex', flexDirection: 'column',
                  alignItems: isMine ? 'flex-end' : 'flex-start',
                  marginBottom: 12,
                }}>
                  {!isMine && (
                    <p style={{ fontSize: 11, color: '#9CA3AF', margin: '0 0 4px 12px', fontWeight: 600 }}>
                      {msg.responder_name}
                    </p>
                  )}
                  <div style={{
                    maxWidth: '75%',
                    padding: '10px 14px',
                    borderRadius: isMine ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                    background: isMine ? '#DE1A1A' : '#F3F4F6',
                    color: isMine ? '#FFFFFF' : '#111111',
                    fontSize: 14,
                    lineHeight: 1.45,
                    wordBreak: 'break-word',
                  }}>
                    {msg.message}
                  </div>
                  <p style={{
                    fontSize: 10, color: '#9CA3AF',
                    margin: '4px 4px 0',
                    textAlign: isMine ? 'right' : 'left',
                  }}>
                    {formatTime(msg.created_at)}
                  </p>
                </div>
              )
            })
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input bar */}
        <div style={{
          padding: '10px 16px 20px', background: '#fff',
          borderTop: '1px solid #EBEDF2', flexShrink: 0,
        }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <input
              value={message}
              onChange={e => setMessage(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
              placeholder="Type a message…"
              disabled={isPending}
              style={{
                flex: 1, padding: '12px 16px', borderRadius: 24,
                background: '#F3F4F6', border: 'none',
                fontSize: 14, color: '#111111', outline: 'none', fontFamily: 'inherit',
              }}
            />
            <button
              onClick={handleSend}
              disabled={isPending || !message.trim()}
              style={{
                width: 44, height: 44, borderRadius: '50%', border: 'none',
                background: message.trim() && !isPending ? '#DE1A1A' : '#F3F4F6',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: message.trim() && !isPending ? 'pointer' : 'not-allowed',
                flexShrink: 0, transition: 'background 0.15s',
              }}
            >
              {isPending
                ? <Loader2 size={18} color="#9CA3AF" className="animate-spin" />
                : <Send size={18} color={message.trim() ? '#FFFFFF' : '#9CA3AF'} />
              }
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── CATEGORY GRID ────────────────────────────────────────────────────────────
  return (
    <div style={{ background: '#F8F9FC', minHeight: '100vh' }}>

      {/* Topbar */}
      <div style={{ background: '#fff', borderBottom: '1px solid #EBEDF2', padding: '16px 20px' }}>
        <h1 style={{ fontSize: 24, fontWeight: 900, color: '#111111', margin: 0 }}>Support</h1>
        <p style={{ fontSize: 12, color: '#9CA3AF', margin: '3px 0 0' }}>
          Tap a topic to chat with the Media &amp; Tech team
        </p>
      </div>

      {/* Category cards */}
      <div style={{
        padding: '20px 16px 40px',
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 12,
      }}>
        {CATEGORIES.map(cat => {
          const ticket = initialTickets.find(
            t => t.category === cat.key && ['open', 'in_progress'].includes(t.status)
          )
          const unread = hasUnread(cat.key)
          const sc = ticket ? STATUS_CONFIG[ticket.status] : null

          return (
            <button
              key={cat.key}
              onClick={() => setActiveCategory(cat.key)}
              style={{
                background: '#FFFFFF',
                borderRadius: 20,
                border: `1.5px solid ${unread ? cat.color : '#EBEDF2'}`,
                padding: '18px 16px',
                textAlign: 'left',
                cursor: 'pointer',
                position: 'relative',
                boxShadow: '0 2px 10px rgba(0,0,0,0.05)',
                transition: 'all 0.15s',
              }}
            >
              {unread && (
                <div style={{
                  position: 'absolute', top: 12, right: 12,
                  width: 10, height: 10, borderRadius: '50%',
                  background: '#DE1A1A', border: '2px solid #fff',
                }} />
              )}
              <div style={{ fontSize: 28, marginBottom: 10 }}>{cat.emoji}</div>
              <p style={{ fontSize: 13, fontWeight: 800, color: '#111111', margin: '0 0 6px' }}>
                {cat.label}
              </p>
              {sc ? (
                <span style={{
                  display: 'inline-block', padding: '2px 8px',
                  borderRadius: 99, fontSize: 10, fontWeight: 700,
                  background: sc.bg, color: sc.color,
                }}>
                  {sc.label}
                </span>
              ) : (
                <p style={{ fontSize: 11, color: '#9CA3AF', margin: 0 }}>No active thread</p>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add app/member/support/support-client.tsx
git commit -m "feat: member support — category grid + WhatsApp-style chat + real-time"
```

---

## Task 4: Update admin support client with real-time + corrected bubble direction

**Files:**
- Modify: `app/admin/support/support-client.tsx`

The admin client already renders chat bubbles in the Conversation tab. Four targeted changes:
1. Add `currentUserId: string` to props
2. Import `createBrowserClient`
3. Add real-time subscription when `featured?.id` changes
4. Fix bubble direction — currently all responses show on the right (admin side). With `responder_id` now available, member follow-up replies should show on the left.

- [ ] **Step 1: Add import for `createBrowserClient`**

Find the existing imports at the top of `app/admin/support/support-client.tsx`. Add:
```typescript
import { createBrowserClient } from '@/lib/supabase/client'
```

- [ ] **Step 2: Add `currentUserId` prop to component signature**

Find:
```typescript
export default function AdminSupportClient({ tickets }: { tickets: Ticket[] }) {
```
Replace with:
```typescript
export default function AdminSupportClient({ tickets, currentUserId }: { tickets: Ticket[]; currentUserId: string }) {
```

- [ ] **Step 3: Add supabase client + real-time state inside the component**

Find the block of `useState` declarations near the top of the component function (right after `export default function AdminSupportClient...`). Add these after the existing state declarations:

```typescript
  const supabase = createBrowserClient()
  const [realtimeMsgs, setRealtimeMsgs] = useState<Record<string, { id: string; responder_id: string; responder_name: string; message: string; created_at: string }[]>>({})
```

- [ ] **Step 4: Add real-time subscription effect**

Add this `useEffect` after the existing `useMemo` blocks and before the `handleReply` function:

```typescript
  useEffect(() => {
    if (!featured) return
    const ticketId = featured.id
    const channel = supabase
      .channel(`admin-support-${ticketId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'support_responses',
          filter: `ticket_id=eq.${ticketId}`,
        },
        (payload) => {
          setRealtimeMsgs(prev => ({
            ...prev,
            [ticketId]: [
              ...(prev[ticketId] ?? []),
              payload.new as { id: string; responder_id: string; responder_name: string; message: string; created_at: string },
            ],
          }))
        }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [featured?.id])
```

- [ ] **Step 5: Fix the Conversation tab responses rendering to use real-time messages and correct bubble direction**

Find this block inside the `{activeTab === 'Conversation' ? (` section (around line 491-508):

```typescript
                        {responses.map(r => (
                          <div key={r.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flexDirection: 'row-reverse' }}>
                            <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'linear-gradient(135deg,#DE1A1A,#7F1D1D)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                              {r.responder_name.charAt(0).toUpperCase()}
                            </div>
                            <div style={{ textAlign: 'right' }}>
                              <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'flex-end', marginBottom: 4 }}>
                                <span style={{ fontSize: 11, color: '#9CA3AF' }}>
                                  {new Date(r.created_at).toLocaleString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                </span>
                                <span style={{ fontSize: 12, fontWeight: 700, color: '#DE1A1A' }}>{r.responder_name} (Support)</span>
                              </div>
                              <div style={{ background: 'rgba(222,26,26,0.05)', borderRadius: '14px 4px 14px 14px', padding: '10px 14px', fontSize: 13, color: '#374151', lineHeight: 1.55, border: '1px solid rgba(222,26,26,0.09)', maxWidth: 360, marginLeft: 'auto' }}>
                                {r.message}
                              </div>
                            </div>
                          </div>
                        ))}
```

Replace with:

```typescript
                        {[
                          ...responses,
                          ...(realtimeMsgs[featured.id] ?? []),
                        ]
                          .filter((r, i, arr) => arr.findIndex(x => x.id === r.id) === i)
                          .map(r => {
                            const isAdmin = r.responder_id !== featured.user_id
                            return (
                              <div key={r.id} style={{ display: 'flex', flexDirection: 'column', alignItems: isAdmin ? 'flex-end' : 'flex-start', marginBottom: 4 }}>
                                <p style={{ fontSize: 11, color: '#9CA3AF', margin: '0 0 4px', paddingLeft: isAdmin ? 0 : 12, paddingRight: isAdmin ? 12 : 0 }}>
                                  {isAdmin ? `${r.responder_name} (Support)` : 'Member'}
                                </p>
                                <div style={{
                                  maxWidth: 380,
                                  padding: '10px 14px',
                                  borderRadius: isAdmin ? '14px 4px 14px 14px' : '4px 14px 14px 14px',
                                  background: isAdmin ? 'rgba(222,26,26,0.06)' : '#F3F4F6',
                                  border: isAdmin ? '1px solid rgba(222,26,26,0.09)' : '1px solid #E5E7EB',
                                  fontSize: 13, color: '#374151', lineHeight: 1.55,
                                }}>
                                  {r.message}
                                </div>
                                <p style={{ fontSize: 10, color: '#9CA3AF', margin: '3px 4px 0', textAlign: isAdmin ? 'right' : 'left' }}>
                                  {new Date(r.created_at).toLocaleString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                </p>
                              </div>
                            )
                          })}
```

- [ ] **Step 6: Commit**

```bash
git add app/admin/support/support-client.tsx
git commit -m "feat: admin support — real-time chat bubbles with correct member/admin direction"
```

---

## Task 5: Deploy and verify

- [ ] **Step 1: Run typecheck**

```bash
pnpm typecheck
```
Expected: no errors. If there are type errors on `responder_id` (property not on the inferred type), cast the `getTickets` return with `as any` in the page files — both pages already do `tickets as any`.

- [ ] **Step 2: Test member flow**

1. Open `/member/support` — see the 6 category cards
2. Tap **Technical Issues** — if no ticket: see empty state + input bar
3. Type a message and press Send — ticket is created, description shows as red bubble (right)
4. Open a second browser tab as admin at `/admin/support` — see the ticket appear
5. Admin replies — bubble appears on the member tab in real time (no refresh)
6. Back on member tab — admin reply appears as gray bubble (left)
7. Tap back arrow — return to category grid. Red unread dot should show on Technical Issues card

- [ ] **Step 3: Test admin flow**

1. Open `/admin/support` — click a ticket — Conversation tab shows
2. Member sends a message from the member tab — it appears in admin view in real time
3. Admin replies — bubble appears on the right side (red-tinted)
4. Member follow-up replies appear on the left side (gray)

- [ ] **Step 4: Commit and push**

```bash
git push origin master
```

---

## Notes

- **Supabase Realtime must be enabled** on the `support_responses` table (Supabase Dashboard → Database → Replication). Without this, real-time events will not fire.
- **`router.refresh()`** is called after `createTicket` so the Server Component re-fetches and the new ticket appears in `initialTickets`. The `activeCategory` state persists through the refresh, so the chat view reopens automatically with the new ticket.
- **Deduplication** (`filter((r, i, arr) => arr.findIndex(x => x.id === r.id) === i)`) prevents duplicate bubbles if a real-time event fires and then `router.refresh()` brings the same message in the server payload.
- The existing `addResponse` server action already handles notifications for both directions (admin replies → notifies member; member replies → notifies all admins). No changes needed there.
