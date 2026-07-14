"use client"

import { useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { usePathname } from "next/navigation"
import {
  LayoutDashboard, Users, Clock, Target,
  CalendarOff, Megaphone, Briefcase, LogOut,
  Receipt, IndianRupee, FolderOpen, LifeBuoy,
  MoreHorizontal, X, Bell, UserCircle2, ClipboardList, Activity, TrendingUp, Clapperboard, Shield, Film, StickyNote, Layers,
} from "lucide-react"
import { logoutAction } from "@/lib/actions/auth"

const navItems = [
  { label: "Dashboard",     href: "/admin/dashboard",        icon: LayoutDashboard },
  { label: "Attendance",    href: "/admin/attendance",        icon: Clock },
  { label: "Clients",       href: "/admin/clients",           icon: Briefcase },
  { label: "Team",          href: "/admin/team",              icon: Users },
  { label: "Leaves",        href: "/admin/leaves",            icon: CalendarOff },
  { label: "Activities",    href: "/admin/activities",        icon: Activity },
  { label: "Expenses",      href: "/admin/expenses",          icon: Receipt },
  { label: "Freelancers",   href: "/admin/freelancers",       icon: Film },
  { label: "Team Insights", href: "/admin/insights",          icon: TrendingUp },
  { label: "Tasks",         href: "/admin/goals",             icon: Target },
  { label: "Content Tracker", href: "/admin/content-tracker", icon: Layers },
  { label: "Announcements", href: "/admin/announcements",     icon: Megaphone },
  { label: "Notes",         href: "/admin/notes",             icon: StickyNote },
  { label: "Payroll",       href: "/admin/payroll",           icon: IndianRupee },
  { label: "Documents",     href: "/admin/documents",         icon: FolderOpen },
  { label: "Support",       href: "/admin/support",           icon: LifeBuoy },
  { label: "Profile",       href: "/admin/profile",           icon: UserCircle2 },
]

// Mirrors the desktop sidebar: bottom nav = first 4 items, More = the rest in order
const bottomNavItems = [
  { label: "Home",       href: "/admin/dashboard",  icon: LayoutDashboard },
  { label: "Attendance", href: "/admin/attendance", icon: Clock },
  { label: "Clients",    href: "/admin/clients",    icon: Briefcase },
  { label: "Team",       href: "/admin/team",       icon: Users },
]

const moreNavItems = [
  { label: "Leaves",        href: "/admin/leaves",            icon: CalendarOff },
  { label: "Activities",    href: "/admin/activities",        icon: Activity },
  { label: "Expenses",      href: "/admin/expenses",          icon: Receipt },
  { label: "Freelancers",   href: "/admin/freelancers",       icon: Film },
  { label: "Team Insights", href: "/admin/insights",          icon: TrendingUp },
  { label: "Tasks",         href: "/admin/goals",             icon: Target },
  { label: "Content Tracker", href: "/admin/content-tracker", icon: Layers },
  { label: "Announcements", href: "/admin/announcements",     icon: Megaphone },
  { label: "Notes",         href: "/admin/notes",             icon: StickyNote },
  { label: "Payroll",       href: "/admin/payroll",           icon: IndianRupee },
  { label: "Documents",     href: "/admin/documents",         icon: FolderOpen },
  { label: "Support",       href: "/admin/support",           icon: LifeBuoy },
  { label: "Profile",       href: "/admin/profile",           icon: UserCircle2 },
]

const SIDEBAR_BG = "linear-gradient(160deg, #0a100d 0%, #520000 55%, #de1a1a 100%)"
const MOBILE_BG  = "linear-gradient(90deg, #0a100d 0%, #de1a1a 100%)"
const ACTIVE_BG  = "rgba(255,255,255,0.14)"
const HOVER_BG   = "rgba(255,255,255,0.07)"
const DIVIDER    = "rgba(255,255,255,0.1)"

export default function Sidebar({ pendingLeaves = 0, adminName = "Admin", photoUrl = null, notifCount = 0 }: { pendingLeaves?: number; adminName?: string; photoUrl?: string | null; notifCount?: number }) {
  const pathname = usePathname()
  const [showMore, setShowMore] = useState(false)
  const [bellOpen, setBellOpen] = useState(false)
  const initials = adminName.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase()

  function isActive(href: string) {
    return pathname === href || (href !== "/admin/dashboard" && pathname.startsWith(href))
  }

  const isMoreActive = moreNavItems.some(item => isActive(item.href))

  return (
    <>
      {/* ── Desktop Sidebar (lg+: 1024px+) ─────────────────── */}
      <aside
        className="hidden lg:flex fixed left-0 top-0 h-screen w-[240px] flex-col z-50 select-none"
        style={{ background: SIDEBAR_BG, borderRight: "1px solid rgba(201,13,22,0.25)" }}
      >
        <div className="px-5 py-[18px]" style={{ borderBottom: `1px solid ${DIVIDER}` }}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl overflow-hidden flex-shrink-0" style={{ border: "1.5px solid rgba(255,255,255,0.2)" }}>
              <Image src="/brand/logo.jpg" alt="GroFast" width={40} height={40} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            </div>
            <div>
              <p className="text-[14px] tracking-[0.14em] font-black" style={{ color: "#FFFFFF", fontFamily: "var(--font-bebas), sans-serif", fontSize: 18, letterSpacing: "0.16em" }}>GROFAST</p>
              <p className="text-[9px] tracking-[0.22em] uppercase font-semibold mt-0.5" style={{ color: "rgba(255,255,255,0.45)" }}>Admin Portal</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 px-3 pt-5 pb-2 overflow-y-auto">
          <p className="text-[9px] tracking-[0.28em] uppercase px-3 pb-3 font-bold" style={{ color: "rgba(255,255,255,0.3)" }}>Navigation</p>
          <div className="space-y-[1px]">
            {navItems.map(({ label, href, icon: Icon }) => {
              const active = isActive(href)
              return (
                <Link
                  key={href} href={href}
                  className="relative flex items-center gap-3 px-3 py-[10px] rounded-lg transition-all duration-150"
                  style={active ? { background: ACTIVE_BG, color: "#FFFFFF" } : { color: "rgba(255,255,255,0.65)" }}
                  onMouseEnter={e => { if (!active) { (e.currentTarget as HTMLElement).style.background = HOVER_BG; (e.currentTarget as HTMLElement).style.color = "#FFFFFF" } }}
                  onMouseLeave={e => { if (!active) { (e.currentTarget as HTMLElement).style.background = "transparent"; (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.65)" } }}
                >
                  {active && <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] rounded-r-full" style={{ height: "22px", background: "#FFFFFF" }} />}
                  <Icon size={15} className="flex-shrink-0" strokeWidth={active ? 2.2 : 1.7} />
                  <span className="text-[13px] font-semibold">{label}</span>
                  {active && <span className="ml-auto w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: "#FFFFFF", opacity: 0.7 }} />}
                </Link>
              )
            })}
          </div>
        </nav>

        <div className="px-3 pb-4 pt-3" style={{ borderTop: `1px solid ${DIVIDER}` }}>
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg mb-1" style={{ background: "rgba(255,255,255,0.07)" }}>
            <Link href="/admin/profile" className="w-9 h-9 rounded-full flex-shrink-0 overflow-hidden" style={{ border: "1.5px solid rgba(255,255,255,0.3)", display:"block", flexShrink:0 }} title="Edit profile">
              {photoUrl
                ? <Image src={photoUrl} alt={adminName} width={36} height={36} style={{ width:"100%", height:"100%", objectFit:"cover" }} />
                : <div className="w-full h-full flex items-center justify-center text-[11px] font-bold" style={{ background:"rgba(255,255,255,0.2)", color:"#FFFFFF" }}>{initials}</div>
              }
            </Link>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-bold leading-none truncate" style={{ color: "#FFFFFF" }}>{adminName}</p>
              <p className="text-[10px] mt-0.5 font-medium" style={{ color: "rgba(255,255,255,0.45)" }}>Administrator</p>
            </div>
            {/* Bell */}
            <div className="relative">
              <button
                onClick={() => setBellOpen(v => !v)}
                onBlur={() => setTimeout(() => setBellOpen(false), 150)}
                className="relative w-8 h-8 rounded-full flex items-center justify-center"
                style={{ background: "rgba(255,255,255,0.12)", border: "1.5px solid rgba(255,255,255,0.2)" }}>
                <Bell size={13} style={{ color: "#FFFFFF" }} />
                {notifCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full text-[8px] font-black flex items-center justify-center"
                    style={{ background: "#de1a1a", color: "#FFFFFF", border: "1.5px solid #0a100d" }}>
                    {notifCount > 9 ? '9+' : notifCount}
                  </span>
                )}
              </button>
              {bellOpen && (
                <div className="absolute bottom-full right-0 mb-2 z-50 rounded-2xl overflow-hidden"
                  style={{ background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.1)", boxShadow: "0 8px 32px rgba(0,0,0,0.5)", minWidth: 256 }}>
                  <div className="px-4 py-2.5 flex items-center justify-between" style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                    <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.4)" }}>Notifications</p>
                    {notifCount > 0 && <span className="text-[9px] font-bold px-2 py-0.5 rounded-full" style={{ background: "rgba(222,26,26,0.2)", color: "#ff6b6b" }}>{notifCount} unread</span>}
                  </div>
                  {notifCount === 0 && pendingLeaves === 0 ? (
                    <div className="px-4 py-5 text-center">
                      <p className="text-[12px]" style={{ color: "rgba(255,255,255,0.35)" }}>All caught up!</p>
                    </div>
                  ) : (
                    <div className="px-3 py-2 flex flex-col gap-1.5">
                      {pendingLeaves > 0 && (
                        <Link href="/admin/leaves" onClick={() => setBellOpen(false)}
                          className="flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all"
                          style={{ background: "rgba(222,26,26,0.12)" }}
                          onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "rgba(222,26,26,0.22)"}
                          onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "rgba(222,26,26,0.12)"}>
                          <CalendarOff size={14} style={{ color: "#ff6b6b", flexShrink: 0 }} />
                          <div className="flex-1 min-w-0">
                            <p className="text-[12px] font-bold" style={{ color: "#FFFFFF" }}>{pendingLeaves} Leave{pendingLeaves !== 1 ? "s" : ""} Pending</p>
                            <p className="text-[10px]" style={{ color: "rgba(255,255,255,0.4)" }}>Needs your approval</p>
                          </div>
                        </Link>
                      )}
                      {notifCount > 0 && (
                        <Link href="/admin/notifications" onClick={() => setBellOpen(false)}
                          className="flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all"
                          style={{ background: "rgba(255,255,255,0.06)" }}
                          onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.12)"}
                          onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.06)"}>
                          <Bell size={14} style={{ color: "#a78bfa", flexShrink: 0 }} />
                          <div className="flex-1 min-w-0">
                            <p className="text-[12px] font-bold" style={{ color: "#FFFFFF" }}>{notifCount} New Notification{notifCount !== 1 ? "s" : ""}</p>
                            <p className="text-[10px]" style={{ color: "rgba(255,255,255,0.4)" }}>Tap to view all</p>
                          </div>
                        </Link>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
          <form action={logoutAction}>
            <button type="submit"
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all w-full"
              style={{ color: "rgba(255,255,255,0.55)" }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = HOVER_BG; (e.currentTarget as HTMLElement).style.color = "#FFFFFF" }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.55)" }}
            >
              <LogOut size={14} />
              <span className="text-[13px] font-medium">Sign Out</span>
            </button>
          </form>
        </div>
      </aside>

      {/* ── Tablet Sidebar (md–lg: 768px–1023px) ────────────── */}
      <aside
        className="hidden md:flex lg:hidden fixed left-0 top-0 h-screen w-[64px] flex-col z-50 select-none"
        style={{ background: SIDEBAR_BG, borderRight: "1px solid rgba(201,13,22,0.25)" }}
      >
        <div className="flex items-center justify-center py-[18px]" style={{ borderBottom: `1px solid ${DIVIDER}` }}>
          <div className="w-9 h-9 rounded-xl overflow-hidden" style={{ border: "1.5px solid rgba(255,255,255,0.2)" }}>
            <Image src="/brand/logo.jpg" alt="GroFast" width={36} height={36} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          </div>
        </div>

        <nav className="flex-1 flex flex-col items-center pt-3 pb-2 gap-[2px] overflow-y-auto">
          {navItems.map(({ label, href, icon: Icon }) => {
            const active = isActive(href)
            return (
              <Link
                key={href} href={href} title={label}
                className="relative w-10 h-10 rounded-lg flex items-center justify-center transition-all duration-150"
                style={active ? { background: ACTIVE_BG, color: "#FFFFFF" } : { color: "rgba(255,255,255,0.55)" }}
                onMouseEnter={e => { if (!active) { (e.currentTarget as HTMLElement).style.background = HOVER_BG; (e.currentTarget as HTMLElement).style.color = "#FFFFFF" } }}
                onMouseLeave={e => { if (!active) { (e.currentTarget as HTMLElement).style.background = "transparent"; (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.55)" } }}
              >
                {active && <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] rounded-r-full" style={{ height: "18px", background: "#FFFFFF" }} />}
                <Icon size={16} strokeWidth={active ? 2.2 : 1.7} />
              </Link>
            )
          })}
        </nav>

        <div className="flex flex-col items-center pb-4 pt-3 gap-2" style={{ borderTop: `1px solid ${DIVIDER}` }}>
          {/* Bell */}
          <div className="relative">
            <button
              onClick={() => setBellOpen(v => !v)}
              onBlur={() => setTimeout(() => setBellOpen(false), 150)}
              title="Notifications"
              className="w-9 h-9 rounded-lg flex items-center justify-center transition-all"
              style={{ color: "rgba(255,255,255,0.55)" }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "#FFFFFF" }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.55)" }}
            >
              <Bell size={16} />
              {pendingLeaves > 0 && (
                <span className="absolute top-0 right-0 w-4 h-4 rounded-full text-[8px] font-black flex items-center justify-center"
                  style={{ background: "#de1a1a", color: "#FFFFFF" }}>
                  {pendingLeaves}
                </span>
              )}
            </button>
            {bellOpen && (
              <div className="absolute bottom-full left-full ml-2 z-50 rounded-2xl overflow-hidden"
                style={{ background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.1)", boxShadow: "0 8px 32px rgba(0,0,0,0.5)", minWidth: 220 }}>
                <div className="px-4 py-2.5" style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                  <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.4)" }}>Notifications</p>
                </div>
                {notifCount === 0 && pendingLeaves === 0 ? (
                  <div className="px-4 py-4 text-center">
                    <p className="text-[12px]" style={{ color: "rgba(255,255,255,0.35)" }}>All caught up!</p>
                  </div>
                ) : (
                  <div className="px-3 py-2 flex flex-col gap-1.5">
                    {pendingLeaves > 0 && (
                      <Link href="/admin/leaves" onClick={() => setBellOpen(false)} className="flex items-center gap-2 px-3 py-2 rounded-xl" style={{ background: "rgba(222,26,26,0.12)" }}>
                        <CalendarOff size={13} style={{ color: "#ff6b6b" }} />
                        <p className="text-[12px] font-bold" style={{ color: "#FFFFFF" }}>{pendingLeaves} Leave{pendingLeaves !== 1 ? "s" : ""} Pending</p>
                      </Link>
                    )}
                    {notifCount > 0 && (
                      <Link href="/admin/notifications" onClick={() => setBellOpen(false)} className="flex items-center gap-2 px-3 py-2 rounded-xl" style={{ background: "rgba(255,255,255,0.06)" }}>
                        <Bell size={13} style={{ color: "#a78bfa" }} />
                        <p className="text-[12px] font-bold" style={{ color: "#FFFFFF" }}>{notifCount} New</p>
                      </Link>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
          <Link href="/admin/profile" className="w-9 h-9 rounded-full overflow-hidden flex-shrink-0" title="Edit profile"
            style={{ border: "1.5px solid rgba(255,255,255,0.25)", display:"block" }}>
            {photoUrl
              ? <Image src={photoUrl} alt={adminName} width={36} height={36} style={{ width:"100%", height:"100%", objectFit:"cover" }} />
              : <div className="w-full h-full flex items-center justify-center text-[10px] font-bold" style={{ background:"rgba(255,255,255,0.15)", color:"#FFFFFF" }}>{initials}</div>
            }
          </Link>
          <form action={logoutAction}>
            <button type="submit" title="Sign Out"
              className="w-9 h-9 rounded-lg flex items-center justify-center transition-all"
              style={{ color: "rgba(255,255,255,0.55)" }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = HOVER_BG; (e.currentTarget as HTMLElement).style.color = "#FFFFFF" }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.55)" }}
            >
              <LogOut size={15} />
            </button>
          </form>
        </div>
      </aside>

      {/* ── Mobile Top Bar (< md: 768px) ─────────────────────── */}
      <header
        className="md:hidden fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4 h-14"
        style={{ background: MOBILE_BG, borderBottom: `1px solid ${DIVIDER}` }}
      >
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg overflow-hidden flex-shrink-0" style={{ border: "1px solid rgba(255,255,255,0.2)" }}>
            <Image src="/brand/logo.jpg" alt="GroFast" width={32} height={32} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          </div>
          <span style={{ color: "#FFFFFF", fontFamily: "var(--font-bebas), sans-serif", fontSize: 18, letterSpacing: "0.14em" }}>GROFAST</span>
        </div>
        <div className="flex items-center gap-2">
          {/* Bell */}
          <div className="relative">
            <button
              onClick={() => setBellOpen(v => !v)}
              onBlur={() => setTimeout(() => setBellOpen(false), 150)}
              className="relative w-8 h-8 rounded-full flex items-center justify-center"
              style={{ background: "none", border: "none", color: "rgba(255,255,255,0.85)", cursor: "pointer" }}>
              <Bell size={18} />
              {notifCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full text-[8px] font-black flex items-center justify-center"
                  style={{ background: "#ff3b3b", color: "#FFFFFF", border: "1.5px solid #0a100d" }}>
                  {notifCount > 9 ? '9+' : notifCount}
                </span>
              )}
            </button>
            {bellOpen && (
              <div className="absolute top-full right-0 mt-2 z-50 rounded-2xl overflow-hidden"
                style={{ background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.1)", boxShadow: "0 8px 32px rgba(0,0,0,0.5)", minWidth: 248 }}>
                <div className="px-4 py-2.5 flex items-center justify-between" style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                  <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.4)" }}>Notifications</p>
                  {notifCount > 0 && <span className="text-[9px] font-bold px-2 py-0.5 rounded-full" style={{ background: "rgba(222,26,26,0.2)", color: "#ff6b6b" }}>{notifCount} unread</span>}
                </div>
                {notifCount === 0 && pendingLeaves === 0 ? (
                  <div className="px-4 py-5 text-center">
                    <p className="text-[12px]" style={{ color: "rgba(255,255,255,0.35)" }}>All caught up!</p>
                  </div>
                ) : (
                  <div className="px-3 py-2 flex flex-col gap-1.5">
                    {pendingLeaves > 0 && (
                      <Link href="/admin/leaves" onClick={() => setBellOpen(false)}
                        className="flex items-center gap-3 px-3 py-2.5 rounded-xl"
                        style={{ background: "rgba(222,26,26,0.12)" }}>
                        <CalendarOff size={14} style={{ color: "#ff6b6b", flexShrink: 0 }} />
                        <div>
                          <p className="text-[12px] font-bold" style={{ color: "#FFFFFF" }}>{pendingLeaves} Leave{pendingLeaves !== 1 ? "s" : ""} Pending</p>
                          <p className="text-[10px]" style={{ color: "rgba(255,255,255,0.4)" }}>Needs your approval</p>
                        </div>
                      </Link>
                    )}
                    {notifCount > 0 && (
                      <Link href="/admin/support" onClick={() => setBellOpen(false)}
                        className="flex items-center gap-3 px-3 py-2.5 rounded-xl"
                        style={{ background: "rgba(255,255,255,0.06)" }}>
                        <LifeBuoy size={14} style={{ color: "#a78bfa", flexShrink: 0 }} />
                        <div>
                          <p className="text-[12px] font-bold" style={{ color: "#FFFFFF" }}>{notifCount} New Notification{notifCount !== 1 ? "s" : ""}</p>
                          <p className="text-[10px]" style={{ color: "rgba(255,255,255,0.4)" }}>Tickets, leaves & more</p>
                        </div>
                      </Link>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0"
            style={{ border: "1.5px solid rgba(255,255,255,0.3)" }}>
            {photoUrl
              ? <Image src={photoUrl} alt={adminName} width={32} height={32} style={{ width:"100%", height:"100%", objectFit:"cover" }} />
              : <div className="w-full h-full flex items-center justify-center text-[11px] font-bold" style={{ background:"rgba(255,255,255,0.2)", color:"#FFFFFF" }}>{initials}</div>
            }
          </div>
        </div>
      </header>

      {/* ── Mobile Bottom Nav ─────────────────────────────────────── */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-50 flex items-center justify-around px-2"
        style={{
          background: "linear-gradient(90deg, #0a100d 0%, #de1a1a 100%)",
          borderTop: `1px solid ${DIVIDER}`,
          height: "64px",
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
      >
        {bottomNavItems.map(({ label, href, icon: Icon }) => {
          const active = isActive(href)
          return (
            <Link
              key={href} href={href}
              className="flex flex-col items-center justify-center gap-1 flex-1 py-2 rounded-xl transition-all"
              style={active ? { color: "#FFFFFF", background: "rgba(255,255,255,0.12)" } : { color: "rgba(255,255,255,0.5)" }}
            >
              <Icon size={20} strokeWidth={active ? 2.5 : 1.8} />
              <span className="text-[10px] font-semibold leading-none">{label}</span>
            </Link>
          )
        })}
        {/* More button */}
        <button
          onClick={() => setShowMore(true)}
          className="flex flex-col items-center justify-center gap-1 flex-1 py-2 rounded-xl transition-all"
          style={{ color: isMoreActive ? "#FFFFFF" : "rgba(255,255,255,0.5)", background: isMoreActive ? "rgba(255,255,255,0.12)" : "none", border: "none", cursor: "pointer" }}
        >
          <MoreHorizontal size={20} strokeWidth={isMoreActive ? 2.5 : 1.8} />
          <span className="text-[10px] font-semibold leading-none">More</span>
        </button>
      </nav>

      {/* ── More Sheet ─────────────────────────────────────────────── */}
      {showMore && (
        <div className="md:hidden fixed inset-0 z-[60]" onClick={() => setShowMore(false)}>
          <div className="absolute inset-0" style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }} />
          <div
            className="absolute bottom-0 left-0 right-0 rounded-t-3xl"
            style={{ background: "#0f0f0f", border: "1px solid rgba(255,255,255,0.08)" }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 pt-4 pb-3" style={{ borderBottom: `1px solid ${DIVIDER}` }}>
              <span className="text-[13px] font-bold" style={{ color: "rgba(255,255,255,0.7)" }}>More Pages</span>
              <button onClick={() => setShowMore(false)}
                style={{ background: "rgba(255,255,255,0.08)", border: "none", borderRadius: "50%", width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
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
                      ? { background: "rgba(255,255,255,0.18)", color: "#FFFFFF" }
                      : { background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.7)" }
                    }
                  >
                    <Icon size={22} strokeWidth={active ? 2.2 : 1.7} />
                    <span className="text-[11px] font-semibold text-center leading-tight">{label}</span>
                  </Link>
                )
              })}
              <form action={logoutAction}>
                <button type="submit"
                  className="flex flex-col items-center justify-center gap-2 p-4 rounded-2xl w-full transition-all"
                  style={{ background: "rgba(222,26,26,0.08)", color: "rgba(239,68,68,0.8)", border: "none", cursor: "pointer" }}>
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
