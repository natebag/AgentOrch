import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  parseTunnelUrl,
  resolveBinaryName,
  resolveDownloadUrl
} from '../../src/main/remote/cloudflared-manager'

describe('parseTunnelUrl', () => {
  it('extracts a trycloudflare.com URL from a typical cloudflared log line', () => {
    const line = '2026-04-08T12:34:56Z INF |  https://random-words-here.trycloudflare.com  |'
    expect(parseTunnelUrl(line)).toBe('https://random-words-here.trycloudflare.com')
  })

  it('handles a multi-line buffer and finds the URL', () => {
    const buffer = `
      2026-04-08T12:34:55Z INF Starting tunnel
      2026-04-08T12:34:56Z INF Your quick Tunnel has been created! Visit it at:
      2026-04-08T12:34:56Z INF |  https://abc-def-ghi.trycloudflare.com  |
      2026-04-08T12:34:56Z INF Connection ready
    `
    expect(parseTunnelUrl(buffer)).toBe('https://abc-def-ghi.trycloudflare.com')
  })

  it('returns null when no URL is present', () => {
    expect(parseTunnelUrl('starting up...')).toBeNull()
    expect(parseTunnelUrl('')).toBeNull()
  })

  it('does not match a partial cloudflare.com URL', () => {
    expect(parseTunnelUrl('https://www.cloudflare.com')).toBeNull()
  })
})

describe('resolveBinaryName', () => {
  it('returns cloudflared.exe on Windows', () => {
    expect(resolveBinaryName('win32')).toBe('cloudflared.exe')
  })

  it('returns cloudflared on Mac', () => {
    expect(resolveBinaryName('darwin')).toBe('cloudflared')
  })

  it('returns cloudflared on Linux', () => {
    expect(resolveBinaryName('linux')).toBe('cloudflared')
  })
})

describe('resolveDownloadUrl', () => {
  it('Windows x64', () => {
    expect(resolveDownloadUrl('win32', 'x64'))
      .toBe('https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe')
  })

  it('Mac x64', () => {
    expect(resolveDownloadUrl('darwin', 'x64'))
      .toBe('https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-darwin-amd64.tgz')
  })

  it('Mac arm64', () => {
    expect(resolveDownloadUrl('darwin', 'arm64'))
      .toBe('https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-darwin-arm64.tgz')
  })

  it('Linux x64', () => {
    expect(resolveDownloadUrl('linux', 'x64'))
      .toBe('https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64')
  })

  it('throws on unsupported platforms', () => {
    expect(() => resolveDownloadUrl('aix', 'x64')).toThrow(/unsupported/i)
  })
})
