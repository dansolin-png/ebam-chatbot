import { API_BASE } from './base.js'

const BASE = API_BASE + '/api/admin'

function authHeaders() {
  const token = localStorage.getItem('ebam_token') || ''
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
}

function handleUnauth() {
  localStorage.removeItem('ebam_token')
  window.location.href = '/admin'
}

async function get(path) {
  const res = await fetch(BASE + path, { headers: authHeaders() })
  if (res.status === 401) { handleUnauth(); throw new Error('Unauthorized') }
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

async function post(path, body) {
  const res = await fetch(BASE + path, {
    method: 'POST', headers: authHeaders(), body: JSON.stringify(body),
  })
  if (res.status === 401) { handleUnauth(); throw new Error('Unauthorized') }
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

async function put(path, body) {
  const res = await fetch(BASE + path, {
    method: 'PUT', headers: authHeaders(), body: JSON.stringify(body),
  })
  if (res.status === 401) { handleUnauth(); throw new Error('Unauthorized') }
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export const getChatbotConfig        = ()                       => get('/chatbot-config')
export const saveChatbotConfig       = (config)                 => put('/chatbot-config', { config })
export const resetChatbotConfig      = ()                       => post('/chatbot-config/reset', {})
export const getConfigHistory        = ()                       => get('/chatbot-config/history')
export const getConfigHistoryEntry   = (changed_at)             => get(`/chatbot-config/history/${encodeURIComponent(changed_at)}`)
export const getStats                = ()                       => get('/stats')
export const getFlow                 = (audience)               => get(`/flow/${audience}`)
export const saveFlow                = (audience, flow)         => put(`/flow/${audience}`, { flow })
export const resetFlow               = (audience)               => post(`/flow/${audience}/reset`, {})
export const getFlowHistory          = (audience)               => get(`/flow/${audience}/history`)
export const getFlowHistoryEntry     = (audience, changed_at)   => get(`/flow/${audience}/history/${encodeURIComponent(changed_at)}`)

export async function getLeadsList() {
  const token = localStorage.getItem('ebam_token') || ''
  const res = await fetch(API_BASE + '/api/leads/', {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (res.status === 401) { handleUnauth(); throw new Error('Unauthorized') }
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}
