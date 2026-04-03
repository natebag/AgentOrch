# Preset System Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make saved presets global (follow user across projects) and expand built-in templates with search + model filter.

**Architecture:** Move `setPresetsDir()` from project-scoped to global userData. Expand template library to 18 entries with `requiredClis` field. Add search bar and CLI filter chips to Templates tab.

**Tech Stack:** TypeScript, React, Electron

**Spec:** `docs/superpowers/specs/2026-04-03-preset-system-redesign.md`

---

### File Map

| Action | File | Responsibility |
|--------|------|---------------|
| Modify | `src/main/index.ts:302,660` | Move setPresetsDir to main(), use global userData path |
| Modify | `src/renderer/components/PresetDialog.tsx` | Expand templates, add search + filter UI |
| Modify | `tests/unit/preset-manager.test.ts` | Verify tests still pass (no code change, just re-run) |

---

### Task 1: Move Presets to Global Storage

**Files:**
- Modify: `src/main/index.ts:302,660`

- [ ] **Step 1: Move setPresetsDir from openProject to main()**

In `src/main/index.ts`, find line 302 inside `openProject()`:
```ts
  setPresetsDir(projectManager.presetsDir)
```
Remove this line.

In `main()` (around line 660), after `projectManager = new ProjectManager(app.getPath('userData'))`, add:
```ts
  // Global presets directory — follows user across projects
  const globalPresetsDir = path.join(app.getPath('userData'), 'presets')
  setPresetsDir(globalPresetsDir)
```

- [ ] **Step 2: Verify build**

Run: `npx tsc --noEmit`
Expected: Clean

- [ ] **Step 3: Run preset tests**

Run: `npx vitest run tests/unit/preset-manager.test.ts`
Expected: All PASS (tests inject their own path, unaffected by this change)

- [ ] **Step 4: Commit**

```bash
git add src/main/index.ts
git commit -m "refactor: move presets to global userData storage — follows user across projects"
```

---

### Task 2: Expand Template Library + Add requiredClis

**Files:**
- Modify: `src/renderer/components/PresetDialog.tsx`

- [ ] **Step 1: Update PresetTemplate interface**

In `src/renderer/components/PresetDialog.tsx`, find the `PresetTemplate` interface and add `requiredClis`:

```ts
interface PresetTemplate {
  name: string
  description: string
  requiredClis: string[]
  agents: Omit<AgentConfig, 'id' | 'cwd'>[]
}
```

- [ ] **Step 2: Replace BUILT_IN_TEMPLATES with expanded library**

Replace the entire `BUILT_IN_TEMPLATES` array with:

