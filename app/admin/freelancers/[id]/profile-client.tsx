"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import {
  ArrowLeft, User, Briefcase, IndianRupee, FileText, Activity,
  Plus, X, ChevronDown,
} from "lucide-react"
import {
  createWorkEntry, approveWorkEntry, rejectWorkEntry,
} from "@/lib/actions/freelancers"
import { addFreelancerPayment, deleteFreelancerPayment } from "@/lib/actions/freelancer-payments"
import { buildClientOptions } from "@/lib/utils/client-options"
import ClientSelector from "@/components/ui/ClientSelector"

// ── Types ────────────────────────────────────────────────────────────────────

export type FreelancerRecord = {
  id: string; name: string; type: string; phone?: string | null
  whatsapp?: string | null; location?: string | null; upi_id?: string | null
  bank_name?: string | null; account_number?: string | null; ifsc?: string | null
  notes?: string | null; status: string; rating?: number
  cost_per_video?: number | null; cost_per_minute?: number | null; cost_per_hour?: number | null
  availability_notes?: string | null; created_at: string
}

export type WorkEntryRecord = {
  id: string; date: string; client_name?: string | null; title: string
  entry_type?: string | null; amount: number; approval_status: string
  rejected_reason?: string | null; notes?: string | null
  audio_duration_minutes?: number | null; cost_per_minute_snapshot?: number | null
  cost_per_video_snapshot?: number | null; cost_per_hour_snapshot?: number | null
  created_at: string
}

export type PaymentRecord = {
  id: string; amount: number; payment_method: string
  reference_number?: string | null; notes?: string | null
  paid_date: string; created_at: string
}

export type ActivityRecord = {
  id: string; action: string; actor_name?: string | null
  remarks?: string | null; created_at: string
}

