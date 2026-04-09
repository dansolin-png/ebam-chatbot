import { useState, useEffect, useRef } from 'react'
import { startSession, sendMessage, getChatConfig } from '../api/chat.js'
import { renderMessageHtml } from '../utils/renderMessage.js'

/*
  Conversation flow:
  1. Show greeting + audience buttons (Financial Advisor / CPA)
  2. User selects audience → POST /chat/start → returns first flow state message + options
  3. Every message → POST /chat/message → state machine returns next message + options
  4. Flow ends when is_end = true (lead captured)
*/

export default function ChatWidget({ defaultOpen = false }) {
  const [open, setOpen]             = useState(defaultOpen)
  const [config, setConfig]         = useState(null)    // CHAT_CONFIG from backend
  const [sessionId, setSessionId]   = useState(null)
  const [audience, setAudience]     = useState(null)    // 'advisor' | 'cpa'
  const [messages, setMessages]     = useState([])      // { role, content }
  const [quickReplies, setQuickReplies] = useState(null)
  const [inputValue, setInputValue] = useState('')
  const [isTyping, setIsTyping]     = useState(false)
  const [started, setStarted]       = useState(false)
  const bottomRef = useRef(null)
  const inputRef  = useRef(null)

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isTyping])

  // Load config and show greeting when widget first opens
  useEffect(() => {
    if (open && !started) {
      setStarted(true)
      init()
    }
  }, [open])

  async function init() {
    try {
      const cfg = await getChatConfig()
      setConfig(cfg)
      // Show greeting with audience-select state
      setMessages([{ role: 'greeting', content: cfg.greeting }])
    } catch {
      setMessages([{ role: 'bot', content: "I'm having trouble connecting. Please refresh." }])
    }
  }


  async function handleSelectAudience(type) {
    setAudience(type)
    setIsTyping(true)
    try {
      const res = await startSession(type)
      setSessionId(res.session_id)
      setMessages(prev => [
        ...prev,
        { role: 'user', content: type === 'advisor' ? 'Financial Advisor' : 'CPA' },
        { role: 'bot',  content: res.message },
      ])
      if (res.options?.length) setQuickReplies(res.options)
    } catch {
      addBotMessage("Sorry, I couldn't connect. Please try again.")
    } finally {
      setIsTyping(false)
    }
  }

  function addBotMessage(content) {
    setMessages(prev => [...prev, { role: 'bot', content }])
  }

  async function handleQuickReply(text) {
    if (isTyping) return
    setQuickReplies(null)
    await submitMessage(text)
  }

  async function handleSend() {
    const text = inputValue.trim()
    if (!text || isTyping) return
    setInputValue('')
    await submitMessage(text)
  }

  async function submitMessage(text) {
    setMessages(prev => [...prev, { role: 'user', content: text }])
    setQuickReplies(null)
    setIsTyping(true)
    try {
      const res = await sendMessage(sessionId, text)
      addBotMessage(res.message)
      if (!res.is_end && res.options?.length) {
        setQuickReplies(res.options)
      }
    } catch {
      addBotMessage("I'm having a brief technical issue. Please try again in a moment.")
    } finally {
      setIsTyping(false)
    }
  }

  function handleRestart() {
    setMessages([])
    setQuickReplies(null)
    setAudience(null)
    setSessionId(null)
    setInputValue('')
    setIsTyping(false)
    setStarted(false)
    setConfig(null)
    setTimeout(() => {
      setStarted(true)
      init()
    }, 0)
  }

  return (
    <>
      {/* ── Chat Panel ── */}
      {open && (
        <div style={s.panel}>

          {/* Header */}
          <div style={s.header}>
            <div style={s.avatarIcon}>🎬</div>
            <div style={s.headerText}>
              <div style={s.headerTitle}>Avatar Marketing Assistant</div>
              <div style={s.headerSub}>Evidence Based Advisor Marketing</div>
            </div>
            <div style={s.statusDot}>Online</div>
          </div>

          {/* Disclaimer banner */}
          {config?.disclaimer && (
            <div style={s.disclaimer}>
              <span style={{ marginRight: 6, fontSize: 11 }}>ℹ</span>
              {config.disclaimer}
            </div>
          )}

          {/* Messages */}
          <div style={s.chatBody}>
            {messages.map((msg, i) => {
              if (msg.role === 'greeting') {
                return (
                  <GreetingMessage
                    key={i}
                    content={msg.content}
                    audienceSelected={!!audience}
                    onSelect={handleSelectAudience}
                  />
                )
              }
              return (
                <ChatMessage key={i} role={msg.role} content={msg.content} />
              )
            })}

            {/* Typing indicator */}
            {isTyping && (
              <div style={{ ...s.messageRow, alignSelf: 'flex-start' }}>
                <div style={s.avatarSmall}>🎬</div>
                <div style={s.typingIndicator}>
                  <span style={{ ...s.typingDot, animationDelay: '0ms' }} />
                  <span style={{ ...s.typingDot, animationDelay: '200ms' }} />
                  <span style={{ ...s.typingDot, animationDelay: '400ms' }} />
                </div>
              </div>
            )}

            {/* Quick replies */}
            {!isTyping && quickReplies && (
              <div style={s.quickReplies}>
                {quickReplies.map((qr, i) => (
                  <button
                    key={i}
                    style={s.qrBtn}
                    onClick={() => handleQuickReply(qr)}
                    onMouseEnter={e => {
                      e.target.style.background = 'rgba(201,168,76,0.1)'
                      e.target.style.borderColor = '#c9a84c'
                    }}
                    onMouseLeave={e => {
                      e.target.style.background = 'transparent'
                      e.target.style.borderColor = 'rgba(201,168,76,0.35)'
                    }}
                  >
                    {qr}
                  </button>
                ))}
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Footer input */}
          <div style={s.chatFooter}>
            <textarea
              ref={inputRef}
              style={s.inputArea}
              value={inputValue}
              placeholder="Type your question here..."
              rows={1}
              disabled={!audience || isTyping}
              onChange={e => {
                setInputValue(e.target.value)
                e.target.style.height = 'auto'
                e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'
              }}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleSend()
                }
              }}
            />
            <button
              style={s.sendBtn}
              onClick={handleSend}
              disabled={!audience || isTyping || !inputValue.trim()}
              title="Send"
            >
              <svg viewBox="0 0 24 24" style={{ width: 18, height: 18, fill: '#0d1b2a' }}>
                <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
              </svg>
            </button>
          </div>

          <div style={s.branding}>
            Powered by <span style={{ color: 'rgba(201,168,76,0.45)' }}>Evidence Based Advisor Marketing</span>
          </div>
        </div>
      )}

      {/* ── FAB toggle button ── */}
      <button
        style={{ ...s.fab, ...(open ? s.fabOpen : {}) }}
        onClick={() => setOpen(v => !v)}
        title={open ? 'Close' : 'Chat with Alex'}
      >
        {open ? (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        ) : (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        )}
      </button>

      <style>{`
        @keyframes ebam-typing {
          0%,60%,100% { opacity:0.3; transform:translateY(0); }
          30% { opacity:1; transform:translateY(-4px); }
        }
        @keyframes ebam-fadein {
          from { opacity:0; transform:translateY(8px); }
          to   { opacity:1; transform:translateY(0); }
        }
        @keyframes ebam-pulse {
          0%,100% { opacity:1; transform:scale(1); }
          50%      { opacity:0.4; transform:scale(1.08); }
        }
      `}</style>
    </>
  )
}

