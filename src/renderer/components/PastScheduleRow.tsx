import React from 'react'
import type { ScheduledPrompt } from '../../shared/types'

interface Props {
  schedule: ScheduledPrompt
  agentName: string
  tabName: string
  onRestart: () => void
  onEdit: () => void
  onDelete: () => void
}

export function PastScheduleRow({ schedule, agentName, tabName, onRestart, onEdit, onDelete }: Props): React.ReactElement {
  const label = schedule.status === 'expired' ? '⏹ Expired' : '⏹ Stopped'
  const intervalDisplay = schedule.intervalMinutes >= 60 && schedule.intervalMinutes % 60 === 0
    ? `${schedule.intervalMinutes / 60}h`
    : `${schedule.intervalMinutes}min`

  return (
    <div style={{
      background: '#222', border: '1px solid #2a2a2a', borderRadius: 4,
      padding: 10, display: 'flex', flexDirection: 'column', gap: 4,
      opacity: 0.65
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ color: '#aaa', fontSize: 13, fontWeight: 600 }}>
          📅 {schedule.name}
        </span>
        <div style={{ display: 'flex', gap: 4 }}>
          <button onClick={onRestart} title="Restart" style={btnStyle}>▶</button>
          <button onClick={onEdit} title="Edit" style={btnStyle}>✏</button>
          <button onClick={onDelete} title="Delete" style={btnStyle}>🗑</button>
        </div>
      </div>

      <span style={{ color: '#888', fontSize: 11 }}>{label}</span>

      <span style={{ color: '#777', fontSize: 11 }}>
        → {agentName} ({tabName})
      </span>

      <span style={{ color: '#777', fontSize: 11 }}>
        Every {intervalDisplay} · {schedule.durationHours === null ? 'was infinite' : `ran ${schedule.durationHours}h`}
      </span>
    </div>
  )
}

const btnStyle: React.CSSProperties = {
  background: '#2a2a2a', color: '#ccc', border: '1px solid #333',
  width: 24, height: 24, borderRadius: 3, cursor: 'pointer', fontSize: 11
}
