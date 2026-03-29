import { randomBytes, timingSafeEqual } from 'crypto'

export function generateSecret(): string {
  return randomBytes(32).toString('hex')
}

export function validateSecret(expected: string, provided: string): boolean {
  if (expected.length !== provided.length) return false
  return timingSafeEqual(Buffer.from(expected), Buffer.from(provided))
}
