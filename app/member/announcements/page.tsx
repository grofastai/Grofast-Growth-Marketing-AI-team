export const revalidate = 60

import { createServerClient } from "@/lib/supabase/server"
import { Megaphone, Pin } from "lucide-react"

type AnnouncementRow = {
  id: string
  title: string
  message: string
  pinned: boolean
  created_at: string
  users: { name: string } | null
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

export default async function MemberAnnouncementsPage() {
  const supabase = await createServerClient()
  const { data: raw } = await supabase
    .from("announcements")
    .select("id, title, message, pinned, created_at, users(name)")
    .order("pinned", { ascending: false })
    .order("created_at", { ascending: false })

  const announcements = (raw ?? []) as unknown as AnnouncementRow[]

  return (
    <div className="p-4 md:p-6 xl:p-8 max-w-[1300px]">
      <div className="mb-6">
        <h1 className="gradient-heading text-[32px] leading-tight" style={{ fontFamily: "var(--font-jakarta)", fontWeight: 800 }}>
          Announcements
        </h1>
        <p className="text-sm mt-1 font-sans" style={{ color: "#6B7280" }}>Updates and notices from your team.</p>
      </div>

      {announcements.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 rounded-2xl"
          style={{ background: "#F9FAFB", border: "1px solid #E5E7EB" }}>
          <Megaphone size={40} style={{ color: "rgba(0,0,0,0.06)" }} className="mb-3" />
          <p className="text-[14px] font-semibold font-sans" style={{ color: "#6B7280" }}>No announcements yet</p>
          <p className="text-[12px] font-sans mt-1" style={{ color: "#6B7280" }}>Your admin will post updates here.</p>
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
                    style={{ background: ann.pinned ? "rgba(222,26,26,0.15)" : "rgba(255,107,87,0.1)" }}>
                    <Megaphone size={15} style={{ color: ann.pinned ? "#de1a1a" : "#de1a1a" }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      {ann.pinned && (
                        <span className="flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full"
                          style={{ background: "rgba(222,26,26,0.15)", color: "#de1a1a" }}>
                          <Pin size={9} /> Pinned
                        </span>
                      )}
                      <h3 className="text-[15px] font-bold font-sans" style={{ color: "#111111" }}>{ann.title}</h3>
                    </div>
                    <p className="text-[13px] font-sans leading-relaxed mb-2" style={{ color: "#374151" }}>{ann.message}</p>
                    <p className="text-[11px] font-sans" style={{ color: "#6B7280" }}>
                      By {creator?.name ?? "Admin"} · {timeAgo(ann.created_at)}
                    </p>
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
