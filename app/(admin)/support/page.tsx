import { getTickets } from '@/lib/actions/support'
import AdminSupportClient from './support-client'

export const dynamic = 'force-dynamic'

export default async function AdminSupportPage() {
  const tickets = await getTickets('ADMIN')
  return <AdminSupportClient tickets={tickets as any} />
}
