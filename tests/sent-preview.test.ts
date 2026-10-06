import { expect, mock, test } from 'claude-code/testing'

type On = Parameters<import('claude-code/testing').TestBody>[1]

const PLUGIN = 'cc-image-view'
const DIR = '/tmp/claude-501/-work/sess-1/images'
const TRANSCRIPT = '/home/me/.claude/projects/-work/sess-1.jsonl'
const SCRATCH = '/tmp/claude-501/cc-image-view/sess-1'
const CONVERTED = `${SCRATCH}/3.png`

const image = (mediaType: string) => ({ type: 'image', source: { type: 'base64', media_type: mediaType, data: '' } })
const user = (uuid: string, content: unknown, extra: object = {}) => JSON.stringify({ type: 'user', uuid, message: { content }, ...extra })
const REAL = '[Image #2] 設計稿 [Image #3] 照片'
const REAL_ROW = user('u1', [{ type: 'text', text: REAL }, image('image/png'), image('image/jpeg')], { imagePasteIds: [2, 3] })

function pngHead(width: number, height: number): string {
  const bytes = new Uint8Array(33)
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52])
  const view = new DataView(bytes.buffer)
  view.setUint32(16, width)
  view.setUint32(20, height)
  return btoa(String.fromCharCode(...bytes))
}

const row = (text: string, surface: 'terminal' | 'desktop' = 'terminal') =>
  ({
    plugin: PLUGIN,
    component: 'UserMessage',
    surface,
    props: { text, origin: { kind: 'composer' }, isExpanded: false },
  }) as const

// A machine with the paste cache, a transcript the grep returns `rows()` for, and a sips that
// writes its output; `ran` records every external command.
type Faults = { truncated?: () => boolean; privateDirOk?: boolean }

function machine(on: On, rows: () => string, cache: string[], faults: Faults = {}) {
  const ran: string[][] = []
  const made = new Set<string>()
  const entry = { size: 0, mtimeMs: 0, isLink: false }
  on('session.start', () => ({ cwd: '/work' }))
  on('prompt.read', () => ({ value: { text: '', cursor: 0 } }))
  on('session.id', () => ({ value: 'sess-1' }))
  on('session.root', () => ({ value: '/work' }))
  on('session.cwd', () => ({ value: '/work' }))
  on('env.get', ($, e) => ({ value: { CLAUDE_CODE_TMPDIR: '/tmp/claude-501', HOME: '/home/me' }[e.name] }))
  on('fs.list', ($, e) => ({
    value: e.path === DIR ? cache.map(name => ({ name, kind: 'file', ...entry })) : [{ name: '-work', kind: 'dir', ...entry }],
  }))
  on('fs.exists', ($, e) => ({ value: e.path === DIR || e.path === TRANSCRIPT || made.has(e.path) }))
  on('fs.stat', () => ({ value: { kind: 'file', size: rows().length, mtimeMs: 0, isLink: false } }))
  on('fs.read', () => ({ value: { base64: pngHead(800, 400) } }))
  on('process.run', ($, e) => {
    const argv = [...e.argv]
    ran.push(argv)
    if (argv[0] === 'sips') made.add(String(argv.at(-1)))
    if (argv[0] === 'mv') {
      made.delete(String(argv[2]))
      made.add(String(argv[3]))
    }
    const isGrep = argv[0] === 'sh' && String(argv[2]).includes('grep')
    const isPrivateDir = argv[0] === 'sh' && String(argv[2]).includes('chmod 700')
    const exitCode = isPrivateDir && faults.privateDirOk === false ? 1 : 0
    const isStdoutTruncated = isGrep && (faults.truncated?.() ?? false)
    return { value: { exitCode, stdout: isGrep ? rows() : '', stderr: '', isStdoutTruncated, isStderrTruncated: false } }
  })
  on('prompt.submit', ($, e) => ({ text: e.text }))
  on('ui.render', () => ({ type: 'Text', props: {}, children: ['engine row'] }))
  return ran
}

