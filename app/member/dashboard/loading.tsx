export default function MemberDashboardLoading() {
  const sk = { background: "#E5E7EB", borderRadius: 8, animation: "pulse 1.5s ease-in-out infinite" } as const
  return (
    <div className="p-5 md:p-6 xl:p-8 max-w-[1600px]" style={{ background: "#F1F2F6", minHeight: "100vh" }}>
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-7">
        <div>
          <div style={{ ...sk, height: 32, width: 280, marginBottom: 8 }} />
          <div style={{ ...sk, height: 16, width: 160 }} />
        </div>
        <div className="flex items-center gap-3">
          <div style={{ ...sk, height: 42, width: 220, borderRadius: 12 }} className="hidden md:block" />
          <div style={{ ...sk, height: 40, width: 40, borderRadius: 12 }} />
          <div style={{ ...sk, height: 40, width: 70, borderRadius: 8 }} />
        </div>
      </div>

      {/* 4 stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        {[0,1,2,3].map(i => (
          <div key={i} className="rounded-2xl p-5" style={{ background: "#FFFFFF", border: "1px solid #E8E9EF" }}>
            <div style={{ ...sk, height: 44, width: 44, borderRadius: "50%", marginBottom: 12 }} />
            <div style={{ ...sk, height: 32, width: 60, marginBottom: 6 }} />
            <div style={{ ...sk, height: 14, width: 90, marginBottom: 12 }} />
            <div style={{ ...sk, height: 36, width: "100%", borderRadius: 4 }} />
            <div style={{ ...sk, height: 12, width: 120, marginTop: 8 }} />
          </div>
        ))}
      </div>

      {/* Alert banner */}
      <div className="rounded-2xl p-5 mb-5" style={{ background: "#FFFFFF", border: "1px solid #E8E9EF" }}>
        <div className="flex items-center gap-4">
          <div style={{ ...sk, height: 44, width: 44, borderRadius: "50%" }} />
          <div style={{ flex: 1 }}>
            <div style={{ ...sk, height: 16, width: 260, marginBottom: 6 }} />
            <div style={{ ...sk, height: 12, width: 200 }} />
          </div>
          <div style={{ ...sk, height: 42, width: 140, borderRadius: 12 }} />
        </div>
      </div>

      {/* 2-col */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-5 mb-5">
        <div className="rounded-2xl p-5" style={{ background: "#FFFFFF", border: "1px solid #E8E9EF" }}>
          <div style={{ ...sk, height: 16, width: 80, marginBottom: 24 }} />
          <div className="flex flex-col items-center py-12 gap-4">
            <div style={{ ...sk, height: 80, width: 80, borderRadius: "50%" }} />
            <div style={{ ...sk, height: 16, width: 160 }} />
            <div style={{ ...sk, height: 12, width: 200 }} />
          </div>
        </div>
        <div className="space-y-3">
          {[0,1,2].map(i => (
            <div key={i} className="rounded-2xl p-4" style={{ background: "#FFFFFF", border: "1px solid #E8E9EF" }}>
              <div className="flex items-center gap-3">
                <div style={{ ...sk, height: 40, width: 40, borderRadius: "50%" }} />
                <div style={{ flex: 1 }}>
                  <div style={{ ...sk, height: 22, width: 40, marginBottom: 4 }} />
                  <div style={{ ...sk, height: 12, width: 90 }} />
                </div>
              </div>
            </div>
          ))}
          <div className="rounded-2xl p-4" style={{ background: "#111111" }}>
            <div style={{ ...sk, height: 14, width: 100, background: "#222", marginBottom: 12 }} />
            <div className="grid grid-cols-3 gap-2">
              {[0,1,2].map(i => (
                <div key={i} style={{ ...sk, height: 52, background: "#1A1A1A", borderRadius: 12 }} />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom 2-col */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {[0,1].map(i => (
          <div key={i} className="rounded-2xl p-5" style={{ background: "#FFFFFF", border: "1px solid #E8E9EF" }}>
            <div style={{ ...sk, height: 14, width: 120, marginBottom: 16 }} />
            {[0,1,2].map(j => (
              <div key={j} className="flex items-start gap-3 mb-3">
                <div style={{ ...sk, height: 36, width: 36, borderRadius: 10 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ ...sk, height: 14, width: 160, marginBottom: 4 }} />
                  <div style={{ ...sk, height: 11, width: 200 }} />
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>

      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.45}}`}</style>
    </div>
  )
}
