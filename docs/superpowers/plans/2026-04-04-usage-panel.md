# Usage Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Usage panel showing per-agent session activity (free tracking) and on-demand provider limit checks (sends /usage to PTY when user clicks Refresh).

**Architecture:** New AgentMetrics class tracks hub activity counters (zero cost). UsagePanel component displays metrics + parsed /usage output. On-demand refresh sends /usage to each agent's PTY, captures new OutputBuffer lines after 3s, parses CLI-specific data.

**Tech Stack:** TypeScript, React, vitest

**Spec:** `docs/superpowers/specs/2026-04-04-usage-panel-design.md`

---

### File Map

| Action | File | Responsibility |
|--------|------|---------------|
| Create | `src/main/hub/agent-metrics.ts` | Per-agent activity counters |
| Modify | `src/main/shell/output-buffer.ts` | Add lineCount getter |
| Modify | `src/shared/types.ts` | Add AgentMetrics interface + IPC channels |
| Modify | `src/main/hub/server.ts` | Add AgentMetrics to hub |
| Modify | `src/main/hub/message-router.ts` | Increment message counters |
| Modify | `src/main/index.ts` | Wire metrics + usage IPC handlers |
| Modify | `src/preload/index.ts` | Expose usage IPC |
| Create | `src/renderer/components/UsagePanel.tsx` | Usage panel UI |
| Modify | `src/renderer/components/TopBar.tsx` | Add Usage toggle |
| Modify | `src/renderer/components/Workspace.tsx` | Render UsagePanel |
| Modify | `src/renderer/App.tsx` | Usage panel state |

---

### Task 1: AgentMetrics + Types

**Files:**
- Create: `src/main/hub/agent-metrics.ts`
- Modify: `src/shared/types.ts`
- Modify: `src/main/shell/output-buffer.ts`

- [ ] **Step 1: Add types**

In `src/shared/types.ts`, add interface after LinkState:

```ts
export interface AgentMetricsData {
  agentName: string
  cli: string
  model: string
  messagesSent: number
  messagesReceived: number
  tasksPosted: number
  tasksClaimed: number
  tasksCompleted: number
  infoPosted: number
  spawnedAt: string
  providerUsage?: {
    used: number
    total: number
    unit: string
    raw?: string
  }
}
```

Add IPC channels:
```ts
  USAGE_GET_METRICS: 'usage:get-metrics',
  USAGE_REFRESH_LIMITS: 'usage:refresh-limits',
```

- [ ] **Step 2: Add lineCount to OutputBuffer**

In `src/main/shell/output-buffer.ts`, add a getter after `getLines`:

```ts
  get lineCount(): number {
    return this.lines.length
  }
```

- [ ] **Step 3: Create AgentMetrics**

Create `src/main/hub/agent-metrics.ts`:

```ts
export interface MetricsCounters {
  messagesSent: number
  messagesReceived: number
  tasksPosted: number
  tasksClaimed: number
  tasksCompleted: number
  infoPosted: number
  spawnedAt: string
}

export class AgentMetrics {
  private metrics = new Map<string, MetricsCounters>()

  register(agentName: string): void {
    if (!this.metrics.has(agentName)) {
      this.metrics.set(agentName, {
        messagesSent: 0,
        messagesReceived: 0,
        tasksPosted: 0,
        tasksClaimed: 0,
        tasksCompleted: 0,
        infoPosted: 0,
        spawnedAt: new Date().toISOString()
      })
    }
  }

  increment(agentName: string, field: keyof Omit<MetricsCounters, 'spawnedAt'>): void {
    const m = this.metrics.get(agentName)
    if (m) (m[field] as number)++
  }

  get(agentName: string): MetricsCounters | null {
    return this.metrics.get(agentName) ?? null
  }

  getAll(): Map<string, MetricsCounters> {
    return new Map(this.metrics)
  }

  remove(agentName: string): void {
    this.metrics.delete(agentName)
  }

  clear(): void {
    this.metrics.clear()
  }
}
```

- [ ] **Step 4: Type-check + commit**

Run: `npx tsc --noEmit`

```bash
git add src/shared/types.ts src/main/hub/agent-metrics.ts src/main/shell/output-buffer.ts
git commit -m "feat: AgentMetrics counter tracking + lineCount on OutputBuffer"
```

---

### Task 2: Wire Metrics into Hub

**Files:**
- Modify: `src/main/hub/server.ts`
- Modify: `src/main/hub/message-router.ts`
- Modify: `src/main/index.ts`
- Modify: `src/preload/index.ts`

- [ ] **Step 1: Add AgentMetrics to hub server**

In `src/main/hub/server.ts`:

