import { expect, test } from 'claude-code/testing'

const PLUGIN = 'cc-image-view'
const DIR = '/tmp/claude-501/-work/sess-1/images'
const TRANSCRIPT = '/home/me/.claude/projects/-work/sess-1.jsonl'
const CONVERTED = '/tmp/claude-501/cc-image-view/sess-1/3.png'

const image = (mediaType: string) => ({ type: 'image', source: { type: 'base64', media_type: mediaType, data: '' } })
const ROWS = [
  JSON.stringify({ type: 'user', uuid: 'u1', message: { content: [{ type: 'text', text: '[Image #2] 設計稿 [Image #3] 照片' }, image('image/png'), image('image/jpeg')] } }),
].join('\n')

function pngHead(width: number, height: number): string {
  const bytes = new Uint8Array(33)
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52])
  const view = new DataView(bytes.buffer)
  view.setUint32(16, width)
  view.setUint32(20, height)
  return btoa(String.fromCharCode(...bytes))
}

const row = (text: string, surface: 'terminal' | 'desktop' = 'terminal') => ({
  plugin: PLUGIN,
  component: 'UserMessage',
  surface,
  props: { text, origin: { kind: 'composer' }, isExpanded: false },
}) as const

test('sent prompts get a button per real image; typed tags and other surfaces get none', async ($, on) => {
  const ran: string[][] = []
  let converted = false
  const entry = { size: 0, mtimeMs: 0, isLink: false }
  on('session.start', () => ({ cwd: '/work' }))
  on('prompt.read', () => ({ value: { text: '', cursor: 0 } }))
  on('session.id', () => ({ value: 'sess-1' }))
  on('session.root', () => ({ value: '/work' }))
  on('session.cwd', () => ({ value: '/work' }))
  on('env.get', ($, e) => ({ value: { CLAUDE_CODE_TMPDIR: '/tmp/claude-501', HOME: '/home/me' }[e.name] }))
  on('fs.list', ($, e) => ({
    value:
      e.path === DIR
        ? [
            { name: '2.png', kind: 'file', ...entry },
            { name: '3.jpg', kind: 'file', ...entry },
          ]
        : [{ name: '-work', kind: 'dir', ...entry }],
  }))
  on('fs.exists', ($, e) => ({ value: e.path === DIR || e.path === TRANSCRIPT || (e.path === CONVERTED && converted) }))
  on('fs.stat', () => ({ value: { kind: 'file', size: 100, mtimeMs: 0, isLink: false } }))
  on('fs.read', () => ({ value: { base64: pngHead(800, 400) } }))
  on('process.run', ($, e) => {
    ran.push([...e.argv])
    if (e.argv[0] === 'sips') converted = true
    const stdout = e.argv[0] === 'sh' && String(e.argv[2]).includes('grep') ? ROWS : ''
    return { value: { exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  on('ui.render', () => ({ type: 'Text', props: {}, children: ['engine row'] }))

  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })

  const real = await $.ui.mount(row('[Image #2] 設計稿 [Image #3] 照片'))
  expect(await real.find({ type: 'Text', text: 'engine row' })).toBeDefined()
  expect(await real.find({ type: 'Button', key: 'cc-image-view:open:2' })).toBeDefined()
  expect(await real.find({ type: 'Button', key: 'cc-image-view:open:3' })).toBeDefined()
  expect(await real.find({ type: 'Button', key: 'cc-image-view:open:9' })).toBeUndefined()
  const images = await real.findAll({ type: 'Image' })
  expect(images.map(found => found.props.source)).toEqual([
    { file: `${DIR}/2.png`, format: 'png' },
    { file: CONVERTED, format: 'png' },
  ])
  expect(ran.some(argv => argv[0] === 'sips' && argv.includes(`${DIR}/3.jpg`))).toBe(true)
  await real.unmount()

  const typed = await $.ui.mount(row('請把 [Image #2] 當成純文字'))
  expect(await typed.find({ type: 'Button' })).toBeUndefined()
  expect(await typed.find({ type: 'Text', text: 'engine row' })).toBeDefined()
  await typed.unmount()

  const desktop = await $.ui.mount(row('[Image #2] 設計稿 [Image #3] 照片', 'desktop'))
  expect(await desktop.find({ type: 'Button' })).toBeUndefined()
  await desktop.unmount()
})

test('a prompt just sent shows its images before the transcript is on disk', async ($, on) => {
  const entry = { size: 0, mtimeMs: 0, isLink: false }
  on('session.start', () => ({ cwd: '/work' }))
  on('prompt.read', () => ({ value: { text: '', cursor: 0 } }))
  on('session.id', () => ({ value: 'sess-1' }))
  on('session.root', () => ({ value: '/work' }))
  on('session.cwd', () => ({ value: '/work' }))
  on('env.get', ($, e) => ({ value: { CLAUDE_CODE_TMPDIR: '/tmp/claude-501', HOME: '/home/me' }[e.name] }))
  on('fs.list', ($, e) => ({
    value: e.path === DIR ? [{ name: '1.png', kind: 'file', ...entry }, { name: '5.png', kind: 'file', ...entry }] : [{ name: '-work', kind: 'dir', ...entry }],
  }))
  on('fs.exists', ($, e) => ({ value: e.path === DIR || e.path === TRANSCRIPT }))
  on('fs.stat', () => ({ value: { kind: 'file', size: 100, mtimeMs: 0, isLink: false } }))
  on('fs.read', () => ({ value: { base64: pngHead(800, 400) } }))
  on('process.run', () => ({ value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }))
  on('prompt.submit', ($, e) => ({ text: e.text }))
  on('ui.render', () => ({ type: 'Text', props: {}, children: ['engine row'] }))

  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  const text = '像 [Image #1] 那樣，這張 [Image #5]'
  await $.prompt.submit({ text, attachments: [{ type: 'image', mediaType: 'image/png' }], origin: { kind: 'composer' }, wait: false })

  const sentRow = await $.ui.mount(row(text))
  expect(await sentRow.find({ type: 'Button', key: 'cc-image-view:open:5' })).toBeDefined()
  // The typed old tag stays text even though its paste is cached
  expect(await sentRow.find({ type: 'Button', key: 'cc-image-view:open:1' })).toBeUndefined()
  await sentRow.unmount()
})
