"use client"

import { useState } from "react"
import { Camera, Scissors, Mic, CheckCircle, AlertCircle, ChevronDown } from "lucide-react"
import { submitFreelancerUpdate } from "@/lib/actions/freelancer-updates"

type WorkType = "shooting" | "editing" | "voice_over"

interface Freelancer { id: string; name: string; employee_id: string }
interface Client { id: string; business_name: string; client_name: string }

interface Props {
  freelancers: Freelancer[]
  clients: Client[]
  companyId: string
}

const WORK_TYPES: { id: WorkType; label: string; icon: React.ElementType; desc: string }[] = [
  { id: "shooting",   label: "Shooting",   icon: Camera,   desc: "Photo / video shoot" },
  { id: "editing",    label: "Editing",    icon: Scissors, desc: "Video edit / post-prod" },
  { id: "voice_over", label: "Voice Over", icon: Mic,      desc: "VO / narration" },
]

const VIDEO_TYPES = ["Short Form", "Long Form", "Reel", "YouTube", "Ad", "Corporate", "Other"]

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
}

const LABEL = {
  fontSize: 12,
  fontWeight: 600,
  color: "#4A5568",
  textTransform: "uppercase" as const,
  letterSpacing: "0.06em",
  marginBottom: 6,
  display: "block",
}

