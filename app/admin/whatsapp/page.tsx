export const dynamic = 'force-dynamic'

import { runWhatsAppDiagnostic } from '@/lib/actions/whatsapp-diagnostic'
import WhatsAppDiagnosticClient from './whatsapp-client'

export default async function WhatsAppDiagnosticPage() {
  const result = await runWhatsAppDiagnostic()
  return <WhatsAppDiagnosticClient initialDiagnostic={result} />
}
