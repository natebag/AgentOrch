import { v4 as uuid } from 'uuid'
import type { InfoEntry } from '../../shared/types'

const MAX_NOTE_SIZE = 10 * 1024
const MAX_ENTRIES = 500

export class InfoChannel {
  private entries: InfoEntry[] = []
  onEntryAdded?: (entry: InfoEntry) => void

  postInfo(from: string, note: string, tags: string[] = []): InfoEntry {
    if (note.length > MAX_NOTE_SIZE) {
      throw new Error(`Note exceeds max size of ${MAX_NOTE_SIZE} bytes`)
    }

    const entry: InfoEntry = {
      id: uuid(),
      from,
      note,
      tags,
      createdAt: new Date().toISOString()
    }

    this.entries.push(entry)
    this.onEntryAdded?.(entry)

    // Enforce max entries limit, dropping oldest
    while (this.entries.length > MAX_ENTRIES) {
      this.entries.shift()
    }

    return entry
  }

  readInfo(tags?: string[]): InfoEntry[] {
    if (!tags || tags.length === 0) {
      return [...this.entries]
    }

    // Filter to entries matching ANY of the provided tags
    return this.entries.filter(entry => 
      entry.tags.some(tag => tags.includes(tag))
    )
  }

  loadEntries(entries: InfoEntry[]): void {
    this.entries.push(...entries)
  }

  clear(): void {
    this.entries = []
  }
}
