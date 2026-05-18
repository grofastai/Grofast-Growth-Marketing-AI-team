"use client"

import { useState, useTransition } from "react"
import { Camera, Scissors, Mic, CheckCircle, Clock, IndianRupee, Calendar, AlertTriangle } from "lucide-react"
import { markAsPaid } from "@/lib/actions/freelancer-updates"

interface Update {
  id: string
  date: string
  work_type: string
  client_name: string
  shoot_title?: string | null
  shoot_duration?: number | null
  video_uploaded?: boolean | null
  video_name?: string | null
  video_type?: string | null
  time_taken?: number | null
  revisions?: number | null
  script_name?: string | null
  vo_duration?: string | null
  cost?: number | null
  payment_status: string
  paid_date?: string | null
  deadline?: string | null
  freelancer: { name: string; employee_id: string; specialty?: string | null } | null
  submitter: { name: string } | null
  created_at: string
}

interface Props { updates: Update[] }

const TYPE_META: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  shooting:   { label: "Shooting",   color: "#3B82F6", icon: Camera },
  editing:    { label: "Editing",    color: "#8B5CF6", icon: Scissors },
  voice_over: { label: "Voice Over", color: "#F59E0B", icon: Mic },
}

function getWorkSummary(r: Update) {
  if (r.work_type === "shooting")   return `${r.shoot_title ?? "—"} · ${r.shoot_duration ?? "?"}h`
  if (r.work_type === "editing")    return `${r.video_name ?? "—"} · ${r.time_taken ?? "?"}h · ${r.revisions ?? 0} rev`
  if (r.work_type === "voice_over") return `${r.script_name ?? "—"} · ${r.vo_duration ?? "?"}`
  return "—"
}

function isOverdue(deadline: string | null | undefined, paymentStatus: string) {
  if (!deadline || paymentStatus === "paid") return false
  return new Date(deadline) < new Date(new Date().toDateString())
}

function PayBadge({ update, onPaid }: { update: Update; onPaid: (id: string) => void }) {
  const [pending, startTransition] = useTransition()
  const paid = update.payment_status === "paid"
  const overdue = isOverdue(update.deadline, update.payment_status)

  if (paid) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20, background: "rgba(45,106,79,0.1)", color: "#2D6A4F" }}>
          <CheckCircle size={11} /> Paid
        </span>
        {update.paid_date && <span style={{ fontSize: 11, color: "#A0AEC0" }}>{update.paid_date}</span>}
      </div>
    )
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end" }}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20, background: overdue ? "rgba(239,68,68,0.08)" : "rgba(245,158,11,0.1)", color: overdue ? "#EF4444" : "#D97706" }}>
        {overdue ? <AlertTriangle size={11} /> : <Clock size={11} />}
        {overdue ? "Overdue" : "Unpaid"}
      </span>
      <button
        disabled={pending}
        onClick={() => startTransition(async () => { await markAsPaid(update.id); onPaid(update.id) })}
        style={{ fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 8, border: "1.5px solid #2D6A4F", background: "transparent", color: "#2D6A4F", cursor: pending ? "not-allowed" : "pointer", opacity: pending ? 0.6 : 1 }}
      >
        {pending ? "Marking…" : "Mark Paid"}
      </button>
    </div>
  )
}

