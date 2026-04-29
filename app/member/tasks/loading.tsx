export default function TasksLoading() {
  return (
    <div className="p-8 max-w-[800px]">
      <div className="h-8 w-28 rounded-lg mb-2" style={{ background: "#262626", animation: "pulse 1.5s ease-in-out infinite" }} />
      <div className="h-4 w-64 rounded mb-6" style={{ background: "#1A1A1A", animation: "pulse 1.5s ease-in-out infinite" }} />
      <div className="flex gap-2 mb-5">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="h-9 w-24 rounded-lg" style={{ background: "#262626", animation: "pulse 1.5s ease-in-out infinite" }} />
        ))}
      </div>
      <div className="space-y-2">
        {[0, 1, 2, 3, 4].map(i => (
          <div key={i} className="rounded-xl p-4 flex items-center gap-4"
            style={{ background: "#262626", border: "1px solid #2A2A2A" }}>
            <div className="w-5 h-5 rounded-full flex-shrink-0" style={{ background: "#1A1A1A", animation: "pulse 1.5s ease-in-out infinite" }} />
            <div className="flex-1">
              <div className="h-4 w-48 rounded mb-2" style={{ background: "#1A1A1A", animation: "pulse 1.5s ease-in-out infinite" }} />
              <div className="h-3 w-32 rounded" style={{ background: "#1A1A1A", animation: "pulse 1.5s ease-in-out infinite" }} />
            </div>
            <div className="h-5 w-20 rounded" style={{ background: "#1A1A1A", animation: "pulse 1.5s ease-in-out infinite" }} />
          </div>
        ))}
      </div>
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }`}</style>
    </div>
  )
}
