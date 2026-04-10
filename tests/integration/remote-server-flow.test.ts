import { describe, it, expect, vi } from 'vitest'
import request from 'supertest'
import { TokenManager } from '../../src/main/remote/token-manager'
import { RemoteServer } from '../../src/main/remote/remote-server'

describe('Remote server end-to-end flow', () => {
  it('full lifecycle: enable, fetch state, send message, post task, kill sessions', async () => {
    const sentMessages: Array<{ to: string; text: string }> = []
    const postedTasks: Array<{ title: string; description: string; priority: string }> = []
    const tm = new TokenManager()

    const deps = {
      tokenManager: tm,
      getProjectName: () => 'IntegrationTest',
      getAgents: () => [
        { id: 'a1', name: 'Orchestrator', cli: 'claude', model: 'sonnet', role: 'orchestrator', status: 'idle' }
      ],
      getSchedules: () => [],
      getPinboardTasks: () => postedTasks.map((t, i) => ({
        id: `t${i}`, title: t.title, priority: t.priority, status: 'open', claimedBy: null
      })),
      getAgentOutput: (_id: string) => ['line1', 'line2'],
      sendMessage: (to: string, text: string) => { sentMessages.push({ to, text }) },
      pauseSchedule: vi.fn(),
      resumeSchedule: vi.fn(),
      restartSchedule: vi.fn(),
      postTask: (title: string, description: string, priority: 'low' | 'medium' | 'high') => {
        postedTasks.push({ title, description, priority })
        return { id: `t${postedTasks.length - 1}`, title, priority }
      }
    }

    const server = new RemoteServer(deps)
    const app = server.getApp()

    // 1. Generate token (simulating user toggling enable)
    const token = tm.generate()
    expect(tm.getCurrentToken()).toBe(token)

    // 2. Phone fetches the HTML page
    const html = await request(app).get(`/r/${token}/`).expect(200)
    expect(html.text).toContain(token)

    // 3. Phone fetches state
    const state1 = await request(app).get(`/r/${token}/state`).expect(200)
    expect(state1.body.projectName).toBe('IntegrationTest')
    expect(state1.body.agents).toHaveLength(1)
    expect(state1.body.connectionCount).toBeGreaterThanOrEqual(1)

    // 4. Phone sends a message to the orchestrator
    await request(app)
      .post(`/r/${token}/message`)
      .send({ to: 'Orchestrator', text: 'keep going' })
      .expect(200)
    expect(sentMessages).toEqual([{ to: 'Orchestrator', text: 'keep going' }])

    // 5. Phone posts a new task
    await request(app)
      .post(`/r/${token}/task`)
      .send({ title: 'Fix bug', description: 'Login broken', priority: 'high' })
      .expect(200)
    expect(postedTasks).toEqual([{ title: 'Fix bug', description: 'Login broken', priority: 'high' }])

    // 6. Phone fetches state again — should now show the new task
    const state2 = await request(app).get(`/r/${token}/state`).expect(200)
    expect(state2.body.pinboardTasks).toHaveLength(1)
    expect(state2.body.pinboardTasks[0].title).toBe('Fix bug')

    // 7. Phone fetches an agent's output
    const output = await request(app).get(`/r/${token}/agent/a1/output`).expect(200)
    expect(output.body.lines).toEqual(['line1', 'line2'])

    // 8. User clicks "Kill all sessions" — token rotates
    tm.killAllSessions()
    expect(tm.getCurrentToken()).not.toBe(token)
    expect(tm.isValid(token)).toBe(false)

    // 9. Phone tries to use the old token — gets 404
    await request(app).get(`/r/${token}/state`).expect(404)
  })
})
