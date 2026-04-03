import React, { useState, useEffect, useCallback } from 'react'

interface Message {
  id: string
  from: string
  to: string
  message: string
  timestamp: string
}

declare const electronAPI: {
  hubSendMessage: (from: string, to: string, message: string) => Promise<any>
  hubGetMessageHistory: (agent?: string, limit?: number) => Promise<Message[]>
}

interface RacAgentChatProps {
  agentName: string
}

export function RacAgentChat({ agentName }: RacAgentChatProps): React.ReactElement {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)

  const fetchMessages = useCallback(async () => {
    try {
      const msgs = await electronAPI.hubGetMessageHistory(agentName, 50)
      setMessages(msgs)
    } catch { /* hub unreachable */ }
  }, [agentName])

  useEffect(() => {
    fetchMessages()
    const interval = setInterval(fetchMessages, 3000)
    return () => clearInterval(interval)
  }, [fetchMessages])

  const handleSend = async () => {
    if (!input.trim()) return
    setSending(true)
    try {
      await electronAPI.hubSendMessage('user', agentName, input.trim())
      setInput('')
      // Immediate refresh to show the sent message
      setTimeout(fetchMessages, 500)
    } catch { /* failed */ }
    setSending(false)
  }

  // Sort messages chronologically (oldest first, newest at bottom)
  const sortedMessages = [...messages].sort((a, b) =>
    new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  )

  return (
    <div style={{
      height: '100%', display: 'flex', flexDirection: 'column',
      backgroundColor: '#1e1e1e', color: '#e0e0e0', fontSize: '13px'
    }}>
      {/* Header */}
      <div style={{
        padding: '8px 12px', borderBottom: '1px solid #333',
        fontSize: '12px', color: '#888'
      }}>
        <span style={{ color: '#4a9eff' }}>{'\u25CF'}</span>{' '}
        <span style={{ fontWeight: 500, color: '#e0e0e0' }}>{agentName}</span>
        <span style={{ marginLeft: '8px', color: '#555' }}>Remote R.A.C. Agent</span>
      </div>

      {/* Messages */}
      <div style={{
        flex: 1, overflow: 'auto', padding: '8px',
        display: 'flex', flexDirection: 'column', gap: '4px'
      }}>
        {sortedMessages.length === 0 ? (
          <div style={{ color: '#555', textAlign: 'center', padding: '20px 0' }}>
            No messages yet. Send a task to this agent below,{'\n'}
            or have your orchestrator send_message("{agentName}", "...").
          </div>
        ) : (
          sortedMessages.map(msg => (
            <div key={msg.id} style={{
              padding: '6px 8px',
              backgroundColor: msg.from === agentName ? '#1a2a3a' : '#252525',
              borderRadius: '4px',
              borderLeft: msg.from === agentName ? '3px solid #4a9eff' : '3px solid #4caf50'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                <span style={{
                  fontSize: '11px', fontWeight: 500,
                  color: msg.from === agentName ? '#4a9eff' : '#4caf50'
                }}>
                  {msg.from}
                </span>
                <span style={{ color: '#444', fontSize: '10px' }}>
                  {new Date(msg.timestamp).toLocaleTimeString()}
                </span>
              </div>
              <div style={{ color: '#ccc', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {msg.message}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Input */}
      <div style={{
        padding: '8px', borderTop: '1px solid #333',
        display: 'flex', gap: '4px'
      }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
          placeholder={`Send message to ${agentName}...`}
          style={{
            flex: 1, backgroundColor: '#2a2a2a', border: '1px solid #444',
            borderRadius: '4px', padding: '6px 8px', color: '#e0e0e0', fontSize: '12px'
          }}
        />
        <button onClick={handleSend} disabled={sending || !input.trim()} style={{
          padding: '6px 12px', backgroundColor: '#2d5a2d', border: '1px solid #4caf50',
          borderRadius: '4px', color: '#4caf50', cursor: 'pointer', fontSize: '11px'
        }}>Send</button>
      </div>
    </div>
  )
}
