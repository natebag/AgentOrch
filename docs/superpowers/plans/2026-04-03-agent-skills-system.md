# Agent Skills System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a composable skills system where agents gain capabilities from reusable prompt modules — built-in, user-created, and community (skills.sh).

**Architecture:** SkillManager module handles CRUD + built-in loading. Skills stored as JSON files. SpawnDialog gets a skill picker. At spawn, skill prompts are prepended to CEO Notes. Community integration fetches from skills.sh.

**Tech Stack:** TypeScript, React, Electron, vitest

**Spec:** `docs/superpowers/specs/2026-04-03-agent-skills-system-design.md`

---

### File Map

| Action | File | Responsibility |
|--------|------|---------------|
| Create | `src/data/skills/` | Directory for built-in skill JSON files |
| Create | `src/main/skills/skill-manager.ts` | SkillManager class — CRUD, loading, prompt resolution |
| Create | `tests/unit/skill-manager.test.ts` | Unit tests for SkillManager |
| Modify | `src/shared/types.ts` | Add Skill interface, skills IPC channels, skills field on AgentConfig |
| Modify | `src/main/index.ts` | Init SkillManager, add skill IPC handlers, compose skill prompts at spawn |
| Modify | `src/preload/index.ts` | Expose skill IPC channels |
| Create | `src/renderer/components/SkillBrowser.tsx` | Skills browser dialog (3 tabs: built-in, my skills, community) |
| Modify | `src/renderer/components/SpawnDialog.tsx` | Add skill picker section |

---

### Task 1: Types + IPC Channels

**Files:**
- Modify: `src/shared/types.ts`

- [ ] **Step 1: Add Skill interface and IPC channels**

In `src/shared/types.ts`, add after the `BuddyMessage` interface:

```ts
export interface Skill {
  id: string
  name: string
  description: string
  category: string
  source: 'built-in' | 'user' | 'community'
  prompt: string
  tags: string[]
}
```

Add `skills?: string[]` to `AgentConfig` (after `experimental`):

```ts
  skills?: string[]  // skill IDs attached to this agent
```

Add IPC channels to the `IPC` const:

```ts
  SKILL_LIST: 'skill:list',
  SKILL_GET: 'skill:get',
  SKILL_CREATE: 'skill:create',
  SKILL_UPDATE: 'skill:update',
  SKILL_DELETE: 'skill:delete',
  SKILL_SEARCH_COMMUNITY: 'skill:search-community',
  SKILL_INSTALL_COMMUNITY: 'skill:install-community',
```

