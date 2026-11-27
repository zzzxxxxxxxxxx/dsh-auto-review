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
 * The reviewer child never receives this section: `guardReviewerContext`
 * strips injected context from its steps, and the renderer returns an empty
 * string for a reviewer session.
 * @module dsh-auto-review/prompt
 */

/** What one session's renderer needs from the resolved config. */
export interface PromptFacts {
  /** Whether the default policy is `ai` (every tool is reviewed). */
  readonly defaultAi: boolean
  /** Explicitly reviewed tool names, when the default is not `ai`. */
  readonly aiTools: readonly string[]
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
  if (!facts.defaultAi && facts.aiTools.length === 0) return ''
  const tools = facts.defaultAi
    ? 'any tool'
    : facts.aiTools.map(tool => `\`${tool}\``).join(', ')
  // Codex's wording (`permissions_instructions.rs` AUTO_REVIEW_SUFFIX): one
  // sentence on state, one on what to do after a rejection. Nothing about what
  // the reviewer can see — that is the reviewer's business, not the agent's.
  return [
    `\`approvals_reviewer\` is \`auto_review\`: approval requests for ${tools} are reviewed for`,
    'compliance with the policy. If a rejection happens, proceed only with a materially safer',
    'alternative, or inform the user of the risk and send a final message to ask for approval.',
  ].join('\n')
}
