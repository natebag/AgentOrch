import type { WorkspaceTheme } from './types'

// Built-in workspace themes — shared between main and renderer.
// Each maps agent roles to a full color palette.

export const WORKSPACE_THEMES: WorkspaceTheme[] = [
  {
    id: 'default-dark',
    label: 'Default Dark',
    description: 'Neutral greys — the classic look',
    roleColors: {
      orchestrator: { chrome: '#1e1e1e', border: '#555555', bg: '#0d0d0d', text: '#e0e0e0' },
      worker:       { chrome: '#1e1e1e', border: '#444444', bg: '#0d0d0d', text: '#cccccc' },
      researcher:   { chrome: '#1e1e1e', border: '#444444', bg: '#0d0d0d', text: '#cccccc' },
      reviewer:     { chrome: '#1e1e1e', border: '#444444', bg: '#0d0d0d', text: '#cccccc' }
    },
    fallback: { chrome: '#1e1e1e', border: '#333333', bg: '#0d0d0d', text: '#e0e0e0' }
  },
  {
    id: 'sunshine',
    label: 'Sunshine',
    description: 'Warm golds and ambers',
    roleColors: {
      orchestrator: { chrome: '#3a2f0a', border: '#c09020', bg: '#1a1505', text: '#f5d76e' },
      worker:       { chrome: '#0a1f3a', border: '#2060a0', bg: '#050f1a', text: '#7ec4f5' },
      researcher:   { chrome: '#0a3a18', border: '#20a040', bg: '#051a0a', text: '#7ef598' },
      reviewer:     { chrome: '#3a0a0f', border: '#a02030', bg: '#1a0508', text: '#f57e8e' }
    },
    fallback: { chrome: '#3a2f0a', border: '#a08020', bg: '#1a1505', text: '#f5d76e' }
  },
  {
    id: 'vaporwave',
    label: 'Vaporwave',
    description: 'Retro purples, pinks, and cyan',
    roleColors: {
      orchestrator: { chrome: '#2d0a3a', border: '#9030c0', bg: '#150518', text: '#e47ef5' },
      worker:       { chrome: '#0a2a3a', border: '#20a0b0', bg: '#051520', text: '#7ef5f0' },
      researcher:   { chrome: '#3a0a2d', border: '#c030a0', bg: '#1a0515', text: '#f57ee4' },
      reviewer:     { chrome: '#1a0a3a', border: '#6030c0', bg: '#0d0518', text: '#b47ef5' }
    },
    fallback: { chrome: '#2d0a3a', border: '#9030c0', bg: '#150518', text: '#e47ef5' }
  },
  {
    id: 'blue-lagoon',
    label: 'Blue Lagoon',
    description: 'Navy, teal, sky, and cerulean',
    roleColors: {
      orchestrator: { chrome: '#0a1a3a', border: '#2050c0', bg: '#050d1a', text: '#7eaaf5' },
      worker:       { chrome: '#0a2a30', border: '#208090', bg: '#051518', text: '#7edaf5' },
      researcher:   { chrome: '#0a1530', border: '#205080', bg: '#050a18', text: '#7eb8f5' },
      reviewer:     { chrome: '#0a253a', border: '#2070a0', bg: '#05121a', text: '#7ec8f5' }
    },
    fallback: { chrome: '#0a1f3a', border: '#2060a0', bg: '#050f1a', text: '#7ec4f5' }
  },
  {
    id: 'sunrise',
    label: 'Sunrise',
    description: 'Warm oranges, corals, and yellows',
    roleColors: {
      orchestrator: { chrome: '#3a2008', border: '#c07020', bg: '#1a1005', text: '#f5c06e' },
      worker:       { chrome: '#3a1a0a', border: '#c05030', bg: '#1a0c05', text: '#f5987e' },
      researcher:   { chrome: '#3a2a0a', border: '#b09020', bg: '#1a1405', text: '#f5d87e' },
      reviewer:     { chrome: '#3a100a', border: '#c04030', bg: '#1a0805', text: '#f5887e' }
    },
    fallback: { chrome: '#3a1a0a', border: '#a05020', bg: '#1a0c05', text: '#f5a87e' }
  },
  {
    id: 'stock-market',
    label: 'Stock Market',
    description: 'Greens for gains, reds for losses',
    roleColors: {
      orchestrator: { chrome: '#0a3a18', border: '#20c050', bg: '#051a0a', text: '#7ef5a0' },
      worker:       { chrome: '#0a3020', border: '#20a050', bg: '#051808', text: '#7ef590' },
      researcher:   { chrome: '#0a3a15', border: '#30b040', bg: '#051a08', text: '#90f598' },
      reviewer:     { chrome: '#3a0a0f', border: '#c02030', bg: '#1a0508', text: '#f57e8e' }
    },
    fallback: { chrome: '#0a3a18', border: '#20a040', bg: '#051a0a', text: '#7ef598' }
  },
  {
    id: 'frutiger-aero',
    label: 'Frutiger Aero',
    description: 'Glossy nature-tech blues and greens',
    roleColors: {
      orchestrator: { chrome: '#0a2a30', border: '#20a0b0', bg: '#051518', text: '#7ef5e8' },
      worker:       { chrome: '#0a3028', border: '#20b080', bg: '#051815', text: '#7ef5c8' },
      researcher:   { chrome: '#0a2830', border: '#2090b0', bg: '#051418', text: '#7ee8f5' },
      reviewer:     { chrome: '#0a3020', border: '#30a060', bg: '#051810', text: '#7ef5a8' }
    },
    fallback: { chrome: '#0a2a30', border: '#20a0b0', bg: '#051518', text: '#7ef5e8' }
  },
  {
    id: 'bubblegum',
    label: 'Bubblegum',
    description: 'Pinks and pastels',
    roleColors: {
      orchestrator: { chrome: '#3a0a28', border: '#c03090', bg: '#1a0514', text: '#f57ed8' },
      worker:       { chrome: '#2a0a3a', border: '#9030b0', bg: '#150518', text: '#d47ef5' },
      researcher:   { chrome: '#3a0a1a', border: '#c03060', bg: '#1a050d', text: '#f57eb0' },
      reviewer:     { chrome: '#300a3a', border: '#a030c0', bg: '#18051a', text: '#e07ef5' }
    },
    fallback: { chrome: '#3a0a28', border: '#c03090', bg: '#1a0514', text: '#f57ed8' }
  },
  {
    id: 'midnight',
    label: 'Midnight',
    description: 'Deep navy with silver moonlight',
    roleColors: {
      orchestrator: { chrome: '#0a0f2a', border: '#3040a0', bg: '#050820', text: '#a0b0f5' },
      worker:       { chrome: '#0d1225', border: '#404a70', bg: '#080c1a', text: '#b0b8d0' },
      researcher:   { chrome: '#0a1028', border: '#3548a0', bg: '#050a1e', text: '#98a8f5' },
      reviewer:     { chrome: '#10102a', border: '#4a4a80', bg: '#0a0a1e', text: '#c0c0e0' }
    },
    fallback: { chrome: '#0a0f2a', border: '#3040a0', bg: '#050820', text: '#a0b0f5' }
  }
]

export function getWorkspaceThemeById(id: string): WorkspaceTheme | undefined {
  return WORKSPACE_THEMES.find(t => t.id === id)
}
