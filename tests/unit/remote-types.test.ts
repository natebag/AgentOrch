import { describe, it, expect } from 'vitest'
import { IPC } from '../../src/shared/types'
import type { RemoteViewStatus, RemoteSetupProgress } from '../../src/shared/types'

describe('Remote view types and IPC', () => {
  it('exposes remote view IPC channels', () => {
    expect(IPC.REMOTE_ENABLE).toBe('remote:enable')
    expect(IPC.REMOTE_DISABLE).toBe('remote:disable')
    expect(IPC.REMOTE_STATE).toBe('remote:state')
    expect(IPC.REMOTE_KILL_SESSIONS).toBe('remote:kill-sessions')
    expect(IPC.REMOTE_REGENERATE).toBe('remote:regenerate')
    expect(IPC.REMOTE_STATUS_UPDATE).toBe('remote:status-update')
    expect(IPC.REMOTE_SETUP_PROGRESS).toBe('remote:setup-progress')
  })

  it('RemoteViewStatus shape', () => {
    const s: RemoteViewStatus = {
      enabled: true,
      publicUrl: 'https://example.trycloudflare.com/r/abc',
      connectionCount: 1,
      lastActivity: 12345
    }
    expect(s.enabled).toBe(true)
  })

  it('RemoteSetupProgress allows expected stages', () => {
    const stages: RemoteSetupProgress[] = [
      { stage: 'downloading', message: '15%' },
      { stage: 'starting' },
      { stage: 'ready' },
      { stage: 'error', message: 'oops' }
    ]
    expect(stages).toHaveLength(4)
  })
})
