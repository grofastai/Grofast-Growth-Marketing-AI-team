import { getTickets, getCurrentUser } from '@/lib/actions/support'
import MemberSupportClient from './support-client'
import AdminSupportClient from '@/app/admin/support/support-client'

export const dynamic = 'force-dynamic'

export default async function MemberSupportPage() {
  const user = await getCurrentUser()

  // GF003 (Sajetah SK) is the designated support handler — show full admin workspace
  if (user?.employee_id?.toUpperCase() === 'GF003') {
    const allTickets = await getTickets('ADMIN')
    return <AdminSupportClient tickets={allTickets as any} currentUserId={user.id} />
  }

  const tickets = await getTickets('MEMBER')
  return <AdminSupportClient tickets={tickets as any} currentUserId={user?.id ?? ''} />
}
