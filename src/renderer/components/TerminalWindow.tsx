import React, { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'

interface TerminalWindowProps {
  agentId: string
}

export function TerminalWindow({ agentId }: TerminalWindowProps): React.ReactElement {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)

  useEffect(() => {
    if (!containerRef.current) return

    const term = new Terminal({
      theme: {
        background: '#0d0d0d',
        foreground: '#e0e0e0',
        cursor: '#e0e0e0',
        selectionBackground: '#444'
      },
      fontFamily: "'Cascadia Code', 'Fira Code', 'Consolas', monospace",
      fontSize: 13,
      cursorBlink: true,
      scrollback: 5000
    })

    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(containerRef.current)
    fit.fit()

    termRef.current = term
    fitRef.current = fit

    const cleanupOutput = window.electronAPI.onPtyOutput((id, data) => {
      if (id === agentId) term.write(data)
    })

    // Ctrl+C: copy if text selected, otherwise send SIGINT to PTY
    term.attachCustomKeyEventHandler((ev) => {
      if (ev.ctrlKey && ev.key === 'c' && ev.type === 'keydown') {
        if (term.hasSelection()) {
          navigator.clipboard.writeText(term.getSelection())
          term.clearSelection()
          return false // prevent sending to PTY
        }
      }
      // Ctrl+V: paste from clipboard
      if (ev.ctrlKey && ev.key === 'v' && ev.type === 'keydown') {
        navigator.clipboard.readText().then(text => {
          window.electronAPI.writeToPty(agentId, text)
        })
        return false
      }
      return true
    })

    const disposable = term.onData((data) => {
      window.electronAPI.writeToPty(agentId, data)
    })

    const observer = new ResizeObserver(() => {
      fit.fit()
      const { cols, rows } = term
      window.electronAPI.resizePty(agentId, cols, rows)
    })
    observer.observe(containerRef.current)

    return () => {
      cleanupOutput()
      disposable.dispose()
      observer.disconnect()
      term.dispose()
    }
  }, [agentId])

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '100%', backgroundColor: '#0d0d0d' }}
    />
  )
}
