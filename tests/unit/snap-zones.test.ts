import { describe, expect, it } from 'vitest'
import { getSnapZone } from '../../src/renderer/hooks/useSnapZones'

describe('getSnapZone', () => {
  it('returns the top-left snap zone with quarter bounds', () => {
    expect(getSnapZone(10, 10, 1200, 800)).toEqual({
      zone: 'top-left',
      bounds: { x: 0, y: 0, width: 600, height: 400 }
    })
  })

  it('returns the top-right snap zone with quarter bounds', () => {
    expect(getSnapZone(1190, 10, 1200, 800)).toEqual({
      zone: 'top-right',
      bounds: { x: 600, y: 0, width: 600, height: 400 }
    })
  })

  it('returns the bottom-left snap zone with quarter bounds', () => {
    expect(getSnapZone(10, 790, 1200, 800)).toEqual({
      zone: 'bottom-left',
      bounds: { x: 0, y: 400, width: 600, height: 400 }
    })
  })

  it('returns the bottom-right snap zone with quarter bounds', () => {
    expect(getSnapZone(1190, 790, 1200, 800)).toEqual({
      zone: 'bottom-right',
      bounds: { x: 600, y: 400, width: 600, height: 400 }
    })
  })

  it('returns maximize when near only the top edge', () => {
    expect(getSnapZone(600, 10, 1200, 800)).toEqual({
      zone: 'maximize',
      bounds: { x: 0, y: 0, width: 1200, height: 800 }
    })
  })

  it('returns the left snap zone with left-half bounds', () => {
    expect(getSnapZone(10, 400, 1200, 800)).toEqual({
      zone: 'left',
      bounds: { x: 0, y: 0, width: 600, height: 800 }
    })
  })

  it('returns the right snap zone with right-half bounds', () => {
    expect(getSnapZone(1190, 400, 1200, 800)).toEqual({
      zone: 'right',
      bounds: { x: 600, y: 0, width: 600, height: 800 }
    })
  })

  it('returns the bottom snap zone with bottom-half bounds', () => {
    expect(getSnapZone(600, 790, 1200, 800)).toEqual({
      zone: 'bottom',
      bounds: { x: 0, y: 400, width: 1200, height: 400 }
    })
  })

  it('returns null when the pointer is not near any edge', () => {
    expect(getSnapZone(600, 400, 1200, 800)).toBeNull()
  })

  it('returns null for zero or negative workspace dimensions', () => {
    expect(getSnapZone(10, 10, 0, 800)).toBeNull()
    expect(getSnapZone(10, 10, 1200, 0)).toBeNull()
    expect(getSnapZone(10, 10, -1200, 800)).toBeNull()
    expect(getSnapZone(10, 10, 1200, -800)).toBeNull()
  })

  it('respects a custom threshold and includes exact threshold boundaries', () => {
    expect(getSnapZone(30, 300, 1200, 800, 40)).toEqual({
      zone: 'left',
      bounds: { x: 0, y: 0, width: 600, height: 800 }
    })

    expect(getSnapZone(41, 300, 1200, 800, 40)).toBeNull()

    expect(getSnapZone(1160, 300, 1200, 800, 40)).toEqual({
      zone: 'right',
      bounds: { x: 600, y: 0, width: 600, height: 800 }
    })
  })
})