```ts
const BUILT_IN_TEMPLATES: PresetTemplate[] = [
  // --- Claude-only ---
  {
    name: 'Orchestrator + Workers',
    description: '1 orchestrator (Opus) directing 2 workers (Sonnet). Classic delegation pattern.',
    requiredClis: ['claude'],
    agents: [
      { name: 'orchestrator', cli: 'claude', role: 'orchestrator', ceoNotes: 'You are the lead. Break tasks into subtasks and delegate to workers. Synthesize their results. Use post_task() and send_message() to coordinate.', shell: 'powershell', admin: false, autoMode: true, model: 'opus' },
      { name: 'worker-1', cli: 'claude', role: 'worker', ceoNotes: 'You are a worker. Check read_tasks() and get_messages() for assignments. Complete tasks and report back to the orchestrator.', shell: 'powershell', admin: false, autoMode: true, model: 'sonnet' },
      { name: 'worker-2', cli: 'claude', role: 'worker', ceoNotes: 'You are a worker. Check read_tasks() and get_messages() for assignments. Complete tasks and report back to the orchestrator.', shell: 'powershell', admin: false, autoMode: true, model: 'sonnet' },
    ]
  },
  {
    name: 'Research Squad',
    description: '1 orchestrator + 3 researchers. Deep research with parallel information gathering.',
    requiredClis: ['claude'],
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
    requiredClis: ['claude'],
    agents: [
      { name: 'coder', cli: 'claude', role: 'worker', ceoNotes: 'You write code. After completing each change, send_message() to the reviewer with a summary of what changed and why. Wait for feedback before proceeding.', shell: 'powershell', admin: false, autoMode: true, model: 'sonnet' },
      { name: 'reviewer', cli: 'claude', role: 'reviewer', ceoNotes: 'You review code. When the coder messages you, use get_agent_output() to see their terminal, review the changes, and send_message() back with feedback. Be constructive but thorough.', shell: 'powershell', admin: false, autoMode: true, model: 'opus' },
    ]
  },
  {
    name: 'Speed Swarm',
    description: '3 Haiku agents for maximum throughput on simple parallel tasks.',
    requiredClis: ['claude'],
    agents: [
      { name: 'swarm-1', cli: 'claude', role: 'worker', ceoNotes: 'You are a fast worker. Check read_tasks() for assignments. Complete them quickly and move to the next. Prioritize speed over polish.', shell: 'powershell', admin: false, autoMode: true, model: 'haiku' },
      { name: 'swarm-2', cli: 'claude', role: 'worker', ceoNotes: 'You are a fast worker. Check read_tasks() for assignments. Complete them quickly and move to the next. Prioritize speed over polish.', shell: 'powershell', admin: false, autoMode: true, model: 'haiku' },
      { name: 'swarm-3', cli: 'claude', role: 'worker', ceoNotes: 'You are a fast worker. Check read_tasks() for assignments. Complete them quickly and move to the next. Prioritize speed over polish.', shell: 'powershell', admin: false, autoMode: true, model: 'haiku' },
    ]
  },
  {
    name: 'Solo Opus',
    description: '1 Opus agent. Full power, no coordination overhead.',
    requiredClis: ['claude'],
    agents: [
      { name: 'agent', cli: 'claude', role: 'worker', ceoNotes: 'You are a solo agent. Check read_tasks() and get_messages() for work. You have full autonomy to plan and execute.', shell: 'powershell', admin: false, autoMode: true, model: 'opus' },
    ]
  },
  {
    name: 'TDD Pipeline',
    description: '1 coder + 1 tester + 1 reviewer. Red-green-refactor workflow.',
    requiredClis: ['claude'],
    agents: [
      { name: 'coder', cli: 'claude', role: 'worker', ceoNotes: 'You implement features. Wait for test specs from the tester before writing code. After implementing, send_message() to the reviewer.', shell: 'powershell', admin: false, autoMode: true, model: 'sonnet' },
      { name: 'tester', cli: 'claude', role: 'worker', ceoNotes: 'You write tests FIRST. When a task is posted, write failing tests that define the expected behavior, then send_message() to the coder with the test file path. Verify tests pass after implementation.', shell: 'powershell', admin: false, autoMode: true, model: 'sonnet' },
      { name: 'reviewer', cli: 'claude', role: 'reviewer', ceoNotes: 'You review completed work. When the coder messages you, review both the tests and implementation. Check for edge cases, code quality, and test coverage. send_message() back with feedback.', shell: 'powershell', admin: false, autoMode: true, model: 'opus' },
    ]
  },
  {
    name: 'Documentation Team',
    description: '1 researcher + 1 writer + 1 reviewer. Produce polished documentation.',
    requiredClis: ['claude'],
    agents: [
      { name: 'researcher', cli: 'claude', role: 'researcher', ceoNotes: 'You gather information for documentation. Read source code, existing docs, and tests. Post findings to post_info() with tags. Focus on accuracy.', shell: 'powershell', admin: false, autoMode: true, model: 'haiku' },
      { name: 'writer', cli: 'claude', role: 'worker', ceoNotes: 'You write documentation. Use read_info() to access research findings. Write clear, well-structured docs. send_message() to the reviewer when a section is complete.', shell: 'powershell', admin: false, autoMode: true, model: 'sonnet' },
      { name: 'reviewer', cli: 'claude', role: 'reviewer', ceoNotes: 'You review documentation for accuracy, clarity, and completeness. Check against source code. send_message() back with feedback and suggestions.', shell: 'powershell', admin: false, autoMode: true, model: 'opus' },
    ]
  },
  {
    name: 'Rapid Prototyper',
    description: '1 architect (Opus) + 2 builders (Sonnet). Architecture-first rapid development.',
    requiredClis: ['claude'],
    agents: [
      { name: 'architect', cli: 'claude', role: 'orchestrator', ceoNotes: 'You design the architecture first. Post the design to post_info() with tag "architecture". Then break implementation into tasks via post_task(). Review builder output and iterate.', shell: 'powershell', admin: false, autoMode: true, model: 'opus' },
      { name: 'builder-1', cli: 'claude', role: 'worker', ceoNotes: 'You build what the architect designs. Check read_info() for architecture specs, then read_tasks() for assignments. Implement and report back.', shell: 'powershell', admin: false, autoMode: true, model: 'sonnet' },
      { name: 'builder-2', cli: 'claude', role: 'worker', ceoNotes: 'You build what the architect designs. Check read_info() for architecture specs, then read_tasks() for assignments. Implement and report back.', shell: 'powershell', admin: false, autoMode: true, model: 'sonnet' },
    ]
  },
  // --- Multi-CLI ---
  {
    name: 'Claude + Codex',
    description: 'Claude Opus orchestrates, Codex o4-mini implements. Best of both ecosystems.',
    requiredClis: ['claude', 'codex'],
    agents: [
      { name: 'lead', cli: 'claude', role: 'orchestrator', ceoNotes: 'You orchestrate. Break tasks down and delegate to the coder via post_task() and send_message(). Review their work.', shell: 'powershell', admin: false, autoMode: true, model: 'opus' },
      { name: 'coder', cli: 'codex', role: 'worker', ceoNotes: 'You implement code. Check read_tasks() and get_messages() for assignments from the lead. Report back when done.', shell: 'powershell', admin: false, autoMode: true, model: '' },
    ]
  },
  {
    name: 'Claude + Kimi',
    description: 'Claude plans and coordinates, Kimi K2.5 researches. Dual-brain research team.',
    requiredClis: ['claude', 'kimi'],
    agents: [
      { name: 'planner', cli: 'claude', role: 'orchestrator', ceoNotes: 'You plan research strategy. Break questions into sub-questions. Delegate to the researcher via post_task(). Synthesize findings.', shell: 'powershell', admin: false, autoMode: true, model: 'opus' },
      { name: 'researcher', cli: 'kimi', role: 'researcher', ceoNotes: 'You research deeply. Check read_tasks() for assignments. Post findings to post_info(). Be thorough.', shell: 'powershell', admin: false, autoMode: true, model: 'kimi-k2.5' },
    ]
  },
  {
    name: 'Claude + Gemini',
    description: 'Claude orchestrates, Gemini 2.5 Pro researches. Google knowledge + Anthropic reasoning.',
    requiredClis: ['claude', 'gemini'],
    agents: [
      { name: 'lead', cli: 'claude', role: 'orchestrator', ceoNotes: 'You coordinate. Delegate research tasks to the researcher. Synthesize and make decisions based on findings.', shell: 'powershell', admin: false, autoMode: true, model: 'opus' },
      { name: 'researcher', cli: 'gemini', role: 'researcher', ceoNotes: 'You research using your broad knowledge. Check read_tasks() for assignments. Post findings to post_info() with relevant tags.', shell: 'powershell', admin: false, autoMode: true, model: 'gemini-2.5-pro' },
    ]
  },
  // --- OpenClaude teams ---
  {
    name: 'GPT-4o + DeepSeek',
    description: 'GPT-4o orchestrator, DeepSeek coder. Cost-optimized multi-model team.',
    requiredClis: ['openclaude'],
    agents: [
      { name: 'lead', cli: 'openclaude', role: 'orchestrator', ceoNotes: 'You orchestrate the team. Break tasks down and delegate. Review completed work.', shell: 'powershell', admin: false, autoMode: true, model: 'gpt-4o', providerUrl: 'https://api.openai.com/v1' },
      { name: 'coder', cli: 'openclaude', role: 'worker', ceoNotes: 'You implement code. Check read_tasks() and get_messages() for assignments.', shell: 'powershell', admin: false, autoMode: true, model: 'deepseek-chat', providerUrl: 'https://api.deepseek.com/v1' },
    ]
  },
  {
    name: 'Full OpenAI',
    description: 'GPT-4o lead + 2 GPT-4.1 workers. All OpenAI, maximum compatibility.',
    requiredClis: ['openclaude'],
    agents: [
      { name: 'lead', cli: 'openclaude', role: 'orchestrator', ceoNotes: 'You orchestrate. Break tasks down and delegate to workers.', shell: 'powershell', admin: false, autoMode: true, model: 'gpt-4o', providerUrl: 'https://api.openai.com/v1' },
      { name: 'worker-1', cli: 'openclaude', role: 'worker', ceoNotes: 'You implement. Check read_tasks() and get_messages() for assignments.', shell: 'powershell', admin: false, autoMode: true, model: 'gpt-4.1', providerUrl: 'https://api.openai.com/v1' },
      { name: 'worker-2', cli: 'openclaude', role: 'worker', ceoNotes: 'You implement. Check read_tasks() and get_messages() for assignments.', shell: 'powershell', admin: false, autoMode: true, model: 'gpt-4.1', providerUrl: 'https://api.openai.com/v1' },
    ]
  },
  {
    name: 'DeepSeek Squad',
    description: '3 DeepSeek agents. Cheapest possible multi-agent team.',
    requiredClis: ['openclaude'],
    agents: [
      { name: 'lead', cli: 'openclaude', role: 'orchestrator', ceoNotes: 'You coordinate. Break tasks and delegate.', shell: 'powershell', admin: false, autoMode: true, model: 'deepseek-chat', providerUrl: 'https://api.deepseek.com/v1' },
      { name: 'worker-1', cli: 'openclaude', role: 'worker', ceoNotes: 'Check read_tasks() and get_messages() for work.', shell: 'powershell', admin: false, autoMode: true, model: 'deepseek-chat', providerUrl: 'https://api.deepseek.com/v1' },
      { name: 'worker-2', cli: 'openclaude', role: 'worker', ceoNotes: 'Check read_tasks() and get_messages() for work.', shell: 'powershell', admin: false, autoMode: true, model: 'deepseek-chat', providerUrl: 'https://api.deepseek.com/v1' },
    ]
  },
  {
    name: 'Mixed Provider',
    description: 'GPT-4o lead + DeepSeek coder + Claude reviewer. Best of three worlds.',
    requiredClis: ['openclaude', 'claude'],
    agents: [
      { name: 'lead', cli: 'openclaude', role: 'orchestrator', ceoNotes: 'You orchestrate. Delegate coding to the coder, review requests to the reviewer.', shell: 'powershell', admin: false, autoMode: true, model: 'gpt-4o', providerUrl: 'https://api.openai.com/v1' },
      { name: 'coder', cli: 'openclaude', role: 'worker', ceoNotes: 'You implement code. Check read_tasks() for assignments.', shell: 'powershell', admin: false, autoMode: true, model: 'deepseek-chat', providerUrl: 'https://api.deepseek.com/v1' },
      { name: 'reviewer', cli: 'claude', role: 'reviewer', ceoNotes: 'You review code. Use get_agent_output() to inspect work. send_message() back with feedback.', shell: 'powershell', admin: false, autoMode: true, model: 'sonnet' },
    ]
  },
  {
    name: 'OpenRouter Mix',
    description: 'Via OpenRouter: access GPT-4o, Claude, DeepSeek with a single API key.',
    requiredClis: ['openclaude'],
    agents: [
      { name: 'lead', cli: 'openclaude', role: 'orchestrator', ceoNotes: 'You orchestrate. Delegate tasks.', shell: 'powershell', admin: false, autoMode: true, model: 'openai/gpt-4o', providerUrl: 'https://openrouter.ai/api/v1' },
      { name: 'coder', cli: 'openclaude', role: 'worker', ceoNotes: 'You implement. Check read_tasks() for assignments.', shell: 'powershell', admin: false, autoMode: true, model: 'deepseek/deepseek-chat', providerUrl: 'https://openrouter.ai/api/v1' },
    ]
  },
  // --- Local ---
  {
    name: 'Ollama Local',
    description: '2 Llama 3 agents running locally via Ollama. Fully offline, no API keys needed.',
    requiredClis: ['openclaude'],
    agents: [
      { name: 'orchestrator', cli: 'openclaude', role: 'orchestrator', ceoNotes: 'You coordinate local agents. Break tasks and delegate.', shell: 'powershell', admin: false, autoMode: true, model: 'llama3', providerUrl: 'http://localhost:11434/v1' },
      { name: 'worker-1', cli: 'openclaude', role: 'worker', ceoNotes: 'Check read_tasks() and get_messages() for assignments.', shell: 'powershell', admin: false, autoMode: true, model: 'llama3', providerUrl: 'http://localhost:11434/v1' },
    ]
  },
  {
    name: 'Hybrid Local + Cloud',
    description: 'Ollama worker (free, local) + Claude Opus orchestrator (smart, cloud).',
    requiredClis: ['openclaude', 'claude'],
    agents: [
      { name: 'orchestrator', cli: 'claude', role: 'orchestrator', ceoNotes: 'You orchestrate. The worker runs locally and is slower — give clear, specific instructions.', shell: 'powershell', admin: false, autoMode: true, model: 'opus' },
      { name: 'worker', cli: 'openclaude', role: 'worker', ceoNotes: 'Check read_tasks() and get_messages() for assignments. You run locally.', shell: 'powershell', admin: false, autoMode: true, model: 'llama3', providerUrl: 'http://localhost:11434/v1' },
    ]
  },
]
```

