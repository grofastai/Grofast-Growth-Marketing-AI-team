'use client'

import { useActionState, useState } from 'react'
import { loginAction } from '@/lib/actions/auth'

export default function LoginPage() {
  const [state, action, pending] = useActionState(loginAction, null)
  const [showPassword, setShowPassword] = useState(false)

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ background: '#0B0F14' }}
    >
      {/* Subtle violet glow behind card */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse 60% 50% at 50% 40%, rgba(109,93,246,0.08) 0%, transparent 70%)',
        }}
      />

      <div className="w-full max-w-sm relative">
        {/* Logo */}
        <div className="text-center mb-8">
          <div
            className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4"
            style={{
              background: 'linear-gradient(135deg, #6D5DF6, #0E3B3B)',
              boxShadow: '0 8px 28px rgba(109,93,246,0.4)',
            }}
          >
            <span className="text-white text-2xl font-black" style={{ fontFamily: 'var(--font-jakarta)' }}>G</span>
          </div>
          <h1 className="text-2xl font-black tracking-tight" style={{ color: '#E6EDF3', fontFamily: 'var(--font-jakarta)' }}>
            GROFAST
          </h1>
          <p className="text-sm mt-1" style={{ color: '#6B7280' }}>Team Tracking Platform</p>
        </div>

        {/* Card */}
        <div
          className="rounded-2xl p-8"
          style={{
            background: '#111827',
            border: '1px solid #1F2937',
            boxShadow: '0 0 40px rgba(109,93,246,0.08), 0 4px 24px rgba(0,0,0,0.4)',
          }}
        >
          <h2 className="font-bold text-lg mb-1" style={{ color: '#E6EDF3', fontFamily: 'var(--font-jakarta)' }}>
            Welcome back
          </h2>
          <p className="text-xs mb-6" style={{ color: '#6B7280' }}>
            Sign in with your Employee ID, email and password
          </p>

          <form action={action} className="space-y-4">
            {/* Employee ID */}
            <div>
              <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: '#9CA3AF' }}>
                Employee ID
              </label>
              <input
                name="employee_id"
                type="text"
                placeholder="e.g. GF001"
                required
                autoComplete="username"
                className="w-full rounded-xl px-4 py-3 text-sm outline-none transition-all"
                style={{
                  background: '#141D2B',
                  border: '1.5px solid #1F2937',
                  color: '#E6EDF3',
                }}
                onFocus={e => (e.currentTarget.style.borderColor = '#6D5DF6')}
                onBlur={e => (e.currentTarget.style.borderColor = '#1F2937')}
              />
            </div>

            {/* Email */}
            <div>
              <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: '#9CA3AF' }}>
                Email
              </label>
              <input
                name="email"
                type="email"
                placeholder="you@example.com"
                required
                autoComplete="email"
                className="w-full rounded-xl px-4 py-3 text-sm outline-none transition-all"
                style={{
                  background: '#141D2B',
                  border: '1.5px solid #1F2937',
                  color: '#E6EDF3',
                }}
                onFocus={e => (e.currentTarget.style.borderColor = '#6D5DF6')}
                onBlur={e => (e.currentTarget.style.borderColor = '#1F2937')}
              />
            </div>

            {/* Password */}
            <div>
              <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: '#9CA3AF' }}>
                Password
              </label>
              <div className="relative">
                <input
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  required
                  autoComplete="current-password"
                  className="w-full rounded-xl px-4 py-3 pr-11 text-sm outline-none transition-all"
                  style={{
                    background: '#141D2B',
                    border: '1.5px solid #1F2937',
                    color: '#E6EDF3',
                  }}
                  onFocus={e => (e.currentTarget.style.borderColor = '#6D5DF6')}
                  onBlur={e => (e.currentTarget.style.borderColor = '#1F2937')}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  tabIndex={-1}
                  className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors"
                  style={{ color: '#6B7280' }}
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
                className="text-sm rounded-xl px-4 py-3"
                style={{ background: '#1F0B0B', border: '1px solid rgba(239,68,68,0.3)', color: '#F87171' }}
              >
                {state.error}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={pending}
              className="w-full font-semibold rounded-xl py-3 text-sm transition-all mt-1"
              style={{
                background: pending ? '#374151' : 'linear-gradient(135deg, #FF6B57, #E85A45)',
                color: '#fff',
                boxShadow: pending ? 'none' : '0 4px 20px rgba(255,107,87,0.35)',
                cursor: pending ? 'not-allowed' : 'pointer',
              }}
            >
              {pending ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        </div>

        <p className="text-center text-xs mt-5" style={{ color: '#374151' }}>
          Contact your admin if you forgot your password
        </p>
      </div>
    </div>
  )
}
