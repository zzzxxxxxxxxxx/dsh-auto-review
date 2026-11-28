/**
 * Model-facing runtime context for the MAIN agent while auto review is active.
 *
 * The plugin decides approvals outside the model's view, so without this
 * section the main agent has no way to know that an `ai`-policy escalation is
 * answered by a reviewer rather than by the user — it writes justifications as
 * if a human were reading them, retries around denials, and expects the user to
 * have seen the call. The text states what the reviewer can see, what it
 * cannot, and how to write an escalation the reviewer can approve.
 *
 * The reviewer child never receives this section: the prompt-context callback
 * returns an empty string for a tracked reviewer session, and the pre-step
 * firewall (`guardReviewerContext`) additionally drops injected context from
 * its steps.
 * @module dsh-auto-review/prompt
 */

/** What one session's renderer needs from the resolved config. */
export interface PromptFacts {
  /** Whether the default policy is `ai` (every tool is reviewed). */
  readonly defaultAi: boolean
  /** Explicitly reviewed tool names, when the default is not `ai`. */
  readonly aiTools: readonly string[]
  /** Risk rules (field + pattern) that route a matching call to AI review. */
  readonly aiRiskRules?: readonly string[]
}

/**
 * Render the auto-review runtime context.
 *
 * Kept deliberately short: it is re-read on every step, and the verdict rules
 * that matter live in the reviewer's own prompt, not here.
 * @param facts - the session's resolved policy facts.
 * @returns the context text, or an empty string when nothing is AI-reviewed.
 */
export function renderAutoReviewContext(facts: PromptFacts): string {
  // A risk rule can route a call to AI review even when every tool's policy is
  // `human`; leaving it out made the main agent's context disagree with the
  // policy that actually settles the request.
  const aiRiskRules = facts.aiRiskRules ?? []
  if (!facts.defaultAi && facts.aiTools.length === 0 && aiRiskRules.length === 0) return ''
  const subjects: string[] = []
  if (facts.defaultAi) subjects.push('any tool')
  else subjects.push(...facts.aiTools.map(tool => `\`${tool}\``))
  if (aiRiskRules.length > 0) subjects.push(`calls matching ${aiRiskRules.join(', ')}`)
  const tools = subjects.join(', ')
  // Modelled on Codex's AUTO_REVIEW_SUFFIX (one sentence on state, one on what
  // to do after a rejection) but in DSH's own vocabulary: `approvals_reviewer`
  // and `auto_review` are Codex configuration keys and mean nothing here, where
  // the same policy is a permission preset plus this plugin's tool policy.
  return [
    `Approval requests for ${tools} are reviewed automatically by a separate reviewer. High-risk`,
    'or uncertain requests may still be escalated to the user. If a rejection happens, proceed only',
    'with a materially safer alternative, or inform the user of the risk and send a final message to',
    'ask for approval.',
  ].join('\n')
}
