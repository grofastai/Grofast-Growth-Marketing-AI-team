import { describe, it, expect } from 'vitest'
import { isValidPipelineTransition, isStatusAllowedForSource, entryStatusForSource } from './pipeline-transitions'

describe('isValidPipelineTransition', () => {
  it('allows the ads-video front half: scripting -> voiceover -> ready_to_edit', () => {
    expect(isValidPipelineTransition('scripting', 'voiceover')).toBe(true)
    expect(isValidPipelineTransition('voiceover', 'ready_to_edit')).toBe(true)
  })
  it('allows the poster front half: design -> on_review', () => {
    expect(isValidPipelineTransition('design', 'on_review')).toBe(true)
  })
  it('allows ready_to_edit -> on_review directly (no separate Edited stage)', () => {
    expect(isValidPipelineTransition('ready_to_edit', 'on_review')).toBe(true)
  })
  it('on_review branches three ways: Branding Ready, Ads Ready, or Cancelled', () => {
    expect(isValidPipelineTransition('on_review', 'branding_ready')).toBe(true)
    expect(isValidPipelineTransition('on_review', 'ads_ready')).toBe(true)
    expect(isValidPipelineTransition('on_review', 'cancelled')).toBe(true)
  })
  it('rejects on_review skipping straight to posted', () => {
    expect(isValidPipelineTransition('on_review', 'posted')).toBe(false)
  })
  it('allows both ready lanes to complete to posted', () => {
    expect(isValidPipelineTransition('branding_ready', 'posted')).toBe(true)
    expect(isValidPipelineTransition('ads_ready', 'posted')).toBe(true)
  })
  it('rejects skipping a stage', () => {
    expect(isValidPipelineTransition('scripting', 'ready_to_edit')).toBe(false)
    expect(isValidPipelineTransition('ready_to_edit', 'posted')).toBe(false)
  })
  it('rejects posted -> anything (terminal state)', () => {
    expect(isValidPipelineTransition('posted', 'on_review')).toBe(false)
    expect(isValidPipelineTransition('posted', 'branding_ready')).toBe(false)
  })
  it('rejects a status transitioning to itself', () => {
    expect(isValidPipelineTransition('on_review', 'on_review')).toBe(false)
  })
  it('allows cancelling from Ready to Edit or Design', () => {
    expect(isValidPipelineTransition('ready_to_edit', 'cancelled')).toBe(true)
    expect(isValidPipelineTransition('design', 'cancelled')).toBe(true)
  })
  it('allows cancelling an Ads Video script before it reaches a shoot or edit', () => {
    expect(isValidPipelineTransition('scripting', 'cancelled')).toBe(true)
    expect(isValidPipelineTransition('voiceover', 'cancelled')).toBe(true)
  })
  it('rejects cancelling from Branding Ready or Ads Ready (already approved out of review)', () => {
    expect(isValidPipelineTransition('branding_ready', 'cancelled')).toBe(false)
    expect(isValidPipelineTransition('ads_ready', 'cancelled')).toBe(false)
  })
  it('rejects cancelled -> anything (terminal state)', () => {
    expect(isValidPipelineTransition('cancelled', 'ready_to_edit')).toBe(false)
    expect(isValidPipelineTransition('cancelled', 'on_review')).toBe(false)
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
      expect(isStatusAllowedForSource('on_review', source)).toBe(true)
      expect(isStatusAllowedForSource('branding_ready', source)).toBe(true)
      expect(isStatusAllowedForSource('ads_ready', source)).toBe(true)
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
