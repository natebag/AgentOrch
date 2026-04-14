import { execFileSync } from 'child_process'
import type { GitStatus, GitFileStatus, GitLogEntry } from '../../shared/types'

// All git invocations use execFileSync with argv arrays so the shell is never involved.
// This eliminates command-injection vectors when user-controlled values (file paths,
// branch names, commit messages) are passed through.
function gitRun(args: string[], cwd: string, timeoutMs = 10000): string {
  try {
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf-8',
      timeout: timeoutMs,
      stdio: ['pipe', 'pipe', 'pipe']
    }).trim()
  } catch {
    return ''
  }
}

// Reject branch/file tokens that would be parsed as git flags even in argv form.
// Callers still get command execution, but an attacker cannot smuggle `--exec=...`
// or `--upload-pack=...` through by starting the value with `-`.
function assertNotFlag(value: string, label: string): void {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`git-ops: ${label} must be a non-empty string`)
  }
  if (value.startsWith('-')) {
    throw new Error(`git-ops: ${label} cannot start with '-' (got ${JSON.stringify(value)})`)
  }
  if (/[\0\r\n]/.test(value)) {
    throw new Error(`git-ops: ${label} cannot contain NUL or newline characters`)
  }
}

function isGitRepo(cwd: string): boolean {
  try {
    execFileSync('git', ['rev-parse', '--git-dir'], { cwd, encoding: 'utf-8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'] })
    return true
  } catch {
    return false
  }
}

function parseStatusLine(line: string): { status: GitFileStatus['status']; path: string; staged: boolean } | null {
  if (line.length < 4) return null
  const x = line[0]
  const y = line[1]
  const filePath = line.slice(3).trim()

  if (x !== ' ' && x !== '?') {
    const status = x === 'A' ? 'added' : x === 'D' ? 'deleted' : x === 'R' ? 'renamed' : 'modified'
    return { status, path: filePath, staged: true }
  }
  if (y !== ' ') {
    const status = y === '?' ? 'added' : y === 'D' ? 'deleted' : 'modified'
    return { status, path: filePath, staged: false }
  }
  return null
}

export function getStatus(cwd: string): GitStatus {
  if (!isGitRepo(cwd)) {
    return { branch: '', ahead: 0, behind: 0, staged: [], unstaged: [], isRepo: false }
  }

  const branch = gitRun(['branch', '--show-current'], cwd) || 'HEAD'

  let ahead = 0, behind = 0
  const counts = gitRun(['rev-list', '--left-right', '--count', 'HEAD...@{upstream}'], cwd)
  if (counts) {
    const parts = counts.split('\t')
    ahead = parseInt(parts[0]) || 0
    behind = parseInt(parts[1]) || 0
  }

  const statusOutput = gitRun(['status', '--porcelain'], cwd)
  const staged: GitFileStatus[] = []
  const unstaged: GitFileStatus[] = []

  const lines = statusOutput.split('\n')
  const MAX_FILES = 200 // cap to prevent UI lag on huge repos

  for (const line of lines) {
    if (!line.trim()) continue
    if (staged.length + unstaged.length >= MAX_FILES) break
    const parsed = parseStatusLine(line)
    if (!parsed) continue
    if (parsed.staged) {
      staged.push({ path: parsed.path, status: parsed.status, staged: true })
    } else {
      unstaged.push({ path: parsed.path, status: parsed.status, staged: false })
    }
  }

  return { branch, ahead, behind, staged, unstaged, isRepo: true }
}

export function getLog(cwd: string, count = 20): GitLogEntry[] {
  const n = Number.isInteger(count) && count > 0 && count <= 1000 ? count : 20
  const output = gitRun(['log', '--pretty=format:%h|||%s|||%an|||%ar', `-${n}`], cwd)
  if (!output) return []

  return output.split('\n').filter(Boolean).map(line => {
    const [sha, message, author, relativeDate] = line.split('|||')
    return { sha, message, author, relativeDate }
  })
}

export function getDiff(cwd: string, file: string, staged: boolean): string {
  assertNotFlag(file, 'file')
  const args = ['diff']
  if (staged) args.push('--cached')
  // '--' separator stops git from interpreting `file` as a flag even if someone bypasses assertNotFlag.
  args.push('--', file)
  return gitRun(args, cwd)
}

export function stageFile(cwd: string, file: string): void {
  assertNotFlag(file, 'file')
  execFileSync('git', ['add', '--', file], { cwd, encoding: 'utf-8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'] })
}

export function unstageFile(cwd: string, file: string): void {
  assertNotFlag(file, 'file')
  execFileSync('git', ['reset', 'HEAD', '--', file], { cwd, encoding: 'utf-8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'] })
}

export function commit(cwd: string, message: string): string {
  if (typeof message !== 'string' || message.length === 0) {
    throw new Error('git-ops: commit message must be a non-empty string')
  }
  // Passing message as its own argv element keeps the shell out of the picture —
  // backticks, $(...), ;, &&, etc. are all literal text to `git commit`.
  return execFileSync('git', ['commit', '-m', message], {
    cwd,
    encoding: 'utf-8',
    timeout: 10000,
    stdio: ['pipe', 'pipe', 'pipe']
  }).trim()
}

export function push(cwd: string): string {
  return execFileSync('git', ['push'], { cwd, encoding: 'utf-8', timeout: 30000, stdio: ['pipe', 'pipe', 'pipe'] }).trim()
}

export function pull(cwd: string): string {
  return execFileSync('git', ['pull'], { cwd, encoding: 'utf-8', timeout: 30000, stdio: ['pipe', 'pipe', 'pipe'] }).trim()
}

export function getBranches(cwd: string): { current: string; branches: string[] } {
  const output = gitRun(['branch'], cwd)
  const branches: string[] = []
  let current = ''
  for (const line of output.split('\n')) {
    const name = line.replace(/^\*?\s+/, '').trim()
    if (!name) continue
    branches.push(name)
    if (line.startsWith('*')) current = name
  }
  return { current, branches }
}

export function checkout(cwd: string, branch: string): void {
  assertNotFlag(branch, 'branch')
  execFileSync('git', ['checkout', branch], { cwd, encoding: 'utf-8', timeout: 10000, stdio: ['pipe', 'pipe', 'pipe'] })
}

export function createBranch(cwd: string, name: string): void {
  assertNotFlag(name, 'branch')
  execFileSync('git', ['checkout', '-b', name], { cwd, encoding: 'utf-8', timeout: 10000, stdio: ['pipe', 'pipe', 'pipe'] })
}
