'use client'

import { useState, useTransition } from 'react'
import { createShoot } from '@/lib/actions/shoots'
import {
  Camera, Plus, X, Loader2, MapPin, Users, Wrench,
  IndianRupee, Clock, CheckCircle2, XCircle, CalendarClock,
} from 'lucide-react'

type Shoot = {
  id: string
  title: string
  client: string
  location: string
  start_time: string
  end_time: string
  team_assigned: string | null
  equipment_used: string | null
  travel_expense: number
  status: 'scheduled' | 'completed' | 'cancelled'
  created_at: string
}

const STATUS_STYLE = {
  scheduled: { label: 'Scheduled', color: '#2563EB', bg: 'rgba(37,99,235,0.1)',  icon: CalendarClock },
  completed: { label: 'Completed', color: '#16A34A', bg: 'rgba(22,163,74,0.1)', icon: CheckCircle2  },
  cancelled: { label: 'Cancelled', color: '#de1a1a', bg: 'rgba(222,26,26,0.1)', icon: XCircle       },
}

const FIELD: React.CSSProperties = {
  background: '#F9FAFB', border: '1px solid #E5E7EB',
  color: '#111111', width: '100%', borderRadius: '10px',
  padding: '10px 13px', fontSize: '13px', outline: 'none', fontFamily: 'inherit',
}

const EMPTY = {
  title: '', client: '', location: '',
  start_time: '', end_time: '',
  team_assigned: '', equipment_used: '',
  travel_expense: '',
}

function fmt(dt: string) {
  return new Date(dt).toLocaleString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function duration(start: string, end: string) {
  const mins = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000)
  if (mins < 60) return `${mins}m`
  const h = Math.floor(mins / 60), m = mins % 60
  return m ? `${h}h ${m}m` : `${h}h`
}

