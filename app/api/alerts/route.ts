export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { getAlerts } from '@/lib/alerts'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Called via x-webhook-secret header + ?company_id=UUID query param.
// Returns alert counts for the admin dashboard widget.
export async function GET(request: NextRequest) {
  const secret = request.headers.get('x-webhook-secret')
  if (!secret || secret !== process.env.INTERNAL_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const companyId = request.nextUrl.searchParams.get('company_id')
  if (!companyId || !UUID_RE.test(companyId)) {
    return NextResponse.json({ error: 'Valid company_id UUID is required' }, { status: 400 })
  }

  const alerts = await getAlerts(companyId)

  return NextResponse.json({
    total: alerts.total,
    notUpdatedCount: alerts.notUpdatedCount,
    notUpdatedNames: alerts.notUpdatedNames,
    overdueTaskCount: alerts.overdueTaskCount,
    overdueProjectCount: alerts.overdueProjectCount,
    checkedAt: new Date().toISOString(),
  })
}
