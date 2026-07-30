import type { ComponentProps } from 'react'
import { getTickets, getCurrentUser } from '@/lib/actions/support'
import MemberSupportChat from './support-client'
import SupportInbox from '@/app/admin/support/support-client'

export const revalidate = 30 // was force-fresh — safe to cache: every write to this page already calls revalidatePath() (2026-07-30)

export default async function MemberSupportPage() {
  const user = await getCurrentUser()

  // Support handlers (admins or anyone toggled on in the Team tab) get the full
  // Support Inbox workspace. Everyone else gets the member support chat.
  const isHandler = user?.role === 'ADMIN' || user?.is_support_handler === true

  if (isHandler) {
    const allTickets = await getTickets('ADMIN')
    return <SupportInbox tickets={allTickets as ComponentProps<typeof SupportInbox>['tickets']} currentUserId={user!.id} canAssign={user!.role === 'ADMIN'} />
  }

  const tickets = await getTickets('MEMBER')
  return <MemberSupportChat tickets={tickets as ComponentProps<typeof MemberSupportChat>['tickets']} currentUserId={user?.id ?? ''} />
}
