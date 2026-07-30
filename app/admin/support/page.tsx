import type { ComponentProps } from 'react'
import { getTickets, getCurrentUser, getSupportMembers } from '@/lib/actions/support'
import AdminSupportClient from './support-client'

export const dynamic = 'force-dynamic'

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
