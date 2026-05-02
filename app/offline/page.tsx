'use client'

export default function OfflinePage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center"
      style={{ background: '#0D0D0D' }}>

      <div
        className="w-20 h-20 rounded-2xl flex items-center justify-center mb-6"
        style={{ background: 'rgba(220,38,38,0.1)', border: '1px solid rgba(220,38,38,0.22)' }}
      >
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="1" y1="1" x2="23" y2="23" />
          <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
          <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
          <path d="M10.71 5.05A16 16 0 0 1 22.56 9" />
          <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
          <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
          <line x1="12" y1="20" x2="12.01" y2="20" />
        </svg>
      </div>

      <h1 className="text-2xl font-bold mb-2" style={{ color: '#FFFFFF' }}>
        You're offline
      </h1>
      <p className="mb-8 text-sm" style={{ color: 'rgba(255,255,255,0.45)' }}>
        Check your internet connection and try again.
      </p>

      <button
        onClick={() => window.location.reload()}
        className="px-6 py-3 rounded-xl font-semibold text-sm transition-all"
        style={{
          background: '#DC2626',
          color: '#0D0D0D',
        }}
      >
        Try again
      </button>
    </div>
  )
}
