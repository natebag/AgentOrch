import React, { useState, useEffect } from 'react'

declare const electronAPI: {
  getSettings: () => Promise<Record<string, any>>
  setSetting: (key: string, value: unknown) => Promise<{ status: string }>
}

interface SettingsDialogProps {
  onClose: () => void
}

export function SettingsDialog({ onClose }: SettingsDialogProps): React.ReactElement {
  const [settings, setSettings] = useState<Record<string, any>>({})

  useEffect(() => {
    electronAPI.getSettings().then(setSettings)
  }, [])

  const toggle = async (key: string, defaultVal: boolean) => {
    const current = settings[key] ?? defaultVal
    const newVal = !current
    await electronAPI.setSetting(key, newVal)
    setSettings(prev => ({ ...prev, [key]: newVal }))
  }

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 100002
    }}>
      <div style={{
        backgroundColor: '#1e1e1e', border: '1px solid #333', borderRadius: '8px',
        padding: '24px', width: '400px', display: 'flex', flexDirection: 'column', gap: '16px'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: '16px', color: '#e0e0e0' }}>Settings</h2>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', color: '#666', fontSize: '24px', cursor: 'pointer', lineHeight: 1
          }}>x</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ fontSize: '12px', color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Notifications
          </div>

          <label style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '8px', backgroundColor: '#252525', borderRadius: '4px', cursor: 'pointer'
          }}>
            <div>
              <div style={{ fontSize: '13px', color: '#e0e0e0' }}>Task completion alerts</div>
              <div style={{ fontSize: '11px', color: '#666' }}>Show a system notification when tasks are completed</div>
            </div>
            <div
              onClick={() => toggle('notifications', true)}
              style={{
                width: 40, height: 22, borderRadius: 11,
                backgroundColor: (settings.notifications ?? true) ? '#4caf50' : '#444',
                position: 'relative', cursor: 'pointer', transition: 'background-color 0.2s',
                flexShrink: 0, marginLeft: 12
              }}
            >
              <div style={{
                width: 18, height: 18, borderRadius: '50%',
                backgroundColor: '#fff', position: 'absolute', top: 2,
                left: (settings.notifications ?? true) ? 20 : 2,
                transition: 'left 0.2s'
              }} />
            </div>
          </label>

          <label style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '8px', backgroundColor: '#252525', borderRadius: '4px', cursor: 'pointer'
          }}>
            <div>
              <div style={{ fontSize: '13px', color: '#e0e0e0' }}>All tasks done alert</div>
              <div style={{ fontSize: '11px', color: '#666' }}>Extra notification when entire pinboard is cleared</div>
            </div>
            <div
              onClick={() => toggle('notifyAllDone', true)}
              style={{
                width: 40, height: 22, borderRadius: 11,
                backgroundColor: (settings.notifyAllDone ?? true) ? '#4caf50' : '#444',
                position: 'relative', cursor: 'pointer', transition: 'background-color 0.2s',
                flexShrink: 0, marginLeft: 12
              }}
            >
              <div style={{
                width: 18, height: 18, borderRadius: '50%',
                backgroundColor: '#fff', position: 'absolute', top: 2,
                left: (settings.notifyAllDone ?? true) ? 20 : 2,
                transition: 'left 0.2s'
              }} />
            </div>
          </label>
        </div>

        <button onClick={onClose} style={{
          padding: '8px 16px', backgroundColor: '#2a2a2a', border: '1px solid #444',
          borderRadius: '4px', color: '#aaa', cursor: 'pointer', fontSize: '13px', alignSelf: 'flex-end'
        }}>Done</button>
      </div>
    </div>
  )
}
