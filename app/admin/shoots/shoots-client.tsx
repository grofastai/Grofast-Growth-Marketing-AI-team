'use client'

import { useState, useTransition } from 'react'
import { createShoot, updateShootStatus, deleteShoot } from '@/lib/actions/shoots'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import {
  Camera, Plus, X, Loader2, MapPin, Users, Wrench,
  IndianRupee, Clock, CheckCircle2, XCircle, CalendarClock, Trash2, AlertTriangle,
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
  travel_time_hours: number | null
  status: 'scheduled' | 'completed' | 'cancelled'
  created_at: string
  creator: { name: string } | null
}

const STATUS_STYLE = {
  scheduled:  { label: 'Scheduled',  color: '#2563EB', bg: 'rgba(37,99,235,0.1)',   icon: CalendarClock },
  completed:  { label: 'Completed',  color: '#16A34A', bg: 'rgba(22,163,74,0.1)',   icon: CheckCircle2  },
  cancelled:  { label: 'Cancelled',  color: '#de1a1a', bg: 'rgba(222,26,26,0.1)',   icon: XCircle       },
}

const FIELD: React.CSSProperties = {
  background: '#F9FAFB', border: '1px solid #E5E7EB',
  color: '#111111', width: '100%', borderRadius: '10px',
  padding: '10px 13px', fontSize: '13px', outline: 'none', fontFamily: 'inherit',
}

const EMPTY: FormState = {
  title: '', client: '', location: '',
  start_time: '', end_time: '',
  team_assigned: '', equipment_used: '',
  travel_expense: '', travel_time_hours: '0',
}

