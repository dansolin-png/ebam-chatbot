import { API_BASE } from './base.js'

const BASE = API_BASE + '/api/compliance'

function authHeaders() {
  const token = localStorage.getItem('ebam_token') || ''
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
}

async function apiFetch(url, opts = {}) {
  const res = await fetch(url, { headers: authHeaders(), ...opts })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export const getComplianceRecords = () => apiFetch(`${BASE}/records`)
export const getComplianceBatches = () => apiFetch(`${BASE}/batches`)
export const getBatch             = (id) => apiFetch(`${BASE}/batch/${id}`)
export const verifyRecord         = (id) => apiFetch(`${BASE}/verify/${id}`)
export const verifySession        = (session_id) => apiFetch(`${BASE}/verify-session/${session_id}`)
export const sealBatch            = (batch_id) =>
  apiFetch(`${BASE}/batch`, {
    method: 'POST',
    body: JSON.stringify({ batch_id, source: 'manual' }),
  })
