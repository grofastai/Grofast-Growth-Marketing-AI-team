import { getTickets } from '@/lib/actions/support'
import MemberSupportClient from './support-client'

export const dynamic = 'force-dynamic'

export default async function MemberSupportPage() {
  const tickets = await getTickets('MEMBER')
  return <MemberSupportClient tickets={tickets as any} />
}
