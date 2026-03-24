import { useState } from 'react'
import { loginApi } from '../api/auth.js'

const NAVY = '#0d1b2a'

export default function LoginPage({ onLogin }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const { token, role } = await loginApi(username.trim(), password)
      localStorage.setItem('ebam_token', token)
      localStorage.setItem('ebam_role', role)
      onLogin(token, role)
    } catch {
      setError('Invalid username or password.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f8fafc' }}>
      <div style={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '40px 36px', width: 360, boxShadow: '0 4px 16px rgba(0,0,0,0.06)' }}>
        <div style={{ marginBottom: 28, textAlign: 'center' }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: NAVY, marginBottom: 6 }}>EBAM Admin</div>
          <div style={{ fontSize: 13, color: '#64748b' }}>Sign in to access the dashboard</div>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 5 }}>Username</label>
            <input
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="Enter username"
              autoFocus
              style={{ width: '100%', border: '1.5px solid #e2e8f0', borderRadius: 8, padding: '9px 12px', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
            />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 5 }}>Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Enter password"
              style={{ width: '100%', border: '1.5px solid #e2e8f0', borderRadius: 8, padding: '9px 12px', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
            />
          </div>

          {error && <div style={{ fontSize: 13, color: '#ef4444', textAlign: 'center' }}>{error}</div>}

          <button
            type="submit"
            disabled={loading || !username.trim() || !password}
            style={{ backgroundColor: NAVY, color: '#fff', border: 'none', borderRadius: 8, padding: '10px', fontSize: 14, fontWeight: 600, cursor: loading || !username.trim() || !password ? 'not-allowed' : 'pointer', opacity: loading || !username.trim() || !password ? 0.6 : 1, marginTop: 4 }}
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  )
}
