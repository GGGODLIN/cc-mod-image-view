import { expect, mock, test } from 'claude-code/testing'

const PLUGIN = 'cc-image-view'
const DIR = '/tmp/claude-501/-work/sess-1/images'

const BAND = {
  plugin: PLUGIN,
  component: 'AbovePrompt',
  requestId: 'above-prompt',
  viewport: { columns: 120, rows: 40 },
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 20,
    bodyColumns: 120,
    scroll: { offset: 0, bodyRows: 20 },
    view: {},
  },
} as const

function pngHead(width: number, height: number): string {
  const bytes = new Uint8Array(33)
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52])
  const view = new DataView(bytes.buffer)
  view.setUint32(16, width)
  view.setUint32(20, height)
  return btoa(String.fromCharCode(...bytes))
}

test('thumbnails follow image tags on the terminal and leave every other surface alone', async ($, on) => {
  const clock = mock.clock(on)
  let draft = ''
  let promptReads = 0
  const fileReads: string[] = []
  on('session.start', () => ({ cwd: '/work' }))
  on('prompt.read', () => {
    promptReads += 1
    return { value: { text: draft, cursor: draft.length } }
  })
  on('env.get', () => ({ value: '/tmp/claude-501' }))
  on('session.id', () => ({ value: 'sess-1' }))
  const entry = { size: 0, mtimeMs: 0, isLink: false }
  on('fs.list', ($, e) => ({
    value:
      e.path === DIR
        ? [
            { name: '1.png', kind: 'file', ...entry },
            { name: '2.png', kind: 'file', ...entry },
            { name: '12.png', kind: 'file', ...entry },
          ]
        : [
            { name: '-other', kind: 'dir', ...entry },
            { name: 'notes.txt', kind: 'file', ...entry },
            { name: '-work', kind: 'dir', ...entry },
          ],
  }))
  on('fs.exists', ($, e) => ({
    value: e.path === DIR || e.path === `${DIR}/1.png` || e.path === `${DIR}/2.png`,
  }))
  on('fs.read', ($, e) => {
    fileReads.push(e.path)
    const base64 = e.path.endsWith('/1.png') ? pngHead(800, 400) : pngHead(400, 800)
    return { value: { base64 } }
  })
  on('ui.render', () => ({ type: 'Text', props: {}, children: ['engine band'] }))

  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  await clock.advance(200)
  expect(promptReads).toBe(1)

  const empty = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(JSON.stringify(await empty.drawn())).toBe('{"type":"Text","props":{},"children":["engine band"]}')
  await empty.unmount()

  await clock.advance(200)
  expect(promptReads).toBe(2)

  draft = 'see [Image #1] [Image #2] [Image #3]'
  await clock.advance(200)

  const terminal = await $.ui.mount({ ...BAND, surface: 'terminal' })
  const images = await terminal.findAll({ type: 'Image' })
  expect(images.map(image => image.props)).toEqual([
    { key: 'image-1', source: { file: `${DIR}/1.png`, format: 'png' }, columns: 24, rows: 6, alt: '[Image #1]' },
    { key: 'image-2', source: { file: `${DIR}/2.png`, format: 'png' }, columns: 6, rows: 6, alt: '[Image #2]' },
  ])
  expect(images[0]?.props.columns).not.toBe(images[1]?.props.columns)
  expect(await terminal.find({ type: 'Text', text: 'no preview' })).toBeDefined()
  expect(await terminal.find({ type: 'Text', text: '#1' })).toBeDefined()
  expect(await terminal.find({ type: 'Text', text: '#2' })).toBeDefined()
  expect(await terminal.find({ type: 'Text', text: '#3' })).toBeDefined()
  expect(await terminal.find({ type: 'Text', text: 'engine band' })).toBeDefined()
  // settings.json is read once at start for the UI language; the pictures are read once each
  expect(fileReads.filter(path => path.startsWith(DIR))).toEqual([`${DIR}/1.png`, `${DIR}/2.png`])
  await terminal.unmount()

  const desktop = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await desktop.find({ type: 'Image' })).toBeUndefined()
  expect(await desktop.find({ type: 'Text', text: 'engine band' })).toBeDefined()
  await desktop.unmount()

  const survey = await $.ui.mount({
    ...BAND,
    surface: 'terminal',
    props: { ...BAND.props, hasSurvey: true },
  })
  expect(await survey.find({ type: 'Image' })).toBeUndefined()
  expect(await survey.find({ type: 'Text', text: 'engine band' })).toBeDefined()
  await survey.unmount()

  const hint = await $.ui.mount({
    plugin: PLUGIN,
    component: 'PromptHint',
    surface: 'terminal',
    props: { isDraft: true, isWorking: false, hint: 'engine hint' },
  })
  expect(await hint.find({ type: 'Image' })).toBeUndefined()
  expect(await hint.drawn()).toEqual({ type: 'Text', props: {}, children: ['engine band'] })
  await hint.unmount()

  draft = 'keep [Image #1]'
  await clock.advance(200)
  const deleted = await $.ui.mount({ ...BAND, surface: 'terminal' })
  const left = await deleted.findAll({ type: 'Image' })
  expect(left.map(image => image.props.alt)).toEqual(['[Image #1]'])
  expect(await deleted.find({ type: 'Text', text: '#2' })).toBeUndefined()
  await deleted.unmount()

  draft = ''
  await clock.advance(200)
  const sent = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await sent.find({ type: 'Image' })).toBeUndefined()
  expect(await sent.find({ type: 'Text', text: 'no preview' })).toBeUndefined()
  expect(await sent.find({ type: 'Text', text: 'engine band' })).toBeDefined()
})
