import { v4 as uuid } from 'uuid'

export interface BuddyMessage {
  id: string
  agentName: string
  buddyName: string
  message: string
  timestamp: string
}

const MAX_MESSAGES = 200

export class BuddyRoom {
  private messages: BuddyMessage[] = []
  onMessageAdded?: (msg: BuddyMessage) => void

  addMessage(agentName: string, buddyName: string, message: string): BuddyMessage {
    const msg: BuddyMessage = {
      id: uuid(),
      agentName,
      buddyName,
      message: message.trim(),
      timestamp: new Date().toISOString()
    }

    this.messages.push(msg)
    while (this.messages.length > MAX_MESSAGES) {
      this.messages.shift()
    }

    this.onMessageAdded?.(msg)
    return msg
  }

  getMessages(count = 50): BuddyMessage[] {
    return this.messages.slice(-count)
  }

  clear(): void {
    this.messages = []
  }
}
