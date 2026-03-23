import { useState, useEffect, useRef } from 'react'
import { startSession, sendLLMMessage, getChatConfig } from './api.js'

const NAVY     = '#0d1b2a'
const NAVY_MID = '#162032'
const NAVY_LT  = '#1e2d40'
const GOLD     = '#c9a84c'
const GOLD_LT  = '#e0c070'
const WHITE    = '#f8f6f1'
const BUBBLE_AI = '#1a2840'
const BUBBLE_US = '#1a3a5c'

export default function ChatWidget() {
  const [open, setOpen]           = useState(false)
  const [config, setConfig]       = useState(null)
  const [sessionId, setSessionId] = useState(null)
  const [audience, setAudience]   = useState(null)
  const [messages, setMessages]   = useState([])
  const [quickReplies, setQuickReplies] = useState(null)
  const [inputValue, setInputValue] = useState('')
  const [isTyping, setIsTyping]   = useState(false)
  const [started, setStarted]     = useState(false)
  const bottomRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isTyping])

  useEffect(() => {
    if (open && !started) {
      setStarted(true)
      getChatConfig().then(cfg => {
        setConfig(cfg)
        setMessages([{ role: 'greeting', content: cfg.greeting }])
      }).catch(() => {
        setMessages([{ role: 'bot', content: "I'm having trouble connecting. Please refresh." }])
      })
    }
  }, [open])

  async function handleSelectAudience(type) {
    if (!config) return
    setAudience(type)
    try {
      const res = await startSession(type)
      setSessionId(res.session_id)
    } catch {
      addBot("Sorry, I couldn't connect. Please try again.")
      return
    }
    setMessages(prev => [
      ...prev,
      { role: 'user', content: type === 'advisor' ? 'Financial Advisor' : 'CPA' },
      { role: 'bot',  content: config[type].welcome },
    ])
    setQuickReplies(config[type].quickReplies)
  }

  function addBot(content) {
    setMessages(prev => [...prev, { role: 'bot', content }])
  }

  async function submit(text) {
    if (!text || isTyping) return
    setMessages(prev => [...prev, { role: 'user', content: text }])
    setQuickReplies(null)
    setIsTyping(true)
    try {
      const res = await sendLLMMessage(sessionId, text, audience)
      addBot(res.message)
    } catch {
      addBot("I'm having a brief technical issue. Please try again in a moment.")
    } finally {
      setIsTyping(false)
    }
  }

  function handleRestart() {
    setMessages([]); setQuickReplies(null); setAudience(null)
    setSessionId(null); setInputValue(''); setIsTyping(false)
    setStarted(false); setConfig(null)
    setTimeout(() => {
      setStarted(true)
      getChatConfig().then(cfg => {
        setConfig(cfg)
        setMessages([{ role: 'greeting', content: cfg.greeting }])
      })
    }, 0)
  }

  return (
    <div>
      {open && (
        <div style={s.panel}>
          {/* Header */}
          <div style={s.header}>
            <div style={s.avatarIcon}>🎬</div>
            <div style={{ flex: 1 }}>
              <div style={s.headerTitle}>Avatar Marketing Assistant</div>
              <div style={s.headerSub}>Evidence Based Advisor Marketing</div>
            </div>
            <div style={s.statusDot}>Online</div>
          </div>

          {/* Messages */}
          <div style={s.body}>
            {messages.map((msg, i) =>
              msg.role === 'greeting'
                ? <GreetingMsg key={i} content={msg.content} selected={!!audience} onSelect={handleSelectAudience} />
                : <Msg key={i} role={msg.role} content={msg.content} />
            )}
            {isTyping && (
              <div style={{ ...s.row, alignSelf: 'flex-start' }}>
                <div style={s.avAI}>🎬</div>
                <div style={s.typing}>
                  <span style={{ ...s.dot, animationDelay: '0ms' }} />
                  <span style={{ ...s.dot, animationDelay: '200ms' }} />
                  <span style={{ ...s.dot, animationDelay: '400ms' }} />
                </div>
              </div>
            )}
            {!isTyping && quickReplies && (
              <div style={s.qrs}>
                {quickReplies.map((qr, i) => (
                  <button key={i} style={s.qrBtn} onClick={() => submit(qr)}>{qr}</button>
                ))}
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Footer */}
          <div style={s.footer}>
            <textarea
              style={s.input}
              value={inputValue}
              placeholder="Type your question here..."
              rows={1}
              disabled={!audience || isTyping}
              onInput={e => {
                setInputValue(e.target.value)
                e.target.style.height = 'auto'
                e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'
              }}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(inputValue.trim()); setInputValue('') } }}
            />
            <button style={s.sendBtn} disabled={!audience || isTyping || !inputValue.trim()}
              onClick={() => { submit(inputValue.trim()); setInputValue('') }}>
              <svg viewBox="0 0 24 24" style={{ width: 18, height: 18, fill: NAVY }}>
                <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
              </svg>
            </button>
          </div>
          <div style={s.branding}>Powered by <span style={{ color: 'rgba(201,168,76,0.55)' }}>Evidence Based Advisor Marketing</span></div>
        </div>
      )}

      {/* FAB */}
      <button style={{ ...s.fab, ...(open ? { background: NAVY_MID } : {}) }} onClick={() => setOpen(v => !v)}>
        {open
          ? <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          : <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        }
      </button>

      <style>{`
        @keyframes ebam-t{0%,60%,100%{opacity:.3;transform:translateY(0)}30%{opacity:1;transform:translateY(-4px)}}
        @keyframes ebam-f{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        .ebam-qr:hover{background:rgba(201,168,76,0.12)!important;border-color:#c9a84c!important}
      `}</style>
    </div>
  )
}

