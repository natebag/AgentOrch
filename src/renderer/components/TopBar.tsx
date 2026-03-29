import React from 'react'
import { AgentPill } from './AgentPill'
import type { AgentState } from '../../shared/types'

interface TopBarProps {
  agents: AgentState[]
  onSpawnClick: () => void
  onAgentClick: (agentId: string) => void
}

export function TopBar({ agents, onSpawnClick, onAgentClick }: TopBarProps): React.ReactElement {
  return (
    <div style={{
      height: '44px',
      backgroundColor: '#1a1a1a',
      borderBottom: '1px solid #2a2a2a',
      display: 'flex',
      alignItems: 'center',
      padding: '0 12px',
      gap: '8px',
      flexShrink: 0
    }}>
      <button
        onClick={onSpawnClick}
        style={{
          width: '32px',
          height: '32px',
          borderRadius: '6px',
          border: '1px solid #444',
          backgroundColor: '#2a2a2a',
          color: '#4caf50',
          fontSize: '18px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        +
      </button>
      <div style={{ width: '1px', height: '24px', backgroundColor: '#333', margin: '0 4px' }} />
      {agents.map(agent => (
        <AgentPill
          key={agent.id}
          agent={agent}
          onClick={() => onAgentClick(agent.id)}
        />
      ))}
      {agents.length === 0 && (
        <span style={{ color: '#555', fontSize: '13px' }}>Click + to spawn an agent</span>
      )}
    </div>
  )
}
