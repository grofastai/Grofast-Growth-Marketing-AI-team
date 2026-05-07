export default function AdminDashboardLoading() {
  return (
    <div className="p-4 md:p-6 xl:p-8 max-w-[1400px]">
      {/* Header skeleton */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <div className="h-8 w-56 rounded-lg mb-2" style={{ background: "#262626", animation: "pulse 1.5s ease-in-out infinite" }} />
          <div className="h-4 w-40 rounded" style={{ background: "#1A1A1A", animation: "pulse 1.5s ease-in-out infinite" }} />
        </div>
        <div className="flex gap-3 mt-1">
          <div className="h-9 w-28 rounded-lg" style={{ background: "#262626", animation: "pulse 1.5s ease-in-out infinite" }} />
          <div className="h-9 w-36 rounded-lg" style={{ background: "#262626", animation: "pulse 1.5s ease-in-out infinite" }} />
        </div>
      </div>

      {/* Metric cards skeleton */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="rounded-xl p-5" style={{ background: "#262626", border: "1px solid #2A2A2A" }}>
            <div className="w-9 h-9 rounded-lg mb-4" style={{ background: "#1A1A1A", animation: "pulse 1.5s ease-in-out infinite" }} />
            <div className="h-9 w-14 rounded mb-2" style={{ background: "#1A1A1A", animation: "pulse 1.5s ease-in-out infinite" }} />
            <div className="h-3 w-20 rounded" style={{ background: "#1A1A1A", animation: "pulse 1.5s ease-in-out infinite" }} />
          </div>
        ))}
      </div>

      {/* Bottom panels skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[0, 1].map(i => (
          <div key={i} className="rounded-xl p-5" style={{ background: "#262626", border: "1px solid #2A2A2A" }}>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div className="h-4 w-32 rounded" style={{ background: "#1A1A1A", animation: "pulse 1.5s ease-in-out infinite" }} />
              <div className="h-4 w-16 rounded" style={{ background: "#1A1A1A", animation: "pulse 1.5s ease-in-out infinite" }} />
            </div>
            <div className="space-y-2">
              {[0, 1, 2, 3].map(j => (
                <div key={j} className="flex items-center gap-3 px-3 py-2.5 rounded-lg"
                  style={{ background: "rgba(255,255,255,0.02)" }}>
                  <div className="w-7 h-7 rounded-full flex-shrink-0" style={{ background: "#1A1A1A", animation: "pulse 1.5s ease-in-out infinite" }} />
                  <div className="flex-1">
                    <div className="h-3 w-28 rounded mb-1.5" style={{ background: "#1A1A1A", animation: "pulse 1.5s ease-in-out infinite" }} />
                    <div className="h-2.5 w-20 rounded" style={{ background: "#1A1A1A", animation: "pulse 1.5s ease-in-out infinite" }} />
                  </div>
                  <div className="h-5 w-14 rounded-full" style={{ background: "#1A1A1A", animation: "pulse 1.5s ease-in-out infinite" }} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  )
}