export default function MemberShootsClient({ shoots }: { shoots: Shoot[] }) {
  const [showForm, setShowForm]   = useState(false)
  const [form, setForm]           = useState(EMPTY)
  const [error, setError]         = useState('')
  const [pending, start]          = useTransition()

  const set = (k: keyof typeof EMPTY) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm(p => ({ ...p, [k]: e.target.value }))

  function handleSubmit() {
    setError('')
    start(async () => {
      const res = await createShoot({
        ...form,
        travel_expense: parseFloat(form.travel_expense) || 0,
      })
      if (res.success) { setForm(EMPTY); setShowForm(false) }
      else setError(res.error ?? 'Failed to submit')
    })
  }

  const totalExp = shoots.reduce((a, s) => a + (s.travel_expense ?? 0), 0)

  return (
    <div className="p-4 md:p-6 xl:p-8 max-w-[1400px]">
      {/* Header */}
      <div className="flex items-start justify-between mb-7">
        <div>
          <h1 className="gradient-heading text-[30px] font-black leading-tight" style={{ fontFamily: 'var(--font-jakarta)' }}>
            Shoot Log
          </h1>
          <p className="text-sm mt-1" style={{ color: '#6B7280' }}>Log and track your media shoots</p>
        </div>
        <button onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-bold"
          style={{ background: 'linear-gradient(135deg, #de1a1a, #7F1D1D)', color: '#FFFFFF' }}>
          <Plus size={14} /> New Shoot
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
        {[
          { label: 'Total Shoots',    value: shoots.length,                           color: '#111111' },
          { label: 'Completed',       value: shoots.filter(s => s.status === 'completed').length, color: '#16A34A' },
          { label: 'Travel Expenses', value: `₹${totalExp.toLocaleString('en-IN')}`, color: '#de1a1a' },
        ].map(s => (
          <div key={s.label} className="rounded-xl p-4" style={{ background: '#FFFFFF', border: '1px solid #E5E7EB' }}>
            <p className="text-[22px] font-black leading-none mb-1"
              style={{ fontFamily: 'var(--font-jakarta)', color: s.color }}>{s.value}</p>
            <p className="text-[11px] font-medium" style={{ color: '#6B7280' }}>{s.label}</p>
          </div>
        ))}
      </div>

      {/* List */}
      {shoots.length === 0 ? (
        <div className="flex flex-col items-center py-20 rounded-2xl"
          style={{ background: 'rgba(0,0,0,0.02)', border: '1px solid #E5E7EB' }}>
          <Camera size={32} style={{ color: '#E5E7EB' }} className="mb-3" />
          <p className="text-[13px] font-semibold" style={{ color: '#6B7280' }}>No shoots logged yet</p>
          <p className="text-[12px] mt-1" style={{ color: '#D1D5DB' }}>Tap "New Shoot" to log one.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {shoots.map(shoot => {
            const st   = STATUS_STYLE[shoot.status] ?? STATUS_STYLE.scheduled
            const Icon = st.icon
            return (
              <div key={shoot.id} className="rounded-2xl p-5"
                style={{ background: '#FFFFFF', border: '1px solid #E5E7EB' }}>
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5"
                    style={{ background: 'rgba(222,26,26,0.06)' }}>
                    <Camera size={16} style={{ color: '#de1a1a' }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-[14px] font-bold" style={{ color: '#111111' }}>{shoot.title}</p>
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold"
                            style={{ background: st.bg, color: st.color }}>
                            <Icon size={9} /> {st.label}
                          </span>
                        </div>
                        <p className="text-[13px] font-semibold mt-0.5" style={{ color: '#374151' }}>{shoot.client}</p>
                      </div>
                      <p className="text-[14px] font-black flex-shrink-0"
                        style={{ fontFamily: 'var(--font-jakarta)', color: '#111111' }}>
                        ₹{(shoot.travel_expense ?? 0).toLocaleString('en-IN')}
                      </p>
                    </div>

                    <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div className="flex items-start gap-1.5">
                        <MapPin size={12} className="mt-0.5 flex-shrink-0" style={{ color: '#9CA3AF' }} />
                        <span className="text-[12px]" style={{ color: '#6B7280' }}>{shoot.location}</span>
                      </div>
                      <div className="flex items-start gap-1.5">
                        <Clock size={12} className="mt-0.5 flex-shrink-0" style={{ color: '#9CA3AF' }} />
                        <span className="text-[12px]" style={{ color: '#6B7280' }}>
                          {fmt(shoot.start_time)} · {duration(shoot.start_time, shoot.end_time)}
                        </span>
                      </div>
                      {shoot.team_assigned && (
                        <div className="flex items-start gap-1.5">
                          <Users size={12} className="mt-0.5 flex-shrink-0" style={{ color: '#9CA3AF' }} />
                          <span className="text-[12px]" style={{ color: '#6B7280' }}>{shoot.team_assigned}</span>
                        </div>
                      )}
                      {shoot.equipment_used && (
                        <div className="flex items-start gap-1.5">
                          <Wrench size={12} className="mt-0.5 flex-shrink-0" style={{ color: '#9CA3AF' }} />
                          <span className="text-[12px]" style={{ color: '#6B7280' }}>{shoot.equipment_used}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modal */}
      {showForm && (
        <>
          <div className="fixed inset-0 z-40" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
            onClick={() => setShowForm(false)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="w-full max-w-[500px] rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto"
              style={{ background: '#FFFFFF', border: '1px solid rgba(222,26,26,0.15)' }}>

              <div className="px-6 py-5 flex items-center justify-between sticky top-0 z-10"
                style={{ background: '#FFFFFF', borderBottom: '1px solid #E5E7EB' }}>
                <h2 className="text-[16px] font-bold" style={{ color: '#111111' }}>Log a Shoot</h2>
                <button onClick={() => setShowForm(false)}
                  className="w-8 h-8 rounded-full flex items-center justify-center"
                  style={{ border: '1px solid #E5E7EB' }}>
                  <X size={14} style={{ color: '#6B7280' }} />
                </button>
              </div>

              <div className="px-6 py-5 space-y-4">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-[0.15em] mb-1.5" style={{ color: '#6B7280' }}>Shoot Title *</label>
                  <input placeholder="e.g. Brand Campaign Shoot" style={FIELD} value={form.title} onChange={set('title')} />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-[0.15em] mb-1.5" style={{ color: '#6B7280' }}>Client *</label>
                  <input placeholder="Client name" style={FIELD} value={form.client} onChange={set('client')} />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-[0.15em] mb-1.5" style={{ color: '#6B7280' }}>Location *</label>
                  <input placeholder="Shoot location / address" style={FIELD} value={form.location} onChange={set('location')} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-[0.15em] mb-1.5" style={{ color: '#6B7280' }}>Start Time *</label>
                    <input type="datetime-local" style={{ ...FIELD, colorScheme: 'light' }} value={form.start_time} onChange={set('start_time')} />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-[0.15em] mb-1.5" style={{ color: '#6B7280' }}>End Time *</label>
                    <input type="datetime-local" style={{ ...FIELD, colorScheme: 'light' }} value={form.end_time} onChange={set('end_time')} />
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-[0.15em] mb-1.5" style={{ color: '#6B7280' }}>Team Assigned</label>
                  <input placeholder="e.g. Ravi, Priya" style={FIELD} value={form.team_assigned} onChange={set('team_assigned')} />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-[0.15em] mb-1.5" style={{ color: '#6B7280' }}>Equipment Used</label>
                  <textarea rows={2} placeholder="e.g. Sony A7IV, Ronin, LED Panel" style={{ ...FIELD, resize: 'none' }}
                    value={form.equipment_used} onChange={set('equipment_used')} />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-[0.15em] mb-1.5" style={{ color: '#6B7280' }}>Travel Expense (₹)</label>
                  <input type="number" min="0" step="1" placeholder="0" style={FIELD}
                    value={form.travel_expense} onChange={set('travel_expense')} />
                </div>
                {error && (
                  <p className="text-[12px] px-3 py-2 rounded-lg"
                    style={{ background: 'rgba(222,26,26,0.06)', color: '#de1a1a' }}>{error}</p>
                )}
              </div>

              <div className="px-6 pb-5 flex gap-3 sticky bottom-0"
                style={{ background: '#FFFFFF', borderTop: '1px solid #E5E7EB', paddingTop: '16px' }}>
                <button onClick={() => setShowForm(false)}
                  className="flex-1 py-2.5 rounded-xl text-[13px] font-semibold"
                  style={{ background: '#F9FAFB', color: '#6B7280', border: '1px solid #E5E7EB' }}>
                  Cancel
                </button>
                <button onClick={handleSubmit} disabled={pending}
                  className="flex-1 py-2.5 rounded-xl text-[13px] font-bold flex items-center justify-center gap-2 disabled:opacity-60"
                  style={{ background: 'linear-gradient(135deg, #de1a1a, #7F1D1D)', color: '#FFFFFF' }}>
                  {pending && <Loader2 size={13} className="animate-spin" />}
                  Submit
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
