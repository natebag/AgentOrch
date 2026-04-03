import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createHubServer, HubServer } from '../../src/main/hub/server'

let hub: HubServer

beforeAll(async () => {
  hub = await createHubServer()
})

afterAll(() => {
  hub.close()
})

async function api(path: string, opts: RequestInit = {}) {
  const res = await fetch(`http://127.0.0.1:${hub.port}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${hub.secret}`,
      ...opts.headers
    }
  })
  return { status: res.status, body: await res.json() }
}

describe('Hub HTTP Server', () => {
  it('rejects requests without auth', async () => {
    const res = await fetch(`http://127.0.0.1:${hub.port}/agents`, {
      headers: { 'Content-Type': 'application/json' }
    })
    expect(res.status).toBe(401)
  })

  it('registers an agent and lists it (ceoNotes stripped)', async () => {
    const reg = await api('/agents/register', {
      method: 'POST',
      body: JSON.stringify({
        id: 'a1', name: 'orchestrator', cli: 'claude',
        cwd: '/tmp', role: 'Coordinator', ceoNotes: 'You lead.', shell: 'powershell', admin: false, autoMode: false
      })
    })
    expect(reg.status).toBe(200)
    expect(reg.body.name).toBe('orchestrator')

    const list = await api('/agents')
    expect(list.body).toHaveLength(1)
    expect(list.body[0].name).toBe('orchestrator')
    // ceoNotes should be stripped from the list endpoint
    expect(list.body[0].ceoNotes).toBeUndefined()
  })

  it('upserts on duplicate registration instead of throwing', async () => {
    // Re-register the same agent with updated role
    const reg = await api('/agents/register', {
      method: 'POST',
      body: JSON.stringify({
        id: 'a1', name: 'orchestrator', cli: 'claude',
        cwd: '/tmp', role: 'Lead Coordinator', ceoNotes: 'Updated.', shell: 'powershell', admin: false, autoMode: false
      })
    })
    expect(reg.status).toBe(200)
    expect(reg.body.role).toBe('Lead Coordinator')

    // Should still be just 1 agent, not 2
    const list = await api('/agents')
    expect(list.body).toHaveLength(1)
  })

  it('sends and retrieves messages (legacy consume-on-read)', async () => {
    await api('/agents/register', {
      method: 'POST',
      body: JSON.stringify({
        id: 'a2', name: 'worker-1', cli: 'claude',
        cwd: '/tmp', role: 'Worker', ceoNotes: 'Do tasks.', shell: 'powershell', admin: false, autoMode: false
      })
    })

    const send = await api('/messages/send', {
      method: 'POST',
      body: JSON.stringify({ from: 'orchestrator', to: 'worker-1', message: 'do the thing' })
    })
    expect(send.body.status).toBe('delivered')

    // Default peek=false consumes the queue
    const get = await api('/messages/worker-1')
    expect(get.body).toHaveLength(1)
    expect(get.body[0].message).toBe('do the thing')

    const get2 = await api('/messages/worker-1')
    expect(get2.body).toHaveLength(0)
  })

  it('peek mode returns messages without clearing queue', async () => {
    await api('/messages/send', {
      method: 'POST',
      body: JSON.stringify({ from: 'orchestrator', to: 'worker-1', message: 'peek test' })
    })

    // Peek: messages stay in queue
    const peek1 = await api('/messages/worker-1?peek=true')
    expect(peek1.body).toHaveLength(1)
    expect(peek1.body[0].message).toBe('peek test')

    // Second peek: still there
    const peek2 = await api('/messages/worker-1?peek=true')
    expect(peek2.body).toHaveLength(1)

    // Ack: remove the message
    const ack = await api('/messages/worker-1/ack', {
      method: 'POST',
      body: JSON.stringify({ messageIds: [peek2.body[0].id] })
    })
    expect(ack.body.acknowledged).toBe(1)

    // Queue is now empty
    const get3 = await api('/messages/worker-1?peek=true')
    expect(get3.body).toHaveLength(0)
  })

  it('returns CEO notes for an agent', async () => {
    const notes = await api('/agents/orchestrator/ceo-notes')
    // After upsert test, ceoNotes was updated to 'Updated.'
    expect(notes.body.ceoNotes).toBe('Updated.')
  })

  it('broadcasts message to all agents except sender', async () => {
    // Register additional agents for broadcast test
    await api('/agents/register', {
      method: 'POST',
      body: JSON.stringify({
        id: 'a3', name: 'worker-2', cli: 'claude',
        cwd: '/tmp', role: 'Worker', ceoNotes: 'Do tasks.', shell: 'powershell', admin: false, autoMode: false
      })
    })
    await api('/agents/register', {
      method: 'POST',
      body: JSON.stringify({
        id: 'a4', name: 'worker-3', cli: 'claude',
        cwd: '/tmp', role: 'Worker', ceoNotes: 'Do tasks.', shell: 'powershell', admin: false, autoMode: false
      })
    })

    const broadcast = await api('/messages/broadcast', {
      method: 'POST',
      body: JSON.stringify({ from: 'orchestrator', message: 'all hands meeting now' })
    })
    expect(broadcast.status).toBe(200)
    expect(broadcast.body.delivered).toBe(3) // worker-1, worker-2, worker-3
    expect(broadcast.body.failed).toEqual([])

    // Verify each worker received the message
    const w1 = await api('/messages/worker-1')
    expect(w1.body).toHaveLength(1)
    expect(w1.body[0].message).toBe('all hands meeting now')
    expect(w1.body[0].from).toBe('orchestrator')

    const w2 = await api('/messages/worker-2')
    expect(w2.body).toHaveLength(1)
    expect(w2.body[0].message).toBe('all hands meeting now')

    const w3 = await api('/messages/worker-3')
    expect(w3.body).toHaveLength(1)
    expect(w3.body[0].message).toBe('all hands meeting now')

    // Verify orchestrator did NOT receive the message (excluded from broadcast)
    const orch = await api('/messages/orchestrator')
    expect(orch.body).toHaveLength(0)
  })

  it('returns 404 for output of unknown agent', async () => {
    const res = await api('/agents/nonexistent/output')
    expect(res.status).toBe(404)
    expect(res.body.error).toContain('not found')
  })

  it('returns 503 when no output accessor is set', async () => {
    // At this point no accessor has been wired up — should return 503
    const res = await api('/agents/orchestrator/output')
    expect(res.status).toBe(503)
    expect(res.body.error).toContain('Output not available')
  })

  it('returns output lines when accessor is set', async () => {
    // Wire up a mock output accessor
    hub.setOutputAccessor((agentName, lines) => {
      if (agentName === 'orchestrator') {
        const allLines = ['line 1', 'line 2', 'line 3', 'line 4', 'line 5']
        return allLines.slice(-lines)
      }
      return null
    })

    // Default 50 lines (returns all 5 since buffer only has 5)
    const res = await api('/agents/orchestrator/output')
    expect(res.status).toBe(200)
    expect(res.body.lines).toEqual(['line 1', 'line 2', 'line 3', 'line 4', 'line 5'])
    expect(res.body.count).toBe(5)

    // Request specific line count
    const res2 = await api('/agents/orchestrator/output?lines=3')
    expect(res2.status).toBe(200)
    expect(res2.body.lines).toEqual(['line 3', 'line 4', 'line 5'])
    expect(res2.body.count).toBe(3)
  })

  it('returns 404 when agent exists but has no output buffer', async () => {
    // worker-2 exists in registry but accessor returns null for it
    hub.setOutputAccessor((_agentName, _lines) => null)

    const res = await api('/agents/worker-2/output')
    expect(res.status).toBe(404)
    expect(res.body.error).toContain('No output buffer')
  })
})

