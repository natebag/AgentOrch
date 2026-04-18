# Theme Expansion — Implementation Plan

## Overview

Expand the current per-agent theme system into a full **workspace theme** system with 8–10 built-in themes, a dedicated Themes tab in Settings, and community sharing (same pattern as community teams).

A "workspace theme" is a named collection of role→color mappings that colors all agents at once. The existing per-agent color picker in the right-click menu stays — workspace themes are a convenient bulk-apply on top.

---

## Architecture

### New type: `WorkspaceTheme`

```ts
// src/shared/types.ts
export interface WorkspaceTheme {
  id: string
  label: string
  description: string
  roleColors: Record<string, Required<AgentTheme>>   // role → colors
  fallback: Required<AgentTheme>                       // agents with no matching role
  meta?: {
    author?: string
    version?: number
  }
}
```

Key design decisions:
- **roleColors** maps role strings (orchestrator, worker, researcher, reviewer, etc.) to full 4-color `AgentTheme` objects
- **fallback** covers agents whose role isn't in the map
- Built-in themes are hardcoded in `src/renderer/themes.ts` alongside existing `THEME_PRESETS`
- Custom/community themes are stored as JSON files in `userData/themes/` (one file per theme)

### What stays unchanged
- `AgentTheme` interface (`chrome, border, bg, text`) — untouched
- `ThemePreset` array — still used by the per-agent right-click color picker
- `themes-store.ts` — still handles per-agent overrides
- Per-agent right-click theme picker in `FloatingWindow.tsx` — untouched

---

## Step-by-step plan

### Step 1 — Add `WorkspaceTheme` type + built-in themes

**Files:** `src/shared/types.ts`, `src/renderer/themes.ts`

1. Add `WorkspaceTheme` interface to `src/shared/types.ts`
2. Add `WORKSPACE_THEMES: WorkspaceTheme[]` array to `src/renderer/themes.ts` with 8–10 built-in themes:
   - **Default Dark** — current neutral greys (the "no theme" look)
   - **Sunshine** — golds, ambers, warm yellows (current default role theme expanded)
   - **Vaporwave** — purples, pinks, cyan, retro aesthetic
   - **Blue Lagoon** — navy, teal, sky, cerulean
   - **Sunrise** — oranges, warm yellows, coral
   - **Stock Market** — greens (up) and reds (down)
   - **Frutiger Aero** — glossy nature-tech blues/greens
   - **Bubblegum** — pinks and pastels
   - **Midnight** — deep navy blues, silvers, moonlight accents
3. Each theme defines colors for: `orchestrator`, `worker`, `researcher`, `reviewer`, plus `fallback`
4. Export `getWorkspaceThemeById(id: string)` helper

**Verify:** `npm run build` succeeds, types are clean.

### Step 2 — Workspace theme persistence (main process)

**Files:** `src/main/themes/workspace-theme-store.ts` (new), `src/main/index.ts`

1. Create `workspace-theme-store.ts`:
   - Stores active workspace theme ID + any custom themes in `userData/workspace-themes.json`
   - `getActiveThemeId(): string | null`
   - `setActiveThemeId(id: string | null): void`
   - `getCustomThemes(): WorkspaceTheme[]`
   - `saveCustomTheme(theme: WorkspaceTheme): void`
   - `deleteCustomTheme(id: string): void`
2. Wire IPC handlers in `src/main/index.ts`:
   - `WORKSPACE_THEME_GET_ACTIVE` → returns active theme ID
   - `WORKSPACE_THEME_SET_ACTIVE` → sets active theme ID
   - `WORKSPACE_THEME_LIST_CUSTOM` → returns custom themes
   - `WORKSPACE_THEME_SAVE_CUSTOM` → saves a custom theme
   - `WORKSPACE_THEME_DELETE_CUSTOM` → deletes a custom theme
3. Add IPC channel constants to `src/shared/ipc-channels.ts` (or wherever IPC constants live)
4. Add electronAPI bindings in `src/preload/index.ts` and `src/renderer/electron.d.ts`

**Verify:** `npm run build` succeeds.

### Step 3 — Apply workspace theme logic

**Files:** `src/main/index.ts`, `src/renderer/themes.ts`

