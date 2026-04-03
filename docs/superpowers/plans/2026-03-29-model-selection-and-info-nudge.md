# Model Selection & Info Channel Nudge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-CLI model selection when spawning agents, and auto-nudge the orchestrator when new info is posted to the info channel.

**Architecture:** Two independent features. Feature 1 adds a `model` field to `AgentConfig`, a dynamic dropdown in `SpawnDialog` that shows model options based on the selected CLI, passes `--model <value>` via an extracted `buildCliLaunchCommands()` utility, and preserves model in presets. Feature 2 wires a nudge into the existing `onEntryAdded` callback so the orchestrator is notified via stdin when info is posted (mirroring `setupMessageNudge`).

**Tech Stack:** TypeScript, Electron, React, Express, Vitest

---

## File Structure

### Feature 1: Model Selection
- **Modify:** `src/shared/types.ts` — add `model?: string` to `AgentConfig`
- **Modify:** `src/renderer/components/SpawnDialog.tsx` — add model dropdown, CLI-to-models map
- **Create:** `src/main/cli-commands.ts` — extract `buildCliLaunchCommands()` from `index.ts`
- **Modify:** `src/main/index.ts` — import `buildCliLaunchCommands` from new file
- **Modify:** `src/renderer/components/PresetDialog.tsx` — add `model` to preset save
- **Create:** `tests/unit/build-cli-commands.test.ts` — unit tests for model flag injection

### Feature 2: Info Channel Nudge
- **Modify:** `src/main/index.ts` — add `setupInfoNudge()` wired into `onEntryAdded`
- (No changes needed to `info-channel.ts` — reuse existing `onEntryAdded` callback)

---

## Task 1: Add `model` field to AgentConfig

**Files:**
- Modify: `src/shared/types.ts`

- [ ] **Step 1: Add `model` to `AgentConfig` interface**

In `src/shared/types.ts`, add `model?: string` after `promptRegex`:

```typescript
export interface AgentConfig {
  id: string
  name: string
  cli: string
  cwd: string
  role: string
  ceoNotes: string
  shell: 'cmd' | 'powershell' | 'bash' | 'zsh' | 'fish'
  admin: boolean
  autoMode: boolean
  promptRegex?: string
  model?: string  // e.g. 'sonnet', 'opus', 'haiku', 'o4-mini', 'gpt-4.1'
}
```

- [ ] **Step 2: Verify build still works**

Run: `npx tsc --noEmit`
Expected: No errors (field is optional, existing code unaffected)

- [ ] **Step 3: Commit**

```bash
git add src/shared/types.ts
git commit -m "feat: add optional model field to AgentConfig"
```

---

## Task 2: Add model dropdown to SpawnDialog

**Files:**
- Modify: `src/renderer/components/SpawnDialog.tsx`

- [ ] **Step 1: Add CLI_MODELS map and model state**

Add this constant after `CLI_PRESETS` (around line 23):

```typescript
const CLI_MODELS: Record<string, { label: string; value: string }[]> = {
  claude: [
    { label: 'Sonnet (default)', value: '' },
    { label: 'Opus', value: 'opus' },
    { label: 'Haiku', value: 'haiku' },
    { label: 'Opus [1M context]', value: 'opus[1m]' },
    { label: 'Sonnet [1M context]', value: 'sonnet[1m]' },
  ],
  codex: [
    { label: 'o4-mini (default)', value: '' },
    { label: 'GPT-4.1', value: 'gpt-4.1' },
    { label: 'o3', value: 'o3' },
  ],
  kimi: [
    { label: 'Default', value: '' },
    { label: 'Kimi K2.5', value: 'kimi-k2.5' },
    { label: 'Kimi K2 Thinking Turbo', value: 'kimi-k2-thinking-turbo' },
    { label: 'Moonshot v1 8K', value: 'moonshot-v1-8k' },
  ]
}
```

Add state in the component (after the `promptRegex` state):

