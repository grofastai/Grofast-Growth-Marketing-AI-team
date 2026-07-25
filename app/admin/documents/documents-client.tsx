"use client"

import { useState, useTransition, useRef, useMemo } from "react"
import { useRouter } from "next/navigation"
import { deleteDocument, verifyMemberKYC } from "@/lib/actions/documents"
import Image from "next/image"
import { PageHero } from "@/components/admin/PageHero"
import { useConfirm } from "@/components/ui/ConfirmDialog"
import {
  FileText, Upload, Trash2, FolderOpen, Loader2, X, Download,
  Phone, Mail, Briefcase, Calendar, Shield, HeartPulse, MapPin,
  UserPlus, Landmark, CreditCard, ExternalLink, Search,
  List, CheckCircle2, Eye, MoreVertical, CloudUpload,
  Building2, LayoutGrid, ArrowUpRight, Layers, ChevronRight, Sparkles, Users,
  BadgeCheck, PenLine,
} from "lucide-react"

const DOC_TYPES = ["Govt ID Proof", "Ration Card", "Photo", "Payslip", "Signature", "Other"]
const FILTER_CHIPS = ["All", "Govt ID Proof", "Ration Card", "Photo", "Payslip", "Signature", "Other"]

type Member = {
  id: string; name: string; employee_id: string; role: string
  email: string | null; phone: string | null; status: string
  team: string | null; employment_type: string | null; created_at: string
  blood_group: string | null; address: string | null
  emergency_contact_name: string | null; emergency_contact_phone: string | null
  photo_url: string | null
}
type KYCRecord = {
  user_id: string; bank_name: string | null; bank_account: string | null
  bank_ifsc: string | null; govt_id_type: string | null
  govt_id_url: string | null; aadhaar_back_url: string | null
  pan_front_url: string | null; pan_back_url: string | null
  ration_card_url: string | null; ration_card_url2: string | null
  kyc_verified: boolean
  updated_at: string | null
}
type Doc = {
  id: string; name: string; file_url: string; file_type: string | null
  file_size: number | null; doc_type: string; created_at: string
  user_id: string
  users: { name: string; employee_id: string } | { name: string; employee_id: string }[] | null
}

function kycDocCount(k: KYCRecord | undefined) {
  if (!k) return 0
  return [k.govt_id_url, k.aadhaar_back_url, k.pan_front_url, k.pan_back_url, k.ration_card_url, k.ration_card_url2]
    .filter(Boolean).length
}

function computeCompletionPct(m: Member, k: KYCRecord | undefined, hasDocs: boolean) {
  let p = 0
  if (m.email) p += 12
  if (m.phone) p += 12
  if (m.team) p += 8
  if (m.employment_type) p += 8
  if (m.blood_group) p += 5
  if (m.address) p += 5
  if (m.emergency_contact_name) p += 5
  if (k?.bank_account) p += 15
  if (k?.govt_id_url) p += 15
  if (hasDocs) p += 15
  return Math.min(p, 100)
}

function kycRecordToDocs(k: KYCRecord, member?: { name: string; employee_id: string }): Doc[] {
  const createdAt = k.updated_at ?? new Date(0).toISOString()
  const fields: Array<{ url: string | null; name: string; docType: string }> = [
    { url: k.govt_id_url, name: k.govt_id_type ? `${k.govt_id_type} (Front)` : "Government ID", docType: "Govt ID Proof" },
    { url: k.aadhaar_back_url, name: "Aadhaar Back", docType: "Govt ID Proof" },
    { url: k.pan_front_url, name: "PAN Card Front", docType: "Govt ID Proof" },
    { url: k.pan_back_url, name: "PAN Card Back", docType: "Govt ID Proof" },
    { url: k.ration_card_url, name: "Ration Card", docType: "Ration Card" },
    { url: k.ration_card_url2, name: "Ration Card (Page 2)", docType: "Ration Card" },
  ]
  return fields
    .filter(f => !!f.url)
    .map((f, i) => ({
      id: `kyc__${k.user_id}__${i}`,
      name: f.name,
      file_url: f.url!,
      file_type: null,
      file_size: null,
      doc_type: f.docType,
      created_at: createdAt,
      user_id: k.user_id,
      users: member ?? null,
    }))
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
function formatDateShort(s: string) {
  return new Date(s).toLocaleDateString("en-IN", { day: "numeric", month: "short" })
}

function getExtBadge(fileType: string | null, name: string): { ext: string; color: string; bg: string } {
  const raw = name.split(".").pop()?.toUpperCase() ?? ""
  const ext = raw || (fileType?.includes("pdf") ? "PDF" : fileType?.includes("word") ? "DOC" : "FILE")
  if (ext === "PDF")                     return { ext: "PDF", color: "#E53935", bg: "rgba(229,57,53,0.12)" }
  if (["DOC","DOCX"].includes(ext))      return { ext: "DOC", color: "#1E88E5", bg: "rgba(30,136,229,0.12)" }
  if (["XLS","XLSX"].includes(ext))      return { ext: "XLS", color: "#43A047", bg: "rgba(67,160,71,0.12)" }
  if (["PNG","JPG","JPEG"].includes(ext))return { ext: "IMG", color: "#FB8C00", bg: "rgba(251,140,0,0.12)" }
  return { ext: (ext || "FILE").slice(0,4), color: "#6B7280", bg: "rgba(107,114,128,0.12)" }
}

const DOC_TYPE_COLOR: Record<string, string> = {
  "Govt ID Proof": "#F59E0B", "Ration Card": "#10B981",
  "Photo": "#EC4899", "Payslip": "#0EA5E9", "Signature": "#8B5CF6", "Other": "#6B7280",
}

const TEAM_COLORS = ["#6366F1","#0EA5E9","#16A34A","#F59E0B","#EC4899","#8B5CF6","#de1a1a"]
function teamColor(team: string | null) {
  if (!team) return "#6B7280"
  return TEAM_COLORS[team.charCodeAt(0) % TEAM_COLORS.length]
}

// ── Completion Ring ─────────────────────────────────────────────────────────
function CompletionRing({ pct, size = 72 }: { pct: number; size?: number }) {
  const r = (size - 10) / 2
  const circ = 2 * Math.PI * r
  const dash = (pct / 100) * circ
  const color = pct >= 80 ? "#22C55E" : pct >= 60 ? "#F59E0B" : "#EF4444"
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0 }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" strokeWidth={7} stroke="rgba(0,0,0,0.07)" />
      <circle cx={size/2} cy={size/2} r={r} fill="none" strokeWidth={7}
        stroke={color} strokeLinecap="round"
        strokeDasharray={`${dash} ${circ}`}
        transform={`rotate(-90 ${size/2} ${size/2})`} />
      <text x={size/2} y={size/2+1} textAnchor="middle" dominantBaseline="middle"
        fontSize={12} fontWeight="800" fill="#111">{pct}%</text>
    </svg>
  )
}

