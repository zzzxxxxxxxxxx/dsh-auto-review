/**
 * Codex-parity risk scoring: the reviewer reports a 0-100 score and the plugin
 * gates an allow on `riskPolicy.autoAllowScore` instead of a blanket deny.
 * @module dsh-auto-review/test/risk-score.spec
 */

import { describe, expect, it } from 'vitest'
import { parseVerdict, VERDICT_SCHEMA } from '../src/review.ts'
import { resolveConfig } from '../src/index.ts'
import { applyAutoReview, initAutoReviewProjection, viewAutoReview } from '../src/projection.ts'

describe('risk score verdicts', () => {
  it('accepts an integer score alongside the decision', () => {
    const verdict = parseVerdict({ decision: 'allow', reason: 'routine', riskLevel: 'low', riskScore: 12 }, 200)
    expect(verdict).toMatchObject({ decision: 'allow', riskScore: 12 })
  })

  it('rejects a verdict that omits the level or the score', () => {
    expect(parseVerdict({ decision: 'deny', reason: 'nope' }, 200)).toBeUndefined()
    expect(parseVerdict({ decision: 'deny', reason: 'nope', riskLevel: 'low' }, 200)).toBeUndefined()
  })

  it('rejects out-of-range and non-integer scores', () => {
    for (const riskScore of [-1, 101, 12.5, '12', null]) {
      expect(parseVerdict({ decision: 'allow', reason: 'x', riskLevel: 'low', riskScore }, 200)).toBeUndefined()
    }
  })
})

describe('risk score contract', () => {
  it('requires the score in the structured verdict schema', () => {
    expect(VERDICT_SCHEMA.required).toEqual(['decision', 'reason', 'riskLevel', 'riskScore'])
  })
})

describe('auto-allow score config', () => {
  it('keeps the numeric valve closed and floors high-risk authorization at medium', () => {
    expect(resolveConfig().riskPolicy.autoAllowScore).toBe(100)
    expect(resolveConfig().riskPolicy.minAuthorizationForHigh).toBe('medium')
  })

  it('accepts 0..100 and rejects anything else', () => {
    expect(resolveConfig({ riskPolicy: { autoAllowScore: 0 } }).riskPolicy.autoAllowScore).toBe(0)
    expect(resolveConfig({ riskPolicy: { autoAllowScore: 100 } }).riskPolicy.autoAllowScore).toBe(100)
    for (const autoAllowScore of [-1, 101, 12.5]) {
      expect(() => resolveConfig({ riskPolicy: { autoAllowScore } })).toThrow(/autoAllowScore/u)
    }
  })
})

describe('risk score in the audit view', () => {
  it('carries the score into the projection view (the wire schema bounds it)', () => {
    const event = (riskScore: unknown): never => ({
      type: 'autoReview/verdict',
      seq: 0,
      time: 0,
      data: {
        reviewId: 'r1',
        approvalId: 'a1',
        toolName: 'bash',
        provider: 'fork',
        durationMs: 5,
        decision: 'deny',
        reason: 'no',
        riskScore,
      },
    }) as never
    const folded = applyAutoReview(initAutoReviewProjection(true, 's1'), event(73))
    expect(viewAutoReview(folded).recent[0]).toMatchObject({ riskScore: 73 })
  })
})

describe('authorization dimension', () => {
  it('accepts the four authorization levels and the critical risk level', () => {
    expect(parseVerdict({ decision: 'allow', reason: 'ok', riskLevel: 'critical', userAuthorization: 'high', riskScore: 99 }, 200))
      .toMatchObject({ riskLevel: 'critical', userAuthorization: 'high' })
    expect(parseVerdict({ decision: 'deny', reason: 'no', userAuthorization: 'unknown', riskLevel: 'low', riskScore: 10 }, 200))
      .toMatchObject({ userAuthorization: 'unknown' })
  })

  it('rejects an unknown level in either dimension', () => {
    expect(parseVerdict({ decision: 'allow', reason: 'x', riskLevel: 'severe', riskScore: 10 }, 200)).toBeUndefined()
    expect(parseVerdict({ decision: 'allow', reason: 'x', userAuthorization: 'strong', riskLevel: 'low', riskScore: 10 }, 200)).toBeUndefined()
  })
})