test('sent prompts get a button per bound image; typed tags, typed copies and other surfaces get none', async ($, on) => {
  let rows = [REAL_ROW, user('u2', '請把 [Image #2] 當成純文字')].join('\n')
  const ran = machine(on, () => rows, ['2.png', '3.jpg'])
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })

  const real = await $.ui.mount(row(REAL))
  expect(await real.find({ type: 'Text', text: 'engine row' })).toBeDefined()
  expect(await real.find({ type: 'Button', key: 'cc-image-view:open:2' })).toBeDefined()
  expect(await real.find({ type: 'Button', key: 'cc-image-view:open:3' })).toBeDefined()
  const images = await real.findAll({ type: 'Image' })
  expect(images.map(found => found.props.source)).toEqual([
    { file: `${DIR}/2.png`, format: 'png' },
    { file: CONVERTED, format: 'png' },
  ])
  // Converted under a temporary name, renamed into place, in a folder made private first
  expect(ran.some(argv => argv[0] === 'sips' && argv.includes(`${DIR}/3.jpg`) && argv.at(-1) === `${CONVERTED}.part.png`)).toBe(true)
  expect(ran.some(argv => argv[0] === 'sh' && String(argv[2]).includes('chmod 700') && argv.includes(SCRATCH))).toBe(true)
  await real.unmount()

  const typed = await $.ui.mount(row('請把 [Image #2] 當成純文字'))
  expect(await typed.find({ type: 'Button' })).toBeUndefined()
  await typed.unmount()

  const desktop = await $.ui.mount(row(REAL, 'desktop'))
  expect(await desktop.find({ type: 'Button' })).toBeUndefined()
  await desktop.unmount()

  // The same words typed again later: the row can't say which prompt it is, so nothing shows
  rows = [rows, user('u3', REAL)].join('\n')
  const copied = await $.ui.mount(row(REAL))
  expect(await copied.find({ type: 'Button' })).toBeUndefined()
  await copied.unmount()
})

test('a prompt just sent shows its images once its transcript line lands', async ($, on) => {
  const clock = mock.clock(on)
  const text = '像 [Image #1] 那樣，這張 [Image #5]'
  let rows = ''
  machine(on, () => rows, ['1.png', '5.png'])
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  await $.prompt.submit({ text, attachments: [{ type: 'image', mediaType: 'image/png' }], origin: { kind: 'composer' }, wait: false })

  const early = await $.ui.mount(row(text))
  expect(await early.find({ type: 'Button' })).toBeUndefined()
  await early.unmount()

  rows = user('u9', [{ type: 'text', text }, image('image/png')], { imagePasteIds: [5] })
  await clock.advance(300)

  const landed = await $.ui.mount(row(text))
  expect(await landed.find({ type: 'Button', key: 'cc-image-view:open:5' })).toBeDefined()
  // The typed old tag stays text even though its paste is cached
  expect(await landed.find({ type: 'Button', key: 'cc-image-view:open:1' })).toBeUndefined()
  await landed.unmount()
})

test('a typed copy of a real prompt, just sent, never borrows its images', async ($, on) => {
  const clock = mock.clock(on)
  let rows = REAL_ROW
  machine(on, () => rows, ['2.png', '3.png'])
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  await $.prompt.submit({ text: REAL, origin: { kind: 'composer' }, wait: false })

  const copy = await $.ui.mount(row(REAL))
  expect(await copy.find({ type: 'Button' })).toBeUndefined()
  await copy.unmount()

  rows = [REAL_ROW, user('u3', REAL)].join('\n')
  await clock.advance(300)
  const after = await $.ui.mount(row(REAL))
  expect(await after.find({ type: 'Button' })).toBeUndefined()
  await after.unmount()
})

test('buttons speak the chosen language', { options: { language: 'zh-TW' } }, async ($, on) => {
  machine(on, () => REAL_ROW, ['2.png', '3.png'])
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  const zh = await $.ui.mount(row(REAL))
  const open = await zh.find({ type: 'Button', key: 'cc-image-view:open:2' })
  const zoom = await zh.find({ type: 'Button', key: 'cc-image-view:zoom:2' })
  expect(open?.props.label).toBe('圖 #2')
  expect(zoom?.props.label).toBe('⤢ 放大')
  await zh.unmount()
})

