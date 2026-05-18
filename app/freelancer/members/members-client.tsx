"use client"

import { useState } from "react"
import { Users, Plus, X, CheckCircle, AlertCircle } from "lucide-react"
import { addFreelancer } from "@/lib/actions/freelancer-members"

interface Freelancer {
  id: string
  name: string
  employee_id: string
  email: string | null
  phone: string | null
  specialty: string | null
  status: string
  created_at: string
}

interface Props {
  freelancers: Freelancer[]
  companyId: string
}

const INPUT = {
  width: "100%",
  padding: "10px 14px",
  borderRadius: 10,
  border: "1.5px solid #E2E8F0",
  fontSize: 14,
  background: "#FAFAFA",
  color: "#1A202C",
  outline: "none",
  fontFamily: "inherit",
  boxSizing: "border-box" as const,
}

const LABEL = {
  fontSize: 12,
  fontWeight: 600 as const,
  color: "#4A5568",
  textTransform: "uppercase" as const,
  letterSpacing: "0.06em",
  marginBottom: 6,
  display: "block",
}

export default function FreelancerMembersClient({ freelancers: initial, companyId }: Props) {
  const [freelancers, setFreelancers] = useState(initial)
  const [showAdd, setShowAdd] = useState(false)
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle")
  const [errorMsg, setErrorMsg] = useState("")

  const [name, setName] = useState("")
  const [employeeId, setEmployeeId] = useState("")
  const [phone, setPhone] = useState("")
  const [specialty, setSpecialty] = useState("")
  const [password, setPassword] = useState("")

  function resetForm() {
    setName(""); setEmployeeId(""); setPhone(""); setSpecialty(""); setPassword("")
    setStatus("idle"); setErrorMsg("")
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setStatus("loading")
    setErrorMsg("")
    const result = await addFreelancer({ name, employee_id: employeeId, phone, specialty, password, company_id: companyId })
    if (result.success && result.freelancer) {
      setFreelancers(prev => [...prev, result.freelancer!])
      setStatus("success")
      setTimeout(() => { setShowAdd(false); resetForm() }, 1500)
    } else {
      setStatus("error")
      setErrorMsg(result.error ?? "Failed to add freelancer")
    }
  }

  return (
    <div>
      {/* Add button */}
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
        <button
          onClick={() => { setShowAdd(true); resetForm() }}
          style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 18px", background: "#2D6A4F", color: "#FFFFFF", borderRadius: 10, border: "none", cursor: "pointer", fontSize: 14, fontWeight: 700 }}
        >
          <Plus size={16} />
          Add Freelancer
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
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#F7FAFC" }}>
                  {["Name", "What They Do", "Employee ID", "Phone", "Status", "Joined"].map(h => (
                    <th key={h} style={{ padding: "12px 18px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "#718096", textTransform: "uppercase", letterSpacing: "0.07em", borderBottom: "1px solid #E2E8F0", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {freelancers.map((f, i) => (
                  <tr key={f.id} style={{ borderBottom: i < freelancers.length - 1 ? "1px solid #F7FAFC" : "none" }}>
                    <td style={{ padding: "14px 18px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{ width: 34, height: 34, borderRadius: "50%", background: "rgba(45,106,79,0.12)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: "#2D6A4F" }}>
                            {f.name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()}
                          </span>
                        </div>
                        <span style={{ fontSize: 14, fontWeight: 600, color: "#2D3748", whiteSpace: "nowrap" }}>{f.name}</span>
                      </div>
                    </td>
                    <td style={{ padding: "14px 18px" }}>
                      {f.specialty
                        ? <span style={{ fontSize: 12, fontWeight: 600, padding: "3px 10px", borderRadius: 20, background: "rgba(59,130,246,0.08)", color: "#3B82F6" }}>{f.specialty}</span>
                        : <span style={{ fontSize: 13, color: "#CBD5E0" }}>—</span>}
                    </td>
                    <td style={{ padding: "14px 18px", fontSize: 13, color: "#4A5568", fontFamily: "monospace" }}>{f.employee_id}</td>
                    <td style={{ padding: "14px 18px", fontSize: 13, color: "#718096", whiteSpace: "nowrap" }}>{f.phone ?? "—"}</td>
                    <td style={{ padding: "14px 18px" }}>
                      <span style={{
                        fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20,
                        background: f.status === "active" ? "rgba(45,106,79,0.1)" : "rgba(239,68,68,0.08)",
                        color: f.status === "active" ? "#2D6A4F" : "#EF4444",
                        textTransform: "uppercase", letterSpacing: "0.06em",
                      }}>{f.status}</span>
                    </td>
                    <td style={{ padding: "14px 18px", fontSize: 12, color: "#A0AEC0", whiteSpace: "nowrap" }}>
                      {new Date(f.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                    </td>
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
          <div style={{ position: "relative", background: "#FFFFFF", borderRadius: 20, padding: 28, width: "100%", maxWidth: 460, boxShadow: "0 20px 60px rgba(0,0,0,0.18)", maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
              <h3 style={{ fontSize: 17, fontWeight: 800, color: "#1A202C", margin: 0 }}>Add Freelancer</h3>
              <button onClick={() => { setShowAdd(false); resetForm() }} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}>
                <X size={18} color="#718096" />
              </button>
            </div>
            <form onSubmit={handleAdd} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <label style={LABEL}>Full Name</label>
                <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Ravi Kumar" required style={INPUT} />
              </div>
              <div>
                <label style={LABEL}>What They Do</label>
                <input value={specialty} onChange={e => setSpecialty(e.target.value)} placeholder="e.g. Video Editor, Photographer, Voice Artist" style={INPUT} />
              </div>
              <div>
                <label style={LABEL}>Employee ID</label>
                <input value={employeeId} onChange={e => setEmployeeId(e.target.value)} placeholder="e.g. FL001" required style={INPUT} />
              </div>
              <div>
                <label style={LABEL}>Phone (optional)</label>
                <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+91 98765 43210" style={INPUT} />
              </div>
              <div>
                <label style={LABEL}>Password</label>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Set a login password" required minLength={6} style={INPUT} />
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

              <button
                type="submit"
                disabled={status === "loading"}
                style={{ padding: "12px", borderRadius: 10, border: "none", background: status === "loading" ? "#718096" : "#2D6A4F", color: "#FFFFFF", fontSize: 14, fontWeight: 700, cursor: status === "loading" ? "not-allowed" : "pointer" }}
              >
                {status === "loading" ? "Adding…" : "Add Freelancer"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