- [ ] **Step 3: Verify build**

Run: `npx tsc --noEmit`
Expected: Clean

- [ ] **Step 4: Commit**

```bash
git add src/renderer/components/PresetDialog.tsx
git commit -m "feat: expand template library to 18 teams with requiredClis metadata"
```

---

### Task 3: Add Search Bar + CLI Filter to Templates Tab

**Files:**
- Modify: `src/renderer/components/PresetDialog.tsx`

- [ ] **Step 1: Add filter constants**

Add after BUILT_IN_TEMPLATES:

```ts
const ALL_CLIS = ['claude', 'codex', 'kimi', 'gemini', 'openclaude']
const CLI_LABELS: Record<string, string> = {
  claude: 'Claude',
  codex: 'Codex',
  kimi: 'Kimi',
  gemini: 'Gemini',
  openclaude: 'OpenClaude',
}
```

- [ ] **Step 2: Add search and filter state**

Inside the `PresetDialog` component, add state:

```ts
  const [templateSearch, setTemplateSearch] = useState('')
  const [cliFilters, setCliFilters] = useState<Set<string>>(new Set())
```

Add a computed filtered templates list:

```ts
  const filteredTemplates = BUILT_IN_TEMPLATES.filter(t => {
    // Search filter: match name or description
    if (templateSearch) {
      const q = templateSearch.toLowerCase()
      if (!t.name.toLowerCase().includes(q) && !t.description.toLowerCase().includes(q)) {
        return false
      }
    }
    // CLI filter: if any filters are active, ALL required CLIs must be in the filter set
    if (cliFilters.size > 0) {
      if (!t.requiredClis.every(cli => cliFilters.has(cli))) {
        return false
      }
    }
    return true
  })
```

