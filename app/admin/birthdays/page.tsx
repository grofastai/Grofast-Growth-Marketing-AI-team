export const revalidate = 3600

import { createServerClient } from "@/lib/supabase/server"
import { createClient } from "@supabase/supabase-js"
import { redirect } from "next/navigation"
import { Cake, Star, PartyPopper, Calendar, Users } from "lucide-react"

type UserRow = {
  id: string
  name: string
  employee_id: string
  team: string | null
  date_of_birth: string | null
  joined_at: string | null
}

type CelebrationEntry = {
  id: string
  name: string
  employee_id: string
  team: string | null
  type: "birthday" | "anniversary"
  daysUntil: number
  years?: number
  monthDay: string
}

function getDaysUntil(month: number, day: number, today: Date): number {
  const y = today.getFullYear()
  let next = new Date(y, month - 1, day)
  if (next.getTime() <= today.setHours(0, 0, 0, 0)) next = new Date(y + 1, month - 1, day)
  return Math.round((next.getTime() - new Date(today).setHours(0, 0, 0, 0)) / 86400000)
}

function formatMonthDay(dateStr: string) {
  const d = new Date(dateStr + "T12:00:00")
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "long" })
}

function getInitials(name: string) {
  return name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()
}

export default async function BirthdaysPage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const { data: profile } = await admin
    .from("users").select("company_id").eq("id", user.id).single()
  if (!profile) redirect("/login")

  const { data: raw } = await admin
    .from("users")
    .select("id, name, employee_id, team, date_of_birth, joined_at")
    .eq("company_id", profile.company_id)
    .eq("status", "active")
    .is("deleted_at", null)
    .order("name")

  const members = (raw ?? []) as unknown as UserRow[]
  const today = new Date()
  const todayStr = today.toISOString().split("T")[0]
  const currentYear = today.getFullYear()

  const celebrations: CelebrationEntry[] = []

  for (const m of members) {
    if (m.date_of_birth) {
      const dob = new Date(m.date_of_birth + "T12:00:00")
      const daysUntil = getDaysUntil(dob.getMonth() + 1, dob.getDate(), new Date(today))
      if (daysUntil <= 30) {
        celebrations.push({
          id: m.id + "-bday",
          name: m.name,
          employee_id: m.employee_id,
          team: m.team,
          type: "birthday",
          daysUntil,
          monthDay: formatMonthDay(m.date_of_birth),
        })
      }
    }
    if (m.joined_at) {
      const joined = new Date(m.joined_at + "T12:00:00")
      const years = currentYear - joined.getFullYear()
      if (years <= 0) continue
      const daysUntil = getDaysUntil(joined.getMonth() + 1, joined.getDate(), new Date(today))
      if (daysUntil <= 30) {
        celebrations.push({
          id: m.id + "-ann",
          name: m.name,
          employee_id: m.employee_id,
          team: m.team,
          type: "anniversary",
          daysUntil,
          years,
          monthDay: formatMonthDay(m.joined_at),
        })
      }
    }
  }

  celebrations.sort((a, b) => a.daysUntil - b.daysUntil)

  const todayCelebrations = celebrations.filter(c => c.daysUntil === 0)
  const thisWeek          = celebrations.filter(c => c.daysUntil > 0 && c.daysUntil <= 7)
  const laterThisMonth    = celebrations.filter(c => c.daysUntil > 7 && c.daysUntil <= 30)

  const birthdaysThisMonth = members.filter(m => {
    if (!m.date_of_birth) return false
    const d = new Date(m.date_of_birth + "T12:00:00")
    return getDaysUntil(d.getMonth() + 1, d.getDate(), new Date(today)) <= 30
  }).length

  const anniversariesThisMonth = celebrations.filter(c => c.type === "anniversary").length

  return (
    <div className="p-4 md:p-6 xl:p-8 max-w-[1000px]">
      {/* Header */}
      <div className="mb-7">
        <h1 className="gradient-heading text-[30px] font-black leading-tight"
          style={{ fontFamily: "var(--font-jakarta)" }}>
          Birthdays &amp; Anniversaries
        </h1>
        <p className="text-sm mt-1" style={{ color: "#000000" }}>
          Upcoming celebrations in the next 30 days
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mb-7">
        {[
          { label: "Today",             value: todayCelebrations.length, icon: PartyPopper, color: "#de1a1a" },
          { label: "Birthdays (30d)",   value: birthdaysThisMonth,       icon: Cake,        color: "#F59E0B" },
          { label: "Anniversaries (30d)", value: anniversariesThisMonth, icon: Star,        color: "#6366F1" },
        ].map(s => {
          const Icon = s.icon
          return (
            <div key={s.label} className="rounded-xl p-4"
              style={{ background: "#FFFFFF", border: "1px solid #E5E7EB" }}>
              <div className="flex items-center gap-2 mb-2">
                <Icon size={13} style={{ color: s.color }} />
                <p className="text-[10px] uppercase tracking-[0.15em] font-bold" style={{ color: "#000000" }}>
                  {s.label}
                </p>
              </div>
              <p className="text-[28px] font-black leading-none"
                style={{ fontFamily: "var(--font-jakarta)", color: s.color }}>
                {s.value}
              </p>
            </div>
          )
        })}
      </div>

      {celebrations.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 rounded-2xl"
          style={{ background: "rgba(0,0,0,0.02)", border: "1px solid #E5E7EB" }}>
          <Calendar size={36} style={{ color: "#E5E7EB" }} className="mb-3" />
          <p className="text-[14px] font-semibold" style={{ color: "#000000" }}>No celebrations in the next 30 days</p>
          <p className="text-[12px] mt-1" style={{ color: "#000000" }}>
            Add Date of Birth and Work Start Date in team member profiles.
          </p>
        </div>
      ) : (
        <div className="space-y-8">

          {/* Today */}
          {todayCelebrations.length > 0 && (
            <div>
              <div className="flex items-center gap-3 mb-4">
                <PartyPopper size={14} style={{ color: "#de1a1a" }} />
                <p className="text-[12px] font-bold uppercase tracking-[0.2em]"
                  style={{ color: "#de1a1a" }}>Today</p>
                <div className="flex-1 h-px" style={{ background: "rgba(222,26,26,0.15)" }} />
              </div>
              <div className="space-y-3">
                {todayCelebrations.map(c => (
                  <CelebrationCard key={c.id} c={c} highlight />
                ))}
              </div>
            </div>
          )}

          {/* This week */}
          {thisWeek.length > 0 && (
            <div>
              <div className="flex items-center gap-3 mb-4">
                <Calendar size={13} style={{ color: "#000000" }} />
                <p className="text-[11px] font-bold uppercase tracking-[0.2em]" style={{ color: "#000000" }}>
                  This Week
                </p>
                <div className="flex-1 h-px" style={{ background: "#E5E7EB" }} />
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
                  style={{ background: "rgba(0,0,0,0.04)", color: "#000000" }}>
                  {thisWeek.length}
                </span>
              </div>
              <div className="space-y-2">
                {thisWeek.map(c => <CelebrationCard key={c.id} c={c} />)}
              </div>
            </div>
          )}

          {/* Later this month */}
          {laterThisMonth.length > 0 && (
            <div>
              <div className="flex items-center gap-3 mb-4">
                <Calendar size={13} style={{ color: "#000000" }} />
                <p className="text-[11px] font-bold uppercase tracking-[0.2em]" style={{ color: "#000000" }}>
                  Later This Month
                </p>
                <div className="flex-1 h-px" style={{ background: "#E5E7EB" }} />
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
                  style={{ background: "rgba(0,0,0,0.04)", color: "#000000" }}>
                  {laterThisMonth.length}
                </span>
              </div>
              <div className="space-y-2">
                {laterThisMonth.map(c => <CelebrationCard key={c.id} c={c} />)}
              </div>
            </div>
          )}

        </div>
      )}

      {/* Members with no dates */}
      {(() => {
        const noDates = members.filter(m => !m.date_of_birth && !m.joined_at)
        if (!noDates.length) return null
        return (
          <div className="mt-8 rounded-xl p-5" style={{ background: "#FAFAFA", border: "1px solid #E5E7EB" }}>
            <div className="flex items-center gap-2 mb-3">
              <Users size={13} style={{ color: "#000000" }} />
              <p className="text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: "#000000" }}>
                Missing Dates ({noDates.length} members)
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {noDates.map(m => (
                <span key={m.id} className="text-[11px] font-semibold px-2.5 py-1 rounded-full"
                  style={{ background: "rgba(0,0,0,0.04)", color: "#000000" }}>
                  {m.name}
                </span>
              ))}
            </div>
            <p className="text-[11px] mt-2" style={{ color: "#000000" }}>
              Edit these members to add their Date of Birth and Work Start Date.
            </p>
          </div>
        )
      })()}
    </div>
  )
}

