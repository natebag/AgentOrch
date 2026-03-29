# Infinite Canvas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the AgentOrch workspace into an infinite canvas with zoom, pan, and unbounded window placement — like Figma for terminals.

**Architecture:** A CSS `transform: translate(pan) scale(zoom)` on an inner canvas div handles the viewport. Windows stay in canvas-space coordinates. The CSS transform scales them visually — FloatingWindow passes raw canvas-space values to Rnd (no manual `* zoom` multiplication). FloatingWindow is refactored from uncontrolled to controlled positioning. Maximize uses a React portal to escape the transform.

**Tech Stack:** React, react-rnd (controlled mode), CSS transforms, React portals

---

## File Structure

```
src/renderer/
├── hooks/
│   └── useWindowManager.ts        # MODIFY: add zoom/pan state, position updates, zoomToFit
├── components/
│   ├── Workspace.tsx               # MODIFY: add canvas div, zoom/pan handlers, zoom controls
│   ├── FloatingWindow.tsx          # MODIFY: refactor to controlled positioning, zoom prop, portal for maximize
│   ├── ZoomControls.tsx            # CREATE: bottom-right zoom control widget
│   └── TerminalWindow.tsx          # MODIFY: add wheel stopPropagation
├── App.tsx                         # MODIFY: pass zoom/pan, add Ctrl+0 shortcuts
src/main/
├── index.ts                        # MODIFY: disable Electron default zoom shortcuts
```

---

## Task 1: Refactor useWindowManager — Controlled Positioning + Zoom/Pan State

**Files:**
- Modify: `src/renderer/hooks/useWindowManager.ts`

- [ ] **Step 1: Add zoom and pan state with refs for stable closures**

Add to the hook. Use refs so `addWindow` doesn't recreate on every zoom/pan change:

```typescript
const [zoom, setZoomState] = useState(1.0)
const [pan, setPanState] = useState({ x: 0, y: 0 })

// Refs for stable closures (addWindow needs current zoom/pan without recreating)
const zoomRef = useRef(1.0)
const panRef = useRef({ x: 0, y: 0 })

const setZoom = useCallback((level: number) => {
  const clamped = Math.min(2.0, Math.max(0.25, level))
  zoomRef.current = clamped
  setZoomState(clamped)
}, [])

const setPan = useCallback((x: number, y: number) => {
  panRef.current = { x, y }
  setPanState({ x, y })
}, [])
```

Also add `useRef` to the imports.

- [ ] **Step 2: Add updateWindowPosition and updateWindowSize**

```typescript
const updateWindowPosition = useCallback((id: string, x: number, y: number) => {
  setWindows(prev => {
    const next = new Map(prev)
    const win = next.get(id)
    if (win) {
      win.x = x
      win.y = y
    }
    return next
  })
}, [])

const updateWindowSize = useCallback((id: string, width: number, height: number) => {
  setWindows(prev => {
    const next = new Map(prev)
    const win = next.get(id)
    if (win) {
      win.width = width
      win.height = height
    }
    return next
  })
}, [])
```

- [ ] **Step 3: Add zoomToFit using functional setState to avoid stale closure**

```typescript
const zoomToFit = useCallback((viewportWidth: number, viewportHeight: number) => {
  setWindows(prev => {
    const wins = Array.from(prev.values())
    if (wins.length === 0) return prev

    const padding = 60
    const minX = Math.min(...wins.map(w => w.x))
    const minY = Math.min(...wins.map(w => w.y))
    const maxX = Math.max(...wins.map(w => w.x + w.width))
    const maxY = Math.max(...wins.map(w => w.y + w.height))

    const bboxWidth = maxX - minX
    const bboxHeight = maxY - minY

    const newZoom = Math.min(
      2.0,
      Math.max(0.25, Math.min(
        viewportWidth / (bboxWidth + padding),
        viewportHeight / (bboxHeight + padding)
      ))
    )

    const centerX = (minX + maxX) / 2
    const centerY = (minY + maxY) / 2

    zoomRef.current = newZoom
    panRef.current = {
      x: viewportWidth / 2 - centerX * newZoom,
      y: viewportHeight / 2 - centerY * newZoom
    }
    setZoomState(newZoom)
    setPanState(panRef.current)

    return prev // don't modify windows, just read them
  })
}, [])
```

- [ ] **Step 4: Update addWindow to spawn near viewport center using refs**

