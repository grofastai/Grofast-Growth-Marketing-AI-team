"use client"

import { useState } from "react"
import { Users, Plus, X, CheckCircle, AlertCircle, Star } from "lucide-react"
import { addFreelancer } from "@/lib/actions/freelancer-members"

interface Freelancer {
  id: string
  name: string
  employee_id: string
  phone: string | null
  specialty: string | null
  status: string
  created_at: string
  vo_number: number | null
  vo_price_per_min: number | null
  vo_free_time: number | null
  vo_total_price: number | null
  vo_pending: number | null
  vo_top_rank: boolean | null
  vo_video1_name: string | null
  vo_video1_pay: string | null
  vo_video2_name: string | null
  vo_video2_pay: string | null
  vo_video3_name: string | null
  vo_video3_pay: string | null
  vo_video4_name: string | null
  vo_video4_pay: string | null
}

interface Props {
  freelancers: Freelancer[]
  companyId: string
}

const INPUT: React.CSSProperties = {
  width: "100%",
  padding: "10px 14px",
  borderRadius: 10,
  border: "1.5px solid #E2E8F0",
  fontSize: 13,
  background: "#FAFAFA",
  color: "#1A202C",
  outline: "none",
  fontFamily: "inherit",
  boxSizing: "border-box",
}

const LABEL: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: "#4A5568",
  textTransform: "uppercase",
  letterSpacing: "0.07em",
  marginBottom: 5,
  display: "block",
}

const NUM_INPUT: React.CSSProperties = {
  ...INPUT,
  padding: "9px 12px",
}

function PayBtn({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} style={{
      padding: "7px 10px", borderRadius: 7, border: "1.5px solid", fontSize: 10, fontWeight: 700,
      cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.05em", whiteSpace: "nowrap",
      borderColor: active ? (label === "PAID" ? "#2D6A4F" : "#EF4444") : "#E2E8F0",
      background: active ? (label === "PAID" ? "rgba(45,106,79,0.1)" : "rgba(239,68,68,0.07)") : "#FAFAFA",
      color: active ? (label === "PAID" ? "#2D6A4F" : "#EF4444") : "#A0AEC0",
    }}>
      {label === "PAID" ? "✓ Paid" : "Unpaid"}
    </button>
  )
}