export default function ActivitiesClient({ updates: initial }: Props) {
  const [updates, setUpdates] = useState(initial)

  function handlePaid(id: string) {
    const today = new Date().toISOString().split("T")[0]
    setUpdates(prev => prev.map(u => u.id === id ? { ...u, payment_status: "paid", paid_date: today } : u))
  }

  const unpaidTotal = updates.filter(u => u.payment_status === "unpaid" && u.cost).reduce((s, u) => s + (u.cost ?? 0), 0)
  const overdueCount = updates.filter(u => isOverdue(u.deadline, u.payment_status)).length

  // Group by date
  const byDate: Record<string, Update[]> = {}
  for (const u of updates) {
    if (!byDate[u.date]) byDate[u.date] = []
    byDate[u.date].push(u)
  }
  const dates = Object.keys(byDate).sort((a, b) => b.localeCompare(a))

  return (
    <div>
      {/* Summary strip */}
      {updates.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 24 }}>
          <div style={{ background: "#FFFFFF", borderRadius: 12, padding: "14px 18px", border: "1px solid #E2E8F0", display: "flex", alignItems: "center", gap: 12 }}>
            <IndianRupee size={18} color="#EF4444" />
            <div>
              <p style={{ fontSize: 18, fontWeight: 800, color: "#1A202C", margin: 0 }}>₹{unpaidTotal.toLocaleString("en-IN")}</p>
              <p style={{ fontSize: 11, color: "#718096", margin: 0, fontWeight: 600 }}>Pending Payment</p>
            </div>
          </div>
          <div style={{ background: "#FFFFFF", borderRadius: 12, padding: "14px 18px", border: "1px solid #E2E8F0", display: "flex", alignItems: "center", gap: 12 }}>
            <AlertTriangle size={18} color={overdueCount > 0 ? "#EF4444" : "#A0AEC0"} />
            <div>
              <p style={{ fontSize: 18, fontWeight: 800, color: overdueCount > 0 ? "#EF4444" : "#1A202C", margin: 0 }}>{overdueCount}</p>
              <p style={{ fontSize: 11, color: "#718096", margin: 0, fontWeight: 600 }}>Overdue</p>
            </div>
          </div>
          <div style={{ background: "#FFFFFF", borderRadius: 12, padding: "14px 18px", border: "1px solid #E2E8F0", display: "flex", alignItems: "center", gap: 12 }}>
            <CheckCircle size={18} color="#2D6A4F" />
            <div>
              <p style={{ fontSize: 18, fontWeight: 800, color: "#1A202C", margin: 0 }}>{updates.filter(u => u.payment_status === "paid").length}</p>
              <p style={{ fontSize: 11, color: "#718096", margin: 0, fontWeight: 600 }}>Paid Updates</p>
            </div>
          </div>
        </div>
      )}

      {dates.length === 0 ? (
        <div style={{ background: "#FFFFFF", borderRadius: 16, border: "1px solid #E2E8F0", padding: "60px 22px", textAlign: "center" }}>
          <p style={{ fontSize: 15, fontWeight: 700, color: "#4A5568", margin: 0 }}>No updates yet</p>
          <p style={{ fontSize: 13, color: "#A0AEC0", margin: "4px 0 0" }}>Log the first update from the &quot;Log Update&quot; page</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          {dates.map(date => {
            const rows = byDate[date]
            return (
              <div key={date}>
                <p style={{ fontSize: 12, fontWeight: 700, color: "#718096", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10 }}>
                  {new Date(date + "T00:00:00").toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                </p>
                <div style={{ background: "#FFFFFF", borderRadius: 14, border: "1px solid #E2E8F0", overflow: "hidden" }}>
                  {rows.map((r, i) => {
                    const meta = TYPE_META[r.work_type] ?? { label: r.work_type, color: "#718096", icon: Mic }
                    const Icon = meta.icon
                    const overdue = isOverdue(r.deadline, r.payment_status)
                    return (
                      <div key={r.id} style={{ padding: "16px 20px", borderBottom: i < rows.length - 1 ? "1px solid #F7FAFC" : "none", display: "flex", alignItems: "flex-start", gap: 14, background: overdue ? "rgba(239,68,68,0.02)" : "transparent" }}>
                        {/* Icon */}
                        <div style={{ width: 38, height: 38, borderRadius: 10, background: meta.color + "15", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 2 }}>
                          <Icon size={16} color={meta.color} />
                        </div>

                        {/* Main info */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                            <span style={{ fontSize: 13, fontWeight: 700, color: "#2D3748" }}>
                              {r.freelancer?.name ?? "—"}
                              <span style={{ fontSize: 11, color: "#A0AEC0", marginLeft: 6 }}>({r.freelancer?.employee_id ?? "—"})</span>
                            </span>
                            {r.freelancer?.specialty && (
                              <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 20, background: "rgba(59,130,246,0.08)", color: "#3B82F6" }}>{r.freelancer.specialty}</span>
                            )}
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 20, background: meta.color + "15", color: meta.color }}>
                              <Icon size={10} />{meta.label}
                            </span>
                            {r.work_type === "shooting" && r.video_uploaded && (
                              <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, color: "#2D6A4F", fontWeight: 600 }}>
                                <CheckCircle size={10} /> Uploaded
                              </span>
                            )}
                          </div>

                          <p style={{ margin: "3px 0 0", fontSize: 13, color: "#4A5568" }}>{getWorkSummary(r)}</p>

                          <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 5, flexWrap: "wrap" }}>
                            <span style={{ fontSize: 12, color: "#A0AEC0" }}>Client: <strong style={{ color: "#718096" }}>{r.client_name}</strong></span>
                            {r.cost && (
                              <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 12, fontWeight: 700, color: "#2D3748" }}>
                                <IndianRupee size={11} />₹{Number(r.cost).toLocaleString("en-IN")}
                              </span>
                            )}
                            {r.deadline && (
                              <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, color: overdue ? "#EF4444" : "#718096", fontWeight: overdue ? 700 : 400 }}>
                                <Calendar size={11} /> Due {r.deadline}
                              </span>
                            )}
                            <span style={{ fontSize: 11, color: "#CBD5E0" }}>by {r.submitter?.name ?? "—"}</span>
                          </div>
                        </div>

                        {/* Payment status */}
                        <div style={{ flexShrink: 0, marginTop: 2 }}>
                          <PayBadge update={r} onPaid={handlePaid} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
