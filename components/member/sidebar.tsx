"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  LayoutDashboard, ClipboardList, Target, CalendarOff,
  Megaphone, User, LogOut, Clock,
} from "lucide-react"
import { logoutAction } from "@/lib/actions/auth"

const navItems = [
  { label: "Dashboard",     href: "/member/dashboard",     icon: LayoutDashboard },
  { label: "Attendance",    href: "/member/attendance",    icon: Clock },
  { label: "Daily Update",  href: "/member/update",        icon: ClipboardList },
  { label: "My Tasks",      href: "/member/tasks",         icon: Target },
  { label: "Leaves",        href: "/member/leaves",        icon: CalendarOff },
  { label: "Announcements", href: "/member/announcements", icon: Megaphone },
  { label: "Profile",       href: "/member/profile",       icon: User },
]

const bottomNavItems = [
  { label: "Home",       href: "/member/dashboard",     icon: LayoutDashboard },
  { label: "Attendance", href: "/member/attendance",    icon: Clock },
  { label: "Update",     href: "/member/update",        icon: ClipboardList },
  { label: "Tasks",      href: "/member/tasks",         icon: Target },
  { label: "Profile",    href: "/member/profile",       icon: User },
]

export default function MemberSidebar({ name, employeeId }: { name: string; employeeId: string }) {
  const pathname = usePathname()
  const initials = name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()

  function isActive(href: string) {
    return pathname === href || (href !== "/member/dashboard" && pathname.startsWith(href))
  }

  return (
    <>
      {/* ── Desktop Sidebar (lg+) ─────────────────────────── */}
      <aside
        className="hidden lg:flex fixed left-0 top-0 h-screen w-[240px] flex-col z-50 select-none"
        style={{ background: "#FFFFFF", borderRight: "1px solid #E5E7EB" }}
      >
        {/* Logo */}
        <div className="px-5 py-[18px]" style={{ borderBottom: "1px solid #E5E7EB" }}>
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ background: "#A3E635" }}
            >
              <span className="text-[15px] font-black" style={{ color: "#0D0D0D" }}>G</span>
            </div>
            <div>
              <p className="text-[13px] tracking-[0.12em] font-black" style={{ color: "#111827" }}>GROFAST</p>
              <p className="text-[9px] tracking-[0.2em] uppercase font-medium mt-0.5" style={{ color: "rgba(17,24,39,0.4)" }}>
                Member Portal
              </p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 pt-5 pb-2 overflow-y-auto">
          <p className="text-[9px] tracking-[0.28em] uppercase px-3 pb-3 font-bold" style={{ color: "rgba(17,24,39,0.3)" }}>
            Menu
          </p>
          <div className="space-y-[2px]">
            {navItems.map(({ label, href, icon: Icon }) => {
              const active = isActive(href)
              return (
                <Link
                  key={href}
                  href={href}
                  className="relative flex items-center gap-3 px-3 py-[9px] rounded-lg transition-all duration-150"
                  style={active
                    ? { background: "rgba(163,230,53,0.1)", color: "#5A9E1A" }
                    : { color: "rgba(17,24,39,0.5)" }
                  }
                >
                  {active && (
                    <span
                      className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] rounded-r-full"
                      style={{ height: "18px", background: "#A3E635" }}
                    />
                  )}
                  <Icon size={15} className="flex-shrink-0" />
                  <span className="text-[13px] font-medium">{label}</span>
                </Link>
              )
            })}
          </div>
        </nav>

        {/* User + Logout */}
        <div className="px-3 pb-4 pt-3" style={{ borderTop: "1px solid #E5E7EB" }}>
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg mb-0.5">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
              style={{ background: "rgba(163,230,53,0.12)", border: "1px solid rgba(163,230,53,0.3)" }}
            >
              <span className="text-[11px] font-bold" style={{ color: "#5A9E1A" }}>{initials}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-semibold leading-none truncate" style={{ color: "#111827" }}>{name}</p>
              <p className="text-[10px] mt-0.5" style={{ color: "rgba(17,24,39,0.4)" }}>#{employeeId}</p>
            </div>
          </div>
          <form action={logoutAction}>
            <button
              type="submit"
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all w-full"
              style={{ color: "rgba(17,24,39,0.45)" }}
            >
              <LogOut size={14} />
              <span className="text-[13px] font-medium">Sign Out</span>
            </button>
          </form>
        </div>
      </aside>

      {/* ── Mobile Top Bar (< lg) ─────────────────────────── */}
      <header
        className="lg:hidden fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4 h-14"
        style={{ background: "#FFFFFF", borderBottom: "1px solid #E5E7EB" }}
      >
        <div className="flex items-center gap-2.5">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ background: "#A3E635" }}
          >
            <span className="text-[12px] font-black" style={{ color: "#0D0D0D" }}>G</span>
          </div>
          <span className="text-[13px] tracking-[0.1em] font-black" style={{ color: "#111827" }}>GROFAST</span>
        </div>
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold"
          style={{ background: "rgba(163,230,53,0.12)", border: "1px solid rgba(163,230,53,0.3)", color: "#5A9E1A" }}
        >
          {initials}
        </div>
      </header>

      {/* ── Mobile Bottom Nav (< lg) ──────────────────────── */}
      <nav
        className="lg:hidden fixed bottom-0 left-0 right-0 z-50 flex items-center justify-around px-2"
        style={{
          background: "#FFFFFF",
          borderTop: "1px solid #E5E7EB",
          height: "64px",
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
      >
        {bottomNavItems.map(({ label, href, icon: Icon }) => {
          const active = isActive(href)
          return (
            <Link
              key={href}
              href={href}
              className="flex flex-col items-center justify-center gap-1 flex-1 py-2 rounded-xl transition-all"
              style={active
                ? { color: "#5A9E1A" }
                : { color: "rgba(17,24,39,0.4)" }
              }
            >
              <Icon size={20} strokeWidth={active ? 2.5 : 1.8} />
              <span className="text-[10px] font-medium leading-none">{label}</span>
            </Link>
          )
        })}
      </nav>
    </>
  )
}
