# AgentOrch — Complete Project Reference

**Version:** As of 2026-04-03
**Repo:** https://github.com/natebag/AgentOrch
**Author:** Nate (natebag)
**102 commits | 46 source files | 157 tests (146 passing)**

---

## What Is AgentOrch?

AgentOrch is a desktop application for orchestrating multiple AI coding agents. Think of it as an IDE built from the ground up for AI agents as primary workers, with humans directing.

You open AgentOrch, point it at a project folder, and spawn a team of AI agents — each in its own terminal window. The agents communicate through a shared hub using MCP (Model Context Protocol) tools: messaging each other, posting tasks to a shared pinboard, sharing research findings, reading and writing project files. You watch them work, review their output, and steer from above.

**The key insight:** Instead of one AI assistant doing everything, you orchestrate a TEAM. An Opus-powered orchestrator breaks down work, Sonnet workers implement in parallel, a reviewer checks quality. Different models for different jobs. Different providers even — Claude, Codex, Kimi, Gemini, DeepSeek, local Ollama models — all in one workspace, all communicating through the same tools.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop shell | Electron 41 |
| Build system | electron-vite |
| Language | TypeScript (strict) |
| Renderer UI | React 19 |
| Hub server | Express 5 (runs inside Electron main process) |
| Database | better-sqlite3 (SQLite, per-project) |
| Terminal emulation | xterm.js + node-pty |
| Code editor | Monaco Editor (@monaco-editor/react) |
| Agent communication | MCP SDK (@modelcontextprotocol/sdk) |
| Floating windows | react-rnd |
| Testing | vitest |

---

## Architecture

```
AgentOrch (Electron App)
│
├── Main Process (src/main/)
│   ├── Hub Server (Express on localhost, authenticated)
│   │   ├── AgentRegistry — tracks all agents + status + heartbeat
│   │   ├── MessageRouter — agent-to-agent messaging with peek/ack
│   │   ├── Pinboard — shared task board (post/claim/complete/abandon)
│   │   ├── InfoChannel — shared knowledge feed (post/read/update/delete)
│   │   ├── BuddyRoom — companion speech log from all terminals
│   │   ├── Routes — HTTP API for all the above + file operations
│   │   └── Auth — shared secret, timing-safe validation
│   │
│   ├── Shell Management
│   │   ├── PtyManager — spawns node-pty terminals per agent
│   │   ├── StatusDetector — detects when agent is at prompt vs working
│   │   ├── OutputBuffer — rolling line buffer with partial-line handling
│   │   └── BuddyDetector — scans PTY output for companion speech
│   │
│   ├── MCP Config — writes per-agent MCP config files (temp dir)
│   ├── CLI Launch — builds launch commands per CLI type
│   ├── ProjectManager — per-project .agentorch/ folders, recent projects
│   ├── PresetManager — global saved team presets
│   ├── SkillManager — built-in + user skill definitions, prompt composition
│   └── Database — SQLite persistence (messages, tasks, info entries)
│
├── MCP Server (src/mcp-server/) — standalone Node process per agent
│   └── 22 MCP tools that proxy to the hub via HTTP
│
├── Preload (src/preload/) — IPC bridge, context isolation
│
├── Renderer (src/renderer/) — React UI
│   ├── App.tsx — root, project state, dialog management
│   ├── Workspace.tsx — infinite canvas with floating windows
│   ├── TopBar.tsx — agent pills, panel toggles, project switcher
│   ├── FloatingWindow.tsx — draggable/resizable window container
│   ├── TerminalWindow.tsx — xterm.js terminal per agent
│   ├── SpawnDialog.tsx — agent creation (CLI, model, role, skills, CEO notes)
│   ├── PresetDialog.tsx — save/load presets + 39 templates with search/filter
│   ├── ProjectPickerDialog.tsx — project selection on launch
│   ├── SkillBrowser.tsx — browse, search, create, attach skills
│   ├── FilePanel.tsx — file explorer tree + Monaco editor with tabs
│   ├── PinboardPanel.tsx — shared task board viewer
│   ├── InfoChannelPanel.tsx — shared info feed viewer
│   ├── BuddyRoomPanel.tsx — companion speech log viewer
│   └── Hooks (useWindowManager, useAgents, useSnapZones)
│
└── Shared (src/shared/)
    └── types.ts — all interfaces, IPC channel constants
```

---

## How It Works: The Agent Lifecycle

### 1. Project Selection
On launch, AgentOrch reads `recent-projects.json` from userData. If there's a recent project, it auto-opens. Otherwise, it shows a project picker dialog. Each project gets its own `.agentorch/` folder with an isolated SQLite database and presets directory.

