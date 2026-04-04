# AgentOrch

The AI-native agent orchestration IDE. Spawn teams of AI coding agents across multiple models and providers, watch them work in floating terminal windows, and orchestrate from above.

No more copy-pasting between terminals. Agents communicate through MCP tools — messaging, task boards, shared knowledge, file operations — all in one workspace.

## What It Does

- **Multi-agent workspace** — floating terminal windows on an infinite canvas. Drag, resize, snap, zoom.
- **22+ MCP tools** — agents message each other, post tasks, share research, read/write files, and more.
- **Multi-model teams** — Claude, Codex, Kimi, Gemini, Copilot, Grok, OpenClaude (200+ models via OpenAI-compatible providers), or plain terminals.
- **39 preset templates** — pre-built team configurations. Search + filter by available CLIs.
- **Skills system** — composable capability modules. Attach "Code Reviewer" + "Security Auditor" + "TypeScript Expert" to an agent. 15 built-in, create your own, browse 90k+ community skills.
- **File Explorer + Editor** — browse project files, edit with Monaco Editor (VS Code's engine), syntax highlighting, tabs.
- **Communication graph** — Blender-style node links between agents. Drag to connect. Linked agents form isolated groups with scoped messaging and tasks.
- **Project-based persistence** — each project gets its own `.agentorch/` folder with isolated DB and presets. Data survives restarts.
- **Auto-updater** — checks for updates every 2 minutes, one-click update + restart.
- **Bug reporter** — built-in bug report submission, no login required.
- **System notifications** — desktop alerts when tasks are completed.
- **Usage panel** — per-agent activity tracking + on-demand provider limit checks.

## Quick Start

```bash
git clone https://github.com/natebag/AgentOrch.git
cd AgentOrch
npm install
npm run dev
```

Requires: Node.js 20+, at least one AI CLI installed (Claude Code, Codex, Kimi, Gemini, etc.)

## Spawning Agents

Click **+** to spawn an agent:
- **Name** — how other agents refer to this one
- **CLI** — Claude Code, Codex, Kimi, Gemini, OpenClaude, Copilot, Grok, or plain terminal
- **Model** — specific model per CLI (Opus, Sonnet, GPT-5, DeepSeek, Llama, etc.)
- **Role** — Orchestrator, Worker, Researcher, Reviewer, or Custom
- **Skills** — attach capability modules from the skill browser
- **CEO Notes** — free-text instructions (combined with skills)
- **Auto-approve** — skip permission prompts

Or use **Presets** → **Templates** to launch a pre-configured team with one click.

## How Agents Communicate

Agents get 23 MCP tools:

| Category | Tools |
|----------|-------|
| **Messaging** | `send_message`, `get_messages`, `ack_messages`, `broadcast`, `get_message_history` |
| **Tasks** | `post_task`, `read_tasks`, `get_task`, `claim_task`, `complete_task`, `abandon_task`, `clear_completed_tasks` |
| **Info** | `post_info`, `read_info`, `update_info`, `delete_info` |
| **Agents** | `get_agents`, `read_ceo_notes`, `update_status`, `get_agent_output`, `get_my_group` |
| **Files** | `read_file`, `write_file`, `list_directory` |
| **Other** | `read_buddy_room` |

**Auto-nudge:** Agents don't poll — they wait. When a message arrives or a task is posted, the agent gets nudged automatically. Zero wasted tokens.

## Communication Groups

Drag from one agent's link port to another to create a connection. Connected agents form a **group** — they can only see each other's messages, tasks, and info. Unlinked agents have global access (backward compatible).

Hover over a link line to see the delete button. Click to remove the connection.

## Architecture

```
Electron App
├── Hub Server (Express, localhost)
│   ├── Agent Registry + Heartbeat
│   ├── Message Router (peek/ack, rate limiting, group scoping)
│   ├── Pinboard (task management)
│   ├── Info Channel (shared knowledge)
│   ├── Buddy Room (companion speech log)
│   ├── Group Manager (communication graph)
│   ├── Agent Metrics (activity tracking)
│   └── File Operations (project-scoped)
├── MCP Server (per-agent, stdio)
├── PTY Manager (node-pty terminals)
├── Project Manager (per-project .agentorch/)
├── Skill Manager (built-in + user skills)
├── Update Checker (auto-update from GitHub)
└── React UI
    ├── Infinite canvas with floating windows
    ├── Monaco Editor + file explorer
    ├── 7 toggleable panels
    └── Preset templates with search/filter
```

## Supported CLIs

| CLI | Models | Auto-approve |
|-----|--------|-------------|
| Claude Code | Opus, Sonnet, Haiku | `--dangerously-skip-permissions` |
| Codex CLI | o4-mini, o3, GPT-5, GPT-5.4 | `--yolo` |
| Kimi CLI | Default, K2.5, Thinking Turbo | `--yolo` |
| Gemini CLI | 2.5 Pro, 2.5 Flash, 2.0 Flash | `--yolo` |
| OpenClaude | 200+ models (GPT, DeepSeek, Ollama, Mistral, Qwen) | `--dangerously-skip-permissions` |
| GitHub Copilot | Default, GPT-5, GPT-5.4 | `--allow-all` |
| Grok CLI | Grok 3, Grok 3 Mini | N/A |

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+1-9` | Focus window by position |
| `Ctrl+Tab` | Cycle through windows |
| `Ctrl+0` | Reset zoom |
| `Ctrl+Shift+0` | Fit all windows |
| `Ctrl+S` | Save file (in editor) |
| `Ctrl+C` | Copy selection (or SIGINT) |
| `Ctrl+V` | Paste from clipboard |

## Development

```bash
npm run dev          # Start in dev mode
npm run build        # Production build
npm test             # Run tests (vitest)
npm run build:mcp    # Rebuild MCP server bundle
```

## License

MIT
