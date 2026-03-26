import { useState, useEffect, useMemo, useRef } from 'react'
import { getLeadsList as getLeads } from '../api/admin.js'
import { verifySession } from '../api/compliance.js'
import { renderMessageHtml } from '../utils/renderMessage.js'
import { API_BASE } from '../api/base.js'

// ---------------------------------------------------------------------------
// Timezone detection
// ---------------------------------------------------------------------------
function detectTimezone() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' } catch { return 'UTC' }
}

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------
function toLocalDateStr(isoStr, tz) {
  if (!isoStr) return null
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(isoStr))
  } catch { return isoStr.slice(0, 10) }
}

function formatDate(isoStr, tz) {
  if (!isoStr) return '—'
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: tz, dateStyle: 'medium', timeStyle: 'short' }).format(new Date(isoStr))
  } catch { return new Date(isoStr).toLocaleString() }
}

function buildCalendar(tz) {
  const days = []
  const now = new Date()
  for (let i = 0; i < 30; i++) {
    const d = new Date(now)
    d.setDate(now.getDate() - i)
    days.push(toLocalDateStr(d.toISOString(), tz))
  }
  return days
}

// ---------------------------------------------------------------------------
// Calendar popup — month grid view
// ---------------------------------------------------------------------------
const DAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December']

function cutoffDateStr(tz) {
  const d = new Date()
  d.setDate(d.getDate() - 29)   // last 30 days inclusive of today
  return toLocalDateStr(d.toISOString(), tz)
}