test('without any language hint the buttons are English', async ($, on) => {
  machine(on, () => REAL_ROW, ['2.png', '3.png'])
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  const en = await $.ui.mount(row(REAL))
  expect((await en.find({ type: 'Button', key: 'cc-image-view:open:2' }))?.props.label).toBe('img #2')
  expect((await en.find({ type: 'Button', key: 'cc-image-view:zoom:2' }))?.props.label).toBe('⤢ Zoom')
  await en.unmount()
})

test('an unconfirmed prompt keeps no buttons after the quick retries run out, and lands later', async ($, on) => {
  const clock = mock.clock(on)
  let rows = REAL_ROW
  machine(on, () => rows, ['2.png', '3.png'])
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  // Load the index so the typed copy's baseline comes from it
  await (await $.ui.mount(row(REAL))).unmount()
  await $.prompt.submit({ text: REAL, origin: { kind: 'composer' }, wait: false })
  for (let i = 0; i < 25; i++) await clock.advance(300)

  const stuck = await $.ui.mount(row(REAL))
  expect(await stuck.find({ type: 'Button' })).toBeUndefined()
  await stuck.unmount()

  // The copy's line finally lands: the words are now ambiguous, so still nothing
  rows = [REAL_ROW, user('u3', REAL)].join('\n')
  const landed = await $.ui.mount(row(REAL))
  expect(await landed.find({ type: 'Button' })).toBeUndefined()
  await landed.unmount()
})

test('a real prompt whose line lands after the retries still gets its buttons', async ($, on) => {
  const clock = mock.clock(on)
  let rows = ''
  machine(on, () => rows, ['2.png', '3.png'])
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  await $.prompt.submit({ text: REAL, attachments: [{ type: 'image' }, { type: 'image' }], origin: { kind: 'composer' }, wait: false })
  for (let i = 0; i < 25; i++) await clock.advance(300)
  rows = REAL_ROW
  const late = await $.ui.mount(row(REAL))
  expect(await late.find({ type: 'Button', key: 'cc-image-view:open:2' })).toBeDefined()
  await late.unmount()
})

test('a read that comes back cut short voids the old index', async ($, on) => {
  let rows = REAL_ROW
  let cut = false
  machine(on, () => rows, ['2.png', '3.png'], { truncated: () => cut })
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  const before = await $.ui.mount(row(REAL))
  expect(await before.find({ type: 'Button', key: 'cc-image-view:open:2' })).toBeDefined()
  await before.unmount()

  rows = [REAL_ROW, user('u3', REAL)].join('\n')
  cut = true
  const after = await $.ui.mount(row(REAL))
  expect(await after.find({ type: 'Button' })).toBeUndefined()
  await after.unmount()
})

test('a read failure inside the pipeline counts as a failed read', async ($, on) => {
  let rows = REAL_ROW
  machine(on, () => rows, ['2.png', '3.png'])
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  rows = `${REAL_ROW}\n__CC_IMAGE_VIEW_READ_FAILED__`
  const failed = await $.ui.mount(row(REAL))
  expect(await failed.find({ type: 'Button' })).toBeUndefined()
  await failed.unmount()
})

test('when the private folder fails its check, nothing is written and pictures that need it are skipped', async ($, on) => {
  const ran = machine(on, () => REAL_ROW, ['2.png', '3.jpg'], { privateDirOk: false })
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  const rowView = await $.ui.mount(row(REAL))
  expect(await rowView.find({ type: 'Button', key: 'cc-image-view:open:2' })).toBeDefined()
  expect(await rowView.find({ type: 'Button', key: 'cc-image-view:open:3' })).toBeUndefined()
  expect(ran.some(argv => argv[0] === 'sips')).toBe(false)
  await rowView.unmount()
})