// ---------------------------------------------------------------------------
// Greeting message with audience selection buttons
// ---------------------------------------------------------------------------
function GreetingMessage({ content, audienceSelected, onSelect }) {
  return (
    <div style={{ ...s.messageRow, alignSelf: 'flex-start', animation: 'ebam-fadein 0.3s ease both' }}>
      <div style={s.avatarSmall}>🎬</div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div
          style={s.bubbleAI}
          dangerouslySetInnerHTML={{ __html: renderMessageHtml(content) }}
        />
        {!audienceSelected && (
          <div style={s.audienceBtns}>
            <button
              style={s.audBtn}
              onClick={() => onSelect('advisor')}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(201,168,76,0.15)'; e.currentTarget.style.borderColor = '#c9a84c' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(201,168,76,0.06)'; e.currentTarget.style.borderColor = 'rgba(201,168,76,0.4)' }}
            >
              <span style={{ display: 'block', fontSize: '1.4rem', marginBottom: 4 }}>💼</span>
              Financial Advisor
            </button>
            <button
              style={s.audBtn}
              onClick={() => onSelect('cpa')}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(201,168,76,0.15)'; e.currentTarget.style.borderColor = '#c9a84c' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(201,168,76,0.06)'; e.currentTarget.style.borderColor = 'rgba(201,168,76,0.4)' }}
            >
              <span style={{ display: 'block', fontSize: '1.4rem', marginBottom: 4 }}>🧾</span>
              CPA
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Individual chat message
// ---------------------------------------------------------------------------
function ChatMessage({ role, content }) {
  const isUser = role === 'user'
  return (
    <div style={{
      ...s.messageRow,
      alignSelf: isUser ? 'flex-end' : 'flex-start',
      flexDirection: isUser ? 'row-reverse' : 'row',
      animation: 'ebam-fadein 0.3s ease both',
    }}>
      <div style={{ ...s.avatarSmall, ...(isUser ? s.avatarUser : {}) }}>
        {isUser ? 'YOU' : '🎬'}
      </div>
      <div
        style={isUser ? s.bubbleUser : s.bubbleAI}
        dangerouslySetInnerHTML={{ __html: renderMessageHtml(content) }}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Styles — mirroring the prototype's CSS variables
// ---------------------------------------------------------------------------
const NAVY      = '#0d1b2a'
const NAVY_MID  = '#162032'
const NAVY_LT   = '#1e2d40'
const GOLD      = '#c9a84c'
const GOLD_LT   = '#e0c070'
const WHITE     = '#f8f6f1'
const GRAY      = '#8a9bb0'
const BUBBLE_AI = '#1a2840'
const BUBBLE_US = '#1a3a5c'

const s = {
  panel: {
    position: 'fixed',
    bottom: '88px',
    right: '24px',
    width: '420px',
    maxHeight: '640px',
    display: 'flex',
    flexDirection: 'column',
    borderRadius: '20px',
    overflow: 'hidden',
    boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
    zIndex: 9999,
    fontFamily: "'DM Sans', -apple-system, sans-serif",
  },
  header: {
    background: `linear-gradient(135deg, ${NAVY_MID} 0%, ${NAVY_LT} 100%)`,
    border: `1px solid rgba(201,168,76,0.25)`,
    borderBottom: 'none',
    padding: '22px 28px',
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  },
  avatarIcon: {
    width: 50,
    height: 50,
    background: `linear-gradient(135deg, ${GOLD}, ${GOLD_LT})`,
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '20px',
    flexShrink: 0,
    boxShadow: '0 4px 16px rgba(201,168,76,0.3)',
    animation: 'ebam-pulse 2.5s ease-in-out infinite',
  },
  headerText: {
    flex: 1,
  },
  headerTitle: {
    fontFamily: "'Playfair Display', Georgia, serif",
    fontSize: '1.1rem',
    color: WHITE,
    fontWeight: 600,
  },
  headerSub: {
    fontSize: '0.72rem',
    color: GOLD,
    marginTop: 2,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
  },
  statusDot: {
    marginLeft: 'auto',
    display: 'flex',
    alignItems: 'center',
    gap: 7,
    fontSize: '0.72rem',
    color: '#5dba8a',
    fontWeight: 500,
  },
  chatBody: {
    background: NAVY_MID,
    borderLeft: '1px solid rgba(201,168,76,0.2)',
    borderRight: '1px solid rgba(201,168,76,0.2)',
    flex: 1,
    overflowY: 'auto',
    padding: '26px 26px 12px',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    minHeight: 0,
    maxHeight: '430px',
  },
  messageRow: {
    display: 'flex',
    gap: 10,
    maxWidth: '88%',
  },
  avatarSmall: {
    width: 32,
    height: 32,
    borderRadius: '50%',
    background: `linear-gradient(135deg, ${GOLD}, ${GOLD_LT})`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 13,
    flexShrink: 0,
    marginTop: 3,
    boxShadow: '0 2px 8px rgba(201,168,76,0.25)',
  },
  avatarUser: {
    background: BUBBLE_US,
    border: '1px solid rgba(201,168,76,0.2)',
    color: GOLD,
    fontSize: '10px',
    fontWeight: 700,
    boxShadow: 'none',
  },
  bubbleAI: {
    background: BUBBLE_AI,
    border: '1px solid rgba(201,168,76,0.12)',
    borderTopLeftRadius: 4,
    borderTopRightRadius: 15,
    borderBottomLeftRadius: 15,
    borderBottomRightRadius: 15,
    padding: '13px 17px',
    fontSize: '0.91rem',
    lineHeight: 1.65,
    color: 'rgba(248,246,241,0.92)',
    fontWeight: 300,
    boxShadow: '0 4px 14px rgba(0,0,0,0.2)',
  },
  bubbleUser: {
    background: BUBBLE_US,
    border: '1px solid rgba(201,168,76,0.2)',
    borderTopLeftRadius: 15,
    borderTopRightRadius: 4,
    borderBottomLeftRadius: 15,
    borderBottomRightRadius: 15,
    padding: '13px 17px',
    fontSize: '0.91rem',
    lineHeight: 1.65,
    color: 'rgba(248,246,241,0.92)',
    fontWeight: 300,
  },
  audienceBtns: {
    display: 'flex',
    gap: 12,
    marginTop: 12,
  },
  audBtn: {
    flex: 1,
    padding: '13px 18px',
    borderRadius: 12,
    border: '1px solid rgba(201,168,76,0.4)',
    background: 'rgba(201,168,76,0.06)',
    color: WHITE,
    fontFamily: "'DM Sans', sans-serif",
    fontSize: '0.9rem',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.2s',
    textAlign: 'center',
  },
  typingIndicator: {
    display: 'flex',
    alignItems: 'center',
    gap: 5,
    padding: '12px 16px',
    background: BUBBLE_AI,
    border: '1px solid rgba(201,168,76,0.12)',
    borderRadius: 15,
    borderTopLeftRadius: 4,
  },
  typingDot: {
    width: 7,
    height: 7,
    background: GOLD,
    borderRadius: '50%',
    opacity: 0.4,
    display: 'inline-block',
    animation: 'ebam-typing 1.2s ease-in-out infinite',
  },
  quickReplies: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  qrBtn: {
    background: 'transparent',
    border: '1px solid rgba(201,168,76,0.35)',
    color: GOLD_LT,
    padding: '7px 14px',
    borderRadius: 20,
    fontSize: '0.79rem',
    fontFamily: "'DM Sans', sans-serif",
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  chatFooter: {
    background: NAVY_LT,
    border: '1px solid rgba(201,168,76,0.2)',
    borderTop: '1px solid rgba(201,168,76,0.1)',
    padding: '14px 18px',
    display: 'flex',
    gap: 10,
    alignItems: 'flex-end',
  },
  inputArea: {
    flex: 1,
    background: NAVY_MID,
    border: '1px solid rgba(201,168,76,0.2)',
    borderRadius: 12,
    padding: '11px 15px',
    color: WHITE,
    fontFamily: "'DM Sans', sans-serif",
    fontSize: '0.88rem',
    fontWeight: 300,
    resize: 'none',
    minHeight: 44,
    maxHeight: 120,
    lineHeight: 1.5,
    outline: 'none',
  },
  sendBtn: {
    width: 44,
    height: 44,
    background: `linear-gradient(135deg, ${GOLD}, ${GOLD_LT})`,
    border: 'none',
    borderRadius: 11,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    boxShadow: '0 4px 12px rgba(201,168,76,0.25)',
    transition: 'all 0.2s',
  },
  disclaimer: {
    background: 'rgba(13,27,42,0.85)',
    borderLeft: '1px solid rgba(201,168,76,0.2)',
    borderRight: '1px solid rgba(201,168,76,0.2)',
    borderBottom: '1px solid rgba(201,168,76,0.12)',
    padding: '8px 18px',
    fontSize: '0.68rem',
    color: 'rgba(138,155,176,0.7)',
    lineHeight: 1.5,
    display: 'flex',
    alignItems: 'flex-start',
  },
  branding: {
    padding: '8px 18px',
    fontSize: '0.7rem',
    color: 'rgba(138,155,176,0.45)',
    letterSpacing: '0.04em',
    textAlign: 'center',
    background: NAVY_LT,
    borderLeft: '1px solid rgba(201,168,76,0.2)',
    borderRight: '1px solid rgba(201,168,76,0.2)',
    borderBottom: '1px solid rgba(201,168,76,0.2)',
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },
  fab: {
    position: 'fixed',
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: '50%',
    background: NAVY,
    color: WHITE,
    border: `2px solid ${GOLD}`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    boxShadow: '0 6px 24px rgba(13,27,42,0.45)',
    zIndex: 9999,
    transition: 'transform 0.2s ease, box-shadow 0.2s ease',
  },
  fabOpen: {
    background: NAVY_MID,
  },
}