When a workspace theme is applied:
1. For each active agent, look up `agent.role` in `theme.roleColors`
2. If found → `setAgentTheme(agentId, roleColors[role])`
3. If not found → `setAgentTheme(agentId, theme.fallback)`
4. Store active theme ID so new agents spawned later get auto-themed

This reuses the existing `setAgentTheme` IPC — no new per-agent plumbing needed.

Add to renderer:
- `applyWorkspaceTheme(themeId: string, agents: AgentState[])` — calls electronAPI for each agent
- When agents are spawned, if an active workspace theme is set, auto-apply to the new agent

**Verify:** Can apply a theme programmatically via console, agents recolor.

### Step 4 — Themes tab in Settings dialog

**Files:** `src/renderer/components/SettingsDialog.tsx`

Replace the current "Agent Themes" section with a full **Themes** section (or make it a scrollable sub-section):

1. **Theme gallery** — grid of theme cards showing:
   - Theme name + description
   - Color swatches (small circles for each role color)
   - "Active" badge on the currently applied theme
   - Click to apply
2. **Current per-agent section** stays below (role defaults + clear all buttons)
3. **Custom themes section** at bottom:
   - "Save current colors as theme" button — snapshots all agent colors into a new `WorkspaceTheme`
   - List of saved custom themes with delete button

UI layout:
```
┌─ Themes ──────────────────────────┐
│ [Default Dark] [Sunshine] [Vapor] │
│ [Blue Lagoon] [Sunrise] [Stock ]  │
│ [Frutiger]    [Bubble]  [Midnite] │
│                                    │
│ ── Custom Themes ──               │
│ [My Theme 1] [x]                  │
│ [Save current as theme...]        │
│                                    │
│ ── Per-Agent ──                    │
│ (existing role defaults + clear)   │
└────────────────────────────────────┘
```

**Verify:** Build + manually test clicking themes, see agents recolor.

### Step 5 — Community theme sharing

**Files:** `src/main/community/community-client.ts`, `src/renderer/components/SettingsDialog.tsx`

Follow the exact same pattern as community teams:
1. Add theme-specific GitHub Issue label (`community-theme`) in the community repo
2. Add `publishTheme(theme: WorkspaceTheme)` to community-client
3. Add `fetchCommunityThemes()` to community-client
4. Add `downloadTheme(issueNumber)` to community-client
5. Add a "Community Themes" sub-section in the Themes tab:
   - Browse button → fetches list
   - Download → saves as custom theme
   - Share button on custom themes → publishes to community

**Verify:** Full round-trip: create custom theme → share → browse → download.

### Step 6 — Auto-theme new agents

**Files:** `src/main/index.ts`

When a new agent is spawned and an active workspace theme is set:
1. Look up the agent's role in the active theme's `roleColors`
2. Apply the matching colors (or fallback) automatically
3. This way the workspace stays cohesive without manual re-application

**Verify:** Spawn new agent, confirm it picks up the active workspace theme.

### Step 7 — 3DS sync

**Files:** relevant remote/3DS sync code

The 3DS already picks up `agent.theme.chrome` for card colors. Since workspace themes just set per-agent themes via the existing `setAgentTheme` path, 3DS sync should work automatically with zero changes.

**Verify:** Apply workspace theme on desktop → 3DS cards update colors.

---

## What's NOT in scope
- Workspace background colors / wallpapers (future)
- Panel/UI chrome theming (future)
- Theme editor with live preview (future — save-current is enough for v1)
- Animated themes or gradients

---

## Test plan
- [ ] Built-in themes render correctly in gallery
- [ ] Clicking a theme applies colors to all agents
- [ ] New agents spawned with active theme get auto-colored
- [ ] Custom theme save/load/delete works
- [ ] Community share/browse/download round-trip
- [ ] 3DS cards reflect theme colors
- [ ] Per-agent right-click override still works on top of workspace theme
- [ ] "Clear all" resets workspace theme + individual overrides
- [ ] Build passes with no type errors

---

## Execution order

Steps 1–4 are the core feature (can ship as a single PR).
Step 5 (community sharing) can be a follow-up PR.
Steps 6–7 are small additions that can go in either PR.

Recommended: **Steps 1 → 2 → 3 → 4 → 6 → 7** first, then **Step 5** as follow-up.
