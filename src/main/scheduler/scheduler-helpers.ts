import type { ScheduledPrompt, FireHistoryEntry } from '../../shared/types'

export const HISTORY_MAX = 20
const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS

export function computeNextFireAt(base: number, intervalMinutes: number): number {
  return base + intervalMinutes * MINUTE_MS
}

export function computeExpiresAt(startedAt: number, durationHours: number | null): number | null {
  if (durationHours === null) return null
  return startedAt + durationHours * HOUR_MS
}

export function isExpired(schedule: ScheduledPrompt, now: number): boolean {
  if (schedule.expiresAt === null) return false
  return now >= schedule.expiresAt
}

export function shouldFire(schedule: ScheduledPrompt, now: number): boolean {
  if (schedule.status !== 'active') return false
  return now >= schedule.nextFireAt
}

export function trimFireHistory(history: FireHistoryEntry[]): FireHistoryEntry[] {
  if (history.length <= HISTORY_MAX) return history
  return history.slice(history.length - HISTORY_MAX)
}

export function applyFire(
  schedule: ScheduledPrompt,
  now: number,
  outcome: FireHistoryEntry['outcome']
): ScheduledPrompt {
  const nextHistory = trimFireHistory([
    ...schedule.fireHistory,
    { timestamp: now, outcome }
  ])
  return {
    ...schedule,
    fireHistory: nextHistory,
    nextFireAt: computeNextFireAt(now, schedule.intervalMinutes)
  }
}

export function applyPause(schedule: ScheduledPrompt, now: number): ScheduledPrompt {
  return { ...schedule, status: 'paused', pausedAt: now }
}

export function applyResume(schedule: ScheduledPrompt, now: number): ScheduledPrompt {
  if (schedule.pausedAt === null) return { ...schedule, status: 'active' }
  const shift = now - schedule.pausedAt
  return {
    ...schedule,
    status: 'active',
    pausedAt: null,
    nextFireAt: schedule.nextFireAt + shift,
    expiresAt: schedule.expiresAt === null ? null : schedule.expiresAt + shift
  }
}

export function applyStop(schedule: ScheduledPrompt): ScheduledPrompt {
  return { ...schedule, status: 'stopped' }
}

export function applyRestart(schedule: ScheduledPrompt, now: number): ScheduledPrompt {
  return {
    ...schedule,
    status: 'active',
    startedAt: now,
    nextFireAt: computeNextFireAt(now, schedule.intervalMinutes),
    expiresAt: computeExpiresAt(now, schedule.durationHours),
    pausedAt: null,
    fireHistory: []
  }
}
