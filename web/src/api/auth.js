import { API_BASE } from './base.js'

function authHeaders() {
  const token = localStorage.getItem('ebam_token') || ''
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
}

export async function loginApi(username, password) {
  const res = await fetch(API_BASE + '/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  if (!res.ok) throw new Error('Invalid credentials')
  return res.json()
}

export async function getUsers() {
  const res = await fetch(API_BASE + '/api/auth/users', { headers: authHeaders() })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export async function createUser(username, password) {
  const res = await fetch(API_BASE + '/api/auth/users', {
    method: 'POST', headers: authHeaders(),
    body: JSON.stringify({ username, password }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || `HTTP ${res.status}`)
  }
  return res.json()
}

export async function resetPassword(username, password) {
  const res = await fetch(API_BASE + `/api/auth/users/${username}/password`, {
    method: 'PUT', headers: authHeaders(),
    body: JSON.stringify({ password }),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export async function deleteUser(username) {
  const res = await fetch(API_BASE + `/api/auth/users/${username}`, {
    method: 'DELETE', headers: authHeaders(),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}
