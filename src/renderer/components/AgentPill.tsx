import React from 'react'
import type { AgentState } from '../../shared/types'

const STATUS_COLORS: Record<string, string> = {
  idle: '#888',
  active: '#4caf50',
  working: '#ffc107',
  disconnected: '#f44336'
}

interface AgentPillProps {
  agent: AgentState
  onClick: () => void
}

export function AgentPill({ agent, onClick }: AgentPillProps): React.ReactElement {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        padding: '4px 12px',
        backgroundColor: '#2a2a2a',
        border: '1px solid #3a3a3a',
        borderRadius: '16px',
        color: '#ccc',
        cursor: 'pointer',
        fontSize: '12px',
        fontFamily: 'inherit'
      }}
    >
      <div style={{
        width: 8,
        height: 8,
        borderRadius: '50%',
        backgroundColor: STATUS_COLORS[agent.status] ?? '#888'
      }} />
      {agent.name}
      <span style={{ color: '#666', fontSize: '11px' }}>{agent.role}</span>
    </button>
  )
}
