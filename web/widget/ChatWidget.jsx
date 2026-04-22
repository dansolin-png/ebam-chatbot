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

function BotAvatar({ config, style, className }) {
  const imgUrl = config?.bot_icon_url
  const emoji  = config?.bot_icon || '🎬'
  if (imgUrl) {
    return (
      <div style={style} className={className}>
        <img src={imgUrl} alt="bot" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
      </div>
    )
  }
  return <div style={style} className={className}>{emoji}</div>
}

export default function ChatWidget() {
  const [open, setOpen]           = useState(!!(window.EBAMChat && window.EBAMChat.autoOpen))
  const [config, setConfig]       = useState(null)
  const [sessionId, setSessionId] = useState(null)
  const [sessionState, setSessionState] = useState(null)
  const [audience, setAudience]   = useState(null)
  const [messages, setMessages]   = useState([])
  const [quickReplies, setQuickReplies] = useState(null)
  const [inputValue, setInputValue] = useState('')
  const [isTyping, setIsTyping]   = useState(false)
  const [started, setStarted]     = useState(false)
  const [isListening, setIsListening] = useState(false)
  const bottomRef = useRef(null)
  const bodyRef   = useRef(null)
  const inputRef  = useRef(null)
  const recognitionRef = useRef(null)

  const voiceSupported = typeof window !== 'undefined' &&
    ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)

  function toggleVoice() {
    if (isListening) { recognitionRef.current?.stop(); return }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    const rec = new SR()
    rec.lang = 'en-US'; rec.interimResults = false; rec.maxAlternatives = 1
    rec.onstart = () => setIsListening(true)
    rec.onend   = () => setIsListening(false)
    rec.onerror = () => setIsListening(false)
    rec.onresult = e => {
      const t = e.results[0][0].transcript
      setInputValue(prev => (prev ? prev + ' ' : '') + t)
      inputRef.current?.focus()
    }
    recognitionRef.current = rec
    rec.start()
  }

  useEffect(() => {
    if (messages.length <= 1) {
      // Only greeting — scroll body to top so full message is visible
      bodyRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
    } else {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
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
      setSessionState(res.session_state || null)
      setMessages(prev => [
        ...prev,
        { role: 'user', content: type === 'advisor' ? 'Financial Advisor' : 'CPA' },
        { role: 'bot',  content: res.message, options: res.options },
      ])
      if (res.options) setQuickReplies(res.options)
    } catch {
      addBot("Sorry, I couldn't connect. Please try again.")
    }
  }

  function addBot(content, options) {
    setMessages(prev => [...prev, { role: 'bot', content, options }])
    if (options) setQuickReplies(options)
    else setQuickReplies(null)
  }

  async function submit(text) {
    if (!text || isTyping) return
    setMessages(prev => [...prev, { role: 'user', content: text }])
    setQuickReplies(null)
    setIsTyping(true)
    try {
      const res = await sendLLMMessage(sessionId, text, sessionState)
      if (res.session_state !== undefined) setSessionState(res.session_state)
      addBot(res.message, res.options)
      if (res.is_end) setQuickReplies(null)
    } catch {
      addBot("I'm having a brief technical issue. Please try again in a moment.")
    } finally {
      setIsTyping(false)
    }
  }

  function handleRestart() {
    setMessages([]); setQuickReplies(null); setAudience(null)
    setSessionId(null); setSessionState(null); setInputValue(''); setIsTyping(false)
    setStarted(false); setConfig(null)
    setTimeout(() => {
      setStarted(true)
      getChatConfig().then(cfg => {
        setConfig(cfg)
        setMessages([{ role: 'greeting', content: cfg.greeting }])
      })
    }, 0)
  }

  const botName     = config?.bot_name     || 'Avatar Marketing Assistant'
  const botSubtitle = config?.bot_subtitle || 'Evidence Based Advisor Marketing'
  const disclaimer  = config?.disclaimer   || ''

  return (
    <div>
      {open && (
        <div style={s.panel}>
          {/* Header */}
          <div style={s.header}>
            <div className="ebam-avatar-wrap">
              <BotAvatar config={config} style={s.avatarIcon} className="ebam-avatar-inner" />
            </div>
            <div style={{ flex: 1 }}>
              <div style={s.headerTitle}>{botName}</div>
              <div style={s.headerSub}>{botSubtitle}</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
              <div style={s.statusDot}>Online</div>
              <button onClick={handleRestart} style={s.restartBtn} title="Restart">↺</button>
            </div>
          </div>

          {/* Disclaimer */}
          {disclaimer && (
            <div style={s.disclaimer}>{disclaimer}</div>
          )}

          {/* Messages */}
          <div ref={bodyRef} style={s.body}>
            {messages.map((msg, i) =>
              msg.role === 'greeting'
                ? <GreetingMsg key={i} content={msg.content} selected={!!audience} onSelect={handleSelectAudience} config={config} />
                : <Msg key={i} role={msg.role} content={msg.content} config={config} />
            )}
            {isTyping && (
              <div style={{ ...s.row, alignSelf: 'flex-start' }}>
                <BotAvatar config={config} style={s.avAI} />
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
              ref={inputRef}
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
            {voiceSupported && (
              <button style={{ ...s.micBtn, ...(isListening ? s.micBtnActive : {}) }}
                onClick={toggleVoice} disabled={!audience || isTyping}
                title={isListening ? 'Stop' : 'Speak'}>
                {isListening
                  ? <svg viewBox="0 0 24 24" style={{ width: 16, height: 16, fill: GOLD }}><rect x="6" y="6" width="12" height="12" rx="2"/></svg>
                  : <svg viewBox="0 0 24 24" style={{ width: 16, height: 16, fill: 'rgba(138,155,176,0.8)' }}><path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.93V21h2v-3.07A7 7 0 0 0 19 11h-2z"/></svg>
                }
              </button>
            )}
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
        @keyframes ebam-pulse{0%,100%{box-shadow:0 0 0 0 rgba(201,168,76,0.55),0 4px 16px rgba(201,168,76,0.3)}50%{box-shadow:0 0 0 7px rgba(201,168,76,0),0 4px 16px rgba(201,168,76,0.3)}}
        @keyframes ebam-halo{0%,100%{opacity:0.55;transform:scale(1)}50%{opacity:0;transform:scale(1.55)}}
        .ebam-avatar-wrap{position:relative;flex-shrink:0}
        .ebam-avatar-wrap::before{content:'';position:absolute;inset:-4px;border-radius:50%;border:2px solid rgba(201,168,76,0.7);animation:ebam-halo 2.4s ease-in-out infinite;pointer-events:none}
        .ebam-avatar-wrap::after{content:'';position:absolute;inset:-8px;border-radius:50%;border:1.5px solid rgba(201,168,76,0.3);animation:ebam-halo 2.4s ease-in-out infinite 0.6s;pointer-events:none}
        .ebam-avatar-inner{animation:ebam-pulse 2.4s ease-in-out infinite}
        .ebam-qr:hover{background:rgba(201,168,76,0.12)!important;border-color:#c9a84c!important}
      `}</style>
    </div>
  )
}

function GreetingMsg({ content, selected, onSelect, config }) {
  return (
    <div style={{ ...s.row, alignSelf: 'flex-start', animation: 'ebam-f .3s ease both' }}>
      <BotAvatar config={config} style={s.avAI} />
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={s.bubAI}><Msg2Html text={content} /></div>
        {!selected && (
          <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
            {[['advisor','💼','Financial Advisor'],['cpa','🧾','CPA']].map(([type, icon, label]) => (
              <button key={type} style={s.audBtn} onClick={() => onSelect(type)}>
                <span style={{ display: 'block', fontSize: '1rem', marginBottom: 2 }}>{icon}</span>
                {label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function Msg({ role, content, config }) {
  const user = role === 'user'
  return (
    <div style={{ ...s.row, alignSelf: user ? 'flex-end' : 'flex-start', flexDirection: user ? 'row-reverse' : 'row', animation: 'ebam-f .3s ease both' }}>
      {user
        ? <div style={{ ...s.avAI, ...s.avUser }}>YOU</div>
        : <BotAvatar config={config} style={s.avAI} />
      }
      <div style={user ? s.bubUser : s.bubAI}><Msg2Html text={content} /></div>
    </div>
  )
}

function Msg2Html({ text }) {
  if (!text) return null
  // If content contains HTML tags, render as HTML
  if (/<[a-z][\s\S]*>/i.test(text)) {
    return <span dangerouslySetInnerHTML={{ __html: text }} />
  }
  // Otherwise render markdown-lite (bold + newlines)
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
  panel:      { position:'fixed', bottom:88, right:16, width:360, maxWidth:'calc(100vw - 32px)', height:'calc(100vh - 110px)', maxHeight:680, display:'flex', flexDirection:'column', borderRadius:20, overflow:'hidden', boxShadow:'0 24px 64px rgba(0,0,0,0.5)', zIndex:2147483647, fontFamily:"'DM Sans',-apple-system,sans-serif", background:NAVY_MID },
  header:     { background:`linear-gradient(135deg,${NAVY_MID},${NAVY_LT})`, border:`1px solid rgba(201,168,76,0.25)`, borderBottom:'none', padding:'14px 20px', display:'flex', alignItems:'center', gap:12 },
  avatarIcon: { width:40, height:40, background:`linear-gradient(135deg,${GOLD},${GOLD_LT})`, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', fontSize:16, flexShrink:0, boxShadow:'0 4px 16px rgba(201,168,76,0.3)', overflow:'hidden' },
  headerTitle:{ fontFamily:"'Playfair Display',Georgia,serif", fontSize:'0.95rem', color:WHITE, fontWeight:600 },
  headerSub:  { fontSize:'0.65rem', color:GOLD, marginTop:2, letterSpacing:'0.06em', textTransform:'uppercase' },
  statusDot:  { fontSize:'0.7rem', color:'#5dba8a', fontWeight:500, display:'flex', alignItems:'center', gap:5 },
  restartBtn: { background:'none', border:'none', color:'rgba(201,168,76,0.5)', fontSize:'1rem', cursor:'pointer', padding:0, lineHeight:1 },
  disclaimer: { background:'rgba(201,168,76,0.08)', borderLeft:'1px solid rgba(201,168,76,0.2)', borderRight:'1px solid rgba(201,168,76,0.2)', padding:'6px 16px', fontSize:'0.68rem', color:'rgba(248,246,241,0.55)', lineHeight:1.4, textAlign:'center' },
  body:       { background:NAVY_MID, borderLeft:'1px solid rgba(201,168,76,0.2)', borderRight:'1px solid rgba(201,168,76,0.2)', flex:1, overflowY:'auto', padding:'16px 18px 8px', display:'flex', flexDirection:'column', gap:10, minHeight:0 },
  row:        { display:'flex', gap:9, maxWidth:'88%' },
  avAI:       { width:30, height:30, borderRadius:'50%', background:`linear-gradient(135deg,${GOLD},${GOLD_LT})`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, flexShrink:0, marginTop:3, overflow:'hidden' },
  avUser:     { background:BUBBLE_US, border:'1px solid rgba(201,168,76,0.2)', color:GOLD, fontSize:'9px', fontWeight:700 },
  bubAI:      { background:BUBBLE_AI, border:'1px solid rgba(201,168,76,0.12)', borderRadius:'4px 14px 14px 14px', padding:'9px 13px', fontSize:'0.82rem', lineHeight:1.55, color:'rgba(248,246,241,0.92)', fontWeight:300 },
  bubUser:    { background:BUBBLE_US, border:'1px solid rgba(201,168,76,0.2)', borderRadius:'14px 4px 14px 14px', padding:'9px 13px', fontSize:'0.82rem', lineHeight:1.55, color:'rgba(248,246,241,0.92)', fontWeight:300 },
  audBtn:     { flex:1, padding:'7px 10px', borderRadius:10, border:'1px solid rgba(201,168,76,0.4)', background:'rgba(201,168,76,0.06)', color:WHITE, fontSize:'0.8rem', fontWeight:500, cursor:'pointer', textAlign:'center', transition:'all .2s' },
  typing:     { display:'flex', alignItems:'center', gap:5, padding:'11px 15px', background:BUBBLE_AI, border:'1px solid rgba(201,168,76,0.12)', borderRadius:'4px 14px 14px 14px' },
  dot:        { width:7, height:7, background:GOLD, borderRadius:'50%', opacity:.4, display:'inline-block', animation:'ebam-t 1.2s ease-in-out infinite' },
  qrs:        { display:'flex', flexWrap:'wrap', gap:7, marginTop:2 },
  qrBtn:      { background:'transparent', border:'1px solid rgba(201,168,76,0.35)', color:GOLD_LT, padding:'6px 12px', borderRadius:20, fontSize:'0.77rem', cursor:'pointer', transition:'all .2s' },
  footer:     { background:NAVY_LT, border:'1px solid rgba(201,168,76,0.2)', borderTop:'1px solid rgba(201,168,76,0.1)', padding:'10px 14px', display:'flex', gap:8, alignItems:'flex-end' },
  input:      { flex:1, background:NAVY_MID, border:'1px solid rgba(201,168,76,0.2)', borderRadius:10, padding:'9px 12px', color:WHITE, fontFamily:"'DM Sans',sans-serif", fontSize:'0.82rem', fontWeight:300, resize:'none', minHeight:38, maxHeight:120, lineHeight:1.5, outline:'none' },
  micBtn:     { width:38, height:38, background:NAVY_MID, border:'1px solid rgba(201,168,76,0.25)', borderRadius:10, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, transition:'all .2s' },
  micBtnActive: { border:`1px solid ${GOLD}`, background:'rgba(201,168,76,0.12)', animation:'ebam-pulse 1s ease-in-out infinite' },
  sendBtn:    { width:38, height:38, background:`linear-gradient(135deg,${GOLD},${GOLD_LT})`, border:'none', borderRadius:10, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, boxShadow:'0 4px 12px rgba(201,168,76,0.25)' },
  branding:   { padding:'7px 16px', fontSize:'0.68rem', color:'rgba(138,155,176,0.45)', letterSpacing:'0.04em', textAlign:'center', background:NAVY_LT, borderLeft:'1px solid rgba(201,168,76,0.2)', borderRight:'1px solid rgba(201,168,76,0.2)', borderBottom:'1px solid rgba(201,168,76,0.2)', borderRadius:'0 0 20px 20px' },
  fab:        { position:'fixed', bottom:24, right:16, width:52, height:52, borderRadius:'50%', background:NAVY, color:WHITE, border:`2px solid ${GOLD}`, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', boxShadow:'0 6px 24px rgba(13,27,42,0.45)', zIndex:2147483647, transition:'all .2s' },
}
