# Project-Based Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make AgentOrch project-aware — each project folder gets isolated state (DB, presets) and the app auto-opens the last used project on launch.

**Architecture:** New `ProjectManager` module owns project path resolution and recent-projects list. Main process refactored into `openProject()`/`closeProject()` functions. DB and preset paths derive from project path. Renderer gets a project picker dialog and TopBar shows current project name.

**Tech Stack:** Electron, TypeScript, React, better-sqlite3, vitest

**Spec:** `docs/superpowers/specs/2026-04-03-project-based-persistence-design.md`

---

### File Map

| Action | File | Responsibility |
|--------|------|---------------|
| Create | `src/main/project/project-manager.ts` | Project path resolution, recent projects CRUD, `.agentorch/` folder creation |
| Create | `tests/unit/project-manager.test.ts` | Unit tests for ProjectManager |
| Modify | `src/shared/types.ts` | Add `RecentProject` interface, project IPC channels |
| Modify | `src/main/db/database.ts` | Remove DELETE FROM statements |
| Modify | `src/main/presets/preset-manager.ts` | Accept injected base path instead of `app.getPath('userData')` |
| Modify | `tests/unit/preset-manager.test.ts` | Update for new preset-manager API |
| Modify | `src/main/index.ts` | Refactor into `openProject()`/`closeProject()`, add project IPC handlers |
| Modify | `src/preload/index.ts` | Expose project IPC channels to renderer |
| Create | `src/renderer/components/ProjectPickerDialog.tsx` | Project selection UI (recent list + open folder) |
| Modify | `src/renderer/components/TopBar.tsx` | Show project name + switch button |
| Modify | `src/renderer/App.tsx` | Integrate project state, show picker when no project |

---

### Task 1: Add Types and IPC Channels

**Files:**
- Modify: `src/shared/types.ts:59-76`

- [ ] **Step 1: Add RecentProject interface and project IPC channels**

In `src/shared/types.ts`, add the `RecentProject` interface after `InfoEntry` (after line 84):

```ts
export interface RecentProject {
  path: string
  name: string
  lastOpened: string
}
```

Add project IPC channels to the `IPC` const (after line 75, before the closing `} as const`):

```ts
  PROJECT_GET_CURRENT: 'project:get-current',
  PROJECT_SWITCH: 'project:switch',
  PROJECT_LIST_RECENT: 'project:list-recent',
  PROJECT_OPEN_FOLDER: 'project:open-folder',
  PROJECT_CHANGED: 'project:changed',
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`
Expected: Clean (no errors)

- [ ] **Step 3: Commit**

```bash
git add src/shared/types.ts
git commit -m "feat: add RecentProject type and project IPC channels"
```

---

### Task 2: Create ProjectManager Module (TDD)