```typescript
const addWindow = useCallback((id: string, title: string, statusColor?: string) => {
  setWindows(prev => {
    const next = new Map(prev)
    const offset = next.size * 30
    const z = zoomRef.current
    const p = panRef.current
    const canvasX = (window.innerWidth / 2 - p.x) / z - 300 + offset
    const canvasY = (window.innerHeight / 2 - p.y) / z - 200 + offset
    next.set(id, {
      id,
      title,
      statusColor,
      x: canvasX,
      y: canvasY,
      width: 600,
      height: 400,
      zIndex: ++nextZ,
      minimized: false
    })
    return next
  })
}, []) // stable — uses refs, no zoom/pan in deps
```

- [ ] **Step 5: Update the return object**

```typescript
return {
  windows: Array.from(windows.values()),
  zoom,
  pan,
  setZoom,
  setPan,
  addWindow,
  removeWindow,
  focusWindow,
  minimizeWindow,
  updateStatusColor,
  updateWindowPosition,
  updateWindowSize,
  zoomToFit
}
```

- [ ] **Step 6: Commit**

```bash
git add src/renderer/hooks/useWindowManager.ts
git commit -m "feat: add zoom/pan state, controlled positioning, and zoomToFit to useWindowManager"
```

---

## Task 2: Refactor FloatingWindow to Controlled Positioning

**Files:**
- Modify: `src/renderer/components/FloatingWindow.tsx`

**CRITICAL: The Rnd component lives INSIDE the CSS-transformed canvas div. The CSS `scale(zoom)` already handles visual scaling. Do NOT multiply positions/sizes by zoom — that would double-scale.**

- [ ] **Step 1: Replace the entire file**

```tsx
import React, { useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Rnd } from 'react-rnd'

interface FloatingWindowProps {
  id: string
  title: string
  statusColor?: string
  x: number
  y: number
  width: number
  height: number
  zoom: number
  zIndex: number
  minimized: boolean
  maximized: boolean
  viewportRef?: React.RefObject<HTMLDivElement | null>
  onFocus: () => void
  onMinimize: () => void
  onMaximize: () => void
  onClose: () => void
  onDragStop: (x: number, y: number) => void
  onResizeStop: (x: number, y: number, width: number, height: number) => void
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
  zIndex,
  minimized,
  maximized,
  viewportRef,
  onFocus,
  onMinimize,
  onMaximize,
  onClose,
  onDragStop,
  onResizeStop,
  children
}: FloatingWindowProps): React.ReactElement | null {
  if (minimized) return null

  // Rnd lives inside the CSS-transformed canvas. Positions are in canvas space.
  // CSS scale(zoom) handles visual scaling. No manual * zoom needed.
  const handleDragStop = useCallback((_e: any, data: { x: number; y: number }) => {
    onDragStop(data.x, data.y)
  }, [onDragStop])

  const handleResizeStop = useCallback((_e: any, _dir: any, ref: HTMLElement, _delta: any, position: { x: number; y: number }) => {
    onResizeStop(
      position.x,
      position.y,
      parseInt(ref.style.width),
      parseInt(ref.style.height)
    )
  }, [onResizeStop])

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
      size={{ width, height }}
      style={{ ...windowStyle, zIndex }}
      dragHandleClassName="window-titlebar"
      minWidth={300}
      minHeight={200}
      onMouseDown={onFocus}
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
```

**Key decisions:**
- Rnd gets raw canvas-space `position` and `size` — CSS transform handles scaling
- `onDragStop`/`onResizeStop` report raw values — no division by zoom needed since Rnd is inside the transformed space
- Maximize uses a simple absolute-positioned div via portal (no Rnd needed when maximized)

- [ ] **Step 2: Commit**

```bash
git add src/renderer/components/FloatingWindow.tsx
git commit -m "refactor: FloatingWindow to controlled positioning with maximize portal (no double-scaling)"
```

---

## Task 3: Create ZoomControls Component

**Files:**
- Create: `src/renderer/components/ZoomControls.tsx`

- [ ] **Step 1: Implement ZoomControls**

```tsx
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
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/components/ZoomControls.tsx
git commit -m "feat: create ZoomControls widget for bottom-right zoom display"
```

---

## Task 4: Update Workspace with Canvas Transform + Zoom/Pan Handlers

**Files:**
- Modify: `src/renderer/components/Workspace.tsx`

- [ ] **Step 1: Replace Workspace implementation**

