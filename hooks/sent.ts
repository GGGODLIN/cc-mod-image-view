import { imageNumbers } from './layout'

export type SentImage = { n: number; mediaType: string }
// `kinds` are the media types of the image blocks, in order; which tags they belong to is paired later
export type SentMessage = { uuid: string; text: string; kinds: string[] }

type Block = { type?: unknown; text?: unknown; source?: { media_type?: unknown; data?: unknown } }

function contentOf(line: string): { uuid: string; blocks: Block[] } | null {
  let row: { type?: unknown; isMeta?: unknown; uuid?: unknown; message?: { content?: unknown } }
  try {
    row = JSON.parse(line)
  } catch {
    return null
  }
  const blocks = row.message?.content
  if (row.type !== 'user' || row.isMeta === true || typeof row.uuid !== 'string' || !Array.isArray(blocks)) return null
  // A tool result can carry an image too (a screenshot tool); only a prompt the person sent counts
  if (blocks.some((block: Block) => block?.type === 'tool_result')) return null
  return { uuid: row.uuid, blocks }
}

const textOf = (blocks: Block[]) =>
  blocks
    .filter(block => block?.type === 'text' && typeof block.text === 'string')
    .map(block => block.text as string)
    .join('\n')

/** The prompts that really carried images, from transcript lines (their base64 may be stripped). */
export function sentMessages(lines: string): SentMessage[] {
  const out: SentMessage[] = []
  for (const line of lines.split('\n')) {
    const row = contentOf(line)
    if (row === null) continue
    const kinds = row.blocks.filter(block => block?.type === 'image').map(block => String(block.source?.media_type ?? ''))
    if (kinds.length === 0) continue
    out.push({ uuid: row.uuid, text: textOf(row.blocks), kinds })
  }
  return out
}

/** The prompt a transcript row shows, matched by its text; the last one wins when two read the same. */
export function messageFor(messages: readonly SentMessage[], text: string): SentMessage | undefined {
  const wanted = text.trim()
  return messages.findLast(message => message.text.trim() === wanted)
}

/**
 * Which tags in `text` the `kinds` images belong to. A typed "[Image #1]" carries no picture, so
 * only tags whose paste is cached (`isCached`) count, and of those the newest numbers: a paste
 * always takes the next number, so the images of this prompt are the highest ones in it.
 */
export function pairImages(text: string, kinds: readonly string[], isCached: (n: number) => boolean): SentImage[] {
  const cached = imageNumbers(text).filter(isCached)
  const newest = new Set([...cached].sort((a, b) => b - a).slice(0, kinds.length))
  return cached.filter(n => newest.has(n)).map((n, i) => ({ n, mediaType: kinds[i] ?? '' }))
}

/** The bytes of a prompt's `index`-th image block, from its full transcript line, for when the paste cache is gone. */
export function imageBlock(line: string, index: number): { mediaType: string; base64: string } | null {
  const row = contentOf(line)
  const source = row?.blocks.filter(block => block?.type === 'image')[index]?.source
  if (typeof source?.data !== 'string' || source.data === '') return null
  return { mediaType: String(source.media_type ?? ''), base64: source.data }
}
