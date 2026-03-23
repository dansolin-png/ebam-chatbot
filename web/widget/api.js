// Reads API base URL from the script tag's data-api attribute, or falls back to same origin
function getBase() {
  const tag = document.currentScript || document.querySelector('script[data-api]')
  return (tag && tag.dataset.api) ? tag.dataset.api.replace(/\/$/, '') : ''
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

export async function sendLLMMessage(sessionId, userMessage, audience = null) {
  return post('/api/chat/llm-message', {
    session_id: sessionId,
    user_message: userMessage,
    ...(audience ? { audience } : {}),
  })
}

export async function getChatConfig() {
  const res = await fetch(BASE + '/api/chat/config')
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}
