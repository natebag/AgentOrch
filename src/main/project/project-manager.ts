import * as fs from 'fs'
import * as path from 'path'
import type { RecentProject } from '../../shared/types'

const RECENT_FILE = 'recent-projects.json'
const COG_DIR = '.cog'
const LEGACY_DIR = '.agentorch'
const DB_FILE = 'cog.db'
const LEGACY_DB_FILE = 'agentorch.db'
const MAX_RECENT = 20

const GITIGNORE_CONTENT = `cog.db
cog.db-wal
cog.db-shm
agentorch.db
agentorch.db-wal
agentorch.db-shm
`

/**
 * Migrate a legacy .agentorch/ folder to .cog/ on project open.
 * Renames the directory and the internal SQLite files (including WAL/SHM sidecars).
 *
 * Handles three cases:
 *  1. Only .agentorch/ exists → rename to .cog/, rename DB files inside
 *  2. Both exist, .cog/ has no DB → user accidentally opened with new app first,
 *     but real data is still in .agentorch/. Move .agentorch/* into .cog/
 *  3. .cog/ exists with DB → already migrated, do nothing
 */
function migrateLegacyFolder(projectPath: string): void {
  const cogDir = path.join(projectPath, COG_DIR)
  const legacyDir = path.join(projectPath, LEGACY_DIR)

  // If neither exists, nothing to migrate (fresh project)
  if (!fs.existsSync(legacyDir)) return

  const cogDbExists = fs.existsSync(path.join(cogDir, DB_FILE))
  const legacyDbExists = fs.existsSync(path.join(legacyDir, LEGACY_DB_FILE))

  // Case 3: .cog/ already has real data — skip migration
  if (cogDbExists) {
    console.log(`[ProjectManager] ${COG_DIR}/ already has data — skipping migration`)
    return
  }

  // Case 2: .cog/ exists but is empty AND .agentorch/ has data → merge
  if (fs.existsSync(cogDir) && legacyDbExists) {
    console.log(`[ProjectManager] Found empty ${COG_DIR}/ alongside ${LEGACY_DIR}/ — merging legacy data in`)
    try {
      mergeDirInto(legacyDir, cogDir)
      // Remove the now-empty legacy folder
      fs.rmSync(legacyDir, { recursive: true, force: true })
    } catch (err) {
      console.warn(`[ProjectManager] Merge failed: ${(err as Error).message}`)
      return
    }
  } else if (!fs.existsSync(cogDir) && fs.existsSync(legacyDir)) {
    // Case 1: clean rename
    try {
      fs.renameSync(legacyDir, cogDir)
    } catch (err) {
      console.warn(`[ProjectManager] Could not rename ${legacyDir} → ${cogDir}: ${(err as Error).message}`)
      return
    }
  }

  // Rename DB files inside (agentorch.db + agentorch.db-wal + agentorch.db-shm → cog.db etc)
  for (const suffix of ['', '-wal', '-shm']) {
    const oldDb = path.join(cogDir, LEGACY_DB_FILE + suffix)
    const newDb = path.join(cogDir, DB_FILE + suffix)
    if (fs.existsSync(oldDb) && !fs.existsSync(newDb)) {
      try {
        fs.renameSync(oldDb, newDb)
      } catch (err) {
        console.warn(`[ProjectManager] Could not rename DB file ${oldDb}: ${(err as Error).message}`)
      }
    }
  }

  console.log(`[ProjectManager] Migrated ${LEGACY_DIR}/ → ${COG_DIR}/ in ${projectPath}`)
}

/** Recursively move contents of srcDir into destDir without overwriting existing files. */
function mergeDirInto(srcDir: string, destDir: string): void {
  fs.mkdirSync(destDir, { recursive: true })
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const srcPath = path.join(srcDir, entry.name)
    const destPath = path.join(destDir, entry.name)
    if (entry.isDirectory()) {
      mergeDirInto(srcPath, destPath)
    } else if (entry.isFile() && !fs.existsSync(destPath)) {
      fs.copyFileSync(srcPath, destPath)
    }
  }
}

export class ProjectManager {
  private _current: RecentProject | null = null

  constructor(private userDataPath: string) {}

  get currentProject(): RecentProject | null {
    return this._current
  }

  get dbPath(): string {
    if (!this._current) throw new Error('No project open')
    return path.join(this._current.path, COG_DIR, DB_FILE)
  }

  get presetsDir(): string {
    if (!this._current) throw new Error('No project open')
    return path.join(this._current.path, COG_DIR, 'presets')
  }

  initProject(projectPath: string): void {
    // Migrate legacy .agentorch/ folder if present (one-time, seamless for existing users)
    migrateLegacyFolder(projectPath)

    const cogDir = path.join(projectPath, COG_DIR)
    const presetsDir = path.join(cogDir, 'presets')

    fs.mkdirSync(presetsDir, { recursive: true })

    const gitignorePath = path.join(cogDir, '.gitignore')
    if (!fs.existsSync(gitignorePath)) {
      fs.writeFileSync(gitignorePath, GITIGNORE_CONTENT, 'utf-8')
    }

    this._current = {
      path: projectPath,
      name: path.basename(projectPath),
      lastOpened: new Date().toISOString()
    }

    this.addRecent(this._current)
  }

  listRecent(): RecentProject[] {
    const filePath = path.join(this.userDataPath, RECENT_FILE)
    if (!fs.existsSync(filePath)) return []

    try {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
      return Array.isArray(data) ? data : []
    } catch {
      return []
    }
  }

  getLastProject(): RecentProject | null {
    const recent = this.listRecent()
    for (const project of recent) {
      if (fs.existsSync(project.path)) return project
    }
    return null
  }

  removeRecent(projectPath: string): void {
    const recent = this.listRecent().filter(p => p.path !== projectPath)
    this.saveRecent(recent)
  }

  private addRecent(project: RecentProject): void {
    let recent = this.listRecent().filter(p => p.path !== project.path)
    recent.unshift(project)
    if (recent.length > MAX_RECENT) recent = recent.slice(0, MAX_RECENT)
    this.saveRecent(recent)
  }

  private saveRecent(recent: RecentProject[]): void {
    const filePath = path.join(this.userDataPath, RECENT_FILE)
    fs.writeFileSync(filePath, JSON.stringify(recent, null, 2), 'utf-8')
  }
}
