# Phase 1: Project-Based Persistence

**Date:** 2026-04-03
**Status:** Approved
**Depends on:** Phase 0 (complete)

## Problem

AgentOrch stores all state (DB, presets) in a single global location (`app.getPath('userData')`). Opening the app on different projects means stale pinboard tasks, messages, and info entries from the last project bleed through. The current workaround — wiping the DB on every startup — destroys persistence entirely.

## Solution

Make AgentOrch project-aware. Each project folder gets its own `.agentorch/` directory containing isolated state. The app auto-opens the last used project on launch (VS Code pattern).

## Architecture

### Project Manager

New module `src/main/project/project-manager.ts` owns all project path logic.

Responsibilities:
- Track current project path
- Manage recent projects list (`userData/recent-projects.json`)
- Create `.agentorch/` folder structure on first open
- Resolve paths for DB, presets

```ts
interface RecentProject {
  path: string
  name: string       // basename of the folder
  lastOpened: string  // ISO timestamp
}
```

Recent projects capped at 20 entries. Sorted by `lastOpened` descending.

### Folder Structure

Per-project:
```
/path/to/my-project/
├── .agentorch/
│   ├── .gitignore          # ignores DB files only
│   ├── agentorch.db        # pinboard, messages, info — per-project
│   └── presets/             # committable team configs
├── src/
└── ...
```

Global (in `app.getPath('userData')`):
```
userData/
└── recent-projects.json
```

### .gitignore Contents

Written to `.agentorch/.gitignore` on folder creation:
```
agentorch.db
agentorch.db-wal
agentorch.db-shm
```

Presets are intentionally NOT gitignored — they're shareable team configurations.

## Launch Flow

1. App starts → `ProjectManager.getLastProject()` reads `recent-projects.json`
2. If last project exists on disk → auto-open it, proceed to workspace
3. If no history or folder deleted → show native OS folder picker dialog
4. On project open:
   - Create `.agentorch/` and `.agentorch/presets/` if needed
   - Write `.gitignore` if missing
   - Init DB at `.agentorch/agentorch.db` (no DELETE FROM)
   - Start hub server
   - Restore persisted pinboard/info/messages
   - Show workspace with window title `AgentOrch — <project-name>`

## Switch Project Flow

1. User clicks "Switch Project" in TopBar
2. Dialog shows: recent projects list + "Open Folder" button
3. On selection:
   - Kill all running agents (mark as manual kills)
   - Close hub server
   - Close DB connection
   - Clear in-memory state (agents map, prompts, nudges)
   - Re-run project open flow with new path
4. No app restart needed

## IPC Channels

New channels added to `IPC` const in `shared/types.ts`:

```ts
PROJECT_GET_CURRENT: 'project:get-current'     // → { path, name } | null
PROJECT_SWITCH: 'project:switch'                // (path: string) → void
PROJECT_LIST_RECENT: 'project:list-recent'      // → RecentProject[]
PROJECT_OPEN_FOLDER: 'project:open-folder'      // → string | null (folder picker)
```

## Module Changes

### database.ts
- Remove the three `DELETE FROM` statements
- `createDatabase()` signature unchanged — caller passes project-scoped path

### preset-manager.ts
- `getPresetsDir()` no longer calls `app.getPath('userData')`
- All functions receive a `presetsDir` parameter OR a module-level setter like `setProjectPath()`
- Cleaner approach: make preset functions accept a base path, injected by the project manager

### main/index.ts
- `main()` no longer inits DB immediately
- New flow: `app.whenReady()` → resolve project → init DB → start hub → create window
- Extract DB + hub init into a reusable `openProject(projectPath)` function
- Extract shutdown into `closeProject()` for clean switch support
- Window title set to `AgentOrch — <basename>` after project opens

### TopBar.tsx
- Add project name display (left side, before the + button)
- Add "Switch Project" button (right side)

### New: ProjectPickerDialog.tsx
- Shown when no recent project available, or when user clicks "Switch Project"
- Lists recent projects with name, path, last opened date
- "Open Folder" button triggers native directory picker
- "Remove from recent" option per entry

## What Stays Global

- MCP temp configs (`os.tmpdir()`) — ephemeral, not project state
- Future app-level settings
- Recent projects list itself

## What Does NOT Change

- Hub server, agent registry, message router — untouched
- MCP server (`src/mcp-server/index.ts`) — untouched
- All Phase 0 fixes — untouched
- Renderer workspace, floating windows, snap zones — untouched
- CLI launch logic — untouched

## Migration

No automatic migration. Existing global presets in `userData/presets/` become orphaned (test data). Each project starts fresh with its own `.agentorch/` folder.

## Testing

- Unit test: ProjectManager (recent projects CRUD, path resolution, folder creation)
- Unit test: preset-manager with injected path (existing tests adapted)
- Integration test: project open → DB created → state persists across simulated restarts (no wipe)
- Integration test: hub-server tests continue to pass (no project dependency in hub)
