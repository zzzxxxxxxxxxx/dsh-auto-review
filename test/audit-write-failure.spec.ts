/**
 * A transient audit-write failure must not poison the process: the record is
 * mirrored in memory, the next record retries the same appender, and the
 * session log stays free of the refused event.
 * @module dsh-auto-review/test/audit-write-failure.spec
 */

import { describe, expect, it, vi } from 'vitest'
import { CommandId } from '@deepseek-ai/dsh-commands'
import type { CommandDefinition } from '@deepseek-ai/dsh-commands'
import { CallId } from './call-id.ts'
import { dispatchAskedApproval, mountHarness } from './harness.ts'
import { auditEventTypeOf } from '../src/audit.ts'

const { failing } = vi.hoisted(() => ({
  failing: vi.fn(() => {
    throw new Error('session append cannot reenter while another append is being published')
  }),
}))

vi.mock('../src/audit.ts', async importOriginal => {
  const original = await importOriginal() as typeof import('../src/audit.ts')
  return {
    ...original,
    loadAppendPluginRecord: vi.fn(() => (() => undefined)),
    resolveAppendPluginRecord: vi.fn(() => failing),
  }
})

const next: () => Promise<string> = () => Promise.resolve('allowed-once')

function invoke(definition: CommandDefinition | undefined, harness: Awaited<ReturnType<typeof mountHarness>>, rawInput: string) {
  if (definition === undefined) throw new Error('command was never registered')
  return definition.handler({
    commandId: CommandId('cmd-write-failure'),
    agent: harness.agent,
    rawInput,
    attachments: [],
    signal: new AbortController().signal,
  })
}

describe('audit write failure', () => {
  it('mirrors the refused record and retries instead of pinning the failure', async () => {
    const harness = await mountHarness(
      { toolsPolicy: { overrides: { bash: 'ai' } } },
      () => ({ verdict: { decision: 'deny', reason: 'destructive' } }),
    )
    const first = await dispatchAskedApproval(harness.ctx, harness.session, {
      agent: harness.agent,
      toolName: 'bash',
      callId: CallId('call-refused'),
    }, next)
    expect(first.outcome).toBe('rejected')
    // Nothing landed in the log: the appender refused the write.
    expect(harness.session.snapshotEvents().some(event => auditEventTypeOf(event.type) === 'autoReview/verdict')).toBe(false)
    // The refused verdict still counts in the degraded mirror.
    const status = invoke(harness.commands.registered[0], harness, 'status')
    expect((status as { text: string }).text).toContain('0 allows, 1 denies')

    const second = await dispatchAskedApproval(harness.ctx, harness.session, {
      agent: harness.agent,
      toolName: 'bash',
      callId: CallId('call-retried'),
    }, next)
    expect(second.outcome).toBe('rejected')
    // The next record retried the host appender rather than the poisoned null.
    expect(failing).toHaveBeenCalledTimes(2)
    const after = invoke(harness.commands.registered[0], harness, 'status')
    expect((after as { text: string }).text).toContain('0 allows, 2 denies')
  })
})
