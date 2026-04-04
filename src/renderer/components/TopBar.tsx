import React, { useState, useRef, useEffect } from 'react'
import { AgentPill } from './AgentPill'
import type { AgentState } from '../../shared/types'

interface TopBarProps {
  projectName: string | null
  onSwitchProject: () => void
  agents: AgentState[]
  onSpawnClick: () => void
  onAgentClick: (agentId: string) => void
  onClearContext: (agentId: string) => void
  onDisconnectAgent: (agentName: string) => void
  onKillAgent: (agentId: string) => void
  pinboardOpen: boolean
  onTogglePinboard: () => void
  infoOpen: boolean
  onToggleInfo: () => void
  buddyOpen: boolean
  onToggleBuddy: () => void
  filesOpen: boolean
  onToggleFiles: () => void
  racOpen: boolean
  onToggleRac: () => void
  usageOpen: boolean
  onToggleUsage: () => void
  onPresetsClick: () => void
  onBugReport: () => void
  onSettingsClick: () => void
  groups: Array<{ id: string; color: string; members: string[] }>
  onLinkDragStart: (agentName: string, e: React.MouseEvent) => void
  linkDraggingFrom: string | null
}

function DropdownMenu({ items, onClose, style }: {
  items: Array<{ label: string; onClick: () => void; color?: string; divider?: boolean }>
  onClose: () => void
  style?: React.CSSProperties
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  return (
    <div ref={ref} style={{
      position: 'absolute',
      top: '100%',
      left: 0,
      marginTop: '4px',
      backgroundColor: '#252525',
      border: '1px solid #444',
      borderRadius: '6px',
      padding: '4px 0',
      minWidth: '160px',
      zIndex: 100000,
      boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
      ...style
    }}>
      {items.map((item, i) => (
        <React.Fragment key={i}>
          {item.divider && <div style={{ height: '1px', backgroundColor: '#333', margin: '4px 0' }} />}
          <button
            onClick={() => { item.onClick(); onClose() }}
            style={{
              display: 'block',
              width: '100%',
              padding: '6px 14px',
              background: 'none',
              border: 'none',
              color: item.color || '#ccc',
              fontSize: '12px',
              cursor: 'pointer',
              textAlign: 'left',
            }}
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#333')}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            {item.label}
          </button>
        </React.Fragment>
      ))}
    </div>
  )
}

export function TopBar({
  projectName, onSwitchProject, agents, onSpawnClick, onAgentClick,
  onClearContext, onDisconnectAgent, onKillAgent,
  pinboardOpen, onTogglePinboard, infoOpen, onToggleInfo,
  buddyOpen, onToggleBuddy, filesOpen, onToggleFiles,
  racOpen, onToggleRac, usageOpen, onToggleUsage,
  onPresetsClick, onBugReport, onSettingsClick,
  groups, onLinkDragStart, linkDraggingFrom
}: TopBarProps): React.ReactElement {
  const [agentMenu, setAgentMenu] = useState<string | null>(null)
  const [panelMenu, setPanelMenu] = useState(false)

  const btnStyle: React.CSSProperties = {
    height: '28px',
    padding: '0 10px',
    borderRadius: '5px',
    border: '1px solid #444',
    backgroundColor: '#2a2a2a',
    color: '#999',
    fontSize: '12px',
    cursor: 'pointer',
    whiteSpace: 'nowrap'
  }

  const activePanelCount = [pinboardOpen, infoOpen, buddyOpen, filesOpen, racOpen, usageOpen].filter(Boolean).length

  return (
    <div style={{
      height: '44px',
      backgroundColor: '#1a1a1a',
      borderBottom: '1px solid #2a2a2a',
      display: 'flex',
      alignItems: 'center',
      padding: '0 12px',
      gap: '6px',
      flexShrink: 0
    }}>
      {/* Project name */}
      {projectName && (
        <button onClick={onSwitchProject} title="Switch Project" style={{
          ...btnStyle, border: '1px solid #333', backgroundColor: 'transparent', color: '#aaa',
          maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis'
        }}>
          {projectName}
        </button>
      )}
      {projectName && <div style={{ width: '1px', height: '24px', backgroundColor: '#333' }} />}

      {/* Spawn button */}
      <button onClick={onSpawnClick} style={{
        width: '30px', height: '30px', borderRadius: '6px', border: '1px solid #444',
        backgroundColor: '#2a2a2a', color: '#4caf50', fontSize: '18px', cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center'
      }}>+</button>

      <div style={{ width: '1px', height: '24px', backgroundColor: '#333' }} />

      {/* Agent pills -- scrollable if too many */}
      <div style={{ display: 'flex', gap: '4px', overflow: 'auto', flex: 1, alignItems: 'center' }}>
        {agents.map(agent => {
          const groupColor = groups.find(g => g.members.includes(agent.name))?.color
          return (
            <div key={agent.id} style={{ position: 'relative' }} data-agent-name={agent.name}>
              <AgentPill
                agent={agent}
                onClick={() => setAgentMenu(agentMenu === agent.id ? null : agent.id)}
                groupColor={groupColor}
                onLinkDragStart={(e) => onLinkDragStart(agent.name, e)}
                isLinkTarget={linkDraggingFrom !== null && linkDraggingFrom !== agent.name}
              />
              {agentMenu === agent.id && (
                <DropdownMenu
                  onClose={() => setAgentMenu(null)}
                  items={[
                    { label: 'Focus Window', onClick: () => onAgentClick(agent.id) },
                    { label: 'Clear Context', onClick: () => onClearContext(agent.id) },
                    { label: 'Disconnect Links', onClick: () => onDisconnectAgent(agent.name), divider: true },
                    { label: 'Kill Agent', onClick: () => onKillAgent(agent.id), color: '#f44336', divider: true },
                  ]}
                />
              )}
            </div>
          )
        })}
        {agents.length === 0 && (
          <span style={{ color: '#555', fontSize: '13px' }}>Click + to spawn an agent</span>
        )}
      </div>

      {/* Right side controls */}
      <div style={{ display: 'flex', gap: '4px', alignItems: 'center', flexShrink: 0 }}>
        {/* Panels dropdown */}
        <div style={{ position: 'relative' }}>
          <button onClick={() => setPanelMenu(!panelMenu)} style={{
            ...btnStyle,
            border: activePanelCount > 0 ? '1px solid #4a9eff' : '1px solid #444',
            color: activePanelCount > 0 ? '#8cc4ff' : '#999',
            backgroundColor: activePanelCount > 0 ? '#1e3a5f' : '#2a2a2a',
          }}>
            Panels {activePanelCount > 0 && `(${activePanelCount})`}
          </button>
          {panelMenu && (
            <DropdownMenu
              onClose={() => setPanelMenu(false)}
              style={{ right: 0, left: 'auto' }}
              items={[
                { label: `${filesOpen ? '\u25CF ' : '  '}Files`, onClick: onToggleFiles, color: filesOpen ? '#8cc4ff' : '#888' },
                { label: `${pinboardOpen ? '\u25CF ' : '  '}Pinboard`, onClick: onTogglePinboard, color: pinboardOpen ? '#8cc4ff' : '#888' },
                { label: `${infoOpen ? '\u25CF ' : '  '}Info Channel`, onClick: onToggleInfo, color: infoOpen ? '#8cc4ff' : '#888' },
                { label: `${buddyOpen ? '\u25CF ' : '  '}Buddy Room`, onClick: onToggleBuddy, color: buddyOpen ? '#8cc4ff' : '#888' },
                { label: `${usageOpen ? '\u25CF ' : '  '}Usage`, onClick: onToggleUsage, color: usageOpen ? '#8cc4ff' : '#888' },
                { label: `${racOpen ? '\u25CF ' : '  '}R.A.C.`, onClick: onToggleRac, color: racOpen ? '#8cc4ff' : '#888', divider: true },
              ]}
            />
          )}
        </div>

        <button onClick={onPresetsClick} style={btnStyle}>Presets</button>

        <div style={{ width: '1px', height: '24px', backgroundColor: '#333' }} />

        <button onClick={onBugReport} style={{ ...btnStyle, color: '#f44336', fontSize: '11px' }}>Bug?</button>
        <button onClick={onSettingsClick} style={{ ...btnStyle, color: '#888', fontSize: '14px' }}>{'\u2699'}</button>
      </div>
    </div>
  )
}
