export type FreelancerType = "voice_over" | "video_editor" | "video_shooter" | "other"

export type Freelancer = {
  id: string
  company_id: string
  name: string
  type: FreelancerType
  phone: string | null
  upi_id: string | null
  gender: string | null
  title: string | null
  availability_notes: string | null
  rating: number
  status: "active" | "inactive"
  language: string | null
  voice_type: string | null
  cost_per_minute: number | null
  editing_software: string[]
  video_types_offered: string[]
  cost_per_video: number | null
  availability_schedule: string | null
  cost_per_hour: number | null
  created_at: string
}

export type WorkEntry = {
  id: string
  company_id: string
  freelancer_id: string
  entry_type: "voice_over" | "video_edit" | "video_shoot"
  client_name: string | null
  title: string | null
  date: string
  status: string
  payment_status: string
  paid_at: string | null
  amount: number | null
  notes: string | null
  audio_duration_minutes: number | null
  cost_per_minute_snapshot: number | null
  date_given: string | null
  date_finished: string | null
  video_type: string | null
  video_duration: string | null
  time_taken_hours: number | null
  drive_updated: boolean
  revision_count: number
  cost_per_video_snapshot: number | null
  start_time: string | null
  end_time: string | null
  break_minutes: number
  travel_hours: number | null
  working_hours: number | null
  cost_per_hour_snapshot: number | null
  created_at: string
}

export type FreelancerStats = {
  total: number
  voiceOver: number
  videoEditor: number
  videoShooter: number
  other: number
  totalWorks: number
  completedWorks: number
  totalCost: number
  paidAmount: number
  pendingAmount: number
}
