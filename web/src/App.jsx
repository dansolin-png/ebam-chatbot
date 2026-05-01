import { useState, useRef, useEffect } from 'react'
import { Routes, Route, Link, useLocation, Navigate, useNavigate } from 'react-router-dom'
import ChatPage from './pages/ChatPage.jsx'
import AdminPage from './pages/AdminPage.jsx'
import LeadsPage from './pages/LeadsPage.jsx'
import UsersPage from './pages/UsersPage.jsx'
import LoginPage from './pages/LoginPage.jsx'
import CompliancePage from './pages/CompliancePage.jsx'
import HistoricalLeadsPage from './pages/HistoricalLeadsPage.jsx'
import FAQPage from './pages/FAQPage.jsx'
import AgentPage from './pages/AgentPage.jsx'
import ProfilePage from './pages/ProfilePage.jsx'

function useAuth() {
  const [token,       setToken]       = useState(() => localStorage.getItem('ebam_token') || '')
  const [role,        setRole]        = useState(() => localStorage.getItem('ebam_role') || '')
  const [username,    setUsername]    = useState(() => localStorage.getItem('ebam_username') || '')
  const [displayName, setDisplayName] = useState(() => localStorage.getItem('ebam_display_name') || '')

  function login(t, r, u, d) {
    setToken(t); setRole(r)
    setUsername(u || ''); setDisplayName(d || u || '')
    localStorage.setItem('ebam_username', u || '')
    localStorage.setItem('ebam_display_name', d || u || '')
  }
  function logout() {
    localStorage.removeItem('ebam_token')
    localStorage.removeItem('ebam_role')
    localStorage.removeItem('ebam_username')
    localStorage.removeItem('ebam_display_name')
    setToken(''); setRole(''); setUsername(''); setDisplayName('')
  }
  function updateDisplayName(d) {
    setDisplayName(d)
    localStorage.setItem('ebam_display_name', d)
  }
  return { token, role, username, displayName, login, logout, updateDisplayName }
}

