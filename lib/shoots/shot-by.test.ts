import { describe, it, expect } from 'vitest'
import { resolveShotBy } from './shot-by'

describe('resolveShotBy', () => {
  it('returns the full crew when the shoot has one', () => {
    expect(resolveShotBy(['user-a', 'user-b', 'user-c'], 'admin-id')).toEqual(['user-a', 'user-b', 'user-c'])
  })
  it('returns a single crew member unchanged', () => {
    expect(resolveShotBy(['user-a'], 'admin-id')).toEqual(['user-a'])
  })
  it('falls back to the completer when no crew was recorded', () => {
    expect(resolveShotBy([], 'admin-id')).toEqual(['admin-id'])
    expect(resolveShotBy(undefined, 'admin-id')).toEqual(['admin-id'])
    expect(resolveShotBy(null, 'admin-id')).toEqual(['admin-id'])
  })
})
