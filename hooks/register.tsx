import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { PastedImage } from '../types'
import { buttonOffsets, fitBox, fitCells, fitRow, imageNumbers, pngSize } from './layout'
import type { Size } from './layout'
import { pickLocale, stringsFor } from './i18n'
import type { Strings } from './i18n'
import { imageBlock, messageFor, sentMessages } from './sent'
import type { SentMessage } from './sent'

// Pasting an image raises no prompt.edit (the tag only shows up on the next keystroke),
// so the draft is polled instead.
const POLL_MS = 200

const images = atom({ plugin: 'cc-image-view', key: 'images' } as const, [] as PastedImage[])

let tmpRoot: string | undefined
let found: { sessionId: string; dir: string } | undefined
let transcript: { sessionId: string; path: string } | undefined

async function root($: EngineInterface): Promise<string> {
  if (tmpRoot === undefined) {
    const fromEnv = await $.env.get('CLAUDE_CODE_TMPDIR')
    tmpRoot = fromEnv ?? `/tmp/claude-${(await $.process.run(['id', '-u'])).stdout.trim()}`
  }
  return tmpRoot
}

// Claude Code caches each paste as <tmp>/<project>/<session>/images/<n>.<ext>. The project
// folder is named after a working directory that may since have moved, so find it by the
// session id instead of rebuilding it.
async function imagesDir($: EngineInterface): Promise<string | undefined> {
  const sessionId = await $.session.id()
  if (found?.sessionId === sessionId) return found.dir
  const base = await root($)
  for (const entry of await $.fs.list(base).catch(() => [])) {
    const dir = `${base}/${entry.name}/${sessionId}/images`
    if (entry.kind === 'dir' && (await $.fs.exists(dir))) {
      found = { sessionId, dir }
      return dir
    }
  }
  return undefined
}

/** The cached paste for image `n`, whatever its extension (a JPEG paste is `<n>.jpg`). */
async function cachedFile($: EngineInterface, dir: string | undefined, n: number): Promise<string | null> {
  if (dir === undefined) return null
  const entries = await $.fs.list(dir).catch(() => [])
  const hit = entries.find(entry => entry.kind === 'file' && new RegExp(`^${n}\\.[A-Za-z0-9]+$`).test(entry.name))
  return hit === undefined ? null : `${dir}/${hit.name}`
}

// Image draws only PNG (or raw pixels), so the formats Claude Code accepts as pastes are converted
// once with whatever tool the machine has: sips ships with macOS, the others are common on Linux.
// Only these extensions, only the first frame, and file input only: a converter is a trust boundary.
const CONVERTIBLE = /\.(jpe?g|gif|webp)$/i
const CONVERTERS = (src: string, out: string): string[][] => [
  ['sips', '-s', 'format', 'png', src, '--out', out],
  ['ffmpeg', '-loglevel', 'error', '-y', '-protocol_whitelist', 'file', '-i', src, '-frames:v', '1', out],
  ['magick', '-limit', 'memory', '256MiB', '-limit', 'disk', '1GiB', `${src}[0]`, out],
  ['convert', '-limit', 'memory', '256MiB', '-limit', 'disk', '1GiB', `${src}[0]`, out],
]

// The copies here are someone's pictures: the folder must be this user's own, mode 700, and no
// symlink, even when CLAUDE_CODE_TMPDIR points somewhere shared.
const PRIVATE_DIRS = 'umask 077; for d in "$1" "$2"; do mkdir -p "$d" && [ ! -L "$d" ] && [ -O "$d" ] && chmod 700 "$d" || exit 1; done'
let privateDir: string | undefined

async function scratch($: EngineInterface, name: string): Promise<string | null> {
  const base = `${await root($)}/cc-image-view`
  const dir = `${base}/${await $.session.id()}`
  if (privateDir !== dir) {
    const run = await $.process.run(['sh', '-c', PRIVATE_DIRS, 'sh', base, dir], { timeoutMs: 5_000 }).catch(() => null)
    if (run?.exitCode !== 0) return null
    privateDir = dir
  }
  return `${dir}/${name}`
}

// One job per output, so two renders asking for the same picture never write it at once
const jobs = new Map<string, Promise<string | null>>()

function once(out: string, make: () => Promise<string | null>): Promise<string | null> {
  const running = jobs.get(out)
  if (running !== undefined) return running
  const job = make().finally(() => jobs.delete(out))
  jobs.set(out, job)
  return job
}