function CalendarPopup({ tz, setTz, localTz, countByDate, selectedDate, setSelectedDate, onClose }) {
  const todayStr = toLocalDateStr(new Date().toISOString(), tz)
  const cutoff   = cutoffDateStr(tz)
  const [year, setYear]   = useState(() => parseInt(todayStr.slice(0, 4)))
  const [month, setMonth] = useState(() => parseInt(todayStr.slice(5, 7)) - 1) // 0-indexed
  const [tzInput, setTzInput] = useState(tz)
  const [tzError, setTzError] = useState('')
  const ref = useRef(null)

  useEffect(() => {
    function handle(e) { if (ref.current && !ref.current.contains(e.target)) onClose() }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [onClose])

  function applyTz(val) {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: val }).format(new Date())
      setTz(val); setTzInput(val); setTzError('')
    } catch { setTzError('Invalid timezone') }
  }

  function prevMonth() { if (month === 0) { setMonth(11); setYear(y => y - 1) } else setMonth(m => m - 1) }
  function nextMonth() { if (month === 11) { setMonth(0); setYear(y => y + 1) } else setMonth(m => m + 1) }

  // Build grid: 6 rows × 7 cols
  const firstDay = new Date(year, month, 1).getDay() // 0=Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const daysInPrev  = new Date(year, month, 0).getDate()

  const cells = []
  // leading days from previous month
  for (let i = firstDay - 1; i >= 0; i--) cells.push({ d: daysInPrev - i, cur: false })
  // current month
  for (let d = 1; d <= daysInMonth; d++) cells.push({ d, cur: true })
  // trailing days to fill 6 rows (42 cells)
  let t = 1
  while (cells.length < 42) cells.push({ d: t++, cur: false })

  function cellDate(cell) {
    if (!cell.cur) return null
    const mm = String(month + 1).padStart(2, '0')
    const dd = String(cell.d).padStart(2, '0')
    return `${year}-${mm}-${dd}`
  }

  return (
    <div ref={ref} style={{
      position: 'absolute', top: '100%', right: 0, marginTop: 6,
      width: 288, backgroundColor: '#fff', border: '1px solid #e2e8f0',
      borderRadius: 14, boxShadow: '0 8px 32px rgba(0,0,0,0.14)',
      zIndex: 1000, overflow: 'hidden',
      fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
    }}>

      {/* Window notice */}
      <div style={{ padding: '7px 14px', backgroundColor: '#eff6ff', borderBottom: '1px solid #dbeafe', fontSize: 10, color: '#1e40af', display: 'flex', alignItems: 'center', gap: 5 }}>
        <span>ℹ</span>
        <span>Showing last 30 days only. For older data, use <em>Historical Leads</em>.</span>
      </div>
      {/* Timezone row */}
      <div style={{ padding: '10px 14px', borderBottom: '1px solid #f1f5f9', backgroundColor: '#f8fafc' }}>
        <div style={{ display: 'flex', border: '1.5px solid #e2e8f0', borderRadius: 6, overflow: 'hidden', marginBottom: 7 }}>
          {[{ label: 'UTC', val: 'UTC' }, { label: 'Local', val: localTz }].map(({ label, val }) => (
            <button key={val} onClick={() => applyTz(val)} style={{
              flex: 1, padding: '5px 0', border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 600,
              backgroundColor: tz === val ? '#1e3a5f' : '#fff',
              color: tz === val ? '#fff' : '#64748b',
            }}>
              {label}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 5 }}>
          <input
            value={tzInput}
            onChange={e => setTzInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && applyTz(tzInput)}
            placeholder="e.g. Asia/Kolkata"
            style={{ flex: 1, fontSize: 11, border: '1.5px solid #e2e8f0', borderRadius: 5, padding: '4px 7px', outline: 'none', minWidth: 0, color: '#1e293b' }}
          />
          <button onClick={() => applyTz(tzInput)} style={{ fontSize: 11, padding: '4px 9px', border: 'none', borderRadius: 5, background: '#1e3a5f', cursor: 'pointer', color: '#fff', fontWeight: 700 }}>✓</button>
        </div>
        {tzError && <div style={{ fontSize: 10, color: '#ef4444', marginTop: 3 }}>{tzError}</div>}
        <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 3 }}>{tz}</div>
      </div>

      {/* Month navigation */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px 8px' }}>
        <span style={{ fontSize: 15, fontWeight: 700, color: '#1e293b' }}>{MONTH_NAMES[month]} {year}</span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <button onClick={prevMonth} style={navBtn}>▲</button>
          <button onClick={nextMonth} style={navBtn}>▼</button>
        </div>
      </div>

      {/* Day headers */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', padding: '0 10px', marginBottom: 4 }}>
        {DAY_LABELS.map(d => (
          <div key={d} style={{ textAlign: 'center', fontSize: 11, fontWeight: 600, color: '#94a3b8', padding: '2px 0' }}>{d}</div>
        ))}
      </div>

      {/* Day grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', padding: '0 10px 12px', gap: '2px 0' }}>
        {cells.map((cell, i) => {
          const dateStr  = cellDate(cell)
          const isFuture = dateStr && dateStr > todayStr
          const isTooOld = dateStr && dateStr < cutoff
          const isSelected = dateStr && dateStr === selectedDate
          const isToday    = dateStr === todayStr
          const count      = dateStr ? (countByDate[dateStr] || 0) : 0
          const disabled   = !cell.cur || isFuture || isTooOld
          const cellTitle  = isTooOld
            ? 'Older than 30 days — use Historical Leads section'
            : isFuture ? 'Future date'
            : count > 0 ? `${count} lead${count !== 1 ? 's' : ''} on this day`
            : 'No leads on this day'

          return (
            <div
              key={i}
              title={cellTitle}
              onClick={() => {
                if (disabled) return
                setSelectedDate(isSelected ? null : dateStr)
                onClose()
              }}
              style={{
                position: 'relative',
                textAlign: 'center', padding: '5px 0',
                cursor: disabled ? 'default' : 'pointer',
              }}
            >
              <span style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: 30, height: 30, borderRadius: '50%',
                fontSize: 13,
                fontWeight: isToday || isSelected ? 700 : 400,
                backgroundColor: isSelected ? '#1e3a5f' : isToday ? '#e0e7ff' : 'transparent',
                color: isSelected ? '#fff' : isToday ? '#1e3a5f' : (isFuture || isTooOld) ? '#e2e8f0' : cell.cur ? '#1e293b' : '#cbd5e1',
              }}>
                {cell.d}
              </span>
              {count > 0 && cell.cur && !isFuture && !isTooOld && (
                <span style={{
                  position: 'absolute', bottom: 3, left: '50%', transform: 'translateX(-50%)',
                  width: 5, height: 5, borderRadius: '50%',
                  backgroundColor: isSelected ? '#93c5fd' : '#3b82f6',
                  display: 'block',
                }} />
              )}
            </div>
          )
        })}
      </div>

      {/* Clear link */}
      {selectedDate && (
        <div style={{ padding: '0 14px 12px', textAlign: 'center' }}>
          <button onClick={() => { setSelectedDate(null); onClose() }} style={{ fontSize: 11, color: '#64748b', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
            Clear filter
          </button>
        </div>
      )}
    </div>
  )
}

const navBtn = { background: '#f1f5f9', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 9, color: '#475569', padding: '3px 6px', lineHeight: 1 }

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
export default function LeadsPage() {
  const [leads, setLeads]               = useState([])
  const [loading, setLoading]           = useState(true)
  const [filter, setFilter]             = useState('all')
  const [selectedLead, setSelectedLead] = useState(null)
  const [selectedDate, setSelectedDate] = useState(null)
  const [localTz]                       = useState(() => detectTimezone())
  const [tz, setTz]                     = useState(() => detectTimezone())
  const [calOpen, setCalOpen]           = useState(false)

  useEffect(() => {
    getLeads().then(setLeads).finally(() => setLoading(false))
  }, [])

  const calendar = useMemo(() => buildCalendar(tz), [tz])

  const countByDate = useMemo(() => {
    const map = {}
    leads.forEach(l => { const d = toLocalDateStr(l.created_at, tz); if (d) map[d] = (map[d] || 0) + 1 })
    return map
  }, [leads, tz])

  const filtered = useMemo(() => {
    let list = filter === 'all' ? leads : leads.filter(l => l.user_type === filter)
    if (selectedDate) list = list.filter(l => toLocalDateStr(l.created_at, tz) === selectedDate)
    return list
  }, [leads, filter, selectedDate, tz])

  async function handleDeleteLead(lead, e) {
    e?.stopPropagation()
    if (!confirm(`Delete lead for ${lead.name || lead.email}?`)) return
    const token = localStorage.getItem('ebam_token') || ''
    await fetch(API_BASE + `/api/leads/${lead.lead_id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
    setLeads(prev => prev.filter(l => l.lead_id !== lead.lead_id))
    if (selectedLead?.lead_id === lead.lead_id) setSelectedLead(null)
  }

  function downloadCSV() {
    const headers = ['Name', 'Email', 'Type', 'Date']
    const rows = filtered.map(l => [l.name || '', l.email || '', l.user_type || '', formatDate(l.created_at, tz)])
    const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = `ebam-leads${selectedDate ? '-' + selectedDate : ''}.csv`; a.click()
  }

  if (loading) return <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>Loading...</div>

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 56px)', overflow: 'hidden' }}>
      <div style={{ flex: 1, overflow: 'auto', padding: '32px 24px' }}>
        <div style={{ maxWidth: selectedLead ? '100%' : '1100px', margin: '0 auto' }}>

          {/* Header row */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '24px' }}>
            <div>
              <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#1e3a5f', marginBottom: '4px' }}>
                Leads
                {selectedDate && (
                  <span style={{ fontSize: 13, fontWeight: 500, color: '#64748b', marginLeft: 8 }}>
                    — {selectedDate}
                    <button onClick={() => setSelectedDate(null)} style={{ marginLeft: 6, fontSize: 11, color: '#94a3b8', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>✕</button>
                  </span>
                )}
              </h1>
              <p style={{ color: '#64748b', fontSize: '14px', margin: 0 }}>
                {filtered.length} lead{filtered.length !== 1 ? 's' : ''}
                {selectedDate ? ' on this date' : ` of ${leads.length} total`}
              </p>
              <p style={{ color: '#1e40af', fontSize: 12, margin: '6px 0 0', display: 'flex', alignItems: 'center', gap: 4 }}>
                <span title="Data older than 30 days is available in the Historical Leads section">ℹ</span>
                Last 30 days only. For older data, use <strong style={{ marginLeft: 3 }}>Historical Leads</strong>.
              </p>
            </div>

            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              {/* Type filter */}
              <div style={{ display: 'flex', border: '1.5px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
                {['all', 'advisor', 'cpa'].map(f => (
                  <button key={f} onClick={() => setFilter(f)} style={{
                    padding: '7px 14px', border: 'none',
                    backgroundColor: filter === f ? '#1e3a5f' : '#fff',
                    color: filter === f ? '#fff' : '#64748b',
                    fontSize: '13px', fontWeight: filter === f ? 600 : 400,
                    cursor: 'pointer', textTransform: 'capitalize',
                  }}>
                    {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
                  </button>
                ))}
              </div>

              {/* Calendar icon button */}
              <div style={{ position: 'relative' }}>
                <button
                  onClick={() => setCalOpen(v => !v)}
                  title="Filter by date — last 30 days only. Use Historical Leads for older data."
                  style={{
                    backgroundColor: selectedDate ? '#1e3a5f' : '#fff',
                    border: '1.5px solid ' + (selectedDate ? '#1e3a5f' : '#e2e8f0'),
                    borderRadius: '8px', padding: '7px 10px',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
                    color: selectedDate ? '#fff' : '#1e3a5f',
                  }}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                  </svg>
                  {selectedDate && <span style={{ fontSize: 12, fontWeight: 600 }}>{selectedDate}</span>}
                </button>
                {calOpen && (
                  <CalendarPopup
                    tz={tz} setTz={setTz} localTz={localTz}
                    countByDate={countByDate}
                    selectedDate={selectedDate} setSelectedDate={setSelectedDate}
                    onClose={() => setCalOpen(false)}
                  />
                )}
              </div>

              <button onClick={downloadCSV} style={{ backgroundColor: '#fff', border: '1.5px solid #e2e8f0', borderRadius: '8px', padding: '7px 14px', fontSize: '13px', color: '#1e3a5f', fontWeight: 600, cursor: 'pointer' }}>
                Export CSV
              </button>
            </div>
          </div>

          {/* Table */}
          {filtered.length === 0 ? (
            <div style={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '48px', textAlign: 'center', color: '#94a3b8' }}>
              {selectedDate ? `No leads captured on ${selectedDate}.` : 'No leads yet. Complete a chat conversation to capture a lead.'}
            </div>
          ) : (
            <div style={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                    {['Name', 'Email', 'Type', 'Captured', ''].map(h => (
                      <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((lead, i) => (
                    <tr key={lead.lead_id || lead.id} onClick={() => setSelectedLead(lead)} style={{
                      borderBottom: '1px solid #f1f5f9',
                      backgroundColor: selectedLead?.lead_id === lead.lead_id ? '#eff6ff' : i % 2 === 0 ? '#fff' : '#fafafa',
                      cursor: 'pointer', transition: 'background 0.1s',
                    }}>
                      <td style={tdStyle}>{lead.name || <span style={{ color: '#94a3b8' }}>—</span>}</td>
                      <td style={tdStyle}>{lead.email || <span style={{ color: '#94a3b8' }}>—</span>}</td>
                      <td style={tdStyle}>
                        {lead.user_type && (
                          <span style={{ backgroundColor: lead.user_type === 'advisor' ? '#dbeafe' : '#dcfce7', color: lead.user_type === 'advisor' ? '#1d4ed8' : '#15803d', padding: '2px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 600, textTransform: 'capitalize' }}>
                            {lead.user_type}
                          </span>
                        )}
                      </td>
                      <td style={{ ...tdStyle, color: '#94a3b8', fontSize: '12px' }}>{formatDate(lead.created_at, tz)}</td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>
                        <button
                          onClick={e => handleDeleteLead(lead, e)}
                          title="Delete lead"
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#cbd5e1', fontSize: 15, padding: '2px 4px', borderRadius: 4, lineHeight: 1 }}
                          onMouseEnter={e => e.currentTarget.style.color = '#ef4444'}
                          onMouseLeave={e => e.currentTarget.style.color = '#cbd5e1'}
                        >🗑</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {selectedLead && (
        <LeadDetail lead={selectedLead} onClose={() => setSelectedLead(null)} onDelete={() => handleDeleteLead(selectedLead)} tz={tz} />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Lead detail panel
// ---------------------------------------------------------------------------
function LeadDetail({ lead, onClose, onDelete, tz }) {
  const [messages, setMessages]         = useState(null)
  const [loadingMsgs, setLoadingMsgs]   = useState(true)
  const [verifying, setVerifying]       = useState(false)
  const [verifyResult, setVerifyResult] = useState(null)
  const [verifyError, setVerifyError]   = useState(null)

  useEffect(() => {
    setLoadingMsgs(true)
    fetch(API_BASE + `/api/chat/history/${lead.session_id}`)
      .then(r => r.json()).then(setMessages).catch(() => setMessages([]))
      .finally(() => setLoadingMsgs(false))
  }, [lead.session_id])

  // Reset verify state when lead changes
  useEffect(() => { setVerifyResult(null); setVerifyError(null) }, [lead.session_id])

  async function handleVerify() {
    setVerifying(true)
    setVerifyResult(null)
    setVerifyError(null)
    try {
      const result = await verifySession(lead.session_id)
      setVerifyResult(result)
    } catch (e) {
      setVerifyError(e.message)
    } finally {
      setVerifying(false)
    }
  }

  const batchPending = verifyResult?.detail === 'Batch not yet sealed — Merkle proof not available'
  const coreValid    = verifyResult?.checks?.data_hash && verifyResult?.checks?.record_hash
  const verifyStatus = !verifyResult ? null
    : verifyResult.valid        ? { label: '✓ Record Verified — Tamper-Free',                 color: '#16a34a' }
    : batchPending && coreValid ? { label: '✓ Data Integrity Confirmed — Batch Seal Pending', color: '#d97706' }
    :                             { label: '✗ Verification Failed — Possible Tampering',      color: '#ef4444' }
  const verifyBorder = !verifyResult ? 'transparent'
    : verifyResult.valid ? '#16a34a' : (batchPending && coreValid) ? '#d97706' : '#ef4444'

  return (
    <div style={{ width: '420px', minWidth: '420px', borderLeft: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', backgroundColor: '#fff', overflow: 'hidden' }}>
      <div style={{ padding: '20px 20px 16px', borderBottom: '1px solid #e2e8f0', flexShrink: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: '16px', fontWeight: 700, color: '#1e293b' }}>{lead.name || 'Unknown'}</div>
            <div style={{ fontSize: '13px', color: '#64748b', marginTop: 2 }}>{lead.email}</div>
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <button
              onClick={handleVerify}
              disabled={verifying}
              style={{ backgroundColor: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0', borderRadius: 6, cursor: verifying ? 'default' : 'pointer', fontSize: 12, padding: '4px 12px', fontWeight: 600 }}
            >
              {verifying ? '…' : 'Verify'}
            </button>
            <button onClick={onDelete} title="Delete lead" style={{ background: 'none', border: '1px solid #fecaca', borderRadius: 6, cursor: 'pointer', color: '#ef4444', fontSize: 12, padding: '4px 10px', fontWeight: 600 }}>Delete</button>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: '18px', lineHeight: 1, padding: '2px 4px' }}>✕</button>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
          {lead.user_type && (
            <Chip color={lead.user_type === 'advisor' ? 'blue' : 'green'}>
              {lead.user_type === 'advisor' ? '💼 Advisor' : '🧾 CPA'}
            </Chip>
          )}
        </div>
        <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: 8 }}>Captured {formatDate(lead.created_at, tz)}</div>

        {/* Verify result panel */}
        {verifyError && (
          <div style={{ marginTop: 12, padding: '10px 12px', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, fontSize: 12, color: '#dc2626' }}>
            {verifyError}
          </div>
        )}
        {verifyResult && (
          <div style={{ marginTop: 12, padding: '10px 12px', backgroundColor: '#fff', border: `1px solid #e2e8f0`, borderLeft: `4px solid ${verifyBorder}`, borderRadius: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: verifyStatus.color, marginBottom: 8 }}>
                {verifyStatus.label}
              </div>
              <button onClick={() => setVerifyResult(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 14, lineHeight: 1 }}>✕</button>
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {Object.entries(verifyResult.checks).map(([check, ok]) => {
                const pending = batchPending && (check === 'merkle_proof' || check === 'kms_signature')
                return (
                  <span key={check} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 20, fontWeight: 600,
                    backgroundColor: pending ? '#fef9c3' : ok ? '#dcfce7' : '#fee2e2',
                    color: pending ? '#854d0e' : ok ? '#166534' : '#991b1b' }}>
                    {pending ? '⏳' : ok ? '✓' : '✗'} {check.replace(/_/g, ' ')}{pending ? ' (pending)' : ''}
                  </span>
                )
              })}
            </div>
            {verifyResult.detail && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 6 }}>{verifyResult.detail}</div>}
          </div>
        )}
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ fontSize: '11px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Conversation History</div>
        {loadingMsgs ? (
          <div style={{ color: '#94a3b8', fontSize: '13px', textAlign: 'center', paddingTop: 20 }}>Loading...</div>
        ) : messages?.length === 0 ? (
          <div style={{ color: '#94a3b8', fontSize: '13px', textAlign: 'center', paddingTop: 20 }}>No messages found.</div>
        ) : (
          messages.map((msg, i) => {
            const isBot = msg.role === 'bot' || msg.role === 'assistant'
            const ts = msg.created_at ? formatDate(msg.created_at, tz) : null
            return (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: isBot ? 'flex-start' : 'flex-end', gap: 2 }}>
                <div style={{ maxWidth: '85%', padding: '8px 12px', borderRadius: isBot ? '4px 12px 12px 12px' : '12px 4px 12px 12px', backgroundColor: isBot ? '#f1f5f9' : '#1e3a5f', color: isBot ? '#1e293b' : '#fff', fontSize: '13px', lineHeight: 1.55 }}>
                  {isBot ? <span dangerouslySetInnerHTML={{ __html: renderMessageHtml(msg.content) }} /> : msg.content}
                </div>
                {ts && <div style={{ fontSize: '10px', color: '#94a3b8', paddingLeft: isBot ? 4 : 0, paddingRight: isBot ? 0 : 4 }}>{ts}</div>}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

function Chip({ color, children }) {
  const colors = { blue: { bg: '#dbeafe', fg: '#1d4ed8' }, green: { bg: '#dcfce7', fg: '#15803d' }, gray: { bg: '#f1f5f9', fg: '#475569' } }
  const { bg, fg } = colors[color] || colors.gray
  return <span style={{ backgroundColor: bg, color: fg, padding: '2px 10px', borderRadius: 20, fontSize: 12, fontWeight: 500 }}>{children}</span>
}

const tdStyle = { padding: '12px 16px', fontSize: '14px', color: '#1e293b', verticalAlign: 'middle' }
