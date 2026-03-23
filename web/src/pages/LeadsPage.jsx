import { useState, useEffect } from 'react'
import { getLeadsList as getLeads } from '../api/admin.js'
import { renderMessageHtml } from '../utils/renderMessage.js'

export default function LeadsPage() {
  const [leads, setLeads] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [selectedLead, setSelectedLead] = useState(null)

  useEffect(() => {
    getLeads()
      .then(setLeads)
      .finally(() => setLoading(false))
  }, [])

  const filtered = filter === 'all' ? leads : leads.filter(l => l.user_type === filter)

  function formatDate(dt) {
    if (!dt) return '—'
    return new Date(dt).toLocaleString()
  }

  async function handleClearAll() {
    if (!confirm('Delete ALL leads, sessions, and messages? This cannot be undone.')) return
    await fetch('/api/leads/all', { method: 'DELETE' })
    setLeads([])
    setSelectedLead(null)
  }

  function downloadCSV() {
    const headers = ['Name', 'Email', 'Phone', 'Type', 'Concern', 'Budget', 'Date']
    const rows = filtered.map(l => [
      l.name || '',
      l.email || '',
      l.phone || '',
      l.user_type || '',
      l.collected_data?.concern || l.collected_data?.cpa_interest || '',
      l.collected_data?.budget || '',
      formatDate(l.created_at),
    ])
    const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'ebam-leads.csv'
    a.click()
  }

  if (loading) return <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>Loading...</div>

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 56px)', overflow: 'hidden' }}>
      {/* Main list */}
      <div style={{ flex: 1, overflow: 'auto', padding: '32px 24px' }}>
        <div style={{ maxWidth: selectedLead ? '100%' : '1100px', margin: '0 auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '24px' }}>
            <div>
              <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#1e3a5f', marginBottom: '4px' }}>
                Leads
              </h1>
              <p style={{ color: '#64748b', fontSize: '14px' }}>
                {leads.length} total lead{leads.length !== 1 ? 's' : ''} captured
              </p>
            </div>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <div style={{ display: 'flex', border: '1.5px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
                {['all', 'advisor', 'cpa'].map(f => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    style={{
                      padding: '7px 14px',
                      border: 'none',
                      backgroundColor: filter === f ? '#1e3a5f' : '#fff',
                      color: filter === f ? '#fff' : '#64748b',
                      fontSize: '13px',
                      fontWeight: filter === f ? 600 : 400,
                      cursor: 'pointer',
                      textTransform: 'capitalize',
                    }}
                  >
                    {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
                  </button>
                ))}
              </div>
              <button
                onClick={downloadCSV}
                style={{ backgroundColor: '#fff', border: '1.5px solid #e2e8f0', borderRadius: '8px', padding: '7px 14px', fontSize: '13px', color: '#1e3a5f', fontWeight: 600, cursor: 'pointer' }}
              >
                Export CSV
              </button>
              <button
                onClick={handleClearAll}
                style={{ backgroundColor: '#fff', border: '1.5px solid #fecaca', borderRadius: '8px', padding: '7px 14px', fontSize: '13px', color: '#dc2626', fontWeight: 600, cursor: 'pointer' }}
              >
                Clear All
              </button>
            </div>
          </div>

          {filtered.length === 0 ? (
            <div style={{
              backgroundColor: '#fff',
              border: '1px solid #e2e8f0',
              borderRadius: '12px',
              padding: '48px',
              textAlign: 'center',
              color: '#94a3b8',
            }}>
              No leads yet. Complete a chat conversation to capture a lead.
            </div>
          ) : (
            <div style={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                    {['Name', 'Email', 'Phone', 'Type', 'Concern / Interest', 'Captured'].map(h => (
                      <th key={h} style={{
                        padding: '12px 16px',
                        textAlign: 'left',
                        fontSize: '12px',
                        fontWeight: 600,
                        color: '#475569',
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em',
                      }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((lead, i) => (
                    <tr
                      key={lead.id}
                      onClick={() => setSelectedLead(lead)}
                      style={{
                        borderBottom: '1px solid #f1f5f9',
                        backgroundColor: selectedLead?.id === lead.id ? '#eff6ff' : i % 2 === 0 ? '#fff' : '#fafafa',
                        cursor: 'pointer',
                        transition: 'background 0.1s',
                      }}
                    >
                      <td style={tdStyle}>{lead.name || <span style={{ color: '#94a3b8' }}>—</span>}</td>
                      <td style={tdStyle}>{lead.email || <span style={{ color: '#94a3b8' }}>—</span>}</td>
                      <td style={tdStyle}>{lead.phone || <span style={{ color: '#94a3b8' }}>—</span>}</td>
                      <td style={tdStyle}>
                        {lead.user_type && (
                          <span style={{
                            backgroundColor: lead.user_type === 'advisor' ? '#dbeafe' : '#dcfce7',
                            color: lead.user_type === 'advisor' ? '#1d4ed8' : '#15803d',
                            padding: '2px 10px',
                            borderRadius: '20px',
                            fontSize: '12px',
                            fontWeight: 600,
                            textTransform: 'capitalize',
                          }}>
                            {lead.user_type}
                          </span>
                        )}
                      </td>
                      <td style={tdStyle}>
                        {lead.collected_data?.concern || lead.collected_data?.cpa_interest || <span style={{ color: '#94a3b8' }}>—</span>}
                      </td>
                      <td style={{ ...tdStyle, color: '#94a3b8', fontSize: '12px' }}>
                        {formatDate(lead.created_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Detail panel */}
      {selectedLead && (
        <LeadDetail lead={selectedLead} onClose={() => setSelectedLead(null)} formatDate={formatDate} />
      )}
    </div>
  )
}

function LeadDetail({ lead, onClose, formatDate }) {
  const [messages, setMessages] = useState(null)
  const [loadingMsgs, setLoadingMsgs] = useState(true)

  useEffect(() => {
    setLoadingMsgs(true)
    fetch(`/api/chat/history/${lead.session_id}`)
      .then(r => r.json())
      .then(setMessages)
      .catch(() => setMessages([]))
      .finally(() => setLoadingMsgs(false))
  }, [lead.session_id])

  return (
    <div style={{
      width: '420px',
      minWidth: '420px',
      borderLeft: '1px solid #e2e8f0',
      display: 'flex',
      flexDirection: 'column',
      backgroundColor: '#fff',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{ padding: '20px 20px 16px', borderBottom: '1px solid #e2e8f0', flexShrink: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: '16px', fontWeight: 700, color: '#1e293b' }}>
              {lead.name || 'Unknown'}
            </div>
            <div style={{ fontSize: '13px', color: '#64748b', marginTop: 2 }}>{lead.email}</div>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: '18px', lineHeight: 1, padding: '2px 4px' }}
          >
            ✕
          </button>
        </div>

        {/* Lead meta */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
          {lead.user_type && (
            <Chip color={lead.user_type === 'advisor' ? 'blue' : 'green'}>
              {lead.user_type === 'advisor' ? '💼 Advisor' : '🧾 CPA'}
            </Chip>
          )}
          {lead.phone && <Chip color="gray">📞 {lead.phone}</Chip>}
          {(lead.collected_data?.concern || lead.collected_data?.cpa_interest) && (
            <Chip color="gray">{lead.collected_data.concern || lead.collected_data.cpa_interest}</Chip>
          )}
        </div>
        <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: 8 }}>
          Captured {formatDate(lead.created_at)}
        </div>
      </div>

      {/* Conversation */}
      <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ fontSize: '11px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
          Conversation History
        </div>

        {loadingMsgs ? (
          <div style={{ color: '#94a3b8', fontSize: '13px', textAlign: 'center', paddingTop: 20 }}>Loading...</div>
        ) : messages?.length === 0 ? (
          <div style={{ color: '#94a3b8', fontSize: '13px', textAlign: 'center', paddingTop: 20 }}>No messages found.</div>
        ) : (
          messages.map((msg, i) => {
            const isBot = msg.role === 'bot' || msg.role === 'assistant'
            const ts = msg.created_at ? new Date(msg.created_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'medium' }) : null
            return (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: isBot ? 'flex-start' : 'flex-end', gap: 2 }}>
                <div style={{
                  maxWidth: '85%',
                  padding: '8px 12px',
                  borderRadius: isBot ? '4px 12px 12px 12px' : '12px 4px 12px 12px',
                  backgroundColor: isBot ? '#f1f5f9' : '#1e3a5f',
                  color: isBot ? '#1e293b' : '#fff',
                  fontSize: '13px',
                  lineHeight: 1.55,
                }}>
                  {isBot
                    ? <span dangerouslySetInnerHTML={{ __html: renderMessageHtml(msg.content) }} />
                    : msg.content
                  }
                </div>
                {ts && <div style={{ fontSize: '10px', color: '#94a3b8', paddingLeft: isBot ? 4 : 0, paddingRight: isBot ? 0 : 4 }}>{ts}</div>}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

function Chip({ color, children }) {
  const colors = {
    blue:  { bg: '#dbeafe', fg: '#1d4ed8' },
    green: { bg: '#dcfce7', fg: '#15803d' },
    gray:  { bg: '#f1f5f9', fg: '#475569' },
  }
  const { bg, fg } = colors[color] || colors.gray
  return (
    <span style={{ backgroundColor: bg, color: fg, padding: '2px 10px', borderRadius: 20, fontSize: 12, fontWeight: 500 }}>
      {children}
    </span>
  )
}

const tdStyle = {
  padding: '12px 16px',
  fontSize: '14px',
  color: '#1e293b',
  verticalAlign: 'middle',
}
