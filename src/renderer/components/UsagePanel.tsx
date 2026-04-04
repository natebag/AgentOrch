import React, { useState, useEffect } from 'react'

interface AgentMetricsData {
  agentName: string
  cli: string
  model: string
  messagesSent: number
  messagesReceived: number
  tasksPosted: number
  tasksClaimed: number
  tasksCompleted: number
  infoPosted: number
  spawnedAt: string
  providerUsage?: {
    used: number
    total: number
    unit: string
    raw?: string
  }
}

declare const electronAPI: {
  getUsageMetrics: () => Promise<AgentMetricsData[]>
  refreshUsageLimits: () => Promise<Array<{ agentName: string; providerUsage?: any }>>
}

function formatUptime(spawnedAt: string): string {
  const ms = Date.now() - new Date(spawnedAt).getTime()
  const mins = Math.floor(ms / 60000)
  const hours = Math.floor(mins / 60)
  if (hours > 0) return `${hours}h ${mins % 60}m`
  return `${mins}m`
}

function UsageBar({ used, total, unit }: { used: number; total: number; unit: string }): React.ReactElement {
  const pct = total > 0 ? Math.min((used / total) * 100, 100) : 0
  const remaining = total - used
  const color = pct > 90 ? '#f44336' : pct > 70 ? '#ffc107' : '#4caf50'

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '2px' }}>
        <span style={{ color: '#aaa' }}>
          {unit === 'percent' ? `${Math.round(100 - pct)}% remaining` : `${remaining.toLocaleString()} / ${total.toLocaleString()} ${unit} left`}
        </span>
        <span style={{ color: '#666' }}>{Math.round(pct)}% used</span>
      </div>
      <div style={{ height: '6px', backgroundColor: '#333', borderRadius: '3px', overflow: 'hidden' }}>
        <div style={{
          height: '100%', width: `${pct}%`,
          backgroundColor: color, borderRadius: '3px',
          transition: 'width 0.3s'
        }} />
      </div>
    </div>
  )
}

export function UsagePanel(): React.ReactElement {
  const [metrics, setMetrics] = useState<AgentMetricsData[]>([])
  const [refreshing, setRefreshing] = useState(false)
  const [lastRefreshed, setLastRefreshed] = useState<string | null>(null)

  useEffect(() => {
    electronAPI.getUsageMetrics().then(setMetrics)
  }, [])

  const handleRefresh = async () => {
    setRefreshing(true)
    const freshMetrics = await electronAPI.getUsageMetrics()
    const limits = await electronAPI.refreshUsageLimits()
    const merged = freshMetrics.map(m => {
      const limit = limits.find(l => l.agentName === m.agentName)
      return { ...m, providerUsage: limit?.providerUsage }
    })
    setMetrics(merged)
    setLastRefreshed(new Date().toLocaleTimeString())
    setRefreshing(false)
  }

  return (
    <div style={{
      height: '100%', display: 'flex', flexDirection: 'column',
      backgroundColor: '#1e1e1e', color: '#e0e0e0', fontSize: '13px'
    }}>
      <div style={{
        padding: '8px 12px', borderBottom: '1px solid #333',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center'
      }}>
        <span style={{ fontSize: '12px', color: '#888', fontWeight: 500 }}>Usage</span>
        <button onClick={handleRefresh} disabled={refreshing} style={{
          padding: '3px 10px', fontSize: '11px', borderRadius: '4px', cursor: 'pointer',
          border: '1px solid #4a9eff', backgroundColor: '#1e3a5f', color: '#8cc4ff'
        }}>{refreshing ? 'Checking...' : 'Refresh Limits'}</button>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {metrics.length === 0 ? (
          <div style={{ color: '#555', textAlign: 'center', padding: '20px 0' }}>
            No agents running. Spawn agents to see usage.
          </div>
        ) : metrics.map(m => (
          <div key={m.agentName} style={{
            padding: '10px', backgroundColor: '#252525', borderRadius: '6px', border: '1px solid #333',
            display: 'flex', flexDirection: 'column', gap: '6px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 500, color: '#e0e0e0' }}>{m.agentName}</span>
              <span style={{ fontSize: '10px', color: '#666' }}>{m.cli} {m.model}</span>
            </div>

            {m.providerUsage && m.providerUsage.total > 0 && m.providerUsage.unit !== 'unknown' && (
              <UsageBar used={m.providerUsage.used} total={m.providerUsage.total} unit={m.providerUsage.unit} />
            )}

            {m.providerUsage?.raw && (
              <pre style={{
                margin: 0, padding: '6px', backgroundColor: '#1a1a1a', borderRadius: '4px',
                fontSize: '10px', color: '#888', whiteSpace: 'pre-wrap', maxHeight: '60px', overflow: 'auto'
              }}>{m.providerUsage.raw}</pre>
            )}

            {!m.providerUsage && (
              <div style={{ fontSize: '11px', color: '#555' }}>
                Provider limits: click Refresh to check
              </div>
            )}

            <div style={{ fontSize: '11px', color: '#888', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <span>{m.messagesSent} sent</span>
              <span>{m.messagesReceived} recv</span>
              <span>{m.tasksCompleted} tasks</span>
              <span>{m.infoPosted} info</span>
              <span>{formatUptime(m.spawnedAt)} active</span>
            </div>
          </div>
        ))}
      </div>

      {lastRefreshed && (
        <div style={{ padding: '4px 12px', borderTop: '1px solid #333', fontSize: '10px', color: '#555', textAlign: 'center' }}>
          Last refreshed: {lastRefreshed}
        </div>
      )}
    </div>
  )
}
