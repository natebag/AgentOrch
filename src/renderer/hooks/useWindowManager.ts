import { useState, useCallback, useRef } from 'react'

export interface WindowState {
  id: string
  title: string
  statusColor?: string
  x: number
  y: number
  width: number
  height: number
  zIndex: number
  minimized: boolean
}

let nextZ = 1

export function useWindowManager() {
  const [windows, setWindows] = useState<Map<string, WindowState>>(new Map())

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

  const removeWindow = useCallback((id: string) => {
    setWindows(prev => {
      const next = new Map(prev)
      next.delete(id)
      return next
    })
  }, [])

  const focusWindow = useCallback((id: string) => {
    setWindows(prev => {
      const next = new Map(prev)
      const win = next.get(id)
      if (win) {
        win.zIndex = ++nextZ
        win.minimized = false
      }
      return next
    })
  }, [])

  const minimizeWindow = useCallback((id: string) => {
    setWindows(prev => {
      const next = new Map(prev)
      const win = next.get(id)
      if (win) win.minimized = true
      return next
    })
  }, [])

  const updateStatusColor = useCallback((id: string, color: string) => {
    setWindows(prev => {
      const next = new Map(prev)
      const win = next.get(id)
      if (win) win.statusColor = color
      return next
    })
  }, [])

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
}
