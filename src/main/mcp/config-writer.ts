import { writeFileSync, unlinkSync } from 'fs'
import path from 'path'
import os from 'os'

interface McpConfigOptions {
  agentId: string
  agentName: string
  hubPort: number
  hubSecret: string
  mcpServerPath: string
}

export function writeAgentMcpConfig(opts: McpConfigOptions): string {
  const fileName = `cog-${opts.agentId}-mcp.json`
  const filePath = path.join(os.tmpdir(), fileName)

  // Dual-emit COG_* (new) + AGENTORCH_* (legacy) env vars. The MCP server
  // prefers COG_* but falls back to AGENTORCH_*, so in-flight agents keep
  // working across the rebrand.
  const config = {
    mcpServers: {
      cog: {
        command: 'node',
        args: [opts.mcpServerPath],
        env: {
          COG_HUB_PORT: String(opts.hubPort),
          COG_HUB_SECRET: opts.hubSecret,
          COG_AGENT_ID: opts.agentId,
          COG_AGENT_NAME: opts.agentName,
          AGENTORCH_HUB_PORT: String(opts.hubPort),
          AGENTORCH_HUB_SECRET: opts.hubSecret,
          AGENTORCH_AGENT_ID: opts.agentId,
          AGENTORCH_AGENT_NAME: opts.agentName
        }
      }
    }
  }

  writeFileSync(filePath, JSON.stringify(config, null, 2), { encoding: 'utf-8', mode: 0o600 })
  return filePath
}

export function cleanupConfig(filePath: string): void {
  try {
    unlinkSync(filePath)
  } catch {
    // File already deleted or inaccessible
  }
}
