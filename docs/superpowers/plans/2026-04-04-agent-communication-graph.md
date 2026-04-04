# Agent Communication Graph Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add visual node links between agent windows that create scoped communication groups — agents only see messages/tasks/info from their group. Unlinked agents retain global access.

**Architecture:** Phase A adds groupId to data models and filtering in hub business logic. Phase B adds visual link ports on windows, SVG line overlay, drag-to-connect interaction, and link persistence. Groups are auto-detected from connected components in the link graph.

**Tech Stack:** TypeScript, React, SVG, vitest

**Spec:** `docs/superpowers/specs/2026-04-04-agent-communication-graph-design.md`

---

### File Map

| Action | File | Responsibility |
|--------|------|---------------|
| Modify | `src/shared/types.ts` | Add groupId to Message, PinboardTask, InfoEntry, AgentConfig; add AgentGroup + LinkState interfaces; add IPC channels |
| Create | `src/main/hub/group-manager.ts` | Link CRUD, connected component detection, group assignment |
| Create | `tests/unit/group-manager.test.ts` | Tests for link/unlink, group auto-detection |
| Modify | `src/main/hub/message-router.ts` | Group-scoped message filtering |
| Modify | `src/main/hub/pinboard.ts` | Group-scoped task filtering |
| Modify | `src/main/hub/info-channel.ts` | Group-scoped info filtering |
| Modify | `src/main/hub/routes.ts` | New routes for groups/links |
| Modify | `src/main/hub/server.ts` | Add GroupManager to hub |
| Modify | `src/main/index.ts` | Group IPC handlers, link persistence |
| Modify | `src/mcp-server/index.ts` | Add get_my_group tool |
| Modify | `src/preload/index.ts` | Group IPC bridge |
| Create | `src/renderer/components/LinkOverlay.tsx` | SVG lines between linked windows |
| Modify | `src/renderer/components/FloatingWindow.tsx` | Add link port (drag source) |
| Modify | `src/renderer/components/Workspace.tsx` | LinkOverlay integration, link drawing state |
| Modify | `src/renderer/App.tsx` | Link state management, group IPC |

---

## Phase A: Backend (Hub Scoping)

### Task 1: Types + GroupManager

**Files:**
- Modify: `src/shared/types.ts`
- Create: `src/main/hub/group-manager.ts`
- Create: `tests/unit/group-manager.test.ts`

- [ ] **Step 1: Add types**

In `src/shared/types.ts`, add `groupId?: string` to these interfaces:

On `AgentConfig` (after `skills`):
```ts
  groupId?: string  // communication group — set by link system
```

On `Message` (after `timestamp`):
```ts
  groupId?: string
```

On `PinboardTask` (after `createdAt`):
```ts
  groupId?: string
```

On `InfoEntry` (after `createdAt`):
```ts
  groupId?: string
```

Add new interfaces after `Skill`:
```ts
export interface AgentGroup {
  id: string
  name: string
  color: string
  members: string[]
}

export interface LinkState {
  links: Array<{ from: string; to: string }>
  groups: AgentGroup[]
}
```

Add IPC channels:
```ts
  GROUP_GET_ALL: 'group:get-all',
  GROUP_ADD_LINK: 'group:add-link',
  GROUP_REMOVE_LINK: 'group:remove-link',
  GROUP_GET_LINKS: 'group:get-links',
```

- [ ] **Step 2: Write GroupManager tests**

