"use client"

import { useState, useTransition } from "react"
import { CheckCircle2, XCircle, AlertTriangle, Loader2, Send, RefreshCw, Play } from "lucide-react"
import { sendTestWhatsApp, triggerManualReminder } from "@/lib/actions/whatsapp-diagnostic"
import type { WhatsAppDiagnosticResult } from "@/lib/actions/whatsapp-diagnostic"

function StatusBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 8,
      background: ok ? "rgba(34,197,94,0.08)" : "rgba(239,68,68,0.08)",
      border: `1px solid ${ok ? "rgba(34,197,94,0.25)" : "rgba(239,68,68,0.25)"}` }}>
      {ok
        ? <CheckCircle2 size={14} style={{ color: "#16A34A", flexShrink: 0 }} />
        : <XCircle size={14} style={{ color: "#EF4444", flexShrink: 0 }} />
      }
      <span style={{ fontSize: 12, fontWeight: 700, color: ok ? "#16A34A" : "#EF4444" }}>{label}</span>
    </div>
  )
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #F3F4F6" }}>
      <span style={{ fontSize: 12, color: "#000000" }}>{label}</span>
      <span style={{ fontSize: 12, fontWeight: 700, color: "#111827", fontFamily: mono ? "monospace" : "inherit" }}>{value}</span>
    </div>
  )
}

