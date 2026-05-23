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
