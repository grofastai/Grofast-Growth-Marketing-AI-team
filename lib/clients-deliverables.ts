// Shared types and computation logic for the unified clients+deliverables page.

export type PricingRate = { video_type: string; rate_per_video: number }
export type MemberUser  = { id: string; name: string; employee_id: string; hourly_rate: number | null; monthly_salary: number | null; team: string | null }

export type EditingVideo = {
  id?: string
  video_name?: string
  video_type?: string
  time_taken?: number
  revisions?: number
  date_given?: string
  date_finished?: string
}

export type WorkEntry = {
  client_name?: string
  task_type?: 'shoot' | 'edit' | 'upload' | 'other'
  title?: string
  start_time?: string
  end_time?: string
  duration_hours?: number
  editing_videos?: EditingVideo[]
}

export type UpdateRow = {
  id: string
  user_id: string
  date: string
  work_entries: WorkEntry[] | null
  learning_hours: number | null
}

// ── Output types ─────────────────────────────────────────────────────────────

export type ShootEntry = {
  date: string
  memberName: string
  title: string
  hours: number
  cost: number
}

export type VideoEntry = {
  date: string
  memberName: string
  videoName: string
  videoType: string
  timeTaken: number
  revisions: number
  cost: number
}

export type VideoTypeGroup = {
  videoType: string
  count: number
  totalTimeTaken: number
  totalCost: number
  videos: VideoEntry[]
}

export type OtherWorkEntry = {
  date: string
  memberName: string
  title: string
  hours: number
  cost: number
}

export type TeamContribution = {
  userId: string
  name: string
  employeeId: string
  videoCount: number
  shootHours: number
  otherHours: number
  totalHours: number
  cost: number
}

export type DayLogEntry = {
  date: string
  memberName: string
  taskType: string
  itemCount: number
  hours: number
  cost: number
  label: string
}

