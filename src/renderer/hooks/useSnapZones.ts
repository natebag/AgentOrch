export type SnapZone =
  | 'left'
  | 'right'
  | 'top'
  | 'bottom'
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right'
  | 'maximize'

export interface SnapBounds {
  x: number
  y: number
  width: number
  height: number
}

export interface SnapZoneInfo {
  zone: SnapZone
  bounds: SnapBounds
}

export function getSnapZone(
  mouseX: number,
  mouseY: number,
  workspaceWidth: number,
  workspaceHeight: number,
  threshold = 20
): SnapZoneInfo | null {
  if (workspaceWidth <= 0 || workspaceHeight <= 0) return null

  const halfWidth = workspaceWidth / 2
  const halfHeight = workspaceHeight / 2
  const quarterWidth = workspaceWidth / 2
  const quarterHeight = workspaceHeight / 2

  const nearLeft = mouseX <= threshold
  const nearRight = mouseX >= workspaceWidth - threshold
  const nearTop = mouseY <= threshold
  const nearBottom = mouseY >= workspaceHeight - threshold

  if (nearTop && nearLeft) {
    return { zone: 'top-left', bounds: { x: 0, y: 0, width: quarterWidth, height: quarterHeight } }
  }

  if (nearTop && nearRight) {
    return { zone: 'top-right', bounds: { x: halfWidth, y: 0, width: quarterWidth, height: quarterHeight } }
  }

  if (nearBottom && nearLeft) {
    return { zone: 'bottom-left', bounds: { x: 0, y: halfHeight, width: quarterWidth, height: quarterHeight } }
  }

  if (nearBottom && nearRight) {
    return { zone: 'bottom-right', bounds: { x: halfWidth, y: halfHeight, width: quarterWidth, height: quarterHeight } }
  }

  if (nearTop) {
    return { zone: 'maximize', bounds: { x: 0, y: 0, width: workspaceWidth, height: workspaceHeight } }
  }

  if (nearLeft) {
    return { zone: 'left', bounds: { x: 0, y: 0, width: halfWidth, height: workspaceHeight } }
  }

  if (nearRight) {
    return { zone: 'right', bounds: { x: halfWidth, y: 0, width: halfWidth, height: workspaceHeight } }
  }

  if (nearBottom) {
    return { zone: 'bottom', bounds: { x: 0, y: halfHeight, width: workspaceWidth, height: halfHeight } }
  }

  return null
}
