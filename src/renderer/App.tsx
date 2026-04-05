import React, { useState, useCallback, useEffect } from 'react'
import { TopBar } from './components/TopBar'
import { Workspace } from './components/Workspace'
import { SpawnDialog } from './components/SpawnDialog'
import { PresetDialog } from './components/PresetDialog'
import { BugReportDialog } from './components/BugReportDialog'
import { SettingsDialog } from './components/SettingsDialog'
import { ProjectPickerDialog } from './components/ProjectPickerDialog'
import { useWindowManager } from './hooks/useWindowManager'
import { useAgents } from './hooks/useAgents'
import { UpdateNotice } from './components/UpdateNotice'
import { WhatsNewDialog } from './components/WhatsNewDialog'
import type { AgentConfig, AgentGroup, RecentProject, WindowPosition, CanvasState, WorkspaceTab } from '../shared/types'

declare const electronAPI: {
  getProject: () => Promise<RecentProject | null>
  onProjectChanged: (callback: (project: unknown) => void) => () => void
  [key: string]: any
}

const PINBOARD_ID = '__pinboard__'
const INFO_ID = '__info__'
const BUDDY_ID = '__buddy__'
const FILES_ID = '__files__'
const RAC_ID = '__rac__'
const USAGE_ID = '__usage__'
const GIT_ID = '__git__'

