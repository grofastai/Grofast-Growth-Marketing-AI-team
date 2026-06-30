'use client'
import { useState } from 'react'
import { Download } from 'lucide-react'
import { exportFilename, buildWordDocument } from '@/lib/notes/export'

export function ExportMenu({ title, getHtml }: { title: string; getHtml: () => string }) {
  const [open, setOpen] = useState(false)
  const asWord = () => {
    const blob = new Blob(['﻿', buildWordDocument(title || 'Untitled', getHtml())], { type: 'application/msword' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = exportFilename(title, 'doc'); a.click()
    URL.revokeObjectURL(a.href); setOpen(false)
  }
  const asPdf = () => {
    const w = window.open('', '_blank'); if (!w) return
    w.document.write(`<html><head><title>${exportFilename(title, 'pdf')}</title></head><body><h1>${title || 'Untitled'}</h1>${getHtml()}</body></html>`)
    w.document.close(); w.focus(); w.print(); setOpen(false)
  }
  return (
    <div style={{ position: 'relative' }}>
      <button type="button" onClick={() => setOpen(o => !o)} title="Export"
        style={{ display: 'flex', alignItems: 'center', gap: 5, background: '#F3F4F6', border: 'none', borderRadius: 8, padding: '7px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', color: '#374151' }}>
        <Download size={14} /> Export
      </button>
      {open && (
        <div style={{ position: 'absolute', bottom: 40, left: 0, background: '#fff', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.15)', border: '1px solid #F1F1F4', zIndex: 20, width: 150 }}>
          <div onClick={asPdf} style={{ padding: '9px 12px', fontSize: 13, cursor: 'pointer' }}>Export as PDF</div>
          <div onClick={asWord} style={{ padding: '9px 12px', fontSize: 13, cursor: 'pointer', borderTop: '1px solid #F1F1F4' }}>Export as Word</div>
        </div>
      )}
    </div>
  )
}
