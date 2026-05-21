"use client"

import { useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { usePathname } from "next/navigation"
import {
  LayoutDashboard, ClipboardList, Target, CalendarOff,
  Megaphone, User, LogOut, Clock, History, LifeBuoy, ChevronRight,
  MoreHorizontal, X, Bell,
} from "lucide-react"
import { logoutAction } from "@/lib/actions/auth"

const navItems = [
  { label: "Dashboard",     href: "/member/dashboard",     icon: LayoutDashboard },
  { label: "Attendance",    href: "/member/attendance",    icon: Clock },
  { label: "Daily Update",  href: "/member/update",        icon: ClipboardList },
  { label: "My Tasks",      href: "/member/tasks",         icon: Target },
  { label: "Leaves",        href: "/member/leaves",        icon: CalendarOff },
  { label: "History",       href: "/member/history",       icon: History },
  { label: "Announcements", href: "/member/announcements", icon: Megaphone },
  { label: "Notifications", href: "/member/notifications", icon: Bell },
  { label: "Profile",       href: "/member/profile",       icon: User },
  { label: "Support",       href: "/member/support",       icon: LifeBuoy },
]

const mainBottomNav = [
  { label: "Home",       href: "/member/dashboard",  icon: LayoutDashboard },
  { label: "Attendance", href: "/member/attendance", icon: Clock },
  { label: "Update",     href: "/member/update",     icon: ClipboardList },
  { label: "Tasks",      href: "/member/tasks",      icon: Target },
]

const moreNavItems = [
  { label: "Leaves",         href: "/member/leaves",        icon: CalendarOff },
  { label: "History",        href: "/member/history",       icon: History },
  { label: "Announcements",  href: "/member/announcements", icon: Megaphone },
  { label: "Notifications",  href: "/member/notifications", icon: Bell },
  { label: "Support",        href: "/member/support",       icon: LifeBuoy },
  { label: "Profile",        href: "/member/profile",       icon: User },
]

const DIVIDER = "rgba(255,255,255,0.08)"
const MOBILE_BG = "linear-gradient(90deg, #0a0a0a 0%, #1a0000 60%, #de1a1a 100%)"

export default function MemberSidebar({ name, employeeId, unreadCount = 0, photoUrl = null }: { name: string; employeeId: string; unreadCount?: number; photoUrl?: string | null }) {
  const pathname = usePathname()
  const initials = name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()
  const [showMore, setShowMore] = useState(false)

  function isActive(href: string) {
    return pathname === href || (href !== "/member/dashboard" && pathname.startsWith(href))
  }

  const isMoreActive = moreNavItems.some(item => isActive(item.href))

  return (
    <>
      {/* ── Desktop Sidebar (lg+) ─────────────────────────── */}
      <aside
        className="hidden lg:flex fixed left-0 top-0 h-screen w-[240px] flex-col z-50 select-none overflow-hidden"
        style={{ background: "#080808", borderRight: "1px solid rgba(255,255,255,0.06)" }}
      >
        {/* ── Red wave background art ── */}
        <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 0 }}>
          <svg
            viewBox="0 0 240 860"
            className="absolute bottom-0 right-0"
            style={{ width: "100%", height: "65%", opacity: 1 }}
            preserveAspectRatio="xMidYMax slice"
          >
            <defs>
              <radialGradient id="wg1" cx="80%" cy="80%" r="60%">
                <stop offset="0%" stopColor="#de1a1a" stopOpacity="0.55"/>
                <stop offset="100%" stopColor="#080808" stopOpacity="0"/>
              </radialGradient>
              <radialGradient id="wg2" cx="60%" cy="100%" r="50%">
                <stop offset="0%" stopColor="#9b0000" stopOpacity="0.4"/>
                <stop offset="100%" stopColor="#080808" stopOpacity="0"/>
              </radialGradient>
              <radialGradient id="wg3" cx="100%" cy="70%" r="40%">
                <stop offset="0%" stopColor="#ff3333" stopOpacity="0.3"/>
                <stop offset="100%" stopColor="#080808" stopOpacity="0"/>
              </radialGradient>
            </defs>
            {/* Base glow blobs */}
            <ellipse cx="200" cy="750" rx="160" ry="120" fill="url(#wg1)"/>
            <ellipse cx="160" cy="820" rx="140" ry="80"  fill="url(#wg2)"/>
            <ellipse cx="220" cy="680" rx="100" ry="100" fill="url(#wg3)"/>
            {/* Wave strokes */}
            <path d="M280,860 C220,780 80,800 40,720 C0,640 120,580 160,500 C200,420 100,360 140,280" fill="none" stroke="#de1a1a" strokeWidth="1.2" strokeOpacity="0.35"/>
            <path d="M300,860 C240,800 120,820 80,740 C40,660 160,600 180,520 C200,440 80,360 120,260" fill="none" stroke="#ff4444" strokeWidth="0.8" strokeOpacity="0.2"/>
            <path d="M260,860 C180,800 60,760 80,680 C100,600 200,560 200,480 C200,400 100,320 160,220" fill="none" stroke="#c00000" strokeWidth="1.5" strokeOpacity="0.25"/>
            {/* Bright accent streaks */}
            <path d="M240,860 C200,820 240,780 220,740 C200,700 160,720 180,680 C200,640 240,640 240,600" fill="none" stroke="#ff6666" strokeWidth="0.6" strokeOpacity="0.3"/>
            <path d="M200,860 C240,840 280,800 260,760 C240,720 180,700 200,660 C220,620 260,600 240,560" fill="none" stroke="#ff2222" strokeWidth="0.5" strokeOpacity="0.2"/>
            {/* Particle dots */}
            {[
              [195, 520, 1.5], [210, 560, 1], [175, 600, 2], [220, 640, 1.2],
              [185, 680, 1.8], [230, 700, 1], [160, 740, 1.4], [215, 760, 0.8],
              [190, 800, 1.6], [240, 820, 1.2], [170, 840, 1],
            ].map(([cx, cy, r], i) => (
              <circle key={i} cx={cx} cy={cy} r={r} fill="#ff4444" opacity="0.5"/>
            ))}
          </svg>
        </div>

        {/* ── Logo ── */}
        <div className="relative z-10 px-5 py-5" style={{ borderBottom: `1px solid ${DIVIDER}` }}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl overflow-hidden flex-shrink-0" style={{ border: "1.5px solid rgba(255,255,255,0.15)" }}>
              <Image src="/brand/logo.jpg" alt="GroFast" width={40} height={40} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            </div>
            <div>
              <p style={{ color: "#FFFFFF", fontFamily: "var(--font-bebas), sans-serif", fontSize: 20, letterSpacing: "0.18em", lineHeight: 1 }}>GROFAST</p>
              <p className="text-[9px] tracking-[0.24em] uppercase font-semibold mt-0.5" style={{ color: "rgba(255,255,255,0.4)" }}>Member Portal</p>
            </div>
          </div>
        </div>

        {/* ── Nav ── */}
        <nav className="relative z-10 flex-1 px-3 pt-4 pb-2 overflow-y-auto">
          <div className="space-y-0.5">
            {navItems.map(({ label, href, icon: Icon }) => {
              const active = isActive(href)
              return (
                <Link
                  key={href}
                  href={href}
                  className="relative flex items-center gap-3 px-3 py-[10px] rounded-xl transition-all duration-150"
                  style={active
                    ? { background: "#de1a1a", color: "#FFFFFF" }
                    : { color: "rgba(255,255,255,0.55)" }
                  }
                  onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.color = "#FFFFFF" }}
                  onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.55)" }}
                >
                  <Icon size={16} className="flex-shrink-0" strokeWidth={active ? 2.2 : 1.7} />
                  <span className="text-[13px] font-semibold flex-1">{label}</span>
                  {active && <ChevronRight size={14} strokeWidth={2.5} style={{ color: "rgba(255,255,255,0.8)" }} />}
                </Link>
              )
            })}
          </div>
        </nav>

        {/* ── User + Sign Out ── */}
        <div className="relative z-10 px-3 pb-4 pt-3" style={{ borderTop: `1px solid ${DIVIDER}` }}>
          {/* User card */}
          <div className="flex items-center gap-3 px-3 py-3 rounded-xl mb-1"
            style={{ background: "rgba(255,255,255,0.06)" }}>
            <div className="w-10 h-10 rounded-full flex-shrink-0 overflow-hidden"
              style={{ border: "2px solid rgba(255,255,255,0.2)" }}>
              {photoUrl
                ? <Image src={photoUrl} alt={name} width={40} height={40} style={{ width:"100%", height:"100%", objectFit:"cover" }} />
                : <div className="w-full h-full flex items-center justify-center text-[12px] font-black" style={{ background:"#de1a1a", color:"#FFFFFF" }}>{initials}</div>
              }
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-bold leading-none truncate" style={{ color: "#FFFFFF" }}>{name}</p>
              <p className="text-[10px] mt-1 font-medium" style={{ color: "rgba(255,255,255,0.4)" }}>#{employeeId}</p>
              <div className="flex items-center gap-1 mt-1">
                <div className="w-1.5 h-1.5 rounded-full" style={{ background: "#22C55E" }} />
                <span className="text-[10px] font-medium" style={{ color: "rgba(255,255,255,0.5)" }}>Online</span>
              </div>
            </div>
            {/* Bell notification */}
            <Link href="/member/notifications" className="relative w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
              style={{ background: "rgba(255,255,255,0.1)", border: "1.5px solid rgba(255,255,255,0.2)" }}>
              <Bell size={13} style={{ color: "#FFFFFF" }} />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full text-[8px] font-black flex items-center justify-center"
                  style={{ background: "#de1a1a", color: "#FFFFFF", border: "1.5px solid #080808" }}>
                  {unreadCount}
                </span>
              )}
            </Link>
          </div>

          {/* Sign Out */}
          <form action={logoutAction}>
            <button
              type="submit"
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all w-full mt-1"
              style={{ color: "rgba(255,255,255,0.45)" }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "#FFFFFF" }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.45)" }}
            >
              <LogOut size={15} />
              <span className="text-[13px] font-medium">Sign Out</span>
            </button>
          </form>
        </div>
      </aside>

      {/* ── Tablet Sidebar (md–lg) ────────────────────────── */}
      <aside
        className="hidden md:flex lg:hidden fixed left-0 top-0 h-screen w-[64px] flex-col z-50 select-none overflow-hidden"
        style={{ background: "#080808", borderRight: "1px solid rgba(255,255,255,0.06)" }}
      >
        {/* wave bg */}
        <div className="absolute bottom-0 right-0 w-full h-1/2 pointer-events-none"
          style={{ background: "radial-gradient(ellipse at 80% 100%, rgba(222,26,26,0.45) 0%, transparent 70%)" }} />

        <div className="relative z-10 flex items-center justify-center py-5" style={{ borderBottom: `1px solid ${DIVIDER}` }}>
          <div className="w-9 h-9 rounded-xl overflow-hidden" style={{ border: "1.5px solid rgba(255,255,255,0.15)" }}>
            <Image src="/brand/logo.jpg" alt="GroFast" width={36} height={36} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          </div>
        </div>

        <nav className="relative z-10 flex-1 flex flex-col items-center pt-3 pb-2 gap-0.5 overflow-y-auto">
          {navItems.map(({ label, href, icon: Icon }) => {
            const active = isActive(href)
            return (
              <Link
                key={href} href={href} title={label}
                className="relative w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-150"
                style={active ? { background: "#de1a1a", color: "#FFFFFF" } : { color: "rgba(255,255,255,0.5)" }}
                onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.color = "#FFFFFF" }}
                onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.5)" }}
              >
                <Icon size={16} strokeWidth={active ? 2.2 : 1.7} />
              </Link>
            )
          })}
        </nav>

        <div className="relative z-10 flex flex-col items-center pb-4 pt-3 gap-2" style={{ borderTop: `1px solid ${DIVIDER}` }}>
          {/* Bell */}
          <Link href="/member/notifications" title="Notifications"
            className="relative w-9 h-9 rounded-xl flex items-center justify-center transition-all"
            style={{ color: "rgba(255,255,255,0.55)" }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "#FFFFFF" }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.55)" }}
          >
            <Bell size={16} />
            {unreadCount > 0 && (
              <span className="absolute top-0 right-0 w-4 h-4 rounded-full text-[8px] font-black flex items-center justify-center"
                style={{ background: "#de1a1a", color: "#FFFFFF" }}>
                {unreadCount}
              </span>
            )}
          </Link>
          <div className="w-9 h-9 rounded-full overflow-hidden flex-shrink-0"
            title={`${name} #${employeeId}`}
            style={{ border: "1.5px solid rgba(255,255,255,0.2)" }}>
            {photoUrl
              ? <Image src={photoUrl} alt={name} width={36} height={36} style={{ width:"100%", height:"100%", objectFit:"cover" }} />
              : <div className="w-full h-full flex items-center justify-center text-[10px] font-black" style={{ background:"#de1a1a", color:"#FFFFFF" }}>{initials}</div>
            }
          </div>
          <form action={logoutAction}>
            <button type="submit" title="Sign Out"
              className="w-9 h-9 rounded-xl flex items-center justify-center transition-all"
              style={{ color: "rgba(255,255,255,0.5)" }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "#FFFFFF" }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.5)" }}
            >
              <LogOut size={15} />
            </button>
          </form>
        </div>
      </aside>

      {/* ── Mobile Top Bar ────────────────────────────────── */}
      <header
        className="md:hidden fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4 h-14"
        style={{ background: MOBILE_BG, borderBottom: `1px solid ${DIVIDER}` }}
      >
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg overflow-hidden flex-shrink-0" style={{ border: "1px solid rgba(255,255,255,0.15)" }}>
            <Image src="/brand/logo.jpg" alt="GroFast" width={32} height={32} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          </div>
          <span style={{ color: "#FFFFFF", fontFamily: "var(--font-bebas), sans-serif", fontSize: 18, letterSpacing: "0.16em" }}>GROFAST</span>
        </div>
        <div className="flex items-center gap-2">
          {/* Mobile bell */}
          <Link href="/member/notifications"
            className="relative w-8 h-8 rounded-full flex items-center justify-center"
            style={{ color: "rgba(255,255,255,0.85)" }}>
            <Bell size={18} />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full text-[8px] font-black flex items-center justify-center"
                style={{ background: "#ff3b3b", color: "#FFFFFF", border: "1.5px solid #1a0000" }}>
                {unreadCount}
              </span>
            )}
          </Link>
          <div className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0"
            style={{ border: "1.5px solid rgba(255,255,255,0.2)" }}>
            {photoUrl
              ? <Image src={photoUrl} alt={name} width={32} height={32} style={{ width:"100%", height:"100%", objectFit:"cover" }} />
              : <div className="w-full h-full flex items-center justify-center text-[11px] font-black" style={{ background:"#de1a1a", color:"#FFFFFF" }}>{initials}</div>
            }
          </div>
        </div>
      </header>

      {/* ── Mobile Bottom Nav ─────────────────────────────── */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-50 flex items-center justify-around px-2"
        style={{
          background: "#0a0a0a",
          borderTop: `1px solid ${DIVIDER}`,
          height: "64px",
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
      >
        {mainBottomNav.map(({ label, href, icon: Icon }) => {
          const active = isActive(href)
          return (
            <Link
              key={href} href={href}
              className="flex flex-col items-center justify-center gap-1 flex-1 py-2 rounded-xl transition-all"
              style={active ? { color: "#FFFFFF" } : { color: "rgba(255,255,255,0.4)" }}
            >
              {active && (
                <div className="absolute bottom-[52px] w-6 h-0.5 rounded-full" style={{ background: "#de1a1a" }} />
              )}
              <Icon size={20} strokeWidth={active ? 2.5 : 1.8} />
              <span className="text-[10px] font-semibold leading-none" style={{ color: active ? "#de1a1a" : "rgba(255,255,255,0.4)" }}>{label}</span>
            </Link>
          )
        })}
        {/* More button */}
        <button
          onClick={() => setShowMore(true)}
          className="flex flex-col items-center justify-center gap-1 flex-1 py-2 rounded-xl transition-all"
          style={{ color: isMoreActive ? "#FFFFFF" : "rgba(255,255,255,0.4)", background: "none", border: "none", cursor: "pointer" }}
        >
          {isMoreActive && (
            <div className="absolute bottom-[52px] w-6 h-0.5 rounded-full" style={{ background: "#de1a1a" }} />
          )}
          <MoreHorizontal size={20} strokeWidth={isMoreActive ? 2.5 : 1.8} />
          <span className="text-[10px] font-semibold leading-none" style={{ color: isMoreActive ? "#de1a1a" : "rgba(255,255,255,0.4)" }}>More</span>
        </button>
      </nav>

      {/* ── More Sheet (mobile) ───────────────────────────── */}
      {showMore && (
        <div className="md:hidden fixed inset-0 z-[60]" onClick={() => setShowMore(false)}>
          {/* Backdrop */}
          <div className="absolute inset-0" style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }} />
          {/* Sheet */}
          <div
            className="absolute bottom-0 left-0 right-0 rounded-t-3xl"
            style={{ background: "#0f0f0f", border: "1px solid rgba(255,255,255,0.08)" }}
            onClick={e => e.stopPropagation()}
          >
            {/* Handle */}
            <div className="flex items-center justify-between px-5 pt-4 pb-3" style={{ borderBottom: `1px solid ${DIVIDER}` }}>
              <span className="text-[13px] font-bold" style={{ color: "rgba(255,255,255,0.7)" }}>More Pages</span>
              <button onClick={() => setShowMore(false)} style={{ background: "rgba(255,255,255,0.08)", border: "none", borderRadius: "50%", width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                <X size={15} style={{ color: "rgba(255,255,255,0.7)" }} />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2 p-4 pb-8">
              {moreNavItems.map(({ label, href, icon: Icon }) => {
                const active = isActive(href)
                return (
                  <Link
                    key={href} href={href}
                    onClick={() => setShowMore(false)}
                    className="flex flex-col items-center justify-center gap-2 p-4 rounded-2xl transition-all"
                    style={active
                      ? { background: "#de1a1a", color: "#FFFFFF" }
                      : { background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.7)" }
                    }
                  >
                    <Icon size={22} strokeWidth={active ? 2.2 : 1.7} />
                    <span className="text-[11px] font-semibold text-center leading-tight">{label}</span>
                  </Link>
                )
              })}
              {/* Sign Out in the sheet */}
              <form action={logoutAction}>
                <button
                  type="submit"
                  className="flex flex-col items-center justify-center gap-2 p-4 rounded-2xl w-full transition-all"
                  style={{ background: "rgba(222,26,26,0.08)", color: "rgba(239,68,68,0.8)", border: "none", cursor: "pointer" }}
                >
                  <LogOut size={22} strokeWidth={1.7} />
                  <span className="text-[11px] font-semibold">Sign Out</span>
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
