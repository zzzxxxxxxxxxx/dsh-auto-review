/**
 * Reviewer image selection: the caps, eviction order, dedupe, and the disabled
 * path that keeps the review request text-only.
 * @module dsh-auto-review/test/images.spec
 */

import { describe, expect, it } from 'vitest'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { DEFAULT_IMAGES, selectReviewImages } from '../src/images.ts'
import { resolveConfig } from '../src/index.ts'

/** One user message carrying one image plus a text part. */
function imageEvent(id: string, bytes: number): SessionEvent {
  return {
    type: 'user/message',
    data: {
      source: { kind: 'user' },
      content: [
        { type: 'text', text: `please look at ${id}` },
        {
          type: 'image',
          attachment: {
            attachmentId: id,
            mediaType: 'image/png',
            bytes,
            width: 8,
            height: 8,
          },
        },
      ],
    },
  } as unknown as SessionEvent
}

describe('reviewer image selection', () => {
  it('keeps the newest images under the count cap, in chronological order', () => {
    const events = Array.from({ length: 6 }, (_, index) => imageEvent(`img-${index}`, 1000))
    const selected = selectReviewImages(events, DEFAULT_IMAGES)
    expect(selected.blocks.map(block => block.attachment.attachmentId)).toEqual([
      'img-2',
      'img-3',
      'img-4',
      'img-5',
    ])
    expect(selected.dropped).toBe(2)
  })

  it('deduplicates repeated occurrences of one attachment', () => {
    const events = [imageEvent('img-a', 1000), imageEvent('img-a', 1000)]
    const selected = selectReviewImages(events, DEFAULT_IMAGES)
    expect(selected.blocks).toHaveLength(1)
    expect(selected.dropped).toBe(0)
  })

  it('drops an image whose bytes would exceed the byte cap but keeps smaller older ones', () => {
    const events = [imageEvent('small-1', 100), imageEvent('huge', 5000), imageEvent('small-2', 100)]
    const selected = selectReviewImages(events, { maxCount: 4, maxBytes: 250 })
    expect(selected.blocks.map(block => block.attachment.attachmentId)).toEqual(['small-1', 'small-2'])
    expect(selected.dropped).toBe(1)
  })

  it('selects nothing when the count cap is zero (the text-only setting)', () => {
    const events = [imageEvent('img-1', 1000)]
    expect(selectReviewImages(events, { ...DEFAULT_IMAGES, maxCount: 0 })).toEqual({
      blocks: [],
      dropped: 0,
    })
  })

  it('limits selection to the transcript window (last N turns)', () => {
    const events = [
      imageEvent('old', 1000),
      { type: 'turn/start', data: { turn: 2 } },
      imageEvent('new', 1000),
    ] as unknown as SessionEvent[]
    expect(selectReviewImages(events, DEFAULT_IMAGES).blocks.map(block => block.attachment.attachmentId)).toEqual(['old', 'new'])
    expect(selectReviewImages(events, DEFAULT_IMAGES, 1).blocks.map(block => block.attachment.attachmentId)).toEqual(['new'])
  })

  it('ignores events that cannot carry user images', () => {
    const events = [
      {
        type: 'assistant/message',
        data: { turn: 1, step: 1, message: { role: 'assistant', content: [{ type: 'text', text: 'hi' }] } },
      },
    ] as unknown as SessionEvent[]
    expect(selectReviewImages(events, DEFAULT_IMAGES).blocks).toEqual([])
  })
})

describe('image config resolution', () => {
  it('defaults to forwarding up to four images inside 8 MiB', () => {
    expect(resolveConfig().images).toEqual({ maxCount: 4, maxBytes: 8 * 1024 * 1024 })
  })

  it('accepts overrides and rejects non-positive caps', () => {
    expect(resolveConfig({ images: { maxCount: 2, maxBytes: 1024 } }).images).toEqual({
      maxCount: 2,
      maxBytes: 1024,
    })
    // 0 is the text-only setting; a negative cap is a configuration error.
    expect(resolveConfig({ images: { maxCount: 0 } }).images.maxCount).toBe(0)
    expect(() => resolveConfig({ images: { maxCount: -1 } })).toThrow(/images\.maxCount/u)
    expect(() => resolveConfig({ images: { maxBytes: -1 } })).toThrow(/images\.maxBytes/u)
  })
})

describe('image provenance', () => {
  it('ignores images from a user-shaped message a plugin injected', () => {
    const injected = {
      type: 'user/message',
      data: {
        source: { kind: 'plugin', plugin: 'some-bridge' },
        content: [{
          type: 'image',
          attachment: { attachmentId: 'forged', mediaType: 'image/png', bytes: 10, width: 1, height: 1 },
        }],
      },
    } as unknown as SessionEvent
    expect(selectReviewImages([injected], DEFAULT_IMAGES).blocks).toEqual([])
  })

  it('accepts a message the user produced', () => {
    const fromUser = {
      type: 'user/message',
      data: {
        source: { kind: 'user' },
        content: [{
          type: 'image',
          attachment: { attachmentId: 'real', mediaType: 'image/png', bytes: 10, width: 1, height: 1 },
        }],
      },
    } as unknown as SessionEvent
    expect(selectReviewImages([fromUser], DEFAULT_IMAGES).blocks).toHaveLength(1)
  })
})

describe('text-only route memory', () => {
  it('learns and forgets a route that rejected images', async () => {
    const { isTextOnlyRoute, markRouteTextOnly, resetTextOnlyRoutes } = await import('../src/images.ts')
    resetTextOnlyRoutes()
    expect(isTextOnlyRoute('k')).toBe(false)
    markRouteTextOnly('k')
    expect(isTextOnlyRoute('k')).toBe(true)
    resetTextOnlyRoutes()
    expect(isTextOnlyRoute('k')).toBe(false)
  })

  it('forgets a text-only route after its TTL instead of for the process lifetime', async () => {
    const { TEXT_ONLY_ROUTE_TTL_MS, isTextOnlyRoute, markRouteTextOnly, resetTextOnlyRoutes } = await import('../src/images.ts')
    resetTextOnlyRoutes()
    markRouteTextOnly('k', 1_000)
    expect(isTextOnlyRoute('k', 1_000 + TEXT_ONLY_ROUTE_TTL_MS - 1)).toBe(true)
    expect(isTextOnlyRoute('k', 1_000 + TEXT_ONLY_ROUTE_TTL_MS)).toBe(false)
    resetTextOnlyRoutes()
  })
})