export type DeliverableResult = {
  shoots: ShootEntry[]
  videoTypeGroups: VideoTypeGroup[]
  otherWork: OtherWorkEntry[]
  teamContributions: TeamContribution[]
  dayLog: DayLogEntry[]
  totalVideos: number
  totalPosters: number
  totalShootSessions: number
  totalShootHours: number
  totalCost: number
  // KPI breakdowns
  mediaShootCount: number     // shoots logged by media team members
  mediaShootHours: number     // shoot hours by media team members
  mediaEditCount: number      // videos edited by media team members
  mediaEditHours: number      // edit hours by media team members
  nonMediaWorkHours: number   // all hours logged by non-media team members
  voiceoverCount: number      // voiceover video count
  voiceoverHours: number      // voiceover edit hours
  posterHours: number         // poster edit hours
  totalLearningHours: number  // sum of learning_hours on days this client was worked on
  activeMemberCount: number   // unique team members who contributed
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function derivePerHour(u: MemberUser): number {
  if (u.monthly_salary && u.monthly_salary > 0) return u.monthly_salary / 25 / 8.5
  return u.hourly_rate ?? 0
}

export function fmtRupee(n: number) {
  return `₹${Math.round(n).toLocaleString('en-IN')}`
}

export function fmtDate(s: string) {
  return new Date(s + 'T12:00:00').toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

function stripBracketPrefix(title: string): string {
  return title.replace(/^\[[^\]]*\]\s*/i, '').trim() || title.trim()
}

function inferVideoType(title: string | undefined): string {
  const t = (title ?? '').toLowerCase()
  if (t.includes('reel'))        return 'Reel'
  if (t.includes('short'))       return 'Short'
  if (t.includes('long'))        return 'Long Form'
  if (t.includes('story'))       return 'Story'
  if (t.includes('poster'))      return 'Poster'
  if (t.includes('voice'))       return 'Voice Over'
  if (t.includes('ad') || t.includes('campaign')) return 'Ad'
  if (t.includes('design'))      return 'Design'
  if (t.includes('edit'))        return 'Editing'
  return 'Video'
}

function calcVideoCost(
  video: EditingVideo,
  hourlyRate: number,
  rateMap: Record<string, number>,
): number {
  const typeRate  = rateMap[(video.video_type ?? '').toLowerCase()] ?? 0
  const laborCost = hourlyRate * (video.time_taken ?? 0)
  return typeRate + laborCost
}

// ── Main computation (pure — no side effects, no DB calls) ────────────────────

function isMediaTeam(team: string | null): boolean {
  const t = (team ?? '').toLowerCase()
  return t === 'media team' || t === 'media production team'
}

export function computeDeliverables(
  updates: UpdateRow[],
  users: MemberUser[],
  pricingRates: PricingRate[],
  clientName: string,
  dateFrom: string,
  dateTo: string,
): DeliverableResult {
  const userMap  = new Map(users.map(u => [u.id, u]))
  const rateMap: Record<string, number> = {}
  for (const r of pricingRates) rateMap[r.video_type.toLowerCase()] = r.rate_per_video

  const shoots:    ShootEntry[]                     = []
  const videoMap:  Record<string, VideoTypeGroup>   = {}
  const otherWork: OtherWorkEntry[]                 = []
  const teamMap:   Record<string, TeamContribution> = {}
  const dayMap:    Record<string, DayLogEntry[]>    = {}

  const nameLower = clientName.toLowerCase()

  // KPI accumulators
  let mediaShootCount   = 0
  let mediaShootHours   = 0
  let mediaEditCount    = 0
  let mediaEditHours    = 0
  let nonMediaWorkHours = 0
  let totalLearningHours = 0
  // Track rows that contributed to this client (for learning hours)
  const contributingRows = new Set<string>()

  for (const row of updates) {
    if (row.date < dateFrom || row.date > dateTo) continue
    const user = userMap.get(row.user_id)
    if (!user) continue
    const hourly  = derivePerHour(user)
    const isMedia = isMediaTeam(user.team)

    let rowHasClientEntry = false

    for (const entry of row.work_entries ?? []) {
      if ((entry.client_name ?? '').trim().toLowerCase() !== nameLower) continue
      rowHasClientEntry = true

      const hrs = entry.duration_hours ?? 0
      const tt  = entry.task_type ?? 'other'

      // ── team accumulator ──────────────────────────────────────────────────
      if (!teamMap[user.id]) {
        teamMap[user.id] = {
          userId: user.id, name: user.name, employeeId: user.employee_id,
          videoCount: 0, shootHours: 0, otherHours: 0, totalHours: 0, cost: 0,
        }
      }
      const tm = teamMap[user.id]
      tm.totalHours += hrs

      // Non-media: accumulate all hours regardless of task type
      if (!isMedia) nonMediaWorkHours += hrs

      if (!dayMap[row.date]) dayMap[row.date] = []

      if (tt === 'shoot') {
        const cost = hourly * hrs
        shoots.push({ date: row.date, memberName: user.name, title: stripBracketPrefix(entry.title ?? 'Shoot'), hours: hrs, cost })
        tm.shootHours += hrs
        tm.cost       += cost
        if (isMedia) { mediaShootCount++; mediaShootHours += hrs }
        dayMap[row.date].push({ date: row.date, memberName: user.name, taskType: 'shoot', itemCount: 1, hours: hrs, cost, label: entry.title ?? 'Shoot' })

      } else if (tt === 'edit') {
        let editCost = 0
        const storedVideos = entry.editing_videos ?? []

        if (storedVideos.length > 0) {
          // Old/full format: video details stored inside editing_videos array
          for (const v of storedVideos) {
            const vType = (v.video_type ?? '').trim() || inferVideoType(entry.title)
            const vCost = calcVideoCost(v, hourly, rateMap)
            editCost += vCost
            tm.videoCount++
            if (isMedia) { mediaEditCount++; mediaEditHours += v.time_taken ?? 0 }
            if (!videoMap[vType]) videoMap[vType] = { videoType: vType, count: 0, totalTimeTaken: 0, totalCost: 0, videos: [] }
            videoMap[vType].count++
            videoMap[vType].totalTimeTaken += v.time_taken ?? 0
            videoMap[vType].totalCost      += vCost
            videoMap[vType].videos.push({
              date: row.date, memberName: user.name,
              videoName: v.video_name ?? entry.title ?? '—', videoType: vType,
              timeTaken: v.time_taken ?? 0, revisions: v.revisions ?? 0, cost: vCost,
            })
          }
        } else {
          // Current format: the entry itself IS one video
          const anyEntry = entry as Record<string, unknown>
          const vType = ((anyEntry.video_type as string | undefined) ?? '').trim()
            || inferVideoType(entry.title)
          const timeTaken = (anyEntry.time_taken as number | undefined) ?? hrs
          const typeRate  = rateMap[vType.toLowerCase()] ?? 0
          const laborCost = hourly * timeTaken
          const vCost     = typeRate + laborCost
          editCost = vCost
          tm.videoCount++
          if (isMedia) { mediaEditCount++; mediaEditHours += timeTaken }
          if (!videoMap[vType]) videoMap[vType] = { videoType: vType, count: 0, totalTimeTaken: 0, totalCost: 0, videos: [] }
          videoMap[vType].count++
          videoMap[vType].totalTimeTaken += timeTaken
          videoMap[vType].totalCost      += vCost
          videoMap[vType].videos.push({
            date: row.date, memberName: user.name,
            videoName: entry.title ?? '—', videoType: vType,
            timeTaken, revisions: (anyEntry.revisions as number | undefined) ?? 0, cost: vCost,
          })
        }
        tm.cost += editCost
        dayMap[row.date].push({ date: row.date, memberName: user.name, taskType: 'edit', itemCount: Math.max(storedVideos.length, 1), hours: hrs, cost: editCost, label: 'Editing' })

      } else {
        const cost = hourly * hrs
        otherWork.push({ date: row.date, memberName: user.name, title: stripBracketPrefix(entry.title ?? 'Work'), hours: hrs, cost })
        tm.otherHours += hrs
        tm.cost       += cost
        dayMap[row.date].push({ date: row.date, memberName: user.name, taskType: tt, itemCount: 0, hours: hrs, cost, label: entry.title ?? 'Work' })
      }
    }

    // Accumulate learning hours from daily_updates for days this member worked on this client
    if (rowHasClientEntry && !contributingRows.has(row.id)) {
      contributingRows.add(row.id)
      totalLearningHours += row.learning_hours ?? 0
    }
  }

  const dayLog: DayLogEntry[] = Object.keys(dayMap)
    .sort((a, b) => b.localeCompare(a))
    .flatMap(d => dayMap[d])

  const videoTypeGroups    = Object.values(videoMap).sort((a, b) => b.count - a.count)
  const teamContributions  = Object.values(teamMap).sort((a, b) => b.totalHours - a.totalHours)

  const totalVideos        = videoTypeGroups.reduce((s, g) => s + g.count, 0)
  const posterKey          = Object.keys(videoMap).find(k => k.toLowerCase() === 'poster')
  const voiceoverKey       = Object.keys(videoMap).find(k => k.toLowerCase() === 'voice over')
  const totalPosters       = posterKey   ? videoMap[posterKey].count           : 0
  const posterHours        = posterKey   ? videoMap[posterKey].totalTimeTaken  : 0
  const voiceoverCount     = voiceoverKey ? videoMap[voiceoverKey].count        : 0
  const voiceoverHours     = voiceoverKey ? videoMap[voiceoverKey].totalTimeTaken : 0
  const totalShootSessions = shoots.length
  const totalShootHours    = shoots.reduce((s, e) => s + e.hours, 0)
  const activeMemberCount  = Object.keys(teamMap).length

  const videoTotalCost = videoTypeGroups.reduce((s, g) => s + g.totalCost, 0)
  const shootTotalCost = shoots.reduce((s, e) => s + e.cost, 0)
  const otherTotalCost = otherWork.reduce((s, e) => s + e.cost, 0)
  const totalCost      = videoTotalCost + shootTotalCost + otherTotalCost

  return {
    shoots: shoots.sort((a, b) => b.date.localeCompare(a.date)),
    videoTypeGroups,
    otherWork: otherWork.sort((a, b) => b.date.localeCompare(a.date)),
    teamContributions,
    dayLog,
    totalVideos,
    totalPosters,
    totalShootSessions,
    totalShootHours,
    totalCost,
    mediaShootCount,
    mediaShootHours,
    mediaEditCount,
    mediaEditHours,
    nonMediaWorkHours,
    voiceoverCount,
    voiceoverHours,
    posterHours,
    totalLearningHours,
    activeMemberCount,
  }
}