export type Stats = {
  pendingBalance: number
  thisMonthEarned: number
  totalEarned: number
  thisMonthPaid: number
  totalWorks: number
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

function fmtDate(d: string) {
  return new Date(d + "T12:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
}

function fmtDateTime(d: string) {
  return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
}

const TYPE_LABEL: Record<string, string> = {
  voice_over: "Voice Artist", video_editor: "Video Editor",
  video_shooter: "Video Shooter", other: "Other",
}
const TYPE_COLOR: Record<string, string> = {
  voice_over: "#8b5cf6", video_editor: "#0ea5e9",
  video_shooter: "#10b981", other: "#6b7280",
}

const CARD: React.CSSProperties = {
  background: "#FFFFFF", borderRadius: 16,
  border: "1px solid #E5E7EB",
  boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
}

const inputStyle: React.CSSProperties = {
  display: "block", width: "100%", marginTop: 4,
  padding: "10px 12px", borderRadius: 10,
  border: "1px solid #E5E7EB", fontSize: 13, outline: "none",
  background: "#FFF", color: "#111827",
}

function Label({ text }: { text: string }) {
  return <label style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.05em" }}>{text}</label>
}

// ── Tab definitions ──────────────────────────────────────────────────────────

const TABS = [
  { key: "overview",     label: "Overview",     Icon: User },
  { key: "work_entries", label: "Work Entries",  Icon: Briefcase },
  { key: "payments",     label: "Payments",      Icon: IndianRupee },
  { key: "statements",   label: "Statements",    Icon: FileText },
  { key: "activity",     label: "Activity",      Icon: Activity },
]

function clampDate(v: string) { if (!v) return v; const [yr = '', mo = '', dy = ''] = v.split('-'); const y = yr.length > 4 ? yr.slice(0, 4) : yr; const m = mo && +mo > 12 ? '12' : mo; const d = dy && +dy > 31 ? '31' : dy; return [y, m, d].filter(Boolean).join('-') }
// ── Main Component ───────────────────────────────────────────────────────────

export default function FreelancerProfileClient({
  freelancer, workEntries, payments, activityLogs,
  activeClientNames, pastClientNames, currentUserId, currentUserName, currentUserRole, stats,
}: {
  freelancer: FreelancerRecord
  workEntries: WorkEntryRecord[]
  payments: PaymentRecord[]
  activityLogs: ActivityRecord[]
  activeClientNames: string[]
  pastClientNames: string[]
  currentUserId: string
  currentUserName: string
  currentUserRole: string
  stats: Stats
}) {
  const [activeTab, setActiveTab] = useState("overview")
  const typeColor = TYPE_COLOR[freelancer.type] ?? "#6b7280"

  return (
    <div style={{ background: "#F5F6FA", minHeight: "100vh" }} className="p-4 lg:p-6 space-y-4">

      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <Link href="/admin/freelancers"
          style={{ width: 36, height: 36, borderRadius: 10, background: "#FFF", border: "1px solid #E5E7EB", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <ArrowLeft size={16} style={{ color: "#374151" }} />
        </Link>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: 20, fontWeight: 900, color: "#111827", margin: 0 }}>{freelancer.name}</h1>
          <p style={{ fontSize: 12, color: typeColor, fontWeight: 700, margin: 0 }}>{TYPE_LABEL[freelancer.type] ?? "Freelancer"}</p>
        </div>
        <span style={{
          padding: "4px 12px", borderRadius: 99, fontSize: 11, fontWeight: 700,
          background: freelancer.status === "active" ? "rgba(22,163,74,0.08)" : "rgba(107,114,128,0.08)",
          color: freelancer.status === "active" ? "#16A34A" : "#6B7280",
        }}>
          {freelancer.status === "active" ? "Active" : "Inactive"}
        </span>
      </div>

      {/* Tab Bar */}
      <div style={{ ...CARD, padding: "4px 8px", display: "flex", gap: 4, overflowX: "auto" }}>
        {TABS.map(t => {
          const active = activeTab === t.key
          const Icon = t.Icon
          return (
            <button key={t.key} onClick={() => setActiveTab(t.key)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12px] font-semibold transition-all flex-shrink-0"
              style={active ? { background: "#DE1A1A", color: "#FFF" } : { color: "#6B7280" }}>
              <Icon size={13} />{t.label}
            </button>
          )
        })}
      </div>

      {/* Tab Content */}
      {activeTab === "overview"     && <OverviewTab     freelancer={freelancer} stats={stats} typeColor={typeColor} />}
      {activeTab === "work_entries" && <WorkEntriesTab  freelancer={freelancer} workEntries={workEntries} currentUserRole={currentUserRole} activeClientNames={activeClientNames} pastClientNames={pastClientNames} />}
      {activeTab === "payments"     && <PaymentsTab     freelancer={freelancer} payments={payments} stats={stats} currentUserRole={currentUserRole} />}
      {activeTab === "statements"   && <StatementsTab   freelancer={freelancer} />}
      {activeTab === "activity"     && <ActivityTab     activityLogs={activityLogs} />}
    </div>
  )
}

// ── Tab 1: Overview ──────────────────────────────────────────────────────────

function OverviewTab({ freelancer, stats, typeColor }: {
  freelancer: FreelancerRecord; stats: Stats; typeColor: string
}) {
  const statCards = [
    { label: "Pending Balance",     value: fmt(stats.pendingBalance),  color: stats.pendingBalance > 0 ? "#DE1A1A" : "#16A34A" },
    { label: "This Month Earnings", value: fmt(stats.thisMonthEarned), color: "#0EA5E9" },
    { label: "Total Earnings",      value: fmt(stats.totalEarned),     color: "#6366F1" },
    { label: "This Month Paid",     value: fmt(stats.thisMonthPaid),   color: "#10B981" },
    { label: "Works Completed",     value: String(stats.totalWorks),   color: "#D97706" },
  ]

  const details = [
    { label: "Name",     value: freelancer.name },
    { label: "Role",     value: TYPE_LABEL[freelancer.type] ?? freelancer.type },
    { label: "Phone",    value: freelancer.phone ?? "—" },
    { label: "WhatsApp", value: freelancer.whatsapp ?? "—" },
    { label: "Location", value: freelancer.location ?? "—" },
    { label: "UPI ID",   value: freelancer.upi_id ?? "—" },
    { label: "Bank",     value: freelancer.bank_name ? `${freelancer.bank_name} · ${freelancer.account_number ?? ""} · ${freelancer.ifsc ?? ""}` : "—" },
    { label: "Notes",    value: freelancer.notes ?? freelancer.availability_notes ?? "—" },
    { label: "Joined",   value: fmtDate(freelancer.created_at.split("T")[0]) },
  ]

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {statCards.map(s => (
          <div key={s.label} style={{ ...CARD, padding: 16 }}>
            <p style={{ fontSize: 20, fontWeight: 900, color: s.color, margin: 0 }}>{s.value}</p>
            <p style={{ fontSize: 11, color: "#6B7280", margin: "4px 0 0", fontWeight: 600 }}>{s.label}</p>
          </div>
        ))}
      </div>

      <div style={{ ...CARD, padding: 20 }}>
        <h3 style={{ fontSize: 14, fontWeight: 800, color: "#111827", marginBottom: 16 }}>Personal Details</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {details.map(row => (
            <div key={row.label}>
              <p style={{ fontSize: 10, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", margin: 0 }}>{row.label}</p>
              <p style={{ fontSize: 13, fontWeight: 600, color: "#111827", margin: "2px 0 0" }}>{row.value}</p>
            </div>
          ))}
        </div>
      </div>

      {(freelancer.cost_per_video || freelancer.cost_per_minute || freelancer.cost_per_hour) && (
        <div style={{ ...CARD, padding: 20 }}>
          <h3 style={{ fontSize: 14, fontWeight: 800, color: "#111827", marginBottom: 16 }}>Default Rates</h3>
          <div className="flex flex-wrap gap-3">
            {freelancer.cost_per_video && (
              <div style={{ padding: "10px 16px", borderRadius: 10, background: `${typeColor}10`, border: `1px solid ${typeColor}30` }}>
                <p style={{ fontSize: 18, fontWeight: 900, color: typeColor, margin: 0 }}>₹{freelancer.cost_per_video}</p>
                <p style={{ fontSize: 11, color: "#6B7280", margin: "2px 0 0" }}>Per Video</p>
              </div>
            )}
            {freelancer.cost_per_minute && (
              <div style={{ padding: "10px 16px", borderRadius: 10, background: `${typeColor}10`, border: `1px solid ${typeColor}30` }}>
                <p style={{ fontSize: 18, fontWeight: 900, color: typeColor, margin: 0 }}>₹{freelancer.cost_per_minute}</p>
                <p style={{ fontSize: 11, color: "#6B7280", margin: "2px 0 0" }}>Per Minute</p>
              </div>
            )}
            {freelancer.cost_per_hour && (
              <div style={{ padding: "10px 16px", borderRadius: 10, background: `${typeColor}10`, border: `1px solid ${typeColor}30` }}>
                <p style={{ fontSize: 18, fontWeight: 900, color: typeColor, margin: 0 }}>₹{freelancer.cost_per_hour}</p>
                <p style={{ fontSize: 11, color: "#6B7280", margin: "2px 0 0" }}>Per Hour</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Tab 2: Work Entries ──────────────────────────────────────────────────────

const APPROVAL_COLOR: Record<string, string> = {
  pending: "#D97706", approved: "#16A34A", rejected: "#DE1A1A",
}
const APPROVAL_BG: Record<string, string> = {
  pending: "rgba(217,119,6,0.08)", approved: "rgba(22,163,74,0.08)", rejected: "rgba(222,26,26,0.06)",
}
const APPROVAL_LABEL: Record<string, string> = {
  pending: "Pending Approval", approved: "Approved", rejected: "Rejected",
}

function WorkEntriesTab({ freelancer, workEntries, currentUserRole, activeClientNames, pastClientNames }: {
  freelancer: FreelancerRecord; workEntries: WorkEntryRecord[]; currentUserRole: string; activeClientNames: string[]; pastClientNames: string[]
}) {
  const { activeOptions: fullActiveClientNames, pastOptions: fullPastClientNames } = buildClientOptions(activeClientNames, pastClientNames)
  const [showAdd, setShowAdd]           = useState(false)
  const [rejectId, setRejectId]         = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState("")
  const [isPending, startTransition]    = useTransition()

  const defaultRate = String(
    freelancer.type === "video_editor"  ? (freelancer.cost_per_video ?? "") :
    freelancer.type === "video_shooter" ? (freelancer.cost_per_minute ?? "") :
    freelancer.type === "voice_over"    ? (freelancer.cost_per_minute ?? freelancer.cost_per_hour ?? "") :
    (freelancer.cost_per_hour ?? "")
  )

  const [form, setForm] = useState({
    date: new Date().toISOString().split("T")[0],
    client_name: "", title: "", quantity: "", rate: defaultRate, notes: "", manual_amount: "",
  })

  const total = (parseFloat(form.quantity) || 0) * (parseFloat(form.rate) || 0)

  const qtyLabel =
    freelancer.type === "video_editor"  ? "Video Count" :
    freelancer.type === "video_shooter" ? "Minutes"     :
    freelancer.type === "voice_over"    ? "Count"       : "Quantity"

  const rateLabel =
    freelancer.type === "video_editor"  ? "Rate Per Video"   :
    freelancer.type === "video_shooter" ? "Rate Per Minute"  :
    freelancer.type === "voice_over"    ? "Rate Per Entry"   : "Rate"

  function handleAdd() {
    startTransition(async () => {
      const entryType =
        freelancer.type === "video_editor"  ? "video_edit"   :
        freelancer.type === "video_shooter" ? "video_shoot"  : "voice_over"
      await createWorkEntry({
        freelancer_id: freelancer.id,
        entry_type: entryType as "voice_over" | "video_edit" | "video_shoot",
        date:        form.date,
        client_name: form.client_name || undefined,
        title:       form.title,
        notes:       form.notes || undefined,
        amount:      form.manual_amount ? parseFloat(form.manual_amount) : total,
      })
      setShowAdd(false)
      setForm(f => ({ ...f, title: "", quantity: "", client_name: "", notes: "", manual_amount: "" }))
    })
  }

  const canApprove = currentUserRole === "ADMIN" || currentUserRole === "MEMBER"

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={() => setShowAdd(true)}
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 18px", borderRadius: 12, background: "#DE1A1A", color: "#FFF", fontSize: 13, fontWeight: 700, border: "none", cursor: "pointer" }}>
          <Plus size={14} /> Add Work Entry
        </button>
      </div>

      {/* Add Modal */}
      {showAdd && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ background: "#FFF", borderRadius: 20, padding: 24, width: "100%", maxWidth: 480, maxHeight: "90vh", overflowY: "auto" }}>
            <div className="flex items-center justify-between mb-5">
              <h2 style={{ fontSize: 16, fontWeight: 800, color: "#111827", margin: 0 }}>Add Work Entry</h2>
              <button onClick={() => setShowAdd(false)}><X size={18} style={{ color: "#6B7280" }} /></button>
            </div>
            <div className="space-y-3">
              <div><Label text="Date" /><input type="date" max="2099-12-31" value={form.date} onChange={e => setForm(p => ({ ...p, date: clampDate(e.target.value) }))} style={inputStyle} /></div>
              <div>
                <Label text="Client Name" />
                <ClientSelector
                  label=""
                  value={form.client_name}
                  onValueChange={v => setForm(p => ({ ...p, client_name: v }))}
                  clientOptions={fullActiveClientNames}
                  pastClientOptions={fullPastClientNames}
                  fieldStyle={inputStyle} />
              </div>
              <div><Label text="Work Title" /><input type="text" placeholder="e.g. Product Reel Edit" value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} style={inputStyle} /></div>
              <div><Label text={qtyLabel} /><input type="number" min="1" placeholder="e.g. 10" value={form.quantity} onChange={e => setForm(p => ({ ...p, quantity: e.target.value }))} style={inputStyle} /></div>
              <div><Label text={rateLabel} /><input type="number" min="0" step="0.01" value={form.rate} onChange={e => setForm(p => ({ ...p, rate: e.target.value }))} style={inputStyle} /></div>
              {total > 0 && (
                <div style={{ padding: "12px 16px", borderRadius: 10, background: "rgba(22,163,74,0.06)", border: "1px solid rgba(22,163,74,0.2)" }}>
                  <p style={{ fontSize: 16, fontWeight: 800, color: "#16A34A", margin: 0 }}>Total: {fmt(total)}</p>
                </div>
              )}
              <div>
                <Label text="Amount (₹)" />
                <input type="number" min="0" step="0.01"
                  placeholder={total > 0 ? String(total) : "Enter amount manually"}
                  value={form.manual_amount}
                  onChange={e => setForm(p => ({ ...p, manual_amount: e.target.value }))}
                  style={inputStyle} />
                {total > 0 && !form.manual_amount && (
                  <p style={{ fontSize: 11, color: "#6B7280", marginTop: 4 }}>Auto-calculated: ₹{total}. Override above if different.</p>
                )}
              </div>
              <div><Label text="Notes" /><textarea rows={2} placeholder="Optional notes..." value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} style={{ ...inputStyle, resize: "vertical" }} /></div>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => setShowAdd(false)} style={{ flex: 1, padding: 11, borderRadius: 10, border: "1px solid #E5E7EB", background: "#FFF", fontSize: 13, fontWeight: 700, color: "#6B7280", cursor: "pointer" }}>Cancel</button>
              <button onClick={handleAdd} disabled={isPending || !form.title || (total <= 0 && !form.manual_amount)} style={{ flex: 2, padding: 11, borderRadius: 10, background: "#DE1A1A", color: "#FFF", fontSize: 13, fontWeight: 700, border: "none", cursor: "pointer", opacity: isPending ? 0.6 : 1 }}>
                {isPending ? "Saving..." : "Add Entry"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {rejectId && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ background: "#FFF", borderRadius: 20, padding: 24, width: "100%", maxWidth: 400 }}>
            <h2 style={{ fontSize: 16, fontWeight: 800, color: "#111827", marginBottom: 16 }}>Reject Entry</h2>
            <textarea placeholder="Reason for rejection..." value={rejectReason} onChange={e => setRejectReason(e.target.value)} rows={3}
              style={{ ...inputStyle, resize: "vertical" }} />
            <div className="flex gap-2 mt-4">
              <button onClick={() => { setRejectId(null); setRejectReason("") }} style={{ flex: 1, padding: 10, borderRadius: 10, border: "1px solid #E5E7EB", background: "#FFF", fontSize: 13, fontWeight: 700, color: "#6B7280", cursor: "pointer" }}>Cancel</button>
              <button onClick={() => startTransition(async () => { await rejectWorkEntry(rejectId, rejectReason); setRejectId(null); setRejectReason("") })}
                disabled={isPending || !rejectReason.trim()}
                style={{ flex: 2, padding: 10, borderRadius: 10, background: "#DE1A1A", color: "#FFF", fontSize: 13, fontWeight: 700, border: "none", cursor: "pointer", opacity: isPending ? 0.6 : 1 }}>
                Confirm Reject
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Entries */}
      {workEntries.length === 0 ? (
        <div style={{ ...CARD, padding: 40, textAlign: "center" }}>
          <p style={{ color: "#9CA3AF", fontSize: 14 }}>No work entries yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {workEntries.map(e => (
            <div key={e.id} style={{ ...CARD, padding: 16 }}>
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 14, fontWeight: 700, color: "#111827", margin: 0 }}>{e.title}</p>
                  <p style={{ fontSize: 12, color: "#6B7280", margin: "2px 0 0" }}>
                    {e.client_name && `${e.client_name} · `}{fmtDate(e.date)}
                  </p>
                  {e.notes && <p style={{ fontSize: 11, color: "#9CA3AF", margin: "4px 0 0" }}>{e.notes}</p>}
                  {e.approval_status === "rejected" && e.rejected_reason && (
                    <p style={{ fontSize: 11, color: "#DE1A1A", margin: "4px 0 0" }}>Reason: {e.rejected_reason}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-wrap flex-shrink-0">
                  <span style={{ fontSize: 16, fontWeight: 800, color: "#111827" }}>{fmt(e.amount)}</span>
                  <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 6, background: APPROVAL_BG[e.approval_status] ?? "rgba(107,114,128,0.08)", color: APPROVAL_COLOR[e.approval_status] ?? "#6B7280" }}>
                    {APPROVAL_LABEL[e.approval_status] ?? e.approval_status}
                  </span>
                  {canApprove && e.approval_status === "pending" && (
                    <>
                      <button onClick={() => startTransition(async () => { await approveWorkEntry(e.id) })}
                        style={{ padding: "4px 10px", borderRadius: 6, background: "rgba(22,163,74,0.08)", border: "1px solid rgba(22,163,74,0.3)", color: "#16A34A", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                        Approve
                      </button>
                      <button onClick={() => setRejectId(e.id)}
                        style={{ padding: "4px 10px", borderRadius: 6, background: "rgba(222,26,26,0.06)", border: "1px solid rgba(222,26,26,0.2)", color: "#DE1A1A", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                        Reject
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Tab 3: Payments ──────────────────────────────────────────────────────────

const METHOD_LABEL: Record<string, string> = {
  upi: "UPI", cash: "Cash", bank_transfer: "Bank Transfer",
}

function PaymentsTab({ freelancer, payments, stats, currentUserRole }: {
  freelancer: FreelancerRecord; payments: PaymentRecord[]
  stats: Stats; currentUserRole: string
}) {
  const [showAdd, setShowAdd]        = useState(false)
  const [isPending, startTransition] = useTransition()
  const [form, setForm] = useState({
    amount: "", payment_method: "upi", reference_number: "", notes: "",
    paid_date: new Date().toISOString().split("T")[0],
  })

  function handleAdd() {
    startTransition(async () => {
      const fd = new FormData()
      fd.append("freelancer_id",    freelancer.id)
      fd.append("amount",           form.amount)
      fd.append("payment_method",   form.payment_method)
      fd.append("reference_number", form.reference_number)
      fd.append("notes",            form.notes)
      fd.append("paid_date",        form.paid_date)
      await addFreelancerPayment(fd)
      setShowAdd(false)
      setForm(f => ({ ...f, amount: "", reference_number: "", notes: "" }))
    })
  }

  const canDelete = currentUserRole === "ADMIN"

  const balanceSummary = [
    { label: "Pending Balance",  value: fmt(stats.pendingBalance),  color: stats.pendingBalance > 0 ? "#DE1A1A" : "#16A34A" },
    { label: "Total Approved",   value: fmt(stats.totalEarned),     color: "#6366F1" },
    { label: "Total Paid",       value: fmt(stats.totalEarned - stats.pendingBalance), color: "#10B981" },
    { label: "This Month Paid",  value: fmt(stats.thisMonthPaid),   color: "#0EA5E9" },
  ]

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {balanceSummary.map(s => (
          <div key={s.label} style={{ ...CARD, padding: 16 }}>
            <p style={{ fontSize: 18, fontWeight: 900, color: s.color, margin: 0 }}>{s.value}</p>
            <p style={{ fontSize: 11, color: "#6B7280", margin: "4px 0 0" }}>{s.label}</p>
          </div>
        ))}
      </div>

      <div className="flex justify-end">
        <button onClick={() => setShowAdd(true)}
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 18px", borderRadius: 12, background: "#DE1A1A", color: "#FFF", fontSize: 13, fontWeight: 700, border: "none", cursor: "pointer" }}>
          <Plus size={14} /> Add Payment
        </button>
      </div>

      {showAdd && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ background: "#FFF", borderRadius: 20, padding: 24, width: "100%", maxWidth: 440 }}>
            <div className="flex items-center justify-between mb-5">
              <h2 style={{ fontSize: 16, fontWeight: 800, color: "#111827", margin: 0 }}>Add Payment</h2>
              <button onClick={() => setShowAdd(false)}><X size={18} style={{ color: "#6B7280" }} /></button>
            </div>
            <div className="space-y-3">
              <div><Label text="Date" /><input type="date" max="2099-12-31" value={form.paid_date} onChange={e => setForm(p => ({ ...p, paid_date: clampDate(e.target.value) }))} style={inputStyle} /></div>
              <div><Label text="Amount (₹)" /><input type="number" min="1" step="0.01" placeholder="e.g. 5000" value={form.amount} onChange={e => setForm(p => ({ ...p, amount: e.target.value }))} style={inputStyle} /></div>
              <div>
                <Label text="Payment Method" />
                <select value={form.payment_method} onChange={e => setForm(p => ({ ...p, payment_method: e.target.value }))} style={{ ...inputStyle, appearance: "none" }}>
                  <option value="upi">UPI</option>
                  <option value="cash">Cash</option>
                  <option value="bank_transfer">Bank Transfer</option>
                </select>
              </div>
              <div><Label text="Reference Number" /><input type="text" placeholder="UPI ref / transaction ID" value={form.reference_number} onChange={e => setForm(p => ({ ...p, reference_number: e.target.value }))} style={inputStyle} /></div>
              <div><Label text="Notes" /><textarea rows={2} placeholder="Optional" value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} style={{ ...inputStyle, resize: "vertical" }} /></div>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => setShowAdd(false)} style={{ flex: 1, padding: 11, borderRadius: 10, border: "1px solid #E5E7EB", background: "#FFF", fontSize: 13, fontWeight: 700, color: "#6B7280", cursor: "pointer" }}>Cancel</button>
              <button onClick={handleAdd} disabled={isPending || !form.amount} style={{ flex: 2, padding: 11, borderRadius: 10, background: "#DE1A1A", color: "#FFF", fontSize: 13, fontWeight: 700, border: "none", cursor: "pointer", opacity: isPending ? 0.6 : 1 }}>
                {isPending ? "Saving..." : "Add Payment"}
              </button>
            </div>
          </div>
        </div>
      )}

      {payments.length === 0 ? (
        <div style={{ ...CARD, padding: 40, textAlign: "center" }}>
          <p style={{ color: "#9CA3AF", fontSize: 14 }}>No payments recorded yet.</p>
        </div>
      ) : (
        <div style={CARD}>
          {payments.map((p, i) => (
            <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 20px", borderBottom: i < payments.length - 1 ? "1px solid #F3F4F6" : "none" }}>
              <div style={{ width: 38, height: 38, borderRadius: 10, background: "rgba(16,185,129,0.08)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <IndianRupee size={16} style={{ color: "#10B981" }} />
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 14, fontWeight: 700, color: "#111827", margin: 0 }}>
                  {fmt(p.amount)} <span style={{ fontSize: 11, fontWeight: 600, color: "#6B7280" }}>via {METHOD_LABEL[p.payment_method] ?? p.payment_method}</span>
                </p>
                <p style={{ fontSize: 11, color: "#9CA3AF", margin: "2px 0 0" }}>
                  {fmtDate(p.paid_date)}{p.reference_number ? ` · Ref: ${p.reference_number}` : ""}
                </p>
                {p.notes && <p style={{ fontSize: 11, color: "#9CA3AF", margin: "2px 0 0" }}>{p.notes}</p>}
              </div>
              {canDelete && (
                <button onClick={() => startTransition(async () => { await deleteFreelancerPayment(p.id, freelancer.id) })}
                  style={{ width: 28, height: 28, borderRadius: 8, background: "rgba(222,26,26,0.06)", border: "1px solid rgba(222,26,26,0.15)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                  <X size={12} style={{ color: "#DE1A1A" }} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Tab 4: Statements ────────────────────────────────────────────────────────

function StatementsTab({ freelancer }: { freelancer: FreelancerRecord }) {
  const now = new Date()
  const [year, setYear]   = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)

  const months = ["January","February","March","April","May","June","July","August","September","October","November","December"]

  return (
    <div style={{ ...CARD, padding: 24, maxWidth: 400 }}>
      <h3 style={{ fontSize: 14, fontWeight: 800, color: "#111827", marginBottom: 20 }}>Generate Monthly Statement</h3>
      <div className="space-y-3">
        <div>
          <Label text="Month" />
          <div style={{ position: "relative" }}>
            <select value={month} onChange={e => setMonth(parseInt(e.target.value))} style={{ ...inputStyle, appearance: "none", paddingRight: 32 }}>
              {months.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
            </select>
            <ChevronDown size={14} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: "#9CA3AF", pointerEvents: "none" }} />
          </div>
        </div>
        <div>
          <Label text="Year" />
          <div style={{ position: "relative" }}>
            <select value={year} onChange={e => setYear(parseInt(e.target.value))} style={{ ...inputStyle, appearance: "none", paddingRight: 32 }}>
              {[now.getFullYear(), now.getFullYear() - 1, now.getFullYear() - 2].map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
            <ChevronDown size={14} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: "#9CA3AF", pointerEvents: "none" }} />
          </div>
        </div>
        <button
          onClick={() => window.open(`/admin/freelancers/${freelancer.id}/statement?year=${year}&month=${month}`, "_blank")}
          style={{ width: "100%", marginTop: 8, padding: 12, borderRadius: 12, background: "#DE1A1A", color: "#FFF", fontSize: 13, fontWeight: 700, border: "none", cursor: "pointer" }}>
          View Statement
        </button>
        <p style={{ fontSize: 11, color: "#9CA3AF", textAlign: "center" }}>
          Opens in new tab · use browser Print to save as PDF
        </p>
      </div>
    </div>
  )
}

// ── Tab 5: Activity ──────────────────────────────────────────────────────────

function ActivityTab({ activityLogs }: { activityLogs: ActivityRecord[] }) {
  if (activityLogs.length === 0) {
    return (
      <div style={{ ...CARD, padding: 40, textAlign: "center" }}>
        <p style={{ color: "#9CA3AF", fontSize: 14 }}>No activity yet.</p>
      </div>
    )
  }

  return (
    <div style={CARD}>
      {activityLogs.map((log, i) => (
        <div key={log.id} style={{ display: "flex", gap: 12, padding: "14px 20px", borderBottom: i < activityLogs.length - 1 ? "1px solid #F3F4F6" : "none" }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#DE1A1A", marginTop: 5, flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: "#111827", margin: 0 }}>{log.action}</p>
            {log.remarks && <p style={{ fontSize: 11, color: "#6B7280", margin: "2px 0 0" }}>{log.remarks}</p>}
            <p style={{ fontSize: 11, color: "#9CA3AF", margin: "4px 0 0" }}>
              {log.actor_name ?? "System"} · {fmtDateTime(log.created_at)}
            </p>
          </div>
        </div>
      ))}
    </div>
  )
}
