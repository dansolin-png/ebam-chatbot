import { useState, useEffect, useRef } from 'react'

const API_BASE  = import.meta.env.VITE_API_BASE_URL || ''
const WS_BASE   = import.meta.env.VITE_WS_URL || 'ws://localhost:8000'

const CANNED_TEMPLATES = [
  'Hi {name}, I\'m {agent} — happy to help you today! What questions do you have?',
  'Thanks for reaching out, {name}! Let me look into that for you.',
  'Great question, {name}! Here\'s what I can share...',
  'I completely understand your concern. Let me explain how we handle that.',
  'Would you like me to schedule a quick call to walk you through everything?',
  'Feel free to reach me directly at any time — we\'re here to help.',
]

const NAVY     = '#0d1b2a'
const NAVY_MID = '#162032'
const NAVY_LT  = '#1e2d40'
const GOLD     = '#c9a84c'
const GOLD_LT  = '#e0c070'
const WHITE    = '#f8f6f1'
const GREEN    = '#4caf7d'
const AMBER    = '#f59e0b'

// ---------------------------------------------------------------------------
// Simple unique ID for this agent session (local dev — no auth)
// ---------------------------------------------------------------------------
function getAgentId() {
  let id = sessionStorage.getItem('ebam_agent_id')
  if (!id) { id = 'agent-' + Math.random().toString(36).slice(2, 8); sessionStorage.setItem('ebam_agent_id', id) }
  return id
}
function getAgentName() {
  return sessionStorage.getItem('ebam_agent_name') || ''
}

