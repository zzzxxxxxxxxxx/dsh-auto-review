/**
 * Codex-parity risk scoring: the reviewer reports a 0-100 score and the plugin
 * gates an allow on `riskPolicy.autoAllowScore` instead of a blanket deny.
 * @module dsh-auto-review/test/risk-score.spec
 */

import { describe, expect, it } from 'vitest'
import { parseVerdict } from '../src/review.ts'
import { resolveConfig } from '../src/index.ts'

describe('risk score verdicts', () => {
  it('accepts an integer score alongside the decision', () => {
    const verdict = parseVerdict({ decision: 'allow', reason: 'routine', riskScore: 12 }, 200)
    expect(verdict).toMatchObject({ decision: 'allow', riskScore: 12 })
  })

  it('keeps scoreless verdicts valid', () => {
    expect(parseVerdict({ decision: 'deny', reason: 'nope' }, 200)).toMatchObject({ decision: 'deny' })
  })

  it('rejects out-of-range and non-integer scores', () => {
    for (const riskScore of [-1, 101, 12.5, '12', null]) {
      expect(parseVerdict({ decision: 'allow', reason: 'x', riskScore }, 200)).toBeUndefined()
    }
  })
})

describe('auto-allow score config', () => {
  it('defaults to the Codex guardian threshold', () => {
    expect(resolveConfig().riskPolicy.autoAllowScore).toBe(80)
  })

  it('accepts 0..100 and rejects anything else', () => {
    expect(resolveConfig({ riskPolicy: { autoAllowScore: 0 } }).riskPolicy.autoAllowScore).toBe(0)
    expect(resolveConfig({ riskPolicy: { autoAllowScore: 100 } }).riskPolicy.autoAllowScore).toBe(100)
    for (const autoAllowScore of [-1, 101, 12.5]) {
      expect(() => resolveConfig({ riskPolicy: { autoAllowScore } })).toThrow(/autoAllowScore/u)
    }
  })
})
