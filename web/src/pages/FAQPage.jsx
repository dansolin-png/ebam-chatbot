import { useState } from 'react'

const sections = [
  {
    title: 'Chat Demo',
    icon: '💬',
    description: 'A live preview of the chat widget as it appears on a client\'s website. Use this to test widget behavior before deploying it to real client sites.',
    items: [
      {
        q: 'What is the Chat Demo page?',
        a: 'It simulates a client-facing marketing page with the EBAM chat widget embedded in the bottom-right corner. Everything you see here—the widget behavior, greeting, and conversation flow—reflects the current live configuration.',
      },
      {
        q: 'What can I do here?',
        a: 'Interact with the widget exactly as a visitor would. Select an audience type (Financial Advisor or CPA), follow the conversation flow, and see how leads are captured. This is useful for QA after making config changes.',
      },
      {
        q: 'Does interacting here create real leads?',
        a: 'Yes. Any session that completes the capture step will create a real lead record. Use a test email address if you want to avoid polluting lead data.',
      },
    ],
  },
  {
    title: 'Flow Editor',
    icon: '⚙️',
    description: 'The central configuration panel for the chatbot. Controls the greeting message, allowed origins, per-audience prompts, and the conversation flow graph for each audience type.',
    items: [
      {
        q: 'What is the Flow Editor?',
        a: 'It\'s the admin control center for chatbot behavior. You can configure what the widget says, how it behaves per audience, and which websites are allowed to embed it.',
      },
      {
        q: 'What is "Allowed Origins"?',
        a: 'A list of domains permitted to embed the chat widget via CORS (one domain per line). Use * to allow all origins, or list specific domains like https://example.com. The widget will be blocked on any domain not listed here. Rate limit is 20 messages/minute per IP.',
      },
      {
        q: 'What is the Greeting Message?',
        a: 'The first message visitors see before selecting their audience type (Financial Advisor or CPA). Supports rich text formatting via the built-in editor.',
      },
      {
        q: 'What are per-audience sections?',
        a: 'Each audience (Financial Advisor, CPA) has its own Default LLM Prompt and conversation flow. The Default LLM Prompt is the AI instruction used when a node in the flow selects "Use default prompt." The conversation flow is a visual graph defining the step-by-step chat experience.',
      },
      {
        q: 'What does "Save All" do?',
        a: 'Persists all changes: the chatbot config (origins, greeting, prompts) and both audience flows in a single operation.',
      },
      {
        q: 'What does "Reset All" do?',
        a: 'Reverts the chatbot config and both flows to factory defaults. This cannot be undone—a confirmation dialog will appear before proceeding.',
      },
      {
        q: 'How do I edit the conversation flow?',
        a: 'Click on an audience section to expand it and reveal the Flow Editor. Nodes represent conversation steps; edges define the path between steps. You can add, edit, and connect nodes visually. Each node can have its own LLM prompt or use the audience-level default.',
      },
    ],
  },
  {
    title: 'Leads',
    icon: '📋',
    description: 'View, filter, and manage leads captured in the last 30 days. Each lead includes conversation history and cryptographic verification status.',
    items: [
      {
        q: 'What is the Leads page?',
        a: 'A real-time list of every lead captured by the chat widget in the last 30 days, including their name, email, audience type, and capture timestamp.',
      },
      {
        q: 'How do I filter leads?',
        a: 'Use the Type filter (All / Advisor / CPA) or the calendar date picker to narrow results to a specific day. Both filters can be combined.',
      },
      {
        q: 'How do I view a lead\'s conversation?',
        a: 'Click any row to open a detail panel on the right. It shows the full chat transcript for that lead\'s session.',
      },
      {
        q: 'What does "Verify" do?',
        a: 'Runs a cryptographic integrity check on the lead\'s session record. The result shows four checks: data_hash, record_hash, merkle_proof, and kms_signature. Green = tamper-free and fully sealed. Orange = data integrity confirmed but the batch hasn\'t been sealed yet. Red = verification failed, possible tampering.',
      },
      {
        q: 'How do I export leads?',
        a: 'Click "Export CSV" to download the currently filtered lead list as a CSV file (Name, Email, Type, Date).',
      },
      {
        q: 'How do I delete a lead?',
        a: 'Open the lead detail panel and click the Delete button. A confirmation prompt will appear. Deletion is permanent.',
      },
      {
        q: 'Where are leads older than 30 days?',
        a: 'They are archived to S3 WORM storage and accessible via the History page.',
      },
    ],
  },
  {
    title: 'Compliance',
    icon: '🔒',
    description: 'Audit ledger for all chat session records. Records are cryptographically signed, Merkle-verified, and stored in S3 WORM storage. Use this page to seal batches and verify individual records.',
    items: [
      {
        q: 'What is the Compliance page?',
        a: 'A tamper-evident audit log. Every chat session generates a compliance record that is KMS-signed and can be Merkle-verified. This page lets you inspect those records and manage daily sealed batches.',
      },
      {
        q: 'What is a "batch"?',
        a: 'A batch is a daily group of compliance records that have been cryptographically sealed together using a Merkle tree. Once sealed, the batch root is KMS-signed and written to S3 WORM storage, making it tamper-evident.',
      },
      {
        q: 'What does "Seal Today\'s Batch" do?',
        a: 'Finalizes all unsealed records from today into a Merkle batch, signs the root with KMS, and writes it to S3 WORM. After sealing, records in that batch will show a green Merkle status. Run this at the end of each business day or as needed.',
      },
      {
        q: 'What does "Verify" do on a record?',
        a: 'Cryptographically verifies the record against its stored hash, Merkle proof, and KMS signature. Green = verified and sealed. Orange = data intact but batch not yet sealed. Red = verification failed.',
      },
      {
        q: 'What is the difference between the Records tab and the Batches tab?',
        a: 'Records shows individual session records with their Merkle status. Batches shows the sealed daily batches with their Merkle root, record count, and seal timestamp.',
      },
    ],
  },
  {
    title: 'History',
    icon: '🗂️',
    description: 'Archive viewer for leads older than 30 days. Data is fetched on demand from S3 WORM storage and cached locally for quick re-access.',
    items: [
      {
        q: 'What is the History page?',
        a: 'It provides access to leads older than 30 days, which have been archived to S3 WORM storage. Data is fetched on demand and cached locally.',
      },
      {
        q: 'How do I view historical leads?',
        a: 'Open the calendar picker. Dates with a blue dot have S3 data available to fetch. Dates with a green dot are already cached locally. Click a blue-dot date and press "Fetch" to download it, then "Open" to view the leads.',
      },
      {
        q: 'What is the difference between blue and green dots?',
        a: 'Blue = data exists in S3 but has not been downloaded to local cache yet. Green = data has already been fetched and is cached locally (faster to open, no S3 download needed).',
      },
      {
        q: 'Can I delete cached data?',
        a: 'Yes. Click "Delete Cached" on any green-dot date to remove the local cache. The data remains in S3 and can be re-fetched at any time.',
      },
      {
        q: 'Can I export or verify historical leads?',
        a: 'Yes. After opening a cached date, you can filter by type, export to CSV, click a lead to view conversation history, and run cryptographic verification—same as on the Leads page.',
      },
    ],
  },
  {
    title: 'Users',
    icon: '👤',
    description: 'Manage admin dashboard accounts. Only visible to users with the admin role. Use this page to create, update, and remove users who can access this dashboard.',
    items: [
      {
        q: 'Who can access the Users page?',
        a: 'Only accounts with the admin role. Non-admin users will see an "Access denied" message if they navigate to /users.',
      },
      {
        q: 'How do I create a new user?',
        a: 'Enter a username and password in the form at the top of the page, then click "Create User." The new user can immediately log in with those credentials.',
      },
      {
        q: 'How do I reset a user\'s password?',
        a: 'Click "Reset Password" next to the user\'s name. An inline form will appear. Enter the new password and click "Save."',
      },
      {
        q: 'How do I delete a user?',
        a: 'Click "Delete" next to the user. A confirmation prompt will appear. The built-in admin account cannot be deleted.',
      },
      {
        q: 'Can I change a user\'s role?',
        a: 'Role management is not available through the UI. Contact your system administrator to change a user\'s role.',
      },
    ],
  },
]