**Files:**
- Create: `src/main/project/project-manager.ts`
- Create: `tests/unit/project-manager.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/project-manager.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { ProjectManager } from '../../src/main/project/project-manager'

describe('ProjectManager', () => {
  let tmpDir: string
  let projectDir: string
  let pm: ProjectManager

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-test-'))
    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'project-test-'))
    pm = new ProjectManager(tmpDir) // tmpDir acts as userData
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
    fs.rmSync(projectDir, { recursive: true, force: true })
  })

  describe('initProject', () => {
    it('creates .agentorch directory structure', () => {
      pm.initProject(projectDir)
      expect(fs.existsSync(path.join(projectDir, '.agentorch'))).toBe(true)
      expect(fs.existsSync(path.join(projectDir, '.agentorch', 'presets'))).toBe(true)
    })

    it('writes .gitignore in .agentorch/', () => {
      pm.initProject(projectDir)
      const gitignore = fs.readFileSync(
        path.join(projectDir, '.agentorch', '.gitignore'), 'utf-8'
      )
      expect(gitignore).toContain('agentorch.db')
      expect(gitignore).toContain('agentorch.db-wal')
      expect(gitignore).toContain('agentorch.db-shm')
    })

    it('does not overwrite existing .gitignore', () => {
      const agentorchDir = path.join(projectDir, '.agentorch')
      fs.mkdirSync(agentorchDir, { recursive: true })
      fs.writeFileSync(path.join(agentorchDir, '.gitignore'), 'custom content')

      pm.initProject(projectDir)
      const gitignore = fs.readFileSync(path.join(agentorchDir, '.gitignore'), 'utf-8')
      expect(gitignore).toBe('custom content')
    })

    it('sets current project', () => {
      pm.initProject(projectDir)
      expect(pm.currentProject).not.toBeNull()
      expect(pm.currentProject!.path).toBe(projectDir)
      expect(pm.currentProject!.name).toBe(path.basename(projectDir))
    })
  })

  describe('paths', () => {
    it('returns DB path inside .agentorch/', () => {
      pm.initProject(projectDir)
      expect(pm.dbPath).toBe(path.join(projectDir, '.agentorch', 'agentorch.db'))
    })

    it('returns presets dir inside .agentorch/', () => {
      pm.initProject(projectDir)
      expect(pm.presetsDir).toBe(path.join(projectDir, '.agentorch', 'presets'))
    })

    it('throws if no project is open', () => {
      expect(() => pm.dbPath).toThrow('No project open')
      expect(() => pm.presetsDir).toThrow('No project open')
    })
  })

  describe('recent projects', () => {
    it('returns empty list when no history', () => {
      expect(pm.listRecent()).toEqual([])
    })

    it('adds project to recent list on init', () => {
      pm.initProject(projectDir)
      const recent = pm.listRecent()
      expect(recent).toHaveLength(1)
      expect(recent[0].path).toBe(projectDir)
    })

    it('updates lastOpened when reopening same project', () => {
      pm.initProject(projectDir)
      const first = pm.listRecent()[0].lastOpened

      // Small delay to ensure different timestamp
      pm.initProject(projectDir)
      const second = pm.listRecent()[0].lastOpened
      expect(pm.listRecent()).toHaveLength(1) // no duplicate
      expect(second >= first).toBe(true)
    })

    it('returns most recent first', () => {
      const dir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'project2-'))
      pm.initProject(projectDir)
      pm.initProject(dir2)

      const recent = pm.listRecent()
      expect(recent[0].path).toBe(dir2)
      expect(recent[1].path).toBe(projectDir)

      fs.rmSync(dir2, { recursive: true, force: true })
    })

    it('caps at 20 entries', () => {
      for (let i = 0; i < 25; i++) {
        const d = fs.mkdtempSync(path.join(os.tmpdir(), `proj${i}-`))
        pm.initProject(d)
        fs.rmSync(d, { recursive: true, force: true })
      }
      expect(pm.listRecent().length).toBeLessThanOrEqual(20)
    })

    it('removes a project from recent list', () => {
      pm.initProject(projectDir)
      expect(pm.listRecent()).toHaveLength(1)

      pm.removeRecent(projectDir)
      expect(pm.listRecent()).toHaveLength(0)
    })

    it('getLastProject returns the most recently opened', () => {
      pm.initProject(projectDir)
      const last = pm.getLastProject()
      expect(last).not.toBeNull()
      expect(last!.path).toBe(projectDir)
    })

    it('getLastProject returns null when no history', () => {
      expect(pm.getLastProject()).toBeNull()
    })

    it('getLastProject skips deleted folders', () => {
      const dir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'project-gone-'))
      pm.initProject(projectDir)
      pm.initProject(dir2)
      fs.rmSync(dir2, { recursive: true, force: true })

      const last = pm.getLastProject()
      expect(last!.path).toBe(projectDir)
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/project-manager.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement ProjectManager**

Create `src/main/project/project-manager.ts`:

```ts
import * as fs from 'fs'
import * as path from 'path'
import type { RecentProject } from '../../shared/types'

