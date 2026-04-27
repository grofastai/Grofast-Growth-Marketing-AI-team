export default function MemberLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-black text-white">
      {/* Top nav bar */}
      <nav className="fixed top-0 inset-x-0 z-40 bg-zinc-900 border-b border-zinc-800 h-14 flex items-center px-4 gap-3">
        <span
          className="text-lg font-bold text-white"
          style={{ fontFamily: 'var(--font-jakarta)' }}
        >
          Gro<span className="text-yellow-400">Fast</span>
        </span>
        <span className="text-zinc-600 text-sm ml-auto">Team Portal</span>
      </nav>
      <main className="pt-14 min-h-screen">{children}</main>
    </div>
  )
}