Uses native `addEventListener` with `{ passive: false }` for wheel events (React's synthetic `onWheel` is passive and can't `preventDefault`). Includes bare-scroll vertical panning (spec requirement). Maximized state lives here with cleanup when windows are removed.

```tsx
import React, { useRef, useCallback, useState, useEffect } from 'react'
import { FloatingWindow } from './FloatingWindow'
import { TerminalWindow } from './TerminalWindow'
import { ZoomControls } from './ZoomControls'
import type { WindowState } from '../hooks/useWindowManager'
import type { AgentState } from '../../shared/types'

const STATUS_COLORS: Record<string, string> = {
  idle: '#888',
  active: '#4caf50',
  working: '#ffc107',
  disconnected: '#f44336'
}

interface WorkspaceProps {
  windows: WindowState[]
  agents: AgentState[]
  zoom: number
  pan: { x: number; y: number }
  onSetZoom: (level: number) => void
  onSetPan: (x: number, y: number) => void
  onZoomToFit: (viewportWidth: number, viewportHeight: number) => void
  onFocusWindow: (id: string) => void
  onMinimizeWindow: (id: string) => void
  onCloseWindow: (id: string) => void
  onDragStop: (id: string, x: number, y: number) => void
  onResizeStop: (id: string, x: number, y: number, width: number, height: number) => void
}

export function Workspace({
  windows,
  agents,
  zoom,
  pan,
  onSetZoom,
  onSetPan,
  onZoomToFit,
  onFocusWindow,
  onMinimizeWindow,
  onCloseWindow,
  onDragStop,
  onResizeStop
}: WorkspaceProps): React.ReactElement {
  const viewportRef = useRef<HTMLDivElement>(null)
  const [isPanning, setIsPanning] = useState(false)
  const panStartRef = useRef({ x: 0, y: 0 })
  const [transitionEnabled, setTransitionEnabled] = useState(false)
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [maximizedId, setMaximizedId] = useState<string | null>(null)

  // Clean up maximizedId if the window is removed
  useEffect(() => {
    if (maximizedId && !windows.find(w => w.id === maximizedId)) {
      setMaximizedId(null)
    }
  }, [windows, maximizedId])

  // Use refs for zoom/pan so the native wheel handler stays current
  const zoomRef = useRef(zoom)
  const panRef = useRef(pan)
  zoomRef.current = zoom
  panRef.current = pan

  // Native wheel handler (passive: false so preventDefault works)
  useEffect(() => {
    const el = viewportRef.current
    if (!el) return

    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey) {
        // Ctrl+Scroll = zoom centered on cursor
        e.preventDefault()

        setTransitionEnabled(false)
        if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current)
        scrollTimeoutRef.current = setTimeout(() => setTransitionEnabled(true), 150)

        const rect = el.getBoundingClientRect()
        const screenX = e.clientX - rect.left
        const screenY = e.clientY - rect.top

        const oldZoom = zoomRef.current
        const delta = e.deltaY > 0 ? -0.1 : 0.1
        const newZoom = Math.min(2.0, Math.max(0.25, oldZoom + delta))

        const p = panRef.current
        const canvasX = (screenX - p.x) / oldZoom
        const canvasY = (screenY - p.y) / oldZoom
        const newPanX = screenX - canvasX * newZoom
        const newPanY = screenY - canvasY * newZoom

        onSetZoom(newZoom)
        onSetPan(newPanX, newPanY)
      } else {
        // Bare scroll on empty canvas = pan vertically
        // Only pan if the event target is the viewport or canvas (not a terminal)
        const target = e.target as HTMLElement
        if (target === el || target.closest('[data-canvas]')) {
          e.preventDefault()
          const p = panRef.current
          onSetPan(p.x - e.deltaX, p.y - e.deltaY)
        }
      }
    }

    el.addEventListener('wheel', handleWheel, { passive: false })
    return () => el.removeEventListener('wheel', handleWheel)
  }, [onSetZoom, onSetPan])

  // Middle-click drag = pan
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 1) {
      e.preventDefault()
      setIsPanning(true)
      panStartRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y }
    }
  }, [pan])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isPanning) return
    onSetPan(e.clientX - panStartRef.current.x, e.clientY - panStartRef.current.y)
  }, [isPanning, onSetPan])

  const handleMouseUp = useCallback(() => {
    setIsPanning(false)
  }, [])

  const handleMaximize = useCallback((id: string) => {
    setMaximizedId(prev => prev === id ? null : id)
  }, [])

  const handleFitAll = useCallback(() => {
    if (!viewportRef.current) return
    const rect = viewportRef.current.getBoundingClientRect()
    setTransitionEnabled(true)
    onZoomToFit(rect.width, rect.height)
    setTimeout(() => setTransitionEnabled(false), 300)
  }, [onZoomToFit])

  const handleReset = useCallback(() => {
    setTransitionEnabled(true)
    onSetZoom(1.0)
    onSetPan(0, 0)
    setTimeout(() => setTransitionEnabled(false), 300)
  }, [onSetZoom, onSetPan])

  return (
    <div
      ref={viewportRef}
      style={{
        flex: 1,
        position: 'relative',
        overflow: 'hidden',
        backgroundColor: '#111',
        cursor: isPanning ? 'grabbing' : 'default'
      }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* Canvas — transformed by zoom/pan */}
      <div
        data-canvas
        style={{
          transformOrigin: '0 0',
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transition: transitionEnabled ? 'transform 0.2s ease' : 'none',
          position: 'absolute',
          top: 0,
          left: 0
        }}
      >
        {windows.map(win => {
          const agent = agents.find(a => a.id === win.id)
          const statusColor = agent ? STATUS_COLORS[agent.status] ?? '#888' : undefined
          const title = agent
            ? `${agent.name} (${agent.cli}) \u00B7 ${agent.role}`
            : win.title

          return (
            <FloatingWindow
              key={win.id}
              id={win.id}
              title={title}
              statusColor={statusColor}
              x={win.x}
              y={win.y}
              width={win.width}
              height={win.height}
              zoom={zoom}
              zIndex={win.zIndex}
              minimized={win.minimized}
              maximized={maximizedId === win.id}
              viewportRef={viewportRef}
              onFocus={() => onFocusWindow(win.id)}
              onMinimize={() => onMinimizeWindow(win.id)}
              onMaximize={() => handleMaximize(win.id)}
              onClose={() => onCloseWindow(win.id)}
              onDragStop={(nx, ny) => onDragStop(win.id, nx, ny)}
              onResizeStop={(nx, ny, w, h) => onResizeStop(win.id, nx, ny, w, h)}
            >
              <TerminalWindow agentId={win.id} />
            </FloatingWindow>
          )
        })}
      </div>

      {/* Zoom controls — outside canvas transform */}
      <ZoomControls
        zoom={zoom}
        onZoomIn={() => onSetZoom(Math.min(2.0, zoom + 0.1))}
        onZoomOut={() => onSetZoom(Math.max(0.25, zoom - 0.1))}
        onReset={handleReset}
        onFitAll={handleFitAll}
      />
    </div>
  )
}
```

