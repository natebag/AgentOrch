import type { AgentConfig } from '../shared/types'

// ── Input validation for values that get spliced into shell command strings ──
//
// The commands produced by this module are typed into a live PTY shell by the
// caller. That means every interpolated value is interpreted by bash/zsh/cmd/
// powershell/fish. To keep that safe we validate each attacker-reachable
// field (config.name, config.id, config.model, hubSecret) against a strict
// allowlist before it ever touches a command string. Anything that fails
// validation raises — the agent simply won't launch — which is the right
// trade-off vs. silent shell injection at spawn time.

const ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/
const MODEL_PATTERN = /^[A-Za-z0-9_./:-]{1,128}$/
// The production hub secret is 64 hex chars (randomBytes(32).toString('hex')),
// but we accept a wider range here (4-256 alphanumerics) so tests and ad-hoc
// configurations still work. The point is rejecting shell metacharacters.
const SECRET_PATTERN = /^[A-Za-z0-9]{4,256}$/

function assertShellSafeToken(value: unknown, label: string, pattern: RegExp): string {
  if (typeof value !== 'string' || !pattern.test(value)) {
    throw new Error(`cli-launch: ${label} contains unsafe characters or is the wrong length`)
  }
  return value
}

// Strip config.name down to the same shape gemini already requires: letters,
// digits, and dashes. This is what we splice into `agentorch-<name>` for the
// MCP registration, so it must be shell-safe across every supported shell.
function sanitizeNameForMcp(name: string, fallback: string): string {
  const cleaned = name
    .replace(/[^a-zA-Z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  return cleaned || fallback
}

/**
 * Build a shell command that removes ALL agentorch-* MCP registrations
 * for a given CLI tool. Prevents stale registrations from accumulating
 * when agent names change between sessions.
 *
 * Gemini `mcp list` prefixes lines with a status icon (✓/✗) so the name
 * is NOT the first token — we use grep -o / regex extraction to pull out
 * the agentorch-* name regardless of surrounding text.
 *
 * Codex `mcp list` prints the name as the first token, so we keep the
 * simpler start-anchored match there to avoid changing what already works.
 */
function buildMcpCleanupCmd(
  cli: 'codex' | 'gemini',
  shell: AgentConfig['shell']
): string {
  if (cli === 'gemini') return buildGeminiCleanupCmd(shell)
  return buildCodexCleanupCmd(shell)
}

function buildCodexCleanupCmd(shell: AgentConfig['shell']): string {
  if (shell === 'cmd') {
    return `for /f "tokens=1" %i in ('codex mcp list 2^>nul ^| findstr /B "agentorch"') do @codex mcp remove %i 2>nul`
  }
  if (shell === 'powershell') {
    return `codex mcp list 2>$null | Where-Object { $_ -match '^agentorch' } | ForEach-Object { codex mcp remove ($_ -split '\\s+')[0] 2>$null }`
  }
  if (shell === 'fish') {
    return `codex mcp list 2>/dev/null | grep '^agentorch' | awk '{print $1}' | while read name; codex mcp remove $name 2>/dev/null; end`
  }
  // bash, zsh
  return `codex mcp list 2>/dev/null | grep '^agentorch' | awk '{print $1}' | while read name; do codex mcp remove "$name" 2>/dev/null; done`
}

function buildGeminiCleanupCmd(shell: AgentConfig['shell']): string {
  if (shell === 'cmd') {
    // Gemini `mcp list` emits Unicode status icons (✓/✗) that cause cmd.exe to drop the entire
    // output stream when piped through `for /f`, so the loop receives nothing and cleanup
    // silently fails. Shell out to PowerShell which handles the Unicode output correctly.
    return `powershell -NoProfile -Command "gemini mcp list 2>$null | ForEach-Object { if ($_ -match '(agentorch[^\\s:]+)') { gemini mcp remove $Matches[1] 2>$null } }"`
  }
  if (shell === 'powershell') {
    return `gemini mcp list 2>$null | ForEach-Object { if ($_ -match '(agentorch[^\\s:]+)') { gemini mcp remove $Matches[1] 2>$null } }`
  }
  if (shell === 'fish') {
    return `gemini mcp list 2>/dev/null | grep -o 'agentorch[^ :]*' | while read name; gemini mcp remove $name 2>/dev/null; end`
  }
  // bash, zsh
  return `gemini mcp list 2>/dev/null | grep -o 'agentorch[^ :]*' | while read name; do gemini mcp remove "$name" 2>/dev/null; done`
}

export function buildCliLaunchCommands(
  config: AgentConfig,
  mcpConfigPath: string,
  mcpServerPath: string,
  hubPort: number,
  hubSecret: string
): string[] | null {
  const cliBase = config.cli

  if (cliBase === 'terminal') return null

  // Validate every value that will be interpolated into a shell command
  // string, both to stop attacker-controlled injections and to crash early
  // with a clear error rather than a mysterious shell parse failure.
  const safeId = assertShellSafeToken(config.id, 'agent id', ID_PATTERN)
  const safeModel = config.model ? assertShellSafeToken(config.model, 'model', MODEL_PATTERN) : ''
  const safeSecret = assertShellSafeToken(hubSecret, 'hubSecret', SECRET_PATTERN)
  if (!Number.isInteger(hubPort) || hubPort <= 0 || hubPort > 65535) {
    throw new Error('cli-launch: hubPort must be an integer between 1 and 65535')
  }
  const safeName = sanitizeNameForMcp(typeof config.name === 'string' ? config.name : '', safeId)

  if (cliBase === 'claude') {
    const parts = [`claude --mcp-config "${mcpConfigPath}"`]
    if (safeModel) parts[0] += ` --model ${safeModel}`
    if (config.autoMode) parts[0] += ' --dangerously-skip-permissions'
    return parts
  }

  if (cliBase === 'openclaude') {
    const parts = [`openclaude --mcp-config "${mcpConfigPath}"`]
    if (safeModel) parts[0] += ` --model ${safeModel}`
    if (config.autoMode) parts[0] += ' --dangerously-skip-permissions'
    return parts
  }

  if (cliBase === 'codex') {
    const mcpName = `agentorch-${safeName}`
    const cmds = [
      buildMcpCleanupCmd('codex', config.shell),
      // Pass the agent name via URL-encoded env flag to match the gemini path,
      // so spaces or other unicode in the display name can't poison the shell
      // command. The MCP server picks AGENT_ID/AGENT_NAME_ENC out of its env.
      `codex mcp add ${mcpName} -- node "${mcpServerPath}" ${hubPort} ${safeSecret} ${safeId} ${safeName}`,
    ]
    let codexCmd = 'codex'
    if (safeModel) codexCmd += ` -m ${safeModel}`
    if (config.autoMode) codexCmd += ' --yolo'
    cmds.push(codexCmd)
    return cmds
  }

  if (cliBase === 'kimi') {
    let cmd = `kimi --mcp-config-file "${mcpConfigPath}"`
    if (safeModel) cmd += ` --model ${safeModel}`
    if (config.autoMode) cmd += ' --yolo'
    return [cmd]
  }

  if (cliBase === 'gemini') {
    const mcpName = `agentorch-${safeName}`
    // encodeURIComponent leaves a handful of characters untouched (! * ' ( ))
    // which bash/zsh treat as syntax. Additionally escape those so the
    // command is safe across every supported shell without quoting.
    const encodedName = encodeURIComponent(config.name).replace(/[!*'()]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase())
    const cmds = [
      buildMcpCleanupCmd('gemini', config.shell),
      `gemini mcp add ${mcpName} -e AGENTORCH_HUB_PORT=${hubPort} -e AGENTORCH_HUB_SECRET=${safeSecret} -e AGENTORCH_AGENT_ID=${safeId} -e AGENTORCH_AGENT_NAME_ENC=${encodedName} node "${mcpServerPath}"`,
    ]
    let geminiCmd = 'gemini'
    if (safeModel) geminiCmd += ` --model ${safeModel}`
    if (config.autoMode) geminiCmd += ' --yolo'
    cmds.push(geminiCmd)
    return cmds
  }

  if (cliBase === 'copilot') {
    let cmd = `copilot --additional-mcp-config "@${mcpConfigPath}"`
    if (safeModel) cmd += ` --model=${safeModel}`
    if (config.autoMode) cmd += ' --allow-all'
    return [cmd]
  }

  if (cliBase === 'grok') {
    let cmd = 'grok'
    if (safeModel) cmd += ` --model ${safeModel}`
    return [cmd]
  }

  return [cliBase]
}
