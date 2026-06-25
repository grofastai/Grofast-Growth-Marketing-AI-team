'use client'
import { Editor } from '@tiptap/react'
import { Bold, Italic, Underline as U, Heading1, Heading2, List, ListOrdered,
  CheckSquare, Quote, Table as TableIcon, Link as LinkIcon, Minus, Undo2, Redo2 } from 'lucide-react'

function Btn({ on, active, children, label }: { on: () => void; active?: boolean; children: React.ReactNode; label: string }) {
  return (
    <button type="button" title={label} aria-label={label} onClick={on}
      style={{ width: 30, height: 30, borderRadius: 8, border: 'none', cursor: 'pointer',
        display: 'grid', placeItems: 'center',
        background: active ? '#DE1A1A' : 'transparent', color: active ? '#fff' : '#374151' }}>
      {children}
    </button>
  )
}

export function TiptapToolbar({ editor }: { editor: Editor | null }) {
  if (!editor) return null
  return (
    <div style={{ display: 'flex', gap: 2, flexWrap: 'wrap', padding: 6, borderBottom: '1px solid #F1F1F4' }}>
      <Btn label="Bold"      on={() => editor.chain().focus().toggleBold().run()}            active={editor.isActive('bold')}><Bold size={15}/></Btn>
      <Btn label="Italic"    on={() => editor.chain().focus().toggleItalic().run()}          active={editor.isActive('italic')}><Italic size={15}/></Btn>
      <Btn label="Underline" on={() => editor.chain().focus().toggleUnderline().run()}       active={editor.isActive('underline')}><U size={15}/></Btn>
      <Btn label="Heading 1" on={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} active={editor.isActive('heading', { level: 1 })}><Heading1 size={15}/></Btn>
      <Btn label="Heading 2" on={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive('heading', { level: 2 })}><Heading2 size={15}/></Btn>
      <Btn label="Bullet list"   on={() => editor.chain().focus().toggleBulletList().run()}  active={editor.isActive('bulletList')}><List size={15}/></Btn>
      <Btn label="Numbered list" on={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive('orderedList')}><ListOrdered size={15}/></Btn>
      <Btn label="Checklist"  on={() => editor.chain().focus().toggleTaskList().run()}        active={editor.isActive('taskList')}><CheckSquare size={15}/></Btn>
      <Btn label="Quote"      on={() => editor.chain().focus().toggleBlockquote().run()}      active={editor.isActive('blockquote')}><Quote size={15}/></Btn>
      <Btn label="Table"      on={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}><TableIcon size={15}/></Btn>
      <Btn label="Link"       on={() => { const url = window.prompt('Link URL'); if (url) editor.chain().focus().setLink({ href: url }).run() }} active={editor.isActive('link')}><LinkIcon size={15}/></Btn>
      <Btn label="Divider"    on={() => editor.chain().focus().setHorizontalRule().run()}><Minus size={15}/></Btn>
      <Btn label="Undo"       on={() => editor.chain().focus().undo().run()}><Undo2 size={15}/></Btn>
      <Btn label="Redo"       on={() => editor.chain().focus().redo().run()}><Redo2 size={15}/></Btn>
    </div>
  )
}