export default function FreelancerMembersClient({ freelancers: initial, companyId }: Props) {
  const [freelancers, setFreelancers] = useState(initial)
  const [showAdd, setShowAdd] = useState(false)
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle")
  const [errorMsg, setErrorMsg] = useState("")

  // Basic fields
  const [name, setName] = useState("")
  const [specialty, setSpecialty] = useState("")

  // VO rate card
  const [voPhone, setVoPhone] = useState("")        // Phone Number (was "Number")
  const [voPricePerMin, setVoPricePerMin] = useState("")
  const [voFreeTime, setVoFreeTime] = useState("")  // text box
  const [voTotalPrice, setVoTotalPrice] = useState("")
  const [voPending, setVoPending] = useState("0")
  const [voTopRank, setVoTopRank] = useState(false)

  function resetForm() {
    setName(""); setSpecialty("")
    setVoPhone(""); setVoPricePerMin(""); setVoFreeTime(""); setVoTotalPrice(""); setVoPending("0"); setVoTopRank(false)
    setStatus("idle"); setErrorMsg("")
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setStatus("loading")
    setErrorMsg("")
    const result = await addFreelancer({
      name, phone: voPhone, specialty, company_id: companyId,
      vo_price_per_min: voPricePerMin ? parseFloat(voPricePerMin) : undefined,
      vo_total_price:   voTotalPrice ? parseFloat(voTotalPrice) : undefined,
      vo_pending:       parseFloat(voPending) || 0,
      vo_top_rank:      voTopRank,
    })
    if (result.success && result.freelancer) {
      setFreelancers(prev => [...prev, result.freelancer!])
      setStatus("success")
      setTimeout(() => { setShowAdd(false); resetForm() }, 1500)
    } else {
      setStatus("error")
      setErrorMsg(result.error ?? "Failed to add freelancer")
    }
  }

  const TABLE_HEADERS = ["VO Artist", "Phone", "₹/Min", "Free Time", "Total", "Pending", "Rank", "Video 1", "Pay", "Video 2", "Pay", "Video 3", "Pay", "Video 4", "Pay"]

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
        <button onClick={() => { setShowAdd(true); resetForm() }}
          style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 18px", background: "#2D6A4F", color: "#FFFFFF", borderRadius: 10, border: "none", cursor: "pointer", fontSize: 14, fontWeight: 700 }}>
          <Plus size={16} /> Add Freelancer
        </button>
      </div>

      {/* Table */}
      <div style={{ background: "#FFFFFF", borderRadius: 16, border: "1px solid #E2E8F0", overflow: "hidden" }}>
        {freelancers.length === 0 ? (
          <div style={{ padding: "60px 22px", textAlign: "center" }}>
            <Users size={40} color="#CBD5E0" style={{ margin: "0 auto 12px" }} />
            <p style={{ fontSize: 15, fontWeight: 700, color: "#4A5568", margin: 0 }}>No freelancers yet</p>
            <p style={{ fontSize: 13, color: "#A0AEC0", margin: "4px 0 0" }}>Add freelancers to start logging their work</p>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1100 }}>
              <thead>
                <tr style={{ background: "#F7FAFC" }}>
                  {TABLE_HEADERS.map(h => (
                    <th key={h} style={{ padding: "11px 14px", textAlign: "left", fontSize: 10, fontWeight: 700, color: "#718096", textTransform: "uppercase", letterSpacing: "0.07em", borderBottom: "1px solid #E2E8F0", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {freelancers.map((f, i) => (
                  <tr key={f.id} style={{ borderBottom: i < freelancers.length - 1 ? "1px solid #F7FAFC" : "none" }}>
                    <td style={{ padding: "12px 14px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ width: 30, height: 30, borderRadius: "50%", background: "rgba(45,106,79,0.12)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: "#2D6A4F" }}>{f.name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()}</span>
                        </div>
                        <div>
                          <p style={{ fontSize: 13, fontWeight: 600, color: "#2D3748", margin: 0, whiteSpace: "nowrap" }}>{f.name}</p>
                          {f.specialty && <p style={{ fontSize: 11, color: "#718096", margin: 0 }}>{f.specialty}</p>}
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: "12px 14px", fontSize: 13, color: "#4A5568", whiteSpace: "nowrap" }}>{f.phone ?? "—"}</td>
                    <td style={{ padding: "12px 14px", fontSize: 13, color: "#2D3748", whiteSpace: "nowrap" }}>{f.vo_price_per_min != null ? `₹${f.vo_price_per_min}` : "—"}</td>
                    <td style={{ padding: "12px 14px", fontSize: 13, color: "#4A5568" }}>{f.vo_free_time != null ? `${f.vo_free_time} min` : "—"}</td>
                    <td style={{ padding: "12px 14px", fontSize: 13, fontWeight: 700, color: "#2D6A4F", whiteSpace: "nowrap" }}>{f.vo_total_price != null ? `₹${f.vo_total_price}` : "—"}</td>
                    <td style={{ padding: "12px 14px", fontSize: 13, fontWeight: 700, color: f.vo_pending ? "#EF4444" : "#A0AEC0", whiteSpace: "nowrap" }}>{f.vo_pending != null ? `₹${f.vo_pending}` : "—"}</td>
                    <td style={{ padding: "12px 14px", textAlign: "center" }}>
                      {f.vo_top_rank ? <Star size={16} color="#F59E0B" fill="#F59E0B" /> : <span style={{ fontSize: 12, color: "#CBD5E0" }}>—</span>}
                    </td>
                    {[1, 2, 3, 4].map(n => {
                      const vName = f[`vo_video${n}_name` as keyof Freelancer] as string | null
                      const vPay  = f[`vo_video${n}_pay`  as keyof Freelancer] as string | null
                      return [
                        <td key={`v${n}`} style={{ padding: "12px 14px", fontSize: 12, color: "#2D3748", whiteSpace: "nowrap" }}>{vName || "—"}</td>,
                        <td key={`p${n}`} style={{ padding: "12px 14px" }}>
                          {vName
                            ? <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 6, background: vPay === "paid" ? "rgba(45,106,79,0.1)" : "rgba(239,68,68,0.07)", color: vPay === "paid" ? "#2D6A4F" : "#EF4444", textTransform: "uppercase" }}>{vPay}</span>
                            : <span style={{ fontSize: 12, color: "#CBD5E0" }}>—</span>}
                        </td>
                      ]
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add modal */}
      {showAdd && (
        <div style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.45)", backdropFilter: "blur(4px)" }} onClick={() => { setShowAdd(false); resetForm() }} />
          <div style={{ position: "relative", background: "#FFFFFF", borderRadius: 20, padding: 28, width: "100%", maxWidth: 600, boxShadow: "0 20px 60px rgba(0,0,0,0.18)", maxHeight: "92vh", overflowY: "auto" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 22 }}>
              <h3 style={{ fontSize: 17, fontWeight: 800, color: "#1A202C", margin: 0 }}>Add Voice Over Artist</h3>
              <button onClick={() => { setShowAdd(false); resetForm() }} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}>
                <X size={18} color="#718096" />
              </button>
            </div>

            <form onSubmit={handleAdd} style={{ display: "flex", flexDirection: "column", gap: 20 }}>

              {/* Basic info */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={LABEL}>Full Name *</label>
                  <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Ravi Kumar" required style={INPUT} />
                </div>
                <div>
                  <label style={LABEL}>Specialty</label>
                  <input value={specialty} onChange={e => setSpecialty(e.target.value)} placeholder="e.g. Voice Artist" style={INPUT} />
                </div>
              </div>

              {/* VO Rate Card */}
              <div style={{ background: "#F7FAFC", borderRadius: 12, padding: "16px 18px", border: "1.5px solid #E2E8F0" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: "#2D6A4F", textTransform: "uppercase", letterSpacing: "0.1em", margin: 0 }}>Voice Over Details</p>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                    <div onClick={() => setVoTopRank(v => !v)} style={{ width: 36, height: 20, borderRadius: 10, position: "relative", cursor: "pointer", transition: "background 0.2s", background: voTopRank ? "#F59E0B" : "#CBD5E0" }}>
                      <div style={{ position: "absolute", top: 2, left: voTopRank ? 17 : 2, width: 16, height: 16, borderRadius: "50%", background: "#FFFFFF", transition: "left 0.2s" }} />
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 700, color: voTopRank ? "#F59E0B" : "#718096" }}>⭐ Top Rank</span>
                  </label>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr", gap: 10 }}>
                  <div>
                    <label style={LABEL}>Phone Number</label>
                    <input type="text" value={voPhone} onChange={e => setVoPhone(e.target.value)} placeholder="+91 98765 43210" style={NUM_INPUT} />
                  </div>
                  <div>
                    <label style={LABEL}>Price / Min (₹)</label>
                    <input type="number" min="0" step="0.5" value={voPricePerMin} onChange={e => setVoPricePerMin(e.target.value)} placeholder="e.g. 25" style={NUM_INPUT} />
                  </div>
                  <div>
                    <label style={LABEL}>Free Time</label>
                    <input type="text" value={voFreeTime} onChange={e => setVoFreeTime(e.target.value)} placeholder="e.g. 2 min" style={NUM_INPUT} />
                  </div>
                  <div>
                    <label style={LABEL}>Total Price (₹)</label>
                    <input type="number" min="0" step="0.5" value={voTotalPrice} onChange={e => setVoTotalPrice(e.target.value)} placeholder="e.g. 500" style={{ ...NUM_INPUT, fontWeight: 700 }} />
                  </div>
                  <div>
                    <label style={LABEL}>Pending (₹)</label>
                    <input type="number" min="0" step="0.5" value={voPending} onChange={e => setVoPending(e.target.value)} placeholder="0" style={NUM_INPUT} />
                  </div>
                </div>
              </div>

              {status === "success" && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", background: "rgba(45,106,79,0.08)", borderRadius: 8 }}>
                  <CheckCircle size={16} color="#2D6A4F" />
                  <span style={{ fontSize: 13, fontWeight: 600, color: "#2D6A4F" }}>Freelancer added!</span>
                </div>
              )}
              {status === "error" && errorMsg && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", background: "rgba(239,68,68,0.07)", borderRadius: 8 }}>
                  <AlertCircle size={16} color="#EF4444" />
                  <span style={{ fontSize: 13, fontWeight: 600, color: "#EF4444" }}>{errorMsg}</span>
                </div>
              )}

              <button type="submit" disabled={status === "loading"}
                style={{ padding: "13px", borderRadius: 10, border: "none", background: status === "loading" ? "#718096" : "#2D6A4F", color: "#FFFFFF", fontSize: 14, fontWeight: 700, cursor: status === "loading" ? "not-allowed" : "pointer" }}>
                {status === "loading" ? "Adding…" : "Add Freelancer"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
