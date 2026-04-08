const TRYCLOUDFLARE_REGEX = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/

export function parseTunnelUrl(buffer: string): string | null {
  const match = buffer.match(TRYCLOUDFLARE_REGEX)
  return match ? match[0] : null
}

export function resolveBinaryName(platform: NodeJS.Platform): string {
  return platform === 'win32' ? 'cloudflared.exe' : 'cloudflared'
}

export function resolveDownloadUrl(platform: NodeJS.Platform, arch: string): string {
  const base = 'https://github.com/cloudflare/cloudflared/releases/latest/download/'
  if (platform === 'win32') {
    if (arch === 'x64') return `${base}cloudflared-windows-amd64.exe`
  }
  if (platform === 'darwin') {
    if (arch === 'x64') return `${base}cloudflared-darwin-amd64.tgz`
    if (arch === 'arm64') return `${base}cloudflared-darwin-arm64.tgz`
  }
  if (platform === 'linux') {
    if (arch === 'x64') return `${base}cloudflared-linux-amd64`
    if (arch === 'arm64') return `${base}cloudflared-linux-arm64`
  }
  throw new Error(`Unsupported platform/arch for cloudflared: ${platform}/${arch}`)
}
