/**
 * Reviewer image selection: which user-attached images may travel to the
 * reviewer as visual evidence for one pending call.
 *
 * The caps mirror the Codex guardian (at most four transcript images, 8 MiB
 * total, oldest dropped first). Images stay evidence and never authority: the
 * review prompt's untrusted fence already covers everything the transcript
 * carries, so this module only decides *which* occurrences reach the model.
 * @module dsh-auto-review/images
 */

import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import type { SessionEvent } from '@deepseek-ai/dsh-session'

/** One durable image block as it appears in user content. */
export type ReviewImageBlock = Extract<ContentBlock, { type: 'image' }>

/** Resolved reviewer image settings. */
export interface ImagesConfig {
  /**
   * Hard cap on images per review; the oldest occurrences are dropped first.
   * `0` disables image forwarding entirely (the reviewer then gets text only).
   */
  readonly maxCount: number
  /** Hard cap on the summed encoded bytes of forwarded images. */
  readonly maxBytes: number
}

/** Defaults mirroring the Codex guardian's transcript image caps. */
export const DEFAULT_IMAGES: ImagesConfig = Object.freeze({
  maxCount: 4,
  maxBytes: 8 * 1024 * 1024,
})

/**
 * Reviewer routes that rejected image input at runtime. The host's catalog does
 * not always disclose modalities (a model can accept images while the listing
 * omits `inputModalities`), so the first failed attempt is what teaches the
 * plugin that this route is text-only. Process-local: a restart re-probes.
 */
const textOnlyRoutes = new Set<string>()

/**
 * Record that one reviewer route cannot take image input.
 * @param routeKey - the reviewer configuration identity (see `reviewRouteKey`).
 */
export function markRouteTextOnly(routeKey: string): void {
  textOnlyRoutes.add(routeKey)
}

/**
 * Whether one reviewer route is known to be text-only.
 * @param routeKey - the reviewer configuration identity (see `reviewRouteKey`).
 * @returns true when an earlier review on this route failed with images.
 */
export function isTextOnlyRoute(routeKey: string): boolean {
  return textOnlyRoutes.has(routeKey)
}

/** Test seam: forget every learned route. */
export function resetTextOnlyRoutes(): void {
  textOnlyRoutes.clear()
}

/** The images selected for one review, plus what the caps discarded. */
export interface SelectedReviewImages {
  /** The selected blocks, oldest first, in the order they should reach the model. */
  readonly blocks: readonly ReviewImageBlock[]
  /** How many user images the caps dropped (count or byte pressure). */
  readonly dropped: number
}

/** Message sources whose images count as "the user attached this". */
const TRUSTED_IMAGE_SOURCES = new Set(['user'])

/**
 * Narrow one event's content array to the durable image blocks it carries.
 *
 * Only a message the USER produced qualifies. A plugin-injected `user/message`
 * (a bridge, a mod, a replayed prompt) is user-shaped but not user-authored, and
 * letting its images count as authorization would hand any plugin the ability to
 * authorize a boundary crossing.
 */
function imageBlocksOf(event: SessionEvent): readonly ReviewImageBlock[] {
  if (event.type !== 'user/message') return []
  const source = (event.data as { source?: { kind?: unknown } }).source
  if (typeof source?.kind !== 'string' || !TRUSTED_IMAGE_SOURCES.has(source.kind)) return []
  const content = event.data.content as readonly ContentBlock[]
  return content.filter((block): block is ReviewImageBlock => block.type === 'image')
}

/**
 * Select the conversation's user images for one review.
 *
 * Walks the events newest-first so a tight budget keeps the images nearest the
 * pending call, deduplicates repeated occurrences of the same attachment, and
 * drops an image whose bytes would exceed {@link ImagesConfig.maxBytes} while
 * still admitting smaller ones further back. The result is reversed into
 * chronological order, which is the order the model reads.
 * @param events - the requesting session's durable events, in order.
 * @param config - the resolved image caps.
 * @returns the selected blocks and the number of dropped occurrences.
 */
export function selectReviewImages(
  events: readonly SessionEvent[],
  config: ImagesConfig,
): SelectedReviewImages {
  if (config.maxCount === 0) return { blocks: [], dropped: 0 }
  const picked: ReviewImageBlock[] = []
  const seen = new Set<string>()
  let bytes = 0
  let dropped = 0
  for (const event of [...events].reverse()) {
    for (const block of [...imageBlocksOf(event)].reverse()) {
      const attachmentId = String(block.attachment.attachmentId)
      if (seen.has(attachmentId)) continue
      seen.add(attachmentId)
      const size = block.attachment.bytes
      if (picked.length >= config.maxCount || bytes + size > config.maxBytes) {
        dropped += 1
        continue
      }
      bytes += size
      picked.push(block)
    }
  }
  picked.reverse()
  return { blocks: picked, dropped }
}
