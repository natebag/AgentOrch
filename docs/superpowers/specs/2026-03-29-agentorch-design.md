# AgentOrch — Universal AI Agent Orchestration Platform

**Date:** 2026-03-29
**Status:** Draft
**Author:** Human + Claude

## Problem Statement

When working with multiple AI coding agents (Claude Code, Codex CLI, Kimi CLI, etc.) simultaneously, the human operator becomes a manual message relay. Agents produce output directed at other agents ("tell worker-2 to decompile this class"), and the human must copy-paste between terminals all day. This is tedious, error-prone, and the primary bottleneck in multi-agent workflows.

## Solution

AgentOrch is a native desktop application that hosts multiple AI agent CLIs in a floating-window workspace and connects them via an MCP server so they can communicate directly — eliminating the human copy-paste relay.

## Architecture

Three layers with a hub-and-spoke MCP topology:

```
┌──────────────────────────────────────────────────┐
│  UI Layer (Electron + xterm.js)                  │
│  - Floating terminal windows                     │
│  - Dashboard top bar                             │
│  - Pinboard / Info Channel windows (v2)          │
└──────────────┬───────────────────────────────────┘
               │
┌──────────────┴───────────────────────────────────┐
│  Orchestration Hub (Electron main process)       │
│  - Agent Registry (roles + CEO notes)            │
│  - Message Router (queue + deliver via MCP)      │
│  - Hub API (localhost HTTP for MCP spokes)       │
└──────────────┬───────────────────────────────────┘
               │ IPC (localhost HTTP)
     ┌─────────┼─────────┐
     │         │         │
  ┌──┴──┐  ┌──┴──┐  ┌──┴──┐
  │MCP 1│  │MCP 2│  │MCP 3│   ← MCP server instances
  └──┬──┘  └──┬──┘  └──┬──┘     (one per agent, spawned
     │stdio   │stdio   │stdio    by the agent CLI)
  ┌──┴──┐  ┌──┴──┐  ┌──┴──┐
  │CLI 1│  │CLI 2│  │CLI 3│   ← Agent CLIs (Claude,
  └─────┘  └─────┘  └─────┘     Codex, Kimi, etc.)
```

### Hub-and-Spoke MCP Topology

Agent CLIs (Claude Code, Codex, etc.) act as MCP **clients** that **spawn** MCP servers as child processes via stdio transport. They do not connect outbound to a running server.

This means AgentOrch cannot run a single MCP server that all agents connect to. Instead:

1. Each agent CLI spawns its own **AgentOrch MCP server instance** as a child process (via the MCP config file).
2. Each MCP server instance connects back to the **Electron hub** over localhost HTTP to access the shared agent registry, message router, and state.
3. The Electron hub is the central coordinator — all message routing, agent awareness, and state lives here.
4. MCP server instances are thin relays: they translate MCP tool calls into hub API requests and return results.

```
┌─────────────────────────────────────────────────────┐
│ Shell Layer (node-pty)                               │
│  - Real PTY instances per agent                      │
│  - Stdout capture (for status detection + output     │
│    buffer) — NOT used for message injection           │
│  - Admin elevation opt-in per agent                  │
└─────────────────────────────────────────────────────┘
```

## Core Concepts

### Agent Registry & Role Cards

Each agent is spawned with a configuration card:

- **Name** — identifier used in messaging (e.g., "worker-1")
- **CLI** — the command to run (claude, codex, kimi, custom)
- **Role** — short label (e.g., "Decompiler", "Coordinator")
- **CEO Notes** — freeform instructions from the human operator, injected on launch and visible to all agents via MCP

CEO Notes solve the "re-explaining roles" problem. The orchestrator agent can call `get_agents()` and immediately know what each worker handles, what their constraints are, and what CLI they're running — because the human wrote it once in the role card.

### MCP Tools (Communication Protocol)

Each agent CLI spawns its own AgentOrch MCP server instance. That instance relays tool calls to the Electron hub. From the agent's perspective, it simply has MCP tools available.

