import { describe, it, expect, beforeEach } from 'vitest'
import { InfoChannel } from '../../src/main/hub/info-channel'

describe('InfoChannel', () => {
  let channel: InfoChannel

  beforeEach(() => {
    channel = new InfoChannel()
  })

  it('posts a note and returns the entry', () => {
    const entry = channel.postInfo('agent-1', 'Research finding: X correlates with Y', ['research', 'correlation'])
    expect(entry.from).toBe('agent-1')
    expect(entry.note).toBe('Research finding: X correlates with Y')
    expect(entry.tags).toEqual(['research', 'correlation'])
    expect(entry.id).toBeDefined()
    expect(entry.createdAt).toBeDefined()
  })

  it('posts a note without tags (defaults to empty array)', () => {
    const entry = channel.postInfo('agent-1', 'Simple note')
    expect(entry.note).toBe('Simple note')
    expect(entry.tags).toEqual([])
  })

  it('reads all notes when no tags provided', () => {
    channel.postInfo('agent-1', 'Note 1', ['tag1'])
    channel.postInfo('agent-2', 'Note 2', ['tag2'])
    channel.postInfo('agent-3', 'Note 3', ['tag3'])

    const entries = channel.readInfo()
    expect(entries).toHaveLength(3)
    expect(entries[0].note).toBe('Note 1')
    expect(entries[1].note).toBe('Note 2')
    expect(entries[2].note).toBe('Note 3')
  })

  it('reads notes filtered by single tag', () => {
    channel.postInfo('agent-1', 'Note 1', ['research'])
    channel.postInfo('agent-2', 'Note 2', ['bug'])
    channel.postInfo('agent-3', 'Note 3', ['research'])

    const entries = channel.readInfo(['research'])
    expect(entries).toHaveLength(2)
    expect(entries[0].note).toBe('Note 1')
    expect(entries[1].note).toBe('Note 3')
  })

  it('reads notes filtered by multiple tags (matches ANY tag)', () => {
    channel.postInfo('agent-1', 'Note 1', ['research'])
    channel.postInfo('agent-2', 'Note 2', ['bug'])
    channel.postInfo('agent-3', 'Note 3', ['feature'])
    channel.postInfo('agent-4', 'Note 4', ['research', 'bug'])

    const entries = channel.readInfo(['research', 'bug'])
    expect(entries).toHaveLength(3)
    expect(entries.map(e => e.note)).toContain('Note 1')
    expect(entries.map(e => e.note)).toContain('Note 2')
    expect(entries.map(e => e.note)).toContain('Note 4')
  }
  )

  it('returns empty array when no tags match', () => {
    channel.postInfo('agent-1', 'Note 1', ['research'])
    const entries = channel.readInfo(['nonexistent'])
    expect(entries).toHaveLength(0)
  })

  it('enforces max note size (10KB)', () => {
    const bigNote = 'x'.repeat(11_000)
    expect(() => channel.postInfo('agent-1', bigNote)).toThrow('max size')
  })

  it('enforces max entries limit (500), dropping oldest', () => {
    for (let i = 0; i < 505; i++) {
      channel.postInfo('agent-1', `Note ${i}`)
    }
    const entries = channel.readInfo()
    expect(entries).toHaveLength(500)
    expect(entries[0].note).toBe('Note 5')
    expect(entries[499].note).toBe('Note 504')
  })

  it('clear() removes all entries', () => {
    channel.postInfo('agent-1', 'Note 1')
    channel.postInfo('agent-2', 'Note 2')
    expect(channel.readInfo()).toHaveLength(2)

    channel.clear()
    expect(channel.readInfo()).toHaveLength(0)
  })
})
