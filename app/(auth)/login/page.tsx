'use client'

import { useActionState, useState } from 'react'
import { loginAction } from '@/lib/actions/auth'

export default function LoginPage() {
  const [state, action, pending] = useActionState(loginAction, null)
  const [showPassword, setShowPassword] = useState(false)

  return (
    <div className="min-h-screen flex" style={{ background: '#F4F5FB' }}>

      {/* ── Left brand panel ─────────────────────────────────────────── */}
      <div
        className="hidden lg:flex flex-col justify-between w-[42%] p-12 relative overflow-hidden"
        style={{ background: '#0C0A1E' }}
      >
        {/* Subtle geometric grid */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: 'radial-gradient(rgba(109,93,246,0.12) 1px, transparent 1px)',
            backgroundSize: '32px 32px',
          }}
        />
        {/* Violet glow */}
        <div
          className="absolute top-0 left-0 w-[400px] h-[400px] pointer-events-none"
          style={{
            background: 'radial-gradient(circle, rgba(109,93,246,0.18) 0%, transparent 65%)',
            transform: 'translate(-30%, -30%)',
          }}
        />

        {/* Logo */}
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-12">
            <div
              className="w-10 h-10 rounded-2xl flex items-center justify-center"
              style={{
                background: 'linear-gradient(135deg, #6D5DF6, #9B8FFF)',
                boxShadow: '0 8px 24px rgba(109,93,246,0.45)',
              }}
            >
              <span className="text-white text-lg font-black" style={{ fontFamily: 'var(--font-jakarta)' }}>G</span>
            </div>
            <div>
              <p className="text-white text-[15px] tracking-[0.1em] font-black" style={{ fontFamily: 'var(--font-jakarta)' }}>GROFAST</p>
              <p className="text-[10px] tracking-[0.2em] uppercase" style={{ color: 'rgba(255,255,255,0.3)' }}>Growth Marketing</p>
            </div>
          </div>

          <h1 className="text-[38px] font-black leading-[1.15] mb-5" style={{ color: '#FFFFFF', fontFamily: 'var(--font-jakarta)' }}>
            Run your team<br />
            <span style={{ color: '#9B8FFF' }}>with precision.</span>
          </h1>
          <p className="text-[15px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.45)' }}>
            Track attendance, manage tasks, and keep every project on time — all in one place.
          </p>
        </div>

        {/* Bottom features */}
        <div className="relative z-10 space-y-3">
          {[
            { icon: '⚡', label: 'Real-time team tracking' },
            { icon: '📋', label: 'Daily update submissions' },
            { icon: '📊', label: 'Project & client management' },
          ].map(({ icon, label }) => (
            <div key={label} className="flex items-center gap-3">
              <span className="text-[15px]">{icon}</span>
              <span className="text-[13px]" style={{ color: 'rgba(255,255,255,0.45)' }}>{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Right form panel ──────────────────────────────────────────── */}
      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-[380px]">

          {/* Mobile logo */}
          <div className="flex items-center gap-2.5 mb-10 lg:hidden">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, #6D5DF6, #9B8FFF)', boxShadow: '0 4px 16px rgba(109,93,246,0.4)' }}
            >
              <span className="text-white font-black" style={{ fontFamily: 'var(--font-jakarta)' }}>G</span>
            </div>
            <span className="text-[16px] font-black tracking-wide" style={{ color: '#0C0A1E', fontFamily: 'var(--font-jakarta)' }}>GROFAST</span>
          </div>

          {/* Heading */}
          <div className="mb-8">
            <h2 className="text-[30px] font-black leading-tight mb-2" style={{ color: '#0C0A1E', fontFamily: 'var(--font-jakarta)' }}>
              Welcome back
            </h2>
            <p className="text-[14px]" style={{ color: '#6B6B8E' }}>
              Sign in with your Employee ID and password
            </p>
          </div>

          <form action={action} className="space-y-4">
            {/* Employee ID */}
            <div>
              <label
                className="block text-[11px] font-bold uppercase tracking-[0.12em] mb-2"
                style={{ color: '#6B6B8E' }}
              >
                Employee ID
              </label>
              <input
                name="employee_id"
                type="text"
                placeholder="e.g. GF001"
                required
                autoComplete="username"
                className="w-full rounded-xl px-4 py-3.5 text-[14px] outline-none transition-all"
                style={{
                  background: '#FFFFFF',
                  border: '1.5px solid #E4E5F0',
                  color: '#0C0A1E',
                  boxShadow: '0 1px 3px rgba(12,10,30,0.05)',
                }}
                onFocus={e => {
                  e.currentTarget.style.borderColor = '#6D5DF6'
                  e.currentTarget.style.boxShadow = '0 0 0 3px rgba(109,93,246,0.1)'
                }}
                onBlur={e => {
                  e.currentTarget.style.borderColor = '#E4E5F0'
                  e.currentTarget.style.boxShadow = '0 1px 3px rgba(12,10,30,0.05)'
                }}
              />
            </div>

            {/* Password */}
            <div>
              <label
                className="block text-[11px] font-bold uppercase tracking-[0.12em] mb-2"
                style={{ color: '#6B6B8E' }}
              >
                Password
              </label>
              <div className="relative">
                <input
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  required
                  autoComplete="current-password"
                  className="w-full rounded-xl px-4 py-3.5 pr-12 text-[14px] outline-none transition-all"
                  style={{
                    background: '#FFFFFF',
                    border: '1.5px solid #E4E5F0',
                    color: '#0C0A1E',
                    boxShadow: '0 1px 3px rgba(12,10,30,0.05)',
                  }}
                  onFocus={e => {
                    e.currentTarget.style.borderColor = '#6D5DF6'
                    e.currentTarget.style.boxShadow = '0 0 0 3px rgba(109,93,246,0.1)'
                  }}
                  onBlur={e => {
                    e.currentTarget.style.borderColor = '#E4E5F0'
                    e.currentTarget.style.boxShadow = '0 1px 3px rgba(12,10,30,0.05)'
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  tabIndex={-1}
                  className="absolute right-4 top-1/2 -translate-y-1/2 transition-colors"
                  style={{ color: '#9898B8' }}
                >
                  {showPassword ? (
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                      <line x1="1" y1="1" x2="23" y2="23"/>
                    </svg>
                  ) : (
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
                className="flex items-start gap-3 rounded-xl px-4 py-3 text-sm"
                style={{ background: '#FEF2F2', border: '1px solid rgba(239,68,68,0.25)', color: '#DC2626' }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="flex-shrink-0 mt-0.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                <span>{state.error}</span>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={pending}
              className="w-full font-bold rounded-xl py-3.5 text-[14px] transition-all mt-2"
              style={{
                background: pending ? '#CCCDE0' : '#0C0A1E',
                color: '#FFFFFF',
                boxShadow: pending ? 'none' : '0 4px 20px rgba(12,10,30,0.25)',
                cursor: pending ? 'not-allowed' : 'pointer',
              }}
            >
              {pending ? 'Signing in…' : 'Sign in →'}
            </button>
          </form>

          <p className="text-center text-[12px] mt-8" style={{ color: '#9898B8' }}>
            Forgot your password? Contact your admin.
          </p>
        </div>
      </div>
    </div>
  )
}
