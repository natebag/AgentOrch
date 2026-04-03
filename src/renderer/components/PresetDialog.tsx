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

type Tab = 'save' | 'load' | 'templates'

interface PresetTemplate {
  name: string
  description: string
  agents: Omit<AgentConfig, 'id' | 'cwd'>[]
}

const BUILT_IN_TEMPLATES: PresetTemplate[] = [
  {
    name: 'Orchestrator + Workers',
    description: '1 orchestrator (Opus) directing 2 workers (Sonnet). Classic delegation pattern.',
    agents: [
      { name: 'orchestrator', cli: 'claude', role: 'orchestrator', ceoNotes: 'You are the lead. Break tasks into subtasks and delegate to workers. Synthesize their results. Use post_task() and send_message() to coordinate.', shell: 'powershell', admin: false, autoMode: true, model: 'opus' },
      { name: 'worker-1', cli: 'claude', role: 'worker', ceoNotes: 'You are a worker. Check read_tasks() and get_messages() for assignments. Complete tasks and report back to the orchestrator.', shell: 'powershell', admin: false, autoMode: true, model: 'sonnet' },
      { name: 'worker-2', cli: 'claude', role: 'worker', ceoNotes: 'You are a worker. Check read_tasks() and get_messages() for assignments. Complete tasks and report back to the orchestrator.', shell: 'powershell', admin: false, autoMode: true, model: 'sonnet' },
    ]
  },
  {
    name: 'Research Squad',
    description: '1 orchestrator + 3 researchers. Deep research with parallel information gathering.',
    agents: [
      { name: 'lead', cli: 'claude', role: 'orchestrator', ceoNotes: 'You coordinate a research team. Break research questions into sub-questions. Assign to researchers via post_task(). Synthesize findings posted to the info channel.', shell: 'powershell', admin: false, autoMode: true, model: 'opus' },
      { name: 'researcher-1', cli: 'claude', role: 'researcher', ceoNotes: 'You are a researcher. Check read_tasks() for research assignments. Post findings to post_info() with relevant tags. Be thorough and cite sources.', shell: 'powershell', admin: false, autoMode: true, model: 'sonnet' },
      { name: 'researcher-2', cli: 'claude', role: 'researcher', ceoNotes: 'You are a researcher. Check read_tasks() for research assignments. Post findings to post_info() with relevant tags. Be thorough and cite sources.', shell: 'powershell', admin: false, autoMode: true, model: 'sonnet' },
      { name: 'researcher-3', cli: 'claude', role: 'researcher', ceoNotes: 'You are a researcher. Check read_tasks() for research assignments. Post findings to post_info() with relevant tags. Be thorough and cite sources.', shell: 'powershell', admin: false, autoMode: true, model: 'haiku' },
    ]
  },
  {
    name: 'Code + Review',
    description: '1 coder + 1 reviewer. Continuous code review workflow.',
    agents: [
      { name: 'coder', cli: 'claude', role: 'worker', ceoNotes: 'You write code. After completing each change, send_message() to the reviewer with a summary of what changed and why. Wait for feedback before proceeding.', shell: 'powershell', admin: false, autoMode: true, model: 'sonnet' },
      { name: 'reviewer', cli: 'claude', role: 'reviewer', ceoNotes: 'You review code. When the coder messages you, use get_agent_output() to see their terminal, review the changes, and send_message() back with feedback. Be constructive but thorough.', shell: 'powershell', admin: false, autoMode: true, model: 'opus' },
    ]
  },
  {
    name: 'Multi-Model Team (OpenClaude)',
    description: 'Mixed providers: GPT-4o orchestrator, DeepSeek coder, Claude reviewer. Requires OpenClaude installed.',
    agents: [
      { name: 'lead', cli: 'openclaude', role: 'orchestrator', ceoNotes: 'You coordinate the team. Delegate coding tasks to the coder and review requests to the reviewer. Use post_task() and send_message().', shell: 'powershell', admin: false, autoMode: true, model: 'gpt-4o', providerUrl: 'https://api.openai.com/v1' },
      { name: 'coder', cli: 'openclaude', role: 'worker', ceoNotes: 'You implement code changes. Check read_tasks() for assignments. Post completed work summaries to the orchestrator.', shell: 'powershell', admin: false, autoMode: true, model: 'deepseek-chat', providerUrl: 'https://api.deepseek.com/v1' },
      { name: 'reviewer', cli: 'claude', role: 'reviewer', ceoNotes: 'You review code changes. When asked, use get_agent_output() to inspect work and send_message() back with feedback.', shell: 'powershell', admin: false, autoMode: true, model: 'sonnet' },
    ]
  },
  {
    name: 'Local-Only (Ollama)',
    description: 'All agents run locally via Ollama. No API keys needed. Requires OpenClaude + Ollama.',
    agents: [
      { name: 'orchestrator', cli: 'openclaude', role: 'orchestrator', ceoNotes: 'You coordinate local agents. Break tasks down and delegate. Use post_task() and send_message().', shell: 'powershell', admin: false, autoMode: true, model: 'llama3', providerUrl: 'http://localhost:11434/v1' },
      { name: 'worker-1', cli: 'openclaude', role: 'worker', ceoNotes: 'You are a worker. Check read_tasks() and get_messages() for assignments.', shell: 'powershell', admin: false, autoMode: true, model: 'llama3', providerUrl: 'http://localhost:11434/v1' },
    ]
  },
]

