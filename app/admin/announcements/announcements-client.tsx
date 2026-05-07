"use client"

import { useActionState, useTransition, useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Megaphone, Pin, Trash2, Loader2, Plus, X, Bell } from "lucide-react"
import { createAnnouncement, deleteAnnouncement, togglePin } from "@/lib/actions/announcements"
import { sendPushNotification } from "@/lib/actions/push"

interface Announcement {
  id: string
  title: string
  message: string
  pinned: boolean
  created_at: string
  users: { name: string } | null
}

type ActionState = { error: string } | { success: true } | null

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

export default function AnnouncementsClient({ announcements }: { announcements: Announcement[] }) {
  const [showForm, setShowForm] = useState(false)
  const [showPush, setShowPush] = useState(false)
  const [pushTitle, setPushTitle] = useState("")
  const [pushBody, setPushBody] = useState("")
  const [pushResult, setPushResult] = useState<string | null>(null)
  const [pushBusy, setPushBusy] = useState(false)
  const [pinned, setPinned] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const router = useRouter()

  async function handleSendPush() {
    if (!pushTitle.trim() || !pushBody.trim()) return
    setPushBusy(true)
    const res = await sendPushNotification(pushTitle.trim(), pushBody.trim())
    if ("error" in res) {
      setPushResult(`Error: ${res.error}`)
    } else {
      setPushResult(`Sent to ${res.sent} device${res.sent !== 1 ? "s" : ""}`)
      setPushTitle(""); setPushBody("")
    }
    setPushBusy(false)
  }

  const [state, action, formPending] = useActionState<ActionState, FormData>(createAnnouncement, null)

  useEffect(() => {
    if (state && 'success' in state) router.refresh()
  }, [state, router])

  async function handleDelete(id: string) {
    setDeletingId(id)
    startTransition(async () => {
      await deleteAnnouncement(id)
      setDeletingId(null)
    })
  }

  async function handlePin(id: string, currentPinned: boolean) {
    startTransition(async () => {
      await togglePin(id, !currentPinned)
    })
  }

  return (
    <div className="p-8 max-w-[1400px]">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="gradient-heading text-[32px] leading-tight" style={{ fontFamily: "var(--font-jakarta)", fontWeight: 800 }}>
            Announcements
          </h1>
          <p className="text-sm mt-1 font-sans" style={{ color: "#6B7280" }}>Post updates and notices to your team.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowPush(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-semibold font-sans transition-all"
            style={{ background: "#FFFFFF", border: "1px solid #E5E7EB", color: "#374151" }}
          >
            <Bell size={14} />
            Send Push
          </button>
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-semibold font-sans text-white transition-all"
            style={{ background: "linear-gradient(135deg, #de1a1a, #7F1D1D)", boxShadow: "0 4px 16px rgba(222,26,26,0.25)" }}
          >
            <Plus size={15} />
            New Announcement
          </button>
        </div>
      </div>

      {/* Push Notification Modal */}
      {showPush && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}>
          <div className="w-full max-w-md rounded-2xl p-6" style={{ background: "#FFFFFF", border: "1px solid #E5E7EB" }}>
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <Bell size={18} style={{ color: "#de1a1a" }} />
                <h2 className="text-[16px] font-bold" style={{ color: "#111111" }}>Send Push Notification</h2>
              </div>
              <button onClick={() => { setShowPush(false); setPushResult(null) }}><X size={18} style={{ color: "#6B7280" }} /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-[0.15em] mb-1.5 block" style={{ color: "#83858c" }}>Title</label>
                <input value={pushTitle} onChange={e => setPushTitle(e.target.value)} placeholder="e.g. Meeting at 4PM"
                  className="w-full px-3 py-2.5 rounded-xl text-[13px] outline-none"
                  style={{ background: "#F9FAFB", border: "1px solid #E5E7EB", color: "#111111" }} />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-[0.15em] mb-1.5 block" style={{ color: "#83858c" }}>Message</label>
                <textarea value={pushBody} onChange={e => setPushBody(e.target.value)} rows={3} placeholder="Notification message..."
                  className="w-full px-3 py-2.5 rounded-xl text-[13px] outline-none resize-none"
                  style={{ background: "#F9FAFB", border: "1px solid #E5E7EB", color: "#111111" }} />
              </div>
              {pushResult && (
                <p className="text-[12px] px-3 py-2 rounded-lg"
                  style={{ background: pushResult.startsWith("Error") ? "rgba(222,26,26,0.06)" : "rgba(22,163,74,0.06)", color: pushResult.startsWith("Error") ? "#de1a1a" : "#16A34A" }}>
                  {pushResult}
                </p>
              )}
              <div className="flex gap-3 pt-1">
                <button onClick={() => { setShowPush(false); setPushResult(null) }}
                  className="flex-1 py-2.5 rounded-xl text-[13px] font-semibold"
                  style={{ background: "#F9FAFB", border: "1px solid #E5E7EB", color: "#6B7280" }}>
                  Cancel
                </button>
                <button onClick={handleSendPush} disabled={pushBusy || !pushTitle.trim() || !pushBody.trim()}
                  className="flex-1 py-2.5 rounded-xl text-[13px] font-bold text-white flex items-center justify-center gap-2 disabled:opacity-50"
                  style={{ background: "linear-gradient(135deg, #de1a1a, #7F1D1D)" }}>
                  {pushBusy ? <Loader2 size={13} className="animate-spin" /> : <Bell size={13} />}
                  Send to All Devices
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}>
          <div className="w-full max-w-lg rounded-2xl p-6" style={{ background: "#FFFFFF", border: "1px solid rgba(222,26,26,0.15)" }}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-[18px] font-bold" style={{ fontFamily: "var(--font-jakarta)", color: "#111111" }}>New Announcement</h2>
              <button onClick={() => setShowForm(false)}><X size={18} style={{ color: "#6B7280" }} /></button>
            </div>

            <form action={(fd) => {
              fd.set("pinned", pinned ? "true" : "false")
              startTransition(() => {
                action(fd)
                setShowForm(false)
              })
            }} className="space-y-4">
              <div>
                <label className="text-[12px] font-semibold font-sans uppercase tracking-wider mb-1.5 block" style={{ color: "#6B7280" }}>Title</label>
                <input name="title" required maxLength={120} placeholder="Announcement title..."
                  className="w-full px-3 py-2.5 rounded-xl text-[13px] font-sans outline-none"
                  style={{ background: "#fbf5f7", border: "1px solid #E5E7EB", color: "#111111" }} />
              </div>
              <div>
                <label className="text-[12px] font-semibold font-sans uppercase tracking-wider mb-1.5 block" style={{ color: "#6B7280" }}>Message</label>
                <textarea name="message" required rows={4} placeholder="Write your announcement..."
                  className="w-full px-3 py-2.5 rounded-xl text-[13px] font-sans outline-none resize-none"
                  style={{ background: "#fbf5f7", border: "1px solid #E5E7EB", color: "#111111" }} />
              </div>
              <label className="flex items-center gap-3 cursor-pointer">
                <div className="relative">
                  <input type="checkbox" className="sr-only" checked={pinned} onChange={(e) => setPinned(e.target.checked)} />
                  <div className="w-10 h-5 rounded-full transition-all" style={{ background: pinned ? "#de1a1a" : "rgba(0,0,0,0.06)" }}>
                    <div className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-all" style={{ transform: pinned ? "translateX(20px)" : "translateX(0)" }} />
                  </div>
                </div>
                <span className="text-[13px] font-sans" style={{ color: "#83858c" }}>Pin this announcement</span>
              </label>

              {state && 'error' in state && (
                <p className="text-[12px] font-sans" style={{ color: "#FF6B57" }}>{state.error}</p>
              )}

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)}
                  className="flex-1 py-2.5 rounded-xl text-[13px] font-semibold font-sans"
                  style={{ background: "#fbf5f7", border: "1px solid #E5E7EB", color: "#83858c" }}>
                  Cancel
                </button>
                <button type="submit" disabled={formPending}
                  className="flex-1 py-2.5 rounded-xl text-[13px] font-semibold font-sans text-white flex items-center justify-center gap-2"
                  style={{ background: "linear-gradient(135deg, #de1a1a, #7F1D1D)" }}>
                  {formPending ? <Loader2 size={14} className="animate-spin" /> : null}
                  Post Announcement
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Announcements List */}
      {announcements.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 rounded-2xl" style={{ background: "rgba(0,0,0,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
          <Megaphone size={40} style={{ color: "rgba(0,0,0,0.06)" }} className="mb-3" />
          <p className="text-[14px] font-semibold font-sans" style={{ color: "#6B7280" }}>No announcements yet</p>
          <p className="text-[12px] font-sans mt-1" style={{ color: "#4B5563" }}>Post your first announcement to notify the team.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {announcements.map((ann) => {
            const creator = Array.isArray(ann.users) ? ann.users[0] : ann.users
            return (
              <div key={ann.id} className="rounded-2xl p-5"
                style={{
                  background: ann.pinned ? "rgba(222,26,26,0.06)" : "rgba(0,0,0,0.02)",
                  border: ann.pinned ? "1px solid rgba(222,26,26,0.2)" : "1px solid #E5E7EB",
                }}>
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5"
                    style={{ background: "rgba(222,26,26,0.08)", border: "1px solid rgba(222,26,26,0.15)" }}>
                    <Megaphone size={15} style={{ color: "#de1a1a" }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      {ann.pinned && (
                        <span className="flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ background: "rgba(222,26,26,0.15)", color: "#de1a1a" }}>
                          <Pin size={10} /> Pinned
                        </span>
                      )}
                      <h3 className="text-[15px] font-bold font-sans" style={{ color: "#111111" }}>{ann.title}</h3>
                    </div>
                    <p className="text-[13px] font-sans leading-relaxed mb-2" style={{ color: "#83858c" }}>{ann.message}</p>
                    <p className="text-[11px] font-sans" style={{ color: "#6B7280" }}>
                      By {creator?.name ?? "Admin"} · {timeAgo(ann.created_at)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => handlePin(ann.id, ann.pinned)}
                      disabled={isPending}
                      className="w-8 h-8 rounded-lg flex items-center justify-center transition-all hover:bg-white/5"
                      title={ann.pinned ? "Unpin" : "Pin"}
                    >
                      <Pin size={14} style={{ color: ann.pinned ? "#de1a1a" : "#6B7280" }} />
                    </button>
                    <button
                      onClick={() => handleDelete(ann.id)}
                      disabled={deletingId === ann.id}
                      className="w-8 h-8 rounded-lg flex items-center justify-center transition-all hover:bg-red-500/10"
                    >
                      {deletingId === ann.id ? <Loader2 size={14} className="animate-spin" style={{ color: "#FF6B57" }} /> : <Trash2 size={14} style={{ color: "#FF6B57" }} />}
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
