import React from 'react'

interface ZoomControlsProps {
  zoom: number
  onZoomIn: () => void
  onZoomOut: () => void
  onReset: () => void
  onFitAll: () => void
}

export function ZoomControls({ zoom, onZoomIn, onZoomOut, onReset, onFitAll }: ZoomControlsProps): React.ReactElement {
  return (
    <div style={{
      position: 'absolute',
      bottom: 12,
      right: 12,
      display: 'flex',
      alignItems: 'center',
      gap: '4px',
      backgroundColor: '#1e1e1e',
      border: '1px solid #333',
      borderRadius: '6px',
      padding: '4px 8px',
      zIndex: 99999,
      userSelect: 'none'
    }}>
      <button onClick={onZoomOut} style={zoomBtnStyle} title="Zoom out">−</button>
      <span style={{ color: '#aaa', fontSize: '11px', minWidth: '36px', textAlign: 'center' }}>
        {Math.round(zoom * 100)}%
      </span>
      <button onClick={onZoomIn} style={zoomBtnStyle} title="Zoom in">+</button>
      <div style={{ width: '1px', height: '16px', backgroundColor: '#444', margin: '0 4px' }} />
      <button onClick={onReset} style={zoomBtnStyle} title="Reset zoom (Ctrl+0)">1:1</button>
      <button onClick={onFitAll} style={zoomBtnStyle} title="Fit all (Ctrl+Shift+0)">Fit</button>
    </div>
  )
}

const zoomBtnStyle: React.CSSProperties = {
  background: 'none',
  border: '1px solid #444',
  borderRadius: '3px',
  color: '#aaa',
  cursor: 'pointer',
  padding: '2px 8px',
  fontSize: '13px',
  fontFamily: 'inherit'
}
