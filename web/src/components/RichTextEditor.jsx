import { useRef, useEffect } from 'react'
import { renderMessageHtml } from '../utils/renderMessage.js'

const TOOLBAR = [
  { icon: 'B',  cmd: 'bold',                  title: 'Bold',      style: { fontWeight: 700 } },
  { icon: 'I',  cmd: 'italic',                title: 'Italic',    style: { fontStyle: 'italic' } },
  { icon: 'U',  cmd: 'underline',             title: 'Underline', style: { textDecoration: 'underline' } },
  { icon: 'A+', cmd: null, size: '5',         title: 'Larger',    style: {} },
  { icon: 'A−', cmd: null, size: '2',         title: 'Smaller',   style: {} },
  { icon: '—',  cmd: 'insertHorizontalRule',  title: 'Divider',   style: {} },
]

export default function RichTextEditor({ value, onChange, minHeight = 72 }) {
  const editorRef = useRef(null)
  const initRef   = useRef(false)

  useEffect(() => {
    if (editorRef.current && !initRef.current) {
      editorRef.current.innerHTML = renderMessageHtml(value) || ''
      initRef.current = true
    }
  }, [])

  function exec(cmd, val = null) {
    editorRef.current?.focus()
    document.execCommand(cmd, false, val)
  }

  return (
    <div style={{ border: '1.5px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
      <div style={{ display: 'flex', gap: 3, padding: '5px 8px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', flexWrap: 'wrap' }}>
        {TOOLBAR.map(({ icon, cmd, size, title, style: ts }) => (
          <button
            key={icon}
            title={title}
            type="button"
            style={{ ...ts, padding: '2px 9px', border: '1px solid #e2e8f0', borderRadius: 4, background: '#fff', cursor: 'pointer', fontSize: 11, color: '#374151', lineHeight: 1.6 }}
            onMouseDown={e => {
              e.preventDefault()
              size ? exec('fontSize', size) : exec(cmd)
            }}
          >
            {icon}
          </button>
        ))}
      </div>
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        style={{ minHeight, padding: '10px 12px', fontSize: 13, lineHeight: 1.6, color: '#1e293b', outline: 'none', backgroundColor: '#fff', wordBreak: 'break-word' }}
        onInput={() => onChange(editorRef.current.innerHTML)}
      />
    </div>
  )
}