export default function WhatsAppDiagnosticClient({
  initialDiagnostic,
}: {
  initialDiagnostic: WhatsAppDiagnosticResult
}) {
  const d = initialDiagnostic
  const [isPending, startTransition] = useTransition()
  const [testPhone, setTestPhone] = useState("")
  const [testResult, setTestResult] = useState<{ ok: boolean; detail: string } | null>(null)
  const [triggerResult, setTriggerResult] = useState<{ type: string; ok: boolean; detail: string } | null>(null)

  function handleTest() {
    if (!testPhone.trim()) return
    startTransition(async () => {
      const res = await sendTestWhatsApp(testPhone.trim())
      setTestResult(res)
    })
  }

  function handleTrigger(type: "morning" | "evening") {
    startTransition(async () => {
      const res = await triggerManualReminder(type)
      setTriggerResult({ type, ...res })
    })
  }

  const allEnvOk = d.envVars.tokenSet && d.envVars.phoneIdSet
  const overallOk = allEnvOk && d.metaApi.ok

  return (
    <div style={{ padding: "24px", maxWidth: 720, margin: "0 auto" }}>

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 900, color: "#111827", margin: "0 0 4px", fontFamily: "var(--font-jakarta)" }}>
          WhatsApp Diagnostics
        </h1>
        <p style={{ fontSize: 13, color: "#000000", margin: 0 }}>
          Debug why reminders aren't sending. Check env vars, Meta API token, and member phone numbers.
        </p>
      </div>

      {/* Overall status banner */}
      <div style={{ borderRadius: 14, padding: "14px 18px", marginBottom: 20, display: "flex", alignItems: "center", gap: 12,
        background: overallOk ? "rgba(34,197,94,0.06)" : "rgba(239,68,68,0.06)",
        border: `1.5px solid ${overallOk ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)"}` }}>
        {overallOk
          ? <CheckCircle2 size={20} style={{ color: "#16A34A", flexShrink: 0 }} />
          : <XCircle size={20} style={{ color: "#EF4444", flexShrink: 0 }} />
        }
        <div>
          <p style={{ fontSize: 14, fontWeight: 800, margin: 0, color: overallOk ? "#15803D" : "#DC2626" }}>
            {overallOk ? "WhatsApp is configured correctly" : "WhatsApp is NOT working — see issues below"}
          </p>
          {!overallOk && d.metaApi.error && (
            <p style={{ fontSize: 12, color: "#DC2626", margin: "2px 0 0", fontFamily: "monospace" }}>
              {d.metaApi.error}
            </p>
          )}
        </div>
      </div>

      {/* Env vars */}
      <div style={{ background: "#FFFFFF", borderRadius: 16, border: "1px solid #EBEDF2", padding: "16px 20px", marginBottom: 16, boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>
        <p style={{ fontSize: 13, fontWeight: 800, color: "#111827", margin: "0 0 12px" }}>Environment Variables</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <StatusBadge ok={d.envVars.tokenSet} label="META_WHATSAPP_TOKEN" />
          <StatusBadge ok={d.envVars.phoneIdSet} label="META_PHONE_NUMBER_ID" />
          <StatusBadge ok={d.envVars.cronSecretSet} label="CRON_SECRET" />
          <StatusBadge ok={d.envVars.cronCompanyIdSet} label="CRON_COMPANY_ID" />
          <StatusBadge ok={d.envVars.internalSecretSet} label="INTERNAL_WEBHOOK_SECRET" />
        </div>
        {!d.envVars.tokenSet && (
          <p style={{ fontSize: 11, color: "#EF4444", marginTop: 10, background: "rgba(239,68,68,0.06)", padding: "8px 12px", borderRadius: 8, margin: "10px 0 0" }}>
            Fix: Go to Vercel Dashboard → Project Settings → Environment Variables and add META_WHATSAPP_TOKEN and META_PHONE_NUMBER_ID
          </p>
        )}
      </div>

      {/* Meta API status */}
      <div style={{ background: "#FFFFFF", borderRadius: 16, border: "1px solid #EBEDF2", padding: "16px 20px", marginBottom: 16, boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>
        <p style={{ fontSize: 13, fontWeight: 800, color: "#111827", margin: "0 0 12px" }}>Meta API Connection</p>
        {d.metaApi.ok ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderRadius: 10, background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.25)" }}>
            <CheckCircle2 size={16} style={{ color: "#16A34A" }} />
            <div>
              <p style={{ fontSize: 12, fontWeight: 700, color: "#15803D", margin: 0 }}>Token valid — phone verified</p>
              <p style={{ fontSize: 11, color: "#16A34A", margin: "2px 0 0" }}>{d.metaApi.displayPhone}</p>
            </div>
          </div>
        ) : (
          <div style={{ padding: "10px 14px", borderRadius: 10, background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.2)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <XCircle size={16} style={{ color: "#EF4444" }} />
              <p style={{ fontSize: 12, fontWeight: 700, color: "#DC2626", margin: 0 }}>
                Meta API call failed {d.metaApi.httpStatus ? `(HTTP ${d.metaApi.httpStatus})` : ""}
              </p>
            </div>
            <p style={{ fontSize: 11, color: "#7F1D1D", margin: 0, fontFamily: "monospace", wordBreak: "break-all" }}>
              {d.metaApi.error}
            </p>
            <div style={{ marginTop: 10, fontSize: 11, color: "#000000" }}>
              <strong>Common fixes:</strong>
              <ul style={{ margin: "4px 0 0 16px", padding: 0 }}>
                <li>Token expired → generate a new permanent token in Meta Business Manager</li>
                <li>Wrong token type → use a System User token, not a temporary user token</li>
                <li>Wrong Phone Number ID → copy it from Meta → WhatsApp → Getting Started</li>
              </ul>
            </div>
          </div>
        )}
      </div>

      {/* Templates */}
      <div style={{ background: "#FFFFFF", borderRadius: 16, border: "1px solid #EBEDF2", padding: "16px 20px", marginBottom: 16, boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>
        <p style={{ fontSize: 13, fontWeight: 800, color: "#111827", margin: "0 0 4px" }}>Template Names</p>
        <p style={{ fontSize: 11, color: "#000000", margin: "0 0 12px" }}>
          These must exactly match approved templates in Meta Business Manager → WhatsApp → Message Templates. Language code: <code>{d.templates.lang}</code>
        </p>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <Row label="Morning reminder (9:30 AM IST)" value={d.templates.dailyReminder} mono />
          <Row label="Evening missed alert (9 PM IST)" value={d.templates.missedUpdate} mono />
          <Row label="Admin summary" value={d.templates.adminSummary} mono />
        </div>
        <div style={{ marginTop: 10, padding: "8px 12px", borderRadius: 8, background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.25)" }}>
          <AlertTriangle size={12} style={{ color: "#D97706", display: "inline", marginRight: 6 }} />
          <span style={{ fontSize: 11, color: "#92400E" }}>
            If templates are not approved or the name/language doesn't match exactly, Meta returns error code 132001.
          </span>
        </div>
      </div>

      {/* Members */}
      <div style={{ background: "#FFFFFF", borderRadius: 16, border: "1px solid #EBEDF2", padding: "16px 20px", marginBottom: 16, boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>
        <p style={{ fontSize: 13, fontWeight: 800, color: "#111827", margin: "0 0 12px" }}>Member Phone Numbers</p>
        <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
          <div style={{ flex: 1, padding: "10px 14px", borderRadius: 10, background: "rgba(99,102,241,0.06)", border: "1px solid rgba(99,102,241,0.2)", textAlign: "center" }}>
            <p style={{ fontSize: 20, fontWeight: 900, color: "#6366F1", margin: 0 }}>{d.members.total}</p>
            <p style={{ fontSize: 10, color: "#000000", margin: 0 }}>Total active</p>
          </div>
          <div style={{ flex: 1, padding: "10px 14px", borderRadius: 10, background: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.2)", textAlign: "center" }}>
            <p style={{ fontSize: 20, fontWeight: 900, color: "#16A34A", margin: 0 }}>{d.members.withPhone}</p>
            <p style={{ fontSize: 10, color: "#000000", margin: 0 }}>Have phone</p>
          </div>
          <div style={{ flex: 1, padding: "10px 14px", borderRadius: 10, background: d.members.withoutPhone > 0 ? "rgba(239,68,68,0.06)" : "rgba(34,197,94,0.06)", border: `1px solid ${d.members.withoutPhone > 0 ? "rgba(239,68,68,0.2)" : "rgba(34,197,94,0.2)"}`, textAlign: "center" }}>
            <p style={{ fontSize: 20, fontWeight: 900, color: d.members.withoutPhone > 0 ? "#EF4444" : "#16A34A", margin: 0 }}>{d.members.withoutPhone}</p>
            <p style={{ fontSize: 10, color: "#000000", margin: 0 }}>No phone</p>
          </div>
        </div>
        {d.members.sample.length > 0 && (
          <div>
            <p style={{ fontSize: 10, fontWeight: 700, color: "#000000", textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 8px" }}>Sample (first 5)</p>
            {d.members.sample.map((m, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #F3F4F6", fontSize: 12 }}>
                <span style={{ color: "#000000", fontWeight: 600 }}>{m.name}</span>
                <span style={{ color: m.phone ? "#000000" : "#EF4444", fontFamily: "monospace" }}>
                  {m.phone ? `${m.phone} → ${m.formatted}` : "⚠️ no phone"}
                </span>
              </div>
            ))}
          </div>
        )}
        {d.members.withoutPhone > 0 && (
          <p style={{ fontSize: 11, color: "#DC2626", marginTop: 10 }}>
            {d.members.withoutPhone} member(s) have no phone number — they won't receive any WhatsApp reminders. Add their phone numbers in Team → Edit member.
          </p>
        )}
      </div>

      {/* Cron schedule */}
      <div style={{ background: "#FFFFFF", borderRadius: 16, border: "1px solid #EBEDF2", padding: "16px 20px", marginBottom: 16, boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>
        <p style={{ fontSize: 13, fontWeight: 800, color: "#111827", margin: "0 0 12px" }}>Cron Schedule</p>
        <Row label="Morning reminder" value={d.cronSchedule.morningReminder} />
        <Row label="Evening missed alert" value={d.cronSchedule.eveningAlert} />
      </div>

      {/* Manual trigger */}
      <div style={{ background: "#FFFFFF", borderRadius: 16, border: "1px solid #EBEDF2", padding: "16px 20px", marginBottom: 16, boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>
        <p style={{ fontSize: 13, fontWeight: 800, color: "#111827", margin: "0 0 4px" }}>Manually Trigger Reminders</p>
        <p style={{ fontSize: 11, color: "#000000", margin: "0 0 14px" }}>Send to all members who haven't submitted today, right now — don't wait for the cron.</p>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={() => handleTrigger("morning")} disabled={isPending}
            style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "10px 0", borderRadius: 10, border: "1.5px solid #6366F1", background: "rgba(99,102,241,0.07)", color: "#6366F1", fontSize: 12, fontWeight: 700, cursor: isPending ? "not-allowed" : "pointer", opacity: isPending ? 0.6 : 1 }}>
            <Play size={13} /> Morning Reminder
          </button>
          <button onClick={() => handleTrigger("evening")} disabled={isPending}
            style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "10px 0", borderRadius: 10, border: "1.5px solid #DE1A1A", background: "rgba(222,26,26,0.07)", color: "#DE1A1A", fontSize: 12, fontWeight: 700, cursor: isPending ? "not-allowed" : "pointer", opacity: isPending ? 0.6 : 1 }}>
            <Play size={13} /> Evening Alert
          </button>
        </div>
        {isPending && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, fontSize: 12, color: "#000000" }}>
            <Loader2 size={13} className="animate-spin" /> Sending…
          </div>
        )}
        {triggerResult && !isPending && (
          <div style={{ marginTop: 10, padding: "10px 14px", borderRadius: 10, background: triggerResult.ok ? "rgba(34,197,94,0.06)" : "rgba(239,68,68,0.06)", border: `1px solid ${triggerResult.ok ? "rgba(34,197,94,0.25)" : "rgba(239,68,68,0.25)"}` }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: triggerResult.ok ? "#15803D" : "#DC2626", margin: "0 0 2px" }}>
              {triggerResult.type === "morning" ? "Morning" : "Evening"} trigger: {triggerResult.ok ? "Success" : "Failed"}
            </p>
            <p style={{ fontSize: 11, color: "#000000", margin: 0, fontFamily: "monospace" }}>{triggerResult.detail}</p>
          </div>
        )}
      </div>

      {/* Send test message */}
      <div style={{ background: "#FFFFFF", borderRadius: 16, border: "1px solid #EBEDF2", padding: "16px 20px", marginBottom: 16, boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>
        <p style={{ fontSize: 13, fontWeight: 800, color: "#111827", margin: "0 0 4px" }}>Send Test Message</p>
        <p style={{ fontSize: 11, color: "#000000", margin: "0 0 12px" }}>
          Send a test using the <code>grofast_daily_reminder</code> template to any number. Enter as 10-digit Indian number or with country code.
        </p>
        <div style={{ display: "flex", gap: 10 }}>
          <input
            value={testPhone}
            onChange={e => setTestPhone(e.target.value)}
            placeholder="9876543210"
            style={{ flex: 1, fontSize: 13, padding: "9px 12px", borderRadius: 10, border: "1.5px solid #EBEDF2", outline: "none", background: "#F9FAFB" }}
          />
          <button onClick={handleTest} disabled={isPending || !testPhone.trim()}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 20px", borderRadius: 10, border: "none", background: "#DE1A1A", color: "#fff", fontSize: 12, fontWeight: 700, cursor: isPending || !testPhone.trim() ? "not-allowed" : "pointer", opacity: isPending || !testPhone.trim() ? 0.6 : 1 }}>
            {isPending ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
            Send Test
          </button>
        </div>
        {testResult && !isPending && (
          <div style={{ marginTop: 10, padding: "10px 14px", borderRadius: 10, background: testResult.ok ? "rgba(34,197,94,0.06)" : "rgba(239,68,68,0.06)", border: `1px solid ${testResult.ok ? "rgba(34,197,94,0.25)" : "rgba(239,68,68,0.25)"}` }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: testResult.ok ? "#15803D" : "#DC2626", margin: "0 0 2px" }}>
              {testResult.ok ? "Message sent!" : "Failed"}
            </p>
            <p style={{ fontSize: 11, color: "#000000", margin: 0, fontFamily: "monospace", wordBreak: "break-all" }}>{testResult.detail}</p>
          </div>
        )}
      </div>

    </div>
  )
}
