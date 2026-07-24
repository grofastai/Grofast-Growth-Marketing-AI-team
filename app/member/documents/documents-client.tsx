"use client"

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { FileText, Download, FolderOpen, RefreshCw, Trash2, Loader2 } from "lucide-react"
import { useConfirm } from "@/components/ui/ConfirmDialog"
import { deleteKYCDocument, updateKYC, type KYCDocField } from "@/lib/actions/profile"

export type MemberDoc = {
  id: string
  name: string
  file_url: string
  file_type: string | null
  file_size: number | null
  doc_type: string
  created_at: string
  kycField?: KYCDocField
}

const DOC_TYPE_COLOR: Record<string, { color: string; bg: string }> = {
  "Offer Letter":  { color: "#de1a1a", bg: "rgba(222,26,26,0.08)"  },
  "Contract":      { color: "#6366F1", bg: "rgba(99,102,241,0.08)" },
  "ID Proof":      { color: "#F59E0B", bg: "rgba(245,158,11,0.08)" },
  "Certificate":   { color: "#16A34A", bg: "rgba(22,163,74,0.08)"  },
  "Payslip":       { color: "#0EA5E9", bg: "rgba(14,165,233,0.08)" },
  "Other":         { color: "#6B7280", bg: "rgba(0,0,0,0.04)"      },
}

function formatSize(bytes: number | null) {
  if (!bytes) return ""
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1048576).toFixed(1)} MB`
}

function formatDate(s: string) {
  return new Date(s).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
}

export default function MemberDocumentsClient({ docs }: { docs: MemberDoc[] }) {
  const router = useRouter()
  const confirm = useConfirm()
  const [busyId, setBusyId] = useState<string | null>(null)
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({})

  async function handleReplace(doc: MemberDoc, file: File) {
    if (!doc.kycField) return
    setBusyId(doc.id)
    try {
      const fd = new FormData(); fd.append("file", file); fd.append("folder", "kyc")
      const res = await fetch("/api/upload-photo", { method: "POST", body: fd })
      const json = await res.json()
      if (res.ok && json.url) await updateKYC({ [doc.kycField]: json.url })
      router.refresh()
    } finally { setBusyId(null) }
  }

  async function handleDelete(doc: MemberDoc) {
    if (!doc.kycField) return
    if (!(await confirm(`Delete ${doc.name}?`))) return
    setBusyId(doc.id)
    try {
      await deleteKYCDocument(doc.kycField)
      router.refresh()
    } finally { setBusyId(null) }
  }

  if (docs.length === 0) {
    return (
      <div className="flex flex-col items-center py-24 rounded-2xl"
        style={{ background: "rgba(0,0,0,0.02)", border: "1px solid #E5E7EB" }}>
        <FolderOpen size={36} style={{ color: "#E5E7EB" }} className="mb-3" />
        <p className="text-[14px] font-semibold" style={{ color: "#6B7280" }}>No documents yet</p>
        <p className="text-[12px] mt-1" style={{ color: "#D1D5DB" }}>
          Your admin will upload documents here when available.
        </p>
      </div>
    )
  }

  const grouped: Record<string, MemberDoc[]> = {}
  for (const d of docs) {
    const key = d.doc_type || "Other"
    if (!grouped[key]) grouped[key] = []
    grouped[key].push(d)
  }

  return (
    <div className="space-y-6">
      {Object.entries(grouped).map(([type, items]) => {
        const style = DOC_TYPE_COLOR[type] ?? DOC_TYPE_COLOR["Other"]
        return (
          <div key={type}>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-[10px] font-bold uppercase tracking-[0.18em] px-2.5 py-1 rounded-full"
                style={{ background: style.bg, color: style.color }}>
                {type}
              </span>
              <span className="text-[11px]" style={{ color: "#D1D5DB" }}>{items.length}</span>
            </div>
            <div className="space-y-2">
              {items.map(doc => (
                <div key={doc.id} className="flex items-center gap-3 rounded-xl px-4 py-3.5"
                  style={{ background: "#FFFFFF", border: "1px solid #E5E7EB" }}>
                  <a href={doc.file_url} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-4 flex-1 min-w-0" style={{ textDecoration: "none" }}>
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ background: style.bg }}>
                      <FileText size={16} style={{ color: style.color }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-semibold truncate" style={{ color: "#111111" }}>{doc.name}</p>
                      <p className="text-[11px] mt-0.5" style={{ color: "#6B7280" }}>
                        {formatDate(doc.created_at)}{doc.file_size ? ` · ${formatSize(doc.file_size)}` : ""}
                      </p>
                    </div>
                  </a>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <a href={doc.file_url} download target="_blank" rel="noopener noreferrer"
                      className="w-8 h-8 rounded-lg flex items-center justify-center"
                      style={{ background: "rgba(0,0,0,0.04)" }} title="Download">
                      <Download size={13} style={{ color: "#6B7280" }} />
                    </a>
                    {doc.kycField && (
                      <>
                        <button type="button" disabled={busyId === doc.id} title="Replace"
                          onClick={() => fileRefs.current[doc.id]?.click()}
                          className="w-8 h-8 rounded-lg flex items-center justify-center"
                          style={{ background: "rgba(245,158,11,0.08)", border: "none", cursor: busyId === doc.id ? "default" : "pointer", opacity: busyId === doc.id ? 0.6 : 1 }}>
                          {busyId === doc.id
                            ? <Loader2 size={13} className="animate-spin" style={{ color: "#F59E0B" }} />
                            : <RefreshCw size={13} style={{ color: "#F59E0B" }} />}
                        </button>
                        <button type="button" disabled={busyId === doc.id} title="Delete"
                          onClick={() => handleDelete(doc)}
                          className="w-8 h-8 rounded-lg flex items-center justify-center"
                          style={{ background: "rgba(239,68,68,0.08)", border: "none", cursor: "pointer" }}>
                          <Trash2 size={13} style={{ color: "#EF4444" }} />
                        </button>
                        <input ref={el => { fileRefs.current[doc.id] = el }} type="file" accept="image/*,application/pdf"
                          style={{ display: "none" }}
                          onChange={e => { const f = e.target.files?.[0]; if (f) handleReplace(doc, f); e.target.value = "" }} />
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
