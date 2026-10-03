import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { PastedImage } from '../types'
import { fitRow, imageNumbers, pngSize } from './layout'
import type { Size } from './layout'

// Pasting an image raises no prompt.edit (the tag only shows up on the next keystroke),
// so the draft is polled instead.
const POLL_MS = 200

const images = atom({ plugin: 'cc-image-view', key: 'images' } as const, [] as PastedImage[])

let tmpRoot: string | undefined
let found: { sessionId: string; dir: string } | undefined
// The image numbers last drawn, so an unchanged draft doesn't rewrite state; undefined
// while a drawn image's file is still missing, so the next poll looks again.
let shownKey: string | undefined
let isChecking = false
const sizes = new Map<string, Size | null>()

// Claude Code caches each paste as <tmp>/<project>/<session>/images/<n>.png. The project
// folder is named after a working directory that may since have moved, so find it by the
// session id instead of rebuilding it.
async function imagesDir($: EngineInterface): Promise<string | undefined> {
  const sessionId = await $.session.id()
  if (found?.sessionId === sessionId) return found.dir
  if (tmpRoot === undefined) {
    const fromEnv = await $.env.get('CLAUDE_CODE_TMPDIR')
    tmpRoot = fromEnv ?? `/tmp/claude-${(await $.process.run(['id', '-u'])).stdout.trim()}`
  }
  const entries = await $.fs.list(tmpRoot).catch(() => [])
  for (const entry of entries) {
    const dir = `${tmpRoot}/${entry.name}/${sessionId}/images`
    if (entry.kind === 'dir' && (await $.fs.exists(dir))) {
      found = { sessionId, dir }
      return dir
    }
  }
  return undefined
}

async function describe($: EngineInterface, dir: string | undefined, n: number): Promise<PastedImage> {
  const path = `${dir}/${n}.png`
  if (dir === undefined || !(await $.fs.exists(path))) return { n, path: null, size: null }
  if (!sizes.has(path)) {
    const head = await $.fs.read(path, { as: 'bytes' }).then(
      ({ base64 }) => pngSize(base64),
      () => undefined, // too big to read: still drawable, just without its aspect ratio
    )
    if (head === null) return { n, path: null, size: null }
    sizes.set(path, head ?? null)
  }
  return { n, path, size: sizes.get(path) ?? null }
}

async function show($: EngineInterface, draft: string) {
  const numbers = imageNumbers(draft)
  const key = numbers.join(',')
  if (key === shownKey) return
  const dir = numbers.length > 0 ? await imagesDir($) : undefined
  const list: PastedImage[] = []
  for (const n of numbers) list.push(await describe($, dir, n))
  shownKey = list.every(image => image.path !== null) ? key : undefined
  await update($, images, () => list)
}

async function check($: EngineInterface) {
  if (isChecking) return
  isChecking = true
  try {
    await show($, (await $.prompt.read()).text)
  } finally {
    isChecking = false
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    $.clock.every(POLL_MS, () => check($))
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.surface !== 'terminal' || e.props.hasSurvey) return next(e)
    const list = await read($, images)
    if (list.length === 0) return next(e)

    const { Box, Image, Text } = $.ui.resolve(e)
    const cells = fitRow(list.map(image => image.size), e.props.maxRows, e.props.bodyColumns)
    const below = await next(e)

    return (
      <Box flexDirection="column">
        <Box flexDirection="row" columnGap={1}>
          {list.map((image, i) => {
            const { columns, rows } = cells[i] ?? { columns: 4, rows: 1 }
            return (
              <Box flexDirection="column" alignItems="center" borderStyle="round" borderDimColor>
                {image.path === null ? (
                  <Box width={columns} height={rows} alignItems="center" justifyContent="center">
                    <Text dimColor wrap="truncate">no preview</Text>
                  </Box>
                ) : (
                  <Image
                    key={`image-${image.n}`}
                    source={{ file: image.path, format: 'png' }}
                    columns={columns}
                    rows={rows}
                    alt={`[Image #${image.n}]`}
                  />
                )}
                <Text dimColor>#{image.n}</Text>
              </Box>
            )
          })}
        </Box>
        {below}
      </Box>
    )
  })
}
