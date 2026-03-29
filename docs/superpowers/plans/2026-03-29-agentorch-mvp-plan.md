# AgentOrch MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an Electron desktop app that hosts multiple AI agent CLIs in floating terminal windows, connected via MCP so agents can message each other directly — eliminating the human copy-paste relay.

**Architecture:** Electron main process runs a hub HTTP server. Each agent CLI spawns its own MCP server instance (via stdio) that relays tool calls to the hub. The React renderer provides a floating-window workspace with xterm.js terminals. Messages flow through MCP only (pull model).

**Tech Stack:** Electron, electron-vite, React, TypeScript, xterm.js, node-pty, @modelcontextprotocol/sdk, react-rnd, vitest

---

## File Structure

```
F:/coding/AgentOrch/
├── package.json
├── tsconfig.json
├── tsconfig.node.json
├── tsconfig.web.json
├── electron.vite.config.ts
├── electron-builder.yml
├── src/
│   ├── main/                              # Electron main process
│   │   ├── index.ts                       # App lifecycle, create window, start hub
│   │   ├── hub/
│   │   │   ├── server.ts                  # Express HTTP server for MCP spokes
│   │   │   ├── routes.ts                  # API route handlers
│   │   │   ├── agent-registry.ts          # In-memory agent state management
│   │   │   ├── message-router.ts          # Message queue per agent
│   │   │   └── auth.ts                    # Shared secret generation + validation
│   │   ├── shell/
│   │   │   ├── pty-manager.ts             # node-pty spawn + lifecycle
│   │   │   ├── status-detector.ts         # ANSI strip + prompt regex + state machine
│   │   │   └── output-buffer.ts           # Rolling line buffer (1000 lines per agent)
│   │   └── mcp/
│   │       └── config-writer.ts           # Write/cleanup temp MCP config files
│   ├── mcp-server/                        # Standalone MCP server binary (spawned by CLIs)
│   │   └── index.ts                       # stdio MCP server → hub HTTP relay
│   ├── renderer/                          # Electron renderer process (React)
│   │   ├── index.html
│   │   ├── main.tsx                       # React entry point
│   │   ├── App.tsx                        # Root: Workspace + TopBar + dialogs
│   │   ├── components/
│   │   │   ├── TopBar.tsx                 # [+] button, agent pills, window toggles
│   │   │   ├── Workspace.tsx              # Dark canvas containing all floating windows
│   │   │   ├── FloatingWindow.tsx         # Generic draggable/resizable/minimizable window
│   │   │   ├── TerminalWindow.tsx         # xterm.js terminal inside a FloatingWindow
│   │   │   ├── SpawnDialog.tsx            # Agent creation form (modal)
│   │   │   └── AgentPill.tsx              # Status pill in top bar
│   │   ├── hooks/
│   │   │   ├── useWindowManager.ts        # Window positions, sizes, z-order, minimize state
│   │   │   └── useAgents.ts               # Agent state via IPC from main process
│   │   └── styles/
│   │       └── global.css                 # Dark theme, fonts, reset
│   ├── preload/
│   │   └── index.ts                       # Electron preload: expose IPC to renderer
│   └── shared/
│       └── types.ts                       # AgentConfig, Message, AgentStatus, etc.
├── tests/
│   ├── unit/
│   │   ├── agent-registry.test.ts
│   │   ├── message-router.test.ts
│   │   ├── status-detector.test.ts
│   │   ├── output-buffer.test.ts
│   │   ├── auth.test.ts
│   │   └── config-writer.test.ts
│   └── integration/
│       └── hub-server.test.ts
└── docs/
```

---

## Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`, `tsconfig.node.json`, `tsconfig.web.json`
- Create: `electron.vite.config.ts`
- Create: `electron-builder.yml`
- Create: `src/main/index.ts`
- Create: `src/renderer/index.html`
- Create: `src/renderer/main.tsx`
- Create: `src/renderer/App.tsx`
- Create: `src/preload/index.ts`
- Create: `src/renderer/styles/global.css`

- [ ] **Step 1: Initialize the project**

```bash
cd F:/coding/AgentOrch
npm init -y
```

- [ ] **Step 2: Install core dependencies**

```bash
npm install electron electron-vite react react-dom @types/react @types/react-dom typescript vite --save-dev
npm install express node-pty @xterm/xterm @xterm/addon-fit react-rnd uuid
npm install @types/express @types/uuid vitest --save-dev
```

- [ ] **Step 3: Create tsconfig.json**

```json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.node.json" },
    { "path": "./tsconfig.web.json" }
  ]
}
```

- [ ] **Step 4: Create tsconfig.node.json (main + preload)**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "outDir": "./out",
    "rootDir": "./src",
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "types": ["node"]
  },
  "include": ["src/main/**/*", "src/preload/**/*", "src/shared/**/*", "src/mcp-server/**/*"]
}
```

- [ ] **Step 5: Create tsconfig.web.json (renderer)**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "jsx": "react-jsx",
    "esModuleInterop": true,
    "outDir": "./out",
    "rootDir": "./src",
    "skipLibCheck": true,
    "types": ["node"]
  },
  "include": ["src/renderer/**/*", "src/shared/**/*"]
}
```

- [ ] **Step 6: Create electron.vite.config.ts**

```typescript
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()]
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    plugins: [react()]
  }
})
```

Install the react plugin and esbuild (for MCP server build):
```bash
npm install @vitejs/plugin-react esbuild --save-dev
```

- [ ] **Step 6b: Create build script for MCP server binary**

The MCP server is a standalone script spawned by agent CLIs — it needs its own build step outside electron-vite. Add `scripts/build-mcp-server.mjs`:

```javascript
// scripts/build-mcp-server.mjs
import * as esbuild from 'esbuild'

await esbuild.build({
  entryPoints: ['src/mcp-server/index.ts'],
  bundle: true,
  platform: 'node',
  target: 'node20',
  outfile: 'out/mcp-server/index.js',
  format: 'cjs',
  external: ['@modelcontextprotocol/sdk']
})
```

Update the `"scripts"` in package.json to include:
```json
{
  "build:mcp": "node scripts/build-mcp-server.mjs",
  "dev": "npm run build:mcp && electron-vite dev",
  "build": "npm run build:mcp && electron-vite build"
}
```

- [ ] **Step 6c: Create vitest.config.ts**

Vitest needs its own config since electron-vite's config format is incompatible:

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node'
  }
})
```

- [ ] **Step 7: Create electron-builder.yml**

```yaml
appId: com.agentorch.app
productName: AgentOrch
directories:
  buildResources: build
files:
  - '!**/.vscode/*'
  - '!docs/*'
  - '!tests/*'
win:
  target: portable
```

- [ ] **Step 8: Create src/main/index.ts (minimal Electron main)**

```typescript
import { app, BrowserWindow } from 'electron'
import path from 'path'

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    backgroundColor: '#1a1a1a',
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

app.whenReady().then(() => {
  createWindow()
})

app.on('window-all-closed', () => {
  app.quit()
})
```

- [ ] **Step 9: Create src/preload/index.ts (minimal preload)**

```typescript
import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  invoke: (channel: string, ...args: unknown[]) => ipcRenderer.invoke(channel, ...args),
  on: (channel: string, callback: (...args: unknown[]) => void) => {
    ipcRenderer.on(channel, (_event, ...args) => callback(...args))
    return () => ipcRenderer.removeAllListeners(channel)
  }
})
```

- [ ] **Step 10: Create src/renderer/index.html**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>AgentOrch</title>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="./main.tsx"></script>
</body>
</html>
```

- [ ] **Step 11: Create src/renderer/main.tsx**

```tsx
import React from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './styles/global.css'

const root = createRoot(document.getElementById('root')!)
root.render(<App />)
```

- [ ] **Step 12: Create src/renderer/App.tsx (placeholder)**

```tsx
import React from 'react'

export function App(): React.ReactElement {
  return (
    <div style={{ width: '100vw', height: '100vh', backgroundColor: '#1a1a1a', color: '#e0e0e0' }}>
      <h1 style={{ padding: '20px', fontFamily: 'monospace' }}>AgentOrch</h1>
    </div>
  )
}
```

- [ ] **Step 13: Create src/renderer/styles/global.css**

```css
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html, body, #root {
  width: 100%;
  height: 100%;
  overflow: hidden;
  background-color: #1a1a1a;
  color: #e0e0e0;
  font-family: 'Cascadia Code', 'Fira Code', 'Consolas', monospace;
}

::-webkit-scrollbar {
  width: 8px;
}

::-webkit-scrollbar-track {
  background: #2a2a2a;
}

::-webkit-scrollbar-thumb {
  background: #555;
  border-radius: 4px;
}

::-webkit-scrollbar-thumb:hover {
  background: #777;
}
```

