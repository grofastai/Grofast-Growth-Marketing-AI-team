export default function ClientsLoading() {
  return (
    <div className="p-8 max-w-[1400px]">
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="h-8 w-28 rounded-lg mb-2" style={{ background: "#262626", animation: "pulse 1.5s ease-in-out infinite" }} />
          <div className="h-4 w-56 rounded" style={{ background: "#1A1A1A", animation: "pulse 1.5s ease-in-out infinite" }} />
        </div>
        <div className="h-9 w-28 rounded-lg" style={{ background: "#262626", animation: "pulse 1.5s ease-in-out infinite" }} />
      </div>
      <div className="grid grid-cols-4 gap-3 mb-6">
        {[0,1,2,3].map(i => (
          <div key={i} className="rounded-xl p-5 flex items-center gap-4" style={{ background: "#262626", border: "1px solid #2A2A2A" }}>
            <div className="w-9 h-9 rounded-lg flex-shrink-0" style={{ background: "#1A1A1A", animation: "pulse 1.5s ease-in-out infinite" }} />
            <div>
              <div className="h-7 w-8 rounded mb-1" style={{ background: "#1A1A1A", animation: "pulse 1.5s ease-in-out infinite" }} />
              <div className="h-3 w-20 rounded" style={{ background: "#1A1A1A", animation: "pulse 1.5s ease-in-out infinite" }} />
            </div>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-4">
        {[0,1,2,3,4,5].map(i => (
          <div key={i} className="rounded-xl p-5" style={{ background: "#262626", border: "1px solid #2A2A2A", height: 220 }}>
            <div className="h-4 w-16 rounded-full mb-3" style={{ background: "#1A1A1A", animation: "pulse 1.5s ease-in-out infinite" }} />
            <div className="h-5 w-40 rounded mb-4" style={{ background: "#1A1A1A", animation: "pulse 1.5s ease-in-out infinite" }} />
            <div className="space-y-2">
              {[0,1,2].map(j => <div key={j} className="h-3 w-32 rounded" style={{ background: "#1A1A1A", animation: "pulse 1.5s ease-in-out infinite" }} />)}
            </div>
          </div>
        ))}
      </div>
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}`}</style>
    </div>
  )
}
