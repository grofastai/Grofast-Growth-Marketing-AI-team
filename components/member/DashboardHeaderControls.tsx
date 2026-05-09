"use client"

import { useState, useRef } from "react"
import { useRouter } from "next/navigation"
import { Search, Bell, X } from "lucide-react"
import Link from "next/link"

const QUICK_LINKS = [
  { label: "My Tasks",      href: "/member/tasks" },
  { label: "Attendance",    href: "/member/attendance" },
  { label: "Daily Update",  href: "/member/update" },
  { label: "Leaves",        href: "/member/leaves" },
  { label: "Announcements", href: "/member/announcements" },
  { label: "Profile",       href: "/member/profile" },
]

export default function DashboardHeaderControls({
  pendingLeaves,
  employeeId,
}: {
  pendingLeaves: number
  employeeId: string
}) {
  const router = useRouter()
  const [query, setQuery] = useState("")
  const [open, setOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const filtered = query.trim().length > 0
    ? QUICK_LINKS.filter(l => l.label.toLowerCase().includes(query.toLowerCase()))
    : QUICK_LINKS

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const match = QUICK_LINKS.find(l => l.label.toLowerCase().includes(query.toLowerCase()))
    if (match) router.push(match.href)
    else if (query.trim()) router.push(`/member/tasks?search=${encodeURIComponent(query.trim())}`)
    setOpen(false)
    setQuery("")
  }

  return (
    <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">

      {/* ── Search ── */}
      <div className="relative">
        <form onSubmit={handleSubmit}
          className="flex items-center gap-2 px-3 py-2 rounded-xl transition-all"
          style={{ background: "#FFFFFF", border: `1px solid ${open ? "#de1a1a" : "#E5E7EB"}`, minWidth: open ? 200 : undefined }}>
          <Search size={14} style={{ color: open ? "#de1a1a" : "#9CA3AF", flexShrink: 0 }} />
          <input
            ref={inputRef}
            value={query}
            onChange={e => { setQuery(e.target.value); setOpen(true) }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            placeholder="Search..."
            className="bg-transparent outline-none text-[13px] w-[120px] sm:w-[180px] placeholder:text-[#9CA3AF]"
            style={{ color: "#111111" }}
          />
          {query && (
            <button type="button" onClick={() => { setQuery(""); inputRef.current?.focus() }}>
              <X size={12} style={{ color: "#9CA3AF" }} />
            </button>
          )}
        </form>

        {/* Dropdown */}
        {open && (
          <div className="absolute top-full mt-1.5 left-0 right-0 rounded-xl overflow-hidden z-50"
            style={{ background: "#FFFFFF", boxShadow: "0 8px 24px rgba(0,0,0,0.12)", border: "1px solid #E5E7EB", minWidth: 200 }}>
            {filtered.length === 0
              ? <p className="px-4 py-3 text-[12px]" style={{ color: "#9CA3AF" }}>No results</p>
              : filtered.map(l => (
                <Link key={l.href} href={l.href}
                  className="flex items-center gap-2 px-4 py-2.5 text-[13px] font-medium transition-colors hover:bg-gray-50"
                  style={{ color: "#374151" }}
                  onMouseDown={() => { router.push(l.href); setOpen(false) }}>
                  <Search size={11} style={{ color: "#9CA3AF" }} />
                  {l.label}
                </Link>
              ))
            }
          </div>
        )}
      </div>

      {/* ── Bell ── */}
      <Link href="/member/leaves"
        className="relative w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors hover:bg-gray-50"
        style={{ background: "#FFFFFF", border: "1px solid #E5E7EB" }}>
        <Bell size={16} style={{ color: "#374151" }} />
        {pendingLeaves > 0 && (
          <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full text-[9px] font-black flex items-center justify-center"
            style={{ background: "#de1a1a", color: "#FFFFFF" }}>
            {pendingLeaves}
          </span>
        )}
      </Link>

      {/* ── Employee ID (hidden on very small screens) ── */}
      <div className="text-right hidden xs:block">
        <p className="text-[9px] uppercase tracking-[0.2em] font-bold" style={{ color: "#9CA3AF" }}>Employee ID</p>
        <p className="text-[15px] font-black" style={{ color: "#de1a1a", fontFamily: "var(--font-jakarta)" }}>
          {employeeId ? `#${employeeId}` : "—"}
        </p>
      </div>

    </div>
  )
}
