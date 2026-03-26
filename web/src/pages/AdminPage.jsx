import { useState, useEffect } from 'react'
import { getChatbotConfig, saveChatbotConfig, resetChatbotConfig, getStats, getFlow, saveFlow, resetFlow } from '../api/admin.js'
import FlowEditor from '../components/FlowEditor.jsx'
import RichTextEditor from '../components/RichTextEditor.jsx'

const NAVY = '#0d1b2a'

const AUDIENCES = [
  { key: 'advisor', label: '💼 Financial Advisor', hint: 'Conversational flow for financial advisors.' },
  { key: 'cpa',     label: '🧾 CPA',               hint: 'Conversational flow for CPAs.' },
]

export default function AdminPage() {
  const [config, setConfig]   = useState(null)
  const [flows, setFlows]     = useState({ advisor: null, cpa: null })
  const [stats, setStats]     = useState(null)
  const [saveStatus, setSaveStatus] = useState('')
  const [loading, setLoading] = useState(true)
  const [openSections, setOpenSections] = useState({})

  useEffect(() => {
    Promise.all([getChatbotConfig(), getStats(), getFlow('advisor'), getFlow('cpa')])
      .then(([cfg, st, advisorFlow, cpaFlow]) => {
        setConfig(cfg)
        setStats(st)
        setFlows({ advisor: advisorFlow, cpa: cpaFlow })
      }).finally(() => setLoading(false))
  }, [])

  async function handleSave() {
    try {
      await Promise.all([
        saveChatbotConfig(config),
        saveFlow('advisor', flows.advisor),
        saveFlow('cpa', flows.cpa),
      ])
      setSaveStatus('Saved!')
    } catch {
      setSaveStatus('Error saving')
    }
    setTimeout(() => setSaveStatus(''), 3000)
  }

  async function handleReset() {
    if (!confirm('Reset all config and flows to factory defaults?')) return
    await Promise.all([resetChatbotConfig(), resetFlow('advisor'), resetFlow('cpa')])
    const [cfg, advisorFlow, cpaFlow] = await Promise.all([getChatbotConfig(), getFlow('advisor'), getFlow('cpa')])
    setConfig(cfg)
    setFlows({ advisor: advisorFlow, cpa: cpaFlow })
    setSaveStatus('Reset to defaults.')
    setTimeout(() => setSaveStatus(''), 3000)
  }

  function toggleSection(key) {
    setOpenSections(s => ({ ...s, [key]: !s[key] }))
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>Loading...</div>

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '0 24px 32px' }}>

      {/* Sticky header */}
      <div style={{ position: 'sticky', top: 0, zIndex: 10, backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0', padding: '14px 0', marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ fontSize: 18, fontWeight: 700, color: NAVY, margin: 0 }}>Chatbot Configuration</h1>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {saveStatus && (
            <span style={{ color: saveStatus.startsWith('Error') ? '#ef4444' : '#16a34a', fontSize: 13, fontWeight: 500 }}>
              {saveStatus}
            </span>
          )}
          <button style={st.resetBtn} onClick={handleReset}>Reset All</button>
          <button style={st.saveBtn} onClick={handleSave}>Save All</button>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div style={st.statsBar}>
          {[
            { label: 'Sessions', value: stats.total_sessions },
            { label: 'Leads',    value: stats.total_leads },
            { label: 'Messages', value: stats.total_messages },
          ].map(({ label, value }) => (
            <div key={label} style={st.statCard}>
              <div style={st.statValue}>{value}</div>
              <div style={st.statLabel}>{label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Allowed Origins */}
      {config && (
        <div style={st.card}>
          <div style={{ ...st.sectionTitle, marginBottom: 4 }}>Allowed Origins</div>
          <div style={{ ...st.sectionHint, marginBottom: 10 }}>
            Domains allowed to embed the chatbot widget. One per line (e.g. <code>https://yourdomain.com</code>).
            Leave empty to allow all origins. Use <code>*</code> to explicitly allow all.
          </div>
          <textarea
            style={{ ...st.textarea, height: 100, fontFamily: 'monospace', fontSize: 12 }}
            placeholder={'https://yourdomain.com\nhttps://www.yourdomain.com'}
            value={(config.allowed_origins || []).join('\n')}
            onChange={e => setConfig(c => ({
              ...c,
              allowed_origins: e.target.value.split('\n').map(s => s.trim()).filter(Boolean)
            }))}
          />
          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 6 }}>
            Requests from unlisted origins will receive a 403 error. Rate limit: 20 messages / minute per IP.
          </div>
        </div>
      )}

      {/* Greeting Message */}
      {config && (
        <div style={st.card}>
          <div style={{ ...st.sectionTitle, marginBottom: 4 }}>Greeting Message</div>
          <div style={{ ...st.sectionHint, marginBottom: 10 }}>Shown to every visitor before they select their audience.</div>
          <RichTextEditor
            value={config.greeting || ''}
            onChange={v => setConfig(c => ({ ...c, greeting: v }))}
            minHeight={80}
          />
        </div>
      )}

      {/* Per-audience sections */}
      {config && AUDIENCES.map(({ key, label, hint }) => (
        <AudienceSection
          key={key}
          label={label}
          hint={hint}
          audience={config[key] || {}}
          flow={flows[key]}
          isOpen={!!openSections[key]}
          onToggle={() => toggleSection(key)}
          onAudienceChange={(field, val) => setConfig(c => ({ ...c, [key]: { ...c[key], [field]: val } }))}
          onFlowChange={fl => setFlows(f => ({ ...f, [key]: fl }))}
        />
      ))}

    </div>
  )
}


