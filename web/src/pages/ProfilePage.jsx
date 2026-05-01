import { useState } from 'react'
import { updateProfile } from '../api/auth.js'

const NAVY = '#0d1b2a'
const GOLD = '#c9a84c'

export default function ProfilePage({ username, displayName, onUpdate }) {
  const [nameInput, setNameInput] = useState(displayName || '')
  const [saving, setSaving]       = useState(false)
  const [saved, setSaved]         = useState(false)
  const [error, setError]         = useState('')

  async function handleSave(e) {
    e.preventDefault()
    if (!nameInput.trim()) return
    setSaving(true); setError(''); setSaved(false)
    try {
      await updateProfile(nameInput.trim())
      onUpdate(nameInput.trim())
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err) {
      setError(err.message || 'Failed to save.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ maxWidth: 480, margin: '48px auto', padding: '0 24px' }}>
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '36px 32px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>

        {/* Avatar */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 28 }}>
          <div style={{ width: 64, height: 64, borderRadius: '50%', background: `linear-gradient(135deg,${GOLD},#e0c070)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, fontWeight: 700, color: NAVY, marginBottom: 12 }}>
            {(displayName || username || 'A')[0].toUpperCase()}
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, color: NAVY }}>{displayName || username}</div>
          <div style={{ fontSize: 13, color: '#94a3b8', marginTop: 2 }}>@{username}</div>
        </div>

        <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 24 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#475569', marginBottom: 16, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Display Name</div>

          <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <input
              value={nameInput}
              onChange={e => setNameInput(e.target.value)}
              placeholder="Your full name"
              style={{ padding: '10px 14px', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: 14, outline: 'none', width: '100%', boxSizing: 'border-box' }}
            />
            {error && <div style={{ fontSize: 13, color: '#ef4444' }}>{error}</div>}
            {saved && <div style={{ fontSize: 13, color: '#22c55e', fontWeight: 500 }}>✓ Display name updated</div>}
            <button
              type="submit"
              disabled={saving || !nameInput.trim() || nameInput.trim() === displayName}
              style={{ padding: '10px 20px', borderRadius: 8, background: NAVY, color: '#fff', border: 'none', fontSize: 14, fontWeight: 600, cursor: 'pointer', opacity: saving || !nameInput.trim() || nameInput.trim() === displayName ? 0.5 : 1 }}
            >
              {saving ? 'Saving...' : 'Save changes'}
            </button>
          </form>
        </div>

        <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 20, marginTop: 24 }}>
          <div style={{ fontSize: 13, color: '#94a3b8' }}>
            <span style={{ fontWeight: 600, color: '#475569' }}>Note: </span>
            Your display name appears in the Agent Inbox when chatting with visitors.
          </div>
        </div>
      </div>
    </div>
  )
}
