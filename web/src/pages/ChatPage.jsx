import ChatWidget from '../components/ChatWidget.jsx'

export default function ChatPage({ embedMode = false }) {
  return (
    <div style={{
      minHeight: 'calc(100vh - 56px)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#f8fafc',
      padding: '40px 24px',
    }}>
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: '#0d1b2a', marginBottom: 6 }}>
          Widget Test
        </h1>
        <p style={{ fontSize: 13, color: '#94a3b8' }}>
          The chat widget is open below. Click the button to toggle it.
        </p>
      </div>

      {/* Widget opens by default on this page */}
      <ChatWidget defaultOpen={true} />
    </div>
  )
}