function GreetingMsg({ content, selected, onSelect }) {
  return (
    <div style={{ ...s.row, alignSelf: 'flex-start', animation: 'ebam-f .3s ease both' }}>
      <div style={s.avAI}>🎬</div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={s.bubAI}><Fmt text={content} /></div>
        {!selected && (
          <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
            {[['advisor','💼','Financial Advisor'],['cpa','🧾','CPA']].map(([type, icon, label]) => (
              <button key={type} style={s.audBtn} onClick={() => onSelect(type)}>
                <span style={{ display: 'block', fontSize: '1.3rem', marginBottom: 3 }}>{icon}</span>
                {label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function Msg({ role, content }) {
  const user = role === 'user'
  return (
    <div style={{ ...s.row, alignSelf: user ? 'flex-end' : 'flex-start', flexDirection: user ? 'row-reverse' : 'row', animation: 'ebam-f .3s ease both' }}>
      <div style={{ ...s.avAI, ...(user ? s.avUser : {}) }}>{user ? 'YOU' : '🎬'}</div>
      <div style={user ? s.bubUser : s.bubAI}><Fmt text={content} /></div>
    </div>
  )
}

function Fmt({ text }) {
  return text.split(/\n\n+/).map((para, pi) => (
    <p key={pi} style={{ margin: pi > 0 ? '8px 0 0' : 0 }}>
      {para.split(/\*\*(.*?)\*\*/g).map((part, i) =>
        i % 2 === 1
          ? <strong key={i} style={{ color: GOLD_LT, fontWeight: 500 }}>{part}</strong>
          : part.split('\n').map((line, li, arr) => <span key={li}>{line}{li < arr.length - 1 && <br />}</span>)
      )}
    </p>
  ))
}

const s = {
  panel:      { position:'fixed', bottom:88, right:24, width:400, maxHeight:600, display:'flex', flexDirection:'column', borderRadius:20, overflow:'hidden', boxShadow:'0 24px 64px rgba(0,0,0,0.5)', zIndex:2147483647, fontFamily:"'DM Sans',-apple-system,sans-serif" },
  header:     { background:`linear-gradient(135deg,${NAVY_MID},${NAVY_LT})`, border:`1px solid rgba(201,168,76,0.25)`, borderBottom:'none', padding:'20px 24px', display:'flex', alignItems:'center', gap:14 },
  avatarIcon: { width:46, height:46, background:`linear-gradient(135deg,${GOLD},${GOLD_LT})`, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, flexShrink:0, boxShadow:'0 4px 16px rgba(201,168,76,0.3)' },
  headerTitle:{ fontFamily:"'Playfair Display',Georgia,serif", fontSize:'1.05rem', color:WHITE, fontWeight:600 },
  headerSub:  { fontSize:'0.7rem', color:GOLD, marginTop:2, letterSpacing:'0.06em', textTransform:'uppercase' },
  statusDot:  { fontSize:'0.7rem', color:'#5dba8a', fontWeight:500, display:'flex', alignItems:'center', gap:5 },
  body:       { background:NAVY_MID, borderLeft:'1px solid rgba(201,168,76,0.2)', borderRight:'1px solid rgba(201,168,76,0.2)', flex:1, overflowY:'auto', padding:'22px 22px 10px', display:'flex', flexDirection:'column', gap:14, maxHeight:400 },
  row:        { display:'flex', gap:9, maxWidth:'88%' },
  avAI:       { width:30, height:30, borderRadius:'50%', background:`linear-gradient(135deg,${GOLD},${GOLD_LT})`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, flexShrink:0, marginTop:3 },
  avUser:     { background:BUBBLE_US, border:'1px solid rgba(201,168,76,0.2)', color:GOLD, fontSize:'9px', fontWeight:700 },
  bubAI:      { background:BUBBLE_AI, border:'1px solid rgba(201,168,76,0.12)', borderRadius:'4px 14px 14px 14px', padding:'11px 15px', fontSize:'0.88rem', lineHeight:1.65, color:'rgba(248,246,241,0.92)', fontWeight:300 },
  bubUser:    { background:BUBBLE_US, border:'1px solid rgba(201,168,76,0.2)', borderRadius:'14px 4px 14px 14px', padding:'11px 15px', fontSize:'0.88rem', lineHeight:1.65, color:'rgba(248,246,241,0.92)', fontWeight:300 },
  audBtn:     { flex:1, padding:'11px 14px', borderRadius:10, border:'1px solid rgba(201,168,76,0.4)', background:'rgba(201,168,76,0.06)', color:WHITE, fontSize:'0.87rem', fontWeight:500, cursor:'pointer', textAlign:'center', transition:'all .2s' },
  typing:     { display:'flex', alignItems:'center', gap:5, padding:'11px 15px', background:BUBBLE_AI, border:'1px solid rgba(201,168,76,0.12)', borderRadius:'4px 14px 14px 14px' },
  dot:        { width:7, height:7, background:GOLD, borderRadius:'50%', opacity:.4, display:'inline-block', animation:'ebam-t 1.2s ease-in-out infinite' },
  qrs:        { display:'flex', flexWrap:'wrap', gap:7, marginTop:2 },
  qrBtn:      { background:'transparent', border:'1px solid rgba(201,168,76,0.35)', color:GOLD_LT, padding:'6px 12px', borderRadius:20, fontSize:'0.77rem', cursor:'pointer', transition:'all .2s' },
  footer:     { background:NAVY_LT, border:'1px solid rgba(201,168,76,0.2)', borderTop:'1px solid rgba(201,168,76,0.1)', padding:'12px 16px', display:'flex', gap:9, alignItems:'flex-end' },
  input:      { flex:1, background:NAVY_MID, border:'1px solid rgba(201,168,76,0.2)', borderRadius:10, padding:'10px 13px', color:WHITE, fontFamily:"'DM Sans',sans-serif", fontSize:'0.86rem', fontWeight:300, resize:'none', minHeight:42, maxHeight:120, lineHeight:1.5, outline:'none' },
  sendBtn:    { width:42, height:42, background:`linear-gradient(135deg,${GOLD},${GOLD_LT})`, border:'none', borderRadius:10, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, boxShadow:'0 4px 12px rgba(201,168,76,0.25)' },
  branding:   { padding:'7px 16px', fontSize:'0.68rem', color:'rgba(138,155,176,0.45)', letterSpacing:'0.04em', textAlign:'center', background:NAVY_LT, borderLeft:'1px solid rgba(201,168,76,0.2)', borderRight:'1px solid rgba(201,168,76,0.2)', borderBottom:'1px solid rgba(201,168,76,0.2)', borderRadius:'0 0 20px 20px' },
  fab:        { position:'fixed', bottom:24, right:24, width:52, height:52, borderRadius:'50%', background:NAVY, color:WHITE, border:`2px solid ${GOLD}`, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', boxShadow:'0 6px 24px rgba(13,27,42,0.45)', zIndex:2147483647, transition:'all .2s' },
}
