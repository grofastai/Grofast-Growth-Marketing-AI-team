import { describe, it, expect } from 'vitest'
import { isValidShootTransition } from './status-transitions'

describe('isValidShootTransition', () => {
  it('allows scheduled -> going', () => {
    expect(isValidShootTransition('scheduled', 'going')).toBe(true)
  })
  it('allows scheduled -> cancelled', () => {
    expect(isValidShootTransition('scheduled', 'cancelled')).toBe(true)
  })
  it('allows going -> completed', () => {
    expect(isValidShootTransition('going', 'completed')).toBe(true)
  })
  it('allows going -> cancelled (cancelled after reaching the location)', () => {
    expect(isValidShootTransition('going', 'cancelled')).toBe(true)
  })
  it('rejects scheduled -> completed (must go through going first)', () => {
    expect(isValidShootTransition('scheduled', 'completed')).toBe(false)
  })
  it('rejects completed -> anything (terminal state)', () => {
    expect(isValidShootTransition('completed', 'going')).toBe(false)
    expect(isValidShootTransition('completed', 'cancelled')).toBe(false)
    expect(isValidShootTransition('completed', 'scheduled')).toBe(false)
  })
  it('rejects cancelled -> anything (terminal state)', () => {
    expect(isValidShootTransition('cancelled', 'going')).toBe(false)
    expect(isValidShootTransition('cancelled', 'completed')).toBe(false)
    expect(isValidShootTransition('cancelled', 'scheduled')).toBe(false)
  })
  it('rejects a status transitioning to itself', () => {
    expect(isValidShootTransition('scheduled', 'scheduled')).toBe(false)
    expect(isValidShootTransition('going', 'going')).toBe(false)
  })
})
