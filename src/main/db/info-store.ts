import type Database from 'better-sqlite3'
import type { InfoEntry } from '../../shared/types'

export class InfoStore {
  private insertStmt: Database.Statement
  private loadStmt: Database.Statement

  constructor(private db: Database.Database) {
    this.insertStmt = db.prepare(
      `INSERT INTO info_entries (id, "from", note, tags, created_at) VALUES (?, ?, ?, ?, ?)`
    )
    this.loadStmt = db.prepare(
      `SELECT id, "from", note, tags, created_at AS createdAt
       FROM info_entries ORDER BY created_at ASC`
    )
  }

  saveEntry(entry: InfoEntry): void {
    this.insertStmt.run(entry.id, entry.from, entry.note, JSON.stringify(entry.tags), entry.createdAt)
  }

  loadEntries(): InfoEntry[] {
    const rows = this.loadStmt.all() as any[]
    return rows.map(row => ({
      ...row,
      tags: JSON.parse(row.tags)
    }))
  }
}
