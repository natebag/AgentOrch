import * as fs from 'fs'
import type { AgentTheme } from '../../shared/types'

// Single global file at userData/themes.json. Keys are `${projectPath}::${agentName}`
// so the same agent name in different projects gets independent themes.

let _themesPath: string | null = null
let _cache: Record<string, AgentTheme> | null = null

export function setThemesPath(p: string): void {
  _themesPath = p
  _cache = null
}

function load(): Record<string, AgentTheme> {
  if (_cache) return _cache
  if (!_themesPath || !fs.existsSync(_themesPath)) {
    _cache = {}
    return _cache
  }
  try {
    const raw = fs.readFileSync(_themesPath, 'utf-8')
    _cache = JSON.parse(raw) as Record<string, AgentTheme>
  } catch {
    _cache = {}
  }
  return _cache
}

function save(): void {
  if (!_themesPath || !_cache) return
  try {
    fs.writeFileSync(_themesPath, JSON.stringify(_cache, null, 2), 'utf-8')
  } catch { /* swallow — themes are non-critical */ }
}

function key(projectPath: string, agentName: string): string {
  return `${projectPath}::${agentName}`
}

export function getTheme(projectPath: string, agentName: string): AgentTheme | undefined {
  return load()[key(projectPath, agentName)]
}

export function setTheme(projectPath: string, agentName: string, theme: AgentTheme | null): void {
  const data = load()
  const k = key(projectPath, agentName)
  if (theme === null) {
    delete data[k]
  } else {
    data[k] = theme
  }
  _cache = data
  save()
}
