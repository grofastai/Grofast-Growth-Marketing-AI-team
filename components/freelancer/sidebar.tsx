"use client"

import { useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { usePathname } from "next/navigation"
import {
  LayoutDashboard, Users, ClipboardList, Activity, LogOut, X, MoreHorizontal,
} from "lucide-react"
import { logoutAction } from "@/lib/actions/auth"

const navItems = [
  { label: "Dashboard",   href: "/freelancer/dashboard",   icon: LayoutDashboard },
  { label: "Freelancers", href: "/freelancer/members",     icon: Users },
  { label: "Log Update",  href: "/freelancer/update",      icon: ClipboardList },
  { label: "Activities",  href: "/freelancer/activities",  icon: Activity },
]

const SIDEBAR_BG = "linear-gradient(160deg, #0a100d 0%, #1a3520 55%, #2d6a4f 100%)"
const MOBILE_BG  = "linear-gradient(90deg, #0a100d 0%, #2d6a4f 100%)"
const ACTIVE_BG  = "rgba(255,255,255,0.14)"
const HOVER_BG   = "rgba(255,255,255,0.07)"
const DIVIDER    = "rgba(255,255,255,0.1)"
const ACCENT     = "#2d6a4f"

export default function FreelancerSidebar({ managerName = "Manager", photoUrl = null }: { managerName?: string; photoUrl?: string | null }) {
  const pathname = usePathname()
  const [showMore, setShowMore] = useState(false)
  const initials = managerName.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase()

  function isActive(href: string) {
    return pathname === href || (href !== "/freelancer/dashboard" && pathname.startsWith(href))
  }

  return (
    <>
      {/* ── Desktop Sidebar ─────────────────────────────────────── */}
      <aside className="hidden lg:flex fixed left-0 top-0 h-screen w-[240px] flex-col z-50 select-none"
        style={{ background: SIDEBAR_BG, borderRight: "1px solid rgba(45,106,79,0.3)" }}>

        <div className="px-5 py-[18px]" style={{ borderBottom: `1px solid ${DIVIDER}` }}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl overflow-hidden flex-shrink-0" style={{ border: "1.5px solid rgba(255,255,255,0.2)" }}>
              <Image src="/brand/logo.jpg" alt="GroFast" width={40} height={40} style={{ width:"100%", height:"100%", objectFit:"cover" }} />
            </div>
            <div>
              <p style={{ color:"#FFFFFF", fontFamily:"var(--font-bebas), sans-serif", fontSize:18, letterSpacing:"0.16em" }}>GROFAST</p>
              <p className="text-[9px] tracking-[0.22em] uppercase font-semibold mt-0.5" style={{ color:"rgba(255,255,255,0.45)" }}>Freelancer Portal</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 px-3 pt-5 pb-2 overflow-y-auto">
          <p className="text-[9px] tracking-[0.28em] uppercase px-3 pb-3 font-bold" style={{ color:"rgba(255,255,255,0.3)" }}>Navigation</p>
          <div className="space-y-[1px]">
            {navItems.map(({ label, href, icon: Icon }) => {
              const active = isActive(href)
              return (
                <Link key={href} href={href}
                  className="relative flex items-center gap-3 px-3 py-[10px] rounded-lg transition-all duration-150"
                  style={active ? { background: ACTIVE_BG, color:"#FFFFFF" } : { color:"rgba(255,255,255,0.65)" }}
                  onMouseEnter={e => { if (!active) { (e.currentTarget as HTMLElement).style.background = HOVER_BG; (e.currentTarget as HTMLElement).style.color = "#FFFFFF" } }}
                  onMouseLeave={e => { if (!active) { (e.currentTarget as HTMLElement).style.background = "transparent"; (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.65)" } }}>
                  {active && <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] rounded-r-full" style={{ height:"22px", background:"#FFFFFF" }} />}
                  <Icon size={15} className="flex-shrink-0" strokeWidth={active ? 2.2 : 1.7} />
                  <span className="text-[13px] font-semibold">{label}</span>
                  {active && <span className="ml-auto w-1.5 h-1.5 rounded-full" style={{ background:"#FFFFFF", opacity:0.7 }} />}
                </Link>
              )
            })}
          </div>
        </nav>

        <div className="px-3 pb-4 pt-3" style={{ borderTop: `1px solid ${DIVIDER}` }}>
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg mb-1" style={{ background:"rgba(255,255,255,0.07)" }}>
            <div className="w-9 h-9 rounded-full flex-shrink-0 overflow-hidden" style={{ border:"1.5px solid rgba(255,255,255,0.3)" }}>
              {photoUrl
                ? <Image src={photoUrl} alt={managerName} width={36} height={36} style={{ width:"100%", height:"100%", objectFit:"cover" }} />
                : <div className="w-full h-full flex items-center justify-center text-[11px] font-bold" style={{ background:`rgba(45,106,79,0.5)`, color:"#FFFFFF" }}>{initials}</div>}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-bold leading-none truncate" style={{ color:"#FFFFFF" }}>{managerName}</p>
              <p className="text-[10px] mt-0.5 font-medium" style={{ color:"rgba(255,255,255,0.45)" }}>Freelancer Manager</p>
            </div>
          </div>
          <form action={logoutAction}>
            <button type="submit" className="flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all w-full" style={{ color:"rgba(255,255,255,0.55)" }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = HOVER_BG; (e.currentTarget as HTMLElement).style.color = "#FFFFFF" }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.55)" }}>
              <LogOut size={14} /><span className="text-[13px] font-medium">Sign Out</span>
            </button>
          </form>
        </div>
      </aside>

      {/* ── Tablet Sidebar ──────────────────────────────────────── */}
      <aside className="hidden md:flex lg:hidden fixed left-0 top-0 h-screen w-[64px] flex-col z-50 select-none"
        style={{ background: SIDEBAR_BG, borderRight: "1px solid rgba(45,106,79,0.3)" }}>
        <div className="flex items-center justify-center py-[18px]" style={{ borderBottom: `1px solid ${DIVIDER}` }}>
          <div className="w-9 h-9 rounded-xl overflow-hidden" style={{ border:"1.5px solid rgba(255,255,255,0.2)" }}>
            <Image src="/brand/logo.jpg" alt="GroFast" width={36} height={36} style={{ width:"100%", height:"100%", objectFit:"cover" }} />
          </div>
        </div>
        <nav className="flex-1 flex flex-col items-center pt-3 pb-2 gap-[2px]">
          {navItems.map(({ label, href, icon: Icon }) => {
            const active = isActive(href)
            return (
              <Link key={href} href={href} title={label}
                className="relative w-10 h-10 rounded-lg flex items-center justify-center transition-all"
                style={active ? { background: ACTIVE_BG, color:"#FFFFFF" } : { color:"rgba(255,255,255,0.55)" }}
                onMouseEnter={e => { if (!active) { (e.currentTarget as HTMLElement).style.background = HOVER_BG; (e.currentTarget as HTMLElement).style.color = "#FFFFFF" } }}
                onMouseLeave={e => { if (!active) { (e.currentTarget as HTMLElement).style.background = "transparent"; (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.55)" } }}>
                {active && <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] rounded-r-full" style={{ height:"18px", background:"#FFFFFF" }} />}
                <Icon size={16} strokeWidth={active ? 2.2 : 1.7} />
              </Link>
            )
          })}
        </nav>
        <div className="flex flex-col items-center pb-4 pt-3 gap-2" style={{ borderTop: `1px solid ${DIVIDER}` }}>
          <div className="w-9 h-9 rounded-full overflow-hidden" style={{ border:"1.5px solid rgba(255,255,255,0.25)" }}>
            {photoUrl
              ? <Image src={photoUrl} alt={managerName} width={36} height={36} style={{ width:"100%", height:"100%", objectFit:"cover" }} />
              : <div className="w-full h-full flex items-center justify-center text-[10px] font-bold" style={{ background:`rgba(45,106,79,0.5)`, color:"#FFFFFF" }}>{initials}</div>}
          </div>
          <form action={logoutAction}>
            <button type="submit" title="Sign Out" className="w-9 h-9 rounded-lg flex items-center justify-center transition-all" style={{ color:"rgba(255,255,255,0.55)" }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = HOVER_BG; (e.currentTarget as HTMLElement).style.color = "#FFFFFF" }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.55)" }}>
              <LogOut size={15} />
            </button>
          </form>
        </div>
      </aside>

      {/* ── Mobile Top Bar ───────────────────────────────────────── */}
      <header className="md:hidden fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4 h-14"
        style={{ background: MOBILE_BG, borderBottom: `1px solid ${DIVIDER}` }}>
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg overflow-hidden" style={{ border:"1px solid rgba(255,255,255,0.2)" }}>
            <Image src="/brand/logo.jpg" alt="GroFast" width={32} height={32} style={{ width:"100%", height:"100%", objectFit:"cover" }} />
          </div>
          <span style={{ color:"#FFFFFF", fontFamily:"var(--font-bebas), sans-serif", fontSize:18, letterSpacing:"0.14em" }}>GROFAST</span>
        </div>
        <button onClick={() => setShowMore(true)} style={{ background:"rgba(255,255,255,0.12)", border:"1.5px solid rgba(255,255,255,0.2)", borderRadius:"50%", width:32, height:32, display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer" }}>
          <MoreHorizontal size={15} style={{ color:"#FFFFFF" }} />
        </button>
      </header>

      {/* ── Mobile Bottom Nav ────────────────────────────────────── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 flex items-center justify-around px-2"
        style={{ background: MOBILE_BG, borderTop:`1px solid ${DIVIDER}`, height:"64px", paddingBottom:"env(safe-area-inset-bottom)" }}>
        {navItems.map(({ label, href, icon: Icon }) => {
          const active = isActive(href)
          return (
            <Link key={href} href={href} className="flex flex-col items-center justify-center gap-1 flex-1 py-2 rounded-xl transition-all"
              style={active ? { color:"#FFFFFF", background:"rgba(255,255,255,0.12)" } : { color:"rgba(255,255,255,0.5)" }}>
              <Icon size={20} strokeWidth={active ? 2.5 : 1.8} />
              <span className="text-[10px] font-semibold leading-none">{label}</span>
            </Link>
          )
        })}
      </nav>

      {/* ── More Sheet ───────────────────────────────────────────── */}
      {showMore && (
        <div className="md:hidden fixed inset-0 z-[60]" onClick={() => setShowMore(false)}>
          <div className="absolute inset-0" style={{ background:"rgba(0,0,0,0.6)", backdropFilter:"blur(4px)" }} />
          <div className="absolute bottom-0 left-0 right-0 rounded-t-3xl" style={{ background:"#0f0f0f", border:"1px solid rgba(255,255,255,0.08)" }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 pt-4 pb-3" style={{ borderBottom:`1px solid ${DIVIDER}` }}>
              <span className="text-[13px] font-bold" style={{ color:"rgba(255,255,255,0.7)" }}>Menu</span>
              <button onClick={() => setShowMore(false)} style={{ background:"rgba(255,255,255,0.08)", border:"none", borderRadius:"50%", width:30, height:30, display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer" }}>
                <X size={15} style={{ color:"rgba(255,255,255,0.7)" }} />
              </button>
            </div>
            <div className="p-4 pb-8">
              <form action={logoutAction}>
                <button type="submit" className="flex items-center gap-3 w-full p-4 rounded-2xl" style={{ background:"rgba(239,68,68,0.08)", color:"rgba(239,68,68,0.8)", border:"none", cursor:"pointer" }}>
                  <LogOut size={18} /><span className="text-[13px] font-semibold">Sign Out</span>
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
