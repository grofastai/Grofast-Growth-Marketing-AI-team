"use client"

import ContentCalendarBoard from "@/components/content-calendar/content-calendar-board"

// Member adapter — maps the member page's data shape onto the shared Kanban board.
// Members can only edit cards they're assigned to or created (enforced in the board).

interface Post {
  id: string; title: string; platform: string; content_type: string
  client_name: string; scheduled_date: string; status: string
  assigned_to: string | null; drive_link: string | null
  created_by?: string | null
  shoot_team?: string[] | null
  content_pillar?: string | null; priority?: string | null
  scheduled_time?: string | null; notes?: string | null
  assignee?: { name: string } | null
  creator?: { name: string } | null
}
interface Member { id: string; name: string }

interface Props {
  posts: Post[]
  shoots?: unknown[]
  tasks?: unknown[]
  members: Member[]
  clientNames: string[]
  pastClientNames?: string[]
  userId: string
  role?: string
  initialYear: number
  initialMonth: number
}

export default function MemberContentCalendarClient({ posts, members, clientNames, pastClientNames = [], userId, role, initialYear, initialMonth }: Props) {
  return (
    <ContentCalendarBoard
      posts={posts}
      members={members}
      clientOptions={clientNames}
      pastClientOptions={pastClientNames}
      role={role === "ADMIN" ? "ADMIN" : "MEMBER"}
      currentUserId={userId}
      basePath="/member/content-calendar"
      initialYear={initialYear}
      initialMonth={initialMonth}
    />
  )
}
