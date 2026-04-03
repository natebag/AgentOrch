# AgentOrch — Attack Plan

**Last updated:** 2026-04-01
**Status:** Planning (execution starts Saturday 2026-04-05)

---

## North Star

AgentOrch becomes the first AI-native IDE — a workspace built from the ground up for AI agents as primary workers, with humans directing. Not an editor with AI bolted on. An orchestrator that grows into a full development environment.

---

## Phase 0: Shore Up the Foundation

**Goal:** Make what we have reliable. No new features — just make existing features actually work correctly.

**Estimated effort:** 1-2 sessions

| # | Task | File(s) | Notes |
|---|------|---------|-------|
| 1 | hubFetch error handling | `src/mcp-server/index.ts` | try/catch, check `res.ok`, structured error responses |
| 2 | Add `isError: true` to all tool error returns | `src/mcp-server/index.ts` | Models can't distinguish success from failure without this |
| 3 | Registry upsert instead of throw on duplicate | `src/main/hub/agent-registry.ts` | Agent restart shouldn't crash the hub |
| 4 | Strip ceoNotes from `GET /agents` response | `src/main/hub/routes.ts` | Token waste + information leak |
| 5 | Add `createdBy` field to tasks | `src/main/hub/routes.ts`, `src/shared/types.ts` | Track who posted what |
| 6 | Status-driven prompt injection | `src/main/index.ts` | Replace `CLI_LOAD_TIME = 10000` with StatusDetector one-shot listener |
| 7 | Queue-aware message nudging | `src/main/index.ts` | Only inject nudges when agent is at prompt, not mid-response |
| 8 | Non-destructive `get_messages` | `src/main/hub/message-router.ts` | Peek + ack pattern instead of delete-on-read |

**Done when:** All existing MCP tools return proper errors, agents reconnect cleanly, message delivery is reliable.

---

## Phase 1: Project-Based Persistence

**Goal:** AgentOrch becomes project-aware. Each folder gets its own workspace state. No more ghost data from last Tuesday's project.

**Estimated effort:** 2-3 sessions

### Architecture

```
/path/to/my-project/
├── .agentorch/
│   ├── agentorch.db        # pinboard, messages, info — per-project
│   ├── presets/             # saved agent configurations for this project
│   └── mcp-configs/        # per-project MCP setups (generated at spawn)
├── src/
├── package.json
└── ...
```

Global state (lives in `app.getPath('userData')`):
```
userData/
├── recent-projects.json    # [{ path, name, lastOpened }]
└── global-settings.json    # app-level preferences
```

### Tasks

| # | Task | Notes |
|---|------|-------|
| 1 | Project selection dialog on launch | "Open folder" + "Recent projects" list |
| 2 | Move DB path to `projectPath/.agentorch/agentorch.db` | Replace `app.getPath('userData')` with project-relative |
| 3 | Recent projects persistence | JSON file in userData, update on open |
| 4 | Project name in window title | `AgentOrch — my-crypto-bot` |
| 5 | Remove the DELETE FROM statements | No longer needed — new project = new folder = clean DB |
| 6 | Presets become project-scoped | Save/load from `.agentorch/presets/` |
| 7 | Add "Switch Project" to top bar | Open a different folder without restarting the app |

**Done when:** Opening AgentOrch in `~/project-a` and `~/project-b` gives completely isolated workspaces with their own pinboards, messages, presets, and info channels.

---

## Phase 2: OpenClaude Integration

**Goal:** Any model, same tool system. Agents stop being tied to specific CLIs.

**Estimated effort:** 2-3 sessions

### Tasks

| # | Task | Notes |
|---|------|-------|
| 1 | Add `'openclaude'` to CLI type union | `src/shared/types.ts` |
| 2 | OpenClaude launch logic | `src/main/cli-launch.ts` — model via env var, same MCP config |
| 3 | Model provider picker in SpawnDialog | Dropdown: provider (OpenAI, DeepSeek, Ollama, etc.) + model name |
| 4 | Verify MCP config compatibility | OpenClaude is a CC fork — `--mcp-config` should work as-is |
| 5 | Multi-model preset templates | "Cost-Optimized Team", "Local-Only Team", etc. |
| 6 | Secret handling via env vars for all CLIs | Fix the `ps aux` leak — env vars instead of CLI args |
| 7 | Test cross-model agent communication | Spawn a DeepSeek agent and a Claude agent, verify they can message each other |

### External Tools to Leverage

Discovered via Kimi research (2026-04-02):

| Tool | Repo / Link | What It Does | How We Use It |
|------|-------------|--------------|---------------|
| **OpenClaude** | `Gitlawb/openclaude` | OpenAI-compatible shim — runs CC's tool system against any LLM | Primary integration target. Agents get CC's bash/file/MCP tooling on GPT-4o, DeepSeek, Llama, etc. |
| **Claude Code Router (CCR)** | `musistudio/claude-code-router` | Model routing by scenario (think/background/longContext/webSearch) | Informs our orchestrator's task assignment — route "think hard" to Opus, "just grep" to a fast model |
| **Z.ai Docs** | `docs.z.ai/scenario-example/develop-tools/claude` | GLM model integration via settings.json | Reference for adding GLM/Zhipu as a provider option |

**Key insight:** Instead of treating each CLI as a black box, we can spawn multiple CC instances each backed by a different model via OpenClaude. This gives every agent the same rich tooling (bash, file ops, MCP, agents) regardless of the underlying LLM — the orchestrator just picks the right model for the task.

