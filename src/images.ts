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
  /** Whether attached images may be forwarded to the reviewer at all. */
  readonly enabled: boolean
  /** Hard cap on images per review; the oldest occurrences are dropped first. */
  readonly maxCount: number
  /** Hard cap on the summed encoded bytes of forwarded images. */
  readonly maxBytes: number
}

/** Defaults mirroring the Codex guardian's transcript image caps. */
export const DEFAULT_IMAGES: ImagesConfig = Object.freeze({
  enabled: true,
  maxCount: 4,
  maxBytes: 8 * 1024 * 1024,
})

/** The images selected for one review, plus what the caps discarded. */
export interface SelectedReviewImages {
  /** The selected blocks, oldest first, in the order they should reach the model. */
  readonly blocks: readonly ReviewImageBlock[]
  /** How many user images the caps dropped (count or byte pressure). */
  readonly dropped: number
}

/** Narrow one event's content array to the durable image blocks it carries. */
function imageBlocksOf(event: SessionEvent): readonly ReviewImageBlock[] {
  if (event.type !== 'user/message') return []
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
  if (!config.enabled) return { blocks: [], dropped: 0 }
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