- [ ] **Step 14: Add scripts to package.json**

Add to the `"scripts"` section:
```json
{
  "dev": "electron-vite dev",
  "build": "electron-vite build",
  "preview": "electron-vite preview",
  "test": "vitest run",
  "test:watch": "vitest"
}
```

Also set `"main": "./out/main/index.js"` in package.json.

- [ ] **Step 15: Verify the app launches**

```bash
cd F:/coding/AgentOrch
npm run dev
```

Expected: An Electron window opens with dark background showing "AgentOrch" text.

- [ ] **Step 16: Commit**

```bash
git init
echo "node_modules/\nout/\ndist/\n.env\n*.tmp" > .gitignore
git add .
git commit -m "feat: scaffold Electron + React + TypeScript project with electron-vite"
```

---

## Task 2: Shared Types

**Files:**
- Create: `src/shared/types.ts`

- [ ] **Step 1: Define all shared types**

```typescript
export type AgentStatus = 'idle' | 'active' | 'working' | 'disconnected'

export interface AgentConfig {
  id: string
  name: string
  cli: string          // e.g., "claude", "codex", "kimi", or custom command
  cwd: string          // working directory for the PTY
  role: string         // short label, e.g., "Decompiler"
  ceoNotes: string     // freeform instructions from the human
  admin: boolean       // whether to spawn with elevation
  promptRegex?: string // optional custom prompt regex override
}

export interface AgentState extends AgentConfig {
  status: AgentStatus
  createdAt: string    // ISO timestamp
}

export interface Message {
  id: string
  from: string         // agent name
  to: string           // agent name
  message: string
  timestamp: string    // ISO timestamp
}

export interface SendMessageResult {
  status: 'delivered' | 'queued' | 'error'
  detail?: string
}

export interface HubInfo {
  port: number
  secret: string
}

// IPC channel names (main ↔ renderer)
export const IPC = {
  SPAWN_AGENT: 'agent:spawn',
  KILL_AGENT: 'agent:kill',
  GET_AGENTS: 'agent:list',
  AGENT_STATE_UPDATE: 'agent:state-update',
  GET_HUB_INFO: 'hub:info',
  WRITE_TO_PTY: 'pty:write',
  PTY_OUTPUT: 'pty:output',
  PTY_EXIT: 'pty:exit'
} as const
```

- [ ] **Step 2: Commit**

```bash
git add src/shared/types.ts
git commit -m "feat: define shared types for agents, messages, and IPC channels"
```

---

## Task 3: Agent Registry

**Files:**
- Create: `src/main/hub/agent-registry.ts`
- Test: `tests/unit/agent-registry.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/unit/agent-registry.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { AgentRegistry } from '../../src/main/hub/agent-registry'
import type { AgentConfig } from '../../src/shared/types'

const makeConfig = (overrides: Partial<AgentConfig> = {}): AgentConfig => ({
  id: 'test-1',
  name: 'worker-1',
  cli: 'claude',
  cwd: '/tmp',
  role: 'Tester',
  ceoNotes: 'Test agent',
  admin: false,
  ...overrides
})

describe('AgentRegistry', () => {
  let registry: AgentRegistry

  beforeEach(() => {
    registry = new AgentRegistry()
  })

  it('registers an agent and returns its state', () => {
    const config = makeConfig()
    const state = registry.register(config)
    expect(state.name).toBe('worker-1')
    expect(state.status).toBe('idle')
  })

  it('rejects duplicate names', () => {
    registry.register(makeConfig())
    expect(() => registry.register(makeConfig({ id: 'test-2' }))).toThrow('already exists')
  })

  it('lists all agents', () => {
    registry.register(makeConfig({ id: '1', name: 'a' }))
    registry.register(makeConfig({ id: '2', name: 'b' }))
    expect(registry.list()).toHaveLength(2)
  })

  it('gets agent by name', () => {
    registry.register(makeConfig())
    expect(registry.get('worker-1')).toBeDefined()
    expect(registry.get('nonexistent')).toBeUndefined()
  })

  it('updates agent status', () => {
    registry.register(makeConfig())
    registry.updateStatus('worker-1', 'working')
    expect(registry.get('worker-1')!.status).toBe('working')
  })

  it('removes an agent', () => {
    registry.register(makeConfig())
    registry.remove('worker-1')
    expect(registry.get('worker-1')).toBeUndefined()
    expect(registry.list()).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd F:/coding/AgentOrch
npx vitest run tests/unit/agent-registry.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement AgentRegistry**

```typescript
// src/main/hub/agent-registry.ts
import type { AgentConfig, AgentState, AgentStatus } from '../../shared/types'

export class AgentRegistry {
  private agents = new Map<string, AgentState>()

  register(config: AgentConfig): AgentState {
    if (this.agents.has(config.name)) {
      throw new Error(`Agent '${config.name}' already exists`)
    }
    const state: AgentState = {
      ...config,
      status: 'idle',
      createdAt: new Date().toISOString()
    }
    this.agents.set(config.name, state)
    return state
  }

  get(name: string): AgentState | undefined {
    return this.agents.get(name)
  }

  list(): AgentState[] {
    return Array.from(this.agents.values())
  }

  updateStatus(name: string, status: AgentStatus): void {
    const agent = this.agents.get(name)
    if (agent) {
      agent.status = status
    }
  }