// Written under a temporary name and renamed into place, so a reader never sees half a file
async function publish($: EngineInterface, temp: string, out: string): Promise<string | null> {
  const run = await $.process.run(['mv', '-f', temp, out], { timeoutMs: 5_000 }).catch(() => null)
  return run?.exitCode === 0 ? out : null
}

/** A PNG path for `src`: itself when it already is one, else a converted copy; null when none could be made. */
async function asPng($: EngineInterface, src: string, n: number): Promise<string | null> {
  if (src.toLowerCase().endsWith('.png')) return src
  // The draft is polled every 200 ms; without this a machine with no converter respawns four tools each time
  if (!CONVERTIBLE.test(src) || unconvertible.has(src)) return null
  const out = await scratch($, `${n}.png`)
  if (out === null) return null
  return once(out, async () => {
    if (await $.fs.exists(out)) return out
    const temp = `${out}.part.png`
    for (const argv of CONVERTERS(src, temp)) {
      const ok = await $.process.run(argv, { timeoutMs: 10_000 }).then(run => run.exitCode === 0, () => false)
      if (ok && (await $.fs.exists(temp))) return publish($, temp, out)
    }
    unconvertible.add(src)
    return null
  })
}

const unconvertible = new Set<string>()

/** Writes base64 bytes from the transcript to a scratch file, for a paste whose cache is gone. */
async function writeBytes($: EngineInterface, base64: string, name: string): Promise<string | null> {
  const out = await scratch($, name)
  if (out === null) return null
  return once(out, async () => {
    if (await $.fs.exists(out)) return out
    const temp = `${out}.part`
    const run = await $.process
      .run(['sh', '-c', 'umask 077; base64 -d > "$1"', 'sh', temp], { stdin: base64, timeoutMs: 10_000 })
      .catch(() => null)
    return run?.exitCode === 0 && (await $.fs.exists(temp)) ? publish($, temp, out) : null
  })
}

const projectFolder = (dir: string) => dir.replace(/[^a-zA-Z0-9]/g, '-')

/** This session's transcript file, found once per session id. */
async function transcriptPath($: EngineInterface): Promise<string | undefined> {
  const sessionId = await $.session.id()
  if (transcript?.sessionId === sessionId) return transcript.path
  const home = await $.env.get('HOME')
  const config = (await $.env.get('CLAUDE_CONFIG_DIR')) ?? `${home}/.claude`
  const projects = `${config}/projects`
  const guesses = [await $.session.root(), await $.session.cwd()].map(dir => `${projects}/${projectFolder(dir)}/${sessionId}.jsonl`)
  for (const path of guesses) {
    if (await $.fs.exists(path)) {
      transcript = { sessionId, path }
      return path
    }
  }
  for (const entry of await $.fs.list(projects).catch(() => [])) {
    const path = `${projects}/${entry.name}/${sessionId}.jsonl`
    if (entry.kind === 'dir' && (await $.fs.exists(path))) {
      transcript = { sessionId, path }
      return path
    }
  }
  return undefined
}

// A transcript can run to hundreds of MB, past $.fs.read's 4 MiB, so grep scans it on disk and
// passes on only the person's rows that mention an image tag, with every base64 blob removed.
const TAGGED_ROWS = `grep -F '[Image #' "$1" | grep -F '"type":"user"' | sed -E 's/"data":"[^"]*"/"data":""/g'`

/** Those rows, or null when the read failed or came back cut short: a partial index is not one. */
async function taggedRows($: EngineInterface, path: string): Promise<string | null> {
  const run = await $.process.run(['sh', '-c', TAGGED_ROWS, 'sh', path], { timeoutMs: 10_000 }).catch(() => null)
  return run === null || run.isStdoutTruncated || run.exitCode !== 0 ? null : run.stdout
}

/** The one full transcript line of a prompt, base64 included; empty when it is over the 4 MiB output cap. */
async function fullRow($: EngineInterface, path: string, uuid: string): Promise<string> {
  const run = await $.process
    .run(['grep', '-F', '-m', '1', `"uuid":"${uuid}"`, path], { timeoutMs: 10_000 })
    .catch(() => null)
  return run === null || run.isStdoutTruncated ? '' : run.stdout
}

async function fileSize($: EngineInterface, path: string): Promise<number> {
  return (await $.fs.stat(path).catch(() => null))?.size ?? -1
}

// The image numbers last drawn, so an unchanged draft doesn't rewrite state; undefined
// while a drawn image's file is still missing, so the next poll looks again.
let shownKey: string | undefined
let isChecking = false
const sizes = new Map<string, Size | null>()

