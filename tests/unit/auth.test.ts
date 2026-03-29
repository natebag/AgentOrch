import { describe, it, expect } from 'vitest'
import { generateSecret, validateSecret } from '../../src/main/hub/auth'

describe('Hub Auth', () => {
  it('generates a non-empty secret string', () => {
    const secret = generateSecret()
    expect(secret).toBeTruthy()
    expect(typeof secret).toBe('string')
    expect(secret.length).toBeGreaterThanOrEqual(32)
  })

  it('generates unique secrets each time', () => {
    const a = generateSecret()
    const b = generateSecret()
    expect(a).not.toBe(b)
  })

  it('validates correct secret', () => {
    const secret = generateSecret()
    expect(validateSecret(secret, secret)).toBe(true)
  })

  it('rejects incorrect secret', () => {
    const secret = generateSecret()
    expect(validateSecret(secret, 'wrong')).toBe(false)
  })
})
