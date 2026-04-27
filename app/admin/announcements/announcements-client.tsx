"use client"

import { useActionState, useTransition, useState } from "react"
import { Megaphone, Pin, Trash2, Loader2, Plus, X } from "lucide-react"
import { createAnnouncement, deleteAnnouncement, togglePin } from "@/lib/actions/announcements"

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
  const [pinned, setPinned] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const [state, action, formPending] = useActionState<ActionState, FormData>(createAnnouncement, null)

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
          <h1 className="text-[32px] leading-tight" style={{ fontFamily: "var(--font-jakarta)", fontWeight: 800, color: "#E6EDF3" }}>
            Announcements
          </h1>
          <p className="text-sm mt-1 font-sans" style={{ color: "#6B7280" }}>Post updates and notices to your team.</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-semibold font-sans text-white transition-all"
          style={{ background: "linear-gradient(135deg, #FF6B57, #E85A45)", boxShadow: "0 4px 16px rgba(255,107,87,0.25)" }}
        >
          <Plus size={15} />
          New Announcement
        </button>
      </div>

      {/* Create Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}>
          <div className="w-full max-w-lg rounded-2xl p-6" style={{ background: "#111827", border: "1px solid rgba(255,255,255,0.08)" }}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-[18px] font-bold" style={{ fontFamily: "var(--font-jakarta)", color: "#E6EDF3" }}>New Announcement</h2>
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
                  style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#E6EDF3" }} />
              </div>
              <div>
                <label className="text-[12px] font-semibold font-sans uppercase tracking-wider mb-1.5 block" style={{ color: "#6B7280" }}>Message</label>
                <textarea name="message" required rows={4} placeholder="Write your announcement..."
                  className="w-full px-3 py-2.5 rounded-xl text-[13px] font-sans outline-none resize-none"
                  style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#E6EDF3" }} />
              </div>
              <label className="flex items-center gap-3 cursor-pointer">
                <div className="relative">
                  <input type="checkbox" className="sr-only" checked={pinned} onChange={(e) => setPinned(e.target.checked)} />
                  <div className="w-10 h-5 rounded-full transition-all" style={{ background: pinned ? "#6D5DF6" : "rgba(255,255,255,0.1)" }}>
                    <div className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-all" style={{ transform: pinned ? "translateX(20px)" : "translateX(0)" }} />
                  </div>
                </div>
                <span className="text-[13px] font-sans" style={{ color: "#9CA3AF" }}>Pin this announcement</span>
              </label>

              {state && 'error' in state && (
                <p className="text-[12px] font-sans" style={{ color: "#FF6B57" }}>{state.error}</p>
              )}

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)}
                  className="flex-1 py-2.5 rounded-xl text-[13px] font-semibold font-sans"
                  style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#9CA3AF" }}>
                  Cancel
                </button>
                <button type="submit" disabled={formPending}
                  className="flex-1 py-2.5 rounded-xl text-[13px] font-semibold font-sans text-white flex items-center justify-center gap-2"
                  style={{ background: "linear-gradient(135deg, #FF6B57, #E85A45)" }}>
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
        <div className="flex flex-col items-center justify-center py-24 rounded-2xl" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
          <Megaphone size={40} style={{ color: "rgba(255,255,255,0.1)" }} className="mb-3" />
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
                  background: ann.pinned ? "rgba(109,93,246,0.06)" : "rgba(255,255,255,0.02)",
                  border: ann.pinned ? "1px solid rgba(109,93,246,0.2)" : "1px solid rgba(255,255,255,0.06)",
                }}>
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5"
                    style={{ background: ann.pinned ? "rgba(109,93,246,0.15)" : "rgba(255,107,87,0.1)" }}>
                    <Megaphone size={15} style={{ color: ann.pinned ? "#6D5DF6" : "#FF6B57" }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      {ann.pinned && (
                        <span className="flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ background: "rgba(109,93,246,0.15)", color: "#6D5DF6" }}>
                          <Pin size={10} /> Pinned
                        </span>
                      )}
                      <h3 className="text-[15px] font-bold font-sans" style={{ color: "#E6EDF3" }}>{ann.title}</h3>
                    </div>
                    <p className="text-[13px] font-sans leading-relaxed mb-2" style={{ color: "#9CA3AF" }}>{ann.message}</p>
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
                      <Pin size={14} style={{ color: ann.pinned ? "#6D5DF6" : "#6B7280" }} />
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
