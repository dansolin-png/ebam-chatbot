import { useState, useEffect } from 'react'
import { getComplianceRecords, getComplianceBatches, verifyRecord, sealBatch } from '../api/compliance.js'

const NAVY = '#0d1b2a'
const GOLD = '#c9a84c'

export default function CompliancePage() {
  const [tab, setTab]         = useState('records')   // 'records' | 'batches'
  const [records, setRecords] = useState([])
  const [batches, setBatches] = useState([])
  const [loading, setLoading] = useState(true)
  const [verifying, setVerifying]   = useState(null)  // record_id being verified
  const [verifyResult, setVerifyResult] = useState(null)
  const [sealing, setSealing] = useState(false)
  const [sealMsg, setSealMsg] = useState('')

  useEffect(() => {
    Promise.all([getComplianceRecords(), getComplianceBatches()])
      .then(([r, b]) => { setRecords(r); setBatches(b) })
      .finally(() => setLoading(false))
  }, [])

  async function handleVerify(record_id) {
    setVerifying(record_id)
    setVerifyResult(null)
    try {
      const result = await verifyRecord(record_id)
      setVerifyResult(result)
    } finally {
      setVerifying(null)
    }
  }

  async function handleSealBatch() {
    const today = new Date().toISOString().slice(0, 10)
    if (!confirm(`Seal compliance batch for ${today}?`)) return
    setSealing(true)
    try {
      const res = await sealBatch(today)
      setSealMsg(res.message || 'Batch sealed')
      const [r, b] = await Promise.all([getComplianceRecords(), getComplianceBatches()])
      setRecords(r); setBatches(b)
    } catch { setSealMsg('Error sealing batch') }
    setSealing(false)
    setTimeout(() => setSealMsg(''), 4000)
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>Loading...</div>

  return (
    <div style={{ maxWidth: 1060, margin: '0 auto', padding: '0 24px 40px' }}>

      {/* Header */}
      <div style={{ position: 'sticky', top: 0, zIndex: 10, backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0', padding: '14px 0', marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 700, color: NAVY, margin: 0 }}>Compliance Ledger</h1>
          <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>S3 WORM · KMS Encrypted · Merkle Verified</div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {sealMsg && <span style={{ fontSize: 13, color: sealMsg.startsWith('Error') ? '#ef4444' : '#16a34a' }}>{sealMsg}</span>}
          <button style={st.btn} onClick={handleSealBatch} disabled={sealing}>
            {sealing ? 'Sealing…' : 'Seal Today\'s Batch'}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 20, borderBottom: '1px solid #e2e8f0' }}>
        {['records', 'batches'].map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '8px 20px', fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer',
            borderBottom: tab === t ? `2px solid ${NAVY}` : '2px solid transparent',
            color: tab === t ? NAVY : '#94a3b8', background: 'none', textTransform: 'capitalize',
          }}>{t}</button>
        ))}
      </div>

      {/* Verify result panel */}
      {verifyResult && (() => {
        const batchPending = verifyResult.detail === 'Batch not yet sealed — Merkle proof not available'
        const batchSkipped = (check) => batchPending && (check === 'merkle_proof' || check === 'kms_signature')
        // Verified = data checks pass; pending batch checks don't count as failure
        const coreValid = verifyResult.checks.data_hash && verifyResult.checks.record_hash
        const status = verifyResult.valid
          ? { label: '✓ Record Verified — Tamper-Free', color: '#16a34a' }
          : batchPending && coreValid
            ? { label: '✓ Data Integrity Confirmed — Batch Seal Pending', color: '#d97706' }
            : { label: '✗ Verification Failed — Possible Tampering', color: '#ef4444' }
        const borderColor = verifyResult.valid ? '#16a34a' : batchPending && coreValid ? '#d97706' : '#ef4444'
        return (
          <div style={{ ...st.card, marginBottom: 20, borderLeft: `4px solid ${borderColor}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: status.color, marginBottom: 6 }}>
                  {status.label}
                </div>
                <div style={{ fontSize: 12, color: '#64748b', marginBottom: 10 }}>{verifyResult.record_id}</div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  {Object.entries(verifyResult.checks).map(([check, ok]) => {
                    const skipped = batchSkipped(check)
                    return (
                      <span key={check} style={{ fontSize: 11, padding: '3px 10px', borderRadius: 20, fontWeight: 600,
                        backgroundColor: skipped ? '#fef9c3' : ok ? '#dcfce7' : '#fee2e2',
                        color: skipped ? '#854d0e' : ok ? '#166534' : '#991b1b' }}>
                        {skipped ? '⏳' : ok ? '✓' : '✗'} {check.replace(/_/g, ' ')}{skipped ? ' (pending)' : ''}
                      </span>
                    )
                  })}
                </div>
                {verifyResult.detail && <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 8 }}>{verifyResult.detail}</div>}
              </div>
              <button onClick={() => setVerifyResult(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 18 }}>✕</button>
            </div>
          </div>
        )
      })()}
      )}

      {/* Records tab */}
      {tab === 'records' && (
        <div style={st.card}>
          <div style={{ fontSize: 13, color: '#64748b', marginBottom: 12 }}>{records.length} compliance records</div>
          {records.length === 0
            ? <div style={{ textAlign: 'center', color: '#94a3b8', padding: 40 }}>No compliance records yet. Records are created when leads are captured.</div>
            : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                    {['Record ID', 'Batch (Date)', 'Timestamp', 'S3 Key', 'Merkle', 'Verify'].map(h => (
                      <th key={h} style={{ textAlign: 'left', padding: '8px 12px', fontSize: 11, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {records.map(r => (
                    <tr key={r.record_id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '10px 12px', color: NAVY, fontFamily: 'monospace', fontSize: 11 }}>
                        {r.record_id.slice(0, 28)}…
                      </td>
                      <td style={{ padding: '10px 12px', color: '#475569' }}>{r.batch_id}</td>
                      <td style={{ padding: '10px 12px', color: '#64748b', fontSize: 11 }}>
                        {new Date(r.timestamp).toLocaleString()}
                      </td>
                      <td style={{ padding: '10px 12px', color: '#94a3b8', fontFamily: 'monospace', fontSize: 10 }}>
                        {r.s3_key}
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        {r.merkle_index >= 0
                          ? <span style={{ color: '#16a34a', fontSize: 11, fontWeight: 600 }}>✓ #{r.merkle_index}</span>
                          : <span style={{ color: '#f59e0b', fontSize: 11 }}>⏳ Pending</span>}
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <button
                          onClick={() => handleVerify(r.record_id)}
                          disabled={verifying === r.record_id}
                          style={st.verifyBtn}
                        >
                          {verifying === r.record_id ? '…' : 'Verify'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
        </div>
      )}

      {/* Batches tab */}
      {tab === 'batches' && (
        <div style={st.card}>
          <div style={{ fontSize: 13, color: '#64748b', marginBottom: 12 }}>{batches.length} sealed batches</div>
          {batches.length === 0
            ? <div style={{ textAlign: 'center', color: '#94a3b8', padding: 40 }}>No batches sealed yet.</div>
            : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                    {['Batch Date', 'Records', 'Merkle Root', 'Sealed At', 'Status'].map(h => (
                      <th key={h} style={{ textAlign: 'left', padding: '8px 12px', fontSize: 11, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {batches.map(b => (
                    <tr key={b.batch_id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '10px 12px', fontWeight: 700, color: NAVY }}>{b.batch_id}</td>
                      <td style={{ padding: '10px 12px', color: '#475569' }}>{b.record_count}</td>
                      <td style={{ padding: '10px 12px', fontFamily: 'monospace', fontSize: 10, color: '#64748b' }}>
                        {b.merkle_root?.slice(0, 20)}…
                      </td>
                      <td style={{ padding: '10px 12px', color: '#64748b', fontSize: 11 }}>
                        {new Date(b.created_at).toLocaleString()}
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 20, fontWeight: 600,
                          backgroundColor: '#dcfce7', color: '#166534' }}>
                          ✓ {b.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
        </div>
      )}
    </div>
  )
}

const st = {
  card:      { backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '18px 20px', overflowX: 'auto' },
  btn:       { backgroundColor: NAVY, color: '#fff', border: 'none', borderRadius: 8, padding: '8px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  verifyBtn: { backgroundColor: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0', borderRadius: 6, padding: '4px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' },
}