Add a toggle helper:

```ts
  const toggleCliFilter = (cli: string) => {
    setCliFilters(prev => {
      const next = new Set(prev)
      if (next.has(cli)) next.delete(cli)
      else next.add(cli)
      return next
    })
  }
```

- [ ] **Step 3: Replace templates tab body**

Find the `{activeTab === 'templates' && (` block and replace its content with:

```tsx
        {activeTab === 'templates' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {/* Search bar */}
            <input
              value={templateSearch}
              onChange={e => setTemplateSearch(e.target.value)}
              placeholder="Search templates..."
              style={inputStyle}
            />

            {/* CLI filter chips */}
            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
              {ALL_CLIS.map(cli => (
                <button
                  key={cli}
                  onClick={() => toggleCliFilter(cli)}
                  style={{
                    padding: '4px 10px',
                    fontSize: '11px',
                    borderRadius: '12px',
                    border: cliFilters.has(cli) ? '1px solid #4a9eff' : '1px solid #444',
                    backgroundColor: cliFilters.has(cli) ? '#1e3a5f' : '#2a2a2a',
                    color: cliFilters.has(cli) ? '#8cc4ff' : '#888',
                    cursor: 'pointer',
                  }}
                >
                  {CLI_LABELS[cli]}
                </button>
              ))}
              {cliFilters.size > 0 && (
                <button
                  onClick={() => setCliFilters(new Set())}
                  style={{
                    padding: '4px 10px',
                    fontSize: '11px',
                    borderRadius: '12px',
                    border: '1px solid #444',
                    backgroundColor: 'transparent',
                    color: '#666',
                    cursor: 'pointer',
                  }}
                >
                  Clear
                </button>
              )}
            </div>

            {/* Template list */}
            <div style={{ maxHeight: '320px', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {filteredTemplates.length === 0 ? (
                <div style={{ color: '#555', textAlign: 'center', padding: '20px 0' }}>
                  No templates match your filters.
                </div>
              ) : (
                filteredTemplates.map(template => (
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
                      <div style={{ fontSize: '10px', color: '#555', marginTop: '3px' }}>
                        {template.agents.length} agent{template.agents.length !== 1 ? 's' : ''}
                        {' · '}
                        Requires: {template.requiredClis.map(c => CLI_LABELS[c] || c).join(', ')}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '4px' }}>
              <button onClick={onClose} style={cancelBtnStyle}>Cancel</button>
              <button
                onClick={() => { if (templateToLoad) setShowCwdPrompt(true) }}
                disabled={!templateToLoad}
                style={loadBtnStyle}
              >
                Use Template
              </button>
            </div>
          </div>
        )}
```

- [ ] **Step 4: Reset search/filter on tab change**

In the existing `useEffect` that fires on `activeTab` change, add resets:

```ts
  useEffect(() => {
    setSelectedPreset(null)
    setTemplateToLoad(null)
    setTemplateSearch('')
    setCliFilters(new Set())
    if (activeTab === 'load') {
      loadPresetsList()
    }
  }, [activeTab])
```

- [ ] **Step 5: Verify build**

Run: `npx tsc --noEmit`
Expected: Clean

- [ ] **Step 6: Commit**

```bash
git add src/renderer/components/PresetDialog.tsx
git commit -m "feat: template search bar + CLI filter chips — find teams by model availability"
```

---

### Summary

| Task | What | Risk |
|------|------|------|
| 1 | Move presets to global userData | Trivial — one line moved |
| 2 | Expand template library to 18 | Low — data only, no logic change |
| 3 | Search + CLI filter UI | Low — additive UI, no existing behavior changed |
