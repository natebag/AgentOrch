import React, { useState, useEffect } from 'react'

interface BuddyMessage {
  id: string
  agentName: string
  buddyName: string
  message: string
  timestamp: string
}

declare const electronAPI: {
  getBuddyMessages: () => Promise<BuddyMessage[]>
  onBuddyUpdate: (callback: (messages: BuddyMessage[]) => void) => () => void
}

export function BuddyRoomPanel(): React.ReactElement {
  const [messages, setMessages] = useState<BuddyMessage[]>([])

  useEffect(() => {
    electronAPI.getBuddyMessages().then(setMessages)
    const unsub = electronAPI.onBuddyUpdate(setMessages)
    return unsub
  }, [])

  return (
    <div style={{
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      backgroundColor: '#1e1e1e',
      color: '#e0e0e0',
      fontSize: '13px'
    }}>
      <div style={{
        padding: '8px 12px',
        borderBottom: '1px solid #333',
        fontSize: '12px',
        color: '#888',
        fontWeight: 500
      }}>
        Buddy Room — Companion chatter from all agents
      </div>
      <div style={{
        flex: 1,
        overflow: 'auto',
        padding: '8px'
      }}>
        {messages.length === 0 ? (
          <div style={{ color: '#555', textAlign: 'center', padding: '20px 0' }}>
            No buddy messages yet. Companions will appear here when they speak.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {[...messages].reverse().map(msg => (
              <div key={msg.id} style={{
                padding: '6px 8px',
                backgroundColor: '#252525',
                borderRadius: '4px',
                borderLeft: '3px solid #7c4dff'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                  <span style={{ color: '#7c4dff', fontSize: '11px', fontWeight: 500 }}>
                    {msg.buddyName} <span style={{ color: '#555' }}>via</span> {msg.agentName}
                  </span>
                  <span style={{ color: '#444', fontSize: '10px' }}>
                    {new Date(msg.timestamp).toLocaleTimeString()}
                  </span>
                </div>
                <div style={{ color: '#ccc' }}>{msg.message}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
