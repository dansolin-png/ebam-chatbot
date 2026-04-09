import { useState } from 'react'
import { renderMessageHtml } from '../utils/renderMessage.js'
import RichTextEditor from './RichTextEditor.jsx'
export { renderMessageHtml }

const TYPE_COLORS = {
  choice: { bg: '#dbeafe', text: '#1d4ed8', label: 'Choice' },
  input:  { bg: '#dcfce7', text: '#15803d', label: 'Input' },
  llm:    { bg: '#fef9c3', text: '#854d0e', label: 'AI / LLM' },
  end:    { bg: '#fce7f3', text: '#9d174d', label: 'End' },
}

const STATE_TYPES = ['choice', 'input', 'llm', 'end']

export default function FlowEditor({ flowJson, onChange }) {
  const [expandedId, setExpandedId] = useState(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [newStateId, setNewStateId] = useState('')
  const [newStateType, setNewStateType] = useState('choice')
  const [newStateError, setNewStateError] = useState('')

  const stateIds = Object.keys(flowJson)

  function updateState(stateId, updatedState) {
    onChange({ ...flowJson, [stateId]: updatedState })
  }

  function deleteState(stateId) {
    if (!confirm(`Delete state "${stateId}"? This may break transitions pointing to it.`)) return
    const updated = { ...flowJson }
    delete updated[stateId]
    onChange(updated)
  }

  function addState() {
    const id = newStateId.trim().toLowerCase().replace(/\s+/g, '_')
    if (!id) { setNewStateError('State ID is required'); return }
    if (flowJson[id]) { setNewStateError('State ID already exists'); return }

    const blank = {
      choice: { state_id: id, type: 'choice', message: '', options: [], transitions: {}, capture: '', fallback: 'handle_objection' },
      input:  { state_id: id, type: 'input',  message: '', capture: '', next: 'start', optional: false, fallback: 'handle_objection' },
      llm:    { state_id: id, type: 'llm',    prompt_template: '', next: 'start', fallback: 'start' },
      end:    { state_id: id, type: 'end',     message: '', user_type: 'advisor' },
    }[newStateType]

    onChange({ ...flowJson, [id]: blank })
    setNewStateId('')
    setNewStateType('choice')
    setNewStateError('')
    setShowAddForm(false)
    setExpandedId(id)
  }

  return (
    <div>
      {/* Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <span style={{ fontSize: '13px', color: '#64748b' }}>
          {stateIds.length} states in flow
        </span>
        <button style={s.addBtn} onClick={() => setShowAddForm(v => !v)}>
          {showAddForm ? '✕ Cancel' : '+ Add State'}
        </button>
      </div>

      {/* Add State Form */}
      {showAddForm && (
        <div style={s.addForm}>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div>
              <label style={s.label}>State ID</label>
              <input
                style={s.input}
                placeholder="e.g. ask_timeline"
                value={newStateId}
                onChange={e => { setNewStateId(e.target.value); setNewStateError('') }}
              />
            </div>
            <div>
              <label style={s.label}>Type</label>
              <select style={s.select} value={newStateType} onChange={e => setNewStateType(e.target.value)}>
                {STATE_TYPES.map(t => <option key={t} value={t}>{TYPE_COLORS[t].label}</option>)}
              </select>
            </div>
            <button style={s.saveBtn} onClick={addState}>Create State</button>
          </div>
          {newStateError && <div style={{ color: '#dc2626', fontSize: '12px', marginTop: '6px' }}>{newStateError}</div>}
        </div>
      )}

      {/* State Cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {stateIds.map(id => (
          <StateCard
            key={id}
            stateId={id}
            state={flowJson[id]}
            allStateIds={stateIds}
            isExpanded={expandedId === id}
            onToggle={() => setExpandedId(expandedId === id ? null : id)}
            onUpdate={updated => updateState(id, updated)}
            onDelete={() => deleteState(id)}
          />
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Single State Card
// ---------------------------------------------------------------------------
function StateCard({ stateId, state, allStateIds, isExpanded, onToggle, onUpdate, onDelete }) {
  const type = state.type || 'choice'
  const color = TYPE_COLORS[type] || TYPE_COLORS.choice

  return (
    <div style={{ ...s.card, borderLeft: `4px solid ${color.text}` }}>
      {/* Card Header — always visible */}
      <div style={s.cardHeader} onClick={onToggle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <code style={{ ...s.stateIdBadge, backgroundColor: color.text }}>{stateId}</code>
          <span style={{ ...s.typeBadge, backgroundColor: color.bg, color: color.text }}>
            {color.label}
          </span>
          {state.message && (
            <span style={s.messagePreview}>
              {state.message.length > 60 ? state.message.slice(0, 60) + '…' : state.message}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button
            style={s.deleteBtn}
            onClick={e => { e.stopPropagation(); onDelete() }}
            title="Delete state"
          >
            ✕
          </button>
          <span style={{ color: '#94a3b8', fontSize: '18px', lineHeight: 1 }}>
            {isExpanded ? '▲' : '▼'}
          </span>
        </div>
      </div>

      {/* Card Body — expanded editor */}
      {isExpanded && (
        <div style={s.cardBody}>
          {type === 'choice' && (
            <ChoiceEditor state={state} allStateIds={allStateIds} onUpdate={onUpdate} />
          )}
          {type === 'input' && (
            <InputEditor state={state} allStateIds={allStateIds} onUpdate={onUpdate} />
          )}
          {type === 'llm' && (
            <LLMEditor state={state} allStateIds={allStateIds} onUpdate={onUpdate} />
          )}
          {type === 'end' && (
            <EndEditor state={state} onUpdate={onUpdate} />
          )}

          {/* Type switcher */}
          <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #f1f5f9' }}>
            <label style={s.label}>Change State Type</label>
            <select
              style={{ ...s.select, width: '180px' }}
              value={type}
              onChange={e => onUpdate({ ...state, type: e.target.value })}
            >
              {STATE_TYPES.map(t => (
                <option key={t} value={t}>{TYPE_COLORS[t].label}</option>
              ))}
            </select>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Choice State Editor
// ---------------------------------------------------------------------------
const OPTION_MODES = [
  { value: 'transition', label: '→ Go to state',    color: '#1d4ed8', bg: '#dbeafe' },
  { value: 'llm',        label: '⚡ LLM call',       color: '#854d0e', bg: '#fef9c3' },
  { value: 'sub_choices',label: '⋮ Sub-choices',     color: '#15803d', bg: '#dcfce7' },
  { value: 'input',      label: '✏ Ask Input',       color: '#7c3aed', bg: '#ede9fe' },
  { value: 'static',     label: '💬 Custom Reply',   color: '#b45309', bg: '#fff7ed' },
]

function ChoiceEditor({ state, allStateIds, onUpdate }) {
  const options = state.options || []
  const transitions = state.transitions || {}
  const optionConfig = state.option_config || {}

  function setMessage(v) { onUpdate({ ...state, message: v }) }
  function setCapture(v) { onUpdate({ ...state, capture: v }) }
  function setFallback(v) { onUpdate({ ...state, fallback: v }) }

  function addOption() {
    onUpdate({ ...state, options: [...options, ''] })
  }

  function updateOption(idx, value) {
    const oldKey = options[idx]
    const newOptions = options.map((o, i) => i === idx ? value : o)
    const newTransitions = {}
    Object.entries(transitions).forEach(([k, v]) => {
      newTransitions[k === oldKey ? value : k] = v
    })
    const newOptionConfig = {}
    Object.entries(optionConfig).forEach(([k, v]) => {
      newOptionConfig[k === oldKey ? value : k] = v
    })
    onUpdate({ ...state, options: newOptions, transitions: newTransitions, option_config: newOptionConfig })
  }

  function removeOption(idx) {
    const removed = options[idx]
    const newOptions = options.filter((_, i) => i !== idx)
    const newTransitions = { ...transitions }
    const newOptionConfig = { ...optionConfig }
    delete newTransitions[removed]
    delete newOptionConfig[removed]
    onUpdate({ ...state, options: newOptions, transitions: newTransitions, option_config: newOptionConfig })
  }

  function setTransition(optionText, nextStateId) {
    onUpdate({ ...state, transitions: { ...transitions, [optionText]: nextStateId } })
  }

  function setOptCfg(optionText, patch) {
    const current = optionConfig[optionText] || {}
    onUpdate({
      ...state,
      option_config: { ...optionConfig, [optionText]: { ...current, ...patch } }
    })
  }

  function setSubOption(optionText, subIdx, value) {
    const cfg = optionConfig[optionText] || {}
    const subOptions = [...(cfg.sub_options || [])]
    const oldKey = subOptions[subIdx]
    subOptions[subIdx] = value
    const newSubTransitions = {}
    Object.entries(cfg.sub_transitions || {}).forEach(([k, v]) => {
      newSubTransitions[k === oldKey ? value : k] = v
    })
    setOptCfg(optionText, { sub_options: subOptions, sub_transitions: newSubTransitions })
  }

  function addSubOption(optionText) {
    const cfg = optionConfig[optionText] || {}
    setOptCfg(optionText, { sub_options: [...(cfg.sub_options || []), ''] })
  }

  function removeSubOption(optionText, subIdx) {
    const cfg = optionConfig[optionText] || {}
    const removed = (cfg.sub_options || [])[subIdx]
    const subOptions = (cfg.sub_options || []).filter((_, i) => i !== subIdx)
    const newSubTransitions = { ...(cfg.sub_transitions || {}) }
    delete newSubTransitions[removed]
    setOptCfg(optionText, { sub_options: subOptions, sub_transitions: newSubTransitions })
  }

  function setSubTransition(optionText, subOpt, nextStateId) {
    const cfg = optionConfig[optionText] || {}
    setOptCfg(optionText, { sub_transitions: { ...(cfg.sub_transitions || {}), [subOpt]: nextStateId } })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <Field label="Bot Message">
        <RichTextEditor value={state.message || ''} onChange={setMessage} minHeight={72} />
      </Field>

      <Field label="Capture Field (optional)" hint="Variable name to store user's choice e.g. 'concern'">
        <input style={s.input} value={state.capture || ''} onChange={e => setCapture(e.target.value)} placeholder="e.g. concern" />
      </Field>

      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <label style={s.label}>Options & Transitions</label>
          <button style={s.addOptionBtn} onClick={addOption}>+ Add Option</button>
        </div>

        {options.length === 0 && (
          <div style={s.emptyHint}>No options yet. Click "Add Option" to add choices.</div>
        )}

        {options.map((opt, idx) => {
          const cfg = optionConfig[opt] || {}
          const mode = cfg.mode || 'transition'
          const modeInfo = OPTION_MODES.find(m => m.value === mode) || OPTION_MODES[0]

          return (
            <div key={idx} style={{ ...s.optionRow, flexDirection: 'column', alignItems: 'stretch', gap: '8px' }}>
              {/* Main row */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={s.optionIndex}>{idx + 1}</span>
                <input
                  style={{ ...s.input, flex: 1 }}
                  value={opt}
                  onChange={e => updateOption(idx, e.target.value)}
                  placeholder="Option text"
                />
                {/* Mode selector */}
                <select
                  style={{ ...s.select, width: 'auto', minWidth: '130px', backgroundColor: modeInfo.bg, color: modeInfo.color, fontWeight: 600, fontSize: '12px', border: `1px solid ${modeInfo.color}40` }}
                  value={mode}
                  onChange={e => setOptCfg(opt, { mode: e.target.value })}
                >
                  {OPTION_MODES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
                <button style={s.removeBtn} onClick={() => removeOption(idx)}>✕</button>
              </div>

              {/* Transition mode */}
              {mode === 'transition' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingLeft: '30px' }}>
                  <span style={{ color: '#94a3b8', fontSize: '13px' }}>Go to →</span>
                  <select
                    style={{ ...s.select, flex: 1 }}
                    value={transitions[opt] || ''}
                    onChange={e => setTransition(opt, e.target.value)}
                  >
                    <option value="">— select next state —</option>
                    {allStateIds.map(id => <option key={id} value={id}>{id}</option>)}
                  </select>
                </div>
              )}

              {/* LLM mode */}
              {mode === 'llm' && (
                <div style={{ ...s.llmPanel }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: '#854d0e', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '10px' }}>
                    ⚡ LLM call when "{opt || 'this option'}" is selected
                  </div>

                  <Field label="Prompt Template" hint="Leave empty to use the audience default prompt. Use {{input}}, {{name}}, {{email}} etc.">
                    <textarea
                      style={{ ...s.textarea, fontFamily: 'monospace', fontSize: '12px' }}
                      rows={3}
                      placeholder="Leave empty to use default prompt, or enter a custom instruction here."
                      value={cfg.llm_prompt || ''}
                      onChange={e => setOptCfg(opt, { llm_prompt: e.target.value })}
                    />
                  </Field>

                  <div style={{ marginTop: '10px' }}>
                    <Field label="After LLM response → go to state">
                      <StateSelect
                        value={cfg.next || transitions[opt] || ''}
                        allStateIds={allStateIds}
                        onChange={v => setOptCfg(opt, { next: v })}
                      />
                    </Field>
                  </div>
                </div>
              )}

              {/* Ask Input mode */}
              {mode === 'input' && (
                <div style={{ ...s.llmPanel, borderColor: '#c4b5fd', backgroundColor: '#faf5ff' }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: '#7c3aed', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
                    ✏ Ask for input when "{opt || 'this option'}" is selected
                  </div>
                  <Field label="Question to ask" hint="What should the bot ask the user after this selection?">
                    <input
                      style={s.input}
                      placeholder="e.g. Could you tell us a bit more about your goals?"
                      value={cfg.input_message || ''}
                      onChange={e => setOptCfg(opt, { input_message: e.target.value })}
                    />
                  </Field>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '10px' }}>
                    <Field label="Capture field" hint="Variable name to save the answer">
                      <input
                        style={s.input}
                        placeholder="e.g. goal_details"
                        value={cfg.capture || ''}
                        onChange={e => setOptCfg(opt, { capture: e.target.value })}
                      />
                    </Field>
                    <Field label="After input → go to state">
                      <StateSelect
                        value={cfg.next || transitions[opt] || ''}
                        allStateIds={allStateIds}
                        onChange={v => setOptCfg(opt, { next: v })}
                      />
                    </Field>
                  </div>
                </div>
              )}

              {/* Custom Reply mode */}
              {mode === 'static' && (
                <div style={{ ...s.llmPanel, borderColor: '#fed7aa', backgroundColor: '#fff7ed' }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: '#b45309', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
                    💬 Custom reply when "{opt || 'this option'}" is selected
                  </div>
                  <Field label="Reply Message" hint="This exact text will be sent to the user">
                    <textarea
                      style={{ ...s.textarea, fontFamily: 'inherit', fontSize: '13px' }}
                      rows={3}
                      placeholder="e.g. Thank you! A member of our team will reach out shortly."
                      value={cfg.static_message || ''}
                      onChange={e => setOptCfg(opt, { static_message: e.target.value })}
                    />
                  </Field>
                  <Field label="After reply → go to state">
                    <StateSelect
                      value={cfg.next || transitions[opt] || ''}
                      allStateIds={allStateIds}
                      onChange={v => setOptCfg(opt, { next: v })}
                    />
                  </Field>
                </div>
              )}

              {/* Sub-choices mode */}
              {mode === 'sub_choices' && (
                <div style={{ ...s.llmPanel, borderColor: '#bbf7d0', backgroundColor: '#f0fdf4' }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: '#15803d', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
                    ⋮ Sub-choices when "{opt || 'this option'}" is selected
                  </div>
                  <Field label="Sub-choices message">
                    <input
                      style={s.input}
                      placeholder="e.g. What is your investment range?"
                      value={cfg.sub_message || ''}
                      onChange={e => setOptCfg(opt, { sub_message: e.target.value })}
                    />
                  </Field>
                  <div style={{ marginTop: '10px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                      <label style={s.label}>Sub-options</label>
                      <button style={{ ...s.addOptionBtn, fontSize: '11px', padding: '3px 10px' }} onClick={() => addSubOption(opt)}>+ Add</button>
                    </div>
                    {(cfg.sub_options || []).length === 0 && (
                      <div style={s.emptyHint}>No sub-options yet.</div>
                    )}
                    {(cfg.sub_options || []).map((subOpt, si) => (
                      <div key={si} style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                        <span style={{ ...s.optionIndex, backgroundColor: '#bbf7d0', color: '#15803d' }}>{si + 1}</span>
                        <input
                          style={{ ...s.input, flex: 1 }}
                          value={subOpt}
                          placeholder="Sub-option text"
                          onChange={e => setSubOption(opt, si, e.target.value)}
                        />
                        <span style={{ color: '#94a3b8', fontSize: '14px' }}>→</span>
                        <select
                          style={{ ...s.select, flex: 1 }}
                          value={(cfg.sub_transitions || {})[subOpt] || ''}
                          onChange={e => setSubTransition(opt, subOpt, e.target.value)}
                        >
                          <option value="">— next state —</option>
                          {allStateIds.map(id => <option key={id} value={id}>{id}</option>)}
                        </select>
                        <button style={s.removeBtn} onClick={() => removeSubOption(opt, si)}>✕</button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      <Field label="Fallback State" hint="Where to go if user types something unexpected">
        <StateSelect value={state.fallback || ''} allStateIds={allStateIds} onChange={setFallback} />
      </Field>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Input State Editor
// ---------------------------------------------------------------------------
function InputEditor({ state, allStateIds, onUpdate }) {
  const quickChoices = state.options || []

  function addChoice() {
    onUpdate({ ...state, options: [...quickChoices, ''] })
  }

  function updateChoice(idx, value) {
    onUpdate({ ...state, options: quickChoices.map((c, i) => i === idx ? value : c) })
  }

  function removeChoice(idx) {
    onUpdate({ ...state, options: quickChoices.filter((_, i) => i !== idx) })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <Field label="Bot Message">
        <RichTextEditor value={state.message || ''} onChange={v => onUpdate({ ...state, message: v })} minHeight={72} />
      </Field>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
        <Field label="Capture Field" hint="Variable name e.g. 'name', 'email'">
          <input style={s.input} value={state.capture || ''}
            placeholder="e.g. name"
            onChange={e => onUpdate({ ...state, capture: e.target.value })} />
        </Field>

        <Field label="Next State">
          <StateSelect value={state.next || ''} allStateIds={allStateIds}
            onChange={v => onUpdate({ ...state, next: v })} />
        </Field>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
        <Field label="Fallback State" hint="If user types something unexpected">
          <StateSelect value={state.fallback || ''} allStateIds={allStateIds}
            onChange={v => onUpdate({ ...state, fallback: v })} />
        </Field>

        <Field label="Optional Field" hint="If on, user can skip this question">
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px', cursor: 'pointer' }}>
            <input type="checkbox" checked={state.optional || false}
              onChange={e => onUpdate({ ...state, optional: e.target.checked })} />
            <span style={{ fontSize: '14px', color: '#475569' }}>Allow skipping</span>
          </label>
        </Field>
      </div>

      {/* Quick-reply choices — user can click OR type freely */}
      <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '14px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
          <div>
            <label style={s.label}>Quick-reply choices (optional)</label>
            <div style={s.hint}>Show clickable options alongside free-text input. User can pick one OR type their own answer.</div>
          </div>
          <button style={s.addOptionBtn} onClick={addChoice}>+ Add</button>
        </div>
        {quickChoices.length === 0 && (
          <div style={s.emptyHint}>No quick-reply choices. User types freely.</div>
        )}
        {quickChoices.map((choice, idx) => (
          <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
            <span style={s.optionIndex}>{idx + 1}</span>
            <input
              style={{ ...s.input, flex: 1 }}
              value={choice}
              placeholder="e.g. Not sure yet"
              onChange={e => updateChoice(idx, e.target.value)}
            />
            <button style={s.removeBtn} onClick={() => removeChoice(idx)}>✕</button>
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// LLM State Editor
// ---------------------------------------------------------------------------
function LLMEditor({ state, allStateIds, onUpdate }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <Field label="Prompt Template" hint="Leave empty to use message history. Use {{input}}, {{name}}, {{email}} etc.">
        <textarea style={{ ...s.textarea, fontFamily: 'monospace', fontSize: '12px' }}
          rows={4}
          placeholder="e.g. A user said: '{{input}}'. Respond warmly in 2–3 sentences."
          value={state.prompt_template || ''}
          onChange={e => onUpdate({ ...state, prompt_template: e.target.value })} />
      </Field>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
        <Field label="Next State" hint="State to return to after LLM responds">
          <StateSelect value={state.next || ''} allStateIds={allStateIds}
            onChange={v => onUpdate({ ...state, next: v })} />
        </Field>

        <Field label="Fallback State">
          <StateSelect value={state.fallback || ''} allStateIds={allStateIds}
            onChange={v => onUpdate({ ...state, fallback: v })} />
        </Field>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// End State Editor
// ---------------------------------------------------------------------------
function EndEditor({ state, onUpdate }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <Field label="Closing Message">
        <RichTextEditor value={state.message || ''} onChange={v => onUpdate({ ...state, message: v })} />
      </Field>

      <Field label="User Type" hint="Used to tag the lead in the database">
        <select style={{ ...s.select, width: '200px' }}
          value={state.user_type || 'advisor'}
          onChange={e => onUpdate({ ...state, user_type: e.target.value })}>
          <option value="advisor">Advisor (prospect)</option>
          <option value="cpa">CPA (partner)</option>
        </select>
      </Field>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------



function Field({ label, hint, children }) {
  return (
    <div>
      <label style={s.label}>{label}</label>
      {hint && <div style={s.hint}>{hint}</div>}
      {children}
    </div>
  )
}

function StateSelect({ value, allStateIds, onChange }) {
  return (
    <select style={s.select} value={value} onChange={e => onChange(e.target.value)}>
      <option value="">— select state —</option>
      {allStateIds.map(id => <option key={id} value={id}>{id}</option>)}
    </select>
  )
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const s = {
  card: {
    backgroundColor: '#fff',
    border: '1px solid #e2e8f0',
    borderRadius: '10px',
    overflow: 'hidden',
    boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
  },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 16px',
    cursor: 'pointer',
    userSelect: 'none',
    backgroundColor: '#fafafa',
    borderBottom: '1px solid #f1f5f9',
  },
  cardBody: {
    padding: '20px',
  },
  stateIdBadge: {
    color: '#fff',
    padding: '2px 10px',
    borderRadius: '4px',
    fontSize: '12px',
    fontWeight: 600,
  },
  typeBadge: {
    padding: '2px 10px',
    borderRadius: '20px',
    fontSize: '11px',
    fontWeight: 600,
  },
  messagePreview: {
    color: '#94a3b8',
    fontSize: '13px',
    fontStyle: 'italic',
  },
  deleteBtn: {
    backgroundColor: 'transparent',
    border: '1px solid #fecaca',
    color: '#ef4444',
    borderRadius: '4px',
    padding: '2px 8px',
    fontSize: '12px',
    cursor: 'pointer',
  },
  addBtn: {
    backgroundColor: '#1e3a5f',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    padding: '7px 16px',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
  },
  addForm: {
    backgroundColor: '#f8fafc',
    border: '1.5px dashed #cbd5e1',
    borderRadius: '10px',
    padding: '16px',
    marginBottom: '16px',
  },
  label: {
    display: 'block',
    fontSize: '11px',
    fontWeight: 700,
    color: '#475569',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    marginBottom: '4px',
  },
  hint: {
    fontSize: '11px',
    color: '#94a3b8',
    marginBottom: '4px',
  },
  input: {
    border: '1.5px solid #e2e8f0',
    borderRadius: '7px',
    padding: '7px 10px',
    fontSize: '13px',
    outline: 'none',
    color: '#1e293b',
    backgroundColor: '#fff',
    width: '100%',
  },
  textarea: {
    border: '1.5px solid #e2e8f0',
    borderRadius: '7px',
    padding: '8px 10px',
    fontSize: '13px',
    outline: 'none',
    color: '#1e293b',
    backgroundColor: '#fff',
    width: '100%',
    resize: 'vertical',
    lineHeight: 1.5,
  },
  select: {
    border: '1.5px solid #e2e8f0',
    borderRadius: '7px',
    padding: '7px 10px',
    fontSize: '13px',
    outline: 'none',
    color: '#1e293b',
    backgroundColor: '#fff',
    width: '100%',
    cursor: 'pointer',
  },
  optionRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '8px',
    backgroundColor: '#f8fafc',
    padding: '8px',
    borderRadius: '7px',
    border: '1px solid #f1f5f9',
  },
  optionIndex: {
    backgroundColor: '#e2e8f0',
    color: '#64748b',
    borderRadius: '50%',
    width: '22px',
    height: '22px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '11px',
    fontWeight: 700,
    flexShrink: 0,
  },
  addOptionBtn: {
    backgroundColor: '#f0f9ff',
    color: '#0369a1',
    border: '1px solid #bae6fd',
    borderRadius: '6px',
    padding: '4px 12px',
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer',
  },
  removeBtn: {
    backgroundColor: 'transparent',
    border: 'none',
    color: '#94a3b8',
    cursor: 'pointer',
    fontSize: '14px',
    padding: '2px 6px',
    flexShrink: 0,
  },
  saveBtn: {
    backgroundColor: '#1e3a5f',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    padding: '8px 18px',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
  },
  emptyHint: {
    color: '#94a3b8',
    fontSize: '13px',
    fontStyle: 'italic',
    padding: '10px',
    textAlign: 'center',
    border: '1.5px dashed #e2e8f0',
    borderRadius: '7px',
  },
  llmPanel: {
    backgroundColor: '#fffbeb',
    border: '1.5px solid #fde68a',
    borderRadius: '8px',
    padding: '12px',
    marginLeft: '30px',
  },
  llmToggleBtn: {
    borderRadius: '6px',
    padding: '4px 10px',
    fontSize: '11px',
    fontWeight: 700,
    cursor: 'pointer',
    flexShrink: 0,
  },
}