// undefined: the file is no PNG and must not be drawn; null: drawable, aspect ratio unknown
async function sizeOf($: EngineInterface, path: string): Promise<Size | null | undefined> {
  if (!sizes.has(path)) {
    const head = await $.fs.read(path, { as: 'bytes' }).then(
      ({ base64 }) => pngSize(base64),
      () => undefined, // too big to read: still drawable, just without its aspect ratio
    )
    if (head === null) return undefined
    sizes.set(path, head ?? null)
  }
  return sizes.get(path) ?? null
}

async function describe($: EngineInterface, dir: string | undefined, n: number): Promise<PastedImage> {
  const cached = await cachedFile($, dir, n)
  const path = cached === null ? null : await asPng($, cached, n)
  const size = path === null ? undefined : await sizeOf($, path)
  return path === null || size === undefined ? { n, path: null, size: null } : { n, path, size }
}

// Sent prompts: an image is shown only when the transcript ties it to the prompt (imagePasteIds),
// so a typed "[Image #1]" never borrows an earlier paste.
const PANE = 'cc-image-view'
type Shown = { n: number; path: string; size: Size | null }
let sent: { path: string; size: number; messages: SentMessage[] } | undefined
let loading: Promise<void> | undefined
// A picture found stays found; one that could not be had is retried only once the transcript grew
const resolved = new Map<string, Shown | { missingAt: number }>()
let zoomed: Shown | undefined

async function reload($: EngineInterface, path: string) {
  const size = await fileSize($, path)
  // Unchanged since the last read: a row still missing is a typed tag, not a late write
  if (sent?.path === path && sent.size === size) return
  const rows = await taggedRows($, path)
  if (rows !== null) sent = { path, size, messages: sentMessages(rows) }
}

async function sentPrompt($: EngineInterface, text: string): Promise<SentMessage | undefined> {
  if (pending.has(text.trim())) return undefined
  const path = await transcriptPath($)
  if (path === undefined) return undefined
  // Re-read whenever the transcript grew, even for a prompt already found: a typed copy sent
  // later makes the same words ambiguous, and the answer must change with it
  loading ??= reload($, path).finally(() => {
    loading = undefined
  })
  await loading
  return sent === undefined ? undefined : messageFor(sent.messages, text)
}

// A prompt's row is drawn before its transcript line is written and is not drawn again on its own.
// Until that line lands the row could only borrow an earlier prompt with the same words, so every
// sent prompt with a tag waits as pending, the transcript is read until its line shows up, and then
// rows redraw.
const FOLLOW_MS = 300
const FOLLOW_TRIES = 20
const pending = new Map<string, number>()
const countOf = (text: string) => sent?.messages.filter(message => message.text.trim() === text.trim()).length ?? 0

// Marked at once, measured in the background: a send never waits on a grep of a large transcript.
// If the line lands before the baseline is read, the wait ends when the tries run out instead.
function watchSend($: EngineInterface, text: string) {
  const key = text.trim()
  pending.set(key, -1)
  void (async () => {
    const path = await transcriptPath($)
    if (path !== undefined) await reload($, path)
    if (pending.get(key) === -1) pending.set(key, countOf(text))
    follow($, text, FOLLOW_TRIES)
  })()
}

function follow($: EngineInterface, text: string, tries: number) {
  $.clock.after(FOLLOW_MS, () =>
    void (async () => {
      const path = await transcriptPath($)
      if (path !== undefined) await reload($, path)
      const before = pending.get(text.trim()) ?? 0
      if ((before >= 0 && countOf(text) > before) || tries <= 1) {
        pending.delete(text.trim())
        $.ui.invalidate('ui.render')
      } else follow($, text, tries - 1)
    })(),
  )
}

const EXTENSIONS: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp' }

