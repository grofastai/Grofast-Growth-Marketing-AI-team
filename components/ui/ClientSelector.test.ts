import { describe, it, expect } from 'vitest'
import { selectorAction } from './ClientSelector'

describe('selectorAction', () => {
  it('clears the value when the placeholder row is picked', () => {
    // The reported bug: on the Tasks board the placeholder reads "All Clients". The
    // component used to `if (!v) return` on it, so once a client was chosen there was
    // no way back to showing every client.
    expect(selectorAction('', 'ASHOK MISSION COLLEGE')).toEqual({ type: 'select', value: '' })
  })

  it('selects a client', () => {
    expect(selectorAction('GP HOSPITAL', '')).toEqual({ type: 'select', value: 'GP HOSPITAL' })
    expect(selectorAction('GP HOSPITAL', 'NETRA EYE CARE')).toEqual({ type: 'select', value: 'GP HOSPITAL' })
  })

  it('opens the past-clients list without changing the value', () => {
    expect(selectorAction('__past__', 'GP HOSPITAL')).toEqual({ type: 'browse_past' })
  })

  it('clears on the way back only when a past client was showing', () => {
    expect(selectorAction('__back__', 'OLD CLIENT')).toEqual({ type: 'back_to_active', clear: true })
    // Multi-select callers sit at "" the whole time — going back must not fire a change.
    expect(selectorAction('__back__', '')).toEqual({ type: 'back_to_active', clear: false })
  })
})