**Messaging tools:**
- `send_message(to, message)` — queue a message for a specific agent. Returns `{status: "delivered" | "queued" | "error", detail: "..."}`. Messages are **never** injected into PTY stdin — they are delivered via MCP only.
- `get_messages()` — retrieve queued messages. Returns `[{from, message, timestamp}]`, oldest first. **Destructive read** — retrieved messages are cleared from the queue. Agents should be instructed (via CEO Notes) to call this after completing each task.
- `broadcast(message)` — queue a message to all other agents. (v2)

**Awareness tools:**
- `get_agents()` — list all agents with name, CLI type, role, CEO notes, and status.
- `get_agent_output(agent, lines?)` — peek at another agent's recent terminal output (default 50 lines, max buffer 1000 lines per agent, rolling). (v2)

**Pinboard tools (shared task board):**
- `post_task(title, description, priority?)` — post a task to the board.
- `read_tasks()` — see all tasks.
- `claim_task(task_id)` — claim a task (prevents double-pickup).
- `complete_task(task_id, result?)` — mark done with optional result.

**Info Channel tools (shared knowledge base):**
- `post_info(note, tags?)` — drop a research note or finding.
- `read_info(tags?)` — read notes, optionally filtered.

**CEO Channel (read-only for agents):**
- `read_ceo_notes()` — re-read own CEO notes + any live notes the human posted mid-session.

**Not MCP tools (human-only actions):**
- Spawning/killing agents — controlled from the UI only.
- File system and git — agents use their own native tools.

### Message Routing (Pull Model)

Messages flow through MCP only — never through PTY stdin. This is a **pull model**: senders queue messages, receivers retrieve them.

When Agent A calls `send_message("worker-1", "decompile SimManager.cs")`:

1. Agent A's MCP server instance receives the tool call.
2. Instance forwards to the Electron hub via localhost HTTP.
3. Hub looks up "worker-1" in the agent registry.
4. If worker-1 exists and is not disconnected → message queued, returns `{status: "delivered"}`.
5. If worker-1 is disconnected → message queued, returns `{status: "queued", detail: "worker-1 is offline, message queued"}`.
6. If worker-1 doesn't exist → returns `{status: "error", detail: "agent 'worker-1' not found"}`.

When Worker-1 calls `get_messages()`:

1. Worker-1's MCP instance forwards to the hub.
2. Hub returns all queued messages for worker-1: `[{from: "orchestrator", message: "decompile SimManager.cs", timestamp: "..."}]`.
3. Messages are cleared from the queue (destructive read).
4. Worker-1 acts on the messages.

**Key implication:** Agents must be told to check messages. CEO Notes should include: "After completing each task, call `get_messages()` to check for new work." This is the pull mechanism — agents decide when to check, not the system.

Messages queue until retrieved. Max message size: 10KB. Max queue depth: 100 messages per agent (oldest dropped if exceeded). **On app shutdown or crash, all undelivered messages are lost** — this is an accepted MVP limitation (SQLite persistence in v2 fixes this).

**Rate limiting / loop prevention (v2):** If two agents start messaging each other in a tight loop, a rate limit (e.g., max 10 messages per agent per minute) will break the cycle.

### Agent Status Detection

The app watches PTY stdout to determine agent status for the dashboard. This is **display-only** — it does not affect message delivery (messages are pull-based via MCP, not pushed on prompt detection).

**State machine:**
```
                 spawn
  (none) ──────────→ IDLE
                       │
                  CLI launched
                       │
                       ▼
                    ACTIVE ←──────────┐
                    (at prompt)       │
                       │              │
               agent starts           agent finishes
               generating             generating
                       │              │
                       ▼              │
                    WORKING ──────────┘
                    (outputting)

  any state ──PTY exits──→ DISCONNECTED
```

- **Idle** — shell open, no agent CLI running yet.
- **Active** — agent CLI running, at input prompt (no new stdout for 2+ seconds after a line matching prompt pattern).
- **Working** — agent CLI actively generating output (stdout receiving data).
- **Disconnected** — PTY process exited or crashed.

