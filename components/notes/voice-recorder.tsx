'use client'
import { useEffect, useRef, useState } from 'react'
import { Mic, Square, Play, Trash2, Loader2 } from 'lucide-react'
import { addAudioAttachment, getAttachments, deleteAttachment } from '@/lib/actions/notes'
import { useToast } from '@/components/ui/useToast'

function fmt(s: number) { const m = Math.floor(s / 60); const r = s % 60; return `${m}:${String(r).padStart(2, '0')}` }

export function VoiceRecorder({ noteId }: { noteId: string }) {
  const { toastEl, showToast } = useToast()
  const [list, setList] = useState<{ id: string; url: string; duration: number | null }[]>([])
  const [recording, setRecording] = useState(false)
  const [secs, setSecs] = useState(0)
  const [busy, setBusy] = useState(false)
  const rec = useRef<MediaRecorder | null>(null)
  const chunks = useRef<Blob[]>([])
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)
  const secsRef = useRef(0)

  const reload = () => getAttachments(noteId).then(a => setList(a.filter(x => x.type === 'audio').map(x => ({ id: x.id, url: x.url, duration: x.duration }))))
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally reload only when the note changes
  useEffect(() => { reload() }, [noteId])

  const start = async () => {
    let stream: MediaStream
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }) }
    catch { showToast('Microphone permission denied'); return }
    const mr = new MediaRecorder(stream); rec.current = mr; chunks.current = []
    mr.ondataavailable = e => chunks.current.push(e.data)
    mr.onstop = async () => {
      stream.getTracks().forEach(t => t.stop())
      const blob = new Blob(chunks.current, { type: 'audio/webm' })
      const dur = secsRef.current
      setBusy(true)
      try {
        const fd = new FormData(); fd.append('file', blob, 'voice.webm'); fd.append('noteId', noteId)
        const res = await fetch('/api/notes/audio', { method: 'POST', body: fd })
        const json = await res.json()
        if (json.url) { await addAudioAttachment(noteId, json.url, dur, 'voice.webm'); await reload() }
        else showToast(json.error ?? 'Upload failed')
      } finally { setBusy(false); setSecs(0); secsRef.current = 0 }
    }
    mr.start(); setRecording(true); setSecs(0); secsRef.current = 0
    timer.current = setInterval(() => { secsRef.current += 1; setSecs(secsRef.current) }, 1000)
  }
  const stop = () => { rec.current?.stop(); setRecording(false); if (timer.current) clearInterval(timer.current) }
  const remove = async (id: string) => { await deleteAttachment(id); reload() }

  useEffect(() => () => { if (timer.current) clearInterval(timer.current) }, [])

  return (
    <div style={{ padding: 10, border: '1px solid #F1F1F4', borderRadius: 12, marginTop: 8 }}>
      {toastEl}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {recording ? (
          <button onClick={stop} style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#DE1A1A', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 12px', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
            <Square size={13} /> Stop · {fmt(secs)}
          </button>
        ) : (
          <button onClick={start} disabled={busy} style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#F3F4F6', border: 'none', borderRadius: 8, padding: '7px 12px', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#374151' }}>
            {busy ? <Loader2 size={13} className="animate-spin" /> : <Mic size={13} />} {busy ? 'Saving…' : 'Record voice note'}
          </button>
        )}
        {recording && <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#DE1A1A', animation: 'pulse 1s infinite' }} />}
      </div>
      {list.map(a => (
        <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
          <Play size={13} color="#DE1A1A" />
          <audio controls src={a.url} style={{ height: 30, flex: 1 }} />
          {a.duration != null && <span style={{ fontSize: 11, color: '#9CA3AF' }}>{fmt(a.duration)}</span>}
          <button onClick={() => remove(a.id)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#9CA3AF' }}><Trash2 size={13} /></button>
        </div>
      ))}
    </div>
  )
}
