import { describe, it, expect } from 'vitest'
import { IPC } from '../../src/shared/types'
import type { ScheduledPrompt, FireHistoryEntry, CreateScheduleInput } from '../../src/shared/types'

describe('Scheduled prompts types and IPC', () => {
  it('exposes scheduler IPC channels', () => {
    expect(IPC.SCHEDULES_LIST).toBe('schedules:list')
    expect(IPC.SCHEDULES_CREATE).toBe('schedules:create')
    expect(IPC.SCHEDULES_PAUSE).toBe('schedules:pause')
    expect(IPC.SCHEDULES_RESUME).toBe('schedules:resume')
    expect(IPC.SCHEDULES_STOP).toBe('schedules:stop')
    expect(IPC.SCHEDULES_RESTART).toBe('schedules:restart')
    expect(IPC.SCHEDULES_EDIT).toBe('schedules:edit')
    expect(IPC.SCHEDULES_DELETE).toBe('schedules:delete')
    expect(IPC.SCHEDULES_UPDATED).toBe('schedules:updated')
    expect(IPC.SCHEDULER_RESUMED).toBe('scheduler:resumed')
  })

  it('allows nullable durationHours and expiresAt', () => {
    const s: ScheduledPrompt = {
      id: 'x',
      tabId: 't',
      agentId: 'a',
      name: 'n',
      promptText: 'hi',
      intervalMinutes: 45,
      durationHours: null,
      startedAt: 0,
      expiresAt: null,
      nextFireAt: 0,
      pausedAt: null,
      status: 'active',
      fireHistory: []
    }
    expect(s.durationHours).toBeNull()
  })

  it('fire history entries have outcome and timestamp', () => {
    const e: FireHistoryEntry = { timestamp: 1, outcome: 'fired' }
    expect(e.outcome).toBe('fired')
  })

  it('CreateScheduleInput matches expected shape', () => {
    const input: CreateScheduleInput = {
      tabId: 't',
      agentId: 'a',
      name: 'n',
      promptText: 'hi',
      intervalMinutes: 45,
      durationHours: 8
    }
    expect(input.intervalMinutes).toBe(45)
  })
})
