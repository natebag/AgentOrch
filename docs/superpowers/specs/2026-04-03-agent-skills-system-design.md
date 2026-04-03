# Agent Skills System

**Date:** 2026-04-03
**Status:** Approved

## Problem

Agents currently get their capabilities from free-text CEO Notes written manually per agent. This is like giving someone a job description on a napkin. There's no way to reuse, share, or compose proven instruction sets across agents or projects.

## Solution

A skills system where agents gain capabilities from composable prompt modules. Skills are structured instruction sets that attach to agents at spawn time, combining with CEO Notes. Three sources: built-in library, user-created, and community (skills.sh).

## Skill Data Format

```ts
interface Skill {
  id: string
  name: string
  description: string
  category: string
  source: 'built-in' | 'user' | 'community'
  prompt: string
  tags: string[]
}
```

The `prompt` field contains the actual instructions injected into the agent's context. Skills are stored as JSON files.

## Storage

- **Built-in skills:** `src/data/skills/*.json` — ship with the repo
- **User + community skills:** `app.getPath('userData')/skills/*.json` — persist across projects
- Skills are global (not project-scoped) — like saved presets

## How Skills Attach to Agents

1. SpawnDialog has a new "Skills" section with a chip picker
2. User selects skills (multi-select)
3. At spawn, selected skill prompts are concatenated and prepended to CEO Notes
4. Final agent prompt = `[skill 1 prompt]\n\n[skill 2 prompt]\n\n[CEO Notes]`
5. CEO Notes field stays as-is — user can add custom instructions on top of skills

### AgentConfig Change

Add optional field:
```ts
skills?: string[]  // skill IDs attached to this agent
```

## UI Components

### SpawnDialog Addition

Below the Role selector, above CEO Notes:

```
Skills (optional)
[Code Reviewer ×] [Security Auditor ×]  [+ Add Skills]
```

- Chips show attached skills with × to remove
- "+ Add Skills" opens the Skills Browser dialog
- Skills combine into a read-only preview above CEO Notes

### Skills Browser Dialog

New dialog (similar to PresetDialog), opened from SpawnDialog or from TopBar.

**Three tabs:**

**Built-in tab:**
- Grid/list of built-in skills
- Search bar (name + description + tags)
- Category filter chips: Coding, Research, Workflow, Language, Security
- Click skill → expanded view with full description + prompt preview
- "Attach" button → adds to current agent's skill list

**My Skills tab:**
- List of user-created and installed community skills
- "Create Skill" button → form: name, description, category, tags, prompt (textarea)
- Edit / delete existing skills
- Skills saved to `userData/skills/`

**Community tab:**
- Search input that queries skills.sh catalog
- Results show: name, description, install count, source repo
- "Install" button → fetches skill content, saves to `userData/skills/` as community source
- Installed skills appear in "My Skills" tab afterward

## IPC Channels

```ts
SKILL_LIST: 'skill:list'            // → Skill[] (all sources combined)
SKILL_GET: 'skill:get'              // (id) → Skill
SKILL_CREATE: 'skill:create'        // (skill) → Skill
SKILL_UPDATE: 'skill:update'        // (id, updates) → Skill
SKILL_DELETE: 'skill:delete'        // (id) → void
SKILL_SEARCH_COMMUNITY: 'skill:search-community'  // (query) → CommunitySkill[]
SKILL_INSTALL_COMMUNITY: 'skill:install-community' // (source, skillId) → Skill
```

## Main Process: SkillManager

New module `src/main/skills/skill-manager.ts`:

- `listSkills()` — reads built-in + user skills, returns combined list
- `getSkill(id)` — find by ID across all sources
- `createSkill(skill)` — save to userData/skills/
- `updateSkill(id, updates)` — update user skill
- `deleteSkill(id)` — delete user skill (can't delete built-in)
- `resolveSkillPrompts(skillIds)` — given skill IDs, return combined prompt text
- `searchCommunity(query)` — fetch from skills.sh API/website
- `installCommunity(source, skillId)` — download and save to userData/skills/

## CEO Notes Integration

In the SPAWN_AGENT handler, before building the initial prompt:

```ts
// Resolve skills into prompt text
let skillPrompt = ''
if (config.skills && config.skills.length > 0) {
  skillPrompt = skillManager.resolveSkillPrompts(config.skills)
}

// Combine: skills + CEO notes
const fullCeoNotes = [skillPrompt, config.ceoNotes].filter(Boolean).join('\n\n')
// Use fullCeoNotes where ceoNotes was used before
```

The agent sees skills as part of their CEO Notes when they call `read_ceo_notes()`.

## Built-in Skills Library (15 skills)

### Coding
1. **Code Reviewer** — Review code for quality, bugs, maintainability. Provide specific line-level feedback.
2. **Security Auditor** — Check for OWASP Top 10, injection, auth issues, secrets exposure.
3. **TDD Enforcer** — Always write tests first. Red-green-refactor. Refuse to write implementation without tests.
4. **Refactoring Expert** — Identify code smells, suggest improvements, maintain behavior while improving structure.
5. **Documentation Writer** — Write clear docs, README sections, API references, inline comments where complex.

### Research
6. **Deep Researcher** — Thoroughly investigate topics. Cross-reference sources. Post findings to info channel with tags.
7. **Competitive Analyst** — Research competing solutions, compare approaches, summarize trade-offs.
8. **API Explorer** — Read API docs, test endpoints, document request/response shapes.

### Workflow
9. **Task Decomposer** — Break large tasks into small, actionable subtasks. Post each as a pinboard task.
10. **Progress Reporter** — Regularly post status updates to info channel. Summarize what's done, what's next, blockers.
11. **Blocker Detector** — Monitor task board and agent output for stuck agents. Alert orchestrator when someone is blocked.

### Language-Specific
12. **TypeScript Expert** — Enforce strict types, modern patterns, proper error handling, no `any`.
13. **Python Expert** — PEP 8, type hints, Pythonic idioms, proper venv/dependency management.
14. **Rust Expert** — Ownership patterns, error handling with Result, idiomatic Rust, unsafe usage review.
15. **Go Expert** — Idiomatic Go, proper error handling, goroutine safety, go vet compliance.

## Community Integration (skills.sh)

Skills.sh uses `npx skillsadd <owner/repo>` for installation. For AgentOrch:

1. **Search:** Fetch skills.sh catalog page, parse results (or use their API if available)
2. **Preview:** Show skill name, description, install count
3. **Install:** Either run `npx skillsadd` in a temp directory and read the output, OR directly fetch the skill content from the source GitHub repo
4. **Save:** Convert to our Skill JSON format, save to `userData/skills/`

Fallback if skills.sh API isn't accessible: "Browse Community" button opens skills.sh in the default browser, user copies the skill content manually into "Create Skill" form.

## What Doesn't Change

- CEO Notes field in SpawnDialog — stays as-is, free text
- Initial prompt format — unchanged
- MCP tools — unchanged
- Templates system — unchanged (future: templates could reference skill IDs)
- Existing agent config fields — unchanged (skills is additive optional field)

## Testing

- Unit test: SkillManager (CRUD, resolve prompts, built-in loading)
- Unit test: skill prompt composition (multiple skills + CEO notes)
- Integration: spawn agent with skills, verify read_ceo_notes returns combined prompt
