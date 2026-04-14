import * as fs from 'fs'
import * as path from 'path'

/**
 * One-time migration of user data from the old AgentOrch userData folder
 * to the new "The Cog" userData folder.
 *
 * Background: changing Electron's productName changes app.getPath('userData').
 * The rebrand AgentOrch → The Cog moved global app data (presets, settings,
 * themes, skills, recent projects, workshop passcode) to a new location.
 * Without this migration, returning users see fresh app state.
 *
 * This runs ONCE on app startup, BEFORE any other userData access.
 * A marker file in the new folder records that migration has happened so
 * subsequent launches skip it.
 *
 * Migrated:
 *   - settings.json (workshop passcode, notifications, session timeout)
 *   - recent-projects.json (recent project list)
 *   - themes.json (per-agent color themes)
 *   - presets/ (saved team templates)
 *   - skills/ (user-created skills)
 *
 * NOT migrated (re-downloadable / cache):
 *   - bin/ (cloudflared binary, ~25MB)
 *   - Cache, Code Cache, GPUCache, etc. (Chromium caches)
 *   - agentorch.db (legacy stale DB from very early versions, never used)
 */

const MARKER_FILE = 'userdata-migrated.json'

const FILES_TO_COPY = [
  'settings.json',
  'recent-projects.json',
  'themes.json'
]

const DIRS_TO_COPY = [
  'presets',
  'skills'
]

interface MigrationResult {
  ran: boolean
  copiedFiles: string[]
  copiedDirs: string[]
  source: string | null
  reason?: string
}

function copyDirRecursive(src: string, dest: string): void {
  if (!fs.existsSync(src)) return
  fs.mkdirSync(dest, { recursive: true })
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name)
    const destPath = path.join(dest, entry.name)
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath)
    } else if (entry.isFile()) {
      // Don't overwrite if user has already created something at the dest
      if (!fs.existsSync(destPath)) {
        fs.copyFileSync(srcPath, destPath)
      }
    }
  }
}

/**
 * Run the migration if needed.
 * @param newUserDataPath - app.getPath('userData') from the new app
 * @param appDataRoot - app.getPath('appData') (parent of all userData folders)
 */
export function migrateLegacyUserData(
  newUserDataPath: string,
  appDataRoot: string
): MigrationResult {
  // Already migrated? Skip.
  const markerPath = path.join(newUserDataPath, MARKER_FILE)
  if (fs.existsSync(markerPath)) {
    return { ran: false, copiedFiles: [], copiedDirs: [], source: null, reason: 'already migrated' }
  }

  // Find the old userData folder. Electron normalizes productName for path,
  // but it could be "agentorch" (old name field) or "AgentOrch" (old productName).
  const candidates = [
    path.join(appDataRoot, 'agentorch'),
    path.join(appDataRoot, 'AgentOrch')
  ]
  const oldPath = candidates.find(p => fs.existsSync(p))

  if (!oldPath) {
    // Fresh install — no old data to migrate. Write the marker so we don't
    // keep checking forever.
    try {
      fs.mkdirSync(newUserDataPath, { recursive: true })
      fs.writeFileSync(markerPath, JSON.stringify({
        migratedAt: new Date().toISOString(),
        source: null,
        reason: 'fresh install — no legacy data found'
      }, null, 2))
    } catch { /* swallow */ }
    return { ran: false, copiedFiles: [], copiedDirs: [], source: null, reason: 'no legacy folder found' }
  }

  // Don't migrate from yourself (defensive — in case paths somehow alias)
  if (path.normalize(oldPath) === path.normalize(newUserDataPath)) {
    return { ran: false, copiedFiles: [], copiedDirs: [], source: null, reason: 'old path is same as new path' }
  }

  fs.mkdirSync(newUserDataPath, { recursive: true })

  const copiedFiles: string[] = []
  const copiedDirs: string[] = []

  for (const file of FILES_TO_COPY) {
    const src = path.join(oldPath, file)
    const dest = path.join(newUserDataPath, file)
    if (fs.existsSync(src) && !fs.existsSync(dest)) {
      try {
        fs.copyFileSync(src, dest)
        copiedFiles.push(file)
      } catch (err) {
        console.warn(`[userdata-migration] Failed to copy ${file}: ${(err as Error).message}`)
      }
    }
  }

  for (const dir of DIRS_TO_COPY) {
    const src = path.join(oldPath, dir)
    const dest = path.join(newUserDataPath, dir)
    if (fs.existsSync(src)) {
      try {
        copyDirRecursive(src, dest)
        copiedDirs.push(dir)
      } catch (err) {
        console.warn(`[userdata-migration] Failed to copy ${dir}/: ${(err as Error).message}`)
      }
    }
  }

  // Write marker so this only runs once
  try {
    fs.writeFileSync(markerPath, JSON.stringify({
      migratedAt: new Date().toISOString(),
      source: oldPath,
      copiedFiles,
      copiedDirs
    }, null, 2))
  } catch (err) {
    console.warn(`[userdata-migration] Failed to write marker: ${(err as Error).message}`)
  }

  return { ran: true, copiedFiles, copiedDirs, source: oldPath }
}