function Select({ label, value, onChange, options, placeholder }: {
  label: string
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
  placeholder?: string
}) {
  return (
    <div>
      <label style={LABEL}>{label}</label>
      <div style={{ position: "relative" }}>
        <select
          value={value}
          onChange={e => onChange(e.target.value)}
          style={{ ...INPUT, appearance: "none", paddingRight: 36, cursor: "pointer" }}
        >
          {placeholder && <option value="">{placeholder}</option>}
          {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <ChevronDown size={15} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", color: "#718096", pointerEvents: "none" }} />
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={LABEL}>{label}</label>
      {children}
    </div>
  )
}

function TextInput({ value, onChange, placeholder, type = "text" }: {
  value: string; onChange: (v: string) => void; placeholder?: string; type?: string
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      style={INPUT}
    />
  )
}

function NumberInput({ value, onChange, placeholder, step = "0.5", min = "0" }: {
  value: string; onChange: (v: string) => void; placeholder?: string; step?: string; min?: string
}) {
  return (
    <input
      type="number"
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      step={step}
      min={min}
      style={INPUT}
    />
  )
}

function TextArea({ value, onChange, placeholder, rows = 3 }: {
  value: string; onChange: (v: string) => void; placeholder?: string; rows?: number
}) {
  return (
    <textarea
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      style={{ ...INPUT, resize: "vertical", lineHeight: 1.5 }}
    />
  )
}

export default function FreelancerUpdateForm({ freelancers, clients, companyId }: Props) {
  const today = new Date().toISOString().split("T")[0]

  const [workType, setWorkType] = useState<WorkType>("shooting")
  const [freelancerId, setFreelancerId] = useState("")
  const [clientId, setClientId] = useState("")
  const [date, setDate] = useState(today)
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle")
  const [errorMsg, setErrorMsg] = useState("")

  // Shooting fields
  const [shootTitle, setShootTitle] = useState("")
  const [shootDuration, setShootDuration] = useState("")
  const [shootNotes, setShootNotes] = useState("")
  const [videoUploaded, setVideoUploaded] = useState(false)

  // Editing fields
  const [videoName, setVideoName] = useState("")
  const [videoType, setVideoType] = useState("")
  const [timeTaken, setTimeTaken] = useState("")
  const [driveLink, setDriveLink] = useState("")
  const [revisions, setRevisions] = useState("0")
  const [editNotes, setEditNotes] = useState("")

  // Voice Over fields
  const [scriptName, setScriptName] = useState("")
  const [voDuration, setVoDuration] = useState("")
  const [voNotes, setVoNotes] = useState("")

  const selectedClient = clients.find(c => c.id === clientId)
  const clientName = selectedClient
    ? (selectedClient.client_name || selectedClient.business_name)
    : ""

  function resetWorkFields() {
    setShootTitle(""); setShootDuration(""); setShootNotes(""); setVideoUploaded(false)
    setVideoName(""); setVideoType(""); setTimeTaken(""); setDriveLink(""); setRevisions("0"); setEditNotes("")
    setScriptName(""); setVoDuration(""); setVoNotes("")
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!freelancerId) { setErrorMsg("Please select a freelancer"); setStatus("error"); return }
    if (!clientId)     { setErrorMsg("Please select a client");     setStatus("error"); return }

    setStatus("loading")
    setErrorMsg("")

    let result: { success: boolean; error?: string }

    if (workType === "shooting") {
      result = await submitFreelancerUpdate({
        freelancer_id: freelancerId,
        client_id: clientId,
        client_name: clientName,
        date,
        work_type: "shooting",
        shoot_title: shootTitle,
        shoot_duration: parseFloat(shootDuration) || 0,
        shoot_notes: shootNotes || undefined,
        video_uploaded: videoUploaded,
      })
    } else if (workType === "editing") {
      result = await submitFreelancerUpdate({
        freelancer_id: freelancerId,
        client_id: clientId,
        client_name: clientName,
        date,
        work_type: "editing",
        video_name: videoName,
        video_type: videoType,
        time_taken: parseFloat(timeTaken) || 0,
        drive_link: driveLink || undefined,
        revisions: parseInt(revisions) || 0,
        edit_notes: editNotes || undefined,
      })
    } else {
      result = await submitFreelancerUpdate({
        freelancer_id: freelancerId,
        client_id: clientId,
        client_name: clientName,
        date,
        work_type: "voice_over",
        script_name: scriptName,
        vo_duration: voDuration,
        vo_notes: voNotes || undefined,
      })
    }

    if (result.success) {
      setStatus("success")
      resetWorkFields()
    } else {
      setStatus("error")
      setErrorMsg(result.error ?? "Something went wrong")
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>

        {/* Top selectors */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
          <Select
            label="Freelancer"
            value={freelancerId}
            onChange={setFreelancerId}
            placeholder="— Select freelancer —"
            options={freelancers.map(f => ({ value: f.id, label: `${f.name} (${f.employee_id})` }))}
          />
          <Select
            label="Client"
            value={clientId}
            onChange={setClientId}
            placeholder="— Select client —"
            options={clients.map(c => ({ value: c.id, label: c.client_name || c.business_name }))}
          />
          <Field label="Date">
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              max={today}
              style={INPUT}
            />
          </Field>
        </div>

        {/* Work type selector */}
        <div>
          <label style={LABEL}>Work Type</label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            {WORK_TYPES.map(({ id, label, icon: Icon, desc }) => {
              const active = workType === id
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => { setWorkType(id); resetWorkFields(); setStatus("idle") }}
                  style={{
                    padding: "14px 16px",
                    borderRadius: 12,
                    border: active ? "2px solid #2D6A4F" : "1.5px solid #E2E8F0",
                    background: active ? "rgba(45,106,79,0.07)" : "#FAFAFA",
                    cursor: "pointer",
                    textAlign: "left",
                    transition: "all 0.15s",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: 10,
                      background: active ? "#2D6A4F" : "#EDF2F7",
                      display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                    }}>
                      <Icon size={16} color={active ? "#FFFFFF" : "#718096"} />
                    </div>
                    <div>
                      <p style={{ fontSize: 13, fontWeight: 700, color: active ? "#2D6A4F" : "#2D3748", margin: 0 }}>{label}</p>
                      <p style={{ fontSize: 11, color: "#718096", margin: 0 }}>{desc}</p>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* Work-type specific fields */}
        {workType === "shooting" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: "20px", background: "#F7FAFC", borderRadius: 12, border: "1.5px solid #E2E8F0" }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: "#2D6A4F", textTransform: "uppercase", letterSpacing: "0.1em", margin: 0 }}>Shooting Details</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <Field label="Shoot Title">
                <TextInput value={shootTitle} onChange={setShootTitle} placeholder="e.g. Product launch shoot" />
              </Field>
              <Field label="Duration (hours)">
                <NumberInput value={shootDuration} onChange={setShootDuration} placeholder="e.g. 3.5" step="0.5" />
              </Field>
            </div>
            <Field label="Notes (optional)">
              <TextArea value={shootNotes} onChange={setShootNotes} placeholder="Any notes about the shoot..." />
            </Field>
            <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={videoUploaded}
                onChange={e => setVideoUploaded(e.target.checked)}
                style={{ width: 16, height: 16, accentColor: "#2D6A4F" }}
              />
              <span style={{ fontSize: 13, fontWeight: 600, color: "#4A5568" }}>Video uploaded to drive</span>
            </label>
          </div>
        )}

        {workType === "editing" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: "20px", background: "#F7FAFC", borderRadius: 12, border: "1.5px solid #E2E8F0" }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: "#2D6A4F", textTransform: "uppercase", letterSpacing: "0.1em", margin: 0 }}>Editing Details</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <Field label="Video Name">
                <TextInput value={videoName} onChange={setVideoName} placeholder="e.g. Client_Brand_Video_v1" />
              </Field>
              <Select
                label="Video Type"
                value={videoType}
                onChange={setVideoType}
                placeholder="— Select type —"
                options={VIDEO_TYPES.map(v => ({ value: v, label: v }))}
              />
              <Field label="Time Taken (hours)">
                <NumberInput value={timeTaken} onChange={setTimeTaken} placeholder="e.g. 4.5" step="0.5" />
              </Field>
              <Field label="Revisions">
                <NumberInput value={revisions} onChange={setRevisions} placeholder="0" step="1" min="0" />
              </Field>
            </div>
            <Field label="Drive Link (optional)">
              <TextInput value={driveLink} onChange={setDriveLink} placeholder="https://drive.google.com/..." type="url" />
            </Field>
            <Field label="Notes (optional)">
              <TextArea value={editNotes} onChange={setEditNotes} placeholder="Any notes about the edit..." />
            </Field>
          </div>
        )}

        {workType === "voice_over" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: "20px", background: "#F7FAFC", borderRadius: 12, border: "1.5px solid #E2E8F0" }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: "#2D6A4F", textTransform: "uppercase", letterSpacing: "0.1em", margin: 0 }}>Voice Over Details</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <Field label="Script Name">
                <TextInput value={scriptName} onChange={setScriptName} placeholder="e.g. Brand promo script" />
              </Field>
              <Field label="Duration">
                <TextInput value={voDuration} onChange={setVoDuration} placeholder="e.g. 2 min 30 sec" />
              </Field>
            </div>
            <Field label="Notes (optional)">
              <TextArea value={voNotes} onChange={setVoNotes} placeholder="Any notes about the recording..." />
            </Field>
          </div>
        )}

        {/* Status */}
        {status === "success" && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 16px", background: "rgba(45,106,79,0.08)", borderRadius: 10, border: "1px solid rgba(45,106,79,0.2)" }}>
            <CheckCircle size={18} color="#2D6A4F" />
            <span style={{ fontSize: 14, fontWeight: 600, color: "#2D6A4F" }}>Update logged successfully!</span>
          </div>
        )}
        {status === "error" && errorMsg && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 16px", background: "rgba(239,68,68,0.07)", borderRadius: 10, border: "1px solid rgba(239,68,68,0.2)" }}>
            <AlertCircle size={18} color="#EF4444" />
            <span style={{ fontSize: 14, fontWeight: 600, color: "#EF4444" }}>{errorMsg}</span>
          </div>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={status === "loading"}
          style={{
            padding: "13px 24px",
            borderRadius: 12,
            border: "none",
            background: status === "loading" ? "#718096" : "#2D6A4F",
            color: "#FFFFFF",
            fontSize: 14,
            fontWeight: 700,
            cursor: status === "loading" ? "not-allowed" : "pointer",
            letterSpacing: "0.04em",
            transition: "background 0.15s",
          }}
        >
          {status === "loading" ? "Saving…" : "Log Update"}
        </button>
      </div>
    </form>
  )
}