const RECENT_FILE = 'recent-projects.json'
const AGENTORCH_DIR = '.agentorch'
const MAX_RECENT = 20

const GITIGNORE_CONTENT = `agentorch.db
agentorch.db-wal
agentorch.db-shm
`

export class ProjectManager {
  private _current: RecentProject | null = null

  constructor(private userDataPath: string) {}

  get currentProject(): RecentProject | null {
    return this._current
  }

  get dbPath(): string {
    if (!this._current) throw new Error('No project open')
    return path.join(this._current.path, AGENTORCH_DIR, 'agentorch.db')
  }

  get presetsDir(): string {
    if (!this._current) throw new Error('No project open')
    return path.join(this._current.path, AGENTORCH_DIR, 'presets')
  }

  initProject(projectPath: string): void {
    const agentorchDir = path.join(projectPath, AGENTORCH_DIR)
    const presetsDir = path.join(agentorchDir, 'presets')

    fs.mkdirSync(presetsDir, { recursive: true })

    const gitignorePath = path.join(agentorchDir, '.gitignore')
    if (!fs.existsSync(gitignorePath)) {
      fs.writeFileSync(gitignorePath, GITIGNORE_CONTENT, 'utf-8')
    }

    this._current = {
      path: projectPath,
      name: path.basename(projectPath),
      lastOpened: new Date().toISOString()
    }

    this.addRecent(this._current)
  }

  listRecent(): RecentProject[] {
    const filePath = path.join(this.userDataPath, RECENT_FILE)
    if (!fs.existsSync(filePath)) return []

    try {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
      return Array.isArray(data) ? data : []
    } catch {
      return []
    }
  }

  getLastProject(): RecentProject | null {
    const recent = this.listRecent()
    for (const project of recent) {
      if (fs.existsSync(project.path)) return project
    }
    return null
  }

  removeRecent(projectPath: string): void {
    const recent = this.listRecent().filter(p => p.path !== projectPath)
    this.saveRecent(recent)
  }

  private addRecent(project: RecentProject): void {
    let recent = this.listRecent().filter(p => p.path !== project.path)
    recent.unshift(project)
    if (recent.length > MAX_RECENT) recent = recent.slice(0, MAX_RECENT)
    this.saveRecent(recent)
  }

  private saveRecent(recent: RecentProject[]): void {
    const filePath = path.join(this.userDataPath, RECENT_FILE)
    fs.writeFileSync(filePath, JSON.stringify(recent, null, 2), 'utf-8')
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/project-manager.test.ts`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/project/project-manager.ts tests/unit/project-manager.test.ts
git commit -m "feat: add ProjectManager module with recent projects support"
```

---

### Task 3: Remove Database Wipe

**Files:**
- Modify: `src/main/db/database.ts:36-39`

- [ ] **Step 1: Remove DELETE FROM statements**

In `src/main/db/database.ts`, remove lines 36-39:

```sql
    -- Clear previous session data so each launch starts fresh
    DELETE FROM pinboard_tasks;
    DELETE FROM info_entries;
    DELETE FROM messages;
```

The function should end with:

```ts
  `)

  // Migrations for existing DBs — safe to fail if column already exists
  try { db.exec('ALTER TABLE pinboard_tasks ADD COLUMN created_by TEXT') } catch { /* column exists */ }

  return db
}
```

- [ ] **Step 2: Verify build**

Run: `npx tsc --noEmit`
Expected: Clean

- [ ] **Step 3: Commit**

```bash
git add src/main/db/database.ts
git commit -m "fix: remove DB wipe on startup — project isolation handles this now"
```

---

### Task 4: Refactor Preset Manager to Accept Base Path

**Files:**
- Modify: `src/main/presets/preset-manager.ts`
- Modify: `tests/unit/preset-manager.test.ts`

- [ ] **Step 1: Refactor preset-manager to use injected path**

Replace the entire `src/main/presets/preset-manager.ts` with:

```ts
import * as fs from 'fs'
import * as path from 'path'
import type { WorkspacePreset, AgentConfig, WindowPosition, CanvasState } from '../../shared/types'

