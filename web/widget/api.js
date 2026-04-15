// Resolve the API base URL at runtime:
// 1. data-api attribute on the script tag (static embed: <script src="widget.js" data-api="https://...">)
// 2. window.EBAMChat.apiBase (dynamic embed via createElement — set before loading the script)
// 3. VITE_API_BASE_URL baked in at build time (Amplify / production build)
// 4. Empty string → same-origin (local dev with Vite proxy)
const _BAKED_BASE = import.meta.env.VITE_API_BASE_URL || ''

function getBase() {
  const tag = document.currentScript || document.querySelector('script[data-api]')
  if (tag && tag.dataset.api) return tag.dataset.api.replace(/\/$/, '')
  if (window.EBAMChat && window.EBAMChat.apiBase) return window.EBAMChat.apiBase.replace(/\/$/, '')
  return _BAKED_BASE.replace(/\/$/, '')
}

const BASE = getBase()

async function post(path, body) {
  const res = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export async function startSession(audience) {
  return post('/api/chat/start', { audience })
}

export async function sendLLMMessage(sessionId, userMessage, sessionState = null) {
  return post('/api/chat/message', {
    session_id: sessionId,
    user_message: userMessage,
    ...(sessionState ? { session_state: sessionState } : {}),
  })
}

export async function getChatConfig() {
  const res = await fetch(BASE + '/api/chat/config')
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}