export default function AgentPage({ displayName: propDisplayName }) {
  // Use logged-in display name from props; fall back to sessionStorage for backwards compat
  const initialName = propDisplayName || getAgentName() || ''
  const [agentName, setAgentName] = useState(initialName)
  const [nameInput, setNameInput] = useState('')
  const [registered, setRegistered] = useState(!!initialName)
  const [connected, setConnected]   = useState(false)

  const [queue, setQueue]           = useState([])   // waiting sessions
  const [activeChats, setActiveChats] = useState({}) // session_id -> { history, session, unread }
  const [selectedSession, setSelectedSession] = useState(null)
  const [inputValue, setInputValue] = useState('')
  const [agentTyping, setAgentTyping] = useState({}) // session_id -> bool
  const [showCanned, setShowCanned]   = useState(false)

  const wsRef           = useRef(null)
  const bottomRef       = useRef(null)
  const pendingSelectRef = useRef(null)   // session_id to select after activeChats updates
  const agentId         = getAgentId()

  // Auto-select session after chat_context populates activeChats
  useEffect(() => {
    if (pendingSelectRef.current && activeChats[pendingSelectRef.current]) {
      setSelectedSession(pendingSelectRef.current)
      pendingSelectRef.current = null
    }
  }, [activeChats])

  // Scroll to bottom when active chat messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [activeChats, selectedSession])

  // Auto-connect on mount if we already have a name (from logged-in user)
  useEffect(() => {
    if (initialName && !wsRef.current) {
      registerAndConnect(initialName)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Heartbeat every 20s
  useEffect(() => {
    if (!registered) return
    const interval = setInterval(() => {
      fetch(`${API_BASE}/api/agent/heartbeat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent_id: agentId }),
      })
    }, 20_000)
    return () => clearInterval(interval)
  }, [registered])

  function registerAndConnect(name) {
    if (!name.trim()) return
    const finalName = name.trim()
    sessionStorage.setItem('ebam_agent_name', finalName)
    setAgentName(finalName)
    setRegistered(true)

    fetch(`${API_BASE}/api/agent/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agent_id: agentId, name: finalName }),
    })
      .catch(() => {}) // non-fatal — WS connects regardless
      .finally(() => openWebSocket(finalName))
  }

  function openWebSocket(agentNameArg) {
    if (wsRef.current && wsRef.current.readyState < 2) return // already open/connecting
    const encodedName = encodeURIComponent(agentNameArg || agentName || '')
    const ws = new WebSocket(`${WS_BASE}/ws?role=agent&agent_id=${agentId}&name=${encodedName}`)
    wsRef.current = ws

    ws.onopen = () => setConnected(true)
    ws.onclose = () => {
      setConnected(false)
      // Auto-reconnect after 3s
      setTimeout(() => openWebSocket(agentNameArg), 3000)
    }
    ws.onerror = () => ws.close()

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data)

      if (data.type === 'queue_update') {
        setQueue(data.queue || [])
      }
      else if (data.type === 'chat_context') {
        const sid = data.session_id
        console.log('[AgentPage] chat_context received, session_id=', sid, 'session=', data.session, 'history length=', data.history?.length)
        pendingSelectRef.current = sid
        setActiveChats(prev => ({
          ...prev,
          [sid]: {
            session: data.session || {},
            history: data.history || [],
            unread:  0,
          },
        }))
      }
      else if (data.type === 'message' && data.from === 'user') {
        const sid = data.session_id
        setActiveChats(prev => {
          const chat = prev[sid] || { session: {}, history: [], unread: 0 }
          return {
            ...prev,
            [sid]: {
              ...chat,
              history: [...chat.history, { role: 'user', content: data.text, created_at: new Date().toISOString() }],
              unread: selectedSession === sid ? 0 : (chat.unread || 0) + 1,
            },
          }
        })
      }
      else if (data.type === 'typing') {
        setAgentTyping(prev => ({ ...prev, [data.session_id]: data.is_typing }))
      }
      else if (data.type === 'chat_closed') {
        const sid = data.session_id
        setActiveChats(prev => {
          const next = { ...prev }
          delete next[sid]
          return next
        })
        if (selectedSession === sid) setSelectedSession(null)
      }
      else if (data.type === 'user_left') {
        const sid = data.session_id
        // Add a system notice then auto-close after a short delay
        setActiveChats(prev => {
          const chat = prev[sid]
          if (!chat) return prev
          return {
            ...prev,
            [sid]: {
              ...chat,
              history: [...chat.history, { role: 'system', content: 'The user has left the chat.', created_at: new Date().toISOString() }],
              closed: true,
            },
          }
        })
        setTimeout(() => {
          setActiveChats(prev => {
            const next = { ...prev }
            delete next[sid]
            return next
          })
          setSelectedSession(cur => cur === sid ? null : cur)
        }, 4000)
      }
    }
  }

  function acceptChat(sessionId) {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return
    wsRef.current.send(JSON.stringify({ type: 'acceptChat', session_id: sessionId }))
  }

  function sendMessage() {
    const text = inputValue.trim()
    if (!text || !selectedSession) return
    setInputValue('')

    // Optimistically add to own view
    setActiveChats(prev => {
      const chat = prev[selectedSession] || { session: {}, history: [], unread: 0 }
      return {
        ...prev,
        [selectedSession]: {
          ...chat,
          history: [...chat.history, { role: 'agent', content: text, created_at: new Date().toISOString() }],
        },
      }
    })

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'sendMessage', text, session_id: selectedSession }))
    }
  }

  function endChat(sessionId) {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return
    wsRef.current.send(JSON.stringify({ type: 'endChat', session_id: sessionId }))
  }

  function selectSession(sid) {
    setSelectedSession(sid)
    setShowCanned(false)
    // Clear unread
    setActiveChats(prev => prev[sid] ? { ...prev, [sid]: { ...prev[sid], unread: 0 } } : prev)
  }

  function insertCanned(template) {
    const name  = collectedData.name  || 'there'
    const agent = agentName           || 'your agent'
    const text  = template.replace(/{name}/g, name).replace(/{agent}/g, agent)
    setInputValue(text)
    setShowCanned(false)
  }

  // ---------------------------------------------------------------------------
  // Registration screen
  // ---------------------------------------------------------------------------
  if (!registered) {
    return (
      <div style={{ minHeight: '100vh', background: '#f0f4f8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ background: '#fff', borderRadius: 16, padding: 48, boxShadow: '0 8px 32px rgba(0,0,0,0.1)', width: 380 }}>
          <div style={{ fontSize: 28, textAlign: 'center', marginBottom: 8 }}>👤</div>
          <h2 style={{ textAlign: 'center', color: NAVY, margin: '0 0 8px', fontFamily: 'Georgia,serif' }}>Agent Login</h2>
          <p style={{ textAlign: 'center', color: '#64748b', fontSize: 14, marginBottom: 28 }}>Enter your name to go online</p>
          <input
            value={nameInput}
            onChange={e => setNameInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && registerAndConnect(nameInput)}
            placeholder="Your full name"
            style={{ width: '100%', padding: '12px 16px', borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 15, outline: 'none', boxSizing: 'border-box', marginBottom: 16 }}
            autoFocus
          />
          <button
            onClick={() => registerAndConnect(nameInput)}
            style={{ width: '100%', padding: '13px', borderRadius: 10, background: `linear-gradient(135deg,${GOLD},${GOLD_LT})`, border: 'none', color: NAVY, fontWeight: 700, fontSize: 15, cursor: 'pointer' }}
          >
            Go Online
          </button>
        </div>
      </div>
    )
  }

  const activeSessionIds  = Object.keys(activeChats)
  const currentChat       = selectedSession ? activeChats[selectedSession] : null
  const currentSession    = currentChat?.session || {}
  const currentHistory    = currentChat?.history || []
  const collectedData     = currentSession?.collected_data || {}
  const userIsTyping      = selectedSession ? agentTyping[selectedSession] : false

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 52px)', background: '#f0f4f8', overflow: 'hidden' }}>

      {/* ── LEFT: Queue + active chats ── */}
      <div style={{ width: 280, background: '#fff', borderRight: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>

        {/* Agent status bar */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <div style={{ width: 38, height: 38, borderRadius: '50%', background: `linear-gradient(135deg,${GOLD},${GOLD_LT})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 700, color: NAVY }}>
              {(agentName || 'A')[0].toUpperCase()}
            </div>
            <div style={{ position: 'absolute', bottom: 1, right: 1, width: 10, height: 10, borderRadius: '50%', background: connected ? GREEN : '#ef4444', border: '2px solid #fff' }} />
          </div>
          <div>
            <div style={{ fontWeight: 600, fontSize: 14, color: NAVY }}>{agentName}</div>
            <div style={{ fontSize: 12, color: connected ? GREEN : '#ef4444' }}>{connected ? 'Online' : 'Connecting...'}</div>
          </div>
        </div>

        {/* Waiting queue */}
        <div style={{ padding: '12px 16px 6px', fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Waiting ({queue.length})
        </div>
        {queue.length === 0 && (
          <div style={{ padding: '8px 20px', fontSize: 13, color: '#94a3b8', fontStyle: 'italic' }}>No one waiting</div>
        )}
        {queue.map(item => (
          <div key={item.session_id} style={{ padding: '12px 16px', borderBottom: '1px solid #f1f5f9', cursor: 'pointer', background: '#fffbf0' }}
            onClick={() => acceptChat(item.session_id)}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontWeight: 600, fontSize: 14, color: NAVY }}>{item.user_name || 'Visitor'}</div>
              <span style={{ fontSize: 11, padding: '2px 8px', background: '#fef9e7', border: '1px solid #f59e0b', borderRadius: 20, color: AMBER, fontWeight: 600 }}>Accept</span>
            </div>
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{item.user_type === 'advisor' ? '💼 Financial Advisor' : '🧾 CPA'}</div>
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>Waiting since {new Date(item.queued_at).toLocaleTimeString()}</div>
          </div>
        ))}

        {/* Active chats */}
        {activeSessionIds.length > 0 && (
          <>
            <div style={{ padding: '12px 16px 6px', fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 8 }}>
              Active ({activeSessionIds.length})
            </div>
            {activeSessionIds.map(sid => {
              const chat = activeChats[sid]
              const data = chat?.session?.collected_data || {}
              const isSelected = selectedSession === sid
              return (
                <div key={sid}
                  onClick={() => selectSession(sid)}
                  style={{ padding: '12px 16px', borderBottom: '1px solid #f1f5f9', cursor: 'pointer', background: isSelected ? '#eff6ff' : '#fff', borderLeft: isSelected ? `3px solid #3b82f6` : '3px solid transparent' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontWeight: 600, fontSize: 14, color: NAVY }}>{data.name || 'Visitor'}</div>
                    {chat.unread > 0 && (
                      <span style={{ width: 20, height: 20, borderRadius: '50%', background: '#ef4444', color: '#fff', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{chat.unread}</span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                    {chat?.session?.user_type === 'advisor' ? '💼 Financial Advisor' : '🧾 CPA'}
                  </div>
                </div>
              )
            })}
          </>
        )}
      </div>

      {/* ── CENTER: Chat window ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {!selectedSession ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontSize: 48 }}>💬</div>
            <div style={{ fontSize: 16, fontWeight: 500 }}>Select a chat or accept a waiting user</div>
          </div>
        ) : (
          <>
            {/* Chat header */}
            <div style={{ padding: '14px 24px', background: '#fff', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 38, height: 38, borderRadius: '50%', background: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 700, color: '#475569', flexShrink: 0 }}>
                  {(collectedData.name || 'V')[0].toUpperCase()}
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 16, color: NAVY }}>{collectedData.name || 'Visitor'}</div>
                  <div style={{ fontSize: 13, color: '#64748b' }}>{collectedData.email || ''}</div>
                </div>
              </div>
              <button
                onClick={() => endChat(selectedSession)}
                style={{ padding: '8px 18px', borderRadius: 8, background: '#fef2f2', border: '1px solid #fca5a5', color: '#dc2626', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
              >
                End Chat
              </button>
            </div>

            {/* Messages */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 12, background: '#f8fafc' }}>
              {currentHistory.map((msg, i) => {
                const isAgent  = msg.role === 'agent'
                const isBot    = msg.role === 'bot'
                const isSystem = msg.role === 'system'
                if (isSystem) return (
                  <div key={i} style={{ textAlign: 'center', fontSize: 12, color: '#94a3b8', padding: '6px 16px', background: '#f1f5f9', borderRadius: 20, alignSelf: 'center', fontStyle: 'italic' }}>
                    {msg.content}
                  </div>
                )
                return (
                  <div key={i} style={{ display: 'flex', flexDirection: isAgent ? 'row-reverse' : 'row', gap: 10, maxWidth: '80%', alignSelf: isAgent ? 'flex-end' : 'flex-start' }}>
                    <div style={{ width: 30, height: 30, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, marginTop: 2,
                      background: isAgent ? `linear-gradient(135deg,${GOLD},${GOLD_LT})` : isBot ? NAVY_MID : '#e2e8f0',
                      color: isAgent ? NAVY : isBot ? GOLD : '#475569',
                    }}>
                      {isAgent ? agentName[0]?.toUpperCase() || 'A' : isBot ? '🤖' : (collectedData.name?.[0] || 'U')}
                    </div>
                    <div style={{
                      padding: '10px 14px', borderRadius: isAgent ? '14px 4px 14px 14px' : '4px 14px 14px 14px',
                      fontSize: 14, lineHeight: 1.55, color: '#1e293b',
                      background: isAgent ? `linear-gradient(135deg,${GOLD}22,${GOLD_LT}11)` : isBot ? '#e8edf5' : '#fff',
                      border: isAgent ? `1px solid ${GOLD}44` : '1px solid #e2e8f0',
                      boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
                    }}>
                      {isBot && <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600, marginBottom: 4, textTransform: 'uppercase' }}>Bot</div>}
                      {msg.content}
                    </div>
                  </div>
                )
              })}

              {userIsTyping && (
                <div style={{ display: 'flex', gap: 10, alignSelf: 'flex-start' }}>
                  <div style={{ width: 30, height: 30, borderRadius: '50%', background: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12 }}>
                    {collectedData.name?.[0] || 'U'}
                  </div>
                  <div style={{ padding: '10px 14px', borderRadius: '4px 14px 14px 14px', background: '#fff', border: '1px solid #e2e8f0', display: 'flex', gap: 4, alignItems: 'center' }}>
                    {[0, 150, 300].map(d => (
                      <span key={d} style={{ width: 7, height: 7, borderRadius: '50%', background: '#94a3b8', display: 'inline-block',
                        animation: 'agent-dot 1.2s ease-in-out infinite', animationDelay: `${d}ms` }} />
                    ))}
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            {/* Canned replies picker */}
            {showCanned && (
              <div style={{ background: '#fff', borderTop: '1px solid #e2e8f0', padding: '10px 24px', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {CANNED_TEMPLATES.map((t, i) => {
                  const preview = t.replace(/{name}/g, collectedData.name || 'there').replace(/{agent}/g, agentName || 'your agent')
                  return (
                    <button key={i} onClick={() => insertCanned(t)}
                      style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#f8fafc', fontSize: 13, color: '#1e293b', cursor: 'pointer', textAlign: 'left', maxWidth: 380 }}>
                      {preview}
                    </button>
                  )
                })}
              </div>
            )}

            {/* Input */}
            <div style={{ padding: '14px 24px', background: '#fff', borderTop: '1px solid #e2e8f0', display: 'flex', gap: 10, alignItems: 'flex-end' }}>
              <button
                onClick={() => setShowCanned(v => !v)}
                title="Quick replies"
                style={{ width: 38, height: 42, borderRadius: 10, border: '1px solid #e2e8f0', background: showCanned ? '#eff6ff' : '#f8fafc', color: showCanned ? '#3b82f6' : '#64748b', fontSize: 18, cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                ⚡
              </button>
              <textarea
                value={inputValue}
                onChange={e => { setInputValue(e.target.value); e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px' }}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
                placeholder={`Reply to ${collectedData.name || 'visitor'}...`}
                rows={1}
                style={{ flex: 1, padding: '10px 14px', borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 14, resize: 'none', outline: 'none', fontFamily: 'inherit', minHeight: 42, maxHeight: 120, lineHeight: 1.5 }}
              />
              <button
                onClick={sendMessage}
                disabled={!inputValue.trim()}
                style={{ padding: '0 20px', borderRadius: 10, background: `linear-gradient(135deg,${GOLD},${GOLD_LT})`, border: 'none', color: NAVY, fontWeight: 700, fontSize: 14, cursor: 'pointer', flexShrink: 0, height: 42 }}
              >
                Send
              </button>
            </div>
          </>
        )}
      </div>

      {/* ── RIGHT: User info ── */}
      <div style={{ width: 260, background: '#fff', borderLeft: '1px solid #e2e8f0', padding: 24, flexShrink: 0, overflowY: 'auto' }}>
        {!selectedSession ? (
          <div style={{ color: '#94a3b8', fontSize: 14, textAlign: 'center', marginTop: 40 }}>No chat selected</div>
        ) : (
          <>
            <div style={{ fontWeight: 700, fontSize: 15, color: NAVY, marginBottom: 20 }}>Visitor Info</div>
            <InfoRow label="Name"  value={collectedData.name || '—'} />
            <InfoRow label="Email" value={collectedData.email || '—'} />
            <InfoRow label="Type"  value={currentSession?.user_type === 'advisor' ? '💼 Financial Advisor' : '🧾 CPA'} />
            <InfoRow label="Started" value={currentSession?.created_at ? new Date(currentSession.created_at).toLocaleTimeString() : '—'} />

            {Object.entries(collectedData).filter(([k]) => !['name','email','__pending__','user_type','__session_id__'].includes(k)).length > 0 && (
              <>
                <div style={{ fontWeight: 700, fontSize: 13, color: '#64748b', marginTop: 24, marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Collected Data</div>
                {Object.entries(collectedData)
                  .filter(([k]) => !['name','email','__pending__','user_type','__session_id__'].includes(k))
                  .map(([k, v]) => <InfoRow key={k} label={k} value={String(v)} />)}
              </>
            )}
          </>
        )}
      </div>

      <style>{`
        @keyframes agent-dot {
          0%,60%,100% { opacity:0.3; transform:translateY(0); }
          30% { opacity:1; transform:translateY(-3px); }
        }
      `}</style>
    </div>
  )
}

function InfoRow({ label, value }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 14, color: '#1e293b', wordBreak: 'break-word' }}>{value}</div>
    </div>
  )
}