  remove(name: string): void {
    this.agents.delete(name)
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/unit/agent-registry.test.ts
```

Expected: All 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/hub/agent-registry.ts tests/unit/agent-registry.test.ts
git commit -m "feat: implement AgentRegistry with in-memory agent state management"
```

---

## Task 4: Message Router

**Files:**
- Create: `src/main/hub/message-router.ts`
- Test: `tests/unit/message-router.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/unit/message-router.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { MessageRouter } from '../../src/main/hub/message-router'
import { AgentRegistry } from '../../src/main/hub/agent-registry'
import type { AgentConfig } from '../../src/shared/types'

const makeConfig = (name: string): AgentConfig => ({
  id: `id-${name}`,
  name,
  cli: 'claude',
  cwd: '/tmp',
  role: 'Test',
  ceoNotes: '',
  admin: false
})

describe('MessageRouter', () => {
  let registry: AgentRegistry
  let router: MessageRouter

  beforeEach(() => {
    registry = new AgentRegistry()
    router = new MessageRouter(registry)
    registry.register(makeConfig('orchestrator'))
    registry.register(makeConfig('worker-1'))
  })

  it('delivers a message to an existing agent', () => {
    const result = router.send('orchestrator', 'worker-1', 'do the thing')
    expect(result.status).toBe('delivered')
  })

  it('returns error for nonexistent target', () => {
    const result = router.send('orchestrator', 'ghost', 'hello')
    expect(result.status).toBe('error')
    expect(result.detail).toContain('not found')
  })

  it('queues message for disconnected agent', () => {
    registry.updateStatus('worker-1', 'disconnected')
    const result = router.send('orchestrator', 'worker-1', 'hello')
    expect(result.status).toBe('queued')
    expect(result.detail).toContain('offline')
  })

  it('retrieves messages (destructive read)', () => {
    router.send('orchestrator', 'worker-1', 'task 1')
    router.send('orchestrator', 'worker-1', 'task 2')

    const messages = router.getMessages('worker-1')
    expect(messages).toHaveLength(2)
    expect(messages[0].message).toBe('task 1')
    expect(messages[0].from).toBe('orchestrator')
    expect(messages[1].message).toBe('task 2')

    // Destructive: second call returns empty
    expect(router.getMessages('worker-1')).toHaveLength(0)
  })

  it('enforces max message size (10KB)', () => {
    const bigMsg = 'x'.repeat(11_000)
    const result = router.send('orchestrator', 'worker-1', bigMsg)
    expect(result.status).toBe('error')
    expect(result.detail).toContain('size')
  })

  it('enforces max queue depth (100), dropping oldest', () => {
    for (let i = 0; i < 105; i++) {
      router.send('orchestrator', 'worker-1', `msg-${i}`)
    }
    const messages = router.getMessages('worker-1')
    expect(messages).toHaveLength(100)
    expect(messages[0].message).toBe('msg-5') // oldest 5 dropped
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/unit/message-router.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement MessageRouter**

```typescript
// src/main/hub/message-router.ts
import { v4 as uuid } from 'uuid'
import type { Message, SendMessageResult } from '../../shared/types'
import type { AgentRegistry } from './agent-registry'

const MAX_MESSAGE_SIZE = 10 * 1024 // 10KB
const MAX_QUEUE_DEPTH = 100

export class MessageRouter {
  private queues = new Map<string, Message[]>()

  constructor(private registry: AgentRegistry) {}

  send(from: string, to: string, message: string): SendMessageResult {
    if (message.length > MAX_MESSAGE_SIZE) {
      return { status: 'error', detail: `Message exceeds max size of ${MAX_MESSAGE_SIZE} bytes` }
    }

    const target = this.registry.get(to)
    if (!target) {
      return { status: 'error', detail: `Agent '${to}' not found` }
    }

    const msg: Message = {
      id: uuid(),
      from,
      to,
      message,
      timestamp: new Date().toISOString()
    }

    if (!this.queues.has(to)) {
      this.queues.set(to, [])
    }

    const queue = this.queues.get(to)!
    queue.push(msg)

    // Enforce max queue depth — drop oldest
    while (queue.length > MAX_QUEUE_DEPTH) {
      queue.shift()
    }

    if (target.status === 'disconnected') {
      return { status: 'queued', detail: `${to} is offline, message queued` }
    }

    return { status: 'delivered' }
  }

  getMessages(agentName: string): Message[] {
    const queue = this.queues.get(agentName)
    if (!queue || queue.length === 0) return []

    const messages = [...queue]
    queue.length = 0 // destructive read
    return messages
  }

  clearAgent(agentName: string): void {
    this.queues.delete(agentName)
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/unit/message-router.test.ts
```

Expected: All 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/hub/message-router.ts tests/unit/message-router.test.ts
git commit -m "feat: implement MessageRouter with queue, size limits, and depth enforcement"
```

---

## Task 5: Hub Auth

**Files:**
- Create: `src/main/hub/auth.ts`
- Test: `tests/unit/auth.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/unit/auth.test.ts
import { describe, it, expect } from 'vitest'
import { generateSecret, validateSecret } from '../../src/main/hub/auth'

describe('Hub Auth', () => {
  it('generates a non-empty secret string', () => {
    const secret = generateSecret()
    expect(secret).toBeTruthy()
    expect(typeof secret).toBe('string')
    expect(secret.length).toBeGreaterThanOrEqual(32)
  })

  it('generates unique secrets each time', () => {
    const a = generateSecret()
    const b = generateSecret()
    expect(a).not.toBe(b)
  })

  it('validates correct secret', () => {
    const secret = generateSecret()
    expect(validateSecret(secret, secret)).toBe(true)
  })

  it('rejects incorrect secret', () => {
    const secret = generateSecret()
    expect(validateSecret(secret, 'wrong')).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/unit/auth.test.ts
```

- [ ] **Step 3: Implement auth module**

```typescript
// src/main/hub/auth.ts
import { randomBytes, timingSafeEqual } from 'crypto'

export function generateSecret(): string {
  return randomBytes(32).toString('hex')
}

export function validateSecret(expected: string, provided: string): boolean {
  if (expected.length !== provided.length) return false
  return timingSafeEqual(Buffer.from(expected), Buffer.from(provided))
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/unit/auth.test.ts
```

Expected: All 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/hub/auth.ts tests/unit/auth.test.ts
git commit -m "feat: implement hub auth with shared secret generation and timing-safe validation"
```

---

## Task 6: Hub HTTP Server

**Files:**
- Create: `src/main/hub/routes.ts`
- Create: `src/main/hub/server.ts`
- Test: `tests/integration/hub-server.test.ts`

- [ ] **Step 1: Write failing integration tests**

```typescript
// tests/integration/hub-server.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createHubServer, HubServer } from '../../src/main/hub/server'

let hub: HubServer

beforeAll(async () => {
  hub = await createHubServer()
})

afterAll(() => {
  hub.close()
})

async function api(path: string, opts: RequestInit = {}) {
  const res = await fetch(`http://127.0.0.1:${hub.port}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${hub.secret}`,
      ...opts.headers
    }
  })
  return { status: res.status, body: await res.json() }
}

describe('Hub HTTP Server', () => {
  it('rejects requests without auth', async () => {
    const res = await fetch(`http://127.0.0.1:${hub.port}/agents`, {
      headers: { 'Content-Type': 'application/json' }
    })
    expect(res.status).toBe(401)
  })

  it('registers an agent and lists it', async () => {
    const reg = await api('/agents/register', {
      method: 'POST',
      body: JSON.stringify({
        id: 'a1', name: 'orchestrator', cli: 'claude',
        cwd: '/tmp', role: 'Coordinator', ceoNotes: 'You lead.', admin: false
      })
    })
    expect(reg.status).toBe(200)
    expect(reg.body.name).toBe('orchestrator')

    const list = await api('/agents')
    expect(list.body).toHaveLength(1)
    expect(list.body[0].name).toBe('orchestrator')
  })

  it('sends and retrieves messages', async () => {
    // Register a worker
    await api('/agents/register', {
      method: 'POST',
      body: JSON.stringify({
        id: 'a2', name: 'worker-1', cli: 'claude',
        cwd: '/tmp', role: 'Worker', ceoNotes: 'Do tasks.', admin: false
      })
    })

    // Send message
    const send = await api('/messages/send', {
      method: 'POST',
      body: JSON.stringify({ from: 'orchestrator', to: 'worker-1', message: 'do the thing' })
    })
    expect(send.body.status).toBe('delivered')

    // Retrieve messages
    const get = await api('/messages/worker-1')
    expect(get.body).toHaveLength(1)
    expect(get.body[0].message).toBe('do the thing')

    // Second read is empty (destructive)
    const get2 = await api('/messages/worker-1')
    expect(get2.body).toHaveLength(0)
  })

  it('returns CEO notes for an agent', async () => {
    const notes = await api('/agents/orchestrator/ceo-notes')
    expect(notes.body.ceoNotes).toBe('You lead.')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/integration/hub-server.test.ts
```

- [ ] **Step 3: Implement routes**

```typescript
// src/main/hub/routes.ts
import { Router, type Request, type Response } from 'express'
import type { AgentRegistry } from './agent-registry'
import type { MessageRouter } from './message-router'
import type { AgentConfig } from '../../shared/types'

export function createRoutes(registry: AgentRegistry, messages: MessageRouter): Router {
  const router = Router()

  router.get('/agents', (_req: Request, res: Response) => {
    res.json(registry.list())
  })

  router.post('/agents/register', (req: Request, res: Response) => {
    try {
      const config: AgentConfig = req.body
      const state = registry.register(config)
      res.json(state)
    } catch (err: any) {
      res.status(400).json({ error: err.message })
    }
  })

  router.get('/agents/:name/ceo-notes', (req: Request, res: Response) => {
    const agent = registry.get(req.params.name)
    if (!agent) {
      res.status(404).json({ error: `Agent '${req.params.name}' not found` })
      return
    }
    res.json({ name: agent.name, ceoNotes: agent.ceoNotes, role: agent.role })
  })

  router.post('/messages/send', (req: Request, res: Response) => {
    const { from, to, message } = req.body
    const result = messages.send(from, to, message)
    res.json(result)
  })

  router.get('/messages/:name', (req: Request, res: Response) => {
    const msgs = messages.getMessages(req.params.name)
    res.json(msgs)
  })

  return router
}
```

- [ ] **Step 4: Implement server**

```typescript
// src/main/hub/server.ts
import express from 'express'
import type { Server } from 'http'
import { AgentRegistry } from './agent-registry'
import { MessageRouter } from './message-router'
import { generateSecret, validateSecret } from './auth'
import { createRoutes } from './routes'

export interface HubServer {
  port: number
  secret: string
  registry: AgentRegistry
  messages: MessageRouter
  close: () => void
}

export function createHubServer(preferredPort = 0): Promise<HubServer> {
  return new Promise((resolve, reject) => {
    const app = express()
    const secret = generateSecret()
    const registry = new AgentRegistry()
    const messages = new MessageRouter(registry)

    app.use(express.json())

    // Auth middleware
    app.use((req, res, next) => {
      const token = req.headers.authorization?.replace('Bearer ', '')
      if (!token || !validateSecret(secret, token)) {
        res.status(401).json({ error: 'Unauthorized' })
        return
      }
      next()
    })

    app.use(createRoutes(registry, messages))

    const server: Server = app.listen(preferredPort, '127.0.0.1', () => {
      const addr = server.address()
      if (!addr || typeof addr === 'string') {
        reject(new Error('Failed to get server address'))
        return
      }
      resolve({
        port: addr.port,
        secret,
        registry,
        messages,
        close: () => server.close()
      })
    })

    server.on('error', reject)
  })
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npx vitest run tests/integration/hub-server.test.ts
```

Expected: All 4 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/main/hub/routes.ts src/main/hub/server.ts tests/integration/hub-server.test.ts
git commit -m "feat: implement hub HTTP server with auth, agent registration, and message routing"
```

---

## Task 7: Output Buffer

**Files:**
- Create: `src/main/shell/output-buffer.ts`
- Test: `tests/unit/output-buffer.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/unit/output-buffer.test.ts
import { describe, it, expect } from 'vitest'
import { OutputBuffer } from '../../src/main/shell/output-buffer'

describe('OutputBuffer', () => {
  it('stores and retrieves lines', () => {
    const buf = new OutputBuffer(10)
    buf.push('line 1')
    buf.push('line 2')
    expect(buf.getLines(10)).toEqual(['line 1', 'line 2'])
  })

  it('respects max capacity (rolling)', () => {
    const buf = new OutputBuffer(3)
    buf.push('a')
    buf.push('b')
    buf.push('c')
    buf.push('d')
    expect(buf.getLines(10)).toEqual(['b', 'c', 'd'])
  })

  it('returns only requested number of lines', () => {
    const buf = new OutputBuffer(100)
    for (let i = 0; i < 10; i++) buf.push(`line-${i}`)
    expect(buf.getLines(3)).toEqual(['line-7', 'line-8', 'line-9'])
  })

  it('handles raw data with newlines', () => {
    const buf = new OutputBuffer(100)
    buf.pushRaw('line1\nline2\nline3')
    expect(buf.getLines(10)).toEqual(['line1', 'line2', 'line3'])
  })
})
```

- [ ] **Step 2: Run tests, verify fail**

```bash
npx vitest run tests/unit/output-buffer.test.ts
```

- [ ] **Step 3: Implement OutputBuffer**

```typescript
// src/main/shell/output-buffer.ts
export class OutputBuffer {
  private lines: string[] = []

  constructor(private maxLines: number = 1000) {}

  push(line: string): void {
    this.lines.push(line)
    while (this.lines.length > this.maxLines) {
      this.lines.shift()
    }
  }

  pushRaw(data: string): void {
    const newLines = data.split('\n')
    for (const line of newLines) {
      if (line.length > 0) {
        this.push(line)
      }
    }
  }

  getLines(count: number): string[] {
    return this.lines.slice(-count)
  }
}
```

- [ ] **Step 4: Run tests, verify pass**

```bash
npx vitest run tests/unit/output-buffer.test.ts
```

Expected: All 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/shell/output-buffer.ts tests/unit/output-buffer.test.ts
git commit -m "feat: implement rolling OutputBuffer for per-agent terminal output"
```

---

## Task 8: Status Detector

**Files:**
- Create: `src/main/shell/status-detector.ts`
- Test: `tests/unit/status-detector.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/unit/status-detector.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { StatusDetector } from '../../src/main/shell/status-detector'

describe('StatusDetector', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('starts in idle state', () => {
    const detector = new StatusDetector()
    expect(detector.status).toBe('idle')
  })

  it('transitions to working on data', () => {
    const detector = new StatusDetector()
    detector.onData('some output text')
    expect(detector.status).toBe('working')
  })

  it('transitions to active after prompt + silence', () => {
    const onChange = vi.fn()
    const detector = new StatusDetector({ promptRegex: />\s*$/, onChange })
    detector.onData('claude> ')
    expect(detector.status).toBe('working') // still working until silence

    vi.advanceTimersByTime(2500) // 2.5s silence
    expect(detector.status).toBe('active')
    expect(onChange).toHaveBeenCalledWith('active')
  })

  it('stays working if output continues after prompt-like text', () => {
    const detector = new StatusDetector({ promptRegex: />\s*$/ })
    detector.onData('value > 5 is valid')
    vi.advanceTimersByTime(1000)
    detector.onData('more output here')
    vi.advanceTimersByTime(2500)
    // Last line doesn't match prompt, so stays working
    expect(detector.status).toBe('working')
  })

  it('strips ANSI codes before matching', () => {
    const onChange = vi.fn()
    const detector = new StatusDetector({ promptRegex: />\s*$/, onChange })
    detector.onData('\x1b[32mclaude>\x1b[0m ')
    vi.advanceTimersByTime(2500)
    expect(detector.status).toBe('active')
  })

  it('transitions to disconnected on exit', () => {
    const detector = new StatusDetector()
    detector.onExit()
    expect(detector.status).toBe('disconnected')
  })
})
```

- [ ] **Step 2: Run tests, verify fail**

```bash
npx vitest run tests/unit/status-detector.test.ts
```

- [ ] **Step 3: Implement StatusDetector**

```typescript
// src/main/shell/status-detector.ts
import type { AgentStatus } from '../../shared/types'

// Strip ANSI escape sequences
function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')
}

interface StatusDetectorOptions {
  promptRegex?: RegExp
  silenceMs?: number
  onChange?: (status: AgentStatus) => void
}

export class StatusDetector {
  private _status: AgentStatus = 'idle'
  private promptRegex: RegExp
  private silenceMs: number
  private silenceTimer: ReturnType<typeof setTimeout> | null = null
  private lastLineMatchedPrompt = false
  private onChange?: (status: AgentStatus) => void

  constructor(opts: StatusDetectorOptions = {}) {
    this.promptRegex = opts.promptRegex ?? /[>❯]\s*$/
    this.silenceMs = opts.silenceMs ?? 2000
    this.onChange = opts.onChange
  }

  get status(): AgentStatus {
    return this._status
  }

  onData(data: string): void {
    this.setStatus('working')

    // Check if the last line of output matches the prompt pattern
    const clean = stripAnsi(data)
    const lines = clean.split('\n').filter(l => l.trim().length > 0)
    const lastLine = lines[lines.length - 1] ?? ''
    this.lastLineMatchedPrompt = this.promptRegex.test(lastLine)

    // Reset silence timer
    if (this.silenceTimer) clearTimeout(this.silenceTimer)
    this.silenceTimer = setTimeout(() => {
      if (this.lastLineMatchedPrompt && this._status === 'working') {
        this.setStatus('active')
      }
    }, this.silenceMs)
  }

  onExit(): void {
    if (this.silenceTimer) clearTimeout(this.silenceTimer)
    this.setStatus('disconnected')
  }

  private setStatus(status: AgentStatus): void {
    if (this._status !== status) {
      this._status = status
      this.onChange?.(status)
    }
  }
}
```

- [ ] **Step 4: Run tests, verify pass**

```bash
npx vitest run tests/unit/status-detector.test.ts
```

Expected: All 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/shell/status-detector.ts tests/unit/status-detector.test.ts
git commit -m "feat: implement StatusDetector with ANSI stripping, prompt regex, and silence heuristic"
```

---

## Task 9: MCP Config Writer

**Files:**
- Create: `src/main/mcp/config-writer.ts`
- Test: `tests/unit/config-writer.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/unit/config-writer.test.ts
import { describe, it, expect, afterEach } from 'vitest'
import { writeAgentMcpConfig, cleanupConfig } from '../../src/main/mcp/config-writer'
import { existsSync, readFileSync, unlinkSync } from 'fs'
import path from 'path'
import os from 'os'

describe('MCP Config Writer', () => {
  const createdFiles: string[] = []

  afterEach(() => {
    for (const f of createdFiles) {
      try { unlinkSync(f) } catch {}
    }
    createdFiles.length = 0
  })

  it('writes a valid MCP config JSON file', () => {
    const filePath = writeAgentMcpConfig({
      agentId: 'test-agent',
      agentName: 'worker-1',
      hubPort: 9999,
      hubSecret: 'abc123',
      mcpServerPath: '/path/to/mcp-server.js'
    })
    createdFiles.push(filePath)

    expect(existsSync(filePath)).toBe(true)
    expect(filePath).toContain('agentorch-test-agent')
    expect(filePath).toContain(os.tmpdir().replace(/\\/g, '/').charAt(0)) // starts with temp dir

    const content = JSON.parse(readFileSync(filePath, 'utf-8'))
    expect(content.mcpServers).toBeDefined()
    expect(content.mcpServers.agentorch).toBeDefined()
    expect(content.mcpServers.agentorch.command).toBe('node')
    expect(content.mcpServers.agentorch.args).toContain('/path/to/mcp-server.js')
  })

  it('cleans up config file', () => {
    const filePath = writeAgentMcpConfig({
      agentId: 'cleanup-test',
      agentName: 'worker-2',
      hubPort: 9999,
      hubSecret: 'abc123',
      mcpServerPath: '/path/to/mcp-server.js'
    })
    expect(existsSync(filePath)).toBe(true)
    cleanupConfig(filePath)
    expect(existsSync(filePath)).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests, verify fail**

```bash
npx vitest run tests/unit/config-writer.test.ts
```

- [ ] **Step 3: Implement config writer**

```typescript
// src/main/mcp/config-writer.ts
import { writeFileSync, unlinkSync } from 'fs'
import path from 'path'
import os from 'os'

interface McpConfigOptions {
  agentId: string
  agentName: string
  hubPort: number
  hubSecret: string
  mcpServerPath: string
}

export function writeAgentMcpConfig(opts: McpConfigOptions): string {
  const fileName = `agentorch-${opts.agentId}-mcp.json`
  const filePath = path.join(os.tmpdir(), fileName)

  const config = {
    mcpServers: {
      agentorch: {
        command: 'node',
        args: [opts.mcpServerPath],
        env: {
          AGENTORCH_HUB_PORT: String(opts.hubPort),
          AGENTORCH_HUB_SECRET: opts.hubSecret,
          AGENTORCH_AGENT_ID: opts.agentId,
          AGENTORCH_AGENT_NAME: opts.agentName
        }
      }
    }
  }

  writeFileSync(filePath, JSON.stringify(config, null, 2), 'utf-8')
  return filePath
}

export function cleanupConfig(filePath: string): void {
  try {
    unlinkSync(filePath)
  } catch {
    // File already deleted or inaccessible — ignore
  }
}
```

- [ ] **Step 4: Run tests, verify pass**

```bash
npx vitest run tests/unit/config-writer.test.ts
```

Expected: All 2 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/mcp/config-writer.ts tests/unit/config-writer.test.ts
git commit -m "feat: implement MCP config writer for per-agent temp config files"
```

---

## Task 10: MCP Server Binary (Stdio Relay)

**Files:**
- Create: `src/mcp-server/index.ts`

This is the standalone Node.js script that agent CLIs spawn via stdio. It translates MCP tool calls into hub HTTP API requests.

- [ ] **Step 1: Install MCP SDK**

```bash
cd F:/coding/AgentOrch
npm install @modelcontextprotocol/sdk
```

- [ ] **Step 2: Implement the MCP server relay**

```typescript
// src/mcp-server/index.ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'

const HUB_PORT = process.env.AGENTORCH_HUB_PORT
const HUB_SECRET = process.env.AGENTORCH_HUB_SECRET
const AGENT_ID = process.env.AGENTORCH_AGENT_ID
const AGENT_NAME = process.env.AGENTORCH_AGENT_NAME

if (!HUB_PORT || !HUB_SECRET || !AGENT_ID || !AGENT_NAME) {
  console.error('Missing required AGENTORCH_ environment variables')
  process.exit(1)
}

const HUB_URL = `http://127.0.0.1:${HUB_PORT}`

async function hubFetch(path: string, opts: RequestInit = {}): Promise<any> {
  const res = await fetch(`${HUB_URL}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${HUB_SECRET}`,
      ...opts.headers
    }
  })
  return res.json()
}

const server = new McpServer({
  name: 'agentorch',
  version: '1.0.0'
})

server.tool(
  'send_message',
  'Send a message to another agent in the workspace. The message will be queued and the target agent will receive it when they call get_messages().',
  {
    to: z.string().describe('Name of the target agent'),
    message: z.string().describe('The message to send')
  },
  async ({ to, message }) => {
    const result = await hubFetch('/messages/send', {
      method: 'POST',
      body: JSON.stringify({ from: AGENT_NAME, to, message })
    })
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
  }
)

server.tool(
  'get_messages',
  'Check for messages sent to you by other agents. Returns all queued messages and clears the queue. Call this after completing each task to check for new work.',
  {},
  async () => {
    const messages = await hubFetch(`/messages/${AGENT_NAME}`)
    if (messages.length === 0) {
      return { content: [{ type: 'text', text: 'No new messages.' }] }
    }
    return { content: [{ type: 'text', text: JSON.stringify(messages, null, 2) }] }
  }
)

server.tool(
  'get_agents',
  'List all agents in the workspace with their names, roles, CLI types, CEO notes, and current status.',
  {},
  async () => {
    const agents = await hubFetch('/agents')
    return { content: [{ type: 'text', text: JSON.stringify(agents, null, 2) }] }
  }
)

server.tool(
  'read_ceo_notes',
  'Re-read your CEO notes and role description. Useful for re-grounding after /clear or when you need to recall your instructions.',
  {},
  async () => {
    const notes = await hubFetch(`/agents/${AGENT_NAME}/ceo-notes`)
    return { content: [{ type: 'text', text: JSON.stringify(notes, null, 2) }] }
  }
)

async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
}

main().catch((err) => {
  console.error('MCP server failed to start:', err)
  process.exit(1)
})
```

- [ ] **Step 3: Install zod (MCP SDK dependency)**

```bash
npm install zod
```

- [ ] **Step 4: Verify the MCP server compiles**

```bash
npx tsc --noEmit --project tsconfig.node.json
```

Expected: No errors (or only expected Electron-related type issues).

- [ ] **Step 5: Commit**

```bash
git add src/mcp-server/index.ts
git commit -m "feat: implement MCP server stdio relay that bridges agent CLI tools to hub HTTP API"
```

---

## Task 11: PTY Manager

**Files:**
- Create: `src/main/shell/pty-manager.ts`

This module spawns and manages node-pty instances. It cannot be easily unit-tested (requires a real terminal), so we'll test it during integration.

- [ ] **Step 1: Implement PtyManager**

```typescript
// src/main/shell/pty-manager.ts
import * as pty from 'node-pty'
import type { IPty } from 'node-pty'
import { StatusDetector } from './status-detector'
import { OutputBuffer } from './output-buffer'
import type { AgentConfig, AgentStatus } from '../../shared/types'

export interface ManagedPty {
  pty: IPty
  config: AgentConfig
  statusDetector: StatusDetector
  outputBuffer: OutputBuffer
  mcpConfigPath: string | null
}

interface SpawnOptions {
  config: AgentConfig
  mcpConfigPath: string | null
  onData: (data: string) => void
  onExit: (exitCode: number | undefined) => void
  onStatusChange: (status: AgentStatus) => void
}

export function spawnAgentPty(opts: SpawnOptions): ManagedPty {
  const promptRegex = opts.config.promptRegex
    ? new RegExp(opts.config.promptRegex)
    : undefined

  const statusDetector = new StatusDetector({
    promptRegex,
    onChange: opts.onStatusChange
  })

  const outputBuffer = new OutputBuffer(1000)

  const shell = process.platform === 'win32' ? 'powershell.exe' : 'bash'

  // Admin elevation: on Windows, spawn PowerShell with -Verb RunAs via a wrapper.
  // Note: true elevation requires the parent process to have admin rights or a UAC prompt.
  // For MVP, we spawn a PowerShell that requests elevation via Start-Process if admin is requested.
  const shellArgs: string[] = []
  if (opts.config.admin && process.platform === 'win32') {
    // Launch an elevated PowerShell via Start-Process (will trigger UAC)
    // This opens a new elevated shell session inside the PTY
    // Limitation: UAC prompt appears as a separate OS dialog, not in the terminal
    console.warn(`Agent "${opts.config.name}" requested admin elevation — UAC prompt may appear`)
  }

  const ptyProcess = pty.spawn(shell, shellArgs, {
    name: 'xterm-256color',
    cols: 120,
    rows: 30,
    cwd: opts.config.cwd,
    env: { ...process.env } as Record<string, string>
  })

  ptyProcess.onData((data: string) => {
    statusDetector.onData(data)
    outputBuffer.pushRaw(data)
    opts.onData(data)
  })

  ptyProcess.onExit(({ exitCode }) => {
    statusDetector.onExit()
    opts.onExit(exitCode)
  })

  return {
    pty: ptyProcess,
    config: opts.config,
    statusDetector,
    outputBuffer,
    mcpConfigPath: opts.mcpConfigPath
  }
}

export function writeToPty(managed: ManagedPty, data: string): void {
  managed.pty.write(data)
}

export function resizePty(managed: ManagedPty, cols: number, rows: number): void {
  managed.pty.resize(cols, rows)
}

export function killPty(managed: ManagedPty): void {
  managed.pty.kill()
}
```

- [ ] **Step 2: Commit**

```bash
git add src/main/shell/pty-manager.ts
git commit -m "feat: implement PtyManager for spawning and managing node-pty instances"
```

---

## Task 12: Main Process Integration (IPC + Orchestration)

**Files:**
- Modify: `src/main/index.ts`
- Modify: `src/preload/index.ts`

Wire up the hub server, PTY manager, MCP config writer, and IPC handlers so the renderer can spawn/manage agents.

- [ ] **Step 1: Update src/main/index.ts with full orchestration**

```typescript
// src/main/index.ts
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
  // In dev: src/mcp-server/index.ts compiled to out/mcp-server/index.js
  // In prod: resources/mcp-server/index.js
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

    // Register in hub
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

  // PTY resize
  ipcMain.handle('pty:resize', (_event, agentId: string, cols: number, rows: number) => {
    const managed = agents.get(agentId)
    if (managed) resizePty(managed, cols, rows)
  })

  // App cwd (renderer can't access process.cwd)
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
  // Cleanup all agents
  for (const [id, managed] of agents) {
    killPty(managed)
    if (managed.mcpConfigPath) cleanupConfig(managed.mcpConfigPath)
  }
  agents.clear()
  hub?.close()
  app.quit()
})
```

- [ ] **Step 2: Update preload with full type-safe API**

```typescript
// src/preload/index.ts
import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../shared/types'

