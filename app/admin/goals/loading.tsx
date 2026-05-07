export default function GoalsLoading() {
  return (
    <div className="p-4 md:p-6 xl:p-8 max-w-[1400px]">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
        <div>
          <div className="h-8 w-24 rounded-lg mb-2" style={{ background: "#262626", animation: "pulse 1.5s ease-in-out infinite" }} />
          <div className="h-4 w-56 rounded" style={{ background: "#1A1A1A", animation: "pulse 1.5s ease-in-out infinite" }} />
        </div>
        <div className="h-9 w-28 rounded-lg" style={{ background: "#262626", animation: "pulse 1.5s ease-in-out infinite" }} />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[0, 1, 2].map(i => (
          <div key={i} className="rounded-xl p-4" style={{ background: "#262626", border: "1px solid #2A2A2A", minHeight: 420 }}>
            <div className="h-5 w-24 rounded mb-4" style={{ background: "#1A1A1A", animation: "pulse 1.5s ease-in-out infinite" }} />
            <div className="space-y-3">
              {[0, 1, 2].map(j => (
                <div key={j} className="rounded-xl p-3.5" style={{ background: "#1A1A1A", animation: "pulse 1.5s ease-in-out infinite", height: 90 }} />
              ))}
            </div>
          </div>
        ))}
      </div>
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }`}</style>
    </div>
  )
}
