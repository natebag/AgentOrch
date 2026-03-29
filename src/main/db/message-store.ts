import type Database from 'better-sqlite3'
import type { Message } from '../../shared/types'

export class MessageStore {
  private insertStmt: Database.Statement
  private queryAllStmt: Database.Statement
  private queryByAgentStmt: Database.Statement

  constructor(private db: Database.Database) {
    this.insertStmt = db.prepare(
      `INSERT INTO messages (id, "from", "to", message, timestamp) VALUES (?, ?, ?, ?, ?)`
    )
    this.queryAllStmt = db.prepare(
      `SELECT id, "from", "to", message, timestamp FROM messages ORDER BY timestamp DESC LIMIT ?`
    )
    this.queryByAgentStmt = db.prepare(
      `SELECT id, "from", "to", message, timestamp FROM messages
       WHERE "from" = ? OR "to" = ?
       ORDER BY timestamp DESC LIMIT ?`
    )
  }

  saveMessage(msg: Message): void {
    this.insertStmt.run(msg.id, msg.from, msg.to, msg.message, msg.timestamp)
  }

  getMessageHistory(agentName?: string, limit = 100): Message[] {
    if (agentName) {
      return this.queryByAgentStmt.all(agentName, agentName, limit) as Message[]
    }
    return this.queryAllStmt.all(limit) as Message[]
  }
}