function CelebrationCard({ c, highlight }: { c: CelebrationEntry; highlight?: boolean }) {
  const isBday = c.type === "birthday"
  const color  = isBday ? "#F59E0B" : "#6366F1"
  const bgTint = isBday ? "rgba(245,158,11,0.06)" : "rgba(99,102,241,0.06)"
  const border = isBday ? "rgba(245,158,11,0.18)" : "rgba(99,102,241,0.18)"
  const initials = c.name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()

  return (
    <div className="flex items-center gap-4 rounded-xl px-4 py-3.5"
      style={{
        background: highlight ? bgTint : "#FFFFFF",
        border: `1px solid ${highlight ? border : "#E5E7EB"}`,
        boxShadow: highlight ? `0 2px 12px ${isBday ? "rgba(245,158,11,0.1)" : "rgba(99,102,241,0.1)"}` : "none",
      }}>
      {/* Avatar */}
      <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
        style={{ background: bgTint, border: `1.5px solid ${border}` }}>
        <span className="text-[12px] font-bold" style={{ color }}>{initials}</span>
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-[14px] font-bold truncate" style={{ color: "#111111" }}>{c.name}</p>
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0"
            style={{ background: bgTint, color }}>
            #{c.employee_id}
          </span>
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          {isBday
            ? <Cake size={11} style={{ color }} />
            : <Star size={11} style={{ color }} />}
          <p className="text-[12px]" style={{ color: "#000000" }}>
            {isBday
              ? `Birthday — ${c.monthDay}`
              : `${c.years} year${c.years !== 1 ? "s" : ""} work anniversary — ${c.monthDay}`}
          </p>
          {c.team && (
            <span className="text-[11px]" style={{ color: "#000000" }}>· {c.team}</span>
          )}
        </div>
      </div>

      {/* Days badge */}
      <div className="flex-shrink-0 text-right">
        {c.daysUntil === 0 ? (
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full"
            style={{ background: bgTint, border: `1px solid ${border}` }}>
            <PartyPopper size={12} style={{ color }} />
            <span className="text-[12px] font-bold" style={{ color }}>Today!</span>
          </div>
        ) : (
          <div className="px-3 py-1.5 rounded-full text-center"
            style={{ background: "rgba(0,0,0,0.03)", border: "1px solid #E5E7EB" }}>
            <p className="text-[16px] font-black leading-none" style={{ color }}>{c.daysUntil}</p>
            <p className="text-[9px] font-medium" style={{ color: "#000000" }}>days</p>
          </div>
        )}
      </div>
    </div>
  )
}
