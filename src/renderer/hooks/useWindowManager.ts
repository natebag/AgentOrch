import { useState, useCallback } from 'react'

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

  const addWindow = useCallback((id: string, title: string, statusColor?: string) => {
    setWindows(prev => {
      const next = new Map(prev)
      const offset = next.size * 30
      next.set(id, {
        id,
        title,
        statusColor,
        x: 50 + offset,
        y: 50 + offset,
        width: 600,
        height: 400,
        zIndex: ++nextZ,
        minimized: false
      })
      return next
    })
  }, [])

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
    addWindow,
    removeWindow,
    focusWindow,
    minimizeWindow,
    updateStatusColor
  }
}
