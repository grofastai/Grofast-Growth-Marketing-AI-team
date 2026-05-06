"use client"

import { useState, useTransition, useRef } from "react"
import { useRouter } from "next/navigation"
import { createBrowserClient } from "@/lib/supabase/client"
import { saveDocumentRecord, deleteDocument } from "@/lib/actions/documents"
import { FileText, Upload, Trash2, FolderOpen, Loader2, X, Download, Users } from "lucide-react"

const DOC_TYPES = ["Offer Letter", "Contract", "ID Proof", "Certificate", "Payslip", "Other"]

type Member   = { id: string; name: string; employee_id: string }
type Document = {
  id: string; name: string; file_url: string; file_type: string | null
  file_size: number | null; doc_type: string; created_at: string
  user_id: string
  users: { name: string; employee_id: string } | { name: string; employee_id: string }[] | null
}

function formatSize(b: number | null) {
  if (!b) return ""
  if (b < 1024) return `${b} B`
  if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`
  return `${(b / 1048576).toFixed(1)} MB`
}

function formatDate(s: string) {
  return new Date(s).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
}

const DOC_COLOR: Record<string, string> = {
  "Offer Letter": "#DC2626", "Contract": "#6366F1", "ID Proof": "#F59E0B",
  "Certificate": "#16A34A", "Payslip": "#0EA5E9", "Other": "#9CA3AF",
}

export default function DocumentsClient({
  members, documents, companyId,
}: {
  members: Member[]
  documents: Document[]
  companyId: string
}) {
  const [memberFilter, setMemberFilter] = useState("")
  const [showUpload, setShowUpload]     = useState(false)
  const [uploadFor, setUploadFor]       = useState("")
  const [docType, setDocType]           = useState("Other")
  const [docName, setDocName]           = useState("")
  const [file, setFile]                 = useState<File | null>(null)
  const [uploadError, setUploadError]   = useState("")
  const [isUploading, setIsUploading]   = useState(false)
  const [isPending, start]              = useTransition()
  const fileRef                         = useRef<HTMLInputElement>(null)
  const router                          = useRouter()

  const shown = memberFilter
    ? documents.filter(d => d.user_id === memberFilter)
    : documents

  async function handleUpload() {
    if (!file || !uploadFor || !docName.trim()) {
      setUploadError("Select a member, enter a name, and choose a file."); return
    }
    setUploadError("")
    setIsUploading(true)
    try {
      const supabase = createBrowserClient()
      const ext  = file.name.split(".").pop()
      const path = `${companyId}/${uploadFor}/${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage.from("documents").upload(path, file)
      if (upErr) { setUploadError(upErr.message); setIsUploading(false); return }

      const { data: { publicUrl } } = supabase.storage.from("documents").getPublicUrl(path)

      start(async () => {
        const res = await saveDocumentRecord({
          userId: uploadFor, name: docName.trim(),
          fileUrl: publicUrl, fileType: file.type,
          fileSize: file.size, docType,
        })
        if (res.success) {
          setShowUpload(false); setFile(null); setDocName(""); setUploadFor(""); setDocType("Other")
          router.refresh()
        } else {
          setUploadError(res.error ?? "Failed to save")
        }
        setIsUploading(false)
      })
    } catch (e) {
      setUploadError(String(e)); setIsUploading(false)
    }
  }

  function handleDelete(id: string) {
    if (!confirm("Delete this document?")) return
    start(async () => { await deleteDocument(id); router.refresh() })
  }

  return (
    <div className="p-8 max-w-[1000px]">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="gradient-heading text-[30px] font-black leading-tight" style={{ fontFamily: "var(--font-jakarta)" }}>
            Documents
          </h1>
          <p className="text-sm mt-1" style={{ color: "#9CA3AF" }}>Upload and manage team member documents</p>
        </div>
        <button onClick={() => setShowUpload(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-bold"
          style={{ background: "linear-gradient(135deg, #DC2626, #7F1D1D)", color: "#FFFFFF" }}>
          <Upload size={14} /> Upload Document
        </button>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-3 mb-5">
        <Users size={13} style={{ color: "#9CA3AF" }} />
        <select value={memberFilter} onChange={e => setMemberFilter(e.target.value)}
          className="text-[13px] px-3 py-2 rounded-xl outline-none"
          style={{ background: "#FFFFFF", border: "1px solid #E5E7EB", color: "#111111" }}>
          <option value="">All Members</option>
          {members.map(m => <option key={m.id} value={m.id}>{m.name} (#{m.employee_id})</option>)}
        </select>
        <span className="text-[12px]" style={{ color: "#9CA3AF" }}>{shown.length} documents</span>
      </div>

      {/* Documents list */}
      {shown.length === 0 ? (
        <div className="flex flex-col items-center py-20 rounded-2xl"
          style={{ background: "rgba(0,0,0,0.02)", border: "1px solid #F0F0F0" }}>
          <FolderOpen size={32} style={{ color: "#E5E7EB" }} className="mb-3" />
          <p className="text-[13px] font-semibold" style={{ color: "#9CA3AF" }}>No documents uploaded yet</p>
        </div>
      ) : (
        <div className="space-y-2">
          {shown.map(doc => {
            const user  = Array.isArray(doc.users) ? doc.users[0] : doc.users
            const color = DOC_COLOR[doc.doc_type] ?? DOC_COLOR["Other"]
            return (
              <div key={doc.id} className="flex items-center gap-4 rounded-xl px-4 py-3.5"
                style={{ background: "#FFFFFF", border: "1px solid #F0F0F0" }}>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: `${color}14` }}>
                  <FileText size={16} style={{ color }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-[13px] font-semibold truncate" style={{ color: "#111111" }}>{doc.name}</p>
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded flex-shrink-0"
                      style={{ background: `${color}14`, color }}>{doc.doc_type}</span>
                  </div>
                  <p className="text-[11px] mt-0.5" style={{ color: "#9CA3AF" }}>
                    {user?.name ?? "Unknown"} #{user?.employee_id} · {formatDate(doc.created_at)}
                    {doc.file_size ? ` · ${formatSize(doc.file_size)}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <a href={doc.file_url} target="_blank" rel="noopener noreferrer"
                    className="w-8 h-8 rounded-lg flex items-center justify-center transition-all"
                    style={{ background: "rgba(0,0,0,0.04)" }}>
                    <Download size={13} style={{ color: "#6B7280" }} />
                  </a>
                  <button onClick={() => handleDelete(doc.id)} disabled={isPending}
                    className="w-8 h-8 rounded-lg flex items-center justify-center transition-all"
                    style={{ background: "rgba(220,38,38,0.06)" }}>
                    <Trash2 size={13} style={{ color: "#DC2626" }} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Upload modal */}
      {showUpload && (
        <>
          <div className="fixed inset-0 z-40" style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
            onClick={() => setShowUpload(false)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="w-full max-w-[420px] rounded-2xl shadow-2xl"
              style={{ background: "#FFFFFF", border: "1px solid rgba(220,38,38,0.15)" }}>
              <div className="px-6 py-5 flex items-center justify-between" style={{ borderBottom: "1px solid #F0F0F0" }}>
                <h2 className="text-[16px] font-bold" style={{ color: "#111111" }}>Upload Document</h2>
                <button onClick={() => setShowUpload(false)} className="w-8 h-8 rounded-full flex items-center justify-center"
                  style={{ border: "1px solid #E5E7EB" }}>
                  <X size={14} style={{ color: "#6B7280" }} />
                </button>
              </div>
              <div className="px-6 py-5 space-y-4">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-[0.15em] mb-1.5" style={{ color: "#9CA3AF" }}>Member *</label>
                  <select value={uploadFor} onChange={e => setUploadFor(e.target.value)}
                    className="w-full text-[13px] px-3 py-2.5 rounded-xl outline-none"
                    style={{ background: "#F9FAFB", border: "1px solid #E5E7EB", color: "#111111" }}>
                    <option value="">Select member…</option>
                    {members.map(m => <option key={m.id} value={m.id}>{m.name} (#{m.employee_id})</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-[0.15em] mb-1.5" style={{ color: "#9CA3AF" }}>Document Name *</label>
                  <input placeholder="e.g. Offer Letter May 2025"
                    className="w-full text-[13px] px-3 py-2.5 rounded-xl outline-none"
                    style={{ background: "#F9FAFB", border: "1px solid #E5E7EB", color: "#111111" }}
                    value={docName} onChange={e => setDocName(e.target.value)} />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-[0.15em] mb-1.5" style={{ color: "#9CA3AF" }}>Document Type</label>
                  <select value={docType} onChange={e => setDocType(e.target.value)}
                    className="w-full text-[13px] px-3 py-2.5 rounded-xl outline-none"
                    style={{ background: "#F9FAFB", border: "1px solid #E5E7EB", color: "#111111" }}>
                    {DOC_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-[0.15em] mb-1.5" style={{ color: "#9CA3AF" }}>File *</label>
                  <input ref={fileRef} type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                    onChange={e => setFile(e.target.files?.[0] ?? null)} className="hidden" />
                  <button onClick={() => fileRef.current?.click()}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed text-[13px] font-medium transition-all"
                    style={{ borderColor: file ? "#DC2626" : "#E5E7EB", color: file ? "#DC2626" : "#9CA3AF", background: file ? "rgba(220,38,38,0.04)" : "#F9FAFB" }}>
                    <Upload size={14} />
                    {file ? file.name : "Click to choose file (PDF, DOC, JPG, PNG)"}
                  </button>
                </div>
                {uploadError && (
                  <p className="text-[12px] px-3 py-2 rounded-lg" style={{ background: "rgba(220,38,38,0.06)", color: "#DC2626" }}>
                    {uploadError}
                  </p>
                )}
              </div>
              <div className="px-6 pb-5 flex gap-3">
                <button onClick={() => setShowUpload(false)}
                  className="flex-1 py-2.5 rounded-xl text-[13px] font-semibold"
                  style={{ background: "#F9FAFB", color: "#6B7280", border: "1px solid #E5E7EB" }}>
                  Cancel
                </button>
                <button onClick={handleUpload} disabled={isUploading || isPending}
                  className="flex-1 py-2.5 rounded-xl text-[13px] font-bold flex items-center justify-center gap-2 disabled:opacity-60"
                  style={{ background: "linear-gradient(135deg, #DC2626, #7F1D1D)", color: "#FFFFFF" }}>
                  {(isUploading || isPending) && <Loader2 size={13} className="animate-spin" />}
                  Upload
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