**Key fixes vs. previous version:**
- Uses native `addEventListener('wheel', ..., { passive: false })` instead of React `onWheel` — so `preventDefault` actually works
- Bare scroll (no Ctrl) on empty canvas = vertical pan (spec requirement)
- `data-canvas` attribute on canvas div for targeting scroll events
- `maximizedId` cleared when window is removed (prevents stale state)
- Removed `Ctrl+drag` for panning (conflict risk) — middle-click only
- Uses refs for zoom/pan in the wheel handler to avoid stale closures

- [ ] **Step 2: Commit**

```bash
git add src/renderer/components/Workspace.tsx
git commit -m "feat: infinite canvas with CSS transform, cursor-centered zoom, bare-scroll pan, and zoom controls"
```

---

## Task 5: Add Wheel stopPropagation to TerminalWindow

**Files:**
- Modify: `src/renderer/components/TerminalWindow.tsx`

- [ ] **Step 1: Add onWheel stopPropagation to the container div**

Change the return JSX from:
```tsx
<div
  ref={containerRef}
  style={{ width: '100%', height: '100%', backgroundColor: '#0d0d0d' }}
/>
```

To:
```tsx
<div
  ref={containerRef}
  onWheel={(e) => e.stopPropagation()}
  style={{ width: '100%', height: '100%', backgroundColor: '#0d0d0d' }}
/>
```

This prevents scroll events over terminals from reaching the workspace's zoom/pan handler. xterm.js handles its own scrollback internally.

- [ ] **Step 2: Commit**

```bash
git add src/renderer/components/TerminalWindow.tsx
git commit -m "fix: stop wheel events from propagating through terminals to workspace zoom"
```

---

## Task 6: Wire Up App.tsx + Disable Electron Default Zoom

**Files:**
- Modify: `src/renderer/App.tsx`
- Modify: `src/main/index.ts`

