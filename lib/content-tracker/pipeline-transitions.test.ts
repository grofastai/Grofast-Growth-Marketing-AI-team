import { describe, it, expect } from 'vitest'
import { isValidPipelineTransition, isStatusAllowedForSource, entryStatusForSource } from './pipeline-transitions'

describe('isValidPipelineTransition', () => {
  it('allows the ads-video front half: scripting -> voiceover -> ready_to_edit', () => {
    expect(isValidPipelineTransition('scripting', 'voiceover')).toBe(true)
    expect(isValidPipelineTransition('voiceover', 'ready_to_edit')).toBe(true)
  })
  it('allows the poster front half: design -> editing', () => {
    expect(isValidPipelineTransition('design', 'editing')).toBe(true)
  })
  it('allows the shared production chain', () => {
    expect(isValidPipelineTransition('ready_to_edit', 'editing')).toBe(true)
    expect(isValidPipelineTransition('editing', 'edited')).toBe(true)
    expect(isValidPipelineTransition('edited', 'on_review')).toBe(true)
    expect(isValidPipelineTransition('ready_to_post', 'posted')).toBe(true)
  })
  it('on_review branches two ways: approve to ready_to_post, or bounce back to editing', () => {
    expect(isValidPipelineTransition('on_review', 'ready_to_post')).toBe(true)
    expect(isValidPipelineTransition('on_review', 'editing')).toBe(true)
  })
  it('rejects skipping a stage', () => {
    expect(isValidPipelineTransition('ready_to_edit', 'edited')).toBe(false)
    expect(isValidPipelineTransition('scripting', 'ready_to_edit')).toBe(false)
    expect(isValidPipelineTransition('edited', 'ready_to_post')).toBe(false)
  })
  it('rejects posted -> anything (terminal state)', () => {
    expect(isValidPipelineTransition('posted', 'editing')).toBe(false)
    expect(isValidPipelineTransition('posted', 'ready_to_post')).toBe(false)
  })
  it('rejects a status transitioning to itself', () => {
    expect(isValidPipelineTransition('editing', 'editing')).toBe(false)
  })
  it('allows cancelling from Ready to Edit or Editing', () => {
    expect(isValidPipelineTransition('ready_to_edit', 'cancelled')).toBe(true)
    expect(isValidPipelineTransition('editing', 'cancelled')).toBe(true)
  })
  it('rejects cancelling from any other stage', () => {
    expect(isValidPipelineTransition('design', 'cancelled')).toBe(false)
    expect(isValidPipelineTransition('edited', 'cancelled')).toBe(false)
  })
  it('rejects cancelled -> anything (terminal state)', () => {
    expect(isValidPipelineTransition('cancelled', 'ready_to_edit')).toBe(false)
    expect(isValidPipelineTransition('cancelled', 'editing')).toBe(false)
  })
})

describe('isStatusAllowedForSource', () => {
  it('scripting and voiceover are only reachable by ads_video items', () => {
    expect(isStatusAllowedForSource('scripting', 'ads_video')).toBe(true)
    expect(isStatusAllowedForSource('scripting', 'shoot')).toBe(false)
    expect(isStatusAllowedForSource('voiceover', 'poster')).toBe(false)
  })
  it('design is only reachable by poster items', () => {
    expect(isStatusAllowedForSource('design', 'poster')).toBe(true)
    expect(isStatusAllowedForSource('design', 'shoot')).toBe(false)
    expect(isStatusAllowedForSource('design', 'ads_video')).toBe(false)
  })
  it('shared stages are reachable by every source', () => {
    for (const source of ['shoot', 'ads_video', 'poster'] as const) {
      expect(isStatusAllowedForSource('editing', source)).toBe(true)
      expect(isStatusAllowedForSource('on_review', source)).toBe(true)
      expect(isStatusAllowedForSource('posted', source)).toBe(true)
    }
  })
})

describe('entryStatusForSource', () => {
  it('a shoot enters at ready_to_edit', () => {
    expect(entryStatusForSource('shoot')).toBe('ready_to_edit')
  })
  it('an ads video enters at scripting', () => {
    expect(entryStatusForSource('ads_video')).toBe('scripting')
  })
  it('a poster enters at design', () => {
    expect(entryStatusForSource('poster')).toBe('design')
  })
})
