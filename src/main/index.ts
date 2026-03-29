import { app, BrowserWindow, ipcMain } from 'electron'
import path from 'path'
import { createHubServer, type HubServer } from './hub/server'
import { spawnAgentPty, writeToPty, resizePty, killPty, type ManagedPty } from './shell/pty-manager'
import { writeAgentMcpConfig, cleanupConfig } from './mcp/config-writer'
import type { AgentConfig, AgentState } from '../shared/types'
import { IPC } from '../shared/types'

let hub: HubServer
let mainWindow: BrowserWindow
const agents = new Map<string, ManagedPty>()

function getMcpServerPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'mcp-server', 'index.js')
  }
  return path.join(__dirname, '../mcp-server/index.js')
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    backgroundColor: '#1a1a1a',
    title: 'AgentOrch',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  return win
}

function buildInitialPrompt(config: AgentConfig, allAgents: AgentState[]): string {
  const others = allAgents
    .filter(a => a.name !== config.name)
    .map(a => `  - ${a.name} (${a.cli}) — Role: ${a.role}`)
    .join('\n')

  return [
    `You are "${config.name}" with role "${config.role}".`,
    '',
    'CEO Notes:',
    config.ceoNotes || '(none)',
    '',
    'Other agents in this workspace:',
    others || '  (none yet)',
    '',
    'IMPORTANT: After completing each task, call the get_messages() MCP tool to check for new work from other agents.',
    ''
  ].join('\n')
}

function buildCliLaunchCommand(config: AgentConfig, mcpConfigPath: string): string {
  const cliBase = config.cli
  if (cliBase === 'claude') {
    return `claude --mcp-config "${mcpConfigPath}"\r`
  }
  if (cliBase === 'codex') {
    return `codex --mcp-config "${mcpConfigPath}"\r`
  }
  if (cliBase === 'kimi') {
    return `kimi --mcp-config "${mcpConfigPath}"\r`
  }
  return `${cliBase}\r`
}

function setupIPC(): void {
  ipcMain.handle(IPC.GET_HUB_INFO, () => ({
    port: hub.port,
    secret: hub.secret
  }))

  ipcMain.handle(IPC.GET_AGENTS, () => {
    return hub.registry.list()
  })

  ipcMain.handle(IPC.SPAWN_AGENT, (_event, config: AgentConfig) => {
    const mcpConfigPath = writeAgentMcpConfig({
      agentId: config.id,
      agentName: config.name,
      hubPort: hub.port,
      hubSecret: hub.secret,
      mcpServerPath: getMcpServerPath()
    })

    hub.registry.register(config)

    const managed = spawnAgentPty({
      config,
      mcpConfigPath,
      onData: (data) => {
        mainWindow.webContents.send(IPC.PTY_OUTPUT, config.id, data)
      },
      onExit: (exitCode) => {
        hub.registry.updateStatus(config.name, 'disconnected')
        mainWindow.webContents.send(IPC.PTY_EXIT, config.id, exitCode)
        mainWindow.webContents.send(IPC.AGENT_STATE_UPDATE, hub.registry.list())
        if (managed.mcpConfigPath) cleanupConfig(managed.mcpConfigPath)
      },
      onStatusChange: (status) => {
        hub.registry.updateStatus(config.name, status)
        mainWindow.webContents.send(IPC.AGENT_STATE_UPDATE, hub.registry.list())
      }
    })

    agents.set(config.id, managed)
    mainWindow.webContents.send(IPC.AGENT_STATE_UPDATE, hub.registry.list())

    // Launch agent CLI and inject initial prompt
    setTimeout(() => {
      const launchCmd = buildCliLaunchCommand(config, mcpConfigPath)
      writeToPty(managed, launchCmd)

      // After CLI starts, inject the initial prompt
      setTimeout(() => {
        const prompt = buildInitialPrompt(config, hub.registry.list())
        writeToPty(managed, prompt + '\r')
      }, 3000)
    }, 1000)

    return { id: config.id, mcpConfigPath }
  })

  ipcMain.handle(IPC.WRITE_TO_PTY, (_event, agentId: string, data: string) => {
    const managed = agents.get(agentId)
    if (managed) writeToPty(managed, data)
  })

  ipcMain.handle(IPC.KILL_AGENT, (_event, agentId: string) => {
    const managed = agents.get(agentId)
    if (managed) {
      killPty(managed)
      hub.registry.remove(managed.config.name)
      hub.messages.clearAgent(managed.config.name)
      if (managed.mcpConfigPath) cleanupConfig(managed.mcpConfigPath)
      agents.delete(agentId)
      mainWindow.webContents.send(IPC.AGENT_STATE_UPDATE, hub.registry.list())
    }
  })

  ipcMain.handle('pty:resize', (_event, agentId: string, cols: number, rows: number) => {
    const managed = agents.get(agentId)
    if (managed) resizePty(managed, cols, rows)
  })

  ipcMain.handle('app:cwd', () => process.cwd())
}

async function main(): Promise<void> {
  await app.whenReady()

  hub = await createHubServer()
  console.log(`Hub server running on port ${hub.port}`)

  setupIPC()
  mainWindow = createWindow()
}

main()

app.on('window-all-closed', () => {
  for (const [, managed] of agents) {
    killPty(managed)
    if (managed.mcpConfigPath) cleanupConfig(managed.mcpConfigPath)
  }
  agents.clear()
  hub?.close()
  app.quit()
})