Create `tests/unit/group-manager.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { GroupManager } from '../../src/main/hub/group-manager'

describe('GroupManager', () => {
  let gm: GroupManager

  beforeEach(() => {
    gm = new GroupManager()
  })

  describe('addLink', () => {
    it('creates a link between two agents', () => {
      gm.addLink('A', 'B')
      expect(gm.getLinks()).toHaveLength(1)
      expect(gm.getLinks()[0]).toEqual({ from: 'A', to: 'B' })
    })

    it('does not create duplicate links', () => {
      gm.addLink('A', 'B')
      gm.addLink('A', 'B')
      gm.addLink('B', 'A')
      expect(gm.getLinks()).toHaveLength(1)
    })

    it('auto-detects groups from connected components', () => {
      gm.addLink('A', 'B')
      gm.addLink('B', 'C')
      const groups = gm.getGroups()
      expect(groups).toHaveLength(1)
      expect(groups[0].members.sort()).toEqual(['A', 'B', 'C'])
    })

    it('creates separate groups for disconnected clusters', () => {
      gm.addLink('A', 'B')
      gm.addLink('C', 'D')
      const groups = gm.getGroups()
      expect(groups).toHaveLength(2)
    })
  })

  describe('removeLink', () => {
    it('removes a link', () => {
      gm.addLink('A', 'B')
      gm.removeLink('A', 'B')
      expect(gm.getLinks()).toHaveLength(0)
    })

    it('splits groups when a link is removed', () => {
      gm.addLink('A', 'B')
      gm.addLink('B', 'C')
      expect(gm.getGroups()).toHaveLength(1)

      gm.removeLink('A', 'B')
      // A is now isolated, B-C remain linked
      const groups = gm.getGroups()
      expect(groups).toHaveLength(1) // Only B-C (A becomes unlinked/global)
      expect(groups[0].members.sort()).toEqual(['B', 'C'])
    })
  })

  describe('getGroupForAgent', () => {
    it('returns the group for a linked agent', () => {
      gm.addLink('A', 'B')
      const group = gm.getGroupForAgent('A')
      expect(group).not.toBeNull()
      expect(group!.members).toContain('A')
      expect(group!.members).toContain('B')
    })

    it('returns null for an unlinked agent', () => {
      expect(gm.getGroupForAgent('X')).toBeNull()
    })
  })

  describe('canCommunicate', () => {
    it('allows same-group agents', () => {
      gm.addLink('A', 'B')
      expect(gm.canCommunicate('A', 'B')).toBe(true)
    })

    it('blocks cross-group agents', () => {
      gm.addLink('A', 'B')
      gm.addLink('C', 'D')
      expect(gm.canCommunicate('A', 'C')).toBe(false)
    })

    it('allows unlinked agents to talk to anyone', () => {
      gm.addLink('A', 'B')
      expect(gm.canCommunicate('X', 'A')).toBe(true) // X is unlinked
      expect(gm.canCommunicate('A', 'X')).toBe(true) // target is unlinked
    })

    it('allows two unlinked agents to talk', () => {
      expect(gm.canCommunicate('X', 'Y')).toBe(true)
    })
  })

  describe('serialization', () => {
    it('exports and imports state', () => {
      gm.addLink('A', 'B')
      gm.addLink('C', 'D')
      const state = gm.exportState()

      const gm2 = new GroupManager()
      gm2.importState(state)
      expect(gm2.getLinks()).toHaveLength(2)
      expect(gm2.getGroups()).toHaveLength(2)
    })
  })
})
```

- [ ] **Step 3: Implement GroupManager**

Create `src/main/hub/group-manager.ts`:

```ts
import type { AgentGroup, LinkState } from '../../shared/types'

const GROUP_COLORS = [
  '#4a9eff', '#4caf50', '#ffc107', '#e91e63', '#9c27b0',
  '#00bcd4', '#ff5722', '#8bc34a', '#3f51b5', '#ff9800'
]

interface Link {
  from: string
  to: string
}

export class GroupManager {
  private links: Link[] = []
  private groups: AgentGroup[] = []
  private nextGroupNum = 1
  onChange?: () => void

  addLink(from: string, to: string): void {
    // Normalize: always store alphabetically to prevent duplicates
    const [a, b] = [from, to].sort()
    const exists = this.links.some(l => l.from === a && l.to === b)
    if (exists) return

    this.links.push({ from: a, to: b })
    this.recalculateGroups()
    this.onChange?.()
  }

  removeLink(from: string, to: string): void {
    const [a, b] = [from, to].sort()
    this.links = this.links.filter(l => !(l.from === a && l.to === b))
    this.recalculateGroups()
    this.onChange?.()
  }

  getLinks(): Link[] {
    return [...this.links]
  }

  getGroups(): AgentGroup[] {
    return [...this.groups]
  }

  getGroupForAgent(agentName: string): AgentGroup | null {
    return this.groups.find(g => g.members.includes(agentName)) ?? null
  }

  getGroupIdForAgent(agentName: string): string | null {
    return this.getGroupForAgent(agentName)?.id ?? null
  }

  canCommunicate(from: string, to: string): boolean {
    const fromGroup = this.getGroupForAgent(from)
    const toGroup = this.getGroupForAgent(to)

    // Unlinked agents can talk to anyone
    if (!fromGroup || !toGroup) return true

    // Same group = OK
    return fromGroup.id === toGroup.id
  }

  exportState(): LinkState {
    return {
      links: [...this.links],
      groups: [...this.groups]
    }
  }

  importState(state: LinkState): void {
    this.links = [...state.links]
    this.recalculateGroups()
  }

  private recalculateGroups(): void {
    // Find connected components using union-find
    const agents = new Set<string>()
    for (const link of this.links) {
      agents.add(link.from)
      agents.add(link.to)
    }

    const parent = new Map<string, string>()
    for (const agent of agents) parent.set(agent, agent)

    const find = (x: string): string => {
      while (parent.get(x) !== x) {
        parent.set(x, parent.get(parent.get(x)!)!)
        x = parent.get(x)!
      }
      return x
    }

    const union = (a: string, b: string) => {
      parent.set(find(a), find(b))
    }

    for (const link of this.links) {
      union(link.from, link.to)
    }

    // Group by root
    const components = new Map<string, string[]>()
    for (const agent of agents) {
      const root = find(agent)
      if (!components.has(root)) components.set(root, [])
      components.get(root)!.push(agent)
    }

    // Filter out single-node components (need at least 2 to be a group)
    const clusters = Array.from(components.values()).filter(c => c.length >= 2)

    // Preserve existing group IDs where possible, assign new ones for new clusters
    const newGroups: AgentGroup[] = []
    for (const members of clusters) {
      const sorted = members.sort()
      // Find existing group that contains these members
      const existing = this.groups.find(g =>
        g.members.length === sorted.length &&
        g.members.sort().every((m, i) => m === sorted[i])
      )

      if (existing) {
        newGroups.push(existing)
      } else {
        newGroups.push({
          id: `group-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          name: `Group ${this.nextGroupNum++}`,
          color: GROUP_COLORS[(newGroups.length) % GROUP_COLORS.length],
          members: sorted
        })
      }
    }

    this.groups = newGroups
  }
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/unit/group-manager.test.ts`
Expected: All PASS

- [ ] **Step 5: Type-check + commit**

Run: `npx tsc --noEmit`

```bash
git add src/shared/types.ts src/main/hub/group-manager.ts tests/unit/group-manager.test.ts
git commit -m "feat: GroupManager with link CRUD, connected component detection, group scoping"
```

---

### Task 2: Hub Scoping — Message, Task, Info Filtering

**Files:**
- Modify: `src/main/hub/message-router.ts`
- Modify: `src/main/hub/pinboard.ts`
- Modify: `src/main/hub/info-channel.ts`
- Modify: `src/main/hub/server.ts`

- [ ] **Step 1: Add GroupManager to hub server**

In `src/main/hub/server.ts`, import and add GroupManager:

```ts
import { GroupManager } from './group-manager'
```

Add to HubServer interface:
```ts
  groupManager: GroupManager
```

In `createHubServer`, create it:
```ts
    const groupManager = new GroupManager()
```

Add to resolved object:
```ts
        groupManager,
```

- [ ] **Step 2: Scope MessageRouter.send()**

In `src/main/hub/message-router.ts`, the constructor already receives `registry`. We need access to the GroupManager too. Change the constructor:

```ts
  constructor(private registry: AgentRegistry, private groupManager?: GroupManager) {}
```

Import at top:
```ts
import type { GroupManager } from './group-manager'
```

In the `send()` method, after the target check (`if (!target)`), add group check:

```ts
    // Group scoping: check if sender can communicate with target
    if (this.groupManager && !this.groupManager.canCommunicate(from, to)) {
      return { status: 'error', detail: `Agent '${to}' is not in your group` }
    }
```

When creating the message, add groupId:

Change the `msg` object to include:
```ts
      groupId: this.groupManager?.getGroupIdForAgent(from) ?? undefined
```

- [ ] **Step 3: Scope Pinboard**

In `src/main/hub/pinboard.ts`, add groupId to PinboardTask interface:
```ts
  groupId?: string