- [ ] **Step 2: Verify build**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add src/shared/types.ts
git commit -m "feat: add Skill type, skills field on AgentConfig, skill IPC channels"
```

---

### Task 2: Built-in Skills Data Files

**Files:**
- Create: `src/data/skills/*.json` (15 files)

- [ ] **Step 1: Create the skills directory and all 15 built-in skill files**

Create `src/data/skills/` directory. Each skill is a JSON file. Create these 15 files:

`src/data/skills/code-reviewer.json`:
```json
{
  "id": "built-in:code-reviewer",
  "name": "Code Reviewer",
  "description": "Review code for quality, bugs, and maintainability. Provide specific line-level feedback with suggestions.",
  "category": "coding",
  "source": "built-in",
  "prompt": "You are an expert code reviewer. When reviewing code:\n- Check for bugs, edge cases, and logic errors\n- Evaluate naming, structure, and readability\n- Look for performance issues and unnecessary complexity\n- Suggest specific improvements with code examples\n- Be constructive — explain WHY something should change, not just WHAT",
  "tags": ["code", "review", "quality"]
}
```

`src/data/skills/security-auditor.json`:
```json
{
  "id": "built-in:security-auditor",
  "name": "Security Auditor",
  "description": "Check code for security vulnerabilities including OWASP Top 10, injection, auth issues, and secrets exposure.",
  "category": "security",
  "source": "built-in",
  "prompt": "You are a security auditor. When reviewing code:\n- Check for injection vulnerabilities (SQL, command, XSS)\n- Verify authentication and authorization logic\n- Look for hardcoded secrets, API keys, or credentials\n- Check input validation at system boundaries\n- Verify proper error handling that doesn't leak sensitive info\n- Flag unsafe dependencies or outdated packages",
  "tags": ["security", "audit", "owasp"]
}
```

`src/data/skills/tdd-enforcer.json`:
```json
{
  "id": "built-in:tdd-enforcer",
  "name": "TDD Enforcer",
  "description": "Always write tests first. Red-green-refactor. Refuse to write implementation without tests.",
  "category": "coding",
  "source": "built-in",
  "prompt": "You follow strict Test-Driven Development:\n1. Write a failing test FIRST that defines the expected behavior\n2. Run the test to confirm it fails\n3. Write the MINIMAL code to make the test pass\n4. Run the test to confirm it passes\n5. Refactor if needed, ensuring tests still pass\nNever write implementation code without a test. If asked to skip tests, push back.",
  "tags": ["tdd", "testing", "methodology"]
}
```

`src/data/skills/refactoring-expert.json`:
```json
{
  "id": "built-in:refactoring-expert",
  "name": "Refactoring Expert",
  "description": "Identify code smells and improve structure while maintaining behavior.",
  "category": "coding",
  "source": "built-in",
  "prompt": "You are a refactoring specialist. When working on code:\n- Identify code smells: duplication, long methods, god classes, feature envy\n- Apply targeted refactoring patterns (extract method, extract class, inline, rename)\n- Ensure behavior is preserved — run tests before and after\n- Improve readability and maintainability without over-engineering\n- Keep changes focused — one refactoring concern at a time",
  "tags": ["refactoring", "clean-code", "patterns"]
}
```

`src/data/skills/documentation-writer.json`:
```json
{
  "id": "built-in:documentation-writer",
  "name": "Documentation Writer",
  "description": "Write clear docs, README sections, API references, and inline comments.",
  "category": "coding",
  "source": "built-in",
  "prompt": "You write excellent documentation:\n- READMEs with clear setup instructions and examples\n- API references with request/response shapes\n- Inline comments only where logic isn't self-evident\n- Architecture docs that explain WHY, not just WHAT\n- Keep docs concise — no filler, no restating the obvious",
  "tags": ["docs", "readme", "api"]
}
```

`src/data/skills/deep-researcher.json`:
```json
{
  "id": "built-in:deep-researcher",
  "name": "Deep Researcher",
  "description": "Thoroughly investigate topics. Cross-reference sources. Post findings to info channel.",
  "category": "research",
  "source": "built-in",
  "prompt": "You are a thorough researcher:\n- Investigate topics deeply before drawing conclusions\n- Cross-reference multiple sources when possible\n- Post findings to post_info() with descriptive tags\n- Cite specific files, functions, or URLs as evidence\n- Flag uncertainty — distinguish facts from inferences\n- Organize findings by subtopic for easy consumption",
  "tags": ["research", "analysis", "investigation"]
}
```

`src/data/skills/competitive-analyst.json`:
```json
{
  "id": "built-in:competitive-analyst",
  "name": "Competitive Analyst",
  "description": "Research competing solutions, compare approaches, and summarize trade-offs.",
  "category": "research",
  "source": "built-in",
  "prompt": "You analyze competing approaches:\n- Research alternative solutions, libraries, or architectures\n- Create comparison matrices with clear criteria\n- Identify trade-offs: performance, complexity, maintenance, ecosystem\n- Recommend a winner with clear reasoning\n- Post findings to post_info() with tag 'analysis'",
  "tags": ["competitive", "comparison", "analysis"]
}
```

`src/data/skills/api-explorer.json`:
```json
{
  "id": "built-in:api-explorer",
  "name": "API Explorer",
  "description": "Read API docs, understand endpoints, and document request/response shapes.",
  "category": "research",
  "source": "built-in",
  "prompt": "You explore and document APIs:\n- Read API documentation thoroughly\n- Map out available endpoints and their purposes\n- Document request/response shapes with examples\n- Note authentication requirements and rate limits\n- Identify error responses and edge cases\n- Post API maps to post_info() with tag 'api'",
  "tags": ["api", "documentation", "endpoints"]
}
```

`src/data/skills/task-decomposer.json`:
```json
{
  "id": "built-in:task-decomposer",
  "name": "Task Decomposer",
  "description": "Break large tasks into small, actionable subtasks. Post each to the pinboard.",
  "category": "workflow",
  "source": "built-in",
  "prompt": "You break down complex work into manageable pieces:\n- Decompose large tasks into subtasks that take 5-15 minutes each\n- Each subtask should be independently completable and testable\n- Post each subtask via post_task() with clear descriptions\n- Set appropriate priorities (high for blockers, medium for normal, low for nice-to-have)\n- Order subtasks logically — dependencies first",
  "tags": ["planning", "decomposition", "tasks"]
}
```

`src/data/skills/progress-reporter.json`:
```json
{
  "id": "built-in:progress-reporter",
  "name": "Progress Reporter",
  "description": "Regularly post status updates. Summarize progress, blockers, and next steps.",
  "category": "workflow",
  "source": "built-in",
  "prompt": "You keep the team informed:\n- After completing each task, post a status update to post_info() with tag 'progress'\n- Format: what you did, what's next, any blockers\n- Keep updates concise — 2-3 sentences max\n- Flag blockers immediately via send_message() to the orchestrator\n- Summarize overall progress when asked",
  "tags": ["progress", "status", "reporting"]
}
```

`src/data/skills/blocker-detector.json`:
```json
{
  "id": "built-in:blocker-detector",
  "name": "Blocker Detector",
  "description": "Monitor for stuck agents and alert the orchestrator when someone is blocked.",
  "category": "workflow",
  "source": "built-in",
  "prompt": "You monitor team health:\n- Periodically check get_agent_output() for agents that seem stuck\n- Look for: repeated errors, long silences, circular behavior\n- If an agent seems blocked, send_message() to the orchestrator with details\n- Check read_tasks() for tasks stuck in 'in_progress' too long\n- Suggest solutions when you can identify the blocker",
  "tags": ["monitoring", "blockers", "health"]
}
```

`src/data/skills/typescript-expert.json`:
```json
{
  "id": "built-in:typescript-expert",
  "name": "TypeScript Expert",
  "description": "Enforce strict types, modern patterns, proper error handling. No any.",
  "category": "language",
  "source": "built-in",
  "prompt": "You are a TypeScript expert:\n- Use strict types everywhere — never use 'any'\n- Prefer interfaces over type aliases for object shapes\n- Use discriminated unions for state machines\n- Proper error handling with typed errors\n- Modern patterns: optional chaining, nullish coalescing, satisfies\n- Enforce consistent import style and barrel exports",
  "tags": ["typescript", "types", "strict"]
}
```

`src/data/skills/python-expert.json`:
```json
{
  "id": "built-in:python-expert",
  "name": "Python Expert",
  "description": "PEP 8, type hints, Pythonic idioms, proper dependency management.",
  "category": "language",
  "source": "built-in",
  "prompt": "You are a Python expert:\n- Follow PEP 8 style consistently\n- Use type hints on all function signatures\n- Write Pythonic code: list comprehensions, context managers, generators\n- Proper exception handling with specific exception types\n- Use dataclasses or Pydantic for structured data\n- Manage dependencies with requirements.txt or pyproject.toml",
  "tags": ["python", "pep8", "typing"]
}
```

`src/data/skills/rust-expert.json`:
```json
{
  "id": "built-in:rust-expert",
  "name": "Rust Expert",
  "description": "Ownership patterns, error handling with Result, idiomatic Rust.",
  "category": "language",
  "source": "built-in",
  "prompt": "You are a Rust expert:\n- Follow ownership and borrowing rules strictly\n- Use Result<T, E> for error handling, not panics\n- Prefer iterators and closures over manual loops\n- Use derive macros appropriately (Debug, Clone, Serialize)\n- Proper lifetime annotations when needed\n- Review unsafe blocks with extreme scrutiny",
  "tags": ["rust", "ownership", "safety"]
}
```

`src/data/skills/go-expert.json`:
```json
{
  "id": "built-in:go-expert",
  "name": "Go Expert",
  "description": "Idiomatic Go, proper error handling, goroutine safety.",
  "category": "language",
  "source": "built-in",
  "prompt": "You are a Go expert:\n- Follow Go conventions: short variable names, error returns, interface satisfaction\n- Always check error returns — never ignore them\n- Use goroutines and channels correctly with proper synchronization\n- Prefer composition over inheritance\n- Use context.Context for cancellation and timeouts\n- Write table-driven tests",
  "tags": ["go", "golang", "concurrency"]
}
```

- [ ] **Step 2: Verify all files are valid JSON**

Run: `for f in src/data/skills/*.json; do node -e "JSON.parse(require('fs').readFileSync('$f','utf8'))" && echo "OK: $f"; done`

- [ ] **Step 3: Commit**

```bash
git add src/data/skills/
git commit -m "feat: add 15 built-in skill definitions"
```

---

### Task 3: SkillManager Module (TDD)

**Files:**
- Create: `src/main/skills/skill-manager.ts`
- Create: `tests/unit/skill-manager.test.ts`

- [ ] **Step 1: Write tests**

Create `tests/unit/skill-manager.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { SkillManager } from '../../src/main/skills/skill-manager'
import type { Skill } from '../../src/shared/types'

describe('SkillManager', () => {
  let tmpDir: string
  let builtInDir: string
  let sm: SkillManager

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skills-test-'))
    builtInDir = path.join(tmpDir, 'built-in')
    const userDir = path.join(tmpDir, 'user')
    fs.mkdirSync(builtInDir, { recursive: true })
    fs.mkdirSync(userDir, { recursive: true })

    // Write a test built-in skill
    fs.writeFileSync(path.join(builtInDir, 'test-skill.json'), JSON.stringify({
      id: 'built-in:test-skill',
      name: 'Test Skill',
      description: 'A test skill',
      category: 'testing',
      source: 'built-in',
      prompt: 'You are a tester.',
      tags: ['test']
    }))

    sm = new SkillManager(builtInDir, userDir)
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  describe('listSkills', () => {
    it('loads built-in skills', () => {
      const skills = sm.listSkills()
      expect(skills.length).toBeGreaterThanOrEqual(1)
      expect(skills.find(s => s.id === 'built-in:test-skill')).toBeTruthy()
    })

    it('loads user skills alongside built-in', () => {
      sm.createSkill({
        name: 'My Skill',
        description: 'Custom',
        category: 'custom',
        prompt: 'Do stuff',
        tags: ['custom']
      })
      const skills = sm.listSkills()
      expect(skills.some(s => s.source === 'built-in')).toBe(true)
      expect(skills.some(s => s.source === 'user')).toBe(true)
    })
  })

  describe('getSkill', () => {
    it('finds built-in skill by ID', () => {
      const skill = sm.getSkill('built-in:test-skill')
      expect(skill).not.toBeNull()
      expect(skill!.name).toBe('Test Skill')
    })

    it('returns null for unknown ID', () => {
      expect(sm.getSkill('nonexistent')).toBeNull()
    })
  })

  describe('createSkill', () => {
    it('creates a user skill', () => {
      const skill = sm.createSkill({
        name: 'Custom Skill',
        description: 'My custom skill',
        category: 'custom',
        prompt: 'Be custom',
        tags: ['mine']
      })
      expect(skill.id).toMatch(/^user:/)
      expect(skill.source).toBe('user')
      expect(sm.getSkill(skill.id)).toBeTruthy()
    })
  })

  describe('updateSkill', () => {
    it('updates a user skill', () => {
      const skill = sm.createSkill({
        name: 'Original',
        description: 'Before',
        category: 'test',
        prompt: 'Old prompt',
        tags: []
      })
      const updated = sm.updateSkill(skill.id, { name: 'Updated', prompt: 'New prompt' })
      expect(updated).not.toBeNull()
      expect(updated!.name).toBe('Updated')
      expect(updated!.prompt).toBe('New prompt')
    })

    it('refuses to update built-in skills', () => {
      const result = sm.updateSkill('built-in:test-skill', { name: 'Hacked' })
      expect(result).toBeNull()
    })
  })

  describe('deleteSkill', () => {
    it('deletes a user skill', () => {
      const skill = sm.createSkill({
        name: 'To Delete',
        description: 'Gone soon',
        category: 'test',
        prompt: 'Bye',
        tags: []
      })
      expect(sm.deleteSkill(skill.id)).toBe(true)
      expect(sm.getSkill(skill.id)).toBeNull()
    })

    it('refuses to delete built-in skills', () => {
      expect(sm.deleteSkill('built-in:test-skill')).toBe(false)
    })
  })

  describe('resolveSkillPrompts', () => {
    it('returns combined prompt for skill IDs', () => {
      const skill = sm.createSkill({
        name: 'Skill A',
        description: 'A',
        category: 'test',
        prompt: 'Do A things.',
        tags: []
      })
      const result = sm.resolveSkillPrompts([skill.id, 'built-in:test-skill'])
      expect(result).toContain('Do A things.')
      expect(result).toContain('You are a tester.')
    })

    it('skips unknown skill IDs', () => {
      const result = sm.resolveSkillPrompts(['nonexistent'])
      expect(result).toBe('')
    })

    it('returns empty for no skills', () => {
      expect(sm.resolveSkillPrompts([])).toBe('')
    })
  })
})
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `npx vitest run tests/unit/skill-manager.test.ts`

- [ ] **Step 3: Implement SkillManager**

Create `src/main/skills/skill-manager.ts`:

```ts
import * as fs from 'fs'
import * as path from 'path'
import { v4 as uuid } from 'uuid'
import type { Skill } from '../../shared/types'

export class SkillManager {
  constructor(
    private builtInDir: string,
    private userDir: string
  ) {
    if (!fs.existsSync(userDir)) {
      fs.mkdirSync(userDir, { recursive: true })
    }
  }

  listSkills(): Skill[] {
    return [...this.loadDir(this.builtInDir), ...this.loadDir(this.userDir)]
  }

  getSkill(id: string): Skill | null {
    return this.listSkills().find(s => s.id === id) ?? null
  }

  createSkill(input: { name: string; description: string; category: string; prompt: string; tags: string[] }): Skill {
    const skill: Skill = {
      id: `user:${uuid().slice(0, 8)}`,
      name: input.name,
      description: input.description,
      category: input.category,
      source: 'user',
      prompt: input.prompt,
      tags: input.tags
    }
    const filePath = path.join(this.userDir, `${skill.id.replace(':', '-')}.json`)
    fs.writeFileSync(filePath, JSON.stringify(skill, null, 2), 'utf-8')
    return skill
  }

  updateSkill(id: string, updates: Partial<Pick<Skill, 'name' | 'description' | 'category' | 'prompt' | 'tags'>>): Skill | null {
    if (id.startsWith('built-in:')) return null

    const filePath = this.findUserFile(id)
    if (!filePath) return null

    const skill: Skill = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
    Object.assign(skill, updates)
    fs.writeFileSync(filePath, JSON.stringify(skill, null, 2), 'utf-8')
    return skill
  }

  deleteSkill(id: string): boolean {
    if (id.startsWith('built-in:')) return false

    const filePath = this.findUserFile(id)
    if (!filePath) return false

    fs.unlinkSync(filePath)
    return true
  }

  resolveSkillPrompts(skillIds: string[]): string {
    const prompts: string[] = []
    for (const id of skillIds) {
      const skill = this.getSkill(id)
      if (skill) prompts.push(skill.prompt)
    }
    return prompts.join('\n\n')
  }

  private loadDir(dir: string): Skill[] {
    if (!fs.existsSync(dir)) return []
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'))
    const skills: Skill[] = []
    for (const file of files) {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf-8'))
        skills.push(data as Skill)
      } catch { /* skip corrupt files */ }
    }
    return skills
  }

  private findUserFile(id: string): string | null {
    const files = fs.readdirSync(this.userDir).filter(f => f.endsWith('.json'))
    for (const file of files) {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(this.userDir, file), 'utf-8'))
        if (data.id === id) return path.join(this.userDir, file)
      } catch { /* skip */ }
    }
    return null
  }
}
```

- [ ] **Step 4: Run tests — expect ALL PASS**

Run: `npx vitest run tests/unit/skill-manager.test.ts`

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`

