const BASE = '/api/admin'

async function get(path) {
  const res = await fetch(BASE + path)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

async function post(path, body) {
  const res = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

async function put(path, body) {
  const res = await fetch(BASE + path, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export const getChatbotConfig   = ()               => get('/chatbot-config')
export const saveChatbotConfig  = (config)         => put('/chatbot-config', { config })
export const resetChatbotConfig = ()               => post('/chatbot-config/reset', {})
export const getStats           = ()               => get('/stats')
export const getFlow            = (audience)       => get(`/flow/${audience}`)
export const saveFlow           = (audience, flow) => put(`/flow/${audience}`, { flow })
export const resetFlow          = (audience)       => post(`/flow/${audience}/reset`, {})
export const getLeads           = ()        => get('/leads') // proxied via admin namespace below

// Leads endpoint lives under /api/leads/ — keep this for LeadsPage
export async function getLeadsList() {
  const res = await fetch('/api/leads/')
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}
