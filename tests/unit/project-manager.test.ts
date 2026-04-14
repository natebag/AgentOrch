import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { ProjectManager } from '../../src/main/project/project-manager'

describe('ProjectManager', () => {
  let tmpDir: string
  let projectDir: string
  let pm: ProjectManager

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-test-'))
    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'project-test-'))
    pm = new ProjectManager(tmpDir)
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
    fs.rmSync(projectDir, { recursive: true, force: true })
  })

  describe('initProject', () => {
    it('creates .cog directory structure', () => {
      pm.initProject(projectDir)
      expect(fs.existsSync(path.join(projectDir, '.cog'))).toBe(true)
      expect(fs.existsSync(path.join(projectDir, '.cog', 'presets'))).toBe(true)
    })

    it('writes .gitignore in .cog/', () => {
      pm.initProject(projectDir)
      const gitignore = fs.readFileSync(
        path.join(projectDir, '.cog', '.gitignore'), 'utf-8'
      )
      expect(gitignore).toContain('cog.db')
      expect(gitignore).toContain('cog.db-wal')
      expect(gitignore).toContain('cog.db-shm')
    })

    it('does not overwrite existing .gitignore', () => {
      const cogDir = path.join(projectDir, '.cog')
      fs.mkdirSync(cogDir, { recursive: true })
      fs.writeFileSync(path.join(cogDir, '.gitignore'), 'custom content')

      pm.initProject(projectDir)
      const gitignore = fs.readFileSync(path.join(cogDir, '.gitignore'), 'utf-8')
      expect(gitignore).toBe('custom content')
    })

    it('sets current project', () => {
      pm.initProject(projectDir)
      expect(pm.currentProject).not.toBeNull()
      expect(pm.currentProject!.path).toBe(projectDir)
      expect(pm.currentProject!.name).toBe(path.basename(projectDir))
    })

    it('migrates legacy .agentorch/ folder to .cog/ on first open', () => {
      // Simulate a user from before the rebrand
      const legacyDir = path.join(projectDir, '.agentorch')
      const legacyPresets = path.join(legacyDir, 'presets')
      fs.mkdirSync(legacyPresets, { recursive: true })
      fs.writeFileSync(path.join(legacyDir, 'agentorch.db'), 'fake db')
      fs.writeFileSync(path.join(legacyDir, 'agentorch.db-wal'), 'fake wal')
      fs.writeFileSync(path.join(legacyPresets, 'test.json'), '{}')

      pm.initProject(projectDir)

      // Legacy folder is gone, .cog/ has everything renamed
      expect(fs.existsSync(legacyDir)).toBe(false)
      expect(fs.existsSync(path.join(projectDir, '.cog', 'cog.db'))).toBe(true)
      expect(fs.existsSync(path.join(projectDir, '.cog', 'cog.db-wal'))).toBe(true)
      expect(fs.existsSync(path.join(projectDir, '.cog', 'presets', 'test.json'))).toBe(true)
    })

    it('does not migrate if .cog/ already exists', () => {
      // Both folders exist — .cog takes precedence, legacy left alone
      const legacyDir = path.join(projectDir, '.agentorch')
      const cogDir = path.join(projectDir, '.cog')
      fs.mkdirSync(legacyDir, { recursive: true })
      fs.mkdirSync(cogDir, { recursive: true })
      fs.writeFileSync(path.join(legacyDir, 'agentorch.db'), 'legacy')
      fs.writeFileSync(path.join(cogDir, 'cog.db'), 'current')

      pm.initProject(projectDir)

      // Both still exist — no clobbering
      expect(fs.existsSync(legacyDir)).toBe(true)
      expect(fs.readFileSync(path.join(cogDir, 'cog.db'), 'utf-8')).toBe('current')
    })
  })

  describe('paths', () => {
    it('returns DB path inside .cog/', () => {
      pm.initProject(projectDir)
      expect(pm.dbPath).toBe(path.join(projectDir, '.cog', 'cog.db'))
    })

    it('returns presets dir inside .cog/', () => {
      pm.initProject(projectDir)
      expect(pm.presetsDir).toBe(path.join(projectDir, '.cog', 'presets'))
    })

    it('throws if no project is open', () => {
      expect(() => pm.dbPath).toThrow('No project open')
      expect(() => pm.presetsDir).toThrow('No project open')
    })
  })

  describe('recent projects', () => {
    it('returns empty list when no history', () => {
      expect(pm.listRecent()).toEqual([])
    })

    it('adds project to recent list on init', () => {
      pm.initProject(projectDir)
      const recent = pm.listRecent()
      expect(recent).toHaveLength(1)
      expect(recent[0].path).toBe(projectDir)
    })

    it('updates lastOpened when reopening same project', () => {
      pm.initProject(projectDir)
      const first = pm.listRecent()[0].lastOpened

      pm.initProject(projectDir)
      const second = pm.listRecent()[0].lastOpened
      expect(pm.listRecent()).toHaveLength(1)
      expect(second >= first).toBe(true)
    })

    it('returns most recent first', () => {
      const dir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'project2-'))
      pm.initProject(projectDir)
      pm.initProject(dir2)

      const recent = pm.listRecent()
      expect(recent[0].path).toBe(dir2)
      expect(recent[1].path).toBe(projectDir)

      fs.rmSync(dir2, { recursive: true, force: true })
    })

    it('caps at 20 entries', () => {
      const dirs: string[] = []
      for (let i = 0; i < 25; i++) {
        const d = fs.mkdtempSync(path.join(os.tmpdir(), `proj${i}-`))
        dirs.push(d)
        pm.initProject(d)
      }
      expect(pm.listRecent().length).toBeLessThanOrEqual(20)
      dirs.forEach(d => fs.rmSync(d, { recursive: true, force: true }))
    })

    it('removes a project from recent list', () => {
      pm.initProject(projectDir)
      expect(pm.listRecent()).toHaveLength(1)

      pm.removeRecent(projectDir)
      expect(pm.listRecent()).toHaveLength(0)
    })

    it('getLastProject returns the most recently opened', () => {
      pm.initProject(projectDir)
      const last = pm.getLastProject()
      expect(last).not.toBeNull()
      expect(last!.path).toBe(projectDir)
    })

    it('getLastProject returns null when no history', () => {
      expect(pm.getLastProject()).toBeNull()
    })

    it('getLastProject skips deleted folders', () => {
      const dir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'project-gone-'))
      pm.initProject(projectDir)
      pm.initProject(dir2)
      fs.rmSync(dir2, { recursive: true, force: true })

      const last = pm.getLastProject()
      expect(last!.path).toBe(projectDir)
    })
  })
})