const MAX_PRESET_NAME_LENGTH = 50

let _presetsDir: string | null = null

export function setPresetsDir(dir: string): void {
  _presetsDir = dir
}

function getPresetsDir(): string {
  if (!_presetsDir) throw new Error('Presets directory not configured — open a project first')
  if (!fs.existsSync(_presetsDir)) {
    fs.mkdirSync(_presetsDir, { recursive: true })
  }
  return _presetsDir
}

function sanitizePresetName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '-')
    .replace(/_+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, MAX_PRESET_NAME_LENGTH)
}

function getPresetPath(name: string): string {
  const sanitized = sanitizePresetName(name)
  if (!sanitized) {
    throw new Error('Invalid preset name')
  }
  return path.join(getPresetsDir(), `${sanitized}.json`)
}

export function savePreset(
  name: string,
  agents: AgentConfig[],
  windows: WindowPosition[],
  canvas: CanvasState
): void {
  const preset: WorkspacePreset = {
    name,
    agents,
    windows,
    canvas,
    savedAt: new Date().toISOString()
  }

  const presetPath = getPresetPath(name)
  fs.writeFileSync(presetPath, JSON.stringify(preset, null, 2), 'utf-8')
}

export function loadPreset(name: string): WorkspacePreset {
  const presetPath = getPresetPath(name)

  if (!fs.existsSync(presetPath)) {
    throw new Error(`Preset '${name}' not found`)
  }

  const content = fs.readFileSync(presetPath, 'utf-8')
  return JSON.parse(content) as WorkspacePreset
}

export function listPresets(): string[] {
  const presetsDir = getPresetsDir()
  const files = fs.readdirSync(presetsDir)

  return files
    .filter(f => f.endsWith('.json'))
    .map(f => path.basename(f, '.json'))
    .sort()
}

export function deletePreset(name: string): void {
  const presetPath = getPresetPath(name)

  if (!fs.existsSync(presetPath)) {
    throw new Error(`Preset '${name}' not found`)
  }

  fs.unlinkSync(presetPath)
}

