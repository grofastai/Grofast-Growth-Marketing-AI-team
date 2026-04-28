"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  LayoutDashboard, ClipboardList, Target, CalendarOff, Megaphone, User, LogOut,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { logoutAction } from "@/lib/actions/auth"

const navItems = [
  { label: "Dashboard",     href: "/member/dashboard",      icon: LayoutDashboard },
  { label: "Daily Update",  href: "/member/update",         icon: ClipboardList },
  { label: "My Tasks",      href: "/member/tasks",          icon: Target },
  { label: "Leaves",        href: "/member/leaves",         icon: CalendarOff },
  { label: "Announcements", href: "/member/announcements",  icon: Megaphone },
  { label: "Profile",       href: "/member/profile",        icon: User },
]

export default function MemberSidebar({ name, employeeId }: { name: string; employeeId: string }) {
  const pathname = usePathname()
  const initials = name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()

  return (
    <aside
      className="fixed left-0 top-0 h-screen w-[240px] flex flex-col z-50 select-none"
      style={{
        background: 'linear-gradient(180deg, #0C0A1E 0%, #110E28 100%)',
        borderRight: '1px solid rgba(109,93,246,0.12)',
      }}
    >
      {/* Subtle dot grid texture */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: 'radial-gradient(rgba(109,93,246,0.06) 1px, transparent 1px)',
          backgroundSize: '24px 24px',
        }}
      />

      {/* Logo */}
      <div className="relative z-10 px-5 py-5" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{
              background: 'linear-gradient(135deg, #FF5A35, #FF8060)',
              boxShadow: '0 4px 16px rgba(255,90,53,0.45)',
            }}
          >
            <span className="text-white text-base font-black" style={{ fontFamily: 'var(--font-jakarta)' }}>G</span>
          </div>
          <div>
            <p className="text-white text-[14px] tracking-[0.08em] font-black" style={{ fontFamily: 'var(--font-jakarta)' }}>GROFAST</p>
            <p className="text-[9px] tracking-[0.2em] uppercase font-medium mt-0.5" style={{ color: 'rgba(255,255,255,0.28)' }}>Member Portal</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="relative z-10 flex-1 px-3 pt-5 pb-2 overflow-y-auto">
        <p className="text-[9px] tracking-[0.22em] uppercase px-3 pb-3 font-semibold" style={{ color: 'rgba(255,255,255,0.2)' }}>
          Navigation
        </p>
        <div className="space-y-0.5">
          {navItems.map(({ label, href, icon: Icon }) => {
            const isActive = pathname === href || (href !== "/member/dashboard" && pathname.startsWith(href))
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "relative flex items-center gap-3 px-3 py-[9px] rounded-xl transition-all duration-150",
                  isActive ? "text-white" : "text-white/40 hover:text-white/70 hover:bg-white/[0.04]"
                )}
                style={isActive ? {
                  background: 'rgba(255,90,53,0.15)',
                  border: '1px solid rgba(255,90,53,0.25)',
                } : { border: '1px solid transparent' }}
              >
                {isActive && (
                  <span
                    className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full"
                    style={{ background: '#FF8060', boxShadow: '0 0 8px rgba(255,128,96,0.6)' }}
                  />
                )}
                <Icon size={15} className="flex-shrink-0" style={isActive ? { color: '#FF8060' } : {}} />
                <span className="text-[13px] font-medium">{label}</span>
                {isActive && (
                  <span
                    className="ml-auto w-1.5 h-1.5 rounded-full flex-shrink-0"
                    style={{ background: '#FF8060', boxShadow: '0 0 6px rgba(255,128,96,0.7)' }}
                  />
                )}
              </Link>
            )
          })}
        </div>
      </nav>

      {/* User + Logout */}
      <div className="relative z-10 px-3 pb-4 pt-3 space-y-1" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
            style={{
              background: 'rgba(255,90,53,0.15)',
              border: '1.5px solid rgba(255,90,53,0.3)',
            }}
          >
            <span className="text-[11px] font-bold" style={{ fontFamily: 'var(--font-jakarta)', color: '#FF8060' }}>{initials}</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold text-white leading-none truncate">{name}</p>
            <p className="text-[10px] mt-0.5" style={{ color: 'rgba(255,255,255,0.28)' }}>#{employeeId}</p>
          </div>
        </div>
        <form action={logoutAction}>
          <button
            type="submit"
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors w-full hover:bg-white/[0.05]"
            style={{ color: 'rgba(255,255,255,0.35)' }}
          >
            <LogOut size={14} />
            <span className="text-[13px]">Sign Out</span>
          </button>
        </form>
      </div>
    </aside>
  )
}