Import:
```ts
import { AgentMetrics } from './agent-metrics'
```

Add to HubServer interface:
```ts
  agentMetrics: AgentMetrics
```

In `createHubServer`, create it:
```ts
    const agentMetrics = new AgentMetrics()
```

Add to resolved object:
```ts
        agentMetrics,
```

- [ ] **Step 2: Increment message counters**

In `src/main/hub/message-router.ts`, add AgentMetrics parameter. The constructor is currently:
```ts
constructor(private registry: AgentRegistry, private groupManager?: GroupManager) {}
```

Import AgentMetrics:
```ts
import type { AgentMetrics } from './agent-metrics'
```

Change to:
```ts
constructor(private registry: AgentRegistry, private groupManager?: GroupManager, private metrics?: AgentMetrics) {}
```

In `send()`, after the message is successfully queued (after `this.onMessageQueued?.(msg)`), add:
```ts
    this.metrics?.increment(from, 'messagesSent')
    this.metrics?.increment(to, 'messagesReceived')
```

Pass agentMetrics in server.ts:
```ts
    const messages = new MessageRouter(registry, groupManager, agentMetrics)
```

- [ ] **Step 3: Increment task + info counters in main process**

In `src/main/index.ts`, in the `openProject` function, after the existing `onTaskCreated` callback setup, update it to also track metrics:

Find the `hub.pinboard.onTaskCreated` callback and add inside it:
```ts
      hub.agentMetrics.increment(task.createdBy || 'unknown', 'tasksPosted')
```

Find the `hub.pinboard.onTaskUpdated` callback and add inside it:
```ts
      if (task.status === 'in_progress' && task.claimedBy) {
        hub.agentMetrics.increment(task.claimedBy, 'tasksClaimed')
      }
      if (task.status === 'completed' && task.claimedBy) {
        hub.agentMetrics.increment(task.claimedBy, 'tasksCompleted')
      }
```

Find the `hub.infoChannel.onEntryAdded` callback and add inside it:
```ts
      hub.agentMetrics.increment(entry.from, 'infoPosted')
```

Also register agents with metrics when they spawn. In the SPAWN_AGENT handler, after `hub.registry.register(config)`:
```ts
    hub.agentMetrics.register(config.name)
```

- [ ] **Step 4: Add usage IPC handlers**

In `setupIPC()`, add:

```ts
  // Usage IPC
  ipcMain.handle(IPC.USAGE_GET_METRICS, () => {
    if (!hub) return []
    const result: any[] = []
    const allMetrics = hub.agentMetrics.getAll()
    for (const agent of hub.registry.list()) {
      if (agent.name === 'user') continue
      const m = allMetrics.get(agent.name)
      result.push({
        agentName: agent.name,
        cli: agent.cli,
        model: agent.model || 'default',
        messagesSent: m?.messagesSent ?? 0,
        messagesReceived: m?.messagesReceived ?? 0,
        tasksPosted: m?.tasksPosted ?? 0,
        tasksClaimed: m?.tasksClaimed ?? 0,
        tasksCompleted: m?.tasksCompleted ?? 0,
        infoPosted: m?.infoPosted ?? 0,
        spawnedAt: m?.spawnedAt ?? agent.createdAt
      })
    }
    return result
  })

  ipcMain.handle(IPC.USAGE_REFRESH_LIMITS, async () => {
    if (!hub) return []
    const results: any[] = []

    for (const [, managed] of agents) {
      if (managed.config.cli === 'terminal') continue

      // Record current line count
      const beforeCount = managed.outputBuffer.lineCount

      // Send /usage command
      writeToPty(managed, '/usage\r')

      // Wait for response
      await new Promise(resolve => setTimeout(resolve, 3000))

      // Capture new lines
      const afterCount = managed.outputBuffer.lineCount
      const newLineCount = afterCount - beforeCount
      const newLines = newLineCount > 0
        ? managed.outputBuffer.getLines(newLineCount)
        : []
      const rawOutput = newLines.join('\n')

      // Try to parse usage data
      let providerUsage: any = undefined
      // Claude pattern: "X / Y messages" or "X% used"
      const claudeMatch = rawOutput.match(/(\d[\d,]*)\s*\/\s*(\d[\d,]*)\s*(messages?|tokens?|requests?)/i)
      if (claudeMatch) {
        providerUsage = {
          used: parseInt(claudeMatch[1].replace(/,/g, '')),
          total: parseInt(claudeMatch[2].replace(/,/g, '')),
          unit: claudeMatch[3].toLowerCase()
        }
      }
      // Generic percentage pattern
      if (!providerUsage) {
        const pctMatch = rawOutput.match(/(\d+(?:\.\d+)?)\s*%\s*(used|remaining|left)/i)
        if (pctMatch) {
          const pct = parseFloat(pctMatch[1])
          const isRemaining = pctMatch[2].toLowerCase() !== 'used'
          providerUsage = {
            used: isRemaining ? Math.round(100 - pct) : Math.round(pct),
            total: 100,
            unit: 'percent'
          }
        }
      }
      // If no pattern matched, include raw output
      if (!providerUsage && rawOutput.trim()) {
        providerUsage = { used: 0, total: 0, unit: 'unknown', raw: rawOutput.trim() }
      }

      results.push({
        agentName: managed.config.name,
        providerUsage
      })
    }

    return results
  })
```

