import { Routes, Route, Link, useLocation } from 'react-router-dom'
import ChatPage from './pages/ChatPage.jsx'
import AdminPage from './pages/AdminPage.jsx'
import LeadsPage from './pages/LeadsPage.jsx'

export default function App() {
  const location = useLocation()
  const isEmbed = new URLSearchParams(window.location.search).get('embed') === '1'

  // When loaded as an embed (iframe), show only the floating widget
  if (isEmbed) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: 'transparent' }}>
        <ChatPage embedMode />
      </div>
    )
  }

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
        <span style={{ color: '#fff', fontWeight: 700, fontSize: '18px', letterSpacing: '-0.3px' }}>
          EBAM
        </span>
        <div style={{ display: 'flex', gap: '4px' }}>
          {[
            { path: '/', label: 'Chat Demo' },
            { path: '/admin', label: 'Flow Editor' },
            { path: '/leads', label: 'Leads' },
          ].map(({ path, label }) => (
            <Link
              key={path}
              to={path}
              style={{
                color: location.pathname === path ? '#60a5fa' : 'rgba(255,255,255,0.7)',
                textDecoration: 'none',
                padding: '6px 14px',
                borderRadius: '6px',
                fontSize: '14px',
                fontWeight: 500,
                backgroundColor: location.pathname === path ? 'rgba(96,165,250,0.1)' : 'transparent',
                transition: 'all 0.15s',
              }}
            >
              {label}
            </Link>
          ))}
        </div>
      </nav>

      <Routes>
        <Route path="/" element={<ChatPage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/leads" element={<LeadsPage />} />
      </Routes>
    </div>
  )
}
