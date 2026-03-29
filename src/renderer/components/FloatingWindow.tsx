import React, { useState, useCallback } from 'react'
import { Rnd } from 'react-rnd'

interface FloatingWindowProps {
  id: string
  title: string
  statusColor?: string
  initialX?: number
  initialY?: number
  initialWidth?: number
  initialHeight?: number
  zIndex: number
  minimized: boolean
  onFocus: () => void
  onMinimize: () => void
  onMaximize: () => void
  onClose: () => void
  children: React.ReactNode
}

export function FloatingWindow({
  id,
  title,
  statusColor,
  initialX = 50,
  initialY = 50,
  initialWidth = 600,
  initialHeight = 400,
  zIndex,
  minimized,
  onFocus,
  onMinimize,
  onMaximize,
  onClose,
  children
}: FloatingWindowProps): React.ReactElement | null {
  const [maximized, setMaximized] = useState(false)

  const handleMaximize = useCallback(() => {
    setMaximized(prev => !prev)
    onMaximize()
  }, [onMaximize])

  if (minimized) return null

  const style: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    border: '1px solid #333',
    borderRadius: '6px',
    overflow: 'hidden',
    backgroundColor: '#0d0d0d',
    boxShadow: '0 4px 20px rgba(0,0,0,0.5)'
  }

  const position = maximized ? { x: 0, y: 0 } : undefined
  const size = maximized
    ? { width: '100%' as any, height: '100%' as any }
    : undefined

  return (
    <Rnd
      default={{ x: initialX, y: initialY, width: initialWidth, height: initialHeight }}
      position={maximized ? { x: 0, y: 0 } : undefined}
      size={maximized ? { width: '100%', height: '100%' } : undefined}
      style={{ ...style, zIndex }}
      dragHandleClassName="window-titlebar"
      minWidth={300}
      minHeight={200}
      disableDragging={maximized}
      enableResizing={!maximized}
      onMouseDown={onFocus}
      bounds="parent"
    >
      <div
        className="window-titlebar"
        style={{
          height: '32px',
          backgroundColor: '#1e1e1e',
          display: 'flex',
          alignItems: 'center',
          padding: '0 10px',
          cursor: 'grab',
          userSelect: 'none',
          flexShrink: 0
        }}
        onDoubleClick={handleMaximize}
      >
        {statusColor && (
          <div style={{
            width: 8, height: 8, borderRadius: '50%',
            backgroundColor: statusColor, marginRight: 8
          }} />
        )}
        <span style={{ flex: 1, fontSize: '12px', color: '#ccc' }}>{title}</span>
        <button onClick={onMinimize} style={btnStyle}>─</button>
        <button onClick={handleMaximize} style={btnStyle}>{maximized ? '❐' : '□'}</button>
        <button onClick={onClose} style={{ ...btnStyle, color: '#e55' }}>✕</button>
      </div>
      <div style={{ flex: 1, overflow: 'hidden' }}>
        {children}
      </div>
    </Rnd>
  )
}

const btnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: '#888',
  cursor: 'pointer',
  padding: '0 6px',
  fontSize: '14px',
  lineHeight: '32px'
}
