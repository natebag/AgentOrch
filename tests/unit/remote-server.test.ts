import { describe, it, expect, vi } from 'vitest'
import request from 'supertest'
import { TokenManager } from '../../src/main/remote/token-manager'
import { RemoteServer, type RemoteServerDeps } from '../../src/main/remote/remote-server'

function makeDeps(overrides: Partial<RemoteServerDeps> = {}): RemoteServerDeps {
  return {
    tokenManager: new TokenManager(() => 1_000_000),
    getProjectName: () => 'TestProject',
    getAgents: () => [],
    getSchedules: () => [],
    getPinboardTasks: () => [],
    getBuddyRoom: () => [],
    getAgentOutput: () => [],
    sendMessage: vi.fn(),
    pauseSchedule: vi.fn(),
    resumeSchedule: vi.fn(),
    restartSchedule: vi.fn(),
    postTask: vi.fn(),
    ...overrides
  }
}

describe('RemoteServer auth middleware', () => {
  it('returns 404 when token is missing or invalid', async () => {
    const deps = makeDeps()
    const server = new RemoteServer(deps)
    const app = server.getApp()

    await request(app).get('/r/wrong-token/state').expect(404)
    await request(app).get('/r//state').expect(404)
  })

  it('returns 200 when token is valid', async () => {
    const deps = makeDeps()
    const token = deps.tokenManager.generate()
    const server = new RemoteServer(deps)
    const app = server.getApp()

    const res = await request(app).get(`/r/${token}/state`)
    expect(res.status).toBe(200)
  })

  it('returns 404 when token has expired', async () => {
    let now = 1_000_000
    const tm = new TokenManager(() => now)
    const token = tm.generate()
    const deps = makeDeps({ tokenManager: tm })
    const server = new RemoteServer(deps)
    const app = server.getApp()

    now += 9 * 60 * 60 * 1000  // 9 hours
    await request(app).get(`/r/${token}/state`).expect(404)
  })

  it('valid request bumps token activity', async () => {
    const deps = makeDeps()
    const token = deps.tokenManager.generate()
    const server = new RemoteServer(deps)
    const bumpSpy = vi.spyOn(deps.tokenManager, 'bumpActivity')
    await request(server.getApp()).get(`/r/${token}/state`).expect(200)
    expect(bumpSpy).toHaveBeenCalled()
  })

  it('valid request tracks the session by IP', async () => {
    const deps = makeDeps()
    const token = deps.tokenManager.generate()
    const server = new RemoteServer(deps)
    const trackSpy = vi.spyOn(deps.tokenManager, 'trackSession')
    await request(server.getApp()).get(`/r/${token}/state`).expect(200)
    expect(trackSpy).toHaveBeenCalled()
  })
})

describe('RemoteServer GET /r/:token/', () => {
  it('serves the static index.html with the token embedded', async () => {
    const deps = makeDeps()
    const token = deps.tokenManager.generate()
    const server = new RemoteServer(deps)
    const res = await request(server.getApp()).get(`/r/${token}/`)
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toMatch(/text\/html/)
    expect(res.text).toContain('AgentOrch Remote')
    expect(res.text).toContain(token)
  })
})