contextBridge.exposeInMainWorld('electronAPI', {
  spawnAgent: (config: unknown) => ipcRenderer.invoke(IPC.SPAWN_AGENT, config),
  killAgent: (agentId: string) => ipcRenderer.invoke(IPC.KILL_AGENT, agentId),
  getAgents: () => ipcRenderer.invoke(IPC.GET_AGENTS),
  getHubInfo: () => ipcRenderer.invoke(IPC.GET_HUB_INFO),
  writeToPty: (agentId: string, data: string) => ipcRenderer.invoke(IPC.WRITE_TO_PTY, agentId, data),
  resizePty: (agentId: string, cols: number, rows: number) => ipcRenderer.invoke('pty:resize', agentId, cols, rows),
  getCwd: () => ipcRenderer.invoke('app:cwd'),
  onPtyOutput: (callback: (agentId: string, data: string) => void) => {
    const handler = (_event: unknown, agentId: string, data: string) => callback(agentId, data)
    ipcRenderer.on(IPC.PTY_OUTPUT, handler)
    return () => ipcRenderer.removeListener(IPC.PTY_OUTPUT, handler)
  },
  onPtyExit: (callback: (agentId: string, exitCode: number | undefined) => void) => {
    const handler = (_event: unknown, agentId: string, exitCode: number | undefined) => callback(agentId, exitCode)
    ipcRenderer.on(IPC.PTY_EXIT, handler)
    return () => ipcRenderer.removeListener(IPC.PTY_EXIT, handler)
  },
  onAgentStateUpdate: (callback: (agents: unknown[]) => void) => {
    const handler = (_event: unknown, agents: unknown[]) => callback(agents)
    ipcRenderer.on(IPC.AGENT_STATE_UPDATE, handler)
    return () => ipcRenderer.removeListener(IPC.AGENT_STATE_UPDATE, handler)
  }
})
```

- [ ] **Step 3: Add type declaration for the preload API**

Create `src/renderer/electron.d.ts`:

```typescript
import type { AgentConfig, AgentState, HubInfo } from '../shared/types'

