import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { MessageRouter } from '../../src/main/hub/message-router'
import { AgentRegistry } from '../../src/main/hub/agent-registry'
import type { AgentConfig } from '../../src/shared/types'

const makeConfig = (name: string): AgentConfig => ({
  id: `id-${name}`,
  name,
  cli: 'claude',
  cwd: '/tmp',
  role: 'Test',
  ceoNotes: '',
  shell: 'powershell' as const,
  admin: false,
  autoMode: false
})

describe('MessageRouter', () => {
  let registry: AgentRegistry
  let router: MessageRouter

  beforeEach(() => {
    registry = new AgentRegistry()
    router = new MessageRouter(registry)
    registry.register(makeConfig('orchestrator'))
    registry.register(makeConfig('worker-1'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('delivers a message to an existing agent', () => {
    const result = router.send('orchestrator', 'worker-1', 'do the thing')
    expect(result.status).toBe('delivered')
  })

  it('returns error for nonexistent target', () => {
    const result = router.send('orchestrator', 'ghost', 'hello')
    expect(result.status).toBe('error')
    expect(result.detail).toContain('not found')
  })

  it('queues message for disconnected agent', () => {
    registry.updateStatus('worker-1', 'disconnected')
    const result = router.send('orchestrator', 'worker-1', 'hello')
    expect(result.status).toBe('queued')
    expect(result.detail).toContain('offline')
  })

  it('retrieves messages (destructive read)', () => {
    router.send('orchestrator', 'worker-1', 'task 1')
    router.send('orchestrator', 'worker-1', 'task 2')

    const messages = router.getMessages('worker-1')
    expect(messages).toHaveLength(2)
    expect(messages[0].message).toBe('task 1')
    expect(messages[0].from).toBe('orchestrator')
    expect(messages[1].message).toBe('task 2')

    expect(router.getMessages('worker-1')).toHaveLength(0)
  })

  it('enforces max message size (10KB)', () => {
    const bigMsg = 'x'.repeat(11_000)
    const result = router.send('orchestrator', 'worker-1', bigMsg)
    expect(result.status).toBe('error')
    expect(result.detail).toContain('size')
  })

  it('enforces max queue depth (100), dropping oldest', () => {
    for (let i = 0; i < 105; i++) {
      router.send(`sender-${i}`, 'worker-1', `msg-${i}`)
    }
    const messages = router.getMessages('worker-1')
    expect(messages).toHaveLength(100)
    expect(messages[0].message).toBe('msg-5')
  })

  it('allows up to 10 messages per sender per minute', () => {
    vi.useFakeTimers()

    for (let i = 0; i < 10; i++) {
      const result = router.send('orchestrator', 'worker-1', `msg-${i}`)
      expect(result.status).toBe('delivered')
    }
  })

  it('rejects the 31st message within 60 seconds', () => {
    vi.useFakeTimers()

    for (let i = 0; i < 30; i++) {
      router.send('orchestrator', 'worker-1', `msg-${i}`)
    }

    const result = router.send('orchestrator', 'worker-1', 'msg-30')
    expect(result).toEqual({
      status: 'error',
      detail: 'Rate limit exceeded. Max 30 messages per minute.'
    })
  })

  it('resets the sender rate limit after 60 seconds', () => {
    vi.useFakeTimers()

    for (let i = 0; i < 30; i++) {
      router.send('orchestrator', 'worker-1', `msg-${i}`)
    }

    vi.advanceTimersByTime(60_001)

    const result = router.send('orchestrator', 'worker-1', 'msg-after-reset')
    expect(result.status).toBe('delivered')
  })

  it('clearAgent also clears rate limit timestamps', () => {
    vi.useFakeTimers()

    for (let i = 0; i < 30; i++) {
      router.send('orchestrator', 'worker-1', `msg-${i}`)
    }

    // Orchestrator is now rate-limited
    expect(router.send('orchestrator', 'worker-1', 'blocked').status).toBe('error')

    // Clear orchestrator's state (queues + rate limits)
    router.clearAgent('orchestrator')

    // Rate limit should be reset
    const result = router.send('orchestrator', 'worker-1', 'after-clear')
    expect(result.status).toBe('delivered')
  })

  it('broadcasts to all agents except sender', () => {
    registry.register(makeConfig('worker-2'))
    registry.register(makeConfig('worker-3'))

    const result = router.broadcast('orchestrator', 'team update')
    expect(result.delivered).toBe(3)
    expect(result.failed).toEqual([])
    expect(result.error).toBeUndefined()

    expect(router.getMessages('worker-1')).toHaveLength(1)
    expect(router.getMessages('worker-2')).toHaveLength(1)
    expect(router.getMessages('worker-3')).toHaveLength(1)
    expect(router.getMessages('orchestrator')).toHaveLength(0)
  })

  it('broadcast counts as one rate-limited action', () => {
    vi.useFakeTimers()
    registry.register(makeConfig('worker-2'))

    // 29 direct sends + 1 broadcast = 30 actions, all should succeed
    for (let i = 0; i < 29; i++) {
      router.send('orchestrator', 'worker-1', `msg-${i}`)
    }
    const result = router.broadcast('orchestrator', 'broadcast msg')
    expect(result.delivered).toBe(2)
    expect(result.error).toBeUndefined()

    // 31st action should be rate-limited
    const blocked = router.send('orchestrator', 'worker-1', 'blocked')
    expect(blocked.status).toBe('error')
  })

  it('broadcast returns error when rate-limited', () => {
    vi.useFakeTimers()

    for (let i = 0; i < 30; i++) {
      router.send('orchestrator', 'worker-1', `msg-${i}`)
    }

    const result = router.broadcast('orchestrator', 'should fail')
    expect(result.delivered).toBe(0)
    expect(result.failed).toEqual([])
    expect(result.error).toContain('Rate limit exceeded')
  })
})