describe('Pinboard API', () => {
  it('posts and reads tasks', async () => {
    const post = await api('/pinboard/tasks', {
      method: 'POST',
      body: JSON.stringify({ title: 'Fix tests', description: 'Unit tests are failing', priority: 'high' })
    })
    expect(post.status).toBe(200)
    expect(post.body.id).toBeTruthy()
    expect(post.body.title).toBe('Fix tests')

    const list = await api('/pinboard/tasks')
    expect(list.status).toBe(200)
    expect(list.body.length).toBeGreaterThanOrEqual(1)
    const task = list.body.find((t: any) => t.title === 'Fix tests')
    expect(task).toBeTruthy()
    expect(task.status).toBe('open')
    expect(task.priority).toBe('high')
  })

  it('rejects post without title', async () => {
    const res = await api('/pinboard/tasks', {
      method: 'POST',
      body: JSON.stringify({ description: 'No title' })
    })
    expect(res.status).toBe(400)
  })

  it('claims and completes a task', async () => {
    const post = await api('/pinboard/tasks', {
      method: 'POST',
      body: JSON.stringify({ title: 'Deploy', description: 'Deploy to prod' })
    })
    const taskId = post.body.id

    const claim = await api(`/pinboard/tasks/${taskId}/claim`, {
      method: 'POST',
      body: JSON.stringify({ from: 'worker-1' })
    })
    expect(claim.status).toBe(200)
    expect(claim.body.status).toBe('ok')

    // Double-claim should fail
    const claim2 = await api(`/pinboard/tasks/${taskId}/claim`, {
      method: 'POST',
      body: JSON.stringify({ from: 'worker-2' })
    })
    expect(claim2.status).toBe(409)

    // Non-claimer can't complete
    const badComplete = await api(`/pinboard/tasks/${taskId}/complete`, {
      method: 'POST',
      body: JSON.stringify({ from: 'worker-2' })
    })
    expect(badComplete.status).toBe(409)

    // Claimer completes
    const complete = await api(`/pinboard/tasks/${taskId}/complete`, {
      method: 'POST',
      body: JSON.stringify({ from: 'worker-1', result: 'Deployed successfully' })
    })
    expect(complete.status).toBe(200)
    expect(complete.body.status).toBe('ok')

    // Verify task state
    const list = await api('/pinboard/tasks')
    const task = list.body.find((t: any) => t.id === taskId)
    expect(task.status).toBe('completed')
    expect(task.result).toBe('Deployed successfully')
    expect(task.claimedBy).toBe('worker-1')
  })

  it('tracks createdBy when posting a task', async () => {
    const post = await api('/pinboard/tasks', {
      method: 'POST',
      body: JSON.stringify({ title: 'Created by test', description: 'Testing createdBy', from: 'orchestrator' })
    })
    expect(post.status).toBe(200)
    expect(post.body.createdBy).toBe('orchestrator')

    const list = await api('/pinboard/tasks')
    const task = list.body.find((t: any) => t.title === 'Created by test')
    expect(task.createdBy).toBe('orchestrator')
  })

  it('gets a single task by ID', async () => {
    const post = await api('/pinboard/tasks', {
      method: 'POST',
      body: JSON.stringify({ title: 'Single fetch', description: 'Get by ID test' })
    })
    const taskId = post.body.id

    const get = await api(`/pinboard/tasks/${taskId}`)
    expect(get.status).toBe(200)
    expect(get.body.title).toBe('Single fetch')
    expect(get.body.id).toBe(taskId)
  })

  it('returns 404 for unknown task ID', async () => {
    const get = await api('/pinboard/tasks/nonexistent-id')
    expect(get.status).toBe(404)
  })

  it('abandons a claimed task', async () => {
    const post = await api('/pinboard/tasks', {
      method: 'POST',
      body: JSON.stringify({ title: 'Abandon test', description: 'Will be abandoned' })
    })
    const taskId = post.body.id

    // Claim it
    await api(`/pinboard/tasks/${taskId}/claim`, {
      method: 'POST',
      body: JSON.stringify({ from: 'worker-1' })
    })

    // Abandon it
    const abandon = await api(`/pinboard/tasks/${taskId}/abandon`, {
      method: 'POST',
      body: JSON.stringify({})
    })
    expect(abandon.status).toBe(200)
    expect(abandon.body.status).toBe('ok')

    // Task is now open again
    const task = await api(`/pinboard/tasks/${taskId}`)
    expect(task.body.status).toBe('open')
    expect(task.body.claimedBy).toBeNull()

    // Another agent can claim it
    const reclaim = await api(`/pinboard/tasks/${taskId}/claim`, {
      method: 'POST',
      body: JSON.stringify({ from: 'worker-2' })
    })
    expect(reclaim.status).toBe(200)
  })

  it('rejects abandoning an unclaimed task', async () => {
    const post = await api('/pinboard/tasks', {
      method: 'POST',
      body: JSON.stringify({ title: 'Never claimed', description: 'Open task' })
    })
    const abandon = await api(`/pinboard/tasks/${post.body.id}/abandon`, {
      method: 'POST',
      body: JSON.stringify({})
    })
    expect(abandon.status).toBe(409)
  })
})

