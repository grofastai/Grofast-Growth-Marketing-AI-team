import { sendNotificationViaTemplate } from '@/lib/whatsapp'
import type { NotificationPayload } from './types'

export async function sendNotification(payload: NotificationPayload): Promise<void> {
  await sendNotificationViaTemplate(payload)
}