function AccordionItem({ q, a }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{
      borderBottom: '1px solid #e2e8f0',
    }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%',
          textAlign: 'left',
          background: 'none',
          border: 'none',
          padding: '14px 0',
          cursor: 'pointer',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
          color: '#1e293b',
          fontSize: 14,
          fontWeight: 500,
          lineHeight: 1.4,
        }}
      >
        <span>{q}</span>
        <span style={{
          flexShrink: 0,
          fontSize: 18,
          color: '#64748b',
          transform: open ? 'rotate(45deg)' : 'rotate(0deg)',
          transition: 'transform 0.2s',
          lineHeight: 1,
        }}>+</span>
      </button>
      {open && (
        <div style={{
          paddingBottom: 14,
          color: '#475569',
          fontSize: 13.5,
          lineHeight: 1.65,
        }}>
          {a}
        </div>
      )}
    </div>
  )
}

export default function FAQPage() {
  const [active, setActive] = useState(null)

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', padding: '40px 24px 80px' }}>
      <h1 style={{ fontSize: 26, fontWeight: 700, color: '#1e3a5f', marginBottom: 6 }}>Help &amp; FAQ</h1>
      <p style={{ color: '#64748b', fontSize: 14, marginBottom: 40 }}>
        Overview of each page in the EBAM admin dashboard — what it does, what you can configure, and how to use it.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {sections.map((section, i) => (
          <div
            key={section.title}
            style={{
              backgroundColor: '#fff',
              border: '1px solid #e2e8f0',
              borderRadius: 10,
              overflow: 'hidden',
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            }}
          >
            {/* Section header */}
            <button
              onClick={() => setActive(active === i ? null : i)}
              style={{
                width: '100%',
                textAlign: 'left',
                background: active === i ? '#f0f6ff' : '#fff',
                border: 'none',
                padding: '18px 24px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'flex-start',
                gap: 14,
                transition: 'background 0.15s',
              }}
            >
              <span style={{ fontSize: 22, flexShrink: 0, marginTop: 1 }}>{section.icon}</span>
              <div style={{ flex: 1 }}>
                <div style={{
                  fontSize: 15,
                  fontWeight: 600,
                  color: '#1e3a5f',
                  marginBottom: 4,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}>
                  <span>{section.title}</span>
                  <span style={{
                    fontSize: 18,
                    color: '#94a3b8',
                    transform: active === i ? 'rotate(180deg)' : 'rotate(0deg)',
                    transition: 'transform 0.2s',
                    lineHeight: 1,
                    marginLeft: 12,
                    flexShrink: 0,
                  }}>▾</span>
                </div>
                <div style={{ fontSize: 13, color: '#64748b', lineHeight: 1.5 }}>
                  {section.description}
                </div>
              </div>
            </button>

            {/* FAQ items */}
            {active === i && (
              <div style={{ padding: '0 24px 8px', borderTop: '1px solid #e2e8f0' }}>
                {section.items.map((item) => (
                  <AccordionItem key={item.q} q={item.q} a={item.a} />
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
