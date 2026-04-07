import { describe, it, expect } from 'vitest'
import {
  computeNextFireAt,
  computeExpiresAt,
  isExpired,
  shouldFire,
  applyFire,
  applyPause,
  applyResume,
  applyRestart,
  applyStop,
  trimFireHistory,
  HISTORY_MAX
} from '../../src/main/scheduler/scheduler-helpers'
import type { ScheduledPrompt } from '../../src/shared/types'

const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS

function makeActive(overrides: Partial<ScheduledPrompt> = {}): ScheduledPrompt {
  const startedAt = 1_000_000
  return {
    id: 'test-id',
    tabId: 'tab-default',
    agentId: 'agent-1',
    name: 'Test',
    promptText: 'keep going',
    intervalMinutes: 45,
    durationHours: 8,
    startedAt,
    expiresAt: startedAt + 8 * HOUR_MS,
    nextFireAt: startedAt + 45 * MINUTE_MS,
    pausedAt: null,
    status: 'active',
    fireHistory: [],
    ...overrides
  }
}

describe('computeNextFireAt', () => {
  it('adds interval in minutes to the given base time', () => {
    expect(computeNextFireAt(1000, 45)).toBe(1000 + 45 * MINUTE_MS)
  })
})

describe('computeExpiresAt', () => {
  it('returns null when durationHours is null', () => {
    expect(computeExpiresAt(1000, null)).toBeNull()
  })

  it('returns startedAt + duration when hours provided', () => {
    expect(computeExpiresAt(1000, 8)).toBe(1000 + 8 * HOUR_MS)
  })
})

describe('isExpired', () => {
  it('returns false for infinite schedules regardless of time', () => {
    const s = makeActive({ expiresAt: null })
    expect(isExpired(s, 1_000_000_000_000)).toBe(false)
  })

  it('returns false when now < expiresAt', () => {
    const s = makeActive()
    expect(isExpired(s, s.expiresAt! - 1)).toBe(false)
  })

  it('returns true when now >= expiresAt', () => {
    const s = makeActive()
    expect(isExpired(s, s.expiresAt!)).toBe(true)
    expect(isExpired(s, s.expiresAt! + 1)).toBe(true)
  })
})

describe('shouldFire', () => {
  it('returns false for inactive schedules', () => {
    const s = makeActive({ status: 'paused' })
    expect(shouldFire(s, s.nextFireAt + 1)).toBe(false)
  })

  it('returns false when now < nextFireAt', () => {
    const s = makeActive()
    expect(shouldFire(s, s.nextFireAt - 1)).toBe(false)
  })

  it('returns true when now >= nextFireAt', () => {
    const s = makeActive()
    expect(shouldFire(s, s.nextFireAt)).toBe(true)
  })
})

describe('applyFire', () => {
  it('appends history entry and advances nextFireAt by interval', () => {
    const s = makeActive()
    const now = s.nextFireAt
    const result = applyFire(s, now, 'fired')
    expect(result.fireHistory).toHaveLength(1)
    expect(result.fireHistory[0]).toEqual({ timestamp: now, outcome: 'fired' })
    expect(result.nextFireAt).toBe(now + 45 * MINUTE_MS)
  })

  it('records skipped_offline outcome', () => {
    const s = makeActive()
    const result = applyFire(s, s.nextFireAt, 'skipped_offline')
    expect(result.fireHistory[0].outcome).toBe('skipped_offline')
  })

  it('does not mutate the input schedule', () => {
    const s = makeActive()
    const originalHistory = s.fireHistory
    applyFire(s, s.nextFireAt, 'fired')
    expect(s.fireHistory).toBe(originalHistory)
    expect(s.fireHistory).toHaveLength(0)
  })
})

describe('trimFireHistory', () => {
  it('keeps only the last HISTORY_MAX entries', () => {
    const entries = Array.from({ length: HISTORY_MAX + 5 }, (_, i) => ({
      timestamp: i,
      outcome: 'fired' as const
    }))
    const trimmed = trimFireHistory(entries)
    expect(trimmed).toHaveLength(HISTORY_MAX)
    expect(trimmed[0].timestamp).toBe(5) // oldest 5 dropped
    expect(trimmed[HISTORY_MAX - 1].timestamp).toBe(HISTORY_MAX + 4)
  })

  it('leaves arrays under the cap alone', () => {
    const entries = [{ timestamp: 1, outcome: 'fired' as const }]
    expect(trimFireHistory(entries)).toEqual(entries)
  })
})

describe('applyFire with many fires', () => {
  it('trims history to HISTORY_MAX entries automatically', () => {
    let s = makeActive()
    for (let i = 0; i < HISTORY_MAX + 5; i++) {
      s = applyFire(s, s.nextFireAt, 'fired')
    }
    expect(s.fireHistory).toHaveLength(HISTORY_MAX)
  })
})

describe('applyPause', () => {
  it('sets status to paused and records pausedAt', () => {
    const s = makeActive()
    const now = s.startedAt + 20 * MINUTE_MS
    const result = applyPause(s, now)
    expect(result.status).toBe('paused')
    expect(result.pausedAt).toBe(now)
  })
})

describe('applyResume', () => {
  it('shifts nextFireAt and expiresAt forward by the pause duration', () => {
    const paused: ScheduledPrompt = {
      ...makeActive(),
      status: 'paused',
      pausedAt: 1_001_000
    }
    const shift = 10 * MINUTE_MS
    const now = paused.pausedAt! + shift
    const result = applyResume(paused, now)
    expect(result.status).toBe('active')
    expect(result.pausedAt).toBeNull()
    expect(result.nextFireAt).toBe(makeActive().nextFireAt + shift)
    expect(result.expiresAt).toBe(makeActive().expiresAt! + shift)
  })

  it('does not shift expiresAt when infinite', () => {
    const paused: ScheduledPrompt = {
      ...makeActive({ expiresAt: null, durationHours: null }),
      status: 'paused',
      pausedAt: 1_001_000
    }
    const result = applyResume(paused, paused.pausedAt! + 10 * MINUTE_MS)
    expect(result.expiresAt).toBeNull()
  })
})

describe('applyStop', () => {
  it('sets status to stopped', () => {
    const s = makeActive()
    const result = applyStop(s)
    expect(result.status).toBe('stopped')
  })
})

describe('applyRestart', () => {
  it('resets startedAt, expiresAt, nextFireAt, status, and clears history', () => {
    const expired: ScheduledPrompt = {
      ...makeActive(),
      status: 'expired',
      fireHistory: [{ timestamp: 5, outcome: 'fired' }]
    }
    const now = 9_000_000
    const result = applyRestart(expired, now)
    expect(result.status).toBe('active')
    expect(result.startedAt).toBe(now)
    expect(result.nextFireAt).toBe(now + 45 * MINUTE_MS)
    expect(result.expiresAt).toBe(now + 8 * HOUR_MS)
    expect(result.pausedAt).toBeNull()
    expect(result.fireHistory).toEqual([])
  })

  it('handles infinite duration restart', () => {
    const stopped: ScheduledPrompt = {
      ...makeActive({ durationHours: null, expiresAt: null }),
      status: 'stopped'
    }
    const now = 9_000_000
    const result = applyRestart(stopped, now)
    expect(result.expiresAt).toBeNull()
    expect(result.status).toBe('active')
  })
})