```typescript
const [model, setModel] = useState('')
```

- [ ] **Step 2: Reset model when CLI changes**

Add a `useEffect` to reset model when CLI changes (after the existing `useEffect` for shell):

```typescript
useEffect(() => {
  setModel('')
}, [cli])
```

- [ ] **Step 3: Add model dropdown to the form**

Add this JSX block right after the CLI dropdown section (after the custom CLI input, before the Working Directory label):

```tsx
{CLI_MODELS[cli] && (
  <label style={labelStyle}>
    Model
    <select value={model} onChange={e => setModel(e.target.value)} style={inputStyle}>
      {CLI_MODELS[cli].map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
    </select>
  </label>
)}
```

- [ ] **Step 4: Include model in handleSubmit**

Update `handleSubmit` to pass `model`:

```typescript
const handleSubmit = (e: React.FormEvent) => {
  e.preventDefault()
  onSpawn({
    name: name.trim(),
    cli: cli || customCli.trim(),
    cwd: cwd.trim(),
    role: (role || customRole).trim(),
    ceoNotes: ceoNotes.trim(),
    shell,
    admin,
    autoMode,
    promptRegex: promptRegex.trim() || undefined,
    model: model || undefined
  })
}
```

- [ ] **Step 5: Verify build**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add src/renderer/components/SpawnDialog.tsx
git commit -m "feat: add model dropdown to SpawnDialog, options change per CLI"
```

---

## Task 3: Add model to PresetDialog save

**Files:**
- Modify: `src/renderer/components/PresetDialog.tsx`

- [ ] **Step 1: Add `model` to preset agent config mapping**

In `PresetDialog.tsx`, find the `handleSave` function's `agentConfigs` mapping (around line 87-98). Add `model: a.model` to the object:

```typescript
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
  model: a.model
}))
```

- [ ] **Step 2: Verify build**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/renderer/components/PresetDialog.tsx
git commit -m "fix: include model field when saving workspace presets"
```

---

## Task 4: Extract `buildCliLaunchCommands` and add model flag

**Files:**
- Create: `src/main/cli-commands.ts`
- Modify: `src/main/index.ts`
- Create: `tests/unit/build-cli-commands.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/unit/build-cli-commands.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { buildCliLaunchCommands } from '../../src/main/cli-commands'
import type { AgentConfig } from '../../src/shared/types'

function makeConfig(overrides: Partial<AgentConfig> = {}): AgentConfig {
  return {
    id: 'test-id',
    name: 'test-agent',
    cli: 'claude',
    cwd: '/tmp',
    role: 'worker',
    ceoNotes: '',
    shell: 'bash',
    admin: false,
    autoMode: false,
    ...overrides
  }
}

describe('buildCliLaunchCommands', () => {
  const mcpConfigPath = '/tmp/mcp.json'
  const mcpServerPath = '/app/mcp-server/index.js'
  const hubPort = 3000
  const hubSecret = 'secret123'

  it('claude: no model flag when model is undefined', () => {
    const cmds = buildCliLaunchCommands(makeConfig(), mcpConfigPath, mcpServerPath, hubPort, hubSecret)!
    expect(cmds[0]).toContain('claude --mcp-config')
    expect(cmds[0]).not.toContain('--model')
  })

  it('claude: adds --model opus', () => {
    const cmds = buildCliLaunchCommands(makeConfig({ model: 'opus' }), mcpConfigPath, mcpServerPath, hubPort, hubSecret)!
    expect(cmds[0]).toContain('--model opus')
  })

  it('claude: --model before --dangerously-skip-permissions', () => {
    const cmds = buildCliLaunchCommands(makeConfig({ model: 'haiku', autoMode: true }), mcpConfigPath, mcpServerPath, hubPort, hubSecret)!
    expect(cmds[0]).toContain('--model haiku')
    expect(cmds[0]).toContain('--dangerously-skip-permissions')
    expect(cmds[0].indexOf('--model')).toBeLessThan(cmds[0].indexOf('--dangerously'))
  })

  it('codex: adds --model to run command, not mcp add command', () => {
    const cmds = buildCliLaunchCommands(makeConfig({ cli: 'codex', model: 'gpt-4.1' }), mcpConfigPath, mcpServerPath, hubPort, hubSecret)!
    expect(cmds[0]).not.toContain('--model')
    expect(cmds[1]).toContain('--model gpt-4.1')
  })

  it('codex: model with --yolo', () => {
    const cmds = buildCliLaunchCommands(makeConfig({ cli: 'codex', model: 'o3', autoMode: true }), mcpConfigPath, mcpServerPath, hubPort, hubSecret)!
    expect(cmds[1]).toContain('--yolo')
    expect(cmds[1]).toContain('--model o3')
  })

  it('kimi: adds --model before --yolo', () => {
    const cmds = buildCliLaunchCommands(makeConfig({ cli: 'kimi', model: 'kimi-k2.5', autoMode: true }), mcpConfigPath, mcpServerPath, hubPort, hubSecret)!
    expect(cmds[0]).toContain('--model kimi-k2.5')
    expect(cmds[0]).toContain('--yolo')
    expect(cmds[0].indexOf('--model')).toBeLessThan(cmds[0].indexOf('--yolo'))
  })

  it('terminal: returns null regardless of model', () => {
    const cmds = buildCliLaunchCommands(makeConfig({ cli: 'terminal', model: 'anything' }), mcpConfigPath, mcpServerPath, hubPort, hubSecret)
    expect(cmds).toBeNull()
  })

  it('custom CLI: returns raw command, ignores model', () => {
    const cmds = buildCliLaunchCommands(makeConfig({ cli: 'my-custom-agent' }), mcpConfigPath, mcpServerPath, hubPort, hubSecret)!
    expect(cmds).toEqual(['my-custom-agent'])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/build-cli-commands.test.ts`
