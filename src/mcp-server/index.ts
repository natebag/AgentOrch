import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'

// Support both CLI args (for codex/kimi) and env vars (for claude).
// CLI args: node index.js <port> <secret> <agent_id> <agent_name...>
// Agent name can contain spaces — everything from arg[3] onward is joined.
const args = process.argv.slice(2)
const HUB_PORT = args[0] || process.env.AGENTORCH_HUB_PORT
const HUB_SECRET = args[1] || process.env.AGENTORCH_HUB_SECRET
const AGENT_ID = args[2] || process.env.AGENTORCH_AGENT_ID
const AGENT_NAME = (args.length > 3 ? args.slice(3).join(' ') : undefined) || process.env.AGENTORCH_AGENT_NAME

if (!HUB_PORT || !HUB_SECRET || !AGENT_ID || !AGENT_NAME) {
  console.error('AgentOrch MCP server: missing connection info.')
  console.error('Usage: node index.js <port> <secret> <agent_id> <agent_name>')
  console.error('Or set AGENTORCH_HUB_PORT, AGENTORCH_HUB_SECRET, AGENTORCH_AGENT_ID, AGENTORCH_AGENT_NAME')
  process.exit(1)
}

const HUB_URL = `http://127.0.0.1:${HUB_PORT}`

async function hubFetch(path: string, opts: RequestInit = {}): Promise<any> {
  const res = await fetch(`${HUB_URL}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${HUB_SECRET}`,
      ...opts.headers
    }
  })
  return res.json()
}

const server = new McpServer({
  name: 'agentorch',
  version: '1.0.0'
})

server.tool(
  'send_message',
  'Send a message to another agent in the workspace. The message will be queued and the target agent will receive it when they call get_messages().',
  {
    to: z.string().describe('Name of the target agent'),
    message: z.string().describe('The message to send')
  },
  async ({ to, message }) => {
    const result = await hubFetch('/messages/send', {
      method: 'POST',
      body: JSON.stringify({ from: AGENT_NAME, to, message })
    })
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
  }
)

server.tool(
  'get_messages',
  'Check for messages sent to you by other agents. Returns all queued messages and clears the queue. Call this after completing each task to check for new work.',
  {},
  async () => {
    const messages = await hubFetch(`/messages/${AGENT_NAME}`)
    if (messages.length === 0) {
      return { content: [{ type: 'text', text: 'No new messages.' }] }
    }
    return { content: [{ type: 'text', text: JSON.stringify(messages, null, 2) }] }
  }
)

server.tool(
  'get_agents',
  'List all agents in the workspace with their names, roles, CLI types, CEO notes, and current status.',
  {},
  async () => {
    const agents = await hubFetch('/agents')
    return { content: [{ type: 'text', text: JSON.stringify(agents, null, 2) }] }
  }
)

server.tool(
  'read_ceo_notes',
  'Re-read your CEO notes and role description. Useful for re-grounding after /clear or when you need to recall your instructions.',
  {},
  async () => {
    const notes = await hubFetch(`/agents/${AGENT_NAME}/ceo-notes`)
    return { content: [{ type: 'text', text: JSON.stringify(notes, null, 2) }] }
  }
)

server.tool(
  'get_agent_output',
  'Peek at another agent\'s recent terminal output. Useful for checking what an agent is doing without messaging them.',
  {
    agent: z.string().describe('Name of the target agent'),
    lines: z.number().optional().default(50).describe('Number of lines to retrieve (default 50, max 1000)')
  },
  async ({ agent, lines }) => {
    const result = await hubFetch(`/agents/${encodeURIComponent(agent)}/output?lines=${lines}`)
    if (result.error) {
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
    }
    return { content: [{ type: 'text', text: result.lines.join('\n') }] }
  }
)

server.tool(
  'post_task',
  'Post a task to the shared pinboard for other agents to pick up.',
  {
    title: z.string().describe('Short title for the task'),
    description: z.string().describe('Detailed description of what needs to be done'),
    priority: z.enum(['low', 'medium', 'high']).optional().default('medium').describe('Task priority (default: medium)')
  },
  async ({ title, description, priority }) => {
    const result = await hubFetch('/pinboard/tasks', {
      method: 'POST',
      body: JSON.stringify({ title, description, priority, from: AGENT_NAME })
    })
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
  }
)

server.tool(
  'read_tasks',
  'List all tasks on the shared pinboard. Shows id, title, description, priority, status, claimedBy, result, and createdAt.',
  {},
  async () => {
    const tasks = await hubFetch('/pinboard/tasks')
    if (tasks.length === 0) {
      return { content: [{ type: 'text', text: 'No tasks on the pinboard.' }] }
    }
    return { content: [{ type: 'text', text: JSON.stringify(tasks, null, 2) }] }
  }
)

server.tool(
  'claim_task',
  'Claim an open task from the pinboard. Prevents double-pickup — fails if already claimed by another agent.',
  {
    task_id: z.string().describe('ID of the task to claim')
  },
  async ({ task_id }) => {
    const result = await hubFetch(`/pinboard/tasks/${task_id}/claim`, {
      method: 'POST',
      body: JSON.stringify({ from: AGENT_NAME })
    })
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
  }
)

server.tool(
  'complete_task',
  'Mark a claimed task as completed. Only the agent who claimed the task can complete it.',
  {
    task_id: z.string().describe('ID of the task to complete'),
    result: z.string().optional().describe('Optional result or summary of the work done')
  },
  async ({ task_id, result }) => {
    const res = await hubFetch(`/pinboard/tasks/${task_id}/complete`, {
      method: 'POST',
      body: JSON.stringify({ from: AGENT_NAME, result })
    })
    return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }] }
  }
)

server.tool(
  'broadcast',
  'Send a message to ALL other agents in the workspace at once (except yourself).',
  {
    message: z.string().describe('The message to broadcast')
  },
  async ({ message }) => {
    const result = await hubFetch('/messages/broadcast', {
      method: 'POST',
      body: JSON.stringify({ from: AGENT_NAME, message })
    })
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
  }
)

server.tool(
  'post_info',
  'Post a research note or finding to the shared info channel. Other agents can read it with read_info().',
  {
    note: z.string().describe('The research note or finding to post'),
    tags: z.array(z.string()).optional().describe('Optional tags to categorize the note')
  },
  async ({ note, tags }) => {
    const result = await hubFetch('/info', {
      method: 'POST',
      body: JSON.stringify({ from: AGENT_NAME, note, tags })
    })
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
  }
)

server.tool(
  'read_info',
  'Read all notes from the shared info channel, optionally filtered by tags. Use this to access research findings and shared knowledge.',
  {
    tags: z.array(z.string()).optional().describe('Optional tags to filter by (matches ANY tag)')
  },
  async ({ tags }) => {
    const queryParams = tags && tags.length > 0 ? `?tags=${encodeURIComponent(tags.join(','))}` : ''
    const result = await hubFetch(`/info${queryParams}`)
    if (result.length === 0) {
      return { content: [{ type: 'text', text: 'No info entries found.' }] }
    }
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
  }
)

async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
}

main().catch((err) => {
  console.error('MCP server failed to start:', err)
  process.exit(1)
})
