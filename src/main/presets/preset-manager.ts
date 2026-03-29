import { app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import type { WorkspacePreset, AgentConfig, WindowPosition, CanvasState } from '../../shared/types'

const PRESETS_DIR = 'presets'
const MAX_PRESET_NAME_LENGTH = 50

function getPresetsDir(): string {
  const userData = app.getPath('userData')
  const presetsDir = path.join(userData, PRESETS_DIR)
  if (!fs.existsSync(presetsDir)) {
    fs.mkdirSync(presetsDir, { recursive: true })
  }
  return presetsDir
}

function sanitizePresetName(name: string): string {
  // Remove any characters that aren't alphanumeric, hyphen, or underscore
  // Then replace underscores with hyphens for consistency
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '-')
    .replace(/_+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, MAX_PRESET_NAME_LENGTH)
}

function getPresetPath(name: string): string {
  const sanitized = sanitizePresetName(name)
  if (!sanitized) {
    throw new Error('Invalid preset name')
  }
  return path.join(getPresetsDir(), `${sanitized}.json`)
}

export function savePreset(
  name: string,
  agents: AgentConfig[],
  windows: WindowPosition[],
  canvas: CanvasState
): void {
  const preset: WorkspacePreset = {
    name,
    agents,
    windows,
    canvas,
    savedAt: new Date().toISOString()
  }

  const presetPath = getPresetPath(name)
  fs.writeFileSync(presetPath, JSON.stringify(preset, null, 2), 'utf-8')
}

export function loadPreset(name: string): WorkspacePreset {
  const presetPath = getPresetPath(name)
  
  if (!fs.existsSync(presetPath)) {
    throw new Error(`Preset '${name}' not found`)
  }

  const content = fs.readFileSync(presetPath, 'utf-8')
  return JSON.parse(content) as WorkspacePreset
}

export function listPresets(): string[] {
  const presetsDir = getPresetsDir()
  const files = fs.readdirSync(presetsDir)
  
  return files
    .filter(f => f.endsWith('.json'))
    .map(f => path.basename(f, '.json'))
    .sort()
}

export function deletePreset(name: string): void {
  const presetPath = getPresetPath(name)
  
  if (!fs.existsSync(presetPath)) {
    throw new Error(`Preset '${name}' not found`)
  }

  fs.unlinkSync(presetPath)
}

export function presetExists(name: string): boolean {
  const presetPath = getPresetPath(name)
  return fs.existsSync(presetPath)
}
