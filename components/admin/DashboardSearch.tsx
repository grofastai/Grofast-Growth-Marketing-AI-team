"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Search, Users, Building2, Loader2 } from "lucide-react"
import { createBrowserClient } from "@/lib/supabase/client"

type TeamHit   = { id: string; name: string; employee_id: string; role: string }
type ClientHit = { id: string; name: string }

export default function DashboardSearch() {
  const router = useRouter()
  const [value, setValue]   = useState("")
  const [open, setOpen]     = useState(false)
  const [loading, setLoading] = useState(false)
  const [team, setTeam]     = useState<TeamHit[]>([])
  const [clients, setClients] = useState<ClientHit[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    const q = value.trim()
    if (q.length < 2) { setTeam([]); setClients([]); setLoading(false); return }

    setLoading(true)
    debounceRef.current = setTimeout(async () => {
      const supabase = createBrowserClient()
      const [teamRes, clientRes] = await Promise.all([
        supabase
          .from("users")
          .select("id, name, employee_id, role")
          .or(`name.ilike.%${q}%,employee_id.ilike.%${q}%`)
          .is("deleted_at", null)
          .limit(8),
        supabase
          .from("clients")
          .select("id, name")
          .ilike("name", `%${q}%`)
          .limit(5),
      ])
      // Freelancer-login accounts are excluded from team pickers app-wide.
      setTeam(((teamRes.data ?? []) as TeamHit[]).filter(t => t.role !== "FREELANCER").slice(0, 5))
      setClients((clientRes.data ?? []) as ClientHit[])
      setLoading(false)
    }, 300)

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [value])

  function goTeam(q: string)    { router.push(`/admin/team?search=${encodeURIComponent(q)}`); reset() }
  function goClients(q: string) { router.push(`/admin/clients?search=${encodeURIComponent(q)}`); reset() }
  function reset() { setOpen(false); setValue(""); setTeam([]); setClients([]) }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && value.trim()) {
      if (team.length > 0) goTeam(value.trim())
      else if (clients.length > 0) goClients(value.trim())
      else goTeam(value.trim())
    }
    if (e.key === "Escape") reset()
  }

  const hasResults = team.length > 0 || clients.length > 0
  const showDropdown = open && value.trim().length >= 2

  return (
    <div className="relative">
      <div className="flex items-center gap-2">
        <Search size={13} style={{ color: "rgba(255,255,255,0.6)", flexShrink: 0 }} />
        <input
          ref={inputRef}
          placeholder="Search team, clients…"
          value={value}
          onChange={e => setValue(e.target.value)}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={handleKeyDown}
          style={{ border: "none", outline: "none", background: "transparent", fontSize: 12, color: "#FFFFFF", width: 110, minWidth: 80 }}
        />
      </div>

      {showDropdown && (
        <div className="absolute top-full mt-2 right-0 rounded-xl overflow-hidden z-50"
          style={{ background: "#FFFFFF", boxShadow: "0 8px 24px rgba(0,0,0,0.16)", border: "1px solid #E5E7EB", width: 240 }}>
          {loading ? (
            <div className="flex items-center gap-2 px-4 py-3" style={{ color: "#9CA3AF" }}>
              <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} />
              <span className="text-[12px]">Searching…</span>
            </div>
          ) : !hasResults ? (
            <p className="px-4 py-3 text-[12px]" style={{ color: "#9CA3AF" }}>No results for &ldquo;{value.trim()}&rdquo;</p>
          ) : (
            <>
              {team.length > 0 && (
                <div>
                  <p className="px-4 pt-2.5 pb-1 text-[10px] font-bold uppercase tracking-wide" style={{ color: "#9CA3AF" }}>Team</p>
                  {team.map(t => (
                    <button key={t.id} type="button" onMouseDown={() => goTeam(t.name)}
                      className="w-full flex items-center gap-2 px-4 py-2 text-[13px] font-medium text-left hover:bg-gray-50"
                      style={{ color: "#374151" }}>
                      <Users size={12} style={{ color: "#9CA3AF" }} />
                      {t.name} <span style={{ color: "#9CA3AF", fontWeight: 400 }}>· {t.employee_id}</span>
                    </button>
                  ))}
                </div>
              )}
              {clients.length > 0 && (
                <div>
                  <p className="px-4 pt-2.5 pb-1 text-[10px] font-bold uppercase tracking-wide" style={{ color: "#9CA3AF" }}>Clients</p>
                  {clients.map(c => (
                    <button key={c.id} type="button" onMouseDown={() => goClients(c.name)}
                      className="w-full flex items-center gap-2 px-4 py-2 text-[13px] font-medium text-left hover:bg-gray-50"
                      style={{ color: "#374151" }}>
                      <Building2 size={12} style={{ color: "#9CA3AF" }} />
                      {c.name}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
