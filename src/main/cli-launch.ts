import type { AgentConfig } from '../shared/types'

/**
 * Build a shell command that removes ALL agentorch-* MCP registrations
 * for a given CLI tool. Prevents stale registrations from accumulating
 * when agent names change between sessions.
 */
function buildMcpCleanupCmd(
  cli: 'codex' | 'gemini',
  shell: AgentConfig['shell']
): string {
  if (shell === 'cmd') {
    return `for /f "tokens=1" %i in ('${cli} mcp list 2^>nul ^| findstr /B "agentorch"') do @${cli} mcp remove %i 2>nul`
  }
  if (shell === 'powershell') {
    return `${cli} mcp list 2>$null | Where-Object { $_ -match '^agentorch' } | ForEach-Object { ${cli} mcp remove ($_ -split '\\s+')[0] 2>$null }`
  }
  if (shell === 'fish') {
    return `${cli} mcp list 2>/dev/null | grep '^agentorch' | awk '{print $1}' | while read name; ${cli} mcp remove $name 2>/dev/null; end`
  }
  // bash, zsh
  return `${cli} mcp list 2>/dev/null | grep '^agentorch' | awk '{print $1}' | while read name; do ${cli} mcp remove "$name" 2>/dev/null; done`
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

  if (cliBase === 'claude') {
    const parts = [`claude --mcp-config "${mcpConfigPath}"`]
    if (config.model) parts[0] += ` --model ${config.model}`
    if (config.autoMode) parts[0] += ' --dangerously-skip-permissions'
    return parts
  }

  if (cliBase === 'openclaude') {
    const parts = [`openclaude --mcp-config "${mcpConfigPath}"`]
    if (config.model) parts[0] += ` --model ${config.model}`
    if (config.autoMode) parts[0] += ' --dangerously-skip-permissions'
    return parts
  }

  if (cliBase === 'codex') {
    const mcpName = `agentorch-${config.name.replace(/\s+/g, '-')}`
    const cmds = [
      buildMcpCleanupCmd('codex', config.shell),
      `codex mcp add ${mcpName} -- node "${mcpServerPath}" ${hubPort} ${hubSecret} ${config.id} ${config.name}`,
    ]
    let codexCmd = 'codex'
    if (config.model) codexCmd += ` -m ${config.model}`
    if (config.autoMode) codexCmd += ' --yolo'
    cmds.push(codexCmd)
    return cmds
  }

  if (cliBase === 'kimi') {
    let cmd = `kimi --mcp-config-file "${mcpConfigPath}"`
    if (config.model) cmd += ` --model ${config.model}`
    if (config.autoMode) cmd += ' --yolo'
    return [cmd]
  }

  if (cliBase === 'gemini') {
    const mcpName = `agentorch-${config.name.replace(/\s+/g, '-')}`
    const cmds = [
      buildMcpCleanupCmd('gemini', config.shell),
      `gemini mcp add ${mcpName} node "${mcpServerPath}" ${hubPort} ${hubSecret} ${config.id} ${config.name}`,
    ]
    let geminiCmd = 'gemini'
    if (config.model) geminiCmd += ` --model ${config.model}`
    if (config.autoMode) geminiCmd += ' --yolo'
    cmds.push(geminiCmd)
    return cmds
  }

  if (cliBase === 'copilot') {
    let cmd = `copilot --additional-mcp-config "@${mcpConfigPath}"`
    if (config.model) cmd += ` --model=${config.model}`
    if (config.autoMode) cmd += ' --allow-all'
    return [cmd]
  }

  if (cliBase === 'grok') {
    let cmd = 'grok'
    if (config.model) cmd += ` --model ${config.model}`
    return [cmd]
  }

  return [cliBase]
}
