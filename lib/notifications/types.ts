export type NotificationEvent =
  | 'leave.submitted'
  | 'leave.approved'
  | 'leave.rejected'
  | 'daily_update.submitted'
  | 'daily_update.missing'
  | 'hours.underperformance'
  | 'announcement.new'
  | 'wfh.started'
  | 'attendance.late'

export interface LeaveSubmittedPayload {
  event: 'leave.submitted'
  leave_id: string
  employee_name: string
  employee_id: string
  from_date: string
  to_date: string
  reason: string
  admin_phone: string
}

export interface LeaveStatusPayload {
  event: 'leave.approved' | 'leave.rejected'
  employee_name: string
  employee_phone: string
  from_date: string
  to_date: string
  status: 'approved' | 'rejected'
}

export interface DailyUpdatePayload {
  event: 'daily_update.submitted'
  employee_name: string
  employee_id: string
  date: string
  attendance_status: string
  working_hours: number | null
  shoot_count: number
  admin_phone: string
}

export interface MissingUpdatePayload {
  event: 'daily_update.missing'
  employee_name: string
  employee_phone: string
  date: string
}

export interface UnderperformancePayload {
  event: 'hours.underperformance'
  employee_name: string
  employee_id: string
  date: string
  working_hours: number
  expected_hours: number
  admin_phone: string
}

export interface AnnouncementPayload {
  event: 'announcement.new'
  title: string
  message: string
  company_id: string
  team_phones: string[]
}

export interface LateArrivalPayload {
  event: 'attendance.late'
  employee_name: string
  employee_id: string
  clock_in_time: string
  admin_phone: string
}

export type NotificationPayload =
  | LeaveSubmittedPayload
  | LeaveStatusPayload
  | DailyUpdatePayload
  | MissingUpdatePayload
  | UnderperformancePayload
  | AnnouncementPayload
  | LateArrivalPayload