Expected: FAIL — module `../../src/main/cli-commands` does not exist

- [ ] **Step 3: Create `src/main/cli-commands.ts`**

Extract `buildCliLaunchCommands` from `index.ts` into its own file, adding model support:

```typescript
import type { AgentConfig } from '../shared/types'

// Returns one or more commands to type into the shell. Array = chain them sequentially.
export function buildCliLaunchCommands(
  config: AgentConfig, mcpConfigPath: string, mcpServerPath: string,
  hubPort: number, hubSecret: string
): string[] | null {
  const cliBase = config.cli

  // Plain terminal: don't launch any CLI, just leave the shell open
  if (cliBase === 'terminal') return null

  if (cliBase === 'claude') {
    let cmd = `claude --mcp-config "${mcpConfigPath}"`
    if (config.model) cmd += ` --model ${config.model}`
    if (config.autoMode) cmd += ' --dangerously-skip-permissions'
    return [cmd]
  }

  if (cliBase === 'codex') {
    // Codex uses `codex mcp add <name> -- <command> <args>` to register MCP servers.
    const cmds = [
      `codex mcp remove agentorch 2>$null; codex mcp add agentorch -- node "${mcpServerPath}" ${hubPort} ${hubSecret} ${config.id} ${config.name}`,
    ]
    let codexCmd = config.autoMode ? 'codex --yolo' : 'codex'
    if (config.model) codexCmd += ` --model ${config.model}`
    cmds.push(codexCmd)
    return cmds
  }

  if (cliBase === 'kimi') {
    let cmd = `kimi --mcp-config-file "${mcpConfigPath}"`
    if (config.model) cmd += ` --model ${config.model}`
    if (config.autoMode) cmd += ' --yolo'
    return [cmd]
  }

  // Custom CLIs: just run the command, no MCP
  return [cliBase]
}
```

- [ ] **Step 4: Update `src/main/index.ts` to import from `cli-commands.ts`**

Remove the `buildCliLaunchCommands` function body from `index.ts` and replace with an import:

At the top of `index.ts`, add:
```typescript
import { buildCliLaunchCommands } from './cli-commands'
```

Delete the `buildCliLaunchCommands` function definition (the block starting with `function buildCliLaunchCommands(` through its closing `}`).

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/unit/build-cli-commands.test.ts`
Expected: All PASS

- [ ] **Step 6: Verify build**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 7: Commit**

```bash
git add src/main/cli-commands.ts src/main/index.ts tests/unit/build-cli-commands.test.ts
git commit -m "refactor: extract buildCliLaunchCommands to own module, add --model flag support"
```

---

## Task 5: Wire up info channel nudge to orchestrator

**Files:**
- Modify: `src/main/index.ts`

- [ ] **Step 1: Add `setupInfoNudge` function**

Add this function right after `setupMessageNudge()`:

```typescript
// When info is posted, nudge the orchestrator so they know to read it.
function setupInfoNudge(): void {
  const existingCallback = hub.infoChannel.onEntryAdded
  hub.infoChannel.onEntryAdded = (entry) => {
    // Call the existing persistence + renderer callback first
    existingCallback?.(entry)

    // Then nudge orchestrator agent(s)
    const orchestrators = hub.registry.list().filter(a => a.role === 'orchestrator')
    for (const orch of orchestrators) {
      // Don't nudge the agent that posted the info
      if (orch.name === entry.from) continue

      const managed = Array.from(agents.values()).find(a => a.config.name === orch.name)
      if (!managed) continue

      const tagStr = entry.tags.length > 0 ? ` with tags [${entry.tags.join(', ')}]` : ''
      const nudge = `[AgentOrch] New info posted by "${entry.from}"${tagStr}. Call read_info() to read it.`
      if (managed.config.cli === 'codex') {
        writeToPty(managed, nudge)
        setTimeout(() => writeToPty(managed, '\r'), 2000)
      } else {
        writeToPty(managed, nudge + '\r')
      }
    }
  }
}
```

- [ ] **Step 2: Call `setupInfoNudge()` in `main()`**

In `main()`, add the call **after** `hub.infoChannel.onEntryAdded` is set (after the persistence callbacks block) and after `setupMessageNudge()`:

```typescript
setupMessageNudge()
setupInfoNudge()
```

**Key detail:** `setupInfoNudge` wraps the existing `onEntryAdded` callback, so it MUST be called after `hub.infoChannel.onEntryAdded` is first assigned (the persistence callback). The wrapper calls the original first, then does the nudge.

- [ ] **Step 3: Verify build**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Run all tests**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add src/main/index.ts
git commit -m "feat: nudge orchestrator when info is posted to info channel"
```

---

## Task 6: Manual integration test

- [ ] **Step 1: Build and launch the app**

Run: `npm run dev`

- [ ] **Step 2: Test model selection**

1. Click "New Agent"
2. Select CLI = "Claude Code" → verify Model dropdown appears with Sonnet/Opus/Haiku/etc.
3. Select CLI = "Codex CLI" → verify Model dropdown changes to o4-mini/GPT-4.1/o3
4. Select CLI = "Kimi CLI" → verify Model dropdown changes to Kimi models
5. Select CLI = "Plain Terminal" → verify no Model dropdown appears
6. Select CLI = "Custom" → verify no Model dropdown appears
7. Spawn a Claude agent with model = "opus" → verify terminal shows `claude --mcp-config "..." --model opus`

- [ ] **Step 3: Test preset save/load with model**

1. Spawn agents with different models
2. Save a preset
3. Kill all agents, load the preset
4. Verify model selections are preserved

- [ ] **Step 4: Test info channel nudge**

1. Spawn an orchestrator agent and a researcher agent
2. Have the researcher post to the info channel via MCP tool
3. Verify the orchestrator gets a stdin nudge: `[AgentOrch] New info posted by "researcher" with tags [...]. Call read_info() to read it.`

- [ ] **Step 5: Final commit if any tweaks were needed**