export function App(): React.ReactElement {
  const [tabs, setTabs] = useState<WorkspaceTab[]>([{ id: 'tab-default', name: 'Workspace 1' }])
  const [activeTabId, setActiveTabId] = useState('tab-default')
  const [showSpawnDialog, setShowSpawnDialog] = useState(false)
  const [showPresetDialog, setShowPresetDialog] = useState(false)
  const [showBugReport, setShowBugReport] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [project, setProject] = useState<RecentProject | null>(null)
  const [projectLoading, setProjectLoading] = useState(true)
  const [showProjectPicker, setShowProjectPicker] = useState(false)
  const [links, setLinks] = useState<Array<{ from: string; to: string }>>([])
  const [groups, setGroups] = useState<AgentGroup[]>([])
  const [linkDraggingFrom, setLinkDraggingFrom] = useState<string | null>(null)
  const {
    windows, zoom, pan,
    addWindow, addWindowAt, removeWindow, focusWindow, minimizeWindow,
    setZoom, setPan, updateWindowPosition, updateWindowSize, zoomToFit
  } = useWindowManager()
  const { agents, spawnAgent, killAgent, getStatusColor } = useAgents()

  const pinboardOpen = windows.some(w => w.id === PINBOARD_ID)
  const infoOpen = windows.some(w => w.id === INFO_ID)
  const buddyOpen = windows.some(w => w.id === BUDDY_ID)
  const filesOpen = windows.some(w => w.id === FILES_ID)
  const racOpen = windows.some(w => w.id === RAC_ID)
  const usageOpen = windows.some(w => w.id === USAGE_ID)
  const gitOpen = windows.some(w => w.id === GIT_ID)

  const handleSpawn = useCallback(async (config: Omit<AgentConfig, 'id'>) => {
    setShowSpawnDialog(false)
    const configWithTab = { ...config, tabId: activeTabId }
    const agentId = await spawnAgent(configWithTab)
    addWindow(agentId, `${config.name} (${config.cli})`, getStatusColor('idle'))
  }, [spawnAgent, addWindow, getStatusColor, activeTabId])

  const handleCreateTab = useCallback(async () => {
    const tab = await window.electronAPI.createTab()
    setTabs(prev => [...prev, tab])
    setActiveTabId(tab.id)
  }, [])

  const handleCloseTab = useCallback(async (tabId: string) => {
    if (tabs.length <= 1) return
    await window.electronAPI.closeTab(tabId)
    setTabs(prev => prev.filter(t => t.id !== tabId))
    if (activeTabId === tabId) {
      const remaining = tabs.filter(t => t.id !== tabId)
      setActiveTabId(remaining[0]?.id || 'tab-default')
    }
  }, [tabs, activeTabId])

  const handleRenameTab = useCallback(async (tabId: string, name: string) => {
    await window.electronAPI.renameTab(tabId, name)
    setTabs(prev => prev.map(t => t.id === tabId ? { ...t, name } : t))
  }, [])

  const handleSwitchTab = useCallback((tabId: string) => {
    setActiveTabId(tabId)
  }, [])

  const tabAgents = agents.filter(a => !a.tabId || a.tabId === activeTabId)

  const handleClose = useCallback(async (windowId: string) => {
    // Panel windows just get removed, no agent to kill
    if (windowId === PINBOARD_ID || windowId === INFO_ID || windowId === BUDDY_ID || windowId === FILES_ID || windowId === RAC_ID || windowId === USAGE_ID || windowId === GIT_ID) {
      removeWindow(windowId)
      return
    }
    // R.A.C. agents: release the rental instead of killing a PTY
    const agent = agents.find(a => a.id === windowId)
    if (agent && agent.name.startsWith('rac-')) {
      closedRacAgents.current.add(windowId)
      const sessions = await window.electronAPI.racGetSessions()
      const session = sessions.find((s: any) => s.agentorch_agent === agent.name)
      if (session) {
        await window.electronAPI.racRelease(session.session_id)
      }
      removeWindow(windowId)
      return
    }
    await killAgent(windowId)
    removeWindow(windowId)
  }, [killAgent, removeWindow, agents])

  const handleAgentPillClick = useCallback((agentId: string) => {
    focusWindow(agentId)
  }, [focusWindow])

  const handleClearContext = useCallback(async (agentId: string) => {
    await window.electronAPI.clearAgentContext(agentId)
  }, [])

  const togglePinboard = useCallback(() => {
    if (pinboardOpen) {
      removeWindow(PINBOARD_ID)
    } else {
      addWindow(PINBOARD_ID, 'Pinboard')
    }
  }, [pinboardOpen, addWindow, removeWindow])

  const toggleInfo = useCallback(() => {
    if (infoOpen) {
      removeWindow(INFO_ID)
    } else {
      addWindow(INFO_ID, 'Info Channel')
    }
  }, [infoOpen, addWindow, removeWindow])

  const toggleBuddy = useCallback(() => {
    if (buddyOpen) {
      removeWindow(BUDDY_ID)
    } else {
      addWindow(BUDDY_ID, 'Buddy Room')
    }
  }, [buddyOpen, addWindow, removeWindow])

  const toggleFiles = useCallback(() => {
    if (filesOpen) {
      removeWindow(FILES_ID)
    } else {
      addWindow(FILES_ID, 'Files')
    }
  }, [filesOpen, addWindow, removeWindow])

  const toggleRac = useCallback(() => {
    if (racOpen) {
      removeWindow(RAC_ID)
    } else {
      addWindow(RAC_ID, 'R.A.C.')
    }
  }, [racOpen, addWindow, removeWindow])

  const toggleUsage = useCallback(() => {
    if (usageOpen) {
      removeWindow(USAGE_ID)
    } else {
      addWindow(USAGE_ID, 'Usage')
    }
  }, [usageOpen, addWindow, removeWindow])

  const toggleGit = useCallback(() => {
    if (gitOpen) { removeWindow(GIT_ID) } else { addWindow(GIT_ID, 'Git') }
  }, [gitOpen, addWindow, removeWindow])

  // Load links & groups when project changes
  useEffect(() => {
    if (!project) return
    window.electronAPI.getLinks().then(setLinks)
    window.electronAPI.getGroups().then(setGroups)
  }, [project])

  const handleAddLink = useCallback(async (from: string, to: string) => {
    const result = await window.electronAPI.addLink(from, to)
    if (result.groups) {
      setGroups(result.groups)
      const newLinks = await window.electronAPI.getLinks()
      setLinks(newLinks)
    }
  }, [])

  const handleRemoveLink = useCallback(async (from: string, to: string) => {
    const result = await window.electronAPI.removeLink(from, to)
    if (result.groups) {
      setGroups(result.groups)
      const newLinks = await window.electronAPI.getLinks()
      setLinks(newLinks)
    }
  }, [])

  const handleDisconnectAgent = useCallback(async (agentName: string) => {
    const currentLinks = await window.electronAPI.getLinks()
    for (const link of currentLinks) {
      if (link.from === agentName || link.to === agentName) {
        await handleRemoveLink(link.from, link.to)
      }
    }
  }, [handleRemoveLink])

  const handleKillFromMenu = useCallback(async (agentId: string) => {
    await killAgent(agentId)
    removeWindow(agentId)
  }, [killAgent, removeWindow])

  const handleTopBarLinkDragStart = useCallback((agentName: string, e: React.MouseEvent) => {
    setLinkDraggingFrom(agentName)

    const handleUp = (ev: MouseEvent) => {
      setLinkDraggingFrom(null)
      // Find what agent pill we dropped on
      const target = document.elementFromPoint(ev.clientX, ev.clientY)
      const pillEl = target?.closest('[data-agent-name]') as HTMLElement | null
      if (pillEl) {
        const targetName = pillEl.getAttribute('data-agent-name')
        if (targetName && targetName !== agentName) {
          handleAddLink(agentName, targetName)
        }
      }
    }

    window.addEventListener('mouseup', handleUp, { once: true })
  }, [handleAddLink])

  // Keyboard shortcuts: Ctrl+1..9 to focus windows, Ctrl+Tab to cycle
  useEffect(() => {
    let currentFocusIdx = 0
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key >= '1' && e.key <= '9') {
        const idx = parseInt(e.key) - 1
        if (windows[idx]) {
          focusWindow(windows[idx].id)
          currentFocusIdx = idx
        }
        e.preventDefault()
      }
      if (e.ctrlKey && e.key === 'Tab') {
        if (windows.length > 0) {
          currentFocusIdx = (currentFocusIdx + 1) % windows.length
          focusWindow(windows[currentFocusIdx].id)
        }
        e.preventDefault()
      }
      // Ctrl+0 = reset zoom
      if (e.ctrlKey && e.key === '0' && !e.shiftKey) {
        setZoom(1.0)
        setPan(0, 0)
        e.preventDefault()
      }
      // Ctrl+Shift+0 = fit all
      if (e.ctrlKey && e.key === ')') {
        zoomToFit(window.innerWidth, window.innerHeight - 44)
        e.preventDefault()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [windows, focusWindow, setZoom, setPan, zoomToFit])

  useEffect(() => {
    electronAPI.getProject().then((p: RecentProject | null) => {
      setProject(p)
      setProjectLoading(false)
    })
    const unsub = electronAPI.onProjectChanged((p: unknown) => {
      setProject(p as RecentProject | null)
      setProjectLoading(false)
    })
    return unsub
  }, [])

  // Track R.A.C. agents we've manually closed/released so auto-create doesn't re-add them
  const closedRacAgents = React.useRef(new Set<string>())

  // Auto-create windows for R.A.C. agents (they register externally, not via SPAWN_AGENT)
  useEffect(() => {
    for (const agent of agents) {
      if (agent.name.startsWith('rac-') && !closedRacAgents.current.has(agent.id)) {
        const hasWindow = windows.some(w => w.id === agent.id)
        if (!hasWindow) {
          addWindow(agent.id, `${agent.name} (R.A.C.)`, '#4a9eff')
        }
      }
    }
  }, [agents, windows, addWindow])

  const handleProjectOpened = useCallback((p: RecentProject) => {
    setProject(p)
    setShowProjectPicker(false)
  }, [])

  return (
    <div style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      {projectLoading ? null : !project ? (
        <ProjectPickerDialog isFullScreen onProjectOpened={handleProjectOpened} />
      ) : (
        <>
          <TopBar
            projectName={project.name}
            onSwitchProject={() => setShowProjectPicker(true)}
            agents={tabAgents}
            onSpawnClick={() => setShowSpawnDialog(true)}
            onAgentClick={handleAgentPillClick}
            onClearContext={handleClearContext}
            onDisconnectAgent={handleDisconnectAgent}
            onKillAgent={handleKillFromMenu}
            pinboardOpen={pinboardOpen}
            onTogglePinboard={togglePinboard}
            infoOpen={infoOpen}
            onToggleInfo={toggleInfo}
            buddyOpen={buddyOpen}
            onToggleBuddy={toggleBuddy}
            filesOpen={filesOpen}
            onToggleFiles={toggleFiles}
            racOpen={racOpen}
            onToggleRac={toggleRac}
            usageOpen={usageOpen}
            onToggleUsage={toggleUsage}
            gitOpen={gitOpen}
            onToggleGit={toggleGit}
            onPresetsClick={() => setShowPresetDialog(true)}
            onBugReport={() => setShowBugReport(true)}
            onSettingsClick={() => setShowSettings(true)}
            groups={groups}
            onLinkDragStart={handleTopBarLinkDragStart}
            linkDraggingFrom={linkDraggingFrom}
            tabs={tabs}
            activeTabId={activeTabId}
            onSwitchTab={handleSwitchTab}
            onCreateTab={handleCreateTab}
            onCloseTab={handleCloseTab}
            onRenameTab={handleRenameTab}
          />
          <Workspace
            windows={windows}
            agents={tabAgents}
            zoom={zoom}
            pan={pan}
            links={links}
            groups={groups}
            onAddLink={handleAddLink}
            onRemoveLink={handleRemoveLink}
            onSetZoom={setZoom}
            onSetPan={setPan}
            onZoomToFit={zoomToFit}
            onFocusWindow={focusWindow}
            onMinimizeWindow={minimizeWindow}
            onCloseWindow={handleClose}
            onDragStop={updateWindowPosition}
            onResizeStop={(id, x, y, w, h) => {
              updateWindowPosition(id, x, y)
              updateWindowSize(id, w, h)
            }}
            activeTabId={activeTabId}
          />
          {showSpawnDialog && (
            <SpawnDialog
              onSpawn={handleSpawn}
              onCancel={() => setShowSpawnDialog(false)}
            />
          )}
          {showPresetDialog && (
            <PresetDialog
              agents={agents}
              windows={windows}
              zoom={zoom}
              pan={pan}
              onLoadPreset={(configs, savedWindows, savedCanvas) => {
                setShowPresetDialog(false)
                // Build a lookup of saved positions by window title
                const posMap = new Map<string, WindowPosition>()
                for (const wp of savedWindows) {
                  posMap.set(wp.agentName, wp)
                }
                // Restore canvas state
                if (savedCanvas) {
                  setZoom(savedCanvas.zoom)
                  setPan(savedCanvas.panX, savedCanvas.panY)
                }
                // Restore panel windows from saved positions
                const panelTitleToId: Record<string, string> = {
                  'Pinboard': PINBOARD_ID,
                  'Info Channel': INFO_ID,
                  'Buddy Room': BUDDY_ID,
                  'Files': FILES_ID,
                  'R.A.C.': RAC_ID,
                  'Usage': USAGE_ID,
                }
                for (const wp of savedWindows) {
                  const panelId = panelTitleToId[wp.agentName]
                  if (panelId) {
                    addWindowAt(panelId, wp.agentName, wp.x, wp.y, wp.width, wp.height)
                  }
                }
                // Spawn agents with saved positions, scoped to current tab
                configs.forEach(async (config) => {
                  const configWithTab = { ...config, tabId: activeTabId }
                  const agentId = await spawnAgent(configWithTab)
                  const title = `${config.name} (${config.cli})`
                  const pos = posMap.get(title)
                  if (pos) {
                    addWindowAt(agentId, title, pos.x, pos.y, pos.width, pos.height, getStatusColor('idle'))
                  } else {
                    addWindow(agentId, title, getStatusColor('idle'))
                  }
                })
              }}
              onClose={() => setShowPresetDialog(false)}
            />
          )}
          {showBugReport && (
            <BugReportDialog onClose={() => setShowBugReport(false)} />
          )}
          {showSettings && (
            <SettingsDialog onClose={() => setShowSettings(false)} />
          )}
          {showProjectPicker && (
            <ProjectPickerDialog
              isFullScreen={false}
              onProjectOpened={handleProjectOpened}
              onCancel={() => setShowProjectPicker(false)}
            />
          )}
          <UpdateNotice />
          <WhatsNewDialog />
        </>
      )}
    </div>
  )
}
