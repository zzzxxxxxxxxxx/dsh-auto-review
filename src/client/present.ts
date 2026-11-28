/**
 * Pure presentation for the review panel: verdict rows and badges as plain
 * strings and tone codes — no I/O, clock, or randomness. The component
 * owns layout and interaction; this module owns the text.
 * @module dsh-auto-review/client/present
 */

import type { AutoReviewVerdictView } from '../projection-types.ts'

/** Badge tones the component maps to scoped styles. */
export type VerdictTone = 'allow' | 'deny' | 'fallback' | 'escalation'

/** One presented verdict row. */
export interface PresentedVerdict {
  readonly reviewId: string
  readonly toolName: string
  readonly label: string
  readonly detail: string
  readonly tone: VerdictTone
}

/** Present one verdict row (the component supplies the localized label texts). */
export function presentVerdict(
  verdict: AutoReviewVerdictView,
  labels: {
    readonly allow: string
    readonly deny: string
    readonly fallback: (kind: string) => string
    readonly escalation: string
  },
): PresentedVerdict {
  if (verdict.fallback !== undefined) {
    return {
      reviewId: verdict.reviewId,
      toolName: verdict.toolName,
      label: labels.fallback(verdict.fallback),
      detail: `${verdict.durationMs} ms`,
      tone: 'fallback',
    }
  }
  if (verdict.escalation === 'risk-policy') {
    return {
      reviewId: verdict.reviewId,
      toolName: verdict.toolName,
      label: labels.escalation,
      detail: verdict.reason ?? '',
      tone: 'escalation',
    }
  }
  // Risk and authorization are what separates "denied because dangerous" from
  // "denied because unconfirmed"; the row used to read identically for both.
  // A critical verdict settles as decision 'allow' + outcome 'rejected', so
  // the row follows the SETTLED outcome, not the reviewer's raw decision.
  const denied = verdict.decision === 'deny' || verdict.outcome === 'rejected'
  const risk = verdict.riskLevel === undefined
    ? ''
    : ` · ${verdict.riskLevel}${verdict.riskScore === undefined ? '' : ` ${String(verdict.riskScore)}`}`
  const authorization = verdict.userAuthorization === undefined ? '' : ` · auth ${verdict.userAuthorization}`
  const label = `${denied ? labels.deny : labels.allow}${risk}${authorization}`
  return {
    reviewId: verdict.reviewId,
    toolName: verdict.toolName,
    label,
    detail: verdict.reason ?? `${verdict.durationMs} ms`,
    tone: denied ? 'deny' : 'allow',
  }
}