export function presetExists(name: string): boolean {
  const presetPath = getPresetPath(name)
  return fs.existsSync(presetPath)
}
```

- [ ] **Step 2: Update preset-manager tests**

In `tests/unit/preset-manager.test.ts`, replace the electron mock and imports:

Remove the `vi.mock('electron', ...)` block entirely. Replace it with:

```ts
import { setPresetsDir } from '../../src/main/presets/preset-manager'
```

Remove the old `import { ... } from '../../src/main/presets/preset-manager'` and replace with:

```ts
import {
  setPresetsDir,
  savePreset,
  loadPreset,
  listPresets,
  deletePreset,
  presetExists
} from '../../src/main/presets/preset-manager'
```

In `beforeEach`, after creating `tmpDir`, add:

```ts
const presetsPath = path.join(tmpDir, 'presets')
fs.mkdirSync(presetsPath, { recursive: true })
setPresetsDir(presetsPath)
```

Remove any references to `vi.mock('electron', ...)`. The tests should work with the injected path.

- [ ] **Step 3: Run tests**

Run: `npx vitest run tests/unit/preset-manager.test.ts`
Expected: All PASS

- [ ] **Step 4: Commit**

```bash
git add src/main/presets/preset-manager.ts tests/unit/preset-manager.test.ts
git commit -m "refactor: preset-manager uses injected path instead of app.getPath"
```

---

### Task 5: Refactor Main Process — openProject / closeProject

**Files:**
- Modify: `src/main/index.ts`

This is the core refactor. Extract DB init + hub startup into `openProject()` and teardown into `closeProject()`.

- [ ] **Step 1: Add ProjectManager import and instance**

At the top of `src/main/index.ts`, add:

```ts
import { ProjectManager } from './project/project-manager'
import { setPresetsDir } from './presets/preset-manager'
```

After the existing `let hub: HubServer` line, add:

```ts
let projectManager: ProjectManager
let currentDb: import('better-sqlite3').Database | null = null
```

- [ ] **Step 2: Create openProject function**

Add this function before `main()` (after the `setupIPC` function):

```ts
async function openProject(projectPath: string): Promise<void> {
  // Close existing project if open
  if (hub) await closeProject()

  projectManager.initProject(projectPath)
  setPresetsDir(projectManager.presetsDir)

  // Initialize SQLite persistence at project path
  const db = createDatabase(projectManager.dbPath)
  currentDb = db
  const messageStore = new MessageStore(db)
  const pinboardStore = new PinboardStore(db)
  const infoStore = new InfoStore(db)

  hub = await createHubServer()
  hub.setMessageStore(messageStore)
  console.log(`Hub server running on port ${hub.port} for project: ${projectManager.currentProject!.name}`)

  // Restore persisted state
  hub.pinboard.loadTasks(pinboardStore.loadTasks())
  hub.infoChannel.loadEntries(infoStore.loadEntries())

  // Hook persistence callbacks
  hub.messages.onMessageSaved = (msg) => messageStore.saveMessage(msg)
  hub.pinboard.onTaskCreated = (task) => {
    pinboardStore.saveTask(task)
    mainWindow?.webContents.send(IPC.PINBOARD_TASK_UPDATE, hub.pinboard.readTasks())
  }
  hub.pinboard.onTaskUpdated = (task) => {
    pinboardStore.updateTask(task)
    mainWindow?.webContents.send(IPC.PINBOARD_TASK_UPDATE, hub.pinboard.readTasks())
  }
  hub.infoChannel.onEntryAdded = (entry) => {
    infoStore.saveEntry(entry)
    mainWindow?.webContents.send(IPC.INFO_ENTRY_ADDED, hub.infoChannel.readInfo())
  }

  hub.setOutputAccessor((agentName, lines) => {
    const managed = Array.from(agents.values()).find(a => a.config.name === agentName)
    if (!managed) return null
    return managed.outputBuffer.getLines(lines)
  })
  setupMessageNudge()
  setupInfoNudge()

  // Update window title
  if (mainWindow) {
    mainWindow.setTitle(`AgentOrch — ${projectManager.currentProject!.name}`)
    mainWindow.webContents.send(IPC.PROJECT_CHANGED, projectManager.currentProject)
  }
}
```

- [ ] **Step 3: Create closeProject function**

Add this function right after `openProject`:

```ts
async function closeProject(): Promise<void> {
  // Kill all agents
  for (const [id] of agents) {
    manualKills.add(id)
  }
  for (const [, managed] of agents) {
    killPty(managed)
    if (managed.mcpConfigPath) cleanupConfig(managed.mcpConfigPath)
  }
  agents.clear()
  initialPrompts.clear()
  hasReceivedInitialPrompt.clear()
  pendingNudges.clear()

  // Close hub
  hub?.close()

  // Close DB
  if (currentDb) {
    currentDb.close()
    currentDb = null
  }

  // Notify renderer
  if (mainWindow) {
    mainWindow.webContents.send(IPC.AGENT_STATE_UPDATE, [])
  }
}
```

- [ ] **Step 4: Add project IPC handlers inside setupIPC**

Inside `setupIPC()`, add these handlers:

```ts
  ipcMain.handle(IPC.PROJECT_GET_CURRENT, () => {
    return projectManager.currentProject
  })

  ipcMain.handle(IPC.PROJECT_LIST_RECENT, () => {
    return projectManager.listRecent()
  })

  ipcMain.handle(IPC.PROJECT_OPEN_FOLDER, async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory']
    })
    return result.canceled ? null : result.filePaths[0]
  })

  ipcMain.handle(IPC.PROJECT_SWITCH, async (_event, projectPath: string) => {
    await openProject(projectPath)
    return projectManager.currentProject
  })