function AudienceSection({ label, hint, audience, flow, isOpen, onToggle, onAudienceChange, onFlowChange }) {
  return (
    <div style={{ ...st.card, marginTop: 16 }}>
      <div
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
        onClick={onToggle}
      >
        <div>
          <div style={st.sectionTitle}>{label}</div>
          <div style={st.sectionHint}>{hint}</div>
        </div>
        <span style={{ color: '#94a3b8', fontSize: 18 }}>{isOpen ? '▲' : '▼'}</span>
      </div>

      {isOpen && (
        <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Default LLM Prompt */}
          <div>
            <label style={st.fieldLabel}>
              Default LLM Prompt
              <span style={st.fieldHint}> — instruction for the AI when "Use default prompt" is selected. The user's selection and message are prepended automatically.</span>
            </label>
            <textarea
              style={{ ...st.textarea, height: 90, marginTop: 6, fontFamily: 'monospace', fontSize: 12 }}
              value={audience?.defaultLLMPrompt || ''}
              onChange={e => onAudienceChange('defaultLLMPrompt', e.target.value)}
            />
          </div>

          {/* Conversation Flow */}
          {flow
            ? <FlowEditor flowJson={flow} onChange={onFlowChange} />
            : <div style={{ padding: 20, textAlign: 'center', color: '#94a3b8' }}>Loading flow...</div>
          }

        </div>
      )}
    </div>
  )
}

const st = {
  statsBar:     { display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20 },
  statCard:     { backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '14px 20px', minWidth: 110, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' },
  statValue:    { fontSize: 26, fontWeight: 700, color: NAVY, lineHeight: 1, marginBottom: 4 },
  statLabel:    { fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' },
  saveBtn:      { backgroundColor: NAVY, color: '#fff', border: 'none', borderRadius: 8, padding: '8px 20px', fontSize: 14, fontWeight: 600, cursor: 'pointer' },
  resetBtn:     { backgroundColor: '#fff', color: '#64748b', border: '1.5px solid #e2e8f0', borderRadius: 8, padding: '8px 14px', fontSize: 14, cursor: 'pointer' },
  card:         { backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '18px 20px' },
  sectionTitle: { fontSize: 14, fontWeight: 700, color: '#1e293b', marginBottom: 2 },
  sectionHint:  { fontSize: 12, color: '#94a3b8' },
  fieldLabel:   { fontSize: 12, fontWeight: 600, color: '#475569', display: 'block' },
  fieldHint:    { fontSize: 12, fontWeight: 400, color: '#94a3b8' },
  textarea:     { width: '100%', border: '1.5px solid #e2e8f0', borderRadius: 8, padding: '10px 12px', fontSize: 13, lineHeight: 1.6, fontFamily: 'inherit', resize: 'vertical', outline: 'none', color: '#1e293b', backgroundColor: '#f8fafc', boxSizing: 'border-box' },
}
