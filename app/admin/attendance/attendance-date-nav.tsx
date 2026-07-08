'use client'

import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight } from 'lucide-react'

interface Props {
  selectedDate: string
  today: string
}

function shift(date: string, days: number) {
  const d = new Date(date + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().split('T')[0]
}

export default function AttendanceDateNav({ selectedDate, today }: Props) {
  const router  = useRouter()
  const isToday = selectedDate === today

  function go(date: string) {
    router.push(`/admin/attendance?date=${date}`)
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => go(shift(selectedDate, -1))}
        className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors hover:bg-gray-100"
        style={{ border: '1px solid #E5E7EB' }}
      >
        <ChevronLeft size={16} style={{ color: "#27187E" }} />
      </button>

      <input
        type="date"
        value={selectedDate}
        max={today}
        onChange={(e) => e.target.value && go(e.target.value)}
        className="text-[13px] font-semibold px-3 py-1.5 rounded-lg"
        style={{ border: '1px solid #E5E7EB', color: '#111827', outline: 'none' }}
      />

      <button
        onClick={() => !isToday && go(shift(selectedDate, 1))}
        disabled={isToday}
        className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
        style={{ border: '1px solid #E5E7EB' }}
      >
        <ChevronRight size={16} style={{ color: "#27187E" }} />
      </button>

      {!isToday && (
        <button
          onClick={() => go(today)}
          className="text-[12px] font-semibold px-3 py-1.5 rounded-lg transition-colors hover:opacity-80"
          style={{ background: 'rgba(222,26,26,0.1)', color: '#de1a1a' }}
        >
          Today
        </button>
      )}
    </div>
  )
}