- [ ] **Step 6: Commit**

```bash
git add src/main/skills/skill-manager.ts tests/unit/skill-manager.test.ts
git commit -m "feat: SkillManager module with CRUD, prompt resolution, built-in + user skill loading"
```

---

### Task 4: Wire SkillManager into Main Process

**Files:**
- Modify: `src/main/index.ts`
- Modify: `src/preload/index.ts`

- [ ] **Step 1: Add SkillManager to main process**

In `src/main/index.ts`, add import:
```ts
import { SkillManager } from './skills/skill-manager'
```

Add module-level variable after `let projectManager`:
```ts
let skillManager: SkillManager
```

In `main()`, after creating `projectManager` and before `setupIPC()`, init SkillManager:
```ts
  // Skills: built-in from app resources, user skills in userData
  const builtInSkillsDir = app.isPackaged
    ? path.join(process.resourcesPath, 'data', 'skills')
    : path.join(__dirname, '../data/skills')
  const userSkillsDir = path.join(app.getPath('userData'), 'skills')
  skillManager = new SkillManager(builtInSkillsDir, userSkillsDir)
```

Add skill IPC handlers in `setupIPC()`:
```ts
  // Skills IPC
  ipcMain.handle(IPC.SKILL_LIST, () => skillManager.listSkills())

  ipcMain.handle(IPC.SKILL_GET, (_event, id: string) => skillManager.getSkill(id))

  ipcMain.handle(IPC.SKILL_CREATE, (_event, input: { name: string; description: string; category: string; prompt: string; tags: string[] }) => {
    return skillManager.createSkill(input)
  })

  ipcMain.handle(IPC.SKILL_UPDATE, (_event, id: string, updates: any) => {
    return skillManager.updateSkill(id, updates)
  })

  ipcMain.handle(IPC.SKILL_DELETE, (_event, id: string) => {
    return skillManager.deleteSkill(id)
  })
```

