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