- [ ] **Step 5: Add preload bridge**

In `src/preload/index.ts`:
```ts
  // Usage
  getUsageMetrics: () => ipcRenderer.invoke(IPC.USAGE_GET_METRICS),
  refreshUsageLimits: () => ipcRenderer.invoke(IPC.USAGE_REFRESH_LIMITS),
```

- [ ] **Step 6: Type-check + commit**

Run: `npx tsc --noEmit`

```bash
git add src/main/hub/server.ts src/main/hub/message-router.ts src/main/hub/agent-metrics.ts src/main/index.ts src/preload/index.ts
git commit -m "feat: wire usage metrics into hub — track messages, tasks, info + on-demand /usage capture"
```

---

### Task 3: UsagePanel UI + TopBar/Workspace/App Wiring

**Files:**
- Create: `src/renderer/components/UsagePanel.tsx`
- Modify: `src/renderer/components/TopBar.tsx`
- Modify: `src/renderer/components/Workspace.tsx`
- Modify: `src/renderer/App.tsx`

- [ ] **Step 1: Create UsagePanel**

Create `src/renderer/components/UsagePanel.tsx`:

```tsx
import React, { useState, useEffect } from 'react'

interface AgentMetricsData {
  agentName: string
  cli: string
  model: string
  messagesSent: number
  messagesReceived: number
  tasksPosted: number
  tasksClaimed: number
  tasksCompleted: number
  infoPosted: number
  spawnedAt: string
  providerUsage?: {
    used: number
    total: number
    unit: string
    raw?: string
  }
}

declare const electronAPI: {
  getUsageMetrics: () => Promise<AgentMetricsData[]>
  refreshUsageLimits: () => Promise<Array<{ agentName: string; providerUsage?: any }>>
}

function formatUptime(spawnedAt: string): string {
  const ms = Date.now() - new Date(spawnedAt).getTime()
  const mins = Math.floor(ms / 60000)
  const hours = Math.floor(mins / 60)
  if (hours > 0) return `${hours}h ${mins % 60}m`
  return `${mins}m`
}

function UsageBar({ used, total, unit }: { used: number; total: number; unit: string }): React.ReactElement {
  const pct = total > 0 ? Math.min((used / total) * 100, 100) : 0
  const remaining = total - used
  const color = pct > 90 ? '#f44336' : pct > 70 ? '#ffc107' : '#4caf50'

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '2px' }}>
        <span style={{ color: '#aaa' }}>
          {unit === 'percent' ? `${Math.round(100 - pct)}% remaining` : `${remaining.toLocaleString()} / ${total.toLocaleString()} ${unit} left`}
        </span>
        <span style={{ color: '#666' }}>{Math.round(pct)}% used</span>
      </div>
      <div style={{ height: '6px', backgroundColor: '#333', borderRadius: '3px', overflow: 'hidden' }}>
        <div style={{
          height: '100%', width: `${pct}%`,
          backgroundColor: color, borderRadius: '3px',
          transition: 'width 0.3s'
        }} />
      </div>
    </div>
  )
}

export function UsagePanel(): React.ReactElement {
  const [metrics, setMetrics] = useState<AgentMetricsData[]>([])
  const [refreshing, setRefreshing] = useState(false)
  const [lastRefreshed, setLastRefreshed] = useState<string | null>(null)

  useEffect(() => {
    electronAPI.getUsageMetrics().then(setMetrics)
  }, [])

  const handleRefresh = async () => {
    setRefreshing(true)
    // Get fresh activity metrics
    const freshMetrics = await electronAPI.getUsageMetrics()

    // Get provider limits
    const limits = await electronAPI.refreshUsageLimits()

    // Merge limits into metrics
    const merged = freshMetrics.map(m => {
      const limit = limits.find(l => l.agentName === m.agentName)
      return { ...m, providerUsage: limit?.providerUsage }
    })

    setMetrics(merged)
    setLastRefreshed(new Date().toLocaleTimeString())
    setRefreshing(false)
  }

  return (
    <div style={{
      height: '100%', display: 'flex', flexDirection: 'column',
      backgroundColor: '#1e1e1e', color: '#e0e0e0', fontSize: '13px'
    }}>
      <div style={{
        padding: '8px 12px', borderBottom: '1px solid #333',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center'
      }}>
        <span style={{ fontSize: '12px', color: '#888', fontWeight: 500 }}>Usage</span>
        <button onClick={handleRefresh} disabled={refreshing} style={{
          padding: '3px 10px', fontSize: '11px', borderRadius: '4px', cursor: 'pointer',
          border: '1px solid #4a9eff', backgroundColor: '#1e3a5f', color: '#8cc4ff'
        }}>{refreshing ? 'Checking...' : 'Refresh Limits'}</button>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {metrics.length === 0 ? (
          <div style={{ color: '#555', textAlign: 'center', padding: '20px 0' }}>
            No agents running. Spawn agents to see usage.
          </div>
        ) : metrics.map(m => (
          <div key={m.agentName} style={{
            padding: '10px', backgroundColor: '#252525', borderRadius: '6px', border: '1px solid #333',
            display: 'flex', flexDirection: 'column', gap: '6px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 500, color: '#e0e0e0' }}>{m.agentName}</span>
              <span style={{ fontSize: '10px', color: '#666' }}>{m.cli} {m.model}</span>
            </div>

            {/* Provider usage bar */}
            {m.providerUsage && m.providerUsage.total > 0 && m.providerUsage.unit !== 'unknown' && (
              <UsageBar used={m.providerUsage.used} total={m.providerUsage.total} unit={m.providerUsage.unit} />
            )}

            {m.providerUsage?.raw && (
              <pre style={{
                margin: 0, padding: '6px', backgroundColor: '#1a1a1a', borderRadius: '4px',
                fontSize: '10px', color: '#888', whiteSpace: 'pre-wrap', maxHeight: '60px', overflow: 'auto'
              }}>{m.providerUsage.raw}</pre>
            )}

            {!m.providerUsage && (
              <div style={{ fontSize: '11px', color: '#555' }}>
                Provider limits: click Refresh to check
              </div>
            )}

            {/* Session activity */}
            <div style={{ fontSize: '11px', color: '#888', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <span>{m.messagesSent} sent</span>
              <span>{m.messagesReceived} recv</span>
              <span>{m.tasksCompleted} tasks</span>
              <span>{m.infoPosted} info</span>
              <span>{formatUptime(m.spawnedAt)} active</span>
            </div>
          </div>
        ))}
      </div>

      {lastRefreshed && (
        <div style={{ padding: '4px 12px', borderTop: '1px solid #333', fontSize: '10px', color: '#555', textAlign: 'center' }}>
          Last refreshed: {lastRefreshed}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Add to TopBar**

Add prop:
```ts
  usageOpen: boolean
  onToggleUsage: () => void
