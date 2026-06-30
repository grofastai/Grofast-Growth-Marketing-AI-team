// Shared types and computation logic for the unified clients+deliverables page.

export type PricingRate = { video_type: string; rate_per_video: number }
export type MemberUser  = { id: string; name: string; employee_id: string; hourly_rate: number | null; monthly_salary: number | null; team: string | null }

export type FreelancerWorkEntry = {
  id: string
  date_finished: string
  client_name: string
  title: string
  amount: number
  duration_mins: number | null
  team: string
  task_description: string | null
  freelancer_name: string
}

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
  is_multi_client?: boolean
  client_names?: string[]
  task_type?: 'shoot' | 'edit' | 'other' | 'voiceover' | 'poster' | 'break' | 'learning'
  title?: string
  start_time?: string
  end_time?: string
  duration_hours?: number
  editing_videos?: EditingVideo[]
  price?: number | null  // admin-set per-work price (Freelance Media Production members)
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
  clientName: string
  memberName: string
  title: string
  hours: number
  cost: number
}

export type VideoEntry = {
  date: string
  clientName: string
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
  clientName: string
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
  otherWork: OtherWorkEntry[]       // kept for backward compat (all non-shoot/edit)
  technicalWork: OtherWorkEntry[]   // task_type other/upload
  voiceoverWork: OtherWorkEntry[]   // task_type voiceover
  posterWork: OtherWorkEntry[]      // task_type poster
  teamContributions: TeamContribution[]
  dayLog: DayLogEntry[]
  totalVideos: number
  totalPosters: number
  totalShootSessions: number
  totalShootHours: number
  totalCost: number
  // KPI breakdowns
  mediaShootCount: number
  mediaShootHours: number
  mediaEditCount: number
  mediaEditHours: number
  nonMediaWorkHours: number
  voiceoverCount: number
  voiceoverHours: number
  posterHours: number
  totalLearningHours: number
  activeMemberCount: number
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

function freelancerTaskType(team: string, taskDescription: string | null): 'shoot' | 'edit' | 'voiceover' | 'poster' | 'other' {
  if (team === 'Freelance Videography')        return 'shoot'
  if (team === 'Freelance Video Editing')      return 'edit'
  if (team === 'Freelance Media Production')   return 'edit'
  if (team === 'Freelance RJ Voiceover')       return 'voiceover'
  if (team === 'Freelance Graphics Designer')  return 'poster'
  if (team === 'Freelance IT Technology & Media') {
    try {
      const cat = JSON.parse(taskDescription ?? '{}').category ?? ''
      if (cat === 'voiceover') return 'voiceover'
      if (cat === 'poster')    return 'poster'
    } catch { /* fallthrough */ }
    return 'other'
  }
  // Content Writer, Dev & Automation, Marketing & Ops → technical/other
  return 'other'
}

export function computeDeliverables(
  updates: UpdateRow[],
  users: MemberUser[],
  pricingRates: PricingRate[],
  clientFilter: string | string[] | null,   // null = all clients; string[] = multiple; string = one
  dateFrom: string,
  dateTo: string,
  freelancerEntries: FreelancerWorkEntry[] = [],
): DeliverableResult {
  const userMap  = new Map(users.map(u => [u.id, u]))
  const rateMap: Record<string, number> = {}
  for (const r of pricingRates) rateMap[r.video_type.toLowerCase()] = r.rate_per_video

  const shoots:         ShootEntry[]                     = []
  const videoMap:       Record<string, VideoTypeGroup>   = {}
  const otherWork:      OtherWorkEntry[]                 = []
  const technicalWork:  OtherWorkEntry[]                 = []
  const voiceoverWork:  OtherWorkEntry[]                 = []
  const posterWork:     OtherWorkEntry[]                 = []
  const teamMap:        Record<string, TeamContribution> = {}
  const dayMap:         Record<string, DayLogEntry[]>    = {}

  const normalizeClient = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase()
  const clientNameSet: Set<string> | null = clientFilter === null
    ? null
    : new Set((Array.isArray(clientFilter) ? clientFilter : [clientFilter]).map(normalizeClient))

  // KPI accumulators
  let mediaShootCount   = 0
  let mediaShootHours   = 0
  let mediaEditCount    = 0
  let mediaEditHours    = 0
  let nonMediaWorkHours = 0
  let totalLearningHours = 0
  let voiceoverCountAcc = 0
  let voiceoverHoursAcc = 0
  let posterCountAcc    = 0
  let posterHoursAcc    = 0
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
      const isMulti   = entry.is_multi_client === true && (entry.client_names?.length ?? 0) > 1
      const splitCount = isMulti ? (entry.client_names?.length ?? 1) : 1

      let entryClientName: string
      if (clientNameSet === null) {
        entryClientName = (entry.client_name ?? '').trim()
      } else {
        const names = isMulti ? (entry.client_names ?? []) : [entry.client_name ?? '']
        const matched = names.find(cn => clientNameSet.has(normalizeClient(cn)))
        if (!matched) continue
        entryClientName = matched.trim()
      }
      rowHasClientEntry = true

      const hrs = (entry.duration_hours ?? 0) / splitCount
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

      // Non-media working = all types except break (other+voiceover+poster+edit+learning)
      if (!isMedia && tt !== 'break') nonMediaWorkHours += hrs

      if (!dayMap[row.date]) dayMap[row.date] = []

      if (tt === 'shoot') {
        const cost = entry.price != null ? entry.price : hourly * hrs
        shoots.push({ date: row.date, clientName: entryClientName, memberName: user.name, title: stripBracketPrefix(entry.title ?? 'Shoot'), hours: hrs, cost })
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
            if (isMedia && !(entry as Record<string,unknown>).is_rework) { mediaEditCount++; mediaEditHours += v.time_taken ?? 0 }
            if (!videoMap[vType]) videoMap[vType] = { videoType: vType, count: 0, totalTimeTaken: 0, totalCost: 0, videos: [] }
            videoMap[vType].count++
            videoMap[vType].totalTimeTaken += v.time_taken ?? 0
            videoMap[vType].totalCost      += vCost
            videoMap[vType].videos.push({
              date: row.date, clientName: entryClientName, memberName: user.name,
              videoName: v.video_name ?? entry.title ?? '—', videoType: vType,
              timeTaken: v.time_taken ?? 0, revisions: v.revisions ?? 0, cost: vCost,
            })
          }
          // Admin-set price overrides the sum of per-video costs
          if (entry.price != null) editCost = entry.price
        } else {
          // Current format: the entry itself IS one video
          const anyEntry = entry as Record<string, unknown>
          const vType = ((anyEntry.video_type as string | undefined) ?? '').trim()
            || inferVideoType(entry.title)
          const timeTaken = (anyEntry.time_taken as number | undefined) ?? hrs
          const typeRate  = rateMap[vType.toLowerCase()] ?? 0
          const laborCost = hourly * timeTaken
          // Admin-set price (Freelance Media Production) takes priority over hourly calc
          const vCost = entry.price != null ? entry.price : (typeRate + laborCost)
          editCost = vCost
          tm.videoCount++
          if (isMedia && !(entry as Record<string,unknown>).is_rework) { mediaEditCount++; mediaEditHours += timeTaken }
          if (!videoMap[vType]) videoMap[vType] = { videoType: vType, count: 0, totalTimeTaken: 0, totalCost: 0, videos: [] }
          videoMap[vType].count++
          videoMap[vType].totalTimeTaken += timeTaken
          videoMap[vType].totalCost      += vCost
          videoMap[vType].videos.push({
            date: row.date, clientName: entryClientName, memberName: user.name,
            videoName: entry.title ?? '—', videoType: vType,
            timeTaken, revisions: (anyEntry.revisions as number | undefined) ?? 0, cost: vCost,
          })
        }
        tm.cost += editCost
        dayMap[row.date].push({ date: row.date, memberName: user.name, taskType: 'edit', itemCount: Math.max(storedVideos.length, 1), hours: hrs, cost: editCost, label: 'Editing' })

      } else if (tt === 'voiceover') {
        const cost = entry.price != null ? entry.price : hourly * hrs
        if (!(entry as Record<string,unknown>).is_rework) voiceoverCountAcc++
        voiceoverHoursAcc += hrs
        const ve = { date: row.date, clientName: entryClientName, memberName: user.name, title: stripBracketPrefix(entry.title ?? 'Voiceover'), hours: hrs, cost }
        otherWork.push(ve); voiceoverWork.push(ve)
        tm.otherHours += hrs; tm.cost += cost
        dayMap[row.date].push({ date: row.date, memberName: user.name, taskType: 'voiceover', itemCount: 1, hours: hrs, cost, label: entry.title ?? 'Voiceover' })

      } else if (tt === 'poster') {
        const cost = entry.price != null ? entry.price : hourly * hrs
        if (!(entry as Record<string,unknown>).is_rework) posterCountAcc++
        posterHoursAcc += hrs
        const pe = { date: row.date, clientName: entryClientName, memberName: user.name, title: stripBracketPrefix(entry.title ?? 'Poster'), hours: hrs, cost }
        otherWork.push(pe); posterWork.push(pe)
        tm.otherHours += hrs; tm.cost += cost
        dayMap[row.date].push({ date: row.date, memberName: user.name, taskType: 'poster', itemCount: 1, hours: hrs, cost, label: entry.title ?? 'Poster' })

      } else {
        const cost = entry.price != null ? entry.price : hourly * hrs
        const te = { date: row.date, clientName: entryClientName, memberName: user.name, title: stripBracketPrefix(entry.title ?? 'Work'), hours: hrs, cost }
        otherWork.push(te); technicalWork.push(te)
        tm.otherHours += hrs; tm.cost += cost
        dayMap[row.date].push({ date: row.date, memberName: user.name, taskType: tt, itemCount: 0, hours: hrs, cost, label: entry.title ?? 'Work' })
      }
    }

    // Accumulate learning hours from daily_updates for days this member worked on this client
    if (rowHasClientEntry && !contributingRows.has(row.id)) {
      contributingRows.add(row.id)
      totalLearningHours += row.learning_hours ?? 0
    }
  }

  // ── Freelancer entries (no-login teams from freelancer_work_entries_v2) ─────
  for (const fe of freelancerEntries) {
    if (fe.date_finished < dateFrom || fe.date_finished > dateTo) continue
    const clientLower = (fe.client_name ?? '').trim().toLowerCase()
    if (clientNameSet !== null && !clientNameSet.has(clientLower)) continue

    const tt    = freelancerTaskType(fe.team, fe.task_description)
    const cost  = fe.amount
    const hrs   = fe.duration_mins ? fe.duration_mins / 60 : 0
    const date  = fe.date_finished
    const name  = fe.freelancer_name
    const title = fe.title

    if (!dayMap[date]) dayMap[date] = []

    if (tt === 'shoot') {
      shoots.push({ date, clientName: fe.client_name, memberName: name, title, hours: hrs, cost })
      mediaShootCount++
      mediaShootHours += hrs
      dayMap[date].push({ date, memberName: name, taskType: 'shoot', itemCount: 1, hours: hrs, cost, label: title })

    } else if (tt === 'edit') {
      const tdRaw = (() => { try { return JSON.parse(fe.task_description ?? '{}') } catch { return {} } })()
      const vType = (tdRaw.video_type as string | undefined) || inferVideoType(title)
      if (!videoMap[vType]) videoMap[vType] = { videoType: vType, count: 0, totalTimeTaken: 0, totalCost: 0, videos: [] }
      videoMap[vType].count++
      videoMap[vType].totalTimeTaken += hrs
      videoMap[vType].totalCost      += cost
      videoMap[vType].videos.push({ date, clientName: fe.client_name, memberName: name, videoName: title, videoType: vType, timeTaken: hrs, revisions: (tdRaw.revisions as number | undefined) ?? 0, cost })
      if (!(fe as unknown as Record<string,unknown>).is_rework) { mediaEditCount++; mediaEditHours += hrs }
      dayMap[date].push({ date, memberName: name, taskType: 'edit', itemCount: 1, hours: hrs, cost, label: title })

    } else if (tt === 'voiceover') {
      if (!(fe as unknown as Record<string,unknown>).is_rework) voiceoverCountAcc++
      voiceoverHoursAcc += hrs
      const ve = { date, clientName: fe.client_name, memberName: name, title, hours: hrs, cost }
      otherWork.push(ve); voiceoverWork.push(ve)
      dayMap[date].push({ date, memberName: name, taskType: 'voiceover', itemCount: 1, hours: hrs, cost, label: title })

    } else if (tt === 'poster') {
      if (!(fe as unknown as Record<string,unknown>).is_rework) posterCountAcc++
      posterHoursAcc += hrs
      const pe = { date, clientName: fe.client_name, memberName: name, title, hours: hrs, cost }
      otherWork.push(pe); posterWork.push(pe)
      dayMap[date].push({ date, memberName: name, taskType: 'poster', itemCount: 1, hours: hrs, cost, label: title })

    } else {
      const te = { date, clientName: fe.client_name, memberName: name, title, hours: hrs, cost }
      otherWork.push(te); technicalWork.push(te)
      nonMediaWorkHours += hrs
      dayMap[date].push({ date, memberName: name, taskType: 'other', itemCount: 0, hours: hrs, cost, label: title })
    }
  }

  const dayLog: DayLogEntry[] = Object.keys(dayMap)
    .sort((a, b) => b.localeCompare(a))
    .flatMap(d => dayMap[d])

  const videoTypeGroups    = Object.values(videoMap).sort((a, b) => b.count - a.count)
  const teamContributions  = Object.values(teamMap).sort((a, b) => b.totalHours - a.totalHours)

  const totalVideos        = videoTypeGroups.reduce((s, g) => s + g.count, 0)
  const totalPosters       = posterCountAcc
  const posterHours        = posterHoursAcc
  const voiceoverCount     = voiceoverCountAcc
  const voiceoverHours     = voiceoverHoursAcc
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
    technicalWork:  technicalWork.sort((a, b)  => b.date.localeCompare(a.date)),
    voiceoverWork:  voiceoverWork.sort((a, b)  => b.date.localeCompare(a.date)),
    posterWork:     posterWork.sort((a, b)     => b.date.localeCompare(a.date)),
  }
}
