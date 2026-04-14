import type { RacSlot, RacSession } from '../../shared/types'

const DEFAULT_SERVER = 'http://localhost:7700'

export class RacClient {
  private serverUrl: string = DEFAULT_SERVER
  private activeSessions: RacSession[] = []

  setServer(url: string): void {
    const trimmed = url.replace(/\/+$/, '') // strip trailing slash
    // The hub secret is included in the rent() payload. If the RAC server isn't
    // loopback, require HTTPS so the secret isn't carried in cleartext over the
    // LAN where a passive observer could lift it and authenticate to the hub.
    let parsed: URL
    try {
      parsed = new URL(trimmed)
    } catch {
      throw new Error(`Invalid R.A.C. server URL: ${url}`)
    }
    const host = parsed.hostname
    const isLoopback = host === '127.0.0.1' || host === 'localhost' || host === '::1'
    if (parsed.protocol !== 'https:' && !isLoopback) {
      throw new Error(`R.A.C. server URL must use https:// when not pointing at localhost (got ${parsed.protocol}//${host})`)
    }
    this.serverUrl = trimmed
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