### 2. Spawning an Agent
The user opens the SpawnDialog and configures:
- **Name** — e.g., "orchestrator", "worker-1"
- **CLI** — Claude Code, Codex, Kimi, Gemini, OpenClaude, Copilot, Grok, or plain terminal
- **Model** — specific model (Opus, Sonnet, GPT-4o, DeepSeek, etc.)
- **Role** — orchestrator, worker, researcher, reviewer, or custom
- **Skills** — composable capability modules from the skill browser (optional)
- **CEO Notes** — free-text instructions (combined with skills)
- **Working Directory** — where the agent operates
- **Auto-approve mode** — skip permission prompts

When spawned:
1. A per-agent MCP config file is written to temp dir
2. A PTY (pseudo-terminal) is spawned with the selected shell
3. The CLI launch command is typed into the shell
4. StatusDetector watches for the CLI to reach its prompt
5. An initial prompt is injected telling the agent its role and available MCP tools
6. The agent registers with the hub and starts working

### 3. Agent Communication
Agents communicate through 22 MCP tools that proxy to the hub's HTTP API:

**Messaging:**
- `send_message(to, message)` — direct message to another agent
- `get_messages(peek?)` — check inbox (peek mode doesn't clear queue)
- `ack_messages(message_ids)` — acknowledge processed messages
- `broadcast(message)` — message all agents at once
- `get_message_history(agent?, limit?)` — retrieve past messages from DB

**Task Management:**
- `post_task(title, description, priority)` — post to shared pinboard
- `read_tasks()` — list all tasks
- `get_task(task_id)` — fetch single task by ID
- `claim_task(task_id)` — claim an open task
- `complete_task(task_id, result?)` — mark task done
- `abandon_task(task_id)` — release a stuck task back to open

**Shared Knowledge:**
- `post_info(note, tags?)` — post to info channel
- `read_info(tags?)` — read info feed, optionally filtered by tags
- `update_info(id, note)` — update an existing entry
- `delete_info(id)` — remove an entry

**Agent Discovery:**
- `get_agents()` — list all agents (name, role, status, healthy flag)
- `read_ceo_notes()` — re-read your own instructions
- `update_status(status)` — self-report status (idle/active/working)
- `get_agent_output(agent, lines?)` — peek at another agent's terminal

**File Operations:**
- `read_file(path)` — read a project file (1MB limit)
- `write_file(path, content)` — write/create a file (auto-creates dirs)
- `list_directory(path?)` — list files and subdirectories

**Companion:**
- `read_buddy_room(count?)` — read companion speech from all terminals

### 4. Nudge System
Agents don't poll for work — they wait. When something needs their attention, the hub injects a nudge directly into their terminal:

- **Message nudge:** When a message is sent to an agent → "New message from X. Call get_messages() now."
- **Task nudge:** When a task is posted → "New task posted: Y. Call read_tasks() to claim it."
- **Info nudge:** When info is posted → orchestrators get nudged to read it.

Nudges are queue-aware: if the agent is at a prompt (`active` status), the nudge is delivered immediately. If the agent is mid-response, it's queued and delivered when they finish. A 5-second fallback timer ensures delivery even if the StatusDetector can't detect the prompt (fixes Kimi/Gemini).

### 5. Reconnection
If an agent crashes, AgentOrch auto-respawns it after 3 seconds with a reconnect prompt that includes context about what it was doing (claimed tasks + pending messages). The registry upserts on re-registration instead of throwing.

### 6. Heartbeat
Each MCP server pings the hub every 30 seconds. The `GET /agents` endpoint includes a `healthy` boolean. If pings stop for 60+ seconds, the agent shows as unhealthy.

---

## Project-Based Persistence

Each project folder gets:
```
/path/to/my-project/
├── .agentorch/
│   ├── .gitignore          # ignores DB files, presets are committable
│   ├── agentorch.db        # SQLite — messages, tasks, info entries
│   └── presets/             # (reserved for future project-scoped presets)
├── src/
└── ...
```

Global state (in `app.getPath('userData')`):
```
userData/
├── recent-projects.json     # last 20 projects
├── presets/                  # saved team presets (global, follow user)
└── skills/                   # user-created skills
```

Data persists across sessions. No more DB wipe on startup.

---

## Multi-Model Support

AgentOrch supports 7+ CLI types:

| CLI | Provider | Models |
|-----|----------|--------|
| Claude Code | Anthropic | Opus, Sonnet, Haiku |
| Codex CLI | OpenAI | o4-mini, GPT-4.1, o3 |
| Kimi CLI | Moonshot | Default, K2.5, Thinking Turbo |
| Gemini CLI | Google | 2.5 Pro, 2.5 Flash, 2.0 Flash |
| OpenClaude | Any (200+ models) | GPT-4o, DeepSeek, Ollama, Mistral, etc. |
| GitHub Copilot | Microsoft | Default, GPT-4o, o3-mini |
| Grok CLI | xAI | Grok 3, Grok 3 Mini |

**OpenClaude** is the key: it's a Claude Code fork that replaces the Anthropic API layer with an OpenAI-compatible shim. This means any model gets Claude Code's full tool system (bash, file ops, MCP, agents). Install once, point at any provider via env vars.

---

## Preset Templates (39 Built-in)

Templates are pre-configured team compositions. The Templates tab has search + CLI filter chips so you only see teams you can actually run.

**Claude-only (8):** Orchestrator+Workers, Research Squad, Code+Review, Speed Swarm, Solo Opus, TDD Pipeline, Documentation Team, Rapid Prototyper

**Codex-only (3):** Solo, Orch+Workers, Code+Review

**Kimi-only (3):** Solo, Research Pair, Code+Review

**Gemini-only (3):** Solo, Research Squad, Code+Review

**Cross-CLI pairs (6):** Claude+Codex, Claude+Kimi, Claude+Gemini, Codex+Kimi, Codex+Gemini, Kimi+Gemini

**Creative mixes (3):** Codex+Claude Review, Gemini Lead+Claude Workers, Kimi Lead+Codex Workers

**Triples (4):** C+Cx+K, C+Cx+G, C+K+G, Cx+K+G

**Quads (2):** The Full Stack (all 4 CLIs), Everyone Reviews Claude

**OpenClaude (7):** GPT-4o+DeepSeek, Full OpenAI, DeepSeek Squad, Mixed Provider, OpenRouter Mix, Ollama Local, Hybrid Local+Cloud

Saved presets are global (follow you across projects). Templates ship with the repo.

---

## Skills System

Skills are composable prompt modules that enhance agent capabilities. Instead of writing manual CEO Notes for every agent, you snap on pre-built skill modules.

**15 built-in skills** in 5 categories:
- **Coding:** Code Reviewer, Security Auditor, TDD Enforcer, Refactoring Expert, Documentation Writer
- **Research:** Deep Researcher, Competitive Analyst, API Explorer
- **Workflow:** Task Decomposer, Progress Reporter, Blocker Detector
- **Language:** TypeScript Expert, Python Expert, Rust Expert, Go Expert

**How it works:**
1. SpawnDialog has a skill picker (chip-style multi-select)
2. Click "+ Add Skills" to open the SkillBrowser (3 tabs: Built-in, My Skills, Community)
3. Selected skills' prompts are combined and prepended to CEO Notes at spawn
4. Agent sees skills + CEO Notes when calling `read_ceo_notes()`
5. CEO Notes stays as free text on top of skills — custom instructions always available

**User-created skills** saved to `userData/skills/`. **Community** tab links to skills.sh (90,000+ community skills).

---

## UI Panels

The workspace has 5 toggleable panels (from TopBar):

| Panel | What it shows |
|-------|--------------|
| **Files** | File explorer tree (left) + Monaco code editor with tabs (right). Browse project files, open/edit/save. |
| **Pinboard** | Shared task board. See all tasks, their status, who claimed them. |
| **Info** | Shared info feed. Research findings, status updates, tagged entries. |
| **Buddy** | Companion speech log. Collects buddy/companion messages from all agent terminals. |
| **Presets** | Save/Load personal presets + browse 39 templates with search and CLI filter. |

Each panel renders as a floating, draggable, resizable window on the infinite canvas alongside agent terminals.

---

## Key Source Files

### Main Process (`src/main/`)

| File | What it does |
|------|-------------|
| `index.ts` | Entry point. App lifecycle, IPC handlers, openProject/closeProject, spawn/kill agents, nudge system |
| `hub/server.ts` | Creates Express hub server with auth middleware |
| `hub/routes.ts` | All HTTP routes (agents, messages, tasks, info, files, buddy room, heartbeat) |
| `hub/agent-registry.ts` | In-memory agent state, upsert on duplicate, heartbeat tracking |
| `hub/message-router.ts` | Message queues, rate limiting (30/min), peek/ack, broadcast |
| `hub/pinboard.ts` | Task CRUD (post, claim, complete, abandon), callbacks |
| `hub/info-channel.ts` | Info entries with tags, FIFO cap at 500, update/delete |
| `hub/buddy-room.ts` | Companion message store, 200-message ring buffer |
| `hub/auth.ts` | Shared secret generation, timing-safe comparison |
| `shell/pty-manager.ts` | Spawn node-pty, wire data/exit/status callbacks |
| `shell/status-detector.ts` | ANSI stripping, prompt regex, silence timer → idle/working/active |
| `shell/output-buffer.ts` | Rolling line buffer with partial-line accumulation |
| `shell/buddy-detector.ts` | Chunk-based companion speech detection from PTY output |
| `cli-launch.ts` | CLI-specific launch command builders (claude, codex, kimi, gemini, openclaude, etc.) |
| `project/project-manager.ts` | .agentorch/ folder creation, recent projects, path resolution |
| `presets/preset-manager.ts` | Save/load/list/delete presets (global userData) |
| `skills/skill-manager.ts` | Load built-in + user skills, CRUD, prompt resolution |
| `mcp/config-writer.ts` | Write per-agent MCP config JSON to temp dir |
| `db/database.ts` | SQLite schema creation, migrations |
| `db/message-store.ts` | Message persistence (insert, query by agent, history) |
| `db/pinboard-store.ts` | Task persistence (save, update, load) |
| `db/info-store.ts` | Info entry persistence (save, load) |

### MCP Server (`src/mcp-server/`)

| File | What it does |
|------|-------------|
| `index.ts` | Standalone MCP server process. 22 tools. Heartbeat timer. Proxies to hub via HTTP. |

### Renderer (`src/renderer/`)

| File | What it does |
|------|-------------|
| `App.tsx` | Root component. Project state, dialog management, TopBar/Workspace wiring |
| `components/Workspace.tsx` | Infinite canvas. CSS transforms for zoom/pan. Renders floating windows. |
| `components/TopBar.tsx` | Project name, agent pills, panel toggles (Files/Pinboard/Info/Buddy/Presets) |
| `components/FloatingWindow.tsx` | react-rnd wrapper. Drag, resize, minimize, maximize, close, snap zones. |
| `components/TerminalWindow.tsx` | xterm.js terminal. PTY I/O via IPC. Focus event filtering. |
| `components/SpawnDialog.tsx` | Agent creation form. CLI picker, model selector, role, skills, CEO notes. |
| `components/PresetDialog.tsx` | Save/Load tabs + Templates tab (39 templates, search, CLI filter chips). |
| `components/ProjectPickerDialog.tsx` | First-launch project selection. Recent projects + open folder. |
| `components/SkillBrowser.tsx` | 3-tab skill browser (Built-in, My Skills, Community). Search, categories, create form. |
| `components/FilePanel.tsx` | Split panel: file tree (left) + Monaco editor with tabs (right). |
| `components/PinboardPanel.tsx` | Task list with status indicators. |
| `components/InfoChannelPanel.tsx` | Info feed with tag badges. |
| `components/BuddyRoomPanel.tsx` | Companion message log with timestamps. |
| `hooks/useWindowManager.ts` | Window state (position, size, z-order, minimize/maximize). |
| `hooks/useAgents.ts` | Agent lifecycle (spawn, kill, state updates via IPC). |
| `hooks/useSnapZones.ts` | Window-to-window and edge snapping during drag. |

### Shared (`src/shared/`)

| File | What it does |
|------|-------------|
| `types.ts` | All TypeScript interfaces (AgentConfig, AgentState, Message, PinboardTask, InfoEntry, BuddyMessage, Skill, etc.) + IPC channel constants |

---

## IPC Channels

All IPC communication uses named channels defined in `src/shared/types.ts`:

**Agent lifecycle:** `agent:spawn`, `agent:kill`, `agent:list`, `agent:state-update`
**Hub info:** `hub:info`
**PTY:** `pty:write`, `pty:output`, `pty:exit`, `pty:resize`
**Presets:** `preset:save`, `preset:load`, `preset:list`, `preset:delete`
**Pinboard:** `pinboard:get-tasks`, `pinboard:task-update`
**Info:** `info:get-entries`, `info:entry-added`
**Buddy:** `buddy:get-messages`, `buddy:message-added`
**Project:** `project:get-current`, `project:switch`, `project:list-recent`, `project:open-folder`, `project:changed`
**Files:** `file:list`, `file:read`, `file:write`
**Skills:** `skill:list`, `skill:get`, `skill:create`, `skill:update`, `skill:delete`, `skill:search-community`, `skill:install-community`

---

## Hub HTTP API

All routes require `Authorization: Bearer <secret>` header.

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/agents` | List agents (ceoNotes stripped, includes healthy flag) |
| POST | `/agents/register` | Register/upsert an agent |
| GET | `/agents/:name/ceo-notes` | Get agent's CEO notes + role |
| POST | `/agents/:name/status` | Agent self-reports status |
| POST | `/agents/:name/heartbeat` | MCP server heartbeat ping |
| GET | `/agents/:name/output` | Get agent's terminal output |
| POST | `/messages/send` | Send direct message |
| POST | `/messages/broadcast` | Message all agents |
| GET | `/messages/:name` | Get messages (supports ?peek=true) |
| POST | `/messages/:name/ack` | Acknowledge messages |
| GET | `/messages/history` | Query message history from DB |
| POST | `/pinboard/tasks` | Post a task |
| GET | `/pinboard/tasks` | List all tasks |
| GET | `/pinboard/tasks/:id` | Get single task |
| POST | `/pinboard/tasks/:id/claim` | Claim a task |
| POST | `/pinboard/tasks/:id/complete` | Complete a task |
| POST | `/pinboard/tasks/:id/abandon` | Abandon a task |
| POST | `/info` | Post info entry |
| GET | `/info` | Read info (supports ?tags= filter) |
| PATCH | `/info/:id` | Update info entry |
| DELETE | `/info/:id` | Delete info entry |
| GET | `/buddy-room` | Get buddy messages |
| GET | `/files/read` | Read a project file |
| POST | `/files/write` | Write a project file |
| GET | `/files/list` | List directory contents |

---

## Development Phases (Completed)

### Phase 0: Foundation Fixes
Fixed hubFetch error handling, added isError:true to MCP errors, registry upsert, stripped ceoNotes from GET /agents, added createdBy to tasks, non-destructive peek/ack messaging, status-driven prompt injection (replaced hardcoded 10s wait), queue-aware nudging.

### Phase 1: Project-Based Persistence
ProjectManager module, project picker dialog, per-project .agentorch/ folder, DB no longer wiped on startup, presets project-scoped (later moved to global), window title shows project name, switch project button.

### Phase 2: OpenClaude Multi-Model
Added OpenClaude as CLI type, provider picker (OpenAI, DeepSeek, OpenRouter, Together AI, Groq, Ollama), model + provider env vars passed to PTY.

### Phase 3: Tools + Reliability
Added delete_info/update_info, update_status, bumped rate limit 10→30/min, fixed OutputBuffer partial lines, reconnect context injection, Buddy Room (detection + storage + UI panel + MCP tool), heartbeat system.

### Phase 4: IDE Features
File operation MCP tools (read_file, write_file, list_directory) with project-scoped security. File Explorer sidebar + Monaco Editor panel with tabs, dirty indicators, Ctrl+S save.

### Preset Redesign
Moved saved presets to global storage. Expanded templates from 5→39 with search bar + CLI filter chips. Full coverage: Claude, Codex, Kimi, Gemini solo + all cross-CLI combos.

### Skills System
SkillManager module, 15 built-in skills, SpawnDialog skill picker, SkillBrowser dialog (3 tabs: built-in, my skills, community via skills.sh).

### Live Test Fixes
Buddy detector rewrite (chunk-based for ANSI cursor positioning), Kimi model fix (default instead of premium K2.5), Codex TUI fix (filter xterm.js focus sequences), task nudge system, nudge fallback timer (5s for CLIs where StatusDetector can't detect prompt), removed polling language from initial prompt.

---

## What's Next

- **R.A.C. Integration** — Rent-A-Claude panel in AgentOrch. Browse available rental slots, rent directly, rented Claude shows up as a workspace agent.
- **Git Integration Panel** — visual git operations from within the IDE
- **File Change Notifications** — when an agent writes a file, other agents can subscribe
- **Agent Modes** — Architect/Coder/Reviewer/Tester with specialized prompts
- **Dynamic Model Switching** — switch_model MCP tool mid-task
- **Community Skills API** — full skills.sh integration (search + install without leaving the app)

---

## How to Run

```bash
git clone https://github.com/natebag/AgentOrch.git
cd AgentOrch
npm install
npm run dev
```

Requires: Node.js 20+, at least one AI CLI installed (Claude Code, Codex, Kimi, Gemini, etc.)

## How to Test

```bash
npm test              # run all tests
npx vitest run        # same thing
npx tsc --noEmit      # type-check only
```

Live test checklist: `docs/LIVE-TEST-CHECKLIST.md`