- [ ] **Step 2: Compose skill prompts at spawn time**

In the `SPAWN_AGENT` handler, right after the `hub.registry.register(config)` line, add skill prompt composition:

```ts
    // Compose skill prompts into ceoNotes
    if (config.skills && config.skills.length > 0) {
      const skillPrompt = skillManager.resolveSkillPrompts(config.skills)
      if (skillPrompt) {
        // Prepend skill prompts to CEO notes — agent sees both via read_ceo_notes()
        const registered = hub.registry.get(config.name)
        if (registered) {
          registered.ceoNotes = [skillPrompt, registered.ceoNotes].filter(Boolean).join('\n\n')
        }
      }
    }
```

- [ ] **Step 3: Add preload bridge**

In `src/preload/index.ts`, add to electronAPI:
```ts
  // Skills
  listSkills: () => ipcRenderer.invoke(IPC.SKILL_LIST),
  getSkill: (id: string) => ipcRenderer.invoke(IPC.SKILL_GET, id),
  createSkill: (input: unknown) => ipcRenderer.invoke(IPC.SKILL_CREATE, input),
  updateSkill: (id: string, updates: unknown) => ipcRenderer.invoke(IPC.SKILL_UPDATE, id, updates),
  deleteSkill: (id: string) => ipcRenderer.invoke(IPC.SKILL_DELETE, id),
```