```

- [ ] **Step 5: Refactor main() to use project-driven init**

Replace the `main()` function with:

```ts
async function main(): Promise<void> {
  await app.whenReady()

  projectManager = new ProjectManager(app.getPath('userData'))

  setupIPC()
  mainWindow = createWindow()

  // Auto-open last project, or prompt user to pick one
  const lastProject = projectManager.getLastProject()
  if (lastProject) {
    await openProject(lastProject.path)
  } else {
    // No project history — renderer will show project picker
    mainWindow.webContents.send(IPC.PROJECT_CHANGED, null)
  }
}
```

- [ ] **Step 6: Update window-all-closed handler**

Replace the `app.on('window-all-closed', ...)` handler:

```ts
app.on('window-all-closed', async () => {
  await closeProject()
  app.quit()
})
```

- [ ] **Step 7: Verify build**

Run: `npx tsc --noEmit`
Expected: Clean

- [ ] **Step 8: Commit**

```bash
git add src/main/index.ts
git commit -m "refactor: extract openProject/closeProject, project-driven startup"
```

---

### Task 6: Update Preload — Expose Project IPC

**Files:**
- Modify: `src/preload/index.ts`

- [ ] **Step 1: Add project API to preload**

In `src/preload/index.ts`, add these methods inside the `contextBridge.exposeInMainWorld('electronAPI', { ... })` object, after the existing `onInfoUpdate` method:

```ts
  // Project management
  getProject: () => ipcRenderer.invoke(IPC.PROJECT_GET_CURRENT),
  switchProject: (path: string) => ipcRenderer.invoke(IPC.PROJECT_SWITCH, path),
  listRecentProjects: () => ipcRenderer.invoke(IPC.PROJECT_LIST_RECENT),
  openFolderDialog: () => ipcRenderer.invoke(IPC.PROJECT_OPEN_FOLDER),
  onProjectChanged: (callback: (project: unknown) => void) => {
    const handler = (_event: unknown, project: unknown) => callback(project)
    ipcRenderer.on(IPC.PROJECT_CHANGED, handler)
    return () => ipcRenderer.removeListener(IPC.PROJECT_CHANGED, handler)
  }
```

- [ ] **Step 2: Verify build**

Run: `npx tsc --noEmit`
Expected: Clean

- [ ] **Step 3: Commit**

```bash
git add src/preload/index.ts
git commit -m "feat: expose project IPC channels in preload"
```

---

### Task 7: Create ProjectPickerDialog Component

**Files:**
- Create: `src/renderer/components/ProjectPickerDialog.tsx`

- [ ] **Step 1: Create the dialog component**

Create `src/renderer/components/ProjectPickerDialog.tsx`:

```tsx
import React, { useState, useEffect } from 'react'
import type { RecentProject } from '../../shared/types'

declare const electronAPI: {
  listRecentProjects: () => Promise<RecentProject[]>
  openFolderDialog: () => Promise<string | null>
  switchProject: (path: string) => Promise<RecentProject>
}

interface ProjectPickerDialogProps {
  isFullScreen: boolean  // true = no project open (first launch), false = switch mode
  onProjectOpened: (project: RecentProject) => void
  onCancel?: () => void  // only available in switch mode
}

