import { API_BASE } from './base.js'

const BASE = API_BASE + '/api/history'

function authHeaders() {
  const token = localStorage.getItem('ebam_token') || ''
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
}

async function apiFetch(url, opts = {}) {
  const res = await fetch(url, { headers: authHeaders(), ...opts })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export const getAvailableDays   = ()     => apiFetch(`${BASE}/available-days`)
export const fetchDate           = (date) => apiFetch(`${BASE}/fetch/${date}`, { method: 'POST' })
export const getFetchedDates     = ()     => apiFetch(`${BASE}/dates`)
export const getAllHistoryLeads  = ()     => apiFetch(`${BASE}/leads`)
export const getLeadsForDate     = (date) => apiFetch(`${BASE}/leads/${date}`)
export const deleteLeadsForDate  = (date) => apiFetch(`${BASE}/leads/${date}`, { method: 'DELETE' })
export const deleteAllHistory    = ()     => apiFetch(`${BASE}/leads`, { method: 'DELETE' })
export const verifyHistoryLead   = (id)  => apiFetch(`${BASE}/verify/${id}`)
