import { useState, useEffect, useMemo, useRef } from 'react'
import { renderMessageHtml } from '../utils/renderMessage.js'
import {
  getAvailableDays,
  fetchDate,
  getFetchedDates,
  getLeadsForDate,
  deleteLeadsForDate,
  deleteAllHistory,
} from '../api/history.js'

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------
function detectTimezone() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' } catch { return 'UTC' }
}

function formatDate(isoStr, tz) {
  if (!isoStr) return '—'
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: tz, dateStyle: 'medium', timeStyle: 'short' }).format(new Date(isoStr))
  } catch { return new Date(isoStr).toLocaleString() }
}

function cutoffDateStr() {
  const d = new Date()
  d.setDate(d.getDate() - 30)
  return d.toISOString().slice(0, 10)
}

// ---------------------------------------------------------------------------
// Calendar popup for picking historical dates
// ---------------------------------------------------------------------------
const DAY_LABELS  = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December']
const navBtnStyle = { background: '#f1f5f9', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 9, color: '#475569', padding: '3px 6px', lineHeight: 1 }

function HistoryCalendarPopup({ tz, availableSet, fetchedSet, onPickDate, onClose }) {
  const cutoff  = cutoffDateStr()
  const initD   = new Date(cutoff)
  const [year, setYear]   = useState(() => initD.getFullYear())
  const [month, setMonth] = useState(() => initD.getMonth())
  const ref = useRef(null)

  useEffect(() => {
    function handle(e) { if (ref.current && !ref.current.contains(e.target)) onClose() }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [onClose])

  function prevMonth() { if (month === 0) { setMonth(11); setYear(y => y - 1) } else setMonth(m => m - 1) }
  function nextMonth() { if (month === 11) { setMonth(0); setYear(y => y + 1) } else setMonth(m => m + 1) }

  const firstDay    = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const daysInPrev  = new Date(year, month, 0).getDate()
  const cells = []
  for (let i = firstDay - 1; i >= 0; i--) cells.push({ d: daysInPrev - i, cur: false })
  for (let d = 1; d <= daysInMonth; d++) cells.push({ d, cur: true })
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
      width: 300, backgroundColor: '#fff', border: '1px solid #e2e8f0',
      borderRadius: 14, boxShadow: '0 8px 32px rgba(0,0,0,0.14)', zIndex: 1000, overflow: 'hidden',
      fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
    }}>
      <div style={{ padding: '10px 14px', borderBottom: '1px solid #f1f5f9', backgroundColor: '#f8fafc', display: 'flex', gap: 14, fontSize: 11, color: '#64748b' }}>
        <span><DotIcon color="#3b82f6" /> S3 data available</span>
        <span><DotIcon color="#15803d" /> Already fetched</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px 8px' }}>
        <span style={{ fontSize: 15, fontWeight: 700, color: '#1e293b' }}>{MONTH_NAMES[month]} {year}</span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <button onClick={prevMonth} style={navBtnStyle}>▲</button>
          <button onClick={nextMonth} style={navBtnStyle}>▼</button>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', padding: '0 10px', marginBottom: 4 }}>
        {DAY_LABELS.map(d => <div key={d} style={{ textAlign: 'center', fontSize: 11, fontWeight: 600, color: '#94a3b8', padding: '2px 0' }}>{d}</div>)}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', padding: '0 10px 12px', gap: '2px 0' }}>
        {cells.map((cell, i) => {
          const dateStr   = cellDate(cell)
          const tooRecent = dateStr && dateStr > cutoff
          const hasData   = dateStr && availableSet.has(dateStr)
          const isFetched = dateStr && fetchedSet.has(dateStr)
          const disabled  = !cell.cur || tooRecent || !hasData
          return (
            <div
              key={i}
              onClick={() => { if (!disabled) { onPickDate(dateStr); onClose() } }}
              style={{ position: 'relative', textAlign: 'center', padding: '5px 0', cursor: disabled ? 'default' : 'pointer' }}
            >
              <span style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: 30, height: 30, borderRadius: '50%', fontSize: 13,
                fontWeight: isFetched ? 700 : 400,
                backgroundColor: 'transparent',
                color: tooRecent ? '#e2e8f0' : (!hasData && cell.cur) ? '#d1d5db' : cell.cur ? '#1e293b' : '#cbd5e1',
              }}>
                {cell.d}
              </span>
              {cell.cur && !tooRecent && (isFetched || hasData) && (
                <span style={{
                  position: 'absolute', bottom: 3, left: '50%', transform: 'translateX(-50%)',
                  width: 5, height: 5, borderRadius: '50%',
                  backgroundColor: isFetched ? '#15803d' : '#3b82f6',
                }} />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function DotIcon({ color }) {
  return <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', backgroundColor: color, marginRight: 4 }} />
}

// ---------------------------------------------------------------------------
// Main page — two views: date list → day leads
// ---------------------------------------------------------------------------
export default function HistoricalLeadsPage() {
  const [tz]                           = useState(() => detectTimezone())
  const [calOpen, setCalOpen]          = useState(false)

  // Available S3 days + fetched metadata
  const [availableDays, setAvailableDays] = useState([])   // [{date, fetched}]
  const [fetchedMeta, setFetchedMeta]     = useState([])   // [{date, count}]

  // Day-drill-down state
  const [drillDate, setDrillDate]      = useState(null)    // date string or null (list view)
  const [drillLeads, setDrillLeads]    = useState([])
  const [selectedLead, setSelectedLead]= useState(null)
  const [filter, setFilter]            = useState('all')

  // Loading / action states
  const [loadingDays, setLoadingDays]  = useState(true)
  const [loadingLeads, setLoadingLeads]= useState(false)
  const [fetching, setFetching]        = useState(null)    // date being fetched
  const [error, setError]              = useState(null)

  useEffect(() => { loadDays() }, [])

  async function loadDays() {
    setLoadingDays(true)
    try {
      const [avail, meta] = await Promise.all([getAvailableDays(), getFetchedDates()])
      setAvailableDays(avail)
      setFetchedMeta(meta)
    } catch (e) { setError(e.message) }
    finally { setLoadingDays(false) }
  }

  const availableSet = useMemo(() => new Set(availableDays.map(d => d.date)), [availableDays])
  const fetchedSet   = useMemo(() => new Set(availableDays.filter(d => d.fetched).map(d => d.date)), [availableDays])
  const fetchedMetaMap = useMemo(() => {
    const m = {}
    fetchedMeta.forEach(d => { m[d.date] = d.count })
    return m
  }, [fetchedMeta])

  // Fetch S3 data for a date (called when clicking a blue-dot date in calendar)
  async function handleFetch(date) {
    setFetching(date); setError(null)
    try {
      await fetchDate(date)
      await loadDays()
      openDrill(date)
    } catch (e) { setError(e.message) }
    finally { setFetching(null) }
  }

  // Open drill-down for an already-fetched date
  async function openDrill(date) {
    setDrillDate(date); setFilter('all'); setSelectedLead(null)
    setLoadingLeads(true)
    try {
      const data = await getLeadsForDate(date)
      setDrillLeads(data)
    } catch (e) { setError(e.message) }
    finally { setLoadingLeads(false) }
  }

  function closeDrill() { setDrillDate(null); setDrillLeads([]); setSelectedLead(null) }

  async function handleDeleteDate(date) {
    if (!confirm(`Remove cached history for ${date}? You can re-fetch from S3 any time.`)) return
    try {
      await deleteLeadsForDate(date)
      await loadDays()
      if (drillDate === date) closeDrill()
    } catch (e) { setError(e.message) }
  }

  async function handleDeleteAll() {
    if (!confirm('Delete ALL cached historical data? You can re-fetch from S3 any time.')) return
    try {
      await deleteAllHistory()
      await loadDays()
      closeDrill()
    } catch (e) { setError(e.message) }
  }

  // Handle calendar pick
  function handleCalPick(date) {
    if (fetchedSet.has(date)) {
      openDrill(date)
    } else {
      handleFetch(date)
    }
  }

  const filtered = useMemo(() => {
    if (filter === 'all') return drillLeads
    return drillLeads.filter(l => l.user_type === filter)
  }, [drillLeads, filter])

  function downloadCSV() {
    const headers = ['Name', 'Email', 'Type', 'Record Type', 'Original Date']
    const rows = filtered.map(l => [l.name || '', l.email || '', l.user_type || '', l.record_type || '', formatDate(l.original_created_at, tz)])
    const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `ebam-history-${drillDate}.csv`; a.click()
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 56px)', overflow: 'hidden' }}>
      <div style={{ flex: 1, overflow: 'auto', padding: '32px 24px' }}>
        <div style={{ maxWidth: selectedLead ? '100%' : '1100px', margin: '0 auto' }}>

          {error && (
            <div style={{ marginBottom: 16, padding: '10px 14px', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, fontSize: 13, color: '#dc2626' }}>
              {error}
              <button onClick={() => setError(null)} style={{ marginLeft: 8, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700 }}>✕</button>
            </div>
          )}

          {/* ── Header ─────────────────────────────────────────────────── */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 24 }}>
            <div>
              {drillDate ? (
                <>
                  <button onClick={closeDrill} style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', fontSize: 13, fontWeight: 500, padding: 0, marginBottom: 4 }}>
                    ← Back to history
                  </button>
                  <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1e3a5f', marginBottom: 4 }}>
                    Leads — {drillDate}
                  </h1>
                  <p style={{ color: '#64748b', fontSize: 14, margin: 0 }}>
                    {loadingLeads ? 'Loading…' : `${filtered.length} lead${filtered.length !== 1 ? 's' : ''}`}
                  </p>
                </>
              ) : (
                <>
                  <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1e3a5f', marginBottom: 4 }}>Historical Leads</h1>
                  <p style={{ color: '#64748b', fontSize: 14, margin: 0 }}>
                    {loadingDays ? 'Loading…' : `${fetchedMeta.length} day${fetchedMeta.length !== 1 ? 's' : ''} cached — use calendar to fetch more`}
                  </p>
                </>
              )}
            </div>

            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              {/* Type filter shown only in drill view */}
              {drillDate && !loadingLeads && drillLeads.length > 0 && (
                <div style={{ display: 'flex', border: '1.5px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
                  {['all', 'advisor', 'cpa'].map(f => (
                    <button key={f} onClick={() => setFilter(f)} style={{
                      padding: '7px 14px', border: 'none',
                      backgroundColor: filter === f ? '#1e3a5f' : '#fff',
                      color: filter === f ? '#fff' : '#64748b',
                      fontSize: 13, fontWeight: filter === f ? 600 : 400, cursor: 'pointer', textTransform: 'capitalize',
                    }}>
                      {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
                    </button>
                  ))}
                </div>
              )}

              {/* Calendar button */}
              <div style={{ position: 'relative' }}>
                <button
                  onClick={() => setCalOpen(v => !v)}
                  title="Pick a historical date"
                  style={{ backgroundColor: '#fff', border: '1.5px solid #e2e8f0', borderRadius: 8, padding: '7px 11px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, color: '#1e3a5f' }}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                  </svg>
                  <span style={{ fontSize: 12, fontWeight: 500 }}>Fetch date</span>
                </button>
                {calOpen && (
                  <HistoryCalendarPopup
                    tz={tz}
                    availableSet={availableSet}
                    fetchedSet={fetchedSet}
                    onPickDate={handleCalPick}
                    onClose={() => setCalOpen(false)}
                  />
                )}
              </div>

              {drillDate && drillLeads.length > 0 && (
                <button onClick={downloadCSV} style={{ backgroundColor: '#fff', border: '1.5px solid #e2e8f0', borderRadius: 8, padding: '7px 14px', fontSize: 13, color: '#1e3a5f', fontWeight: 600, cursor: 'pointer' }}>
                  Export CSV
                </button>
              )}

              {drillDate && (
                <button onClick={() => handleDeleteDate(drillDate)} style={{ backgroundColor: '#fff', border: '1.5px solid #fecaca', borderRadius: 8, padding: '7px 14px', fontSize: 13, color: '#dc2626', fontWeight: 600, cursor: 'pointer' }}>
                  Remove Day
                </button>
              )}

              {fetchedMeta.length > 0 && (
                <button onClick={handleDeleteAll} style={{ backgroundColor: '#fff', border: '1.5px solid #fecaca', borderRadius: 8, padding: '7px 14px', fontSize: 13, color: '#dc2626', fontWeight: 600, cursor: 'pointer' }}>
                  Delete All History
                </button>
              )}
            </div>
          </div>

          {/* ── Body ─────────────────────────────────────────────────────── */}
          {drillDate ? (
            /* Leads table for selected day */
            loadingLeads ? (
              <LoadingBox />
            ) : filtered.length === 0 ? (
              <EmptyBox text={`No leads found for ${drillDate}.`} />
            ) : (
              <LeadsTable leads={filtered} selectedLead={selectedLead} setSelectedLead={setSelectedLead} tz={tz} />
            )
          ) : (
            /* Date summary table */
            loadingDays ? (
              <LoadingBox />
            ) : fetchedMeta.length === 0 ? (
              <EmptyBox
                icon="📅"
                title="No cached historical data"
                text={'Click "Fetch date" and pick a day older than 30 days from the calendar to load lead data from S3.'}
              />
            ) : (
              <div style={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                      {['Date', 'Records', 'Fetched At'].map(h => (
                        <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {fetchedMeta.map((row, i) => (
                      <tr
                        key={row.date}
                        onClick={() => openDrill(row.date)}
                        style={{ borderBottom: '1px solid #f1f5f9', backgroundColor: i % 2 === 0 ? '#fff' : '#fafafa', cursor: 'pointer' }}
                      >
                        <td style={tdStyle}>
                          <span style={{ fontWeight: 600, color: '#1e3a5f' }}>{row.date}</span>
                        </td>
                        <td style={tdStyle}>
                          <span style={{ backgroundColor: '#dbeafe', color: '#1d4ed8', padding: '2px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600 }}>
                            {row.count} lead{row.count !== 1 ? 's' : ''}
                          </span>
                        </td>
                        <td style={{ ...tdStyle, color: '#64748b', fontSize: 12 }}>{formatDate(row.fetched_at, tz)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}
        </div>
      </div>

      {selectedLead && (
        <LeadDetail lead={selectedLead} onClose={() => setSelectedLead(null)} tz={tz} />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------
function LeadsTable({ leads, selectedLead, setSelectedLead, tz }) {
  return (
    <div style={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
            {['Name', 'Email', 'Type', 'Record', 'Original Date'].map(h => (
              <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {leads.map((lead, i) => (
            <tr
              key={lead.history_id}
              onClick={() => setSelectedLead(lead)}
              style={{
                borderBottom: '1px solid #f1f5f9',
                backgroundColor: selectedLead?.history_id === lead.history_id ? '#eff6ff' : i % 2 === 0 ? '#fff' : '#fafafa',
                cursor: 'pointer',
              }}
            >
              <td style={tdStyle}>{lead.name || <span style={{ color: '#94a3b8' }}>—</span>}</td>
              <td style={tdStyle}>{lead.email || <span style={{ color: '#94a3b8' }}>—</span>}</td>
              <td style={tdStyle}>
                {lead.user_type && (
                  <span style={{ backgroundColor: lead.user_type === 'advisor' ? '#dbeafe' : '#dcfce7', color: lead.user_type === 'advisor' ? '#1d4ed8' : '#15803d', padding: '2px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600, textTransform: 'capitalize' }}>
                    {lead.user_type}
                  </span>
                )}
              </td>
              <td style={tdStyle}><RecordTypeBadge type={lead.record_type} /></td>
              <td style={{ ...tdStyle, color: '#94a3b8', fontSize: 12 }}>{formatDate(lead.original_created_at, tz)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function RecordTypeBadge({ type }) {
  const map = {
    complete: { bg: '#dcfce7', fg: '#15803d', label: 'Complete' },
    partial:  { bg: '#fef9c3', fg: '#92400e', label: 'Partial'  },
    timeout:  { bg: '#f1f5f9', fg: '#475569', label: 'Timeout'  },
  }
  const { bg, fg, label } = map[type] || { bg: '#f1f5f9', fg: '#94a3b8', label: type || '—' }
  return <span style={{ backgroundColor: bg, color: fg, padding: '2px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600 }}>{label}</span>
}

function LeadDetail({ lead, onClose, tz }) {
  const messages  = lead.conversation || []
  const collected = lead.collected_data || {}

  return (
    <div style={{ width: 420, minWidth: 420, borderLeft: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', backgroundColor: '#fff', overflow: 'hidden' }}>
      <div style={{ padding: '20px 20px 16px', borderBottom: '1px solid #e2e8f0', flexShrink: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#1e293b' }}>{lead.name || 'Unknown'}</div>
            <div style={{ fontSize: 13, color: '#64748b', marginTop: 2 }}>{lead.email}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 18, lineHeight: 1, padding: '2px 4px' }}>✕</button>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
          {lead.user_type && (
            <Chip color={lead.user_type === 'advisor' ? 'blue' : 'green'}>
              {lead.user_type === 'advisor' ? '💼 Advisor' : '🧾 CPA'}
            </Chip>
          )}
          <RecordTypeBadge type={lead.record_type} />
        </div>
        {Object.keys(collected).length > 0 && (
          <div style={{ marginTop: 12, backgroundColor: '#f8fafc', borderRadius: 8, padding: '10px 12px' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Collected Data</div>
            {Object.entries(collected).map(([k, v]) => (
              <div key={k} style={{ display: 'flex', gap: 8, fontSize: 12, marginBottom: 3 }}>
                <span style={{ color: '#64748b', minWidth: 80, textTransform: 'capitalize' }}>{k.replace(/_/g, ' ')}:</span>
                <span style={{ color: '#1e293b', fontWeight: 500 }}>{String(v)}</span>
              </div>
            ))}
          </div>
        )}
        <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 8 }}>Original date: {formatDate(lead.original_created_at, tz)}</div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Conversation History</div>
        {messages.length === 0 ? (
          <div style={{ color: '#94a3b8', fontSize: 13, textAlign: 'center', paddingTop: 20 }}>No messages stored.</div>
        ) : (
          messages.map((msg, i) => {
            const isBot = msg.role === 'bot' || msg.role === 'assistant'
            const ts    = msg.created_at ? formatDate(msg.created_at, tz) : null
            return (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: isBot ? 'flex-start' : 'flex-end', gap: 2 }}>
                <div style={{ maxWidth: '85%', padding: '8px 12px', borderRadius: isBot ? '4px 12px 12px 12px' : '12px 4px 12px 12px', backgroundColor: isBot ? '#f1f5f9' : '#1e3a5f', color: isBot ? '#1e293b' : '#fff', fontSize: 13, lineHeight: 1.55 }}>
                  {isBot ? <span dangerouslySetInnerHTML={{ __html: renderMessageHtml(msg.content) }} /> : msg.content}
                </div>
                {ts && <div style={{ fontSize: 10, color: '#94a3b8' }}>{ts}</div>}
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

function LoadingBox() {
  return <div style={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 48, textAlign: 'center', color: '#94a3b8' }}>Loading…</div>
}

function EmptyBox({ icon, title, text }) {
  return (
    <div style={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 48, textAlign: 'center', color: '#94a3b8' }}>
      {icon && <div style={{ fontSize: 40, marginBottom: 12 }}>{icon}</div>}
      {title && <div style={{ fontSize: 15, fontWeight: 600, color: '#475569', marginBottom: 6 }}>{title}</div>}
      <div style={{ fontSize: 13 }}>{text}</div>
    </div>
  )
}

const tdStyle = { padding: '12px 16px', fontSize: 14, color: '#1e293b', verticalAlign: 'middle' }
