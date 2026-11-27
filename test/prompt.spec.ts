/**
 * Main-agent runtime context while auto review is active: Codex's one-sentence
 * shape, and when it stays empty.
 * @module dsh-auto-review/test/prompt.spec
 */

import { describe, expect, it } from 'vitest'
import { renderAutoReviewContext } from '../src/prompt.ts'

const IMAGES = { enabled: true, maxCount: 4, maxBytes: 8 * 1024 * 1024 }

describe('auto-review runtime context', () => {
  it('names the reviewed tools and what to do after a rejection', () => {
    const text = renderAutoReviewContext({
      defaultAi: false,
      aiTools: ['bash', 'edit'],
      reasonMaxChars: 2000,
      images: IMAGES,
    })
    expect(text).toContain('`approvals_reviewer` is `auto_review`')
    expect(text).toContain('`bash`, `edit`')
    expect(text).toContain('materially safer alternative')
    expect(text.split('\n')).toHaveLength(4)
  })

  it('says any tool when the default policy is ai', () => {
    const text = renderAutoReviewContext({
      defaultAi: true,
      aiTools: [],
      reasonMaxChars: 8000,
      images: IMAGES,
    })
    expect(text).toContain('requested by any tool')
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
