import React, { useCallback, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Rnd, type DraggableData, type RndDragEvent } from 'react-rnd'
import { getSnapZone, type SnapBounds, type SnapZoneInfo } from '../hooks/useSnapZones'

interface FloatingWindowProps {
  id: string
  title: string
  statusColor?: string
  x: number
  y: number
  width: number
  height: number
  zoom: number
  pan: { x: number; y: number }
  zIndex: number
  minimized: boolean
  maximized: boolean
  workspaceWidth: number
  workspaceHeight: number
  restoreBounds?: SnapBounds | null
  viewportRef?: React.RefObject<HTMLDivElement | null>
  onFocus: () => void
  onMinimize: () => void
  onMaximize: () => void
  onClose: () => void
  onDragStop: (x: number, y: number) => void
  onResizeStop: (x: number, y: number, width: number, height: number) => void
  onSnapPreviewChange: (info: SnapZoneInfo | null) => void
  onSnap: (bounds: SnapBounds, restoreBounds: SnapBounds) => void
  children: React.ReactNode
}

export function FloatingWindow({
  id,
  title,
  statusColor,
  x,
  y,
  width,
  height,
  zoom,
  pan,
  zIndex,
  minimized,
  maximized,
  workspaceWidth,
  workspaceHeight,
  restoreBounds,
  viewportRef,
  onFocus,
  onMinimize,
  onMaximize,
  onClose,
  onDragStop,
  onResizeStop,
  onSnapPreviewChange,
  onSnap,
  children
}: FloatingWindowProps): React.ReactElement | null {
  const [dragSizeOverride, setDragSizeOverride] = useState<{ width: number; height: number } | null>(null)

  if (minimized) return null

  // Rnd lives inside the CSS-transformed canvas. Positions are in canvas space.
  // CSS scale(zoom) handles visual scaling. No manual * zoom needed.
  const displayWidth = dragSizeOverride?.width ?? width
  const displayHeight = dragSizeOverride?.height ?? height

  const getSnapInfo = useCallback((event: RndDragEvent): SnapZoneInfo | null => {
    if (!viewportRef?.current) return null

    const point = 'touches' in event
      ? event.touches[0] ?? event.changedTouches[0]
      : event
    if (!point) return null

    const rect = viewportRef.current.getBoundingClientRect()
    const mouseX = point.clientX - rect.left
    const mouseY = point.clientY - rect.top
    return getSnapZone(mouseX, mouseY, workspaceWidth, workspaceHeight)
  }, [viewportRef, workspaceWidth, workspaceHeight])

  const activeRestoreBounds = useMemo(() => {
    if (restoreBounds) return restoreBounds
    return { x, y, width: displayWidth, height: displayHeight }
  }, [restoreBounds, x, y, displayWidth, displayHeight])

  const handleDragStart = useCallback(() => {
    if (restoreBounds) {
      setDragSizeOverride({ width: restoreBounds.width, height: restoreBounds.height })
    }
  }, [restoreBounds])

  const handleDrag = useCallback((e: RndDragEvent) => {
    onSnapPreviewChange(getSnapInfo(e))
  }, [getSnapInfo, onSnapPreviewChange])

  const handleDragStop = useCallback((e: RndDragEvent, data: DraggableData) => {
    const snapInfo = getSnapInfo(e)
    onSnapPreviewChange(null)

    if (snapInfo) {
      setDragSizeOverride(null)
      onSnap({
        x: (snapInfo.bounds.x - pan.x) / zoom,
        y: (snapInfo.bounds.y - pan.y) / zoom,
        width: snapInfo.bounds.width / zoom,
        height: snapInfo.bounds.height / zoom
      }, activeRestoreBounds)
      return
    }

    if (dragSizeOverride) {
      onResizeStop(data.x, data.y, dragSizeOverride.width, dragSizeOverride.height)
      setDragSizeOverride(null)
      return
    }

    onDragStop(data.x, data.y)
  }, [activeRestoreBounds, dragSizeOverride, getSnapInfo, onDragStop, onResizeStop, onSnap, onSnapPreviewChange, pan.x, pan.y, zoom])

  const handleResizeStop = useCallback((_e: any, _dir: any, ref: HTMLElement, _delta: any, position: { x: number; y: number }) => {
    setDragSizeOverride(null)
    onSnapPreviewChange(null)
    onResizeStop(
      position.x,
      position.y,
      parseInt(ref.style.width),
      parseInt(ref.style.height)
    )
  }, [onResizeStop, onSnapPreviewChange])

  // Maximized: render via portal into viewport (outside canvas transform)
  if (maximized && viewportRef?.current) {
    return createPortal(
      <div style={{
        position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
        zIndex: 99998, display: 'flex', flexDirection: 'column',
        ...windowStyle
      }}>
        <div className="window-titlebar" style={titleBarStyle} onDoubleClick={onMaximize}>
          {statusColor && <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: statusColor, marginRight: 8 }} />}
          <span style={{ flex: 1, fontSize: '12px', color: '#ccc' }}>{title}</span>
          <button onClick={onMinimize} style={btnStyle}>─</button>
          <button onClick={onMaximize} style={btnStyle}>❐</button>
          <button onClick={onClose} style={{ ...btnStyle, color: '#e55' }}>✕</button>
        </div>
        <div style={{ flex: 1, overflow: 'hidden' }}>{children}</div>
      </div>,
      viewportRef.current
    )
  }

  return (
    <Rnd
      position={{ x, y }}
      size={{ width: displayWidth, height: displayHeight }}
      style={{ ...windowStyle, zIndex }}
      dragHandleClassName="window-titlebar"
      minWidth={300}
      minHeight={200}
      scale={zoom}
      onMouseDown={onFocus}
      onDragStart={handleDragStart}
      onDrag={handleDrag}
      onDragStop={handleDragStop}
      onResizeStop={handleResizeStop}
    >
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
        <div className="window-titlebar" style={titleBarStyle} onDoubleClick={onMaximize}>
          {statusColor && <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: statusColor, marginRight: 8 }} />}
          <span style={{ flex: 1, fontSize: '12px', color: '#ccc' }}>{title}</span>
          <button onClick={onMinimize} style={btnStyle}>─</button>
          <button onClick={onMaximize} style={btnStyle}>□</button>
          <button onClick={onClose} style={{ ...btnStyle, color: '#e55' }}>✕</button>
        </div>
        <div style={{ flex: 1, overflow: 'hidden' }}>{children}</div>
      </div>
    </Rnd>
  )
}

const windowStyle: React.CSSProperties = {
  border: '1px solid #333',
  borderRadius: '6px',
  overflow: 'hidden',
  backgroundColor: '#0d0d0d',
  boxShadow: '0 4px 20px rgba(0,0,0,0.5)'
}

const titleBarStyle: React.CSSProperties = {
  height: '32px',
  backgroundColor: '#1e1e1e',
  display: 'flex',
  alignItems: 'center',
  padding: '0 10px',
  cursor: 'grab',
  userSelect: 'none',
  flexShrink: 0
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
