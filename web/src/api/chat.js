import { API_BASE } from './base.js'

const BASE = API_BASE + '/api/chat'

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
  return post('/start', { audience })
}

export async function sendMessage(sessionId, userMessage) {
  return post('/message', { session_id: sessionId, user_message: userMessage })
}

export async function getChatConfig() {
  const res = await fetch(BASE + '/config')
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}