export function ProjectPickerDialog({ isFullScreen, onProjectOpened, onCancel }: ProjectPickerDialogProps): React.ReactElement {
  const [recent, setRecent] = useState<RecentProject[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    electronAPI.listRecentProjects().then(setRecent)
  }, [])

  const handleOpenFolder = async () => {
    const folderPath = await electronAPI.openFolderDialog()
    if (!folderPath) return
    setLoading(true)
    const project = await electronAPI.switchProject(folderPath)
    onProjectOpened(project)
  }

  const handleSelectRecent = async (projectPath: string) => {
    setLoading(true)
    const project = await electronAPI.switchProject(projectPath)
    onProjectOpened(project)
  }

  const overlayStyle: React.CSSProperties = isFullScreen ? {
    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: '#1a1a1a',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 9999
  } : {
    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.7)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 9999
  }

  return (
    <div style={overlayStyle}>
      <div style={{
        backgroundColor: '#252525',
        borderRadius: '12px',
        border: '1px solid #333',
        padding: '32px',
        width: '480px',
        maxHeight: '600px',
        display: 'flex',
        flexDirection: 'column',
        gap: '20px'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, color: '#e0e0e0', fontSize: '18px' }}>
            {isFullScreen ? 'Open a Project' : 'Switch Project'}
          </h2>
          {onCancel && (
            <button onClick={onCancel} style={{
              background: 'none', border: 'none', color: '#666',
              fontSize: '18px', cursor: 'pointer', padding: '4px'
            }}>x</button>
          )}
        </div>

        <button
          onClick={handleOpenFolder}
          disabled={loading}
          style={{
            padding: '12px 16px',
            borderRadius: '8px',
            border: '1px solid #4a9eff',
            backgroundColor: '#1e3a5f',
            color: '#8cc4ff',
            fontSize: '14px',
            cursor: loading ? 'wait' : 'pointer',
            textAlign: 'left'
          }}
        >
          Open Folder...
        </button>

        {recent.length > 0 && (
          <>
            <div style={{ color: '#888', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Recent Projects
            </div>
            <div style={{ overflow: 'auto', maxHeight: '360px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {recent.map(project => (
                <button
                  key={project.path}
                  onClick={() => handleSelectRecent(project.path)}
                  disabled={loading}
                  style={{
                    padding: '10px 12px',
                    borderRadius: '6px',
                    border: '1px solid #333',
                    backgroundColor: '#2a2a2a',
                    color: '#e0e0e0',
                    fontSize: '13px',
                    cursor: loading ? 'wait' : 'pointer',
                    textAlign: 'left',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '2px'
                  }}
                >
                  <span style={{ fontWeight: 500 }}>{project.name}</span>
                  <span style={{ color: '#666', fontSize: '11px' }}>{project.path}</span>
                </button>
              ))}
            </div>
          </>
        )}

        {recent.length === 0 && (
          <div style={{ color: '#555', fontSize: '13px', textAlign: 'center', padding: '20px 0' }}>
            No recent projects. Open a folder to get started.
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify build**

Run: `npx tsc --noEmit`
Expected: Clean

- [ ] **Step 3: Commit**

```bash
git add src/renderer/components/ProjectPickerDialog.tsx
git commit -m "feat: add ProjectPickerDialog component"
```

---

### Task 8: Update TopBar — Project Name + Switch Button

**Files:**
- Modify: `src/renderer/components/TopBar.tsx`

- [ ] **Step 1: Add project props and UI**

In `src/renderer/components/TopBar.tsx`, update the `TopBarProps` interface to add:

```ts
  projectName: string | null
  onSwitchProject: () => void
```

Update the component function signature to destructure the new props.

Add this block at the start of the TopBar JSX, right after the opening `<div>` and before the `+` button:

```tsx
      {projectName && (
        <button
          onClick={onSwitchProject}
          title="Switch Project"
          style={{
            height: '28px',
            padding: '0 10px',
            borderRadius: '5px',
            border: '1px solid #333',
            backgroundColor: 'transparent',
            color: '#aaa',
            fontSize: '12px',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            maxWidth: '200px',
            overflow: 'hidden',
            textOverflow: 'ellipsis'
          }}
        >
          {projectName}
        </button>
      )}
      {projectName && (
        <div style={{ width: '1px', height: '24px', backgroundColor: '#333', margin: '0 4px' }} />
      )}
```

- [ ] **Step 2: Verify build**

Run: `npx tsc --noEmit`
Expected: May fail — App.tsx doesn't pass the new props yet. That's fine, Task 9 handles it.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/components/TopBar.tsx
git commit -m "feat: add project name and switch button to TopBar"
```

---

### Task 9: Integrate Project State in App.tsx

**Files:**
- Modify: `src/renderer/App.tsx`

- [ ] **Step 1: Add project state and picker integration**

In `src/renderer/App.tsx`:

Add import:

```ts
import { ProjectPickerDialog } from './components/ProjectPickerDialog'
import type { RecentProject } from '../shared/types'
```

Add the `electronAPI` type declaration (if not already globally typed):

```ts
declare const electronAPI: {
  getProject: () => Promise<RecentProject | null>
  onProjectChanged: (callback: (project: unknown) => void) => () => void
  [key: string]: any
}
```

Inside the `App` component, add state:

```ts
const [project, setProject] = useState<RecentProject | null>(null)
const [projectLoading, setProjectLoading] = useState(true)
const [showProjectPicker, setShowProjectPicker] = useState(false)
```

Add an effect to load initial project:

```ts
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
```

Add project opened handler:

```ts
const handleProjectOpened = useCallback((p: RecentProject) => {
  setProject(p)
  setShowProjectPicker(false)
}, [])
```

Update the `return` JSX:

- If `projectLoading`, render nothing (or a loading spinner)
- If `!project && !projectLoading`, render `<ProjectPickerDialog isFullScreen onProjectOpened={handleProjectOpened} />`
- Otherwise render the existing workspace

Pass new props to `<TopBar>`:

```tsx
<TopBar
  projectName={project?.name ?? null}
  onSwitchProject={() => setShowProjectPicker(true)}
  // ... existing props
/>
```

Add the switch-project picker overlay:

```tsx
{showProjectPicker && project && (
  <ProjectPickerDialog
    isFullScreen={false}
    onProjectOpened={handleProjectOpened}
    onCancel={() => setShowProjectPicker(false)}
  />
)}
```

- [ ] **Step 2: Verify build**

Run: `npx tsc --noEmit`
Expected: Clean

- [ ] **Step 3: Run all tests**

Run: `npx vitest run`
Expected: All non-database tests pass (database.test.ts still has pre-existing native module issue)

- [ ] **Step 4: Commit**

```bash
git add src/renderer/App.tsx
git commit -m "feat: integrate project state in App, show picker on first launch"
```

---

### Task 10: Integration Test — Hub Server Still Works

**Files:**
- Existing: `tests/integration/hub-server.test.ts`

- [ ] **Step 1: Run existing integration tests**

Run: `npx vitest run tests/integration/hub-server.test.ts`
Expected: All 22 tests PASS — hub server has no project dependency

- [ ] **Step 2: Run full test suite**

Run: `npx vitest run`
Expected: Same pass/fail ratio as before (only database.test.ts fails from native module issue)

- [ ] **Step 3: Final type-check**

Run: `npx tsc --noEmit`
Expected: Clean

- [ ] **Step 4: Commit all remaining changes**

If any uncommitted files remain:

```bash
git add -A
git commit -m "feat: Phase 1 complete — project-based persistence"
```

---

### Summary

| Task | What | Risk |
|------|------|------|
| 1 | Types + IPC channels | Trivial |
| 2 | ProjectManager (TDD) | Low — isolated module |
| 3 | Remove DB wipe | Trivial |
| 4 | Preset-manager refactor | Low — existing tests validate |
| 5 | Main process refactor | **Medium** — largest change, touch startup flow |
| 6 | Preload IPC | Trivial |
| 7 | ProjectPickerDialog | Low — new component |
| 8 | TopBar update | Trivial |
| 9 | App.tsx integration | Low — wiring only |
| 10 | Integration verification | Zero — read-only |