- [ ] **Step 4: Verify build**

Run: `npx tsc --noEmit`

- [ ] **Step 5: Commit**

```bash
git add src/main/index.ts src/preload/index.ts
git commit -m "feat: wire SkillManager into main process — IPC handlers + skill prompt composition at spawn"
```

---

### Task 5: SpawnDialog Skill Picker

**Files:**
- Modify: `src/renderer/components/SpawnDialog.tsx`

- [ ] **Step 1: Add skill state and picker UI**

In SpawnDialog, add state:
```ts
  const [selectedSkills, setSelectedSkills] = useState<Array<{ id: string; name: string }>>([])
  const [showSkillBrowser, setShowSkillBrowser] = useState(false)
```

In `handleSubmit`, add `skills` to the onSpawn call:
```ts
      skills: selectedSkills.length > 0 ? selectedSkills.map(s => s.id) : undefined,
```

Add this JSX section between the Role section and CEO Notes textarea:

```tsx
        <label style={labelStyle}>
          Skills (optional)
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', minHeight: '28px' }}>
            {selectedSkills.map(skill => (
              <span key={skill.id} style={{
                padding: '2px 8px',
                backgroundColor: '#2d3a4d',
                border: '1px solid #4a6fa5',
                borderRadius: '12px',
                fontSize: '11px',
                color: '#8cb4e0',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}>
                {skill.name}
                <span
                  onClick={() => setSelectedSkills(prev => prev.filter(s => s.id !== skill.id))}
                  style={{ cursor: 'pointer', color: '#666' }}
                >x</span>
              </span>
            ))}
            <button
              type="button"
              onClick={() => setShowSkillBrowser(true)}
              style={{
                padding: '2px 10px',
                backgroundColor: '#2a2a2a',
                border: '1px solid #444',
                borderRadius: '12px',
                fontSize: '11px',
                color: '#888',
                cursor: 'pointer'
              }}
            >+ Add Skills</button>
          </div>
        </label>
```