declare global {
  interface Window {
    electronAPI: {
      spawnAgent: (config: AgentConfig) => Promise<{ id: string; mcpConfigPath: string }>
      killAgent: (agentId: string) => Promise<void>
      getAgents: () => Promise<AgentState[]>
      getHubInfo: () => Promise<HubInfo>
      writeToPty: (agentId: string, data: string) => Promise<void>
      resizePty: (agentId: string, cols: number, rows: number) => Promise<void>
      getCwd: () => Promise<string>
      onPtyOutput: (callback: (agentId: string, data: string) => void) => () => void
      onPtyExit: (callback: (agentId: string, exitCode: number | undefined) => void) => () => void
      onAgentStateUpdate: (callback: (agents: AgentState[]) => void) => () => void
    }
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add src/main/index.ts src/preload/index.ts src/renderer/electron.d.ts
git commit -m "feat: wire up main process IPC — hub server, PTY spawn, MCP config, agent lifecycle"
```

---

## Task 13: UI — FloatingWindow Component

**Files:**
- Create: `src/renderer/components/FloatingWindow.tsx`

- [ ] **Step 1: Implement FloatingWindow**

```tsx
// src/renderer/components/FloatingWindow.tsx
import React, { useState, useCallback } from 'react'
import { Rnd } from 'react-rnd'

interface FloatingWindowProps {
  id: string
  title: string
  statusColor?: string  // color of the status dot
  initialX?: number
  initialY?: number
  initialWidth?: number
  initialHeight?: number
  zIndex: number
  minimized: boolean
  onFocus: () => void
  onMinimize: () => void
  onMaximize: () => void
  onClose: () => void
  children: React.ReactNode
}

export function FloatingWindow({
  id,
  title,
  statusColor,
  initialX = 50,
  initialY = 50,
  initialWidth = 600,
  initialHeight = 400,
  zIndex,
  minimized,
  onFocus,
  onMinimize,
  onMaximize,
  onClose,
  children
}: FloatingWindowProps): React.ReactElement | null {
  const [maximized, setMaximized] = useState(false)

  const handleMaximize = useCallback(() => {
    setMaximized(prev => !prev)
    onMaximize()
  }, [onMaximize])

  if (minimized) return null

  const style: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    border: '1px solid #333',
    borderRadius: '6px',
    overflow: 'hidden',
    backgroundColor: '#0d0d0d',
    boxShadow: '0 4px 20px rgba(0,0,0,0.5)'
  }

  const position = maximized ? { x: 0, y: 0 } : { x: initialX, y: initialY }
  const size = maximized
    ? { width: '100%', height: '100%' }
    : { width: initialWidth, height: initialHeight }

  return (
    <Rnd
      default={{ x: initialX, y: initialY, width: initialWidth, height: initialHeight }}
      position={maximized ? position : undefined}
      size={maximized ? size : undefined}
      style={{ ...style, zIndex }}
      dragHandleClassName="window-titlebar"
      minWidth={300}
      minHeight={200}
      disableDragging={maximized}
      enableResizing={!maximized}
      onMouseDown={onFocus}
      bounds="parent"
    >
      {/* Title bar */}
      <div
        className="window-titlebar"
        style={{
          height: '32px',
          backgroundColor: '#1e1e1e',
          display: 'flex',
          alignItems: 'center',
          padding: '0 10px',
          cursor: 'grab',
          userSelect: 'none',
          flexShrink: 0
        }}
        onDoubleClick={handleMaximize}
      >
        {statusColor && (
          <div style={{
            width: 8, height: 8, borderRadius: '50%',
            backgroundColor: statusColor, marginRight: 8
          }} />
        )}
        <span style={{ flex: 1, fontSize: '12px', color: '#ccc' }}>{title}</span>
        <button onClick={onMinimize} style={btnStyle}>─</button>
        <button onClick={handleMaximize} style={btnStyle}>{maximized ? '❐' : '□'}</button>
        <button onClick={onClose} style={{ ...btnStyle, color: '#e55' }}>✕</button>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        {children}
      </div>
    </Rnd>
  )
}

const btnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: '#888',
  cursor: 'pointer',
  padding: '0 6px',
  fontSize: '14px',
  lineHeight: '32px'
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/components/FloatingWindow.tsx
git commit -m "feat: implement FloatingWindow with drag, resize, minimize, maximize, close"
```

---

## Task 14: UI — Window Manager Hook

**Files:**
- Create: `src/renderer/hooks/useWindowManager.ts`

- [ ] **Step 1: Implement useWindowManager**

```typescript
// src/renderer/hooks/useWindowManager.ts
import { useState, useCallback } from 'react'

export interface WindowState {
  id: string
  title: string
  statusColor?: string
  x: number
  y: number
  width: number
  height: number
  zIndex: number
  minimized: boolean
}

let nextZ = 1

export function useWindowManager() {
  const [windows, setWindows] = useState<Map<string, WindowState>>(new Map())

  const addWindow = useCallback((id: string, title: string, statusColor?: string) => {
    setWindows(prev => {
      const next = new Map(prev)
      const offset = next.size * 30
      next.set(id, {
        id,
        title,
        statusColor,
        x: 50 + offset,
        y: 50 + offset,
        width: 600,
        height: 400,
        zIndex: ++nextZ,
        minimized: false
      })
      return next
    })
  }, [])

  const removeWindow = useCallback((id: string) => {
    setWindows(prev => {
      const next = new Map(prev)
      next.delete(id)
      return next
    })
  }, [])

  const focusWindow = useCallback((id: string) => {
    setWindows(prev => {
      const next = new Map(prev)
      const win = next.get(id)
      if (win) {
        win.zIndex = ++nextZ
        win.minimized = false
      }
      return next
    })
  }, [])

  const minimizeWindow = useCallback((id: string) => {
    setWindows(prev => {
      const next = new Map(prev)
      const win = next.get(id)
      if (win) win.minimized = true
      return next
    })
  }, [])

  const updateStatusColor = useCallback((id: string, color: string) => {
    setWindows(prev => {
      const next = new Map(prev)
      const win = next.get(id)
      if (win) win.statusColor = color
      return next
    })
  }, [])

  return {
    windows: Array.from(windows.values()),
    addWindow,
    removeWindow,
    focusWindow,
    minimizeWindow,
    updateStatusColor
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/hooks/useWindowManager.ts
git commit -m "feat: implement useWindowManager hook for floating window state management"
```

---

## Task 15: UI — useAgents Hook

**Files:**
- Create: `src/renderer/hooks/useAgents.ts`

- [ ] **Step 1: Implement useAgents**

```typescript
// src/renderer/hooks/useAgents.ts
import { useState, useEffect, useCallback } from 'react'
import type { AgentConfig, AgentState } from '../../shared/types'
import { v4 as uuid } from 'uuid'

const STATUS_COLORS: Record<string, string> = {
  idle: '#888',
  active: '#4caf50',
  working: '#ffc107',
  disconnected: '#f44336'
}

export function useAgents() {
  const [agents, setAgents] = useState<AgentState[]>([])

  useEffect(() => {
    const cleanup = window.electronAPI.onAgentStateUpdate((updated) => {
      setAgents(updated)
    })
    // Initial fetch
    window.electronAPI.getAgents().then(setAgents)
    return cleanup
  }, [])

  const spawnAgent = useCallback(async (config: Omit<AgentConfig, 'id'>) => {
    const fullConfig: AgentConfig = { ...config, id: uuid() }
    await window.electronAPI.spawnAgent(fullConfig)
    return fullConfig.id
  }, [])

  const killAgent = useCallback(async (agentId: string) => {
    await window.electronAPI.killAgent(agentId)
  }, [])

  const getStatusColor = useCallback((status: string) => {
    return STATUS_COLORS[status] ?? '#888'
  }, [])

  return { agents, spawnAgent, killAgent, getStatusColor }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/hooks/useAgents.ts
git commit -m "feat: implement useAgents hook for agent state and lifecycle via IPC"
```

---

## Task 16: UI — TerminalWindow Component

**Files:**
- Create: `src/renderer/components/TerminalWindow.tsx`

- [ ] **Step 1: Implement TerminalWindow**

```tsx
// src/renderer/components/TerminalWindow.tsx
import React, { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'

interface TerminalWindowProps {
  agentId: string
}

export function TerminalWindow({ agentId }: TerminalWindowProps): React.ReactElement {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)

  useEffect(() => {
    if (!containerRef.current) return

    const term = new Terminal({
      theme: {
        background: '#0d0d0d',
        foreground: '#e0e0e0',
        cursor: '#e0e0e0',
        selectionBackground: '#444'
      },
      fontFamily: "'Cascadia Code', 'Fira Code', 'Consolas', monospace",
      fontSize: 13,
      cursorBlink: true,
      scrollback: 5000
    })

    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(containerRef.current)
    fit.fit()

    termRef.current = term
    fitRef.current = fit

    // Receive output from PTY
    const cleanupOutput = window.electronAPI.onPtyOutput((id, data) => {
      if (id === agentId) term.write(data)
    })

    // Send input to PTY
    const disposable = term.onData((data) => {
      window.electronAPI.writeToPty(agentId, data)
    })

    // Handle resize
    const observer = new ResizeObserver(() => {
      fit.fit()
      const { cols, rows } = term
      window.electronAPI.resizePty(agentId, cols, rows)
    })
    observer.observe(containerRef.current)

    return () => {
      cleanupOutput()
      disposable.dispose()
      observer.disconnect()
      term.dispose()
    }
  }, [agentId])

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '100%', backgroundColor: '#0d0d0d' }}
    />
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/components/TerminalWindow.tsx
git commit -m "feat: implement TerminalWindow with xterm.js, PTY IO via IPC, and auto-resize"
```

---

## Task 17: UI — TopBar and AgentPill

**Files:**
- Create: `src/renderer/components/AgentPill.tsx`
- Create: `src/renderer/components/TopBar.tsx`

- [ ] **Step 1: Implement AgentPill**

```tsx
// src/renderer/components/AgentPill.tsx
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
```

- [ ] **Step 2: Implement TopBar**

```tsx
// src/renderer/components/TopBar.tsx
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
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer/components/AgentPill.tsx src/renderer/components/TopBar.tsx
git commit -m "feat: implement TopBar with agent status pills and spawn button"
```

---

## Task 18: UI — SpawnDialog

**Files:**
- Create: `src/renderer/components/SpawnDialog.tsx`

- [ ] **Step 1: Implement SpawnDialog**

```tsx
// src/renderer/components/SpawnDialog.tsx
import React, { useState, useEffect } from 'react'
import type { AgentConfig } from '../../shared/types'

interface SpawnDialogProps {
  onSpawn: (config: Omit<AgentConfig, 'id'>) => void
  onCancel: () => void
}

const CLI_PRESETS = [
  { label: 'Claude Code', value: 'claude' },
  { label: 'Codex CLI', value: 'codex' },
  { label: 'Kimi CLI', value: 'kimi' },
  { label: 'Custom', value: '' }
]

export function SpawnDialog({ onSpawn, onCancel }: SpawnDialogProps): React.ReactElement {
  const [name, setName] = useState('')
  const [cli, setCli] = useState('claude')
  const [customCli, setCustomCli] = useState('')
  const [cwd, setCwd] = useState('')

  // Fetch cwd from main process (process.cwd is unavailable in renderer with contextIsolation)
  useEffect(() => {
    window.electronAPI.getCwd().then(setCwd)
  }, [])
  const [role, setRole] = useState('')
  const [ceoNotes, setCeoNotes] = useState('')
  const [admin, setAdmin] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [promptRegex, setPromptRegex] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSpawn({
      name: name.trim(),
      cli: cli || customCli.trim(),
      cwd: cwd.trim(),
      role: role.trim(),
      ceoNotes: ceoNotes.trim(),
      admin,
      promptRegex: promptRegex.trim() || undefined
    })
  }

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 99999
    }}>
      <form
        onSubmit={handleSubmit}
        style={{
          backgroundColor: '#1e1e1e',
          border: '1px solid #333',
          borderRadius: '8px',
          padding: '24px',
          width: '450px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px'
        }}
      >
        <h2 style={{ margin: 0, fontSize: '16px', color: '#e0e0e0' }}>New Agent</h2>

        <label style={labelStyle}>
          Name
          <input value={name} onChange={e => setName(e.target.value)} required style={inputStyle} placeholder="worker-1" />
        </label>

        <label style={labelStyle}>
          CLI
          <select value={cli} onChange={e => setCli(e.target.value)} style={inputStyle}>
            {CLI_PRESETS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </label>

        {cli === '' && (
          <label style={labelStyle}>
            Custom Command
            <input value={customCli} onChange={e => setCustomCli(e.target.value)} required style={inputStyle} placeholder="my-agent --flag" />
          </label>
        )}

        <label style={labelStyle}>
          Working Directory
          <input value={cwd} onChange={e => setCwd(e.target.value)} style={inputStyle} />
        </label>

        <label style={labelStyle}>
          Role
          <input value={role} onChange={e => setRole(e.target.value)} style={inputStyle} placeholder="Decompiler" />
        </label>

        <label style={labelStyle}>
          CEO Notes
          <textarea
            value={ceoNotes}
            onChange={e => setCeoNotes(e.target.value)}
            style={{ ...inputStyle, height: '80px', resize: 'vertical' }}
            placeholder="Instructions for this agent..."
          />
        </label>

        <label style={{ ...labelStyle, flexDirection: 'row', alignItems: 'center', gap: '8px' }}>
          <input type="checkbox" checked={admin} onChange={e => setAdmin(e.target.checked)} />
          Run as admin
        </label>

        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer', textAlign: 'left', fontSize: '12px' }}
        >
          {showAdvanced ? '▼' : '▶'} Advanced
        </button>

        {showAdvanced && (
          <label style={labelStyle}>
            Prompt Regex Override
            <input value={promptRegex} onChange={e => setPromptRegex(e.target.value)} style={inputStyle} placeholder="[>❯]\s*$" />
          </label>
        )}

        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '8px' }}>
          <button type="button" onClick={onCancel} style={cancelBtnStyle}>Cancel</button>
          <button type="submit" disabled={!name.trim()} style={spawnBtnStyle}>Spawn</button>
        </div>
      </form>
    </div>
  )
}

