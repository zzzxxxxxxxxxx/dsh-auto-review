/**
 * One verdict record, three readers: the stats, the panel fold and the approve
 * list must agree on which records are denials. Regression cover for the
 * critical-allow hole, where the audit said `rejected` while the count said
 * `allow`.
 * @module dsh-auto-review/test/verdict-classes.spec
 */

import { describe, expect, it } from 'vitest'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import {
  fallbackResultText,
  isDenial,
  plainFallbackResultText,
  reviewStats,
  type AutoReviewVerdictId,
} from '../src/events.ts'

type Verdict = Parameters<typeof isDenial>[0]

const base = { reviewId: 'r1', approvalId: 'a1', toolName: 'bash', provider: 'fork', durationMs: 10 }

const verdict = (extra: Record<string, unknown>): Verdict => ({ ...base, ...extra } as unknown as Verdict)
const ALLOW = verdict({ decision: 'allow', reason: 'ok', outcome: 'allowed-once' })
const DENY = verdict({ decision: 'deny', reason: 'no', outcome: 'rejected' })
/** A critical verdict keeps `decision: 'allow'` but settles as rejected. */
const CRITICAL = verdict({ decision: 'allow', reason: 'exfil', riskLevel: 'critical', outcome: 'rejected' })
/** A high-risk allow the plugin handed to the human chain: no outcome. */
const ESCALATED = verdict({ decision: 'allow', reason: 'risky', escalation: 'risk-policy' })
const FAILED = verdict({ fallback: 'timeout', error: 'slow', outcome: 'rejected' })

describe('denial classification', () => {
  it.each([
    ['allow', ALLOW, false],
    ['deny', DENY, true],
    ['critical', CRITICAL, true],
    ['escalated', ESCALATED, false],
    ['failed', FAILED, false],
  ] as const)('%s', (_name, verdict, expected) => {
    expect(isDenial(verdict)).toBe(expected)
  })

  it('counts each record in exactly one bucket', () => {
    const events = [ALLOW, DENY, CRITICAL, ESCALATED, FAILED].map(
      data => ({ type: 'autoReview/verdict', seq: 0, time: 0, data } as unknown as SessionEvent),
    )
    const stats = reviewStats(events)
    expect(stats.allows).toBe(2) // allow + escalated
    expect(stats.denies).toBe(2) // deny + critical
    expect(stats.fallbacks).toBe(1)
  })
})

describe('timeout feedback', () => {
  it('tells the model a missed deadline is not a risk verdict, on both channels', () => {
    const id = 'v1' as AutoReviewVerdictId
    for (const text of [
      fallbackResultText(id, 'timeout', 'reviewer exceeded 20000 ms'),
      plainFallbackResultText('timeout', 'reviewer exceeded 20000 ms'),
    ]) {
      expect(text).toContain('did not finish before its deadline')
      expect(text).toContain('Do not assume the action is unsafe')
    }
  })

  it('keeps the generic failure line for non-timeout failures', () => {
    expect(plainFallbackResultText('unavailable', 'boom')).toContain('failed (unavailable)')
  })
})
