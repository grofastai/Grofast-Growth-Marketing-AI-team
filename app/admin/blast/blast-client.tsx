"use client"

import { useState, useTransition } from "react"
import { sendWhatsAppBlast } from "@/lib/actions/blast"
import type { BlastResult } from "@/lib/actions/blast"
import { MessageSquare, Send, CheckCircle2, XCircle, Phone, Users, RotateCcw } from "lucide-react"
import { useToast } from "@/components/ui/useToast"

type Member = { id: string; name: string; employee_id: string; phone: string | null }

export default function BlastClient({ members }: { members: Member[] }) {
  const { toastEl, showToast } = useToast()
  const [message, setMessage]       = useState("")
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [selectAll, setSelectAll]   = useState(false)
  const [results, setResults]       = useState<BlastResult[] | null>(null)
  const [isPending, startTransition] = useTransition()

  function toggleAll(checked: boolean) {
    setSelectAll(checked)
    setSelectedIds(checked ? new Set(members.map(m => m.id)) : new Set())
  }

  function toggleMember(id: string) {
    const next = new Set(selectedIds)
    next.has(id) ? next.delete(id) : next.add(id)
    setSelectedIds(next)
    setSelectAll(next.size === members.length)
  }

  function send() {
    setResults(null)
    startTransition(async () => {
      const ids = selectAll ? members.map(m => m.id) : Array.from(selectedIds)
      const res = await sendWhatsAppBlast({ memberIds: ids, message })
      if (!res.success) { showToast(res.error ?? "Failed to send"); return }
      setResults(res.results)
    })
  }

  const recipientCount = selectAll ? members.length : selectedIds.size
  const canSend = !isPending && message.trim().length > 0 && recipientCount > 0

  // ── Results view ──────────────────────────────────────────
  if (results) {
    const sentCount    = results.filter(r => r.status === "sent").length
    const failedCount  = results.filter(r => r.status === "failed").length
    const skippedCount = results.filter(r => r.status === "no_phone").length

    return (
      <div className="p-4 md:p-6 xl:p-8 max-w-[800px]">
        <div className="mb-7">
          <h1 className="gradient-heading text-[30px] font-black leading-tight"
            style={{ fontFamily: "var(--font-jakarta)" }}>Blast Results</h1>
        </div>

        {/* Summary */}
        <div className="flex flex-wrap gap-3 mb-5">
          {sentCount > 0 && (
            <div className="flex items-center gap-2 px-4 py-2 rounded-lg"
              style={{ background: "rgba(22,163,74,0.06)", border: "1px solid rgba(22,163,74,0.15)" }}>
              <CheckCircle2 size={14} style={{ color: "#16A34A" }} />
              <span className="text-[13px] font-bold" style={{ color: "#16A34A" }}>{sentCount} sent</span>
            </div>
          )}
          {failedCount > 0 && (
            <div className="flex items-center gap-2 px-4 py-2 rounded-lg"
              style={{ background: "rgba(222,26,26,0.06)", border: "1px solid rgba(222,26,26,0.15)" }}>
              <XCircle size={14} style={{ color: "#de1a1a" }} />
              <span className="text-[13px] font-bold" style={{ color: "#de1a1a" }}>{failedCount} failed</span>
            </div>
          )}
          {skippedCount > 0 && (
            <div className="flex items-center gap-2 px-4 py-2 rounded-lg"
              style={{ background: "rgba(0,0,0,0.03)", border: "1px solid #E5E7EB" }}>
              <Phone size={14} style={{ color: "#5C3D1F" }} />
              <span className="text-[13px] font-medium" style={{ color: "#5C3D1F" }}>
                {skippedCount} skipped (no phone)
              </span>
            </div>
          )}
        </div>

        {/* Per-member results */}
        <div className="space-y-2 mb-6">
          {results.map(r => (
            <div key={r.userId} className="flex items-center gap-3 px-4 py-3 rounded-xl"
              style={{ background: "#FFFFFF", border: "1px solid #E5E7EB" }}>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold" style={{ color: "#111111" }}>{r.name}</p>
                <p className="text-[11px] mt-0.5" style={{ color: "#5C3D1F" }}>
                  {r.phone ?? "No phone number"}
                </p>
                {r.error && (
                  <p className="text-[11px] mt-0.5 font-medium" style={{ color: "#de1a1a" }}>{r.error}</p>
                )}
              </div>
              {r.status === "sent"     && <CheckCircle2 size={16} style={{ color: "#16A34A", flexShrink: 0 }} />}
              {r.status === "failed"   && <XCircle      size={16} style={{ color: "#de1a1a", flexShrink: 0 }} />}
              {r.status === "no_phone" && <Phone        size={16} style={{ color: "#5C3D1F", flexShrink: 0 }} />}
            </div>
          ))}
        </div>

        <button onClick={() => { setResults(null); setMessage("") }}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-[13px] font-bold"
          style={{ background: "#de1a1a", color: "#FFFFFF" }}>
          <RotateCcw size={13} />
          Send Another Blast
        </button>
      </div>
    )
  }

  // ── Compose view ──────────────────────────────────────────
  return (
    <div className="p-4 md:p-6 xl:p-8 max-w-[1100px]">
      {toastEl}
      {/* Header */}
      <div className="mb-7">
        <h1 className="gradient-heading text-[30px] font-black leading-tight"
          style={{ fontFamily: "var(--font-jakarta)" }}>
          WhatsApp Blast
        </h1>
        <p className="text-sm mt-1" style={{ color: "#5C3D1F" }}>
          Send a WhatsApp message to your team instantly
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-5">
        {/* Left column — message + send */}
        <div className="space-y-5">
          {/* Message composer */}
          <div className="rounded-xl p-5" style={{ background: "#FFFFFF", border: "1px solid #E5E7EB" }}>
            <div className="flex items-center gap-2 mb-3">
              <MessageSquare size={13} style={{ color: "#25D366" }} />
              <p className="text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: "#5C3D1F" }}>Message</p>
            </div>
            <textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder="Type your team message here…"
              maxLength={1000}
              rows={5}
              className="w-full resize-none rounded-lg px-3 py-2.5 text-[13px] outline-none leading-relaxed"
              style={{ background: "#F9FAFB", border: "1px solid #E5E7EB", color: "#111111" }}
            />
            <p className="text-[11px] mt-1.5 text-right tabular-nums" style={{ color: "#5C3D1F" }}>
              {message.length} / 1000
            </p>
          </div>

          <button onClick={send} disabled={!canSend}
            className="flex items-center gap-2 px-6 py-3 rounded-xl text-[14px] font-bold transition-all"
            style={{
              background: canSend ? "#25D366" : "#E5E7EB",
              color:      canSend ? "#FFFFFF" : "#5C3D1F",
              cursor:     canSend ? "pointer" : "not-allowed",
            }}>
            <Send size={14} />
            {isPending
              ? "Sending…"
              : `Send to ${recipientCount} member${recipientCount !== 1 ? "s" : ""}`}
          </button>
        </div>

        {/* Right column — recipients */}
        <div className="rounded-xl p-5" style={{ background: "#FFFFFF", border: "1px solid #E5E7EB" }}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Users size={13} style={{ color: "#de1a1a" }} />
              <p className="text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: "#5C3D1F" }}>
                Recipients
              </p>
              {recipientCount > 0 && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                  style={{ background: "rgba(222,26,26,0.08)", color: "#de1a1a" }}>
                  {recipientCount} selected
                </span>
              )}
            </div>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input type="checkbox" checked={selectAll} onChange={e => toggleAll(e.target.checked)}
                className="w-4 h-4 accent-red-600" />
              <span className="text-[12px] font-semibold" style={{ color: "#111111" }}>Select All</span>
            </label>
          </div>

          <div className="space-y-2">
            {members.map(m => {
              const isSelected = selectAll || selectedIds.has(m.id)
              return (
                <label key={m.id}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer select-none transition-all"
                  style={{
                    background: isSelected ? "rgba(222,26,26,0.04)" : "#F9FAFB",
                    border: `1px solid ${isSelected ? "rgba(222,26,26,0.2)" : "#E5E7EB"}`,
                  }}>
                  <input type="checkbox" checked={isSelected} onChange={() => toggleMember(m.id)}
                    className="w-4 h-4 accent-red-600 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold truncate" style={{ color: "#111111" }}>{m.name}</p>
                    <p className="text-[11px]" style={{ color: m.phone ? "#5C3D1F" : "#5C3D1F" }}>
                      {m.phone ?? "No phone number"}
                    </p>
                  </div>
                  {!m.phone && <Phone size={11} style={{ color: "#5C3D1F", flexShrink: 0 }} />}
                </label>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
