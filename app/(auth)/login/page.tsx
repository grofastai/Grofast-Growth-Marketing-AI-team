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
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600;9..40,700&display=swap');

        *, *::before, *::after { box-sizing:border-box; margin:0; padding:0; }

        /* ──────────────────────────────
           PAGE
        ────────────────────────────── */
        .pg {
          min-height:100vh;
          display:flex; align-items:center; justify-content:center;
          padding:32px 24px;
          font-family:'DM Sans', sans-serif;
          background:#070707;
          position:relative; overflow:hidden;
        }
        /* Page-level ambient halo around the card */
        .pg::before {
          content:'';
          position:absolute; inset:0; z-index:0;
          background:
            radial-gradient(ellipse 70% 55% at 50% 52%, rgba(110,0,0,0.22) 0%, transparent 62%),
            radial-gradient(ellipse 35% 28% at 18% 72%, rgba(130,0,0,0.1) 0%, transparent 54%);
          pointer-events:none;
        }

        /* ──────────────────────────────
           CARD
        ────────────────────────────── */
        .card {
          display:flex;
          width:100%; max-width:1080px;
          min-height:680px;
          border-radius:32px;
          overflow:visible;          /* character overflows */
          position:relative; z-index:1;
          box-shadow:
            0 0 0 1px rgba(255,255,255,0.055),
            0 0 70px rgba(180,0,0,0.2),
            0 40px 100px rgba(0,0,0,0.78),
            0 80px 200px rgba(0,0,0,0.44);
          animation:rise 0.7s cubic-bezier(0.22,1,0.36,1) both;
        }
        @keyframes rise {
          from { opacity:0; transform:translateY(30px) scale(0.97); }
          to   { opacity:1; transform:translateY(0)   scale(1);     }
        }

        /* ──────────────────────────────
           LEFT PANEL  60%
        ────────────────────────────── */
        .left {
          width:60%; flex-shrink:0;
          border-radius:32px 0 0 32px;
          background:#060606;
          position:relative; overflow:hidden;
          display:flex; flex-direction:column;
          padding:42px 50px 38px;
        }

        /* Cinematic multi-layer ambient */
        .left::before {
          content:''; position:absolute; inset:0; z-index:0;
          background:
            radial-gradient(ellipse 78% 68% at 94% 100%, rgba(170,0,0,0.40) 0%, transparent 56%),
            radial-gradient(ellipse 55% 42% at 6% 18%,  rgba(150,8,8,0.18)  0%, transparent 50%),
            radial-gradient(ellipse 38% 30% at 52% 56%, rgba(200,18,18,0.09) 0%, transparent 46%);
          pointer-events:none;
        }

        /* Futuristic 48px grid overlay */
        .left::after {
          content:''; position:absolute; inset:0; z-index:0;
          background-image:
            linear-gradient(rgba(255,255,255,0.017) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.017) 1px, transparent 1px);
          background-size:48px 48px;
          pointer-events:none;
        }

        /* ── Logo ── */
        .l-logo {
          display:flex; align-items:center; gap:13px;
          position:relative; z-index:6; flex-shrink:0;
        }
        .l-logo-img {
          width:42px; height:42px; border-radius:11px; overflow:hidden;
          border:1px solid rgba(255,255,255,0.13); flex-shrink:0;
        }
        .l-logo-name {
          font-family:'Bebas Neue', sans-serif;
          font-size:25px; letter-spacing:0.14em; color:#fff;
        }
        .l-dot { color:#DC2626; }

        /* ── Glassmorphism floating widgets ── */
        .gl {
          position:absolute; z-index:7;
          background:rgba(255,255,255,0.042);
          border:1px solid rgba(255,255,255,0.09);
          border-radius:16px;
          backdrop-filter:blur(18px);
          -webkit-backdrop-filter:blur(18px);
          display:flex; align-items:center; gap:10px;
          padding:10px 15px;
          box-shadow:0 4px 22px rgba(0,0,0,0.32), inset 0 1px 0 rgba(255,255,255,0.06);
          animation:gl-float ease-in-out infinite;
        }
        .gl-ico {
          width:36px; height:36px; border-radius:10px;
          background:rgba(220,38,38,0.18);
          border:1px solid rgba(220,38,38,0.26);
          display:flex; align-items:center; justify-content:center; flex-shrink:0;
        }
        .gl-v { font-size:15px; font-weight:700; color:#fff; line-height:1; }
        .gl-l { font-size:9px; font-weight:600; color:rgba(255,255,255,0.38); letter-spacing:0.08em; text-transform:uppercase; margin-top:2px; }

        .gl-1 { top:106px; left:18px;  animation-delay:0s;    animation-duration:5.4s; }
        .gl-2 { top:208px; right:68px; animation-delay:-2.1s; animation-duration:4.8s; }
        .gl-3 { top:316px; left:12px;  animation-delay:-3.6s; animation-duration:6.1s; }

        @keyframes gl-float {
          0%,100% { transform:translateY(0); }
          50%      { transform:translateY(-10px); }
        }

        /* ── Giant poster headline ── */
        .l-hl {
          position:relative; z-index:2;
          margin-top:28px; flex-shrink:0;
        }
        .l-w {
          display:block;
          font-family:'Bebas Neue', sans-serif;
          font-size:132px;
          line-height:0.83;
          letter-spacing:0.015em;
          color:#FFFFFF;
          text-shadow:
            0 0 100px rgba(255,255,255,0.1),
            0 0 220px rgba(220,38,38,0.1),
            0 3px 0 rgba(0,0,0,0.65);
        }

        /* ── Sub tagline ── */
        .l-tag {
          margin-top:18px;
          position:relative; z-index:6; flex-shrink:0;
        }
        .l-tag p {
          font-size:10px; font-weight:600;
          letter-spacing:0.16em; text-transform:uppercase;
          color:rgba(255,255,255,0.27); line-height:2.4;
        }
        .l-tag .r { color:#DC2626; }

        /* ── Red particles ── */
        .pt {
          position:absolute; border-radius:50%;
          background:#DC2626; pointer-events:none; z-index:1;
          animation:pt-rise linear infinite;
        }
        .pt:nth-child(1) { width:3px;height:3px; left:9%;  bottom:95px;  animation-duration:4.3s; animation-delay:0s;    opacity:.62; }
        .pt:nth-child(2) { width:2px;height:2px; left:25%; bottom:145px; animation-duration:5.9s; animation-delay:-1.2s; opacity:.4;  }
        .pt:nth-child(3) { width:4px;height:4px; left:45%; bottom:82px;  animation-duration:3.7s; animation-delay:-2.4s; opacity:.5; background:#E03030; }
        .pt:nth-child(4) { width:2px;height:2px; left:64%; bottom:118px; animation-duration:6.2s; animation-delay:-0.7s; opacity:.34; }
        .pt:nth-child(5) { width:3px;height:3px; left:19%; bottom:205px; animation-duration:4.8s; animation-delay:-3.2s; opacity:.5;  }
        .pt:nth-child(6) { width:2px;height:2px; left:77%; bottom:158px; animation-duration:5.3s; animation-delay:-1.8s; opacity:.3;  }
        .pt:nth-child(7) { width:3px;height:3px; left:35%; bottom:238px; animation-duration:4.1s; animation-delay:-0.4s; opacity:.42; }
        @keyframes pt-rise {
          0%  { transform:translateY(0) scale(1);     opacity:0;  }
          8%  { opacity:1; }
          88% { opacity:.24; }
          100%{ transform:translateY(-360px) scale(0.14); opacity:0; }
        }

        /* ── Glow orbs ── */
        .orb { position:absolute; border-radius:50%; pointer-events:none; z-index:0; animation:orb-pulse ease-in-out infinite; }
        .orb-1 { width:270px;height:270px; background:radial-gradient(circle,rgba(160,0,0,0.26) 0%,transparent 68%); bottom:25px; right:-25px; animation-duration:3.6s; animation-delay:0s; }
        .orb-2 { width:150px;height:150px; background:radial-gradient(circle,rgba(220,38,38,0.15) 0%,transparent 70%); top:145px; left:4px;   animation-duration:4.4s; animation-delay:-2.1s; }
        @keyframes orb-pulse {
          0%,100%{ transform:scale(1);    opacity:1; }
          50%    { transform:scale(1.28); opacity:.6; }
        }

        /* ── Scan line ── */
        .scan { position:absolute; left:0; right:0; height:1px; z-index:1; pointer-events:none; background:linear-gradient(90deg,transparent,rgba(220,38,38,0.48),transparent); animation:scan-mv 9s linear infinite; }
        @keyframes scan-mv { 0%{top:0%;opacity:0;} 4%{opacity:1;} 96%{opacity:1;} 100%{top:100%;opacity:0;} }

        /* ── Feature strip ── */
        .l-fs {
          display:flex; gap:0;
          border-top:1px solid rgba(255,255,255,0.07);
          padding-top:20px;
          position:relative; z-index:6;
          margin-top:auto; flex-shrink:0;
        }
        .l-f { flex:1; display:flex; align-items:center; gap:10px; padding-right:16px; }
        .l-f+.l-f { border-left:1px solid rgba(255,255,255,0.07); padding-left:16px; padding-right:0; }
        .l-fi {
          width:36px; height:36px; border-radius:10px;
          border:1px solid rgba(220,38,38,0.3);
          background:rgba(220,38,38,0.07);
          box-shadow:0 0 14px rgba(220,38,38,0.13);
          display:flex; align-items:center; justify-content:center; flex-shrink:0;
        }
        .l-fn { font-family:'Bebas Neue',sans-serif; font-size:17px; color:#fff; letter-spacing:0.04em; line-height:1; }
        .l-fl { font-size:8.5px; font-weight:600; text-transform:uppercase; letter-spacing:0.1em; color:rgba(255,255,255,0.26); margin-top:3px; }

        /* ──────────────────────────────
           CHARACTER  (card-level)
        ────────────────────────────── */
        .char-wrap {
          position:absolute;
          left:calc(60% - 138px);   /* straddles the panel border */
          bottom:0;
          width:276px;
          z-index:40;
          pointer-events:none;
          /* Fade lower third so character "emerges from below" */
          mask-image:linear-gradient(to bottom, black 52%, transparent 90%);
          -webkit-mask-image:linear-gradient(to bottom, black 52%, transparent 90%);
        }

        /* Hide white bg where character overlaps dark panel */
        .char-wrap::before {
          content:'';
          position:absolute; top:0; left:0;
          width:80px; height:100%;
          background:linear-gradient(90deg, #060606 0%, rgba(6,6,6,0.55) 65%, transparent 100%);
          z-index:2; pointer-events:none;
        }

        /* Floor / drop shadow */
        .char-wrap::after {
          content:'';
          position:absolute; bottom:-10px; left:50%;
          transform:translateX(-50%);
          width:210px; height:32px;
          background:radial-gradient(ellipse, rgba(0,0,0,0.62) 0%, transparent 70%);
          filter:blur(12px);
          z-index:-1;
        }

        /* Occlusion shadow at the wall edge */
        .wall-shd {
          position:absolute;
          left:calc(60% - 1px); top:0; bottom:0; width:22px;
          background:linear-gradient(90deg, rgba(0,0,0,0.38), transparent);
          z-index:35; pointer-events:none;
        }

        /* ──────────────────────────────
           RIGHT PANEL  40%
        ────────────────────────────── */
        .right {
          flex:1;
          border-radius:0 32px 32px 0;
          background:#FFFFFF;
          display:flex; align-items:center; justify-content:center;
          padding:52px 50px 52px 78px;
          position:relative; overflow:hidden;
        }

        /* Subtle ambient from left edge */
        .right::before {
          content:''; position:absolute; inset:0;
          background:
            radial-gradient(ellipse 55% 45% at -8% 55%, rgba(220,38,38,0.05) 0%, transparent 54%),
            linear-gradient(90deg, rgba(0,0,0,0.065) 0%, transparent 52px);
          pointer-events:none;
        }

        .r-wrap { width:100%; max-width:310px; position:relative; z-index:2; }

        /* Logo */
        .r-logo { display:flex; flex-direction:column; align-items:center; margin-bottom:24px; }
        .r-logo-img { width:58px; height:58px; border-radius:16px; overflow:hidden; border:2px solid #0D0D12; box-shadow:0 4px 18px rgba(0,0,0,0.1); margin-bottom:10px; }
        .r-logo-nm  { font-family:'Bebas Neue',sans-serif; font-size:17px; letter-spacing:0.26em; color:#0D0D12; }

        .r-h1 { font-family:'Bebas Neue',sans-serif; font-size:38px; letter-spacing:0.05em; color:#0D0D12; text-align:center; margin-bottom:6px; }
        .r-sub { font-size:13px; color:#94A3B8; text-align:center; line-height:1.65; font-weight:400; margin-bottom:24px; }

        /* Divider */
        .r-dv { display:flex; align-items:center; gap:12px; margin-bottom:20px; }
        .r-dl { flex:1; height:1px; background:#F0F2F5; }
        .r-dt { font-size:10px; color:#D1D5DB; font-weight:600; letter-spacing:0.13em; text-transform:uppercase; }

        /* Fields */
        .r-fld { margin-bottom:14px; }
        .r-fh  { display:flex; justify-content:space-between; align-items:center; margin-bottom:7px; }
        .r-lb  { font-size:11.5px; font-weight:600; color:#374151; letter-spacing:0.01em; }
        .r-fg  { font-size:11.5px; font-weight:600; color:#DC2626; cursor:default; }

        .r-iw  { position:relative; display:flex; align-items:center; }
        .r-ii  { position:absolute; left:13px; color:#BFC9D4; pointer-events:none; line-height:0; }
        .r-inp {
          width:100%; padding:12px 15px 12px 42px;
          border-radius:12px; border:1.5px solid #E5E9F0; background:#F9FAFB;
          font-size:13.5px; font-family:'DM Sans',sans-serif; font-weight:400;
          color:#0D0D12; outline:none;
          transition:border-color .18s, box-shadow .18s, background .18s;
        }
        .r-inp::placeholder { color:#C0CAD6; }
        .r-inp:focus { border-color:#DC2626; background:#fff; box-shadow:0 0 0 4px rgba(220,38,38,0.08); }
        .r-inp-pw { padding-right:44px; }
        .r-eye { position:absolute; right:13px; background:none; border:none; cursor:pointer; color:#BCC5D0; padding:4px; line-height:0; transition:color .15s; }
        .r-eye:hover { color:#6B7280; }

        /* Error */
        .r-err { display:flex; gap:8px; align-items:flex-start; padding:10px 13px; border-radius:10px; background:#FEF2F2; border:1px solid #FECACA; color:#DC2626; font-size:12.5px; margin-bottom:6px; }

        /* CTA */
        .r-btn {
          width:100%; padding:15px; border-radius:100px; border:none; cursor:pointer;
          font-family:'Bebas Neue',sans-serif; font-size:18px; letter-spacing:0.13em; color:#FFFFFF;
          background:linear-gradient(135deg,#E52020 0%,#AA1010 100%);
          box-shadow:0 8px 30px rgba(220,38,38,0.46),0 2px 8px rgba(220,38,38,0.2),inset 0 1px 0 rgba(255,255,255,0.14);
          transition:transform .15s, box-shadow .15s;
          margin-top:10px; display:flex; align-items:center; justify-content:center; gap:9px;
        }
        .r-btn:hover:not(:disabled) { transform:translateY(-2px); box-shadow:0 14px 44px rgba(220,38,38,0.56),0 4px 14px rgba(220,38,38,0.28),inset 0 1px 0 rgba(255,255,255,0.18); }
        .r-btn:active:not(:disabled) { transform:translateY(0); }
        .r-btn:disabled { opacity:.5; cursor:not-allowed; }

        .r-foot { margin-top:20px; text-align:center; font-size:12px; color:#94A3B8; line-height:1.6; }
        .r-foot span { color:#DC2626; font-weight:600; }

        @keyframes spin { to { transform:rotate(360deg); } }
        .spin { animation:spin .8s linear infinite; }

        @media (max-width:800px) {
          .left,.char-wrap,.wall-shd { display:none; }
          .pg { padding:0; background:#fff; }
          .card { border-radius:0; min-height:100vh; box-shadow:none; }
          .right { border-radius:0; padding:44px 28px; }
          .right::before { display:none; }
        }
      `}</style>

      <div className="pg">
        <div className="card">

          {/* ═══ LEFT ═══ */}
          <div className="left">
            <div className="orb orb-1"/><div className="orb orb-2"/>
            <div className="scan"/>
            <div className="pt"/><div className="pt"/><div className="pt"/>
            <div className="pt"/><div className="pt"/><div className="pt"/>
            <div className="pt"/>

            {/* Logo */}
            <div className="l-logo">
              <div className="l-logo-img">
                <Image src="/brand/logo.jpg" alt="GroFast" width={42} height={42}
                  style={{width:'100%',height:'100%',objectFit:'cover'}}/>
              </div>
              <span className="l-logo-name">GROFAST<span className="l-dot">.</span></span>
            </div>

            {/* Glassmorphism badges */}
            <div className="gl gl-1">
              <div className="gl-ico">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
                  <path d="M3 17l4-6 4 4 4-8 4 4" stroke="#DC2626" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <div><div className="gl-v">+48%</div><div className="gl-l">Growth</div></div>
            </div>

            <div className="gl gl-2">
              <div className="gl-ico">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
                  <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" stroke="#DC2626" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <div><div className="gl-v">AI</div><div className="gl-l">Powered</div></div>
            </div>

            <div className="gl gl-3">
              <div className="gl-ico">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
                  <path d="M9 11l3 3L22 4" stroke="#DC2626" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" stroke="#DC2626" strokeWidth="1.8" strokeLinecap="round" opacity="0.38"/>
                </svg>
              </div>
              <div><div className="gl-v">Tasks</div><div className="gl-l">Live Track</div></div>
            </div>

            {/* Poster headline */}
            <div className="l-hl">
              <span className="l-w">TRACK.</span>
              <span className="l-w">GROW.</span>
              <span className="l-w">SUCCEED.</span>
            </div>

            {/* Tagline */}
            <div className="l-tag">
              <p>One Platform. <span className="r">AI Powered.</span> Real Time.</p>
            </div>

            {/* Feature strip */}
            <div className="l-fs">
              <div className="l-f">
                <div className="l-fi">
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="1.65" strokeLinecap="round">
                    <path d="M3 18v-6a9 9 0 0 1 18 0v6"/>
                    <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3z"/>
                    <path d="M3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/>
                  </svg>
                </div>
                <div><div className="l-fn">24/7</div><div className="l-fl">AI Support</div></div>
              </div>
              <div className="l-f">
                <div className="l-fi">
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="1.65" strokeLinecap="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                    <circle cx="12" cy="12" r="3"/>
                  </svg>
                </div>
                <div><div className="l-fn">100%</div><div className="l-fl">Visibility</div></div>
              </div>
              <div className="l-f">
                <div className="l-fi">
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="1.65" strokeLinecap="round">
                    <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
                  </svg>
                </div>
                <div><div className="l-fn">Live</div><div className="l-fl">Updates</div></div>
              </div>
            </div>
          </div>

          {/* ═══ CHARACTER at panel border ═══ */}
          <div className="char-wrap">
            <Image
              src="/brand/character.png"
              alt="GroFast mascot"
              width={420} height={560}
              priority
              style={{width:'100%',height:'auto',objectFit:'contain',display:'block'}}
            />
          </div>

          {/* Occlusion shadow at wall edge */}
          <div className="wall-shd"/>

          {/* ═══ RIGHT ═══ */}
          <div className="right">
            <div className="r-wrap">

              <div className="r-logo">
                <div className="r-logo-img">
                  <Image src="/brand/logo.jpg" alt="GroFast" width={58} height={58}
                    style={{width:'100%',height:'100%',objectFit:'cover'}}/>
                </div>
                <span className="r-logo-nm">GROFAST</span>
              </div>

              <h1 className="r-h1">WELCOME BACK</h1>
              <p className="r-sub">Sign in to access your team<br/>management dashboard.</p>

              <div className="r-dv">
                <div className="r-dl"/><span className="r-dt">Sign In</span><div className="r-dl"/>
              </div>

              <form action={action}>
                <div className="r-fld">
                  <div className="r-fh"><label className="r-lb">Email Address</label></div>
                  <div className="r-iw">
                    <span className="r-ii">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                        <polyline points="22,6 12,13 2,6"/>
                      </svg>
                    </span>
                    <input className="r-inp" name="email" type="email"
                      placeholder="you@company.com" required
                      autoComplete="email" autoCapitalize="none"/>
                  </div>
                </div>

                <div className="r-fld">
                  <div className="r-fh">
                    <label className="r-lb">Password</label>
                    <span className="r-fg">Forgot Password?</span>
                  </div>
                  <div className="r-iw">
                    <span className="r-ii">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                        <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                      </svg>
                    </span>
                    <input className="r-inp r-inp-pw" name="password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="••••••••" required
                      autoComplete="current-password"/>
                    <button type="button" className="r-eye" tabIndex={-1}
                      onClick={()=>setShowPassword(v=>!v)}>
                      {showPassword
                        ? <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                            <line x1="1" y1="1" x2="23" y2="23"/>
                          </svg>
                        : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                            <circle cx="12" cy="12" r="3"/>
                          </svg>
                      }
                    </button>
                  </div>
                </div>

                {state?.error && (
                  <div className="r-err">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{flexShrink:0,marginTop:1}}>
                      <circle cx="12" cy="12" r="10"/>
                      <line x1="12" y1="8" x2="12" y2="12"/>
                      <line x1="12" y1="16" x2="12.01" y2="16"/>
                    </svg>
                    {state.error}
                  </div>
                )}

                <button type="submit" disabled={pending} className="r-btn">
                  {pending
                    ? <><svg className="spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>Signing In…</>
                    : <>Sign In <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg></>
                  }
                </button>
              </form>

              <p className="r-foot">
                Can&rsquo;t access your account?{' '}
                <span>Contact your administrator.</span>
              </p>

            </div>
          </div>

        </div>
      </div>
    </>
  )
}
