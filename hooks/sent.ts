// `ids` are the paste numbers Claude Code stores with the prompt (imagePasteIds), one per image
// block in order, so `[Image #ids[i]]` is block i. A prompt with no images has both empty.
export type SentMessage = { uuid: string; text: string; ids: number[]; kinds: string[] }

type Block = { type?: unknown; text?: unknown; source?: { media_type?: unknown; data?: unknown } }
type Row = { uuid: string; blocks: Block[]; pasteIds: unknown }

function contentOf(line: string): Row | null {
  let row: { type?: unknown; isMeta?: unknown; uuid?: unknown; imagePasteIds?: unknown; message?: { content?: unknown } }
  try {
    row = JSON.parse(line)
  } catch {
    return null
  }
  const content = row.message?.content
  if (row.type !== 'user' || row.isMeta === true || typeof row.uuid !== 'string') return null
  // A typed prompt is stored as one string; keep it, it is how a typed copy of a real prompt is told apart
  const blocks: Block[] = typeof content === 'string' ? [{ type: 'text', text: content }] : Array.isArray(content) ? content : []
  // A tool result can carry an image too (a screenshot tool); only a prompt the person sent counts
  if (blocks.length === 0 || blocks.some(block => block?.type === 'tool_result')) return null
  return { uuid: row.uuid, blocks, pasteIds: row.imagePasteIds }
}

const textOf = (blocks: Block[]) =>
  blocks
    .filter(block => block?.type === 'text' && typeof block.text === 'string')
    .map(block => block.text as string)
    .join('\n')

/**
 * The person's prompts from transcript lines (base64 may be stripped), with the paste number of
 * each image. Without imagePasteIds matching the image blocks one to one, ids stay empty: a number
 * is never guessed from the tags, since a typed tag reads the same as a real one.
 */
export function sentMessages(lines: string): SentMessage[] {
  const out: SentMessage[] = []
  for (const line of lines.split('\n')) {
    const row = contentOf(line)
    if (row === null) continue
    const kinds = row.blocks.filter(block => block?.type === 'image').map(block => String(block.source?.media_type ?? ''))
    const ids = Array.isArray(row.pasteIds) && row.pasteIds.every(id => Number.isInteger(id)) ? (row.pasteIds as number[]) : []
    const paired = ids.length === kinds.length && kinds.length > 0
    out.push({ uuid: row.uuid, text: textOf(row.blocks), ids: paired ? ids : [], kinds: paired ? kinds : [] })
  }
  return out
}

/**
 * The prompt a transcript row shows, matched by its text. Two prompts reading the same with
 * different images (a real one and a typed copy) can't be told apart from the row, so neither
 * is returned: no preview beats the wrong one.
 */
export function messageFor(messages: readonly SentMessage[], text: string): SentMessage | undefined {
  const wanted = text.trim()
  const same = messages.filter(message => message.text.trim() === wanted)
  const first = same[0]
  if (first === undefined || same.some(message => message.ids.join(',') !== first.ids.join(','))) return undefined
  return first.ids.length > 0 ? first : undefined
}

/** The bytes of a prompt's `index`-th image block, from its full transcript line, for when the paste cache is gone. */
export function imageBlock(line: string, index: number): { mediaType: string; base64: string } | null {
  const row = contentOf(line)
  const source = row?.blocks.filter(block => block?.type === 'image')[index]?.source
  if (typeof source?.data !== 'string' || source.data === '') return null
  return { mediaType: String(source.media_type ?? ''), base64: source.data }
}
