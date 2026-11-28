/**
 * Main-agent runtime context while auto review is active: Codex's one-sentence
 * shape, and when it stays empty.
 * @module dsh-auto-review/test/prompt.spec
 */

import { describe, expect, it } from 'vitest'
import { renderAutoReviewContext } from '../src/prompt.ts'

describe('auto-review runtime context', () => {
  it('names the reviewed tools and what to do after a rejection', () => {
    const text = renderAutoReviewContext({
      defaultAi: false,
      aiTools: ['bash', 'edit'],
    })
    expect(text).toContain('reviewed automatically by a separate reviewer')
    // Codex's configuration keys do not exist in DSH and must not be named.
    expect(text).not.toContain('approvals_reviewer')
    expect(text).toContain('`bash`, `edit`')
    expect(text).toContain('materially safer')
    expect(text.split('\n')).toHaveLength(4)
  })

  it('says any tool when the default policy is ai', () => {
    const text = renderAutoReviewContext({
      defaultAi: true,
      aiTools: [],
    })
    expect(text).toContain('requests for any tool')
  })

  it('contributes nothing when no tool is AI-reviewed', () => {
    expect(renderAutoReviewContext({
      defaultAi: false,
      aiTools: [],
    })).toBe('')
  })
})