**Prompt pattern matching:**
- Raw PTY output contains ANSI escape codes. The app strips escape sequences before matching.
- Default patterns per CLI type (configurable): Claude Code = `[>❯]\s*$`, Codex = `\$\s*$`, PowerShell = `PS.*>\s*$`.
- Heuristic: pattern match + no new output for 2 seconds = "active." This reduces false positives from `>` or `$` appearing in normal output.
- User can override the prompt regex per agent in the spawn dialog (advanced option).

### Startup Flow

When spawning a new agent:

1. App spawns a PTY shell (PowerShell, elevated if admin requested for this agent).
2. **After the hub HTTP server is running and its port is known**, writes a temporary MCP config file to `os.tmpdir()` that tells the agent CLI to spawn an AgentOrch MCP server instance. The config includes the hub URL (with resolved port) and the agent's ID so the MCP instance can register with the hub. The config also includes a one-time shared secret for hub API authentication (prevents other local processes from impersonating agents).
3. Launches the agent CLI with that config (e.g., `claude --mcp-config <tmpdir>/agentorch-<id>-mcp.json`).
4. Agent CLI spawns the MCP server instance via stdio. The instance connects to the Electron hub over localhost HTTP and registers the agent.
5. Agent now has MCP tools available: `send_message`, `get_messages`, `get_agents`, `read_ceo_notes`.
6. App injects first prompt into PTY stdin (the only time stdin injection is used): role context, CEO notes, list of other agents, and instruction to check `get_messages()` after each task.

**MCP config cleanup:** Temporary config files are deleted when the agent's PTY exits or when the app shuts down.

**CLI compatibility matrix:**
| CLI | MCP Config Method | Status |
|-----|-------------------|--------|
| Claude Code | `--mcp-config <path>` or `claude mcp add` | Supported |
| Codex CLI | MCP config file (verify flag name) | Needs testing |
| Kimi CLI | MCP config file (verify flag name) | Needs testing |
| Custom | User provides launch command; MCP optional | Supported (no messaging if no MCP) |

For CLIs that don't support MCP, the agent still gets a terminal window but cannot participate in inter-agent messaging. It operates as a standalone pane.

## UI Design

### Floating Window Desktop

The workspace is a dark canvas. Everything is a floating window — agent terminals, pinboard, info channel, CEO notes. Like a desktop window manager contained inside the app.

**Window behaviors:**
- Drag by title bar.
- Resize from any edge or corner.
- Overlap freely — click to bring to front.
- Minimize to top bar (collapses to pill/tab).
- Maximize fills entire workspace.
- Snap to edges/corners (Windows snap behavior).

**Window types:**
- **Agent terminal** — real terminal emulator (xterm.js + node-pty). Title bar shows: agent name, CLI type, role, status dot.
- **Pinboard** — kanban-style task list. Agents post/claim/complete via MCP.
- **Info Channel** — scrollable feed of research notes, findings, context.
- **CEO Notes** — input panel for the human to post live notes mid-session.

### Top Bar

- `[+]` button to spawn new agent.
- Pills for each agent: name + status dot (green=active, yellow=working, gray=idle, red=disconnected).
- Toggle buttons for Pinboard, Info Channel, CEO Notes windows.

### Agent Spawn Dialog

Appears on `[+]` click:

