/**
 * Main-agent runtime context while auto review is active: what it states, and
 * when it stays empty.
 * @module dsh-auto-review/test/prompt.spec
 */

import { describe, expect, it } from 'vitest'
import { renderAutoReviewContext } from '../src/prompt.ts'

const IMAGES = { enabled: true, maxCount: 4, maxBytes: 8 * 1024 * 1024 }

describe('auto-review runtime context', () => {
  it('names the reviewed tools, the truncation cap and the image budget', () => {
    const text = renderAutoReviewContext({
      defaultAi: false,
      aiTools: ['bash', 'edit'],
      reasonMaxChars: 2000,
      images: IMAGES,
    })
    expect(text).toContain('`bash`, `edit`')
    expect(text).toContain('2000 characters')
    expect(text).toContain('up to 4 images')
    expect(text).toContain('test or a probe of the approval gate are rejected')
    expect(text).toContain('Do not retry around it')
    // Authority is about whose instruction it is, not the medium: an attached
    // screenshot is the user's own statement, text it merely captured is not.
    expect(text).toContain("a screenshot they sent counts as their own statement")
    expect(text).toContain('captured')
  })

  it('says every tool is reviewed when the default policy is ai', () => {
    const text = renderAutoReviewContext({
      defaultAi: true,
      aiTools: [],
      reasonMaxChars: 8000,
      images: IMAGES,
    })
    expect(text).toContain('every tool that asks for approval')
  })

  it('does not promise images when they are disabled', () => {
    const text = renderAutoReviewContext({
      defaultAi: false,
      aiTools: ['bash'],
      reasonMaxChars: 2000,
      images: { ...IMAGES, enabled: false },
    })
    expect(text).toContain('It does not see images')
    expect(text).not.toContain('up to 4 images')
  })

  it('contributes nothing when no tool is AI-reviewed', () => {
    expect(renderAutoReviewContext({
      defaultAi: false,
      aiTools: [],
      reasonMaxChars: 2000,
      images: IMAGES,
    })).toBe('')
  })
})
