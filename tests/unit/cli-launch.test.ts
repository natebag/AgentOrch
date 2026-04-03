import { describe, expect, it } from 'vitest'
import { buildCliLaunchCommands } from '../../src/main/cli-launch'
import type { AgentConfig } from '../../src/shared/types'

const makeConfig = (overrides: Partial<AgentConfig> = {}): AgentConfig => ({
  id: 'agent-1',
  name: 'worker-1',
  cli: 'claude',
  cwd: 'C:\\repo',
  role: 'worker',
  ceoNotes: 'notes',
  shell: 'powershell',
  admin: false,
  autoMode: false,
  ...overrides
})

describe('buildCliLaunchCommands', () => {
  it('preserves Claude launch behavior', () => {
    expect(buildCliLaunchCommands(
      makeConfig({ model: 'sonnet', autoMode: true }),
      'C:\\temp\\agentorch-mcp.json',
      'C:\\temp\\mcp-server.js',
      7777,
      'secret'
    )).toEqual([
      'claude --mcp-config "C:\\temp\\agentorch-mcp.json" --model sonnet --dangerously-skip-permissions'
    ])
  })

  it('launches Gemini with MCP registration and model flags', () => {
    expect(buildCliLaunchCommands(
      makeConfig({ cli: 'gemini', model: 'gemini-2.5-pro', autoMode: true }),
      'C:\\temp\\agentorch-mcp.json',
      'C:\\temp\\mcp-server.js',
      7777,
      'secret'
    )).toEqual([
      'gemini mcp remove agentorch 2>$null; gemini mcp add agentorch node "C:\\temp\\mcp-server.js" 7777 secret agent-1 worker-1',
      'gemini --model gemini-2.5-pro --yolo'
    ])
  })

  it('launches Copilot with session-scoped MCP config and allow-all mode', () => {
    expect(buildCliLaunchCommands(
      makeConfig({ cli: 'copilot', model: 'gpt-4o', autoMode: true }),
      'C:\\temp\\agentorch-mcp.json',
      'C:\\temp\\mcp-server.js',
      7777,
      'secret'
    )).toEqual([
      'copilot --additional-mcp-config "@C:\\temp\\agentorch-mcp.json" --model=gpt-4o --allow-all'
    ])
  })

  it('keeps Grok as best-effort launch support with optional model', () => {
    expect(buildCliLaunchCommands(
      makeConfig({ cli: 'grok', model: 'grok-3', experimental: true }),
      'C:\\temp\\agentorch-mcp.json',
      'C:\\temp\\mcp-server.js',
      7777,
      'secret'
    )).toEqual([
      'grok --model grok-3'
    ])
  })

  it('passes custom CLI commands through unchanged', () => {
    expect(buildCliLaunchCommands(
      makeConfig({ cli: 'my-agent --flag' }),
      'C:\\temp\\agentorch-mcp.json',
      'C:\\temp\\mcp-server.js',
      7777,
      'secret'
    )).toEqual([
      'my-agent --flag'
    ])
  })
})