export default function App() {
  const location = useLocation()
  const { token, role, username, displayName, login, logout, updateDisplayName } = useAuth()
  const isEmbed = new URLSearchParams(window.location.search).get('embed') === '1'
  const isAdminArea = ['/admin', '/leads', '/users', '/login', '/compliance', '/history', '/faq', '/agent', '/profile'].includes(location.pathname)

  if (isEmbed) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: 'transparent' }}>
        <ChatPage embedMode />
      </div>
    )
  }

  if (!token && isAdminArea) {
    return <LoginPage onLogin={login} />
  }

  // Non-admin trying to access users page
  if (location.pathname === '/users' && role !== 'admin') {
    return <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>Access denied.</div>
  }

  const primaryNav = [
    { path: '/chat',  label: 'Chat Demo' },
    { path: '/admin', label: 'Flow Editor' },
    { path: '/leads', label: 'Leads' },
  ]
  const adminNav = [
    { path: '/agent',      label: 'Agent Inbox' },
    { path: '/compliance', label: 'Compliance' },
    { path: '/history',    label: 'History' },
    ...(role === 'admin' ? [{ path: '/users', label: 'Users' }] : []),
    { path: '/faq', label: 'Help' },
  ]

  const navLinkStyle = (path) => ({
    color: location.pathname === path ? '#fff' : 'rgba(255,255,255,0.6)',
    textDecoration: 'none',
    padding: '5px 12px',
    borderRadius: '6px',
    fontSize: '13.5px',
    fontWeight: location.pathname === path ? 600 : 400,
    backgroundColor: 'transparent',
    borderBottom: location.pathname === path ? '2px solid #60a5fa' : '2px solid transparent',
    transition: 'color 0.15s, border-color 0.15s',
    lineHeight: '1',
  })

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc' }}>
      <nav style={{
        backgroundColor: '#1e3a5f',
        padding: '0 32px',
        display: 'flex',
        alignItems: 'center',
        height: '52px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
      }}>
        {/* Logo */}
        <span style={{ color: '#fff', fontWeight: 700, fontSize: '17px', letterSpacing: '-0.3px', marginRight: '40px', flexShrink: 0 }}>
          EBAM
        </span>

        {/* Primary nav — left */}
        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
          {primaryNav.map(({ path, label }) => (
            <Link key={path} to={path} style={navLinkStyle(path)}
              onMouseEnter={e => { if (location.pathname !== path) e.currentTarget.style.color = '#fff' }}
              onMouseLeave={e => { if (location.pathname !== path) e.currentTarget.style.color = 'rgba(255,255,255,0.6)' }}
            >{label}</Link>
          ))}
        </div>

        {/* Divider */}
        <div style={{ width: '1px', height: '20px', backgroundColor: 'rgba(255,255,255,0.2)', margin: '0 20px' }} />

        {/* Admin nav — secondary */}
        <div style={{ display: 'flex', gap: '4px', alignItems: 'center', flex: 1 }}>
          {adminNav.map(({ path, label }) => (
            <Link key={path} to={path} style={navLinkStyle(path)}
              onMouseEnter={e => { if (location.pathname !== path) e.currentTarget.style.color = '#fff' }}
              onMouseLeave={e => { if (location.pathname !== path) e.currentTarget.style.color = 'rgba(255,255,255,0.6)' }}
            >{label}</Link>
          ))}
        </div>

        {/* Profile dropdown — right */}
        {isAdminArea && token && (
          <ProfileDropdown displayName={displayName} username={username} onLogout={logout} />
        )}
      </nav>

      <Routes>
        <Route path="/"      element={<Navigate to="/login" replace />} />
        <Route path="/login" element={token ? <Navigate to="/admin" replace /> : <LoginPage onLogin={login} />} />
        <Route path="/chat"  element={<ChatPage />} />
        <Route path="/admin"      element={<AdminPage />} />
        <Route path="/leads"      element={<LeadsPage />} />
        <Route path="/users"      element={<UsersPage />} />
        <Route path="/compliance" element={<CompliancePage />} />
        <Route path="/history"    element={<HistoricalLeadsPage />} />
        <Route path="/faq"        element={<FAQPage />} />
        <Route path="/agent"      element={<AgentPage displayName={displayName} />} />
        <Route path="/profile"    element={<ProfilePage username={username} displayName={displayName} onUpdate={updateDisplayName} />} />
      </Routes>
    </div>
  )
}

function ProfileDropdown({ displayName, username, onLogout }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const navigate = useNavigate()

  useEffect(() => {
    function handleClick(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const initial = (displayName || username || 'A')[0].toUpperCase()
  const label   = displayName || username

  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0 }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', transition: 'border-color 0.15s' }}
        onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.5)'}
        onMouseLeave={e => !open && (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)')}
      >
        <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'linear-gradient(135deg,#c9a84c,#e0c070)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#0d1b2a' }}>
          {initial}
        </div>
        <span style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.85)', fontWeight: 500 }}>{label}</span>
        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginLeft: 2 }}>▾</span>
      </button>

      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 8px)', right: 0, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', minWidth: 180, zIndex: 1000, overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid #f1f5f9' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#0d1b2a' }}>{label}</div>
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>@{username}</div>
          </div>
          <button
            onClick={() => { setOpen(false); navigate('/profile') }}
            style={{ width: '100%', padding: '10px 16px', background: 'none', border: 'none', textAlign: 'left', fontSize: 13, color: '#1e293b', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
            onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
            onMouseLeave={e => e.currentTarget.style.background = 'none'}
          >
            <span>👤</span> Edit profile
          </button>
          <button
            onClick={() => { setOpen(false); onLogout() }}
            style={{ width: '100%', padding: '10px 16px', background: 'none', border: 'none', borderTop: '1px solid #f1f5f9', textAlign: 'left', fontSize: 13, color: '#ef4444', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
            onMouseEnter={e => e.currentTarget.style.background = '#fef2f2'}
            onMouseLeave={e => e.currentTarget.style.background = 'none'}
          >
            <span>→</span> Sign out
          </button>
        </div>
      )}
    </div>
  )
}