// ── Stat Hero Card ───────────────────────────────────────────────────────────
function HeroStatCard({ label, value, sub, icon, color, up }: {
  label: string; value: string; sub: string; icon: string; color: string; up?: boolean
}) {
  return (
    <div style={{
      background: "rgba(255,255,255,0.97)", borderRadius: 18, padding: "14px 16px",
      boxShadow: "0 4px 24px rgba(0,0,0,0.10)", minWidth: 140, flex: 1,
      border: "1px solid rgba(255,255,255,0.6)",
    }}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p style={{ fontSize: 11, color: "#1B4332", fontWeight: 600, marginBottom: 3 }}>{label}</p>
          <p style={{ fontSize: 26, fontWeight: 900, color: "#111", lineHeight: 1, fontFamily: "var(--font-jakarta)" }}>{value}</p>
          <div className="flex items-center gap-1 mt-1.5">
            <span style={{ fontSize: 10, fontWeight: 700, color: up !== false ? "#16A34A" : "#EF4444" }}>
              {up !== false ? "▲" : "▼"} {sub}
            </span>
            <span style={{ fontSize: 10, color: "#1B4332" }}>vs last month</span>
          </div>
        </div>
        <div style={{
          width: 38, height: 38, borderRadius: 12, display: "flex", alignItems: "center",
          justifyContent: "center", background: `${color}14`, flexShrink: 0, fontSize: 20,
        }}>{icon}</div>
      </div>
    </div>
  )
}

// ── InfoRow ──────────────────────────────────────────────────────────────────
function InfoRow({ icon: Icon, label, value, url }: {
  icon: React.ElementType; label: string; value: string | null; url?: string | null
}) {
  const empty = !value || value === "—"
  return (
    <div className="flex items-center gap-3 px-3 py-2 rounded-xl" style={{ background: "rgba(0,0,0,0.02)" }}>
      <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: "rgba(0,0,0,0.04)" }}>
        <Icon size={12} style={{ color: empty ? "#9CA3AF" : "#1B4332" }} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] uppercase tracking-wider" style={{ color: "#1B4332" }}>{label}</p>
        <p style={{ fontSize: 12, fontWeight: 600, color: empty ? "#9CA3AF" : "#111", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {value || "—"}
        </p>
      </div>
      {url && !empty && (
        <a href={url} target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-lg flex-shrink-0"
          style={{ background: "rgba(22,163,74,0.08)", color: "#16A34A", border: "1px solid rgba(22,163,74,0.2)", textDecoration: "none" }}>
          <ExternalLink size={9} /> View
        </a>
      )}
    </div>
  )
}

// ── Doc File Card (grid) ─────────────────────────────────────────────────────
function DocCardGrid({ doc, onDelete, isPending }: { doc: Doc; onDelete: () => void; isPending: boolean }) {
  const badge = getExtBadge(doc.file_type, doc.name)
  const typeColor = DOC_TYPE_COLOR[doc.doc_type] ?? "#6B7280"
  const verified = doc.doc_type !== "Other"
  const [menu, setMenu] = useState(false)
  return (
    <div style={{
      background: "#FFFFFF", borderRadius: 20, padding: "16px",
      border: "1px solid rgba(0,0,0,0.07)",
      boxShadow: "0 2px 12px rgba(0,0,0,0.05)",
      display: "flex", flexDirection: "column", gap: 10,
      transition: "box-shadow 0.2s", position: "relative",
    }}
      onMouseEnter={e => (e.currentTarget.style.boxShadow = "0 6px 24px rgba(0,0,0,0.12)")}
      onMouseLeave={e => (e.currentTarget.style.boxShadow = "0 2px 12px rgba(0,0,0,0.05)")}>
      {/* Extension badge + menu */}
      <div className="flex items-center justify-between">
        <div style={{
          padding: "4px 10px", borderRadius: 8, fontSize: 10, fontWeight: 800,
          background: badge.bg, color: badge.color, letterSpacing: "0.05em",
        }}>{badge.ext}</div>
        <div style={{ position: "relative" }}>
          <button onClick={() => setMenu(p => !p)} style={{ width: 28, height: 28, borderRadius: 8, background: "rgba(0,0,0,0.04)", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <MoreVertical size={13} style={{ color: "#1B4332" }} />
          </button>
          {menu && (
            <div style={{ position: "absolute", right: 0, top: 32, background: "#fff", borderRadius: 12, boxShadow: "0 8px 32px rgba(0,0,0,0.15)", zIndex: 50, minWidth: 140, border: "1px solid #E5E7EB", overflow: "hidden" }}
              onMouseLeave={() => setMenu(false)}>
              <a href={doc.file_url} target="_blank" rel="noopener noreferrer"
                style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", fontSize: 12, color: "#111", textDecoration: "none" }}>
                <Eye size={12} /> View file
              </a>
              <a href={doc.file_url} download
                style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", fontSize: 12, color: "#111", textDecoration: "none" }}>
                <Download size={12} /> Download
              </a>
              {!doc.id.startsWith("kyc__") && (
                <button onClick={() => { setMenu(false); onDelete() }} disabled={isPending}
                  style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", fontSize: 12, color: "#de1a1a", background: "none", border: "none", cursor: "pointer", width: "100%" }}>
                  <Trash2 size={12} /> Delete
                </button>
              )}
            </div>
          )}
        </div>
      </div>
      {/* File icon area */}
      <div style={{
        height: 52, borderRadius: 14, display: "flex", alignItems: "center", justifyContent: "center",
        background: `linear-gradient(135deg, ${badge.bg}, ${badge.bg.replace("0.12)", "0.06)")})`
      }}>
        <FileText size={26} style={{ color: badge.color }} />
      </div>
      {/* Name */}
      <div>
        <p style={{ fontSize: 12, fontWeight: 700, color: "#111", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{doc.name}</p>
        <p style={{ fontSize: 10, color: "#1B4332", marginTop: 2 }}>{formatDateShort(doc.created_at)}{doc.file_size ? ` · ${formatSize(doc.file_size)}` : ""}</p>
      </div>
      {/* Status + actions */}
      <div className="flex items-center justify-between">
        <span style={{
          fontSize: 9, fontWeight: 700, padding: "3px 8px", borderRadius: 6,
          background: verified ? "rgba(22,163,74,0.1)" : "rgba(249,115,22,0.1)",
          color: verified ? "#16A34A" : "#EA580C",
        }}>
          {verified ? "✓ Verified" : "Pending"}
        </span>
        <span style={{
          fontSize: 9, fontWeight: 700, padding: "3px 8px", borderRadius: 6,
          background: `${typeColor}14`, color: typeColor,
        }}>{doc.doc_type}</span>
      </div>
      {/* Action buttons */}
      <div className="flex gap-2">
        <a href={doc.file_url} target="_blank" rel="noopener noreferrer"
          style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 5, padding: "7px", borderRadius: 10, background: "rgba(0,0,0,0.04)", fontSize: 11, fontWeight: 600, color: "#1B4332", textDecoration: "none" }}>
          <Eye size={11} /> View
        </a>
        <a href={doc.file_url} download
          style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 5, padding: "7px", borderRadius: 10, background: "rgba(222,26,26,0.06)", fontSize: 11, fontWeight: 600, color: "#de1a1a", textDecoration: "none" }}>
          <Download size={11} /> Save
        </a>
      </div>
    </div>
  )
}

