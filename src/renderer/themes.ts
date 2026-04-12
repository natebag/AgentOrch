import type { AgentTheme } from '../shared/types'

// Default theme values used when an agent has no theme set.
export const DEFAULT_THEME: Required<AgentTheme> = {
  chrome: '#1e1e1e',
  border: '#333333',
  bg: '#0d0d0d',
  text: '#e0e0e0'
}

export interface ThemePreset {
  id: string
  label: string
  emoji: string
  theme: Required<AgentTheme>
}

// Built-in theme presets — each fills all 4 color slots in one click.
// Designed to be readable next to xterm's ANSI colors and look cohesive together.
export const THEME_PRESETS: ThemePreset[] = [
  {
    id: 'default',
    label: 'Default Dark',
    emoji: '⬛',
    theme: { chrome: '#1e1e1e', border: '#333333', bg: '#0d0d0d', text: '#e0e0e0' }
  },
  {
    id: 'sunshine',
    label: 'Sunshine',
    emoji: '🟡',
    theme: { chrome: '#3a2f0a', border: '#a08020', bg: '#1a1505', text: '#f5d76e' }
  },
  {
    id: 'ocean',
    label: 'Ocean',
    emoji: '🔵',
    theme: { chrome: '#0a1f3a', border: '#2060a0', bg: '#050f1a', text: '#7ec4f5' }
  },
  {
    id: 'crimson',
    label: 'Crimson',
    emoji: '🔴',
    theme: { chrome: '#3a0a0f', border: '#a02030', bg: '#1a0508', text: '#f57e8e' }
  },
  {
    id: 'forest',
    label: 'Forest',
    emoji: '🟢',
    theme: { chrome: '#0a3a18', border: '#20a040', bg: '#051a0a', text: '#7ef598' }
  },
  {
    id: 'royal',
    label: 'Royal',
    emoji: '🟣',
    theme: { chrome: '#2a0a3a', border: '#7020a0', bg: '#150518', text: '#c47ef5' }
  },
  {
    id: 'dusk',
    label: 'Dusk',
    emoji: '🟠',
    theme: { chrome: '#3a1a0a', border: '#a05020', bg: '#1a0c05', text: '#f5a87e' }
  },
  {
    id: 'steel',
    label: 'Steel',
    emoji: '⚪',
    theme: { chrome: '#2a2e35', border: '#5a6270', bg: '#15181c', text: '#c0c8d0' }
  }
]

// Auto-by-role default mappings — used by the "Apply theme by role" Settings button.
export const ROLE_THEME_DEFAULTS: Record<string, string> = {
  orchestrator: 'sunshine',
  worker: 'ocean',
  researcher: 'forest',
  reviewer: 'crimson'
}

export function getPresetById(id: string): ThemePreset | undefined {
  return THEME_PRESETS.find(p => p.id === id)
}

export function getDefaultThemeForRole(role: string): AgentTheme | undefined {
  const presetId = ROLE_THEME_DEFAULTS[role]
  if (!presetId) return undefined
  return getPresetById(presetId)?.theme
}

// Resolve an effective theme by merging an agent's overrides over the defaults.
export function resolveTheme(theme: AgentTheme | undefined): Required<AgentTheme> {
  if (!theme) return DEFAULT_THEME
  return {
    chrome: theme.chrome ?? DEFAULT_THEME.chrome,
    border: theme.border ?? DEFAULT_THEME.border,
    bg: theme.bg ?? DEFAULT_THEME.bg,
    text: theme.text ?? DEFAULT_THEME.text
  }
}
