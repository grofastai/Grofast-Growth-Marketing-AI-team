"use client"

import ContentCalendarBoard from "@/components/content-calendar/content-calendar-board"

// Admin adapter — maps the admin page's data shape onto the shared Kanban board.
// Admins can edit every card, so currentUserId is only a formality here.

interface Post {
  id: string; title: string; platform: string; content_type: string
  client_name: string; scheduled_date: string; status: string
  assigned_to: string | null; drive_link: string | null
  content_pillar?: string | null; priority?: string | null
  notes?: string | null; scheduled_time?: string | null
  assignee?: { name: string } | null
  shoot_team?: string[] | null
  created_by?: string | null
}
interface Member { id: string; name: string; employee_id?: string }
interface Client { id: string; name: string }

interface Props {
  posts: Post[]
  shoots?: unknown[]
  tasks?: unknown[]
  members: Member[]
  clients: Client[]
  pastClients?: Client[]
  companyId: string
  initialYear: number
  initialMonth: number
}

export default function ContentCalendarClient({ posts, members, clients, pastClients = [], initialYear, initialMonth }: Props) {
  return (
    <ContentCalendarBoard
      posts={posts}
      members={members.map(m => ({ id: m.id, name: m.name }))}
      clientOptions={clients.map(c => c.name)}
      pastClientOptions={pastClients.map(c => c.name)}
      role="ADMIN"
      currentUserId=""
      basePath="/admin/content-calendar"
      initialYear={initialYear}
      initialMonth={initialMonth}
    />
  )
}