```

Update `postTask` signature to accept groupId:
```ts
  postTask(title: string, description: string, priority: 'low' | 'medium' | 'high' = 'medium', createdBy?: string, groupId?: string): PinboardTask {
```

Set it on the task object:
```ts
      groupId: groupId ?? undefined,
```

Add a `readTasks` overload that filters by groupId:
```ts
  readTasksForGroup(groupId: string | null): PinboardTask[] {
    if (!groupId) return this.readTasks() // unlinked = see all
    return this.readTasks().filter(t => !t.groupId || t.groupId === groupId)
  }
```

- [ ] **Step 4: Scope InfoChannel**

In `src/main/hub/info-channel.ts`, add groupId to the postInfo method:

```ts
  postInfo(from: string, note: string, tags: string[] = [], groupId?: string): InfoEntry {
```

Add to the entry object:
```ts
      groupId: groupId ?? undefined,
```

Add filtered read:
```ts
  readInfoForGroup(groupId: string | null, tags?: string[]): InfoEntry[] {
    let entries = groupId
      ? this.entries.filter(e => !e.groupId || e.groupId === groupId)
      : [...this.entries]

    if (tags && tags.length > 0) {
      entries = entries.filter(entry => entry.tags.some(tag => tags.includes(tag)))
    }
    return entries
  }
```

- [ ] **Step 5: Wire GroupManager into MessageRouter in server.ts**

In `createHubServer`, pass groupManager to MessageRouter:
```ts
    const messages = new MessageRouter(registry, groupManager)
```

- [ ] **Step 6: Type-check + commit**

Run: `npx tsc --noEmit`

```bash
git add src/main/hub/message-router.ts src/main/hub/pinboard.ts src/main/hub/info-channel.ts src/main/hub/server.ts
git commit -m "feat: group-scoped messaging, tasks, and info — filtered by agent group membership"
```

---

### Task 3: Group Routes + IPC + MCP Tool

**Files:**
- Modify: `src/main/hub/routes.ts`
- Modify: `src/main/index.ts`
- Modify: `src/mcp-server/index.ts`
- Modify: `src/preload/index.ts`

- [ ] **Step 1: Add group routes**

In `src/main/hub/routes.ts`, import GroupManager:
```ts
import type { GroupManager } from './group-manager'
```

Add `groupManager` parameter to `createRoutes` (after projectPathRef):
```ts
  groupManager?: GroupManager
```

Add routes before the output route section:

```ts
  // --- Group routes ---

  router.get('/groups', (_req: Request, res: Response) => {
    if (!groupManager) { res.json([]); return }
    res.json(groupManager.getGroups())
  })

  router.get('/groups/links', (_req: Request, res: Response) => {
    if (!groupManager) { res.json([]); return }
    res.json(groupManager.getLinks())
  })

  router.post('/groups/link', (req: Request, res: Response) => {
    if (!groupManager) { res.status(503).json({ error: 'Groups not available' }); return }
    const { from, to } = req.body
    if (!from || !to) { res.status(400).json({ error: 'from and to required' }); return }
    groupManager.addLink(from, to)
    res.json({ status: 'ok', groups: groupManager.getGroups() })
  })

  router.delete('/groups/link', (req: Request, res: Response) => {
    if (!groupManager) { res.status(503).json({ error: 'Groups not available' }); return }
    const { from, to } = req.body
    if (!from || !to) { res.status(400).json({ error: 'from and to required' }); return }
    groupManager.removeLink(from, to)
    res.json({ status: 'ok', groups: groupManager.getGroups() })
  })
```

Pass groupManager in `createRoutes` call in `server.ts`:
```ts
    app.use(createRoutes(registry, messages, outputRef, pinboard, infoChannel, messageStoreRef, buddyRoom, projectPathRef, groupManager))
```

- [ ] **Step 2: Add group IPC handlers in main process**

In `src/main/index.ts`, add IPC handlers in `setupIPC()`:

```ts
  // Group IPC
  ipcMain.handle(IPC.GROUP_GET_ALL, () => hub?.groupManager.getGroups() ?? [])
  ipcMain.handle(IPC.GROUP_GET_LINKS, () => hub?.groupManager.getLinks() ?? [])
  ipcMain.handle(IPC.GROUP_ADD_LINK, (_event, from: string, to: string) => {
    if (!hub) return { error: 'No project open' }
    hub.groupManager.addLink(from, to)
    // Update agent groupIds in registry
    for (const agent of hub.registry.list()) {
      const groupId = hub.groupManager.getGroupIdForAgent(agent.name)
      agent.groupId = groupId ?? undefined
    }
    mainWindow?.webContents.send(IPC.AGENT_STATE_UPDATE, getVisibleAgents())
    saveLinkState()
    return { status: 'ok', groups: hub.groupManager.getGroups() }
  })
  ipcMain.handle(IPC.GROUP_REMOVE_LINK, (_event, from: string, to: string) => {
    if (!hub) return { error: 'No project open' }
    hub.groupManager.removeLink(from, to)
    for (const agent of hub.registry.list()) {
      const groupId = hub.groupManager.getGroupIdForAgent(agent.name)
      agent.groupId = groupId ?? undefined
    }
    mainWindow?.webContents.send(IPC.AGENT_STATE_UPDATE, getVisibleAgents())
    saveLinkState()
    return { status: 'ok', groups: hub.groupManager.getGroups() }
  })
```

Add link persistence functions (near the top of the file, after imports):

```ts
function saveLinkState(): void {
  if (!projectManager?.currentProject || !hub) return
  const linksPath = path.join(projectManager.currentProject.path, '.agentorch', 'links.json')
  const state = hub.groupManager.exportState()
  fs.writeFileSync(linksPath, JSON.stringify(state, null, 2), 'utf-8')
}

function loadLinkState(): void {
  if (!projectManager?.currentProject || !hub) return
  const linksPath = path.join(projectManager.currentProject.path, '.agentorch', 'links.json')
  if (fs.existsSync(linksPath)) {
    try {
      const state = JSON.parse(fs.readFileSync(linksPath, 'utf-8'))
      hub.groupManager.importState(state)
    } catch { /* corrupt file */ }
  }
}
```

Call `loadLinkState()` in `openProject()`, after hub is created.

- [ ] **Step 3: Add preload bridge**

In `src/preload/index.ts`:
```ts
  // Groups
  getGroups: () => ipcRenderer.invoke(IPC.GROUP_GET_ALL),
  getLinks: () => ipcRenderer.invoke(IPC.GROUP_GET_LINKS),
  addLink: (from: string, to: string) => ipcRenderer.invoke(IPC.GROUP_ADD_LINK, from, to),
  removeLink: (from: string, to: string) => ipcRenderer.invoke(IPC.GROUP_REMOVE_LINK, from, to),
```

- [ ] **Step 4: Add get_my_group MCP tool**

In `src/mcp-server/index.ts`, add before `async function main()`:

```ts
server.tool(
  'get_my_group',
  'Get information about your communication group — who you can talk to, group name, and members. Returns null if you are unlinked (global access).',
  {},
  async () => {
    try {
      const agents = await hubFetch('/agents')
      const me = agents.find((a: any) => a.name === AGENT_NAME)
      if (!me || !me.groupId) return toolResult('You are unlinked — you have global access to all agents, tasks, and info.')

      const groups = await hubFetch('/groups')
      const myGroup = groups.find((g: any) => g.members.includes(AGENT_NAME))
      if (!myGroup) return toolResult('You are unlinked — global access.')

      return toolResult(myGroup)
    } catch (err: any) {
      return toolError(`Failed to get group info: ${err.message}`)
    }
  }
)
```

- [ ] **Step 5: Type-check + commit**

Run: `npx tsc --noEmit`

```bash
git add src/main/hub/routes.ts src/main/hub/server.ts src/main/index.ts src/mcp-server/index.ts src/preload/index.ts
git commit -m "feat: group routes, IPC handlers, link persistence, get_my_group MCP tool"
```

---

## Phase B: Frontend (Visual Links)

### Task 4: LinkOverlay SVG Component

**Files:**
- Create: `src/renderer/components/LinkOverlay.tsx`

- [ ] **Step 1: Create the SVG overlay**

Create `src/renderer/components/LinkOverlay.tsx` — renders SVG bezier curves between linked agent windows:

```tsx
import React from 'react'
import type { WindowState } from '../hooks/useWindowManager'

interface LinkOverlayProps {
  links: Array<{ from: string; to: string }>
  groups: Array<{ id: string; color: string; members: string[] }>
  windows: WindowState[]
  agents: Array<{ id: string; name: string }>
  zoom: number
  pan: { x: number; y: number }
  // Active drawing state
  drawing: boolean
  drawFrom: { x: number; y: number } | null
  drawTo: { x: number; y: number } | null
}

export function LinkOverlay({
  links, groups, windows, agents, zoom, pan,
  drawing, drawFrom, drawTo
}: LinkOverlayProps): React.ReactElement {

  const getWindowCenter = (agentName: string): { x: number; y: number } | null => {
    const agent = agents.find(a => a.name === agentName)
    if (!agent) return null
    const win = windows.find(w => w.id === agent.id)
    if (!win) return null
    return {
      x: (win.x + win.width / 2) * zoom + pan.x,
      y: (win.y + win.height / 2) * zoom + pan.y
    }
  }

  const getPortPosition = (agentName: string): { x: number; y: number } | null => {
    const agent = agents.find(a => a.name === agentName)
    if (!agent) return null
    const win = windows.find(w => w.id === agent.id)
    if (!win) return null
    return {
      x: (win.x + win.width) * zoom + pan.x,
      y: (win.y + win.height / 2) * zoom + pan.y
    }
  }

  const getGroupColor = (from: string, to: string): string => {
    for (const group of groups) {
      if (group.members.includes(from) && group.members.includes(to)) {
        return group.color
      }
    }
    return '#666'
  }

  return (
    <svg style={{
      position: 'absolute',
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      pointerEvents: 'none',
      zIndex: 1
    }}>
      {/* Persistent links */}
      {links.map((link, i) => {
        const fromPos = getPortPosition(link.from)
        const toPos = getPortPosition(link.to)
        if (!fromPos || !toPos) return null

        const color = getGroupColor(link.from, link.to)
        const midX = (fromPos.x + toPos.x) / 2
        const cpOffset = Math.abs(toPos.x - fromPos.x) * 0.4

        return (
          <path
            key={`${link.from}-${link.to}-${i}`}
            d={`M ${fromPos.x} ${fromPos.y} C ${fromPos.x + cpOffset} ${fromPos.y}, ${toPos.x - cpOffset} ${toPos.y}, ${toPos.x} ${toPos.y}`}
            stroke={color}
            strokeWidth={2}
            fill="none"
            opacity={0.6}
            style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
          />
        )
      })}

      {/* Active drawing line */}
      {drawing && drawFrom && drawTo && (
        <line
          x1={drawFrom.x}
          y1={drawFrom.y}
          x2={drawTo.x}
          y2={drawTo.y}
          stroke="#4a9eff"
          strokeWidth={2}
          strokeDasharray="5,5"
          opacity={0.8}
        />
      )}
    </svg>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/components/LinkOverlay.tsx
git commit -m "feat: LinkOverlay SVG component — bezier curves between linked agents"
```

---

### Task 5: Link Ports on FloatingWindow

**Files:**
- Modify: `src/renderer/components/FloatingWindow.tsx`

- [ ] **Step 1: Add link port props and rendering**

Add new props to FloatingWindowProps:
```ts
  isAgent?: boolean  // only show link port on agent windows
  groupColor?: string  // color of the link port
  onLinkDragStart?: (e: React.MouseEvent) => void  // start link drawing
```

In the FloatingWindow JSX, add a link port element. Find the title bar area and add after it (or at the right edge of the window):

```tsx
        {isAgent && onLinkDragStart && (
          <div
            onMouseDown={onLinkDragStart}
            title="Drag to link with another agent"
            style={{
              position: 'absolute',
              right: -4,
              top: '50%',
              transform: 'translateY(-50%)',
              width: 10,
              height: 10,
              borderRadius: '50%',
              backgroundColor: groupColor || '#666',
              border: '2px solid #333',
              cursor: 'crosshair',
              zIndex: 10,
            }}
          />
        )}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/components/FloatingWindow.tsx
git commit -m "feat: link port on FloatingWindow — drag source for agent connections"
```

---

### Task 6: Wire Everything in Workspace + App

**Files:**
- Modify: `src/renderer/components/Workspace.tsx`
- Modify: `src/renderer/App.tsx`

- [ ] **Step 1: Add link state to App.tsx**

In `src/renderer/App.tsx`, add state:

```ts
  const [links, setLinks] = useState<Array<{ from: string; to: string }>>([])
  const [groups, setGroups] = useState<Array<{ id: string; color: string; members: string[] }>>([])
```

Add effect to load links on project open:
```ts
  useEffect(() => {
    if (!project) return
    window.electronAPI.getLinks().then(setLinks)
    window.electronAPI.getGroups().then(setGroups)
  }, [project])
```

Add link handlers:
```ts
  const handleAddLink = useCallback(async (from: string, to: string) => {
    const result = await window.electronAPI.addLink(from, to)
    if (result.groups) {
      setGroups(result.groups)
      setLinks(await window.electronAPI.getLinks())
    }
  }, [])

  const handleRemoveLink = useCallback(async (from: string, to: string) => {
    const result = await window.electronAPI.removeLink(from, to)
    if (result.groups) {
      setGroups(result.groups)
      setLinks(await window.electronAPI.getLinks())
    }
  }, [])
```

Pass to Workspace:
```tsx
  <Workspace
    links={links}
    groups={groups}
    agents={agents}
    onAddLink={handleAddLink}
    onRemoveLink={handleRemoveLink}
    // ... existing props
  />
```

- [ ] **Step 2: Add link drawing to Workspace**

In `src/renderer/components/Workspace.tsx`, import LinkOverlay:
```ts
import { LinkOverlay } from './LinkOverlay'
```

Add props:
```ts
  links: Array<{ from: string; to: string }>
  groups: Array<{ id: string; color: string; members: string[] }>
  onAddLink: (from: string, to: string) => void
  onRemoveLink: (from: string, to: string) => void
```

Add link drawing state:
```ts
  const [linkDrawing, setLinkDrawing] = useState(false)
  const [linkFrom, setLinkFrom] = useState<{ name: string; x: number; y: number } | null>(null)
  const [linkMouse, setLinkMouse] = useState<{ x: number; y: number } | null>(null)
```

Add mouse handlers for link drawing:
```ts
  const handleLinkDragStart = useCallback((agentName: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setLinkDrawing(true)
    setLinkFrom({ name: agentName, x: e.clientX, y: e.clientY })
    setLinkMouse({ x: e.clientX, y: e.clientY })
  }, [])

  // Add mousemove/mouseup on the viewport for link drawing
  useEffect(() => {
    if (!linkDrawing) return

    const handleMove = (e: MouseEvent) => {
      setLinkMouse({ x: e.clientX, y: e.clientY })
    }
    const handleUp = (e: MouseEvent) => {
      setLinkDrawing(false)
      setLinkMouse(null)

      // Check if we dropped on an agent window
      const target = document.elementFromPoint(e.clientX, e.clientY)
      const windowEl = target?.closest('[data-agent-name]')
      if (windowEl && linkFrom) {
        const targetName = windowEl.getAttribute('data-agent-name')
        if (targetName && targetName !== linkFrom.name) {
          onAddLink(linkFrom.name, targetName)
        }
      }
      setLinkFrom(null)
    }

    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
    return () => {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
    }
  }, [linkDrawing, linkFrom, onAddLink])
```

Render the LinkOverlay BEFORE the windows in the viewport:
```tsx
  <LinkOverlay
    links={links}
    groups={groups}
    windows={windows}
    agents={agents}
    zoom={zoom}
    pan={pan}
    drawing={linkDrawing}
    drawFrom={linkFrom}
    drawTo={linkMouse}
  />
```

Pass link port props to each FloatingWindow. For agent windows (not panels), add:
```tsx
  isAgent={!panelType}
  groupColor={agent ? groups.find(g => g.members.includes(agent.name))?.color : undefined}
  onLinkDragStart={agent ? (e: React.MouseEvent) => handleLinkDragStart(agent.name, e) : undefined}
```

Add `data-agent-name` attribute to each FloatingWindow wrapper div for drop target detection. This can be done by wrapping the FloatingWindow in a div:
```tsx
  <div data-agent-name={agent?.name}>
    <FloatingWindow ... />
  </div>
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`

- [ ] **Step 4: Run tests**

Run: `npx vitest run`

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/Workspace.tsx src/renderer/App.tsx
git commit -m "feat: visual link system — drag from port to connect agents, SVG lines on canvas"
```

---

### Summary

| Task | What | Risk |
|------|------|------|
| 1 | Types + GroupManager (TDD) | Low — isolated module |
| 2 | Hub scoping (messages, tasks, info) | Medium — touches 3 core modules |
| 3 | Routes, IPC, MCP tool, persistence | Medium — integration work |
| 4 | LinkOverlay SVG component | Low — new component |
| 5 | Link port on FloatingWindow | Low — small UI addition |
| 6 | Wire into Workspace + App | **High** — largest integration, drag interaction |