```

Add toggle button (after the Buddy button):
```tsx
        <button onClick={onToggleUsage} style={toggleBtnStyle(usageOpen)}>Usage</button>
```

- [ ] **Step 3: Add to Workspace**

Import:
```ts
import { UsagePanel } from './UsagePanel'
```

Add to PANEL_IDS:
```ts
  '__usage__': 'usage',
```

Add rendering case:
```tsx
{panelType === 'usage' && <UsagePanel />}
```

- [ ] **Step 4: Add to App.tsx**

Add constant:
```ts
const USAGE_ID = '__usage__'
```

Add state:
```ts
const usageOpen = windows.some(w => w.id === USAGE_ID)
```

Add handler:
```ts
const toggleUsage = useCallback(() => {
  if (usageOpen) {
    removeWindow(USAGE_ID)
  } else {
    addWindow(USAGE_ID, 'Usage')
  }
}, [usageOpen, addWindow, removeWindow])
```

Pass to TopBar:
```tsx
  usageOpen={usageOpen}
  onToggleUsage={toggleUsage}
```

Add USAGE_ID to the panel close guard in handleClose.

- [ ] **Step 5: Type-check + commit**

Run: `npx tsc --noEmit`

```bash
git add -A
git commit -m "feat: Usage panel — per-agent activity tracking + on-demand provider limit checks"
```

---

### Summary

| Task | What | Risk |
|------|------|------|
| 1 | AgentMetrics class + types + OutputBuffer lineCount | Low |
| 2 | Wire metrics into hub + IPC + /usage capture | Medium — touches multiple modules |
| 3 | UsagePanel UI + TopBar/Workspace/App wiring | Low — additive UI |