For the SkillBrowser dialog integration, add at the end of the component return (before the closing `</div>`):

```tsx
        {showSkillBrowser && (
          <SkillBrowser
            selectedIds={selectedSkills.map(s => s.id)}
            onToggleSkill={(skill) => {
              setSelectedSkills(prev => {
                const exists = prev.find(s => s.id === skill.id)
                if (exists) return prev.filter(s => s.id !== skill.id)
                return [...prev, { id: skill.id, name: skill.name }]
              })
            }}
            onClose={() => setShowSkillBrowser(false)}
          />
        )}
```

Add import at the top:
```ts
import { SkillBrowser } from './SkillBrowser'
```

- [ ] **Step 2: Verify build** (will fail until Task 6 creates SkillBrowser — that's OK)

- [ ] **Step 3: Commit**

```bash
git add src/renderer/components/SpawnDialog.tsx
git commit -m "feat: add skill picker to SpawnDialog — chip display + add skills button"
```

---

### Task 6: SkillBrowser Dialog

**Files:**
- Create: `src/renderer/components/SkillBrowser.tsx`

- [ ] **Step 1: Create the SkillBrowser component**

Create `src/renderer/components/SkillBrowser.tsx` — a dialog with three tabs (Built-in, My Skills, Community), search, category filters, and skill preview. This is the biggest UI component.

```tsx
import React, { useState, useEffect, useCallback } from 'react'
import type { Skill } from '../../shared/types'

declare const electronAPI: {
  listSkills: () => Promise<Skill[]>
  createSkill: (input: { name: string; description: string; category: string; prompt: string; tags: string[] }) => Promise<Skill>
  deleteSkill: (id: string) => Promise<boolean>
}

interface SkillBrowserProps {
  selectedIds: string[]
  onToggleSkill: (skill: Skill) => void
  onClose: () => void
}

const CATEGORIES = ['All', 'coding', 'security', 'research', 'workflow', 'language', 'custom']

type Tab = 'built-in' | 'my-skills' | 'community'

export function SkillBrowser({ selectedIds, onToggleSkill, onClose }: SkillBrowserProps): React.ReactElement {
  const [skills, setSkills] = useState<Skill[]>([])
  const [activeTab, setActiveTab] = useState<Tab>('built-in')
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('All')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [newSkill, setNewSkill] = useState({ name: '', description: '', category: 'custom', prompt: '', tags: '' })

  useEffect(() => {
    electronAPI.listSkills().then(setSkills)
  }, [])

  const filteredSkills = skills.filter(s => {
    // Tab filter
    if (activeTab === 'built-in' && s.source !== 'built-in') return false
    if (activeTab === 'my-skills' && s.source !== 'user' && s.source !== 'community') return false
    if (activeTab === 'community') return false // Community tab has its own UI

    // Search
    if (search) {
      const q = search.toLowerCase()
      if (!s.name.toLowerCase().includes(q) && !s.description.toLowerCase().includes(q) && !s.tags.some(t => t.toLowerCase().includes(q))) return false
    }

    // Category
    if (category !== 'All' && s.category !== category) return false

    return true
  })

  const handleCreate = async () => {
    if (!newSkill.name || !newSkill.prompt) return
    const created = await electronAPI.createSkill({
      name: newSkill.name,
      description: newSkill.description,
      category: newSkill.category,
      prompt: newSkill.prompt,
      tags: newSkill.tags.split(',').map(t => t.trim()).filter(Boolean)
    })
    setSkills(prev => [...prev, created])
    setShowCreateForm(false)
    setNewSkill({ name: '', description: '', category: 'custom', prompt: '', tags: '' })
  }

  const handleDelete = async (id: string) => {
    await electronAPI.deleteSkill(id)
    setSkills(prev => prev.filter(s => s.id !== id))
  }

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 100001
    }}>
      <div style={{
        backgroundColor: '#1e1e1e', border: '1px solid #333', borderRadius: '8px',
        padding: '24px', width: '550px', maxHeight: '600px',
        display: 'flex', flexDirection: 'column', gap: '12px'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: '16px', color: '#e0e0e0' }}>Skills Browser</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#666', fontSize: '24px', cursor: 'pointer' }}>x</button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '4px', borderBottom: '1px solid #333', paddingBottom: '8px' }}>
          {(['built-in', 'my-skills', 'community'] as Tab[]).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)} style={{
              flex: 1, padding: '6px 12px', fontSize: '12px', borderRadius: '4px', cursor: 'pointer',
              border: activeTab === tab ? '1px solid #555' : '1px solid #444',
              backgroundColor: activeTab === tab ? '#3a3a3a' : '#2a2a2a',
              color: activeTab === tab ? '#e0e0e0' : '#888',
              fontWeight: activeTab === tab ? 'bold' : 'normal'
            }}>
              {tab === 'built-in' ? 'Built-in' : tab === 'my-skills' ? 'My Skills' : 'Community'}
            </button>
          ))}
        </div>

        {/* Search + Category Filter (built-in and my-skills tabs) */}
        {activeTab !== 'community' && (
          <>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search skills..." style={{
              backgroundColor: '#2a2a2a', border: '1px solid #444', borderRadius: '4px',
              padding: '8px', color: '#e0e0e0', fontSize: '13px'
            }} />
            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
              {CATEGORIES.map(cat => (
                <button key={cat} onClick={() => setCategory(cat)} style={{
                  padding: '3px 8px', fontSize: '10px', borderRadius: '10px', cursor: 'pointer',
                  border: category === cat ? '1px solid #4a9eff' : '1px solid #444',
                  backgroundColor: category === cat ? '#1e3a5f' : '#2a2a2a',
                  color: category === cat ? '#8cc4ff' : '#888'
                }}>{cat}</button>
              ))}
            </div>
          </>
        )}

        {/* Skill List */}
        {activeTab !== 'community' && (
          <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '300px' }}>
            {filteredSkills.length === 0 ? (
              <div style={{ color: '#555', textAlign: 'center', padding: '20px 0' }}>
                {activeTab === 'my-skills' ? 'No custom skills yet. Create one below.' : 'No skills match your search.'}
              </div>
            ) : filteredSkills.map(skill => (
              <div key={skill.id} style={{
                padding: '8px 10px', borderRadius: '4px', cursor: 'pointer',
                border: selectedIds.includes(skill.id) ? '1px solid #4a9eff' : '1px solid #333',
                backgroundColor: selectedIds.includes(skill.id) ? '#1e3a5f' : '#252525'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                     onClick={() => setExpandedId(expandedId === skill.id ? null : skill.id)}>
                  <div>
                    <span style={{ fontSize: '13px', color: '#e0e0e0' }}>{skill.name}</span>
                    <span style={{ fontSize: '10px', color: '#666', marginLeft: '8px' }}>{skill.category}</span>
                  </div>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    {skill.source !== 'built-in' && (
                      <button onClick={(e) => { e.stopPropagation(); handleDelete(skill.id) }} style={{
                        background: 'none', border: 'none', color: '#666', fontSize: '12px', cursor: 'pointer'
                      }}>del</button>
                    )}
                    <button onClick={(e) => { e.stopPropagation(); onToggleSkill(skill) }} style={{
                      padding: '2px 8px', fontSize: '10px', borderRadius: '4px', cursor: 'pointer',
                      border: selectedIds.includes(skill.id) ? '1px solid #f44336' : '1px solid #4caf50',
                      backgroundColor: 'transparent',
                      color: selectedIds.includes(skill.id) ? '#f44336' : '#4caf50'
                    }}>{selectedIds.includes(skill.id) ? 'Remove' : 'Attach'}</button>
                  </div>
                </div>
                <div style={{ fontSize: '11px', color: '#888', marginTop: '2px' }}>{skill.description}</div>
                {expandedId === skill.id && (
                  <pre style={{
                    marginTop: '8px', padding: '8px', backgroundColor: '#1a1a1a', borderRadius: '4px',
                    fontSize: '11px', color: '#aaa', whiteSpace: 'pre-wrap', maxHeight: '120px', overflow: 'auto'
                  }}>{skill.prompt}</pre>
                )}
              </div>
            ))}
          </div>
        )}

        {/* My Skills: Create button */}
        {activeTab === 'my-skills' && !showCreateForm && (
          <button onClick={() => setShowCreateForm(true)} style={{
            padding: '8px', backgroundColor: '#2d5a2d', border: '1px solid #4caf50',
            borderRadius: '4px', color: '#4caf50', cursor: 'pointer', fontSize: '12px'
          }}>+ Create Skill</button>
        )}

        {/* Create Skill Form */}
        {activeTab === 'my-skills' && showCreateForm && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', padding: '8px', backgroundColor: '#252525', borderRadius: '4px' }}>
            <input value={newSkill.name} onChange={e => setNewSkill(p => ({ ...p, name: e.target.value }))}
              placeholder="Skill name" style={{ backgroundColor: '#2a2a2a', border: '1px solid #444', borderRadius: '4px', padding: '6px', color: '#e0e0e0', fontSize: '12px' }} />
            <input value={newSkill.description} onChange={e => setNewSkill(p => ({ ...p, description: e.target.value }))}
              placeholder="Description" style={{ backgroundColor: '#2a2a2a', border: '1px solid #444', borderRadius: '4px', padding: '6px', color: '#e0e0e0', fontSize: '12px' }} />
            <select value={newSkill.category} onChange={e => setNewSkill(p => ({ ...p, category: e.target.value }))}
              style={{ backgroundColor: '#2a2a2a', border: '1px solid #444', borderRadius: '4px', padding: '6px', color: '#e0e0e0', fontSize: '12px' }}>
              {CATEGORIES.filter(c => c !== 'All').map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <textarea value={newSkill.prompt} onChange={e => setNewSkill(p => ({ ...p, prompt: e.target.value }))}
              placeholder="Skill prompt (instructions for the agent)" rows={4}
              style={{ backgroundColor: '#2a2a2a', border: '1px solid #444', borderRadius: '4px', padding: '6px', color: '#e0e0e0', fontSize: '12px', resize: 'vertical' }} />
            <input value={newSkill.tags} onChange={e => setNewSkill(p => ({ ...p, tags: e.target.value }))}
              placeholder="Tags (comma-separated)" style={{ backgroundColor: '#2a2a2a', border: '1px solid #444', borderRadius: '4px', padding: '6px', color: '#e0e0e0', fontSize: '12px' }} />
            <div style={{ display: 'flex', gap: '4px', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowCreateForm(false)} style={{ padding: '4px 12px', backgroundColor: '#2a2a2a', border: '1px solid #444', borderRadius: '4px', color: '#888', cursor: 'pointer', fontSize: '11px' }}>Cancel</button>
              <button onClick={handleCreate} disabled={!newSkill.name || !newSkill.prompt} style={{ padding: '4px 12px', backgroundColor: '#2d5a2d', border: '1px solid #4caf50', borderRadius: '4px', color: '#4caf50', cursor: 'pointer', fontSize: '11px' }}>Save</button>
            </div>
          </div>
        )}

        {/* Community Tab */}
        {activeTab === 'community' && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px', padding: '20px 0' }}>
            <div style={{ color: '#888', fontSize: '13px', textAlign: 'center' }}>
              Browse 90,000+ community skills on skills.sh
            </div>
            <button onClick={() => {
              window.open('https://skills.sh', '_blank')
            }} style={{
              padding: '10px 20px', backgroundColor: '#1e3a5f', border: '1px solid #4a9eff',
              borderRadius: '6px', color: '#8cc4ff', cursor: 'pointer', fontSize: '13px'
            }}>
              Open skills.sh
            </button>
            <div style={{ color: '#555', fontSize: '11px', textAlign: 'center', maxWidth: '350px' }}>
              Find a skill you like, then create it in "My Skills" tab with the prompt content. Full API integration coming soon.
            </div>
          </div>
        )}

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #333', paddingTop: '8px' }}>
          <span style={{ fontSize: '11px', color: '#666' }}>
            {selectedIds.length} skill{selectedIds.length !== 1 ? 's' : ''} attached
          </span>
          <button onClick={onClose} style={{
            padding: '6px 16px', backgroundColor: '#2a4a5a', border: '1px solid #4a9eff',
            borderRadius: '4px', color: '#4a9eff', cursor: 'pointer', fontSize: '12px'
          }}>Done</button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify build**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Run full test suite**

Run: `npx vitest run`

- [ ] **Step 4: Commit**

```bash
git add src/renderer/components/SkillBrowser.tsx
git commit -m "feat: SkillBrowser dialog — browse, search, create, attach skills to agents"
```

---

### Task 7: Integration Verification

- [ ] **Step 1: Type-check**

Run: `npx tsc --noEmit`

- [ ] **Step 2: Run all tests**

Run: `npx vitest run`

- [ ] **Step 3: Final commit if anything remains**

```bash
git add -A && git status
```

If clean, done. If changes remain, commit them.

---

### Summary

| Task | What | Risk |
|------|------|------|
| 1 | Types + IPC channels | Trivial |
| 2 | 15 built-in skill JSON files | Trivial — data only |
| 3 | SkillManager TDD | Low — isolated module |
| 4 | Wire into main process + preload | Medium — touches spawn flow |
| 5 | SpawnDialog skill picker | Low — additive UI |
| 6 | SkillBrowser dialog | Medium — largest component |
| 7 | Integration verification | Zero — read-only |
