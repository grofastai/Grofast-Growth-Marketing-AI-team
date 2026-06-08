export const revalidate = 60

import { createServerClient } from "@/lib/supabase/server"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { FileText, Download, FolderOpen } from "lucide-react"

type Doc = {
  id: string
  name: string
  file_url: string
  file_type: string | null
  file_size: number | null
  doc_type: string
  created_at: string
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

export default async function MemberDocumentsPage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")
  const cookieStore = await cookies()
  const impersonateId = cookieStore.get("gf_impersonate")?.value
  const effectiveUserId = impersonateId ?? user.id

  const { data: raw } = await supabase
    .from("documents")
    .select("id, name, file_url, file_type, file_size, doc_type, created_at")
    .eq("user_id", effectiveUserId)
    .order("created_at", { ascending: false })
    .limit(50)

  const docs = (raw ?? []) as Doc[]

  // Group by doc_type
  const grouped: Record<string, Doc[]> = {}
  for (const d of docs) {
    const key = d.doc_type || "Other"
    if (!grouped[key]) grouped[key] = []
    grouped[key].push(d)
  }

  return (
    <div className="p-4 md:p-6 xl:p-8 max-w-[1000px]">
      <div className="mb-7">
        <h1 className="gradient-heading text-[30px] font-black leading-tight"
          style={{ fontFamily: "var(--font-jakarta)" }}>My Documents</h1>
        <p className="text-sm mt-1" style={{ color: "#6B7280" }}>
          Documents shared with you by your admin
        </p>
      </div>

      {docs.length === 0 ? (
        <div className="flex flex-col items-center py-24 rounded-2xl"
          style={{ background: "rgba(0,0,0,0.02)", border: "1px solid #E5E7EB" }}>
          <FolderOpen size={36} style={{ color: "#E5E7EB" }} className="mb-3" />
          <p className="text-[14px] font-semibold" style={{ color: "#6B7280" }}>No documents yet</p>
          <p className="text-[12px] mt-1" style={{ color: "#D1D5DB" }}>
            Your admin will upload documents here when available.
          </p>
        </div>
      ) : (
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
                    <a key={doc.id} href={doc.file_url} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-4 rounded-xl px-4 py-3.5 group transition-all"
                      style={{ background: "#FFFFFF", border: "1px solid #E5E7EB" }}>
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
                      <Download size={14} className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                        style={{ color: "#6B7280" }} />
                    </a>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
