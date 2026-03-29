import React, { useState, useEffect } from 'react'
import type { AgentConfig, AgentState, WorkspacePreset, WindowPosition, CanvasState } from '../../shared/types'
import type { WindowState } from '../hooks/useWindowManager'

interface PresetDialogProps {
  agents: AgentState[]
  windows: WindowState[]
  zoom: number
  pan: { x: number; y: number }
  onLoadAgents: (configs: Omit<AgentConfig, 'id'>[]) => void
  onClose: () => void
}

interface PresetInfo {
  name: string
  savedAt: string
}

type Tab = 'save' | 'load'

export function PresetDialog({ agents, windows, zoom, pan, onLoadAgents, onClose }: PresetDialogProps): React.ReactElement {
  const [activeTab, setActiveTab] = useState<Tab>('save')
  const [presetName, setPresetName] = useState('')
  const [presets, setPresets] = useState<PresetInfo[]>([])
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null)
  const [cwdOverride, setCwdOverride] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showCwdPrompt, setShowCwdPrompt] = useState(false)

  // Load presets list on mount and when tab changes to load
  useEffect(() => {
    if (activeTab === 'load') {
      loadPresetsList()
    }
  }, [activeTab])

  const loadPresetsList = async () => {
    try {
      setLoading(true)
      setError(null)
      const names = await window.electronAPI.listPresets()
      // Fetch details for each preset to get savedAt
      const presetInfos: PresetInfo[] = []
      for (const name of names) {
        try {
          const preset = await window.electronAPI.loadPreset(name)
          presetInfos.push({
            name,
            savedAt: preset.savedAt
          })
        } catch {
          // Skip corrupted presets
        }
      }
      setPresets(presetInfos.sort((a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime()))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load presets')
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    if (!presetName.trim()) return

    try {
      setLoading(true)
      setError(null)

      // Convert WindowState[] to WindowPosition[]
      const windowPositions: WindowPosition[] = windows.map(w => ({
        agentName: w.title,
        x: w.x,
        y: w.y,
        width: w.width,
        height: w.height
      }))

      const canvas: CanvasState = {
        zoom,
        panX: pan.x,
        panY: pan.y
      }

      // Convert AgentState[] to AgentConfig[] (remove status and createdAt)
      const agentConfigs: AgentConfig[] = agents.map(a => ({
        id: a.id,
        name: a.name,
        cli: a.cli,
        cwd: a.cwd,
        role: a.role,
        ceoNotes: a.ceoNotes,
        shell: a.shell,
        admin: a.admin,
        autoMode: a.autoMode,
        promptRegex: a.promptRegex
      }))

      await window.electronAPI.savePreset(presetName.trim(), agentConfigs, windowPositions, canvas)
      setPresetName('')
      setActiveTab('load')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save preset')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (name: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm(`Delete preset "${name}"?`)) return

    try {
      setLoading(true)
      await window.electronAPI.deletePreset(name)
      if (selectedPreset === name) setSelectedPreset(null)
      await loadPresetsList()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete preset')
    } finally {
      setLoading(false)
    }
  }

  const handleLoadClick = () => {
    if (!selectedPreset) return
    setShowCwdPrompt(true)
  }

  const handleConfirmLoad = async () => {
    if (!selectedPreset) return

    try {
      setLoading(true)
      setError(null)
      const preset = await window.electronAPI.loadPreset(selectedPreset)

      // Apply CWD override to all agents if specified
      const configs = preset.agents.map(agent => ({
        ...agent,
        cwd: cwdOverride.trim() || agent.cwd
      }))

      // Remove id from configs (onLoadAgents expects Omit<AgentConfig, 'id'>)
      const configsWithoutId = configs.map(({ id, ...rest }) => rest)

      onLoadAgents(configsWithoutId)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load preset')
    } finally {
      setLoading(false)
    }
  }

  const formatDate = (isoString: string) => {
    try {
      const date = new Date(isoString)
      return date.toLocaleString()
    } catch {
      return isoString
    }
  }

  const handleBrowseCwd = async () => {
    const dir = await window.electronAPI.browseDirectory(cwdOverride || '')
    if (dir) setCwdOverride(dir)
  }

  // CWD Override Prompt Modal
  if (showCwdPrompt) {
    return (
      <div style={overlayStyle}>
        <div style={{ ...modalStyle, width: '400px' }}>
          <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', color: '#e0e0e0' }}>
            Load Preset: {selectedPreset}
          </h3>
          <p style={{ color: '#aaa', fontSize: '13px', margin: '0 0 12px 0' }}>
            Working directory for all agents:
          </p>
          <div style={{ display: 'flex', gap: '4px', marginBottom: '16px' }}>
            <input
              value={cwdOverride}
              onChange={e => setCwdOverride(e.target.value)}
              placeholder="Leave empty to use original paths"
              style={{ ...inputStyle, flex: 1 }}
            />
            <button
              type="button"
              onClick={handleBrowseCwd}
              style={browseBtnStyle}
            >
              Browse
            </button>
          </div>
          {error && <div style={{ color: '#ff6b6b', fontSize: '12px', marginBottom: '12px' }}>{error}</div>}
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <button onClick={() => setShowCwdPrompt(false)} style={cancelBtnStyle}>
              Back
            </button>
            <button onClick={handleConfirmLoad} disabled={loading} style={loadBtnStyle}>
              Load
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={overlayStyle}>
      <div style={modalStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h2 style={{ margin: 0, fontSize: '16px', color: '#e0e0e0' }}>Workspace Presets</h2>
          <button onClick={onClose} style={closeBtnStyle}>×</button>
        </div>

        {/* Tabs */}
        <div style={tabsContainerStyle}>
          <button
            onClick={() => setActiveTab('save')}
            style={activeTab === 'save' ? activeTabStyle : tabStyle}
          >
            Save
          </button>
          <button
            onClick={() => setActiveTab('load')}
            style={activeTab === 'load' ? activeTabStyle : tabStyle}
          >
            Load
          </button>
        </div>

        {error && (
          <div style={{ color: '#ff6b6b', fontSize: '12px', marginBottom: '12px', padding: '8px', backgroundColor: '#3a1a1a', borderRadius: '4px' }}>
            {error}
          </div>
        )}

        {activeTab === 'save' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <label style={labelStyle}>
              Preset Name
              <input
                value={presetName}
                onChange={e => setPresetName(e.target.value)}
                placeholder="e.g., My Workspace"
                style={inputStyle}
              />
            </label>
            <div style={{ color: '#666', fontSize: '12px' }}>
              Saves {agents.length} agent{agents.length !== 1 ? 's' : ''} and {windows.length} window position{windows.length !== 1 ? 's' : ''}
            </div>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '8px' }}>
              <button onClick={onClose} style={cancelBtnStyle}>Cancel</button>
              <button
                onClick={handleSave}
                disabled={!presetName.trim() || loading}
                style={saveBtnStyle}
              >
                Save
              </button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {loading ? (
              <div style={{ color: '#666', textAlign: 'center', padding: '32px' }}>Loading presets...</div>
            ) : presets.length === 0 ? (
              <div style={{ color: '#666', textAlign: 'center', padding: '32px' }}>
                No presets saved yet
              </div>
            ) : (
              <div style={presetListStyle}>
                {presets.map(preset => (
                  <div
                    key={preset.name}
                    onClick={() => setSelectedPreset(preset.name)}
                    style={selectedPreset === preset.name ? selectedPresetItemStyle : presetItemStyle}
                  >
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '13px', color: '#e0e0e0', marginBottom: '2px' }}>{preset.name}</div>
                      <div style={{ fontSize: '11px', color: '#666' }}>{formatDate(preset.savedAt)}</div>
                    </div>
                    <button
                      onClick={e => handleDelete(preset.name, e)}
                      style={deleteBtnStyle}
                      title="Delete preset"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '8px' }}>
              <button onClick={onClose} style={cancelBtnStyle}>Cancel</button>
              <button
                onClick={handleLoadClick}
                disabled={!selectedPreset || loading}
                style={loadBtnStyle}
              >
                Load
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// Styles
const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: 'rgba(0,0,0,0.7)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 10000
}

const modalStyle: React.CSSProperties = {
  backgroundColor: '#1e1e1e',
  border: '1px solid #333',
  borderRadius: '8px',
  padding: '24px',
  width: '450px',
  display: 'flex',
  flexDirection: 'column'
}

const closeBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: '#666',
  fontSize: '24px',
  cursor: 'pointer',
  lineHeight: 1,
  padding: '0 4px'
}

const tabsContainerStyle: React.CSSProperties = {
  display: 'flex',
  gap: '4px',
  marginBottom: '16px',
  borderBottom: '1px solid #333',
  paddingBottom: '8px'
}

const tabStyle: React.CSSProperties = {
  flex: 1,
  padding: '8px 16px',
  backgroundColor: '#2a2a2a',
  border: '1px solid #444',
  borderRadius: '4px',
  color: '#aaa',
  cursor: 'pointer',
  fontSize: '13px'
}

const activeTabStyle: React.CSSProperties = {
  flex: 1,
  padding: '8px 16px',
  backgroundColor: '#3a3a3a',
  border: '1px solid #555',
  borderRadius: '4px',
  color: '#e0e0e0',
  cursor: 'pointer',
  fontSize: '13px',
  fontWeight: 'bold'
}

const labelStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
  fontSize: '12px',
  color: '#aaa'
}

const inputStyle: React.CSSProperties = {
  backgroundColor: '#2a2a2a',
  border: '1px solid #444',
  borderRadius: '4px',
  padding: '8px',
  color: '#e0e0e0',
  fontSize: '13px',
  fontFamily: 'inherit'
}

const presetListStyle: React.CSSProperties = {
  maxHeight: '240px',
  overflowY: 'auto',
  display: 'flex',
  flexDirection: 'column',
  gap: '4px'
}

const presetItemStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  padding: '10px 12px',
  backgroundColor: '#2a2a2a',
  border: '1px solid #333',
  borderRadius: '4px',
  cursor: 'pointer'
}

const selectedPresetItemStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  padding: '10px 12px',
  backgroundColor: '#2d4a3e',
  border: '1px solid #4caf50',
  borderRadius: '4px',
  cursor: 'pointer'
}

const deleteBtnStyle: React.CSSProperties = {
  width: '24px',
  height: '24px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: 'transparent',
  border: 'none',
  color: '#666',
  fontSize: '18px',
  cursor: 'pointer',
  borderRadius: '4px'
}

const cancelBtnStyle: React.CSSProperties = {
  padding: '8px 16px',
  backgroundColor: '#2a2a2a',
  border: '1px solid #444',
  borderRadius: '4px',
  color: '#aaa',
  cursor: 'pointer',
  fontSize: '13px'
}

const saveBtnStyle: React.CSSProperties = {
  padding: '8px 16px',
  backgroundColor: '#2d5a2d',
  border: '1px solid #4caf50',
  borderRadius: '4px',
  color: '#4caf50',
  cursor: 'pointer',
  fontSize: '13px'
}

const loadBtnStyle: React.CSSProperties = {
  padding: '8px 16px',
  backgroundColor: '#2a4a5a',
  border: '1px solid #4a9eff',
  borderRadius: '4px',
  color: '#4a9eff',
  cursor: 'pointer',
  fontSize: '13px'
}

const browseBtnStyle: React.CSSProperties = {
  padding: '8px 12px',
  backgroundColor: '#2a2a2a',
  border: '1px solid #444',
  borderRadius: '4px',
  color: '#aaa',
  cursor: 'pointer',
  fontSize: '12px',
  whiteSpace: 'nowrap'
}