// ── Doc Row (list) ───────────────────────────────────────────────────────────
function DocRowList({ doc, onDelete, isPending }: { doc: Doc; onDelete: () => void; isPending: boolean }) {
  const badge = getExtBadge(doc.file_type, doc.name)
  const typeColor = DOC_TYPE_COLOR[doc.doc_type] ?? "#6B7280"
  const verified = doc.doc_type !== "Other"
  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-2xl"
      style={{ background: "#FFFFFF", border: "1px solid rgba(0,0,0,0.06)", boxShadow: "0 1px 6px rgba(0,0,0,0.04)" }}>
      <div style={{ width: 38, height: 38, borderRadius: 12, background: badge.bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <FileText size={18} style={{ color: badge.color }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="flex items-center gap-2">
          <p style={{ fontSize: 13, fontWeight: 700, color: "#111", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{doc.name}</p>
          <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 7px", borderRadius: 5, background: `${typeColor}14`, color: typeColor, flexShrink: 0 }}>{doc.doc_type}</span>
          <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 7px", borderRadius: 5, background: verified ? "rgba(22,163,74,0.1)" : "rgba(249,115,22,0.1)", color: verified ? "#16A34A" : "#EA580C", flexShrink: 0 }}>
            {verified ? "✓ Verified" : "Pending"}
          </span>
        </div>
        <p style={{ fontSize: 11, color: "#1B4332", marginTop: 2 }}>{formatDate(doc.created_at)}{doc.file_size ? ` · ${formatSize(doc.file_size)}` : ""}</p>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <a href={doc.file_url} target="_blank" rel="noopener noreferrer"
          style={{ width: 32, height: 32, borderRadius: 10, background: "rgba(0,0,0,0.04)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Download size={13} style={{ color: "#1B4332" }} />
        </a>
        {!doc.id.startsWith("kyc__") && (
          <button onClick={onDelete} disabled={isPending}
            style={{ width: 32, height: 32, borderRadius: 10, background: "rgba(222,26,26,0.06)", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Trash2 size={13} style={{ color: "#de1a1a" }} />
          </button>
        )}
      </div>
    </div>
  )
}

// ── Activity Icon ────────────────────────────────────────────────────────────
function ActivityDot({ type }: { type: string }) {
  const cfg: Record<string, { bg: string; icon: React.ReactNode }> = {
    upload:    { bg: "#6366F1", icon: <CloudUpload size={10} color="#fff" /> },
    kyc:       { bg: "#22C55E", icon: <Shield size={10} color="#fff" /> },
    signature: { bg: "#8B5CF6", icon: <FileText size={10} color="#fff" /> },
    payroll:   { bg: "#0EA5E9", icon: <Layers size={10} color="#fff" /> },
    bank:      { bg: "#F59E0B", icon: <Landmark size={10} color="#fff" /> },
  }
  const c = cfg[type] ?? cfg.upload
  return (
    <div style={{ width: 24, height: 24, borderRadius: "50%", background: c.bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, boxShadow: `0 2px 8px ${c.bg}55` }}>
      {c.icon}
    </div>
  )
}

// ── Main Component ───────────────────────────────────────────────────────────
export default function DocumentsClient({
  members, documents, kycRecords, companyId,
}: {
  members: Member[]
  documents: Doc[]
  kycRecords: KYCRecord[]
  companyId: string
}) {
  const confirm = useConfirm()
  const [selectedId, setSelectedId]   = useState<string>(members[0]?.id ?? "")
  const [empSearch, setEmpSearch]     = useState("")
  const [activeTab, setActiveTab]     = useState<"documents" | "personal" | "kyc" | "activity">("documents")
  const [docFilter, setDocFilter]     = useState("All")
  const [docSearch, setDocSearch]     = useState("")
  const [viewMode, setViewMode]       = useState<"grid" | "list">("grid")
  const [dragOver, setDragOver]       = useState(false)
  const [showUpload, setShowUpload]   = useState(false)
  const [uploadFor, setUploadFor]     = useState("")
  const [docType, setDocType]         = useState("Other")
  const [docName, setDocName]         = useState("")
  const [file, setFile]               = useState<File | null>(null)
  const [uploadError, setUploadError]     = useState("")
  const [uploadSuccess, setUploadSuccess] = useState("")
  const [isUploading, setIsUploading]     = useState(false)
  const [isPending, start]            = useTransition()
  const fileRef                       = useRef<HTMLInputElement>(null)
  const router                        = useRouter()

  const selectedMember = members.find(m => m.id === selectedId) ?? null
  const selectedKYC    = kycRecords.find(k => k.user_id === selectedId) ?? null

  const memberDocs = useMemo(() => {
    const fromTable = selectedId ? documents.filter(d => d.user_id === selectedId) : documents
    if (!selectedKYC || !selectedMember) return fromTable
    const kycDocs = kycRecordToDocs(selectedKYC, { name: selectedMember.name, employee_id: selectedMember.employee_id })
    return [...kycDocs, ...fromTable]
  }, [selectedId, documents, selectedKYC, selectedMember])

  const filteredMembers = empSearch.trim()
    ? members.filter(m =>
        m.name.toLowerCase().includes(empSearch.toLowerCase()) ||
        m.employee_id.includes(empSearch)
      )
    : members

  const shownDocs = useMemo(() => {
    let docs = memberDocs
    if (docFilter !== "All") docs = docs.filter(d => d.doc_type === docFilter)
    if (docSearch.trim()) docs = docs.filter(d => d.name.toLowerCase().includes(docSearch.toLowerCase()))
    return docs
  }, [memberDocs, docFilter, docSearch])

  // Hero stats
  const totalFiles    = documents.length
  const verifiedCount = documents.filter(d => d.doc_type !== "Other").length
  const pendingKYC    = members.filter(m => !kycRecords.find(k => k.user_id === m.id && k.bank_account)).length
  const membersWithDocs = members.filter(m =>
    documents.some(d => d.user_id === m.id) || kycDocCount(kycRecords.find(k => k.user_id === m.id)) > 0
  ).length
  const coveragePct     = members.length > 0 ? Math.round((membersWithDocs / members.length) * 100) : 0

  // Profile completion
  const completionPct = useMemo(() => {
    if (!selectedMember) return 0
    return computeCompletionPct(selectedMember, selectedKYC ?? undefined, memberDocs.length > 0)
  }, [selectedMember, selectedKYC, memberDocs])

  // Activity feed
  const activityFeed = useMemo(() => {
    const items: { type: string; title: string; desc: string; time: string }[] = []
    const sorted = [...memberDocs].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    sorted.slice(0, 3).forEach(d => {
      items.push({ type: "upload", title: "Document uploaded", desc: `${d.name} uploaded`, time: formatDate(d.created_at) })
    })
    if (selectedKYC?.govt_id_url) items.push({ type: "kyc", title: "KYC verified", desc: "Govt ID verified successfully", time: "Recent" })
    if (selectedKYC?.bank_account) items.push({ type: "bank", title: "Bank details updated", desc: "Bank passbook updated", time: "Recent" })
    return items.slice(0, 5)
  }, [memberDocs, selectedKYC])

  // Recent uploads across all members — merges the documents table with KYC-sourced
  // uploads (Aadhaar/PAN/Ration Card), same gap as the sidebar doc counts
  const allKycDocs = useMemo(() => kycRecords.flatMap(k => kycRecordToDocs(k)), [kycRecords])

  const recentUploads = useMemo(() =>
    [...documents, ...allKycDocs].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 4),
    [documents, allKycDocs]
  )

  async function handleUpload() {
    if (!file || !uploadFor || !docName.trim()) {
      setUploadError("Select a member, enter a name, and choose a file."); return
    }
    setUploadError(""); setIsUploading(true)
    try {
      const targetMember = uploadFor
      const form = new FormData()
      form.append("file",    file)
      form.append("userId",  targetMember)
      form.append("name",    docName.trim())
      form.append("docType", docType)

      const res = await fetch("/api/documents/upload", { method: "POST", body: form })
      const json = await res.json()

      if (!res.ok) { setUploadError(json.error ?? "Upload failed"); setIsUploading(false); return }

      setShowUpload(false); setFile(null); setDocName(""); setUploadFor(""); setDocType("Other")
      setSelectedId(targetMember)
      setActiveTab("documents")
      setUploadSuccess(`"${docName.trim()}" uploaded successfully!`)
      setTimeout(() => setUploadSuccess(""), 4000)
      router.refresh()
      setIsUploading(false)
    } catch (e) { setUploadError(String(e)); setIsUploading(false) }
  }

  async function handleDelete(id: string) {
    if (id.startsWith("kyc__")) return
    if (!(await confirm("Delete this document?"))) return
    start(async () => { await deleteDocument(id); router.refresh() })
  }

  async function handleVerifyKYC() {
    if (!selectedId || !selectedMember) return
    if (!(await confirm(`Mark ${selectedMember.name}'s KYC documents as verified? Only do this after checking the uploaded documents match their details.`))) return
    start(async () => {
      const res = await verifyMemberKYC(selectedId)
      if (!res.success) { alert(res.error ?? "Failed to verify KYC"); return }
      router.refresh()
    })
  }

  const initial = selectedMember?.name?.charAt(0)?.toUpperCase() ?? "?"
  const tc = teamColor(selectedMember?.team ?? null)

  const TABS = [
    { id: "documents", label: "Documents" },
    { id: "personal",  label: "Personal Info" },
    { id: "kyc",       label: "KYC Details" },
    { id: "activity",  label: "Activity" },
  ] as const

  return (
    <div style={{ background: "#F7F8FA", minHeight: "100vh" }}>

      {/* ── SUCCESS TOAST ─────────────────────────────────────────────────── */}
      {uploadSuccess && (
        <div style={{
          position: "fixed", top: 20, right: 20, zIndex: 9999,
          background: "#fff", borderRadius: 14, padding: "14px 18px",
          boxShadow: "0 8px 32px rgba(0,0,0,0.14)", border: "1px solid rgba(22,163,74,0.2)",
          display: "flex", alignItems: "center", gap: 10, minWidth: 280,
        }}>
          <div style={{ width: 32, height: 32, borderRadius: 10, background: "rgba(22,163,74,0.1)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <CheckCircle2 size={16} style={{ color: "#16A34A" }} />
          </div>
          <div>
            <p style={{ fontSize: 13, fontWeight: 700, color: "#111", margin: 0 }}>Upload Successful</p>
            <p style={{ fontSize: 11, color: "#1B4332", margin: 0 }}>{uploadSuccess}</p>
          </div>
        </div>
      )}

      {/* ── HERO ──────────────────────────────────────────────────────────── */}
      <div style={{ margin: "16px 16px 0" }}>
        <PageHero
          eyebrowIcon={<span style={{ fontSize: 14 }}>📄</span>}
          title="Documents"
          subtitle="Manage employee documents securely in one place"
          maxContentWidth={460}
          illustration={
            <div style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: "56%", zIndex: 1, opacity: 0.9 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brand/documents/hero-boy.png" alt=""
                style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center 15%", display: "block" }} />
              <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: "60%", background: "linear-gradient(to right, #8B1212 0%, rgba(139,18,18,0.55) 50%, transparent 100%)", zIndex: 2, pointerEvents: "none" }} />
            </div>
          }
          actions={
            <>
              <button onClick={() => { setUploadFor(selectedId); setShowUpload(true) }}
                style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 16px", borderRadius: 12, fontSize: 12.5, fontWeight: 700, cursor: "pointer", border: "1.5px solid rgba(255,255,255,0.5)", background: "rgba(255,255,255,0.22)", color: "#fff", backdropFilter: "blur(12px)", whiteSpace: "nowrap", boxShadow: "0 2px 12px rgba(0,0,0,0.3)" }}>
                <Upload size={13} /> Upload Document
              </button>
              <a href="https://drive.google.com/drive/folders/16TBEl7wIxVEv43gYqqfp0NxXc8Z87dF8" target="_blank" rel="noopener noreferrer"
                style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 16px", borderRadius: 12, fontSize: 12.5, fontWeight: 800, color: "#C01010", background: "#FFFFFF", textDecoration: "none", boxShadow: "0 4px 16px rgba(0,0,0,0.35)", whiteSpace: "nowrap", border: "none" }}>
                <ExternalLink size={13} /> Drive Backup
              </a>
            </>
          }
          belowSubtitle={
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {[
                { emoji: "👥", value: members.length, label: "Members" },
                { emoji: "📄", value: totalFiles,      label: "Files" },
                { emoji: "✅", value: verifiedCount,  label: "Verified" },
              ].map(chip => (
                <div key={chip.label} style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,0.14)", borderRadius: 12, padding: "7px 13px", border: "1px solid rgba(255,255,255,0.2)", backdropFilter: "blur(4px)" }}>
                  <span style={{ fontSize: 15, lineHeight: 1 }}>{chip.emoji}</span>
                  <div>
                    <p style={{ fontSize: 16, fontWeight: 900, color: "#fff", margin: 0, lineHeight: 1, fontFamily: "var(--font-jakarta)" }}>{chip.value}</p>
                    <p style={{ fontSize: 9, color: "rgba(255,255,255,0.6)", margin: 0, textTransform: "uppercase", letterSpacing: "0.07em" }}>{chip.label}</p>
                  </div>
                </div>
              ))}
            </div>
          }
        />
      </div>

      {/* ── MOBILE STAT CARDS (visible < md, hidden on desktop where hero shows them) ── */}
      <div className="md:hidden grid grid-cols-2 gap-3 px-4 pt-4">
        <HeroStatCard label="Total Files"        value={String(totalFiles)}    sub="16.4%" icon="📄" color="#6366F1" up />
        <HeroStatCard label="Verified Documents" value={String(verifiedCount)} sub="22.1%" icon="✅" color="#16A34A" up />
        <HeroStatCard label="Pending KYC"        value={String(pendingKYC)}    sub="5.6%"  icon="⏳" color="#F59E0B" up={false} />
        <HeroStatCard label="Doc Coverage"        value={`${coveragePct}%`}     sub={`${membersWithDocs}/${members.length} members`} icon="📁" color="#0EA5E9" up={coveragePct >= 50} />
      </div>

      {/* ── MAIN 3-COLUMN GRID ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr_288px] gap-3.5 px-4 md:px-5 pt-4">

        {/* ── LEFT: Employee List ───────────────────────────────────────────── */}
        <div className="hidden lg:flex flex-col" style={{ background: "#fff", borderRadius: 20, border: "1px solid rgba(0,0,0,0.07)", boxShadow: "0 2px 12px rgba(0,0,0,0.05)", overflow: "hidden" }}>
          <div style={{ padding: "16px 16px 12px" }}>
            <div className="flex items-center justify-between mb-3">
              <p style={{ fontSize: 13, fontWeight: 800, color: "#111", fontFamily: "var(--font-jakarta)" }}>Employees</p>
              <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 20, background: "rgba(222,26,26,0.08)", color: "#de1a1a" }}>{members.length}</span>
            </div>
            <div style={{ position: "relative" }}>
              <Search size={12} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#1B4332" }} />
              <input
                placeholder="Search employee..."
                value={empSearch} onChange={e => setEmpSearch(e.target.value)}
                style={{
                  width: "100%", padding: "8px 10px 8px 28px", borderRadius: 10, fontSize: 12,
                  border: "1px solid #E5E7EB", outline: "none", color: "#111", background: "#F9FAFB",
                  boxSizing: "border-box",
                }}
              />
            </div>
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: "0 10px 12px" }}>
            {filteredMembers.map(m => {
              const mKyc = kycRecords.find(k => k.user_id === m.id)
              const mHasDocs = documents.some(d => d.user_id === m.id) || kycDocCount(mKyc) > 0
              const mPct = computeCompletionPct(m, mKyc, mHasDocs)
              const tc2 = teamColor(m.team)
              const isActive = m.id === selectedId
              return (
                <button key={m.id} onClick={() => { setSelectedId(m.id); setActiveTab("documents"); setDocFilter("All"); setDocSearch("") }}
                  style={{
                    display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "10px 10px",
                    borderRadius: 14, marginBottom: 3, cursor: "pointer", border: "none", textAlign: "left",
                    background: isActive ? "linear-gradient(135deg, rgba(222,26,26,0.08), rgba(222,26,26,0.04))" : "transparent",
                    outline: isActive ? "1.5px solid rgba(222,26,26,0.2)" : "none",
                    transition: "all 0.15s",
                  }}>
                  {/* Avatar */}
                  <div style={{
                    width: 38, height: 38, borderRadius: 12, flexShrink: 0, overflow: "hidden",
                    background: m.photo_url ? "transparent" : `${tc2}18`,
                    border: `2px solid ${isActive ? "#de1a1a" : tc2}22`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 14, fontWeight: 800, color: tc2,
                  }}>
                    {m.photo_url
                      ? <img src={m.photo_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      : m.name.charAt(0).toUpperCase()}
                  </div>
                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 12, fontWeight: 700, color: "#111", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.name}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span style={{ fontSize: 9, fontWeight: 600, color: "#1B4332", flexShrink: 0 }}>#{m.employee_id}</span>
                      {m.team && (
                        <span style={{
                          fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 4,
                          background: `${tc2}14`, color: tc2,
                          minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        }} title={m.team}>{m.team}</span>
                      )}
                    </div>
                  </div>
                  {/* Completion % + online dot */}
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
                    <div style={{ width: 7, height: 7, borderRadius: "50%", background: m.status === "active" ? "#22C55E" : "#D1D5DB" }} />
                    <span style={{
                      fontSize: 10, fontWeight: 800,
                      color: mPct >= 80 ? "#16A34A" : mPct >= 40 ? "#D97706" : "#DC2626",
                    }}>{mPct}%</span>
                    <span style={{ fontSize: 8, color: "#1B4332", marginTop: -3 }}>complete</span>
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* ── CENTER: Document Explorer ────────────────────────────────────── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Mobile/tablet employee switcher — the Employees list is desktop-only (lg:flex), so this is the
              only way to change whose documents are shown below lg */}
          <div className="lg:hidden" style={{ position: "relative" }}>
            <Users size={13} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#1B4332", pointerEvents: "none" }} />
            <select
              value={selectedId}
              onChange={e => { setSelectedId(e.target.value); setActiveTab("documents"); setDocFilter("All"); setDocSearch("") }}
              style={{
                width: "100%", padding: "10px 12px 10px 34px", borderRadius: 14, fontSize: 13, fontWeight: 700,
                border: "1px solid #E5E7EB", outline: "none", color: "#111", background: "#fff",
                boxSizing: "border-box", appearance: "none",
              }}>
              {members.map(m => <option key={m.id} value={m.id}>{m.name} (#{m.employee_id})</option>)}
            </select>
            <ChevronRight size={13} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%) rotate(90deg)", color: "#1B4332", pointerEvents: "none" }} />
          </div>
          {selectedMember ? (
            <>
              {/* Profile header card */}
              <div style={{
                background: "#fff", borderRadius: 20, border: "1px solid rgba(0,0,0,0.07)",
                boxShadow: "0 2px 12px rgba(0,0,0,0.05)", overflow: "hidden", position: "relative",
              }}>
                {/* Top gradient bar */}
                <div style={{ height: 6, background: `linear-gradient(90deg, ${tc}, ${tc}88)` }} />
                {selectedKYC?.kyc_verified && (
                  <div title="KYC Verified" style={{
                    position: "absolute", top: 12, right: 16, zIndex: 1,
                    display: "flex", alignItems: "center", gap: 4, padding: "4px 10px",
                    borderRadius: 20, background: "#fff", boxShadow: "0 2px 10px rgba(0,0,0,0.12)",
                    fontSize: 10, fontWeight: 800, color: "#0EA5E9",
                  }}>
                    <BadgeCheck size={13} /> Verified
                  </div>
                )}
                <div style={{ padding: "16px 20px" }}>
                  <div className="flex items-center gap-4">
                    {/* Avatar */}
                    <div style={{
                      width: 60, height: 60, borderRadius: 18, flexShrink: 0, overflow: "hidden",
                      background: selectedMember.photo_url ? "transparent" : `${tc}18`,
                      border: `3px solid ${tc}33`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 22, fontWeight: 900, color: tc,
                    }}>
                      {selectedMember.photo_url
                        ? <img src={selectedMember.photo_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        : initial}
                    </div>
                    {/* Name & tags */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h2 style={{ fontSize: 17, fontWeight: 900, color: "#111", fontFamily: "var(--font-jakarta)" }}>{selectedMember.name}</h2>
                        <span style={{ fontSize: 9, fontWeight: 800, padding: "3px 8px", borderRadius: 20, background: "rgba(22,163,74,0.1)", color: "#16A34A" }}>● Active</span>
                      </div>
                      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                        <span style={{ fontSize: 10, color: "#1B4332" }}>{selectedMember.employment_type ?? selectedMember.role}</span>
                        {selectedMember.team && (
                          <>
                            <span style={{ fontSize: 10, color: "#1B4332" }}>•</span>
                            <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 5, background: `${tc}14`, color: tc }}>{selectedMember.team}</span>
                          </>
                        )}
                        <span style={{ fontSize: 10, color: "#1B4332" }}>•</span>
                        <span style={{ fontSize: 10, color: "#1B4332" }}>Joined {formatDate(selectedMember.created_at)}</span>
                      </div>
                    </div>
                    {/* Completion ring */}
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                      <CompletionRing pct={completionPct} size={68} />
                      <p style={{ fontSize: 9, color: "#1B4332", fontWeight: 600 }}>Profile Complete</p>
                    </div>
                  </div>
                  {/* Action pills */}
                  <div className="flex gap-2 mt-4 flex-wrap">
                    {[
                      { label: "Upload File",        icon: <Upload size={11} />,     onClick: () => { setUploadFor(selectedId); setDocType("Other"); setShowUpload(true) } },
                      { label: selectedKYC?.kyc_verified ? "KYC Verified" : "Verify KYC",
                        icon: selectedKYC?.kyc_verified ? <BadgeCheck size={11} /> : <Shield size={11} />,
                        onClick: selectedKYC?.kyc_verified ? () => {} : handleVerifyKYC },
                      { label: "Request Signature",  icon: <PenLine size={11} />,    onClick: () => { setUploadFor(selectedId); setDocType("Signature"); setShowUpload(true) } },
                    ].map(a => (
                      <button key={a.label} onClick={a.onClick} style={{
                        display: "flex", alignItems: "center", gap: 5, padding: "6px 12px",
                        borderRadius: 10, fontSize: 11, fontWeight: 700, cursor: "pointer",
                        background: "rgba(0,0,0,0.03)", color: "#1B4332",
                        border: "1px solid rgba(0,0,0,0.08)",
                      }}>
                        {a.icon} {a.label}
                      </button>
                    ))}
                  </div>
                </div>
                {/* Tabs */}
                <div style={{ borderTop: "1px solid #F3F4F6", display: "flex" }}>
                  {TABS.map(tab => (
                    <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                      style={{
                        flex: 1, padding: "11px 8px", fontSize: 12, fontWeight: 700, cursor: "pointer",
                        border: "none", background: "none", borderBottom: `2px solid ${activeTab === tab.id ? "#de1a1a" : "transparent"}`,
                        color: activeTab === tab.id ? "#de1a1a" : "#1B4332",
                        transition: "all 0.15s",
                      }}>
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* ── Tab: Documents ─────────────────────────────────────────── */}
              {activeTab === "documents" && (
                <>
                  {/* Filter bar */}
                  <div style={{ background: "#fff", borderRadius: 16, border: "1px solid rgba(0,0,0,0.07)", padding: "12px 16px", display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                    <div style={{ display: "flex", gap: 6, flex: 1, flexWrap: "wrap" }}>
                      {FILTER_CHIPS.map(chip => (
                        <button key={chip} onClick={() => setDocFilter(chip)} style={{
                          padding: "5px 12px", borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: "pointer", border: "none",
                          background: docFilter === chip ? "#de1a1a" : "rgba(0,0,0,0.04)",
                          color: docFilter === chip ? "#fff" : "#1B4332",
                        }}>{chip}</button>
                      ))}
                    </div>
                    {/* Search + view toggle */}
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <div style={{ position: "relative" }}>
                        <Search size={11} style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", color: "#1B4332" }} />
                        <input placeholder="Search documents..." value={docSearch} onChange={e => setDocSearch(e.target.value)}
                          style={{ padding: "7px 10px 7px 26px", borderRadius: 9, fontSize: 11, border: "1px solid #E5E7EB", outline: "none", width: 160, color: "#111", background: "#F9FAFB" }} />
                      </div>
                      <button onClick={() => setViewMode("grid")} style={{ width: 30, height: 30, borderRadius: 8, border: "none", cursor: "pointer", background: viewMode === "grid" ? "#de1a1a" : "rgba(0,0,0,0.04)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <LayoutGrid size={13} style={{ color: viewMode === "grid" ? "#fff" : "#1B4332" }} />
                      </button>
                      <button onClick={() => setViewMode("list")} style={{ width: 30, height: 30, borderRadius: 8, border: "none", cursor: "pointer", background: viewMode === "list" ? "#de1a1a" : "rgba(0,0,0,0.04)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <List size={13} style={{ color: viewMode === "list" ? "#fff" : "#1B4332" }} />
                      </button>
                    </div>
                  </div>

                  {/* Drag & Drop upload area */}
                  <div
                    onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={e => {
                      e.preventDefault(); setDragOver(false)
                      const f = e.dataTransfer.files[0]
                      if (f) { setFile(f); setUploadFor(selectedId); setShowUpload(true) }
                    }}
                    style={{
                      borderRadius: 16, border: `2px dashed ${dragOver ? "#de1a1a" : "rgba(0,0,0,0.12)"}`,
                      padding: "18px", textAlign: "center", cursor: "pointer",
                      background: dragOver ? "rgba(222,26,26,0.04)" : "rgba(0,0,0,0.01)",
                      transition: "all 0.2s",
                    }}
                    onClick={() => { setUploadFor(selectedId); setShowUpload(true) }}>
                    <CloudUpload size={22} style={{ color: dragOver ? "#de1a1a" : "#1B4332", margin: "0 auto 6px" }} />
                    <p style={{ fontSize: 12, fontWeight: 600, color: dragOver ? "#de1a1a" : "#1B4332" }}>
                      Drag &amp; drop files here or click to upload
                    </p>
                    <p style={{ fontSize: 10, color: "#1B4332", marginTop: 3 }}>Supports: PDF, DOC, DOCX, PNG, JPG (Max 10MB)</p>
                  </div>

                  {/* Documents */}
                  {shownDocs.length === 0 ? (
                    <div style={{ background: "#fff", borderRadius: 20, padding: "48px 20px", textAlign: "center", border: "1px solid rgba(0,0,0,0.07)" }}>
                      <FolderOpen size={36} style={{ color: "#E5E7EB", margin: "0 auto 12px" }} />
                      <p style={{ fontSize: 14, fontWeight: 700, color: "#1B4332" }}>No documents found</p>
                      <p style={{ fontSize: 12, color: "#1B4332", marginTop: 4 }}>Upload the first document for {selectedMember.name}</p>
                      <button onClick={() => { setUploadFor(selectedId); setShowUpload(true) }}
                        style={{ marginTop: 16, display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 18px", borderRadius: 10, fontSize: 12, fontWeight: 700, background: "rgba(222,26,26,0.08)", color: "#de1a1a", border: "1px solid rgba(222,26,26,0.2)", cursor: "pointer" }}>
                        <Upload size={12} /> Upload Document
                      </button>
                    </div>
                  ) : viewMode === "grid" ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {shownDocs.map(doc => <DocCardGrid key={doc.id} doc={doc} onDelete={() => handleDelete(doc.id)} isPending={isPending} />)}
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {shownDocs.map(doc => <DocRowList key={doc.id} doc={doc} onDelete={() => handleDelete(doc.id)} isPending={isPending} />)}
                    </div>
                  )}

                  {shownDocs.length > 0 && (
                    <button style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "12px", borderRadius: 14, fontSize: 12, fontWeight: 700, color: "#1B4332", background: "rgba(0,0,0,0.03)", border: "1px solid rgba(0,0,0,0.06)", cursor: "pointer" }}>
                      View More Documents <ChevronRight size={13} />
                    </button>
                  )}
                </>
              )}

              {/* ── Tab: Personal Info ─────────────────────────────────────── */}
              {activeTab === "personal" && (
                <div style={{ background: "#fff", borderRadius: 20, padding: "20px", border: "1px solid rgba(0,0,0,0.07)" }}>
                  <p style={{ fontSize: 11, fontWeight: 800, color: "#1B4332", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 14 }}>Personal Details</p>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    <InfoRow icon={Mail}      label="Email"            value={selectedMember.email} />
                    <InfoRow icon={Phone}     label="Phone"            value={selectedMember.phone} />
                    <InfoRow icon={Briefcase} label="Employment Type"  value={selectedMember.employment_type} />
                    <InfoRow icon={Calendar}  label="Joined"           value={formatDate(selectedMember.created_at)} />
                    <InfoRow icon={HeartPulse}label="Blood Group"      value={selectedMember.blood_group} />
                    <InfoRow icon={MapPin}    label="Address"          value={selectedMember.address} />
                    <InfoRow icon={UserPlus}  label="Emergency Name"   value={selectedMember.emergency_contact_name} />
                    <InfoRow icon={Phone}     label="Emergency Phone"  value={selectedMember.emergency_contact_phone} />
                  </div>
                </div>
              )}

              {/* ── Tab: KYC Details ───────────────────────────────────────── */}
              {activeTab === "kyc" && (
                <div style={{ background: "#fff", borderRadius: 20, padding: "20px", border: "1px solid rgba(0,0,0,0.07)" }}>
                  <p style={{ fontSize: 11, fontWeight: 800, color: "#1B4332", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 14 }}>KYC &amp; Bank Details</p>
                  {selectedKYC ? (
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                      <InfoRow icon={Landmark}   label="Bank Name"    value={selectedKYC.bank_name} />
                      <InfoRow icon={CreditCard} label="Account No"   value={selectedKYC.bank_account ? `****${selectedKYC.bank_account.slice(-4)}` : null} />
                      <InfoRow icon={Shield}     label="IFSC Code"    value={selectedKYC.bank_ifsc} />
                      <InfoRow icon={FileText}   label="Govt ID Type" value={selectedKYC.govt_id_type} />
                      <InfoRow icon={FileText}   label="Govt ID"      value={selectedKYC.govt_id_url ? "Uploaded" : null} url={selectedKYC.govt_id_url} />
                      <InfoRow icon={FileText}   label="Ration Card"  value={selectedKYC.ration_card_url ? "Uploaded" : null} url={selectedKYC.ration_card_url} />
                    </div>
                  ) : (
                    <div style={{ textAlign: "center", padding: "32px 20px" }}>
                      <Shield size={32} style={{ color: "#E5E7EB", margin: "0 auto 10px" }} />
                      <p style={{ fontSize: 13, fontWeight: 600, color: "#1B4332" }}>No KYC records found for this employee</p>
                    </div>
                  )}
                </div>
              )}

              {/* ── Tab: Activity ──────────────────────────────────────────── */}
              {activeTab === "activity" && (
                <div style={{ background: "#fff", borderRadius: 20, padding: "20px", border: "1px solid rgba(0,0,0,0.07)" }}>
                  <p style={{ fontSize: 11, fontWeight: 800, color: "#1B4332", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 16 }}>Activity Timeline</p>
                  {activityFeed.length === 0 ? (
                    <p style={{ fontSize: 13, color: "#1B4332", textAlign: "center", padding: "24px 0" }}>No activity yet</p>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                      {activityFeed.map((item, i) => (
                        <div key={i} style={{ display: "flex", gap: 14, position: "relative", paddingBottom: i < activityFeed.length - 1 ? 20 : 0 }}>
                          {i < activityFeed.length - 1 && (
                            <div style={{ position: "absolute", left: 11, top: 24, width: 2, height: "calc(100% - 24px)", background: "#F3F4F6" }} />
                          )}
                          <ActivityDot type={item.type} />
                          <div style={{ flex: 1 }}>
                            <p style={{ fontSize: 12, fontWeight: 700, color: "#111" }}>{item.title}</p>
                            <p style={{ fontSize: 11, color: "#1B4332", marginTop: 2 }}>{item.desc}</p>
                            <p style={{ fontSize: 10, color: "#1B4332", marginTop: 3 }}>{item.time}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            <div style={{ background: "#fff", borderRadius: 20, padding: "64px 20px", textAlign: "center", border: "1px solid rgba(0,0,0,0.07)" }}>
              <Building2 size={40} style={{ color: "#E5E7EB", margin: "0 auto 14px" }} />
              <p style={{ fontSize: 15, fontWeight: 700, color: "#1B4332" }}>Select an employee</p>
              <p style={{ fontSize: 12, color: "#1B4332", marginTop: 6 }}>Choose an employee from the list to view their documents</p>
            </div>
          )}
        </div>

        {/* ── RIGHT PANEL ──────────────────────────────────────────────────── */}
        <div className="hidden lg:flex flex-col gap-3">

          {/* HR Assistant */}
          <div style={{
            borderRadius: 20, border: "1px solid rgba(0,0,0,0.07)", overflow: "hidden",
            background: "linear-gradient(135deg, #FFF7ED, #FEF3C7)", boxShadow: "0 2px 12px rgba(0,0,0,0.05)",
          }}>
            <div style={{ padding: "16px 16px 0", textAlign: "center" }}>
              <p style={{ fontSize: 12, fontWeight: 800, color: "#111", fontFamily: "var(--font-jakarta)", marginBottom: 6 }}>HR Assistant</p>
              <p style={{ fontSize: 11, color: "#1B4332", lineHeight: 1.5 }}>All employee records are synced ☁️</p>
            </div>
            <div style={{ display: "flex", justifyContent: "center" }}>
              <Image src="/brand/documents/hr-assistant.png" alt="HR Assistant" width={180} height={140}
                style={{ objectFit: "contain" }} />
            </div>
            <div style={{ padding: "0 16px 16px", display: "flex", justifyContent: "center" }}>
              <span style={{
                display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 14px", borderRadius: 999,
                fontSize: 11, fontWeight: 700, color: "#166534", background: "rgba(22,101,52,0.1)",
                border: "1px solid rgba(22,101,52,0.15)",
              }}>
                <CheckCircle2 size={13} /> Up to date
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── BOTTOM: Document Coverage + Recent Uploads ───────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 px-4 md:px-5 pb-6 pt-3.5">
        {/* Document Coverage — % of members who've uploaded at least one document */}
        <div style={{ background: "#fff", borderRadius: 20, border: "1px solid rgba(0,0,0,0.07)", boxShadow: "0 2px 12px rgba(0,0,0,0.05)", padding: "18px", display: "flex", alignItems: "center", gap: 16 }}>
          <Image src="/brand/documents/hero-boy.png" alt="Documents" width={80} height={80} style={{ objectFit: "contain", flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div className="flex items-center justify-between mb-2">
              <p style={{ fontSize: 13, fontWeight: 800, color: "#111" }}>Document Coverage</p>
              <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20, background: "rgba(249,115,22,0.1)", color: "#EA580C" }}>{coveragePct}%</span>
            </div>
            <div style={{ height: 8, borderRadius: 99, background: "#F3F4F6", overflow: "hidden", marginBottom: 8 }}>
              <div style={{ height: "100%", width: `${coveragePct}%`, borderRadius: 99, background: "linear-gradient(90deg, #3B82F6, #0EA5E9)" }} />
            </div>
            <p style={{ fontSize: 11, color: "#1B4332" }}>{membersWithDocs} of {members.length} members have uploaded documents</p>
          </div>
        </div>

        {/* Recent Uploads */}
        <div style={{ background: "#fff", borderRadius: 20, border: "1px solid rgba(0,0,0,0.07)", boxShadow: "0 2px 12px rgba(0,0,0,0.05)", padding: "18px" }}>
          <div className="flex items-center justify-between mb-3">
            <p style={{ fontSize: 13, fontWeight: 800, color: "#111" }}>Recent Uploads</p>
            <button style={{ fontSize: 10, fontWeight: 700, color: "#de1a1a", background: "none", border: "none", cursor: "pointer" }}>
              <ChevronRight size={14} />
            </button>
          </div>
          <div style={{ display: "flex", gap: 10, overflowX: "auto" }}>
            {recentUploads.map(doc => {
              const badge = getExtBadge(doc.file_type, doc.name)
              return (
                <div key={doc.id} style={{ flexShrink: 0, textAlign: "center", minWidth: 70 }}>
                  <div style={{ width: 48, height: 48, borderRadius: 14, background: badge.bg, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 6px" }}>
                    <FileText size={20} style={{ color: badge.color }} />
                  </div>
                  <p style={{ fontSize: 10, fontWeight: 600, color: "#1B4332", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 72 }}>{doc.name}</p>
                  <p style={{ fontSize: 9, color: "#1B4332", marginTop: 2 }}>{formatDateShort(doc.created_at)}</p>
                </div>
              )
            })}
            {recentUploads.length === 0 && (
              <p style={{ fontSize: 12, color: "#1B4332" }}>No uploads yet</p>
            )}
          </div>
        </div>
      </div>

      {/* ── Upload Modal ─────────────────────────────────────────────────────── */}
      {showUpload && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 40, background: "rgba(0,0,0,0.55)", backdropFilter: "blur(6px)" }}
            onClick={() => setShowUpload(false)} />
          <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
            <div style={{ width: "100%", maxWidth: 440, borderRadius: 24, background: "#fff", boxShadow: "0 24px 80px rgba(0,0,0,0.2)", border: "1px solid rgba(222,26,26,0.12)", overflow: "hidden" }}>
              <div style={{ padding: "20px 24px 16px", borderBottom: "1px solid #F3F4F6", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div className="flex items-center gap-3">
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(222,26,26,0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Upload size={16} style={{ color: "#de1a1a" }} />
                  </div>
                  <div>
                    <h2 style={{ fontSize: 15, fontWeight: 800, color: "#111" }}>Upload Document</h2>
                    <p style={{ fontSize: 11, color: "#1B4332" }}>Add a new document to employee records</p>
                  </div>
                </div>
                <button onClick={() => setShowUpload(false)} style={{ width: 32, height: 32, borderRadius: 10, border: "1px solid #E5E7EB", background: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <X size={14} style={{ color: "#1B4332" }} />
                </button>
              </div>
              <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 14 }}>
                {[
                  { label: "Member *", el: (
                    <select value={uploadFor} onChange={e => setUploadFor(e.target.value)}
                      style={{ width: "100%", padding: "10px 12px", borderRadius: 12, fontSize: 13, border: "1px solid #E5E7EB", outline: "none", color: "#111", background: "#F9FAFB", boxSizing: "border-box" as const }}>
                      <option value="">Select member…</option>
                      {members.map(m => <option key={m.id} value={m.id}>{m.name} (#{m.employee_id})</option>)}
                    </select>
                  )},
                  { label: "Document Name *", el: (
                    <input placeholder="e.g. Offer Letter May 2025" value={docName} onChange={e => setDocName(e.target.value)}
                      style={{ width: "100%", padding: "10px 12px", borderRadius: 12, fontSize: 13, border: "1px solid #E5E7EB", outline: "none", color: "#111", background: "#F9FAFB", boxSizing: "border-box" as const }} />
                  )},
                  { label: "Document Type", el: (
                    <select value={docType} onChange={e => setDocType(e.target.value)}
                      style={{ width: "100%", padding: "10px 12px", borderRadius: 12, fontSize: 13, border: "1px solid #E5E7EB", outline: "none", color: "#111", background: "#F9FAFB", boxSizing: "border-box" as const }}>
                      {DOC_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  )},
                ].map(({ label, el }) => (
                  <div key={label}>
                    <label style={{ display: "block", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: "#1B4332", marginBottom: 6 }}>{label}</label>
                    {el}
                  </div>
                ))}
                <div>
                  <label style={{ display: "block", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: "#1B4332", marginBottom: 6 }}>File *</label>
                  <input ref={fileRef} type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" onChange={e => setFile(e.target.files?.[0] ?? null)} style={{ display: "none" }} />
                  <button onClick={() => fileRef.current?.click()}
                    style={{
                      width: "100%", padding: "20px 12px", borderRadius: 14, fontSize: 13, fontWeight: 600, cursor: "pointer",
                      border: `2px dashed ${file ? "#de1a1a" : "#E5E7EB"}`,
                      color: file ? "#de1a1a" : "#1B4332", background: file ? "rgba(222,26,26,0.04)" : "#F9FAFB",
                      display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                    }}>
                    <CloudUpload size={16} />
                    {file ? file.name : "Click to choose file (PDF, DOC, JPG, PNG)"}
                  </button>
                </div>
                {uploadError && (
                  <p style={{ fontSize: 12, padding: "10px 12px", borderRadius: 10, background: "rgba(222,26,26,0.06)", color: "#de1a1a" }}>{uploadError}</p>
                )}
              </div>
              <div style={{ padding: "0 24px 20px", display: "flex", gap: 10 }}>
                <button onClick={() => setShowUpload(false)}
                  style={{ flex: 1, padding: "11px", borderRadius: 12, fontSize: 13, fontWeight: 600, background: "#F9FAFB", color: "#1B4332", border: "1px solid #E5E7EB", cursor: "pointer" }}>
                  Cancel
                </button>
                <button onClick={handleUpload} disabled={isUploading || isPending}
                  style={{ flex: 1, padding: "11px", borderRadius: 12, fontSize: 13, fontWeight: 700, background: "linear-gradient(135deg, #de1a1a, #7F1D1D)", color: "#fff", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 7, opacity: (isUploading || isPending) ? 0.7 : 1 }}>
                  {(isUploading || isPending) && <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} />}
                  Upload Document
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
