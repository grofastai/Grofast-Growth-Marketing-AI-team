'use client'

import { useActionState, useState } from 'react'
import { changePasswordAction } from '@/lib/actions/auth'

const inputStyle = {
  background: '#1A1A1A',
  border: '1px solid #2E2E2E',
  color: '#FFFFFF',
  width: '100%',
  borderRadius: '10px',
  padding: '14px 16px',
  fontSize: '14px',
  outline: 'none',
  fontFamily: 'inherit',
} as React.CSSProperties

function EyeIcon({ open }: { open: boolean }) {
  return open ? (
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
  )
}

export function ChangePasswordForm() {
  const [state, action, pending] = useActionState(changePasswordAction, null)
  const [showPw, setShowPw] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  return (
    <>
      <style>{`
        .cp-input::placeholder { color: rgba(255,255,255,0.22); }
        .cp-input:focus { border-color: rgba(222,26,26,0.5) !important; background: #1E1E1E !important; }
      `}</style>

      <form action={action} className="space-y-4">
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-[0.16em] mb-2"
            style={{ color: 'rgba(255,255,255,0.3)' }}>
            New Password
          </label>
          <div className="relative">
            <input
              className="cp-input"
              name="password"
              type={showPw ? 'text' : 'password'}
              placeholder="At least 6 characters"
              required
              minLength={6}
              autoComplete="new-password"
              style={{ ...inputStyle, paddingRight: '48px' }}
            />
            <button type="button" onClick={() => setShowPw(v => !v)} tabIndex={-1}
              className="absolute right-4 top-1/2 -translate-y-1/2"
              style={{ color: 'rgba(255,255,255,0.28)', lineHeight: 0 }}>
              <EyeIcon open={showPw} />
            </button>
          </div>
        </div>

        <div>
          <label className="block text-[10px] font-bold uppercase tracking-[0.16em] mb-2"
            style={{ color: 'rgba(255,255,255,0.3)' }}>
            Confirm Password
          </label>
          <div className="relative">
            <input
              className="cp-input"
              name="confirm"
              type={showConfirm ? 'text' : 'password'}
              placeholder="Re-enter password"
              required
              autoComplete="new-password"
              style={{ ...inputStyle, paddingRight: '48px' }}
            />
            <button type="button" onClick={() => setShowConfirm(v => !v)} tabIndex={-1}
              className="absolute right-4 top-1/2 -translate-y-1/2"
              style={{ color: 'rgba(255,255,255,0.28)', lineHeight: 0 }}>
              <EyeIcon open={showConfirm} />
            </button>
          </div>
        </div>

        {state?.error && (
          <div className="flex items-start gap-2.5 rounded-lg px-4 py-3"
            style={{ background: 'rgba(255,68,68,0.07)', border: '1px solid rgba(255,68,68,0.18)', color: '#FF7070' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="flex-shrink-0 mt-0.5">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <span className="text-[13px]">{state.error}</span>
          </div>
        )}

        <button
          type="submit"
          disabled={pending}
          className="w-full font-bold rounded-lg py-3.5 text-[14px] transition-all"
          style={{
            background: '#de1a1a',
            color: '#FFFFFF',
            opacity: pending ? 0.65 : 1,
            cursor: pending ? 'not-allowed' : 'pointer',
            marginTop: '8px',
          }}
        >
          {pending ? 'Saving…' : 'Set Password →'}
        </button>
      </form>
    </>
  )
}