describe('Info Channel API', () => {
  it('posts and reads info entries', async () => {
    const post = await api('/info', {
      method: 'POST',
      body: JSON.stringify({ from: 'agent-1', note: 'Research finding A', tags: ['research', 'alpha'] })
    })
    expect(post.status).toBe(200)
    expect(post.body.id).toBeTruthy()
    expect(post.body.note).toBe('Research finding A')
    expect(post.body.tags).toEqual(['research', 'alpha'])
    expect(post.body.from).toBe('agent-1')

    const list = await api('/info')
    expect(list.status).toBe(200)
    expect(list.body.length).toBeGreaterThanOrEqual(1)
    const entry = list.body.find((e: any) => e.note === 'Research finding A')
    expect(entry).toBeTruthy()
  })

  it('rejects post without from or note', async () => {
    const res1 = await api('/info', {
      method: 'POST',
      body: JSON.stringify({ note: 'No from' })
    })
    expect(res1.status).toBe(400)

    const res2 = await api('/info', {
      method: 'POST',
      body: JSON.stringify({ from: 'agent-1' })
    })
    expect(res2.status).toBe(400)
  })

  it('reads info filtered by tags', async () => {
    // Post entries with different tags
    await api('/info', {
      method: 'POST',
      body: JSON.stringify({ from: 'agent-1', note: 'Bug fix 1', tags: ['bug'] })
    })
    await api('/info', {
      method: 'POST',
      body: JSON.stringify({ from: 'agent-2', note: 'Research 1', tags: ['research'] })
    })
    await api('/info', {
      method: 'POST',
      body: JSON.stringify({ from: 'agent-3', note: 'Bug fix 2', tags: ['bug'] })
    })

    // Filter by 'bug' tag
    const bugEntries = await api('/info?tags=bug')
    expect(bugEntries.status).toBe(200)
    expect(bugEntries.body.every((e: any) => e.tags.includes('bug'))).toBe(true)
    expect(bugEntries.body.some((e: any) => e.note === 'Bug fix 1')).toBe(true)
    expect(bugEntries.body.some((e: any) => e.note === 'Bug fix 2')).toBe(true)

    // Filter by 'research' tag
    const researchEntries = await api('/info?tags=research')
    expect(researchEntries.status).toBe(200)
    expect(researchEntries.body.every((e: any) => e.tags.includes('research'))).toBe(true)
    expect(researchEntries.body.some((e: any) => e.note === 'Research 1')).toBe(true)

    // Filter by multiple tags (matches ANY)
    const multiEntries = await api('/info?tags=bug,research')
    expect(multiEntries.status).toBe(200)
    expect(multiEntries.body.length).toBeGreaterThanOrEqual(3)
  })
})