export function PresetDialog({ agents, windows, zoom, pan, onLoadAgents, onClose }: PresetDialogProps): React.ReactElement {
  const [activeTab, setActiveTab] = useState<Tab>('save')
  const [presetName, setPresetName] = useState('')
  const [presets, setPresets] = useState<PresetInfo[]>([])
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null)
  const [cwdOverride, setCwdOverride] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showCwdPrompt, setShowCwdPrompt] = useState(false)
  const [templateToLoad, setTemplateToLoad] = useState<PresetTemplate | null>(null)

  // Reset selection and load presets list when tab changes
  useEffect(() => {
    setSelectedPreset(null)
    setTemplateToLoad(null)
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
        promptRegex: a.promptRegex,
        model: a.model,
        experimental: a.experimental
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
    try {
      setLoading(true)
      setError(null)

      let configs: Omit<AgentConfig, 'id'>[]

      if (templateToLoad && activeTab === 'templates') {
        // Loading from built-in template
        configs = templateToLoad.agents.map(agent => ({
          ...agent,
          cwd: cwdOverride.trim() || ''
        }))
      } else if (selectedPreset) {
        // Loading from saved preset
        const preset = await window.electronAPI.loadPreset(selectedPreset)
        configs = preset.agents.map(({ id, ...rest }) => ({
          ...rest,
          cwd: cwdOverride.trim() || rest.cwd
        }))
      } else {
        return
      }

      onLoadAgents(configs)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load')
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
            {activeTab === 'templates' ? `Use Template: ${templateToLoad?.name}` : `Load Preset: ${selectedPreset}`}
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
          <button
            onClick={() => setActiveTab('templates')}
            style={activeTab === 'templates' ? activeTabStyle : tabStyle}
          >
            Templates
          </button>
        </div>

        {error && (
          <div style={{ color: '#ff6b6b', fontSize: '12px', marginBottom: '12px', padding: '8px', backgroundColor: '#3a1a1a', borderRadius: '4px' }}>
            {error}
          </div>
        )}

        {activeTab === 'save' && (
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
        )}

        {activeTab === 'load' && (
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

        {activeTab === 'templates' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {BUILT_IN_TEMPLATES.map(template => (
              <div
                key={template.name}
                onClick={() => {
                  setSelectedPreset(template.name)
                  setTemplateToLoad(template)
                }}
                style={selectedPreset === template.name && activeTab === 'templates' ? selectedPresetItemStyle : presetItemStyle}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '13px', color: '#e0e0e0', marginBottom: '2px' }}>{template.name}</div>
                  <div style={{ fontSize: '11px', color: '#666' }}>{template.description}</div>
                  <div style={{ fontSize: '11px', color: '#555', marginTop: '2px' }}>
                    {template.agents.length} agent{template.agents.length !== 1 ? 's' : ''}: {template.agents.map(a => a.name).join(', ')}
                  </div>
                </div>
              </div>
            ))}
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '8px' }}>
              <button onClick={onClose} style={cancelBtnStyle}>Cancel</button>
              <button
                onClick={() => {
                  if (templateToLoad) {
                    setShowCwdPrompt(true)
                  }
                }}
                disabled={!templateToLoad}
                style={loadBtnStyle}
              >
                Use Template
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
