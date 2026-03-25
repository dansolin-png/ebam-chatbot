import { useState } from 'react'
import { Routes, Route, Link, useLocation, Navigate } from 'react-router-dom'
import ChatPage from './pages/ChatPage.jsx'
import AdminPage from './pages/AdminPage.jsx'
import LeadsPage from './pages/LeadsPage.jsx'
import UsersPage from './pages/UsersPage.jsx'
import LoginPage from './pages/LoginPage.jsx'
import CompliancePage from './pages/CompliancePage.jsx'
import HistoricalLeadsPage from './pages/HistoricalLeadsPage.jsx'

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
  const isAdminArea = ['/admin', '/leads', '/users', '/login', '/compliance', '/history'].includes(location.pathname)

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

  const navItems = [
    { path: '/chat',       label: 'Chat Demo' },
    { path: '/admin',      label: 'Flow Editor' },
    { path: '/leads',      label: 'Leads' },
    { path: '/compliance', label: 'Compliance' },
    { path: '/history',    label: 'History' },
    ...(role === 'admin' ? [{ path: '/users', label: 'Users' }] : []),
  ]

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc' }}>
      <nav style={{
        backgroundColor: '#1e3a5f',
        padding: '0 24px',
        display: 'flex',
        alignItems: 'center',
        gap: '32px',
        height: '56px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
      }}>
        <span style={{ color: '#fff', fontWeight: 700, fontSize: '18px', letterSpacing: '-0.3px' }}>EBAM</span>
        <div style={{ display: 'flex', gap: '4px', flex: 1 }}>
          {navItems.map(({ path, label }) => (
            <Link key={path} to={path} style={{
              color: location.pathname === path ? '#60a5fa' : 'rgba(255,255,255,0.7)',
              textDecoration: 'none',
              padding: '6px 14px',
              borderRadius: '6px',
              fontSize: '14px',
              fontWeight: 500,
              backgroundColor: location.pathname === path ? 'rgba(96,165,250,0.1)' : 'transparent',
              transition: 'all 0.15s',
            }}>
              {label}
            </Link>
          ))}
        </div>
        {isAdminArea && (
          <button onClick={logout} style={{ background: 'none', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 6, padding: '5px 12px', color: 'rgba(255,255,255,0.7)', fontSize: 13, cursor: 'pointer' }}>
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
      </Routes>
    </div>
  )
}
