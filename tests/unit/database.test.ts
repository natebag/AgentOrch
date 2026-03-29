import { describe, it, expect, beforeEach } from 'vitest'
import { createDatabase } from '../../src/main/db/database'
import { MessageStore } from '../../src/main/db/message-store'
import { PinboardStore } from '../../src/main/db/pinboard-store'
import { InfoStore } from '../../src/main/db/info-store'
import type { Message } from '../../src/shared/types'
import type { PinboardTask } from '../../src/main/hub/pinboard'
import type { InfoEntry } from '../../src/shared/types'
import type Database from 'better-sqlite3'

let db: Database.Database

beforeEach(() => {
  db = createDatabase(':memory:')
})

describe('Database initialization', () => {
  it('creates tables on first run', () => {
    const tables = db.prepare(
      `SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`
    ).all() as { name: string }[]
    const names = tables.map(t => t.name)
    expect(names).toContain('messages')
    expect(names).toContain('pinboard_tasks')
    expect(names).toContain('info_entries')
  })

  it('sets WAL mode (falls back to memory for :memory: DBs)', () => {
    // :memory: DBs report 'memory' instead of 'wal', but the pragma is still issued
    const result = db.pragma('journal_mode') as { journal_mode: string }[]
    expect(['wal', 'memory']).toContain(result[0].journal_mode)
  })
})

describe('MessageStore', () => {
  it('saves and retrieves messages', () => {
    const store = new MessageStore(db)
    const msg: Message = {
      id: 'm1',
      from: 'orchestrator',
      to: 'worker-1',
      message: 'do the thing',
      timestamp: '2026-03-29T10:00:00.000Z'
    }
    store.saveMessage(msg)

    const history = store.getMessageHistory()
    expect(history).toHaveLength(1)
    expect(history[0].id).toBe('m1')
    expect(history[0].from).toBe('orchestrator')
    expect(history[0].to).toBe('worker-1')
    expect(history[0].message).toBe('do the thing')
  })

  it('retrieves history filtered by agent', () => {
    const store = new MessageStore(db)
    store.saveMessage({ id: 'm1', from: 'orch', to: 'w1', message: 'task 1', timestamp: '2026-03-29T10:00:00Z' })
    store.saveMessage({ id: 'm2', from: 'orch', to: 'w2', message: 'task 2', timestamp: '2026-03-29T10:01:00Z' })
    store.saveMessage({ id: 'm3', from: 'w1', to: 'orch', message: 'done', timestamp: '2026-03-29T10:02:00Z' })

    const w1History = store.getMessageHistory('w1')
    expect(w1History).toHaveLength(2) // m1 (to w1) + m3 (from w1)

    const w2History = store.getMessageHistory('w2')
    expect(w2History).toHaveLength(1) // m2 (to w2)
  })

  it('respects limit', () => {
    const store = new MessageStore(db)
    for (let i = 0; i < 10; i++) {
      store.saveMessage({ id: `m${i}`, from: 'a', to: 'b', message: `msg ${i}`, timestamp: `2026-03-29T10:0${i}:00Z` })
    }

    const limited = store.getMessageHistory(undefined, 3)
    expect(limited).toHaveLength(3)
  })
})

describe('PinboardStore', () => {
  it('saves and loads tasks', () => {
    const store = new PinboardStore(db)
    const task: PinboardTask = {
      id: 't1',
      title: 'Fix bug',
      description: 'The login is broken',
      priority: 'high',
      status: 'open',
      claimedBy: null,
      result: null,
      createdAt: '2026-03-29T10:00:00.000Z'
    }
    store.saveTask(task)

    const loaded = store.loadTasks()
    expect(loaded).toHaveLength(1)
    expect(loaded[0].id).toBe('t1')
    expect(loaded[0].title).toBe('Fix bug')
    expect(loaded[0].priority).toBe('high')
    expect(loaded[0].status).toBe('open')
    expect(loaded[0].claimedBy).toBeNull()
    expect(loaded[0].result).toBeNull()
  })

  it('updates task status', () => {
    const store = new PinboardStore(db)
    const task: PinboardTask = {
      id: 't1',
      title: 'Fix bug',
      description: 'Broken',
      priority: 'medium',
      status: 'open',
      claimedBy: null,
      result: null,
      createdAt: '2026-03-29T10:00:00.000Z'
    }
    store.saveTask(task)

    // Simulate claim
    task.status = 'in_progress'
    task.claimedBy = 'worker-1'
    store.updateTask(task)

    let loaded = store.loadTasks()
    expect(loaded[0].status).toBe('in_progress')
    expect(loaded[0].claimedBy).toBe('worker-1')

    // Simulate complete
    task.status = 'completed'
    task.result = 'All fixed'
    store.updateTask(task)

    loaded = store.loadTasks()
    expect(loaded[0].status).toBe('completed')
    expect(loaded[0].result).toBe('All fixed')
  })

  it('round-trips multiple tasks', () => {
    const store = new PinboardStore(db)
    store.saveTask({ id: 't1', title: 'A', description: 'a', priority: 'low', status: 'open', claimedBy: null, result: null, createdAt: '2026-03-29T10:00:00Z' })
    store.saveTask({ id: 't2', title: 'B', description: 'b', priority: 'high', status: 'open', claimedBy: null, result: null, createdAt: '2026-03-29T10:01:00Z' })

    const loaded = store.loadTasks()
    expect(loaded).toHaveLength(2)
    expect(loaded[0].title).toBe('A')
    expect(loaded[1].title).toBe('B')
  })
})

describe('InfoStore', () => {
  it('saves and loads entries', () => {
    const store = new InfoStore(db)
    const entry: InfoEntry = {
      id: 'i1',
      from: 'researcher',
      note: 'Found important data',
      tags: ['research', 'data'],
      createdAt: '2026-03-29T10:00:00.000Z'
    }
    store.saveEntry(entry)

    const loaded = store.loadEntries()
    expect(loaded).toHaveLength(1)
    expect(loaded[0].id).toBe('i1')
    expect(loaded[0].from).toBe('researcher')
    expect(loaded[0].note).toBe('Found important data')
    expect(loaded[0].tags).toEqual(['research', 'data'])
  })

  it('round-trips tags as JSON', () => {
    const store = new InfoStore(db)
    store.saveEntry({ id: 'i1', from: 'a', note: 'note', tags: [], createdAt: '2026-03-29T10:00:00Z' })
    store.saveEntry({ id: 'i2', from: 'b', note: 'note', tags: ['x', 'y', 'z'], createdAt: '2026-03-29T10:01:00Z' })

    const loaded = store.loadEntries()
    expect(loaded[0].tags).toEqual([])
    expect(loaded[1].tags).toEqual(['x', 'y', 'z'])
  })

  it('loads multiple entries in order', () => {
    const store = new InfoStore(db)
    store.saveEntry({ id: 'i1', from: 'a', note: 'first', tags: [], createdAt: '2026-03-29T10:00:00Z' })
    store.saveEntry({ id: 'i2', from: 'b', note: 'second', tags: [], createdAt: '2026-03-29T10:01:00Z' })
    store.saveEntry({ id: 'i3', from: 'c', note: 'third', tags: [], createdAt: '2026-03-29T10:02:00Z' })

    const loaded = store.loadEntries()
    expect(loaded).toHaveLength(3)
    expect(loaded[0].note).toBe('first')
    expect(loaded[2].note).toBe('third')
  })
})