type FormState = {
  title: string; client: string; location: string
  start_time: string; end_time: string
  team_assigned: string; equipment_used: string
  travel_expense: string; travel_time_hours: string
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

export default function AdminShootsClient({ shoots }: { shoots: Shoot[] }) {
  const confirm = useConfirm()
  const [showForm, setShowForm]   = useState(false)
  const [form, setForm]           = useState<FormState>(EMPTY)
  const [formError, setFormError] = useState('')
  const [pending, start]          = useTransition()
  const [actionId, setActionId]   = useState<string | null>(null)

  const set = (k: keyof FormState) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm(p => ({ ...p, [k]: e.target.value }))

  function handleCreate() {
    setFormError('')
    setActionId('create')
    start(async () => {
      const res = await createShoot({
        ...form,
        travel_expense:    parseFloat(form.travel_expense) || 0,
        travel_time_hours: parseFloat(form.travel_time_hours) || 0,
      })
      if (res.success) { setForm(EMPTY); setShowForm(false) }
      else setFormError(res.error ?? 'Failed to create')
      setActionId(null)
    })
  }

  function handleStatus(id: string, status: Shoot['status']) {
    setActionId(id + status)
    start(async () => {
      await updateShootStatus(id, status)
      setActionId(null)
    })
  }

  async function handleDelete(id: string) {
    if (!(await confirm('Delete this shoot record?'))) return
    setActionId(id + 'del')
    start(async () => {
      await deleteShoot(id)
      setActionId(null)
    })
  }

  const scheduled = shoots.filter(s => s.status === 'scheduled').length
  const completed = shoots.filter(s => s.status === 'completed').length
  const totalExp  = shoots.reduce((a, s) => a + (s.travel_expense ?? 0), 0)

  return (
    <div className="p-4 md:p-6 xl:p-8 max-w-[1400px]">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 mb-7">
        <div>
          <h1 className="gradient-heading text-[30px] font-black leading-tight" style={{ fontFamily: 'var(--font-jakarta)' }}>
            Shoots
          </h1>
          <p className="text-sm mt-1" style={{ color: '#6B7280' }}>Media team shoot schedules and logs</p>
        </div>
        <button onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-bold"
          style={{ background: 'linear-gradient(135deg, #de1a1a, #7F1D1D)', color: '#FFFFFF' }}>
          <Plus size={14} /> New Shoot
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Total Shoots',    value: shoots.length,                              color: '#111111' },
          { label: 'Scheduled',       value: scheduled,                                  color: '#2563EB' },
          { label: 'Completed',       value: completed,                                  color: '#16A34A' },
          { label: 'Travel Expenses', value: `₹${totalExp.toLocaleString('en-IN')}`,    color: '#de1a1a' },
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
          <p className="text-[12px] mt-1" style={{ color: '#D1D5DB' }}>Add the first shoot above.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {shoots.map(shoot => {
            const st  = STATUS_STYLE[shoot.status] ?? STATUS_STYLE.scheduled
            const Icon = st.icon
            return (
              <div key={shoot.id} className="rounded-2xl p-5"
                style={{ background: '#FFFFFF', border: '1px solid #E5E7EB' }}>
                <div className="flex items-start gap-4">
                  {/* Icon */}
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5"
                    style={{ background: 'rgba(222,26,26,0.06)' }}>
                    <Camera size={16} style={{ color: '#de1a1a' }} />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-[15px] font-bold" style={{ color: '#111111' }}>{shoot.title}</p>
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold"
                            style={{ background: st.bg, color: st.color }}>
                            <Icon size={9} /> {st.label}
                          </span>
                        </div>
                        <p className="text-[13px] font-semibold mt-0.5" style={{ color: '#374151' }}>
                          {shoot.client}
                        </p>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {shoot.status === 'scheduled' && (
                          <button
                            onClick={() => handleStatus(shoot.id, 'completed')}
                            disabled={pending && actionId === shoot.id + 'completed'}
                            className="px-3 py-1.5 rounded-lg text-[11px] font-bold flex items-center gap-1"
                            style={{ background: 'rgba(22,163,74,0.1)', color: '#16A34A' }}>
                            {pending && actionId === shoot.id + 'completed'
                              ? <Loader2 size={10} className="animate-spin" />
                              : <CheckCircle2 size={10} />}
                            Done
                          </button>
                        )}
                        {shoot.status === 'scheduled' && (
                          <button
                            onClick={() => handleStatus(shoot.id, 'cancelled')}
                            disabled={pending && actionId === shoot.id + 'cancelled'}
                            className="px-3 py-1.5 rounded-lg text-[11px] font-bold flex items-center gap-1"
                            style={{ background: 'rgba(222,26,26,0.08)', color: '#de1a1a' }}>
                            {pending && actionId === shoot.id + 'cancelled'
                              ? <Loader2 size={10} className="animate-spin" />
                              : <XCircle size={10} />}
                            Cancel
                          </button>
                        )}
                        <button
                          onClick={() => handleDelete(shoot.id)}
                          disabled={pending && actionId === shoot.id + 'del'}
                          className="w-8 h-8 rounded-lg flex items-center justify-center"
                          style={{ background: 'rgba(0,0,0,0.04)' }}>
                          {pending && actionId === shoot.id + 'del'
                            ? <Loader2 size={13} className="animate-spin" style={{ color: '#6B7280' }} />
                            : <Trash2 size={13} style={{ color: '#6B7280' }} />}
                        </button>
                      </div>
                    </div>

                    {/* Meta row */}
                    <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
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

                    {/* Footer */}
                    <div className="flex items-center gap-4 mt-3 pt-3 flex-wrap"
                      style={{ borderTop: '1px solid #F3F4F6' }}>
                      <div className="flex items-center gap-1.5">
                        <IndianRupee size={11} style={{ color: '#9CA3AF' }} />
                        <span className="text-[12px] font-semibold" style={{ color: '#374151' }}>
                          ₹{(shoot.travel_expense ?? 0).toLocaleString('en-IN')} travel
                        </span>
                      </div>
                      {(shoot.travel_time_hours ?? 0) > 0 && (
                        <div className="flex items-center gap-1.5">
                          <Clock size={11} style={{ color: '#9CA3AF' }} />
                          <span className="text-[12px] font-semibold" style={{ color: '#374151' }}>
                            {shoot.travel_time_hours}h travel time
                          </span>
                        </div>
                      )}
                      {shoot.creator && (
                        <span className="text-[11px]" style={{ color: '#9CA3AF' }}>
                          Logged by {shoot.creator.name}
                        </span>
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
              {/* Header */}
              <div className="px-6 py-5 flex items-center justify-between sticky top-0 z-10"
                style={{ background: '#FFFFFF', borderBottom: '1px solid #E5E7EB' }}>
                <h2 className="text-[16px] font-bold" style={{ color: '#111111' }}>New Shoot</h2>
                <button onClick={() => setShowForm(false)}
                  className="w-8 h-8 rounded-full flex items-center justify-center"
                  style={{ border: '1px solid #E5E7EB' }}>
                  <X size={14} style={{ color: '#6B7280' }} />
                </button>
              </div>

              <div className="px-6 py-5 space-y-4">
                {/* Title */}
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-[0.15em] mb-1.5" style={{ color: '#6B7280' }}>Shoot Title *</label>
                  <input placeholder="e.g. Product Launch Campaign" style={FIELD} value={form.title} onChange={set('title')} />
                </div>

                {/* Client */}
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-[0.15em] mb-1.5" style={{ color: '#6B7280' }}>Client *</label>
                  <input placeholder="Client name" style={FIELD} value={form.client} onChange={set('client')} />
                </div>

                {/* Location */}
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-[0.15em] mb-1.5" style={{ color: '#6B7280' }}>Location *</label>
                  <input placeholder="Shoot location / address" style={FIELD} value={form.location} onChange={set('location')} />
                </div>

                {/* Time */}
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

                {/* Team */}
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-[0.15em] mb-1.5" style={{ color: '#6B7280' }}>Team Assigned</label>
                  <input placeholder="e.g. Ravi, Priya, Arun" style={FIELD} value={form.team_assigned} onChange={set('team_assigned')} />
                </div>

                {/* Equipment */}
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-[0.15em] mb-1.5" style={{ color: '#6B7280' }}>Equipment Used</label>
                  <textarea rows={2} placeholder="e.g. Sony A7IV, DJI Ronin, LED Panel..." style={{ ...FIELD, resize: 'none' }}
                    value={form.equipment_used} onChange={set('equipment_used')} />
                </div>

                {/* Travel Expense + Travel Time */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-[0.15em] mb-1.5" style={{ color: '#6B7280' }}>Travel Expense (₹)</label>
                    <input type="number" min="0" step="1" placeholder="0" style={FIELD}
                      value={form.travel_expense} onChange={set('travel_expense')} />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-[0.15em] mb-1.5" style={{ color: '#6B7280' }}>Travel Time</label>
                    <select style={FIELD} value={form.travel_time_hours} onChange={set('travel_time_hours')}>
                      <option value="0">None</option>
                      {[0.5,1,1.5,2,2.5,3,3.5,4].map(h => (
                        <option key={h} value={String(h)}>{h}h</option>
                      ))}
                    </select>
                    <p className="text-[10px] mt-1" style={{ color: '#9CA3AF' }}>Internal only · not billed</p>
                  </div>
                </div>

                {formError && (
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, padding: '10px 14px' }}>
                    <AlertTriangle size={13} color="#EF4444" style={{ flexShrink: 0, marginTop: 1 }} />
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#DC2626', lineHeight: 1.4 }}>{formError}</span>
                  </div>
                )}
              </div>

              <div className="px-6 pb-5 flex gap-3 sticky bottom-0"
                style={{ background: '#FFFFFF', borderTop: '1px solid #E5E7EB', paddingTop: '16px' }}>
                <button onClick={() => setShowForm(false)}
                  className="flex-1 py-2.5 rounded-xl text-[13px] font-semibold"
                  style={{ background: '#F9FAFB', color: '#6B7280', border: '1px solid #E5E7EB' }}>
                  Cancel
                </button>
                <button onClick={handleCreate} disabled={pending && actionId === 'create'}
                  className="flex-1 py-2.5 rounded-xl text-[13px] font-bold flex items-center justify-center gap-2 disabled:opacity-60"
                  style={{ background: 'linear-gradient(135deg, #de1a1a, #7F1D1D)', color: '#FFFFFF' }}>
                  {pending && actionId === 'create' && <Loader2 size={13} className="animate-spin" />}
                  Save Shoot
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
