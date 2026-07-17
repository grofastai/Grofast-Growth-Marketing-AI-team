import { describe, it, expect } from 'vitest'
import { isValidShootTransition } from './status-transitions'

describe('isValidShootTransition', () => {
  it('allows scheduled -> completed', () => {
    expect(isValidShootTransition('scheduled', 'completed')).toBe(true)
  })
  it('allows scheduled -> cancelled', () => {
    expect(isValidShootTransition('scheduled', 'cancelled')).toBe(true)
  })
  it('rejects completed -> anything (terminal state)', () => {
    expect(isValidShootTransition('completed', 'cancelled')).toBe(false)
    expect(isValidShootTransition('completed', 'scheduled')).toBe(false)
  })
  it('rejects cancelled -> anything (terminal state)', () => {
    expect(isValidShootTransition('cancelled', 'completed')).toBe(false)
    expect(isValidShootTransition('cancelled', 'scheduled')).toBe(false)
  })
  it('rejects a status transitioning to itself', () => {
    expect(isValidShootTransition('scheduled', 'scheduled')).toBe(false)
    expect(isValidShootTransition('completed', 'completed')).toBe(false)
  })
})
