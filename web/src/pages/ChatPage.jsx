import { useEffect } from 'react'

export default function ChatPage() {
  useEffect(() => {
    if (document.getElementById('ebam-btn')) return // already loaded
    window.EBAMChat = { accentColor: '#1e3a5f', autoOpen: true }
    const script = document.createElement('script')
    script.src = '/widget.js'
    script.async = true
    document.body.appendChild(script)
  }, [])

  return (
    <div style={{ minHeight: 'calc(100vh - 56px)', backgroundColor: '#f8fafc' }}>
      {/* Mock website content */}
      <div style={{ maxWidth: 860, margin: '0 auto', padding: '48px 32px' }}>
        <div style={{ marginBottom: 40 }}>
          <div style={{ display: 'inline-block', backgroundColor: '#dbeafe', color: '#1d4ed8', fontSize: 12, fontWeight: 600, padding: '4px 12px', borderRadius: 20, marginBottom: 16 }}>
            Widget Preview
          </div>
          <h1 style={{ fontSize: 32, fontWeight: 800, color: '#0d1b2a', marginBottom: 12, lineHeight: 1.2 }}>
            Grow Your Practice with<br />AI-Powered Conversations
          </h1>
          <p style={{ fontSize: 15, color: '#64748b', maxWidth: 520, lineHeight: 1.7 }}>
            This page simulates a client website. The EBAM chat widget loads in the bottom-right corner — exactly as it would appear when embedded on any external site.
          </p>
          <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
            <button style={{ backgroundColor: '#1e3a5f', color: '#fff', border: 'none', borderRadius: 8, padding: '11px 24px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>Get Started</button>
            <button style={{ backgroundColor: '#fff', color: '#1e3a5f', border: '1.5px solid #e2e8f0', borderRadius: 8, padding: '11px 24px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>Learn More</button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 40 }}>
          {[
            { title: 'For Advisors', desc: 'Capture qualified leads automatically and let AI handle initial discovery conversations.' },
            { title: 'For CPAs', desc: 'Engage prospects 24/7 with personalized conversations about your services.' },
            { title: 'For Agencies', desc: 'White-label the widget and deploy across multiple client websites instantly.' },
          ].map(({ title, desc }) => (
            <div key={title} style={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '20px 18px' }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#0d1b2a', marginBottom: 8 }}>{title}</div>
              <div style={{ fontSize: 13, color: '#64748b', lineHeight: 1.6 }}>{desc}</div>
            </div>
          ))}
        </div>

        <div style={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '20px 24px', display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ width: 36, height: 36, backgroundColor: '#dbeafe', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1d4ed8" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#0d1b2a' }}>Chat widget is active</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>The widget opens automatically when you land on this page.</div>
          </div>
          <div style={{ marginLeft: 'auto' }}>
            <code style={{ fontSize: 11, backgroundColor: '#f1f5f9', padding: '6px 10px', borderRadius: 6, color: '#475569', whiteSpace: 'nowrap' }}>
              {`<script src="/widget.js"></script>`}
            </code>
          </div>
        </div>
      </div>
    </div>
  )
}