async function sentImage($: EngineInterface, message: SentMessage, index: number): Promise<Shown | null> {
  const n = message.ids[index] ?? 0
  const key = `${message.uuid}:${index}`
  const known = resolved.get(key)
  if (known !== undefined && 'path' in known && (await $.fs.exists(known.path))) return known
  if (known !== undefined && 'missingAt' in known && known.missingAt === sent?.size) return null
  const cached = await cachedFile($, await imagesDir($), n)
  let path = cached === null ? null : await asPng($, cached, n)
  if (path === null) {
    // The paste cache lives in a temp folder a reboot clears; the transcript keeps the bytes
    const transcript = await transcriptPath($)
    const block = transcript === undefined ? null : imageBlock(await fullRow($, transcript, message.uuid), index)
    const raw = block === null ? null : await writeBytes($, block.base64, `transcript-${n}.${EXTENSIONS[block.mediaType] ?? 'img'}`)
    path = raw === null ? null : await asPng($, raw, n)
  }
  const size = path === null ? undefined : await sizeOf($, path)
  if (path === null || size === undefined) {
    resolved.set(key, { missingAt: sent?.size ?? -1 })
    return null
  }
  const shown = { n, path, size }
  resolved.set(key, shown)
  return shown
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

// One hover group per image: its button and its card light together, so the pointer can travel
// from one to the other. Image numbers are unique within a session.
const scopeOf = (n: number) => `cc-image-view-${n}`
// English until session.start has read the language settings
let ui: Strings = stringsFor('en')

async function settingsLanguage($: EngineInterface): Promise<unknown> {
  const home = await $.env.get('HOME')
  const config = (await $.env.get('CLAUDE_CONFIG_DIR')) ?? `${home}/.claude`
  try {
    return (JSON.parse(await $.fs.read(`${config}/settings.json`)) as { language?: unknown }).language
  } catch {
    return undefined
  }
}

export const register: Register = (on, options) => {
  on('prompt.submit', async ($, e, next) => {
    if (imageNumbers(e.text).length > 0) watchSend($, e.text)
    return next(e)
  })

  on('session.start', async ($, e, next) => {
    $.clock.every(POLL_MS, () => check($))
    const envLang = (await $.env.get('LC_ALL')) ?? (await $.env.get('LANG'))
    ui = stringsFor(pickLocale({ option: options.language, claudeLanguage: await settingsLanguage($), envLang }))
    $.ui.invalidate('ui.render')
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
                    <Text dimColor wrap="truncate">{ui.noPreview}</Text>
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

  on('ui.render', { component: 'UserMessage' }, async ($, e, next) => {
    if (e.surface !== 'terminal' || e.props.origin.kind !== 'composer' || imageNumbers(e.props.text).length === 0) return next(e)
    const message = await sentPrompt($, e.props.text)
    if (message === undefined) return next(e)
    const list: Shown[] = []
    for (const index of message.ids.keys()) {
      const shown = await sentImage($, message, index)
      if (shown !== null) list.push(shown)
    }
    if (list.length === 0) return next(e)

    const { Box, Button, Image } = $.ui.resolve(e)
    const zoom = (shown: Shown) => {
      zoomed = shown
      void $.ui.open({ id: PANE, title: ui.paneTitle(shown.n), focus: true, closeOnEscape: true })
      $.ui.invalidate('ui.render')
    }
    const row = await next(e)
    const offsets = buttonOffsets(list.map(shown => ui.sentButton(shown.n)))

    return (
      <Box flexDirection="column">
        {row}
        <Box flexDirection="row" columnGap={1}>
          {list.map(shown => (
            <Box hover={{ scope: scopeOf(shown.n) }}>
              <Button key={`cc-image-view:open:${shown.n}`} label={ui.sentButton(shown.n)} dimColor onPress={() => zoom(shown)} />
            </Box>
          ))}
        </Box>
        {list.map((shown, i) => {
          const cells = fitCells(shown.size)
          // In the flow under the button row, shifted to sit under its own button: the rows below
          // move down while it shows, the buttons never do. Absolute cards were painted over by
          // the transcript rows after them.
          return (
            <Box display="none" hover={{ scope: scopeOf(shown.n), display: 'flex' }} marginLeft={offsets[i]} flexDirection="column" alignItems="flex-start">
              <Box flexDirection="column" alignItems="center" borderStyle="round" borderDimColor>
                <Image key={`sent-${shown.n}`} source={{ file: shown.path, format: 'png' }} columns={cells.columns} rows={cells.rows} alt={`[Image #${shown.n}]`} />
                <Button key={`cc-image-view:zoom:${shown.n}`} label={ui.zoom} dimColor onPress={() => zoom(shown)} />
              </Box>
            </Box>
          )
        })}
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e, next) => {
    if (e.surface !== 'terminal') return next(e)
    const { Box, Image, Text } = $.ui.resolve(e)
    if (zoomed === undefined) return <Text dimColor>{ui.noSelection}</Text>
    // One row for the caption under the picture
    const cells = fitBox(zoomed.size, e.props.bodyColumns, e.props.scroll.bodyRows - 1)
    return (
      <Box flexDirection="column" alignItems="center">
        <Image key="zoom" source={{ file: zoomed.path, format: 'png' }} columns={cells.columns} rows={cells.rows} alt={`[Image #${zoomed.n}]`} />
        <Text dimColor>{ui.closeHint(zoomed.n)}</Text>
      </Box>
    )
  })
}
