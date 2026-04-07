import React, { useState, useEffect } from 'react'
import type { CreateScheduleInput, EditScheduleInput, ScheduledPrompt } from '../../shared/types'

export interface AgentOption {
  id: string
  name: string
  tabId: string
  tabName: string
}

interface Props {
  open: boolean
  mode: 'create' | 'edit'
  agents: AgentOption[]
  initialValues?: ScheduledPrompt
  onSubmit: (input: CreateScheduleInput | { id: string; updates: EditScheduleInput }) => void
  onClose: () => void
}

export function ScheduleDialog({ open, mode, agents, initialValues, onSubmit, onClose }: Props): React.ReactElement | null {
  const [name, setName] = useState('')
  const [agentId, setAgentId] = useState('')
  const [promptText, setPromptText] = useState('')
  const [intervalMinutes, setIntervalMinutes] = useState('45')
  const [infinite, setInfinite] = useState(false)
  const [durationHours, setDurationHours] = useState('8')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    if (initialValues) {
      setName(initialValues.name)
      setAgentId(initialValues.agentId)
      setPromptText(initialValues.promptText)
      setIntervalMinutes(String(initialValues.intervalMinutes))
      setInfinite(initialValues.durationHours === null)
      setDurationHours(initialValues.durationHours === null ? '8' : String(initialValues.durationHours))
    } else {
      setName('')
      setAgentId(agents[0]?.id ?? '')
      setPromptText('')
      setIntervalMinutes('45')
      setInfinite(false)
      setDurationHours('8')
    }
    setError(null)
  }, [open, initialValues, agents])

  if (!open) return null

  function submit() {
    setError(null)
    if (!agentId) { setError('Pick a target agent'); return }
    if (!promptText.trim()) { setError('Prompt text is required'); return }
    const interval = parseInt(intervalMinutes, 10)
    if (!Number.isInteger(interval) || interval <= 0) { setError('Interval must be a positive integer'); return }
    let duration: number | null = null
    if (!infinite) {
      duration = parseInt(durationHours, 10)
      if (!Number.isInteger(duration) || duration <= 0) { setError('Duration must be a positive integer'); return }
    }

    if (mode === 'edit' && initialValues) {
      onSubmit({
        id: initialValues.id,
        updates: {
          name: name.trim() || undefined,
          promptText: promptText.trim(),
          intervalMinutes: interval,
          durationHours: duration
        }
      })
    } else {
      const agent = agents.find(a => a.id === agentId)!
      onSubmit({
        tabId: agent.tabId,
        agentId: agent.id,
        name: name.trim() || undefined,
        promptText: promptText.trim(),
        intervalMinutes: interval,
        durationHours: duration
      })
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#1a1a1a', border: '1px solid #333', borderRadius: 6,
          padding: 20, width: 440, maxWidth: 'calc(100vw - 40px)',
          maxHeight: 'calc(100vh - 40px)', overflowY: 'auto',
          color: '#e0e0e0', display: 'flex',
          flexDirection: 'column', gap: 10
        }}
      >
        <h3 style={{ margin: 0, fontSize: 16 }}>
          {mode === 'create' ? 'New Scheduled Prompt' : 'Edit Scheduled Prompt'}
        </h3>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
          Name (optional)
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Keep orchestrator going"
            style={{ background: '#2a2a2a', border: '1px solid #333', color: '#e0e0e0', padding: 6, borderRadius: 4 }}
          />
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
          Target agent
          <select
            value={agentId}
            onChange={e => setAgentId(e.target.value)}
            disabled={mode === 'edit'}
            style={{ background: '#2a2a2a', border: '1px solid #333', color: '#e0e0e0', padding: 6, borderRadius: 4 }}
          >
            {agents.map(a => (
              <option key={a.id} value={a.id}>{a.name} ({a.tabName})</option>
            ))}
          </select>
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
          Prompt
          <textarea
            value={promptText}
            onChange={e => setPromptText(e.target.value)}
            rows={4}
            placeholder="You're good to keep going! Add more tasks and push progress forward."
            style={{ background: '#2a2a2a', border: '1px solid #333', color: '#e0e0e0', padding: 6, borderRadius: 4, resize: 'vertical', fontFamily: 'inherit' }}
          />
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
          Interval (minutes)
          <input
            type="number"
            min={1}
            value={intervalMinutes}
            onChange={e => setIntervalMinutes(e.target.value)}
            style={{ background: '#2a2a2a', border: '1px solid #333', color: '#e0e0e0', padding: 6, borderRadius: 4 }}
          />
        </label>

        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
          <input type="checkbox" checked={infinite} onChange={e => setInfinite(e.target.checked)} />
          Run indefinitely
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, opacity: infinite ? 0.4 : 1 }}>
          Duration (hours)
          <input
            type="number"
            min={1}
            value={durationHours}
            disabled={infinite}
            onChange={e => setDurationHours(e.target.value)}
            style={{ background: '#2a2a2a', border: '1px solid #333', color: '#e0e0e0', padding: 6, borderRadius: 4 }}
          />
        </label>

        {error && <div style={{ color: '#ef4444', fontSize: 12 }}>{error}</div>}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
          <button
            onClick={onClose}
            style={{ background: '#2a2a2a', color: '#e0e0e0', border: '1px solid #333', padding: '6px 14px', borderRadius: 4, cursor: 'pointer' }}
          >
            Cancel
          </button>
          <button
            onClick={submit}
            style={{ background: '#3b82f6', color: '#fff', border: 'none', padding: '6px 14px', borderRadius: 4, cursor: 'pointer' }}
          >
            {mode === 'create' ? 'Start' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