**Done when:** You can spawn a team where one agent runs DeepSeek, another runs GPT-4o, another runs local Ollama — all using the same MCP tools, all communicating through the hub.

---

## Phase 3: Missing Tools & Reliability

**Goal:** Fill the gaps in the MCP tool surface and make multi-agent workflows robust.

**Estimated effort:** 1-2 sessions

| # | Task | Notes |
|---|------|-------|
| 1 | `abandon_task(task_id)` | Reset stuck tasks to `open`, clear `claimedBy` |
| 2 | `get_message_history(agent?, limit?)` | Route exists in DB layer, just needs MCP tool + HTTP route |
| 3 | `get_task(task_id)` | Fetch one task without dumping the entire pinboard |
| 4 | `delete_info(id)` / `update_info(id)` | Correct or remove stale info channel entries |
| 5 | `update_status` MCP tool | Expose `AgentRegistry.updateStatus()` to agents |
| 6 | Heartbeat / health check | Detect silent MCP server death |
| 7 | OutputBuffer fix | Proper partial-line buffering instead of naive `split('\n')` |
| 8 | Rate limit bump | 10/min → 30/min, or per-target instead of global |
| 9 | Reconnect context injection | On agent respawn, inject summary of recent messages + claimed tasks |
| 10 | **Buddy Room** — panel + MCP tool | New UI panel (like Pinboard/InfoChannel) that logs companion buddy speech from all agent terminals |
| 11 | Buddy speech detection | Regex on OutputBuffer stream to identify buddy messages, tag with agent name + timestamp |
| 12 | `read_buddy_room(lines?)` MCP tool | Orchestrator can skim buddy commentary for occasional useful insights — free advisory council |

**Done when:** Agents can abandon tasks, check history, report status, survive crashes gracefully, and buddy chatter is logged for review.

---

## Phase 4: The IDE — File System & Editor

**Goal:** AgentOrch stops being "just terminals" and becomes a workspace where you can see and edit the files your agents are working on.

**Estimated effort:** 3-5 sessions

### 4A: File Explorer (sidebar)

| # | Task | Notes |
|---|------|-------|
| 1 | File tree component | React tree view, rooted at project folder |
| 2 | Expand/collapse folders | Lazy-load directory contents for performance |
| 3 | File icons by extension | `.ts`, `.json`, `.md`, etc. |
| 4 | Click to open in editor panel | Tabs like VS Code |
| 5 | Right-click context menu | New file, rename, delete, copy path |

### 4B: Editor Panel

| # | Task | Notes |
|---|------|-------|
| 1 | Embed Monaco Editor | Same engine as VS Code, syntax highlighting for free |
| 2 | Tab system | Multiple open files, close/reorder tabs |
| 3 | Auto-save or explicit save | Ctrl+S or debounced auto-save |
| 4 | Dirty file indicator | Dot on tab when unsaved changes exist |
| 5 | Search within file | Ctrl+F find/replace |

### 4C: File Operation MCP Tools

| # | Task | Notes |
|---|------|-------|
| 1 | `read_file(path)` MCP tool | Agents can read project files through the hub |
| 2 | `write_file(path, content)` MCP tool | Agents can create/update files |
| 3 | `list_directory(path)` MCP tool | Agents can browse the file tree |
| 4 | File change notifications | When an agent writes a file, editor refreshes + other agents can subscribe |
| 5 | Diff view | Agent proposes a change, human reviews before applying |

**Done when:** You can see your project files in a sidebar, open them in an editor, and agents can read/write files through MCP — with changes visible in real-time.

---

## Phase 5: Advanced IDE Features (Future)

These are stretch goals. Don't plan exact tasks yet — the shape will become clearer after Phase 4.

- **Agent modes** — Architect (plans), Coder (implements), Reviewer (checks), Tester (validates)
- **Workflow templates** — "Refactor this codebase" spawns a choreographed multi-agent pipeline
- **Live preview panel** — Agent builds a web app, preview updates in real-time
- **Git integration** — Agents commit with meaningful messages, branch management UI
- **Dynamic model switching** — Agent starts cheap, escalates to expensive when stuck (`switch_model` MCP tool). CCR's scenario-based routing (think/background/longContext) is a reference implementation for this.
- **Agent-driven IDE commands** — "Open this file for me", "Highlight line 45", "Show me the diff"
- **Cross-session agent memory** — Agents auto-summarize work, recall context from previous sessions (inspired by CC's `extractMemories`)
- **Proactive idle detection** — If agent is idle too long, auto-check pinboard for unclaimed tasks (inspired by CC's KAIROS)

---

## Rules of Engagement

1. **Each phase must be solid before starting the next.** No half-built features.
2. **Write tests as we go.** The existing test suite (`tests/`) should grow with each phase.
3. **Verify before claiming done.** Build compiles, tests pass, feature actually works.
4. **One PR per phase** (or per sub-phase for Phase 4). Keep changes reviewable.
5. **Update this doc** as phases complete — mark done, add learnings, adjust future phases.

---

## Quick Reference

| Phase | What | When |
|-------|------|------|
| **0** | Fix bugs & reliability | First session (Saturday) |
| **1** | Project-based persistence | After Phase 0 |
| **2** | OpenClaude multi-model | After Phase 1 |
| **3** | Missing MCP tools | After Phase 2 |
| **4** | File explorer + editor + file MCP | After Phase 3 |
| **5** | Advanced IDE features | After Phase 4 |