- Name input.
- CLI dropdown (Claude, Codex, Kimi, custom command).
- Working directory input (defaults to app's cwd or user-configured project root).
- Role input.
- CEO Notes textarea.
- Admin toggle (opt-in per agent).
- Prompt regex override (advanced, collapsed by default).
- Spawn / Cancel buttons.

### Visual Style

- Dark background (#1a1a1a or similar).
- Monospace text in terminals.
- Minimal chrome — thin window borders, small title bars.
- Status colors: green (active), yellow (working), gray (idle), red (disconnected).
- Clean, modern terminal aesthetic. Hyper/Windows Terminal vibes.

## Error Handling

### Agent Crashes
- PTY dies → agent marked "disconnected" (red status).
- Queued messages held, not lost.
- Restart from window title bar → same role, CEO notes. Messages replay.
- Orchestrator gets system notification: "worker-1 has disconnected."

### Message Delivery Failures
- Target doesn't exist → MCP returns error: "agent 'worker-3' not found."
- Target disconnected → message queues, sender told: "worker-1 is offline, message queued."
- No silent failures. Senders always get feedback.

### Admin Elevation
- Admin is **opt-in per agent**, not app-wide. The spawn dialog has an admin toggle.
- On Windows: agents marked admin are spawned via an elevated PTY (using `runas` or similar). Non-admin agents run at normal privileges.
- On macOS/Linux: elevation uses `sudo` (prompts for password in the PTY itself).
- The app itself does NOT request admin on launch — only individual agents that need it.
- MVP targets Windows. macOS/Linux elevation is best-effort.

### MCP Connection Issues
- Agent can't connect → retry, then show error in window header.
- Port conflict → auto-pick available port on startup.

### Context Limits
- Agents hitting context limits and needing `/clear` is expected.
- CEO Notes should include instructions for what to do before clearing (e.g., "produce a summary file before /clear").
- After clear, app re-injects role context via stdin (same as initial launch prompt). (v2)
- MVP: manual re-orientation after clear — the agent can call `read_ceo_notes()` and `get_agents()` to re-ground itself.

## Data & Persistence

**In-memory (MVP):**
- Agent registry, message queues, recent output buffers.

**SQLite (v2):**
- Pinboard tasks.
- Info Channel notes.
- Message history (full audit trail of inter-agent communication).

**JSON files:**
- Workspace configs (agent layouts, positions, roles, CEO notes).
- Workspace presets (named configurations for reuse).

## Technology Stack

- **Runtime:** Electron (cross-platform native window)
- **Terminal emulation:** xterm.js
- **PTY management:** node-pty
- **MCP server:** Node.js (likely using the MCP TypeScript SDK)
- **UI framework:** React (floating window management requires component state management)
- **Persistence:** In-memory for MVP, SQLite for v2
- **Language:** TypeScript throughout
- **Build/package:** electron-builder for distribution

## MVP Scope

**Included in MVP:**
- Electron app with dark theme and floating windows.
- Spawn agent terminals (real PTY via node-pty).
- Agent card on spawn (name, CLI, working directory, role, CEO notes, admin toggle).
- Hub-and-spoke MCP: per-agent MCP server instances connecting to Electron hub.
- MCP tools: `send_message`, `get_messages`, `get_agents`, `read_ceo_notes`.
- Pull-based message queue (agents retrieve via `get_messages()`).
- Agent status detection (idle/active/working/disconnected) for dashboard display.
- CEO Notes injected on agent launch via initial stdin prompt.
- Window drag, resize, overlap, minimize, maximize.
- Keyboard shortcuts: Ctrl+1/2/3 to focus agent windows, Ctrl+Tab to cycle.

**Deferred to v2:**
- Pinboard & Info Channel (messaging alone solves core pain).
- Workspace presets / save-load.
- Window snapping to edges/corners.
- `broadcast()`, `get_agent_output()`.
- SQLite persistence & message history.
- Auto-reconnect on agent crash (MVP: manual restart from title bar).
- Automatic context re-injection after `/clear` (MVP: agents can manually call `read_ceo_notes()` + `get_agents()`).
- Rate limiting / loop prevention.
- macOS/Linux admin elevation.

## Success Criteria

The MVP is successful when:
1. A user can spawn 3 agent terminals (1 orchestrator + 2 workers).
2. The orchestrator can send tasks to workers via `send_message()`.
3. Workers can report results back to the orchestrator via `send_message()`.
4. The human does not need to copy-paste between agents.
5. CEO Notes give the orchestrator awareness of what each worker handles.