- [ ] **Step 1: Update useWindowManager destructuring in App.tsx**

```typescript
const {
  windows, zoom, pan,
  addWindow, removeWindow, focusWindow, minimizeWindow,
  setZoom, setPan, updateWindowPosition, updateWindowSize, zoomToFit
} = useWindowManager()
```

- [ ] **Step 2: Add Ctrl+0 and Ctrl+Shift+0 shortcuts in the existing useEffect handler**

```typescript
// Ctrl+0 = reset zoom
if (e.ctrlKey && e.key === '0' && !e.shiftKey) {
  setZoom(1.0)
  setPan(0, 0)
  e.preventDefault()
}
// Ctrl+Shift+0 = fit all
if (e.ctrlKey && e.key === ')') {
  // Shift+0 produces ')' on most keyboards
  zoomToFit(window.innerWidth, window.innerHeight - 44) // minus TopBar height
  e.preventDefault()
}
```

Add `setZoom`, `setPan`, `zoomToFit` to the useEffect dependency array.

- [ ] **Step 3: Update Workspace props (no onMaximizeWindow — handled internally by Workspace)**

```tsx
<Workspace
  windows={windows}
  agents={agents}
  zoom={zoom}
  pan={pan}
  onSetZoom={setZoom}
  onSetPan={setPan}
  onZoomToFit={zoomToFit}
  onFocusWindow={focusWindow}
  onMinimizeWindow={minimizeWindow}
  onCloseWindow={handleClose}
  onDragStop={updateWindowPosition}
  onResizeStop={(id, x, y, w, h) => {
    updateWindowPosition(id, x, y)
    updateWindowSize(id, w, h)
  }}
/>
```

- [ ] **Step 4: Disable Electron's default Ctrl+0/+/- zoom in main process**

In `src/main/index.ts`, inside the `createWindow` function, after creating the BrowserWindow, add:

```typescript
// Disable Electron's built-in zoom shortcuts (we handle zoom in the renderer)
win.webContents.on('before-input-event', (_event, input) => {
  if (input.control && (input.key === '0' || input.key === '=' || input.key === '-')) {
    _event.preventDefault()
  }
})
```

- [ ] **Step 5: Commit**

```bash
git add src/renderer/App.tsx src/main/index.ts
git commit -m "feat: wire zoom/pan into App, add keyboard shortcuts, disable Electron default zoom"
```

---

## Task 7: Smoke Test + Fixes

- [ ] **Step 1: Run existing tests**

```bash
cd F:/coding/AgentOrch
npx vitest run
```

Expected: All 32 tests pass (no backend changes).

- [ ] **Step 2: Run the app**

```bash
npm run dev
```

- [ ] **Step 3: Verify zoom**

- Ctrl+Scroll over workspace → zoom in/out, centered on cursor
- Zoom controls in bottom-right → +, -, percentage display, 1:1 reset, Fit button
- Ctrl+0 → resets to 100%

- [ ] **Step 4: Verify pan**

- Middle-click drag on empty space → pans the canvas
- Bare scroll wheel on empty canvas (no Ctrl) → pans vertically

- [ ] **Step 5: Verify windows**

- Spawn an agent → window appears near viewport center
- Drag window → position updates correctly at any zoom level
- Resize window → size updates correctly at any zoom level
- Windows can be placed anywhere (no boundary clipping)
- Maximize → fills viewport regardless of zoom
- Un-maximize → returns to canvas position

- [ ] **Step 6: Verify terminal scroll isolation**

- Scroll wheel over a terminal → scrolls terminal content, NOT zoom/pan
- Ctrl+Scroll over a terminal → does NOT zoom

- [ ] **Step 7: Fix any issues found**

- [ ] **Step 8: Commit fixes and push**

```bash
git add -A
git commit -m "fix: address issues found during infinite canvas smoke testing"
git push
```

---

## Summary

| Task | Component | Type |
|------|-----------|------|
| 1 | useWindowManager — zoom/pan state + position updates + refs | Refactor |
| 2 | FloatingWindow — controlled positioning + portal maximize (no double-scaling) | Refactor |
| 3 | ZoomControls — new widget | Create |
| 4 | Workspace — canvas transform + native wheel handler + bare-scroll pan | Modify |
| 5 | TerminalWindow — wheel stopPropagation | Fix |
| 6 | App.tsx — wire everything + shortcuts + disable Electron zoom | Wire |
| 7 | Smoke test + fixes | Test |
