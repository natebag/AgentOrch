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
  groupColor?: string
  onLinkDragStart?: (e: React.MouseEvent) => void
  isLinkTarget?: boolean  // highlight when another pill is being dragged over
}

export function AgentPill({ agent, onClick, groupColor, onLinkDragStart, isLinkTarget }: AgentPillProps): React.ReactElement {
  return (
    <div
      style={{ display: 'flex', alignItems: 'center', gap: '2px' }}
      data-agent-name={agent.name}
    >
      <button
        onClick={onClick}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '4px 12px',
          backgroundColor: isLinkTarget ? '#2d3a4d' : '#2a2a2a',
          border: isLinkTarget ? '1px solid #4a9eff' : groupColor ? `1px solid ${groupColor}` : '1px solid #3a3a3a',
          borderRadius: '16px',
          color: '#ccc',
          cursor: 'pointer',
          fontSize: '12px',
          fontFamily: 'inherit',
          transition: 'border-color 0.15s, background-color 0.15s',
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
      {onLinkDragStart && (
        <div
          onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); onLinkDragStart(e) }}
          title="Drag to another agent to create a link"
          style={{
            width: 10,
            height: 10,
            borderRadius: '50%',
            backgroundColor: groupColor || '#555',
            border: '2px solid #333',
            cursor: 'crosshair',
            flexShrink: 0,
            transition: 'transform 0.15s',
          }}
          onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.4)')}
          onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
        />
      )}
    </div>
  )
}
