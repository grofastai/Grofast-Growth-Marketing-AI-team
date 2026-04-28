'use client'

import { useActionState, useState } from 'react'
import { loginAction } from '@/lib/actions/auth'

export default function LoginPage() {
  const [state, action, pending] = useActionState(loginAction, null)
  const [showPassword, setShowPassword] = useState(false)

  return (
    <div className="min-h-screen flex" style={{ background: '#0D0D0D' }}>

      {/* ── Left brand panel ─────────────────────────────────────────── */}
      <div className="hidden lg:flex flex-col justify-between w-[42%] p-12 relative" style={{ borderRight: '1px solid #1A1A1A' }}>

        {/* Lime accent line top */}
        <div className="absolute top-0 left-0 w-[3px] h-full" style={{ background: '#A3E635' }} />

        {/* Logo */}
        <div className="pl-2">
          <div className="flex items-center gap-3 mb-16">
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center"
              style={{ background: '#A3E635' }}
            >
              <span className="font-black text-lg" style={{ color: '#0D0D0D', fontFamily: 'var(--font-jakarta)' }}>G</span>
            </div>
            <div>
              <p className="text-[15px] tracking-[0.12em] font-black" style={{ fontFamily: 'var(--font-jakarta)', color: '#FFFFFF' }}>GROFAST</p>
              <p className="text-[9px] tracking-[0.22em] uppercase font-medium mt-0.5" style={{ color: 'rgba(255,255,255,0.25)' }}>Growth Marketing</p>
            </div>
          </div>

          <h1 className="text-[42px] font-black leading-[1.1] mb-5" style={{ color: '#FFFFFF', fontFamily: 'var(--font-jakarta)' }}>
            Run your team<br />
            <span style={{ color: '#A3E635' }}>with precision.</span>
          </h1>
          <p className="text-[15px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.38)' }}>
            Track attendance, manage tasks, and keep every project on time — all in one place.
          </p>
        </div>

        {/* Bottom features */}
        <div className="pl-2 space-y-4">
          {[
            { label: 'Real-time team tracking' },
            { label: 'Daily update submissions' },
            { label: 'Project & client management' },
          ].map(({ label }) => (
            <div key={label} className="flex items-center gap-3">
              <span className="w-[6px] h-[6px] rounded-full flex-shrink-0" style={{ background: '#A3E635' }} />
              <span className="text-[13px] font-medium" style={{ color: 'rgba(255,255,255,0.45)' }}>{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Right form panel ──────────────────────────────────────────── */}
      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-[360px]">

          {/* Mobile logo */}
          <div className="flex items-center gap-2.5 mb-10 lg:hidden">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: '#A3E635' }}>
              <span className="font-black" style={{ color: '#0D0D0D', fontFamily: 'var(--font-jakarta)' }}>G</span>
            </div>
            <span className="text-[16px] font-black tracking-wide" style={{ color: '#FFFFFF', fontFamily: 'var(--font-jakarta)' }}>GROFAST</span>
          </div>

          {/* Heading */}
          <div className="mb-8">
            <h2 className="text-[28px] font-black leading-tight mb-2" style={{ color: '#FFFFFF', fontFamily: 'var(--font-jakarta)' }}>
              Welcome back
            </h2>
            <p className="text-[13px]" style={{ color: 'rgba(255,255,255,0.38)' }}>
              Sign in with your Employee ID and password
            </p>
          </div>

          <form action={action} className="space-y-4">
            {/* Employee ID */}
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-[0.14em] mb-2" style={{ color: 'rgba(255,255,255,0.35)' }}>
                Employee ID
              </label>
              <input
                name="employee_id"
                type="text"
                placeholder="e.g. GF001"
                required
                autoComplete="username"
                className="w-full rounded-lg px-4 py-3.5 text-[14px] outline-none transition-all"
                style={{
                  background: '#141414',
                  border: '1px solid #2A2A2A',
                  color: '#FFFFFF',
                }}
                onFocus={e => {
                  e.currentTarget.style.borderColor = 'rgba(163,230,53,0.5)'
                  e.currentTarget.style.background = '#161616'
                }}
                onBlur={e => {
                  e.currentTarget.style.borderColor = '#2A2A2A'
                  e.currentTarget.style.background = '#141414'
                }}
              />
            </div>

            {/* Password */}
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-[0.14em] mb-2" style={{ color: 'rgba(255,255,255,0.35)' }}>
                Password
              </label>
              <div className="relative">
                <input
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  required
                  autoComplete="current-password"
                  className="w-full rounded-lg px-4 py-3.5 pr-12 text-[14px] outline-none transition-all"
                  style={{
                    background: '#141414',
                    border: '1px solid #2A2A2A',
                    color: '#FFFFFF',
                  }}
                  onFocus={e => {
                    e.currentTarget.style.borderColor = 'rgba(163,230,53,0.5)'
                    e.currentTarget.style.background = '#161616'
                  }}
                  onBlur={e => {
                    e.currentTarget.style.borderColor = '#2A2A2A'
                    e.currentTarget.style.background = '#141414'
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  tabIndex={-1}
                  className="absolute right-4 top-1/2 -translate-y-1/2 transition-opacity hover:opacity-70"
                  style={{ color: 'rgba(255,255,255,0.3)' }}
                >
                  {showPassword ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                      <line x1="1" y1="1" x2="23" y2="23"/>
                    </svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                      <circle cx="12" cy="12" r="3"/>
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {/* Error */}
            {state?.error && (
              <div
                className="flex items-start gap-3 rounded-lg px-4 py-3 text-sm"
                style={{ background: 'rgba(255,68,68,0.06)', border: '1px solid rgba(255,68,68,0.15)', color: '#FF6B6B' }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="flex-shrink-0 mt-0.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                <span>{state.error}</span>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={pending}
              className="w-full font-bold rounded-lg py-3.5 text-[14px] transition-all mt-2"
              style={{
                background: pending ? '#6B8C1E' : '#A3E635',
                color: '#0D0D0D',
                opacity: pending ? 0.7 : 1,
                cursor: pending ? 'not-allowed' : 'pointer',
              }}
            >
              {pending ? 'Signing in…' : 'Sign in →'}
            </button>
          </form>

          <p className="text-center text-[12px] mt-8" style={{ color: 'rgba(255,255,255,0.2)' }}>
            Forgot your password? Contact your admin.
          </p>
        </div>
      </div>
    </div>
  )
}
