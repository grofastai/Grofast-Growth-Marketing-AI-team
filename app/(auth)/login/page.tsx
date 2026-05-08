'use client'

import { useActionState, useState } from 'react'
import { loginAction } from '@/lib/actions/auth'
import Image from 'next/image'

export default function LoginPage() {
  const [state, action, pending] = useActionState(loginAction, null)
  const [showPassword, setShowPassword] = useState(false)

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Sora:wght@400;600;700;800;900&family=Manrope:wght@400;500;600;700&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        .lp-page {
          min-height: 100vh;
          display: flex; align-items: center; justify-content: center;
          padding: 24px;
          font-family: 'Manrope', sans-serif;
          background: radial-gradient(ellipse at 55% 45%, #3d0505 0%, #1a0101 45%, #0a0101 100%);
        }

        /* ── CARD ── */
        .lp-card {
          display: flex;
          width: 100%; max-width: 980px;
          min-height: 640px;
          border-radius: 24px;
          overflow: hidden;
          box-shadow: 0 0 0 1px rgba(255,255,255,0.06), 0 32px 80px rgba(0,0,0,0.6);
          animation: card-rise 0.6s cubic-bezier(0.22,1,0.36,1) both;
        }
        @keyframes card-rise {
          from { opacity:0; transform: translateY(24px) scale(0.97); }
          to   { opacity:1; transform: translateY(0) scale(1); }
        }

        /* ════════════════════════════
           LEFT PANEL
        ════════════════════════════ */
        .lp-left {
          width: 48%; flex-shrink: 0;
          position: relative; overflow: hidden;
          background: #0a0a0a;
          display: flex; flex-direction: column;
          padding: 36px 40px 32px;
        }

        /* ── Logo ── */
        .lp-logo-row {
          display: flex; align-items: center; gap: 11px;
          position: relative; z-index: 4; flex-shrink: 0;
        }
        .lp-logo-img {
          width: 42px; height: 42px; border-radius: 10px; overflow: hidden;
          border: 1px solid rgba(255,255,255,0.12); flex-shrink: 0;
        }
        .lp-logo-name {
          font-family: 'Sora', sans-serif;
          font-size: 14px; font-weight: 700;
          letter-spacing: 0.2em; color: #FFFFFF; text-transform: uppercase;
        }
        .lp-logo-sub {
          font-size: 8.5px; letter-spacing: 0.2em;
          color: rgba(255,255,255,0.3); text-transform: uppercase; margin-top: 2px;
        }

        /* ── Poster text ── */
        .lp-poster {
          position: relative; z-index: 1;
          margin-top: 28px; flex-shrink: 0;
        }
        .lp-word {
          display: block;
          font-family: 'Sora', sans-serif;
          font-weight: 900;
          font-size: 86px;
          line-height: 0.9;
          letter-spacing: -0.04em;
          text-transform: uppercase;
          color: #FFFFFF;
        }
        .lp-word-last {
          background: linear-gradient(180deg, #FFFFFF 0%, #c0c0c0 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        /* ── Sub tagline ── */
        .lp-sub-tag {
          margin-top: 16px;
          position: relative; z-index: 4;
          flex-shrink: 0;
        }
        .lp-sub-tag p {
          font-size: 12px; font-weight: 600;
          letter-spacing: 0.06em; text-transform: uppercase;
          color: rgba(255,255,255,0.45); line-height: 1.8;
        }
        .lp-sub-tag span { color: #DC2626; }

        /* ── Character ── */
        .lp-char {
          position: absolute;
          right: -24px; bottom: 90px;
          width: 62%; z-index: 2;
          pointer-events: none;
        }

        /* ── Floating badges ── */
        .lp-badges {
          position: absolute;
          bottom: 92px; left: 32px;
          z-index: 3;
          display: flex; gap: 10px; align-items: flex-end;
        }
        .lp-badge {
          width: 52px; height: 52px;
          border-radius: 14px;
          background: #1a1a1a;
          border: 1px solid rgba(255,255,255,0.08);
          display: flex; align-items: center; justify-content: center;
          box-shadow: 0 4px 16px rgba(0,0,0,0.4);
          flex-shrink: 0;
        }
        .lp-badge-sm {
          width: 44px; height: 44px; border-radius: 12px;
        }
        /* red arrow SVG */
        .lp-arrow {
          position: absolute;
          bottom: 100px; left: 60px;
          z-index: 3; pointer-events: none;
        }

        /* ── Stats ── */
        .lp-stats {
          display: flex; align-items: center;
          border-top: 1px solid rgba(255,255,255,0.07);
          padding-top: 18px; margin-top: auto;
          position: relative; z-index: 4;
          flex-shrink: 0;
        }
        .lp-stat {
          flex: 1; display: flex; align-items: center; gap: 10px;
        }
        .lp-stat + .lp-stat {
          border-left: 1px solid rgba(255,255,255,0.07);
          padding-left: 18px; margin-left: 0;
        }
        .lp-stat-icon {
          width: 28px; height: 28px; flex-shrink: 0;
          display: flex; align-items: center; justify-content: center;
          color: rgba(255,255,255,0.5);
        }
        .lp-stat-num {
          font-family: 'Sora', sans-serif;
          font-size: 18px; font-weight: 800;
          color: #FFFFFF; display: block; letter-spacing: -0.02em;
          line-height: 1;
        }
        .lp-stat-label {
          font-size: 8.5px; font-weight: 600;
          color: rgba(255,255,255,0.3);
          letter-spacing: 0.1em; text-transform: uppercase;
          display: block; margin-top: 2px;
        }

        /* ════════════════════════════
           RIGHT PANEL
        ════════════════════════════ */
        .lp-right {
          flex: 1; background: #FFFFFF;
          display: flex; flex-direction: column;
          align-items: center; justify-content: center;
          padding: 52px 52px;
        }
        .lp-form-wrap { width: 100%; max-width: 360px; }

        /* Right logo */
        .lp-r-logo {
          display: flex; flex-direction: column;
          align-items: center; margin-bottom: 28px;
        }
        .lp-r-logo-img {
          width: 64px; height: 64px;
          border-radius: 18px; overflow: hidden;
          border: 2px solid #0a0a0a;
          box-shadow: 0 4px 20px rgba(0,0,0,0.15);
          margin-bottom: 10px;
        }
        .lp-r-logo-name {
          font-family: 'Sora', sans-serif;
          font-size: 13px; font-weight: 700;
          letter-spacing: 0.22em; color: #0F172A; text-transform: uppercase;
        }

        /* Heading */
        .lp-h1 {
          font-family: 'Sora', sans-serif;
          font-size: 30px; font-weight: 800;
          color: #0D0D12; letter-spacing: -0.02em;
          text-align: center; margin-bottom: 8px;
        }
        .lp-sub {
          font-size: 13.5px; color: #94A3B8;
          text-align: center; line-height: 1.6;
          font-weight: 400; margin-bottom: 24px;
        }

        /* Divider */
        .lp-sep {
          display: flex; align-items: center; gap: 12px; margin-bottom: 22px;
        }
        .lp-sep-line { flex: 1; height: 1px; background: #F1F5F9; }
        .lp-sep-text { font-size: 11px; color: #CBD5E1; font-weight: 500; letter-spacing: 0.08em; }

        /* Fields */
        .lp-field { margin-bottom: 16px; }
        .lp-field-label {
          display: flex; justify-content: space-between; align-items: center;
          margin-bottom: 7px;
        }
        .lp-label {
          font-size: 12.5px; font-weight: 600; color: #374151; letter-spacing: 0.01em;
        }
        .lp-forgot {
          font-size: 12px; font-weight: 600; color: #DC2626; cursor: default;
        }

        /* Input with icon */
        .lp-input-wrap {
          position: relative; display: flex; align-items: center;
        }
        .lp-input-icon {
          position: absolute; left: 14px;
          color: #C8D3DE; pointer-events: none; line-height: 0;
        }
        .lp-input {
          width: 100%; padding: 13px 16px 13px 44px;
          border-radius: 12px; border: 1.5px solid #E5E9F0;
          background: #FAFBFC; font-size: 14px;
          font-family: 'Manrope', sans-serif; font-weight: 500;
          color: #0D0D12; outline: none;
          transition: border-color 0.18s, box-shadow 0.18s, background 0.18s;
        }
        .lp-input::placeholder { color: #BDC5D1; font-weight: 400; }
        .lp-input:focus {
          border-color: #DC2626; background: #FFFFFF;
          box-shadow: 0 0 0 4px rgba(220,38,38,0.07);
        }
        .lp-eye {
          position: absolute; right: 14px;
          background: none; border: none; cursor: pointer;
          color: #BDC5D1; padding: 4px; line-height: 0;
          transition: color 0.15s;
        }
        .lp-eye:hover { color: #6B7280; }
        .lp-input-pw { padding-right: 46px; }

        /* Error */
        .lp-error {
          display: flex; gap: 8px; align-items: flex-start;
          padding: 11px 14px; border-radius: 10px;
          background: #FEF2F2; border: 1px solid #FECACA;
          color: #DC2626; font-size: 13px; font-weight: 500; margin-bottom: 6px;
        }

        /* Sign In button — red pill */
        .lp-btn {
          width: 100%; padding: 16px;
          border-radius: 100px; border: none; cursor: pointer;
          font-family: 'Sora', sans-serif;
          font-size: 15px; font-weight: 700; letter-spacing: 0.03em;
          color: #FFFFFF;
          background: linear-gradient(135deg, #E53935 0%, #B71C1C 100%);
          box-shadow: 0 6px 24px rgba(220,38,38,0.35);
          transition: transform 0.15s, box-shadow 0.15s;
          margin-top: 8px; display: flex; align-items: center; justify-content: center; gap: 8px;
        }
        .lp-btn:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 10px 30px rgba(220,38,38,0.45);
        }
        .lp-btn:active:not(:disabled) { transform: translateY(0); }
        .lp-btn:disabled { opacity: 0.5; cursor: not-allowed; }

        /* Footer */
        .lp-footer {
          margin-top: 20px; text-align: center;
          font-size: 12.5px; color: #94A3B8; line-height: 1.6;
        }
        .lp-footer a { color: #DC2626; font-weight: 600; cursor: default; }

        @keyframes spin { to { transform: rotate(360deg); } }
        .spin { animation: spin 0.8s linear infinite; }

        @media (max-width: 760px) {
          .lp-left { display: none; }
          .lp-page { padding: 0; background: #fff; }
          .lp-card { border-radius: 0; min-height: 100vh; box-shadow: none; }
          .lp-right { padding: 44px 28px; }
        }
      `}</style>

      <div className="lp-page">
        <div className="lp-card">

          {/* ════ LEFT ════ */}
          <div className="lp-left">

            {/* Logo */}
            <div className="lp-logo-row">
              <div className="lp-logo-img">
                <Image src="/brand/logo.jpg" alt="GroFast" width={42} height={42}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
              </div>
              <div>
                <div className="lp-logo-name">Grofast</div>
                <div className="lp-logo-sub">Growth & AI Solutions</div>
              </div>
            </div>

            {/* Poster text — z-index 1 (behind character) */}
            <div className="lp-poster">
              <span className="lp-word">TRACK.</span>
              <span className="lp-word">GROW.</span>
              <span className="lp-word lp-word-last">SUCCEED.</span>
            </div>

            {/* Sub tagline */}
            <div className="lp-sub-tag">
              <p>One Platform.</p>
              <p><span>AI Powered.</span> Real Time.</p>
            </div>

            {/* Character — z-index 2 (in front of text) */}
            <div className="lp-char">
              <Image
                src="/brand/character.png"
                alt="GroFast mascot"
                width={420} height={500}
                priority
                style={{ width: '100%', height: 'auto', objectFit: 'contain', marginTop: '-22%' }}
              />
            </div>

            {/* Floating badges — z-index 3 */}
            <div className="lp-badges">
              {/* Chart badge */}
              <div className="lp-badge">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
                  <path d="M3 17l4-6 4 4 4-8 4 4" stroke="#DC2626" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
                  <circle cx="19" cy="11" r="2" fill="#DC2626" opacity="0.3"/>
                </svg>
              </div>
              {/* Chat badge */}
              <div className="lp-badge lp-badge-sm">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" stroke="rgba(255,255,255,0.4)" strokeWidth="2" strokeLinejoin="round"/>
                  <circle cx="9" cy="11" r="1" fill="rgba(255,255,255,0.5)"/>
                  <circle cx="12" cy="11" r="1" fill="rgba(255,255,255,0.5)"/>
                  <circle cx="15" cy="11" r="1" fill="rgba(255,255,255,0.5)"/>
                </svg>
              </div>
              {/* AI badge */}
              <div className="lp-badge">
                <span style={{ fontFamily: "'Sora',sans-serif", fontSize: 15, fontWeight: 800, color: '#DC2626', letterSpacing: '-0.02em' }}>AI</span>
              </div>
              {/* Tasks badge */}
              <div className="lp-badge lp-badge-sm">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                  <path d="M9 11l3 3L22 4" stroke="#DC2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" stroke="rgba(255,255,255,0.3)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
            </div>

            {/* Red arrow */}
            <svg className="lp-arrow" width="200" height="70" viewBox="0 0 200 70" fill="none">
              <path d="M10 60 Q80 10 190 30" stroke="#DC2626" strokeWidth="2.5" strokeLinecap="round" fill="none" opacity="0.7"/>
              <path d="M182 22 L190 30 L180 34" stroke="#DC2626" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.7"/>
            </svg>

            {/* Stats */}
            <div className="lp-stats">
              <div className="lp-stat">
                <div className="lp-stat-icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/>
                  </svg>
                </div>
                <div>
                  <span className="lp-stat-num">24/7</span>
                  <span className="lp-stat-label">AI Support</span>
                </div>
              </div>
              <div className="lp-stat">
                <div className="lp-stat-icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                  </svg>
                </div>
                <div>
                  <span className="lp-stat-num">100%</span>
                  <span className="lp-stat-label">Visibility</span>
                </div>
              </div>
              <div className="lp-stat">
                <div className="lp-stat-icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
                  </svg>
                </div>
                <div>
                  <span className="lp-stat-num">Live</span>
                  <span className="lp-stat-label">Updates</span>
                </div>
              </div>
            </div>
          </div>

          {/* ════ RIGHT ════ */}
          <div className="lp-right">
            <div className="lp-form-wrap">

              {/* Logo */}
              <div className="lp-r-logo">
                <div className="lp-r-logo-img">
                  <Image src="/brand/logo.jpg" alt="GroFast" width={64} height={64}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
                </div>
                <span className="lp-r-logo-name">GROFAST</span>
              </div>

              <h1 className="lp-h1">Welcome Back</h1>
              <p className="lp-sub">
                Enter your email and password<br/>to access your account
              </p>

              <div className="lp-sep">
                <div className="lp-sep-line"/>
                <span className="lp-sep-text">Sign In</span>
                <div className="lp-sep-line"/>
              </div>

              <form action={action}>
                {/* Email */}
                <div className="lp-field">
                  <div className="lp-field-label">
                    <label className="lp-label">Email</label>
                  </div>
                  <div className="lp-input-wrap">
                    <span className="lp-input-icon">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                        <polyline points="22,6 12,13 2,6"/>
                      </svg>
                    </span>
                    <input className="lp-input" name="email" type="email"
                      placeholder="Enter your email" required
                      autoComplete="email" autoCapitalize="none"/>
                  </div>
                </div>

                {/* Password */}
                <div className="lp-field">
                  <div className="lp-field-label">
                    <label className="lp-label">Password</label>
                    <span className="lp-forgot">Forgot Password?</span>
                  </div>
                  <div className="lp-input-wrap">
                    <span className="lp-input-icon">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                        <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                      </svg>
                    </span>
                    <input className={`lp-input lp-input-pw`} name="password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Enter your password" required
                      autoComplete="current-password"/>
                    <button type="button" className="lp-eye" tabIndex={-1}
                      onClick={() => setShowPassword(v => !v)}>
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

                {state?.error && (
                  <div className="lp-error">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0, marginTop: 1 }}>
                      <circle cx="12" cy="12" r="10"/>
                      <line x1="12" y1="8" x2="12" y2="12"/>
                      <line x1="12" y1="16" x2="12.01" y2="16"/>
                    </svg>
                    {state.error}
                  </div>
                )}

                <button type="submit" disabled={pending} className="lp-btn">
                  {pending ? (
                    <>
                      <svg className="spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                      </svg>
                      Signing in…
                    </>
                  ) : (
                    <>
                      Sign In
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                        <path d="M5 12h14M12 5l7 7-7 7"/>
                      </svg>
                    </>
                  )}
                </button>
              </form>

              <p className="lp-footer">
                Forgot your password?{' '}
                <a>Contact your administrator.</a>
              </p>

            </div>
          </div>

        </div>
      </div>
    </>
  )
}
