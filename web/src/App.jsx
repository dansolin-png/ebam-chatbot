import { useState } from 'react'
import { Routes, Route, Link, useLocation, Navigate } from 'react-router-dom'
import ChatPage from './pages/ChatPage.jsx'
import AdminPage from './pages/AdminPage.jsx'
import LeadsPage from './pages/LeadsPage.jsx'
import UsersPage from './pages/UsersPage.jsx'
import LoginPage from './pages/LoginPage.jsx'
import CompliancePage from './pages/CompliancePage.jsx'
import HistoricalLeadsPage from './pages/HistoricalLeadsPage.jsx'
import FAQPage from './pages/FAQPage.jsx'

function useAuth() {
  const [token, setToken] = useState(() => localStorage.getItem('ebam_token') || '')
  const [role, setRole]   = useState(() => localStorage.getItem('ebam_role') || '')
  function login(t, r) { setToken(t); setRole(r) }
  function logout() {
    localStorage.removeItem('ebam_token')
    localStorage.removeItem('ebam_role')
    setToken(''); setRole('')
  }
  return { token, role, login, logout }
}

export default function App() {
  const location = useLocation()
  const { token, role, login, logout } = useAuth()
  const isEmbed = new URLSearchParams(window.location.search).get('embed') === '1'
  const isAdminArea = ['/admin', '/leads', '/users', '/login', '/compliance', '/history', '/faq'].includes(location.pathname)

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

        {/* Sign out — right */}
        {isAdminArea && (
          <button onClick={logout} style={{ background: 'none', border: '1px solid rgba(255,255,255,0.25)', borderRadius: 6, padding: '5px 12px', color: 'rgba(255,255,255,0.6)', fontSize: 12.5, cursor: 'pointer', flexShrink: 0, transition: 'all 0.15s' }}
            onMouseEnter={e => { e.currentTarget.style.color = '#fff'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.6)' }}
            onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.6)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.25)' }}
          >
            Sign out
          </button>
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
      </Routes>
    </div>
  )
}
