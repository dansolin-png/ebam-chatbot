import { useState, useEffect } from 'react'
import { getUsers, createUser, deleteUser, resetPassword } from '../api/auth.js'

const NAVY = '#0d1b2a'

export default function UsersPage() {
  const [users, setUsers]         = useState([])
  const [loading, setLoading]     = useState(true)
  const [username, setUsername]   = useState('')
  const [password, setPassword]   = useState('')
  const [error, setError]         = useState('')
  const [status, setStatus]       = useState('')
  const [resetting, setResetting] = useState(null) // username being reset
  const [newPwd, setNewPwd]       = useState('')

  useEffect(() => {
    getUsers().then(setUsers).finally(() => setLoading(false))
  }, [])

  function flash(msg, isError = false) {
    isError ? setError(msg) : setStatus(msg)
    setTimeout(() => { setError(''); setStatus('') }, 3000)
  }

  async function handleCreate(e) {
    e.preventDefault()
    if (!username.trim() || !password.trim()) return
    try {
      await createUser(username.trim(), password)
      const updated = await getUsers()
      setUsers(updated)
      setUsername('')
      setPassword('')
      flash(`User '${username.trim()}' created.`)
    } catch (err) {
      flash(err.message, true)
    }
  }

  async function handleResetPassword(u) {
    if (!newPwd.trim()) return
    try {
      await resetPassword(u, newPwd.trim())
      setResetting(null)
      setNewPwd('')
      flash(`Password reset for '${u}'.`)
    } catch {
      flash('Failed to reset password.', true)
    }
  }

  async function handleDelete(u) {
    if (!confirm(`Delete user '${u}'? This cannot be undone.`)) return
    try {
      await deleteUser(u)
      setUsers(prev => prev.filter(x => x.username !== u))
      flash(`User '${u}' deleted.`)
    } catch {
      flash('Failed to delete user.', true)
    }
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>Loading...</div>

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: '32px 24px' }}>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: NAVY, marginBottom: 4 }}>User Management</h1>
        <p style={{ color: '#64748b', fontSize: 13 }}>Create and manage admin dashboard users.</p>
      </div>

      {/* Create user form */}
      <div style={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '20px 24px', marginBottom: 20 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', marginBottom: 16 }}>Add New User</div>
        <form onSubmit={handleCreate} style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 160 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 5 }}>Username</label>
            <input
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="e.g. john"
              style={inputStyle}
            />
          </div>
          <div style={{ flex: 1, minWidth: 160 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 5 }}>Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Enter password"
              style={inputStyle}
            />
          </div>
          <button
            type="submit"
            disabled={!username.trim() || !password.trim()}
            style={{ backgroundColor: NAVY, color: '#fff', border: 'none', borderRadius: 8, padding: '9px 18px', fontSize: 13, fontWeight: 600, cursor: !username.trim() || !password.trim() ? 'not-allowed' : 'pointer', opacity: !username.trim() || !password.trim() ? 0.5 : 1, whiteSpace: 'nowrap' }}
          >
            Create User
          </button>
        </form>
        {error  && <div style={{ marginTop: 10, fontSize: 13, color: '#ef4444' }}>{error}</div>}
        {status && <div style={{ marginTop: 10, fontSize: 13, color: '#16a34a' }}>{status}</div>}
      </div>

      {/* Users list */}
      <div style={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }}>
        {/* Built-in admin row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: users.length > 0 ? '1px solid #f1f5f9' : 'none', backgroundColor: '#f8fafc' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: '50%', backgroundColor: '#1e3a5f', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700 }}>A</div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#1e293b' }}>admin</div>
              <div style={{ fontSize: 11, color: '#94a3b8' }}>Built-in administrator</div>
            </div>
          </div>
          <span style={{ backgroundColor: '#dbeafe', color: '#1d4ed8', padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600 }}>Admin</span>
        </div>

        {users.length === 0 && (
          <div style={{ padding: '24px', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
            No additional users yet.
          </div>
        )}

        {users.map((u, i) => (
          <div key={u.id} style={{ borderBottom: i < users.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 32, height: 32, borderRadius: '50%', backgroundColor: '#e2e8f0', color: '#475569', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700 }}>
                  {u.username[0].toUpperCase()}
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#1e293b' }}>{u.username}</div>
                  <div style={{ fontSize: 11, color: '#94a3b8' }}>Created {new Date(u.created_at).toLocaleDateString()}</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => { setResetting(resetting === u.username ? null : u.username); setNewPwd('') }}
                  style={{ background: 'none', border: '1px solid #e2e8f0', borderRadius: 6, padding: '4px 12px', fontSize: 12, color: '#475569', cursor: 'pointer' }}
                >
                  Reset Password
                </button>
                <button
                  onClick={() => handleDelete(u.username)}
                  style={{ background: 'none', border: '1px solid #fecaca', borderRadius: 6, padding: '4px 12px', fontSize: 12, color: '#dc2626', cursor: 'pointer' }}
                >
                  Delete
                </button>
              </div>
            </div>

            {resetting === u.username && (
              <div style={{ padding: '0 20px 14px', display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  type="password"
                  value={newPwd}
                  onChange={e => setNewPwd(e.target.value)}
                  placeholder="New password"
                  autoFocus
                  style={{ ...inputStyle, maxWidth: 220 }}
                />
                <button
                  onClick={() => handleResetPassword(u.username)}
                  disabled={!newPwd.trim()}
                  style={{ backgroundColor: NAVY, color: '#fff', border: 'none', borderRadius: 6, padding: '7px 14px', fontSize: 12, fontWeight: 600, cursor: !newPwd.trim() ? 'not-allowed' : 'pointer', opacity: !newPwd.trim() ? 0.5 : 1 }}
                >
                  Save
                </button>
                <button
                  onClick={() => { setResetting(null); setNewPwd('') }}
                  style={{ background: 'none', border: 'none', fontSize: 12, color: '#94a3b8', cursor: 'pointer' }}
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

const inputStyle = {
  width: '100%',
  border: '1.5px solid #e2e8f0',
  borderRadius: 8,
  padding: '9px 12px',
  fontSize: 13,
  outline: 'none',
  boxSizing: 'border-box',
}