const labelStyle: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: '4px',
  fontSize: '12px', color: '#aaa'
}

const inputStyle: React.CSSProperties = {
  backgroundColor: '#2a2a2a', border: '1px solid #444', borderRadius: '4px',
  padding: '8px', color: '#e0e0e0', fontSize: '13px', fontFamily: 'inherit'
}

const cancelBtnStyle: React.CSSProperties = {
  padding: '8px 16px', backgroundColor: '#2a2a2a', border: '1px solid #444',
  borderRadius: '4px', color: '#aaa', cursor: 'pointer', fontSize: '13px'
}

const spawnBtnStyle: React.CSSProperties = {
  padding: '8px 16px', backgroundColor: '#2d5a2d', border: '1px solid #4caf50',
  borderRadius: '4px', color: '#4caf50', cursor: 'pointer', fontSize: '13px'
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/components/SpawnDialog.tsx
git commit -m "feat: implement SpawnDialog with agent config form, CLI presets, and CEO Notes"
```

---

## Task 19: UI — Workspace + App Assembly

**Files:**
- Create: `src/renderer/components/Workspace.tsx`
- Modify: `src/renderer/App.tsx`

- [ ] **Step 1: Implement Workspace**

```tsx
// src/renderer/components/Workspace.tsx
import React from 'react'
import { FloatingWindow } from './FloatingWindow'
import { TerminalWindow } from './TerminalWindow'
import type { WindowState } from '../hooks/useWindowManager'
import type { AgentState } from '../../shared/types'

const STATUS_COLORS: Record<string, string> = {
  idle: '#888',
  active: '#4caf50',
  working: '#ffc107',
  disconnected: '#f44336'
}

interface WorkspaceProps {
  windows: WindowState[]
  agents: AgentState[]
  onFocusWindow: (id: string) => void
  onMinimizeWindow: (id: string) => void
  onCloseWindow: (id: string) => void
}

export function Workspace({
  windows,
  agents,
  onFocusWindow,
  onMinimizeWindow,
  onCloseWindow
}: WorkspaceProps): React.ReactElement {
  return (
    <div style={{
      flex: 1,
      position: 'relative',
      overflow: 'hidden',
      backgroundColor: '#111'
    }}>
      {windows.map(win => {
        const agent = agents.find(a => a.id === win.id)
        const statusColor = agent ? STATUS_COLORS[agent.status] ?? '#888' : undefined
        const title = agent
          ? `${agent.name} (${agent.cli}) · ${agent.role}`
          : win.title

        return (
          <FloatingWindow
            key={win.id}
            id={win.id}
            title={title}
            statusColor={statusColor}
            initialX={win.x}
            initialY={win.y}
            initialWidth={win.width}
            initialHeight={win.height}
            zIndex={win.zIndex}
            minimized={win.minimized}
            onFocus={() => onFocusWindow(win.id)}
            onMinimize={() => onMinimizeWindow(win.id)}
            onMaximize={() => onFocusWindow(win.id)}
            onClose={() => onCloseWindow(win.id)}
          >
            <TerminalWindow agentId={win.id} />
          </FloatingWindow>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2: Assemble App.tsx**

```tsx
// src/renderer/App.tsx
import React, { useState, useCallback, useEffect } from 'react'
import { TopBar } from './components/TopBar'
import { Workspace } from './components/Workspace'
import { SpawnDialog } from './components/SpawnDialog'
import { useWindowManager } from './hooks/useWindowManager'
import { useAgents } from './hooks/useAgents'
import type { AgentConfig } from '../shared/types'

export function App(): React.ReactElement {
  const [showSpawnDialog, setShowSpawnDialog] = useState(false)
  const { windows, addWindow, removeWindow, focusWindow, minimizeWindow } = useWindowManager()
  const { agents, spawnAgent, killAgent, getStatusColor } = useAgents()

  const handleSpawn = useCallback(async (config: Omit<AgentConfig, 'id'>) => {
    setShowSpawnDialog(false)
    const agentId = await spawnAgent(config)
    addWindow(agentId, `${config.name} (${config.cli})`, getStatusColor('idle'))
  }, [spawnAgent, addWindow, getStatusColor])

  const handleClose = useCallback(async (agentId: string) => {
    await killAgent(agentId)
    removeWindow(agentId)
  }, [killAgent, removeWindow])

  const handleAgentPillClick = useCallback((agentId: string) => {
    focusWindow(agentId)
  }, [focusWindow])

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
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [windows, focusWindow])

  return (
    <div style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <TopBar
        agents={agents}
        onSpawnClick={() => setShowSpawnDialog(true)}
        onAgentClick={handleAgentPillClick}
      />
      <Workspace
        windows={windows}
        agents={agents}
        onFocusWindow={focusWindow}
        onMinimizeWindow={minimizeWindow}
        onCloseWindow={handleClose}
      />
      {showSpawnDialog && (
        <SpawnDialog
          onSpawn={handleSpawn}
          onCancel={() => setShowSpawnDialog(false)}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer/components/Workspace.tsx src/renderer/App.tsx
git commit -m "feat: assemble full UI — Workspace with floating terminals, TopBar, SpawnDialog"
```

---

## Task 20: Integration — Initial Prompt Injection

**Files:**
- Modify: `src/main/index.ts`

After spawning an agent, the app needs to inject the initial prompt (CEO notes, role, agent list) and then launch the agent CLI with the MCP config.

**Important ordering note:** Agent registration in the hub (`hub.registry.register()`) happens in the `SPAWN_AGENT` IPC handler in Task 12 — BEFORE the agent CLI launches and spawns the MCP server instance. This means the MCP server's tool calls (`get_agents`, `read_ceo_notes`, etc.) will always find the agent already registered. The delay in Step 2 below further ensures the CLI and MCP server have time to initialize before any tool calls are made.

- [ ] **Step 1: Add launch sequence helper to main/index.ts**

Add this function to `src/main/index.ts`:

```typescript
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
  // For known CLIs, add MCP config flag
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
  // For custom CLIs, just launch them (no MCP)
  return `${cliBase}\r`
}
```

Then update the `SPAWN_AGENT` handler to inject the prompt after a short delay (let the shell initialize):

```typescript
// Inside SPAWN_AGENT handler, after creating the managed PTY:
setTimeout(() => {
  const launchCmd = buildCliLaunchCommand(config, mcpConfigPath)
  writeToPty(managed, launchCmd)

  // After CLI starts, inject the initial prompt
  setTimeout(() => {
    const prompt = buildInitialPrompt(config, hub.registry.list())
    writeToPty(managed, prompt + '\r')
  }, 3000) // Give the CLI time to initialize
}, 1000) // Give the shell time to start
```

- [ ] **Step 2: Commit**

```bash
git add src/main/index.ts
git commit -m "feat: add initial prompt injection — launches agent CLI with MCP config and injects role context"
```

---

## Task 21: End-to-End Smoke Test

**Files:** No new files — manual verification.

- [ ] **Step 1: Run the app in dev mode**

```bash
cd F:/coding/AgentOrch
npm run dev
```

- [ ] **Step 2: Verify the window opens**

Expected: Dark window with top bar showing "Click + to spawn an agent".

- [ ] **Step 3: Click + and spawn an agent**

Fill in:
- Name: "test-agent"
- CLI: Claude Code
- Working Directory: F:/coding/AgentOrch
- Role: "Tester"
- CEO Notes: "You are a test agent. After each task, call get_messages()."

Click Spawn. Expected: A floating terminal window appears with a PowerShell session that launches `claude`.

- [ ] **Step 4: Verify the terminal is interactive**

Type in the terminal window. Expected: Input appears in the terminal, agent responds.

- [ ] **Step 5: Spawn a second agent and test messaging**

Spawn another agent named "worker-1". In the first agent (test-agent), ask it to call `send_message("worker-1", "hello from test-agent")`. In worker-1, ask it to call `get_messages()`.

Expected: worker-1 receives the message from test-agent.

- [ ] **Step 6: Fix any issues found during testing**

Address any bugs, adjust timing delays, fix IPC issues.

- [ ] **Step 7: Commit fixes**

```bash
git add -A
git commit -m "fix: address issues found during end-to-end smoke testing"
```

---

## Task 22: Run All Unit Tests

- [ ] **Step 1: Run the full test suite**

```bash
cd F:/coding/AgentOrch
npx vitest run
```

Expected: All tests pass (agent-registry, message-router, auth, output-buffer, status-detector, config-writer, hub-server).

- [ ] **Step 2: Fix any failing tests**

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "test: verify all unit and integration tests pass"
```

---

## Summary

| Task | Component | Type |
|------|-----------|------|
| 1 | Project scaffolding | Setup |
| 2 | Shared types | Setup |
| 3 | Agent registry | Core + Tests |
| 4 | Message router | Core + Tests |
| 5 | Hub auth | Core + Tests |
| 6 | Hub HTTP server | Core + Tests |
| 7 | Output buffer | Core + Tests |
| 8 | Status detector | Core + Tests |
| 9 | MCP config writer | Core + Tests |
| 10 | MCP server binary | Core |
| 11 | PTY manager | Core |
| 12 | Main process IPC | Integration |
| 13 | FloatingWindow | UI |
| 14 | Window manager hook | UI |
| 15 | useAgents hook | UI |
| 16 | TerminalWindow | UI |
| 17 | TopBar + AgentPill | UI |
| 18 | SpawnDialog | UI |
| 19 | Workspace + App assembly | UI |
| 20 | Initial prompt injection | Integration |
| 21 | End-to-end smoke test | Testing |
| 22 | Run all unit tests | Testing |
