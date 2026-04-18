import * as fs from 'fs'
import type { WorkspaceTheme } from '../../shared/types'

// Stores the active workspace theme ID and custom (user-created) themes.
// File: userData/workspace-themes.json

let _filePath: string | null = null

interface StoreData {
  activeThemeId: string | null
  customThemes: WorkspaceTheme[]
}

let _cache: StoreData | null = null

export function setFilePath(p: string): void {
  _filePath = p
  _cache = null
}

function load(): StoreData {
  if (_cache) return _cache
  if (!_filePath || !fs.existsSync(_filePath)) {
    _cache = { activeThemeId: null, customThemes: [] }
    return _cache
  }
  try {
    const raw = fs.readFileSync(_filePath, 'utf-8')
    _cache = JSON.parse(raw) as StoreData
    if (!_cache!.customThemes) _cache!.customThemes = []
    if (_cache!.activeThemeId === undefined) _cache!.activeThemeId = null
  } catch {
    _cache = { activeThemeId: null, customThemes: [] }
  }
  return _cache!
}

function save(): void {
  if (!_filePath || !_cache) return
  try {
    fs.writeFileSync(_filePath, JSON.stringify(_cache, null, 2), 'utf-8')
  } catch { /* workspace themes are non-critical */ }
}

export function getActiveThemeId(): string | null {
  return load().activeThemeId
}

export function setActiveThemeId(id: string | null): void {
  const data = load()
  data.activeThemeId = id
  _cache = data
  save()
}

export function getCustomThemes(): WorkspaceTheme[] {
  return load().customThemes
}

export function saveCustomTheme(theme: WorkspaceTheme): void {
  const data = load()
  const idx = data.customThemes.findIndex(t => t.id === theme.id)
  if (idx >= 0) {
    data.customThemes[idx] = theme
  } else {
    data.customThemes.push(theme)
  }
  _cache = data
  save()
}

export function deleteCustomTheme(id: string): void {
  const data = load()
  data.customThemes = data.customThemes.filter(t => t.id !== id)
  _cache = data
  save()
}
