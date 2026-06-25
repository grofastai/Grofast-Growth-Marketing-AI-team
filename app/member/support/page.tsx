import type { ComponentProps } from 'react'
import { getTickets, getCurrentUser } from '@/lib/actions/support'
import MemberSupportChat from './support-client'
import SupportInbox from '@/app/admin/support/support-client'

export const dynamic = 'force-dynamic'

export default async function MemberSupportPage() {
  const user = await getCurrentUser()

  // Support handlers (admins or anyone toggled on in the Team tab) get the full
  // Support Inbox workspace. Everyone else gets the member support chat.
  const isHandler = user?.role === 'ADMIN' || user?.is_support_handler === true

  if (isHandler) {
    const allTickets = await getTickets('ADMIN')
    return <SupportInbox tickets={allTickets as ComponentProps<typeof SupportInbox>['tickets']} currentUserId={user!.id} />
  }

  const tickets = await getTickets('MEMBER')
  return <MemberSupportChat tickets={tickets as ComponentProps<typeof MemberSupportChat>['tickets']} currentUserId={user?.id ?? ''} />
}
