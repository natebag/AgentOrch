import type { RacSlot, RacSession } from '../../shared/types'

const DEFAULT_SERVER = 'http://localhost:7700'

export class RacClient {
  private serverUrl: string = DEFAULT_SERVER
  private activeSessions: RacSession[] = []

  setServer(url: string): void {
    this.serverUrl = url.replace(/\/+$/, '') // strip trailing slash
  }

  getServer(): string {
    return this.serverUrl
  }

  getActiveSessions(): RacSession[] {
    return [...this.activeSessions]
  }

  async getAvailable(): Promise<{ available: RacSlot[]; count: number }> {
    try {
      const res = await fetch(`${this.serverUrl}/api/status/available`)
      if (!res.ok) {
        const body = await res.text()
        throw new Error(`R.A.C. returned ${res.status}: ${body}`)
      }
      return await res.json()
    } catch (err: any) {
      if (err.message?.includes('fetch failed') || err.cause?.code === 'ECONNREFUSED') {
        throw new Error(`Cannot reach R.A.C. server at ${this.serverUrl}`)
      }
      throw err
    }
  }

  async rent(slotId: string, renterName: string, hubPort: number, hubSecret: string): Promise<RacSession> {
    const res = await fetch(`${this.serverUrl}/api/rent/${slotId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        renter_name: renterName,
        connect_agentorch: true,
        agentorch_hub_port: hubPort,
        agentorch_hub_secret: hubSecret
      })
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: 'Unknown error' }))
      throw new Error(body.error || `Rent failed: ${res.status}`)
    }
    const session: RacSession = await res.json()
    this.activeSessions.push(session)
    return session
  }

  async release(sessionId: string): Promise<void> {
    const res = await fetch(`${this.serverUrl}/api/rent/${sessionId}`, {
      method: 'DELETE'
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: 'Unknown error' }))
      throw new Error(body.error || `Release failed: ${res.status}`)
    }
    this.activeSessions = this.activeSessions.filter(s => s.session_id !== sessionId)
  }
}
