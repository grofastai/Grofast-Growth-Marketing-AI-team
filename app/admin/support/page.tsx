import type { ComponentProps } from 'react'
import { getTickets, getCurrentUser, getSupportMembers } from '@/lib/actions/support'
import AdminSupportClient from './support-client'

export const revalidate = 30 // was force-fresh — safe to cache: every write to this page already calls revalidatePath() (2026-07-30)

export default async function AdminSupportPage() {
  const [tickets, user, members] = await Promise.all([
    getTickets('ADMIN'),
    getCurrentUser(),
    getSupportMembers(),
  ])
  return (
    <AdminSupportClient
      tickets={tickets as ComponentProps<typeof AdminSupportClient>['tickets']}
      currentUserId={user?.id ?? ''}
      canAssign={user?.role === 'ADMIN'}
      members={members}
    />
  )
}
