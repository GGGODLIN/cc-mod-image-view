import { expect, test } from 'claude-code/testing'

import { buttonOffsets, cellWidth, fitBox } from '../hooks/layout'
import { imageBlock, messageFor, pairImages, sentMessages } from '../hooks/sent'

const image = (mediaType: string, data = '') => ({ type: 'image', source: { type: 'base64', media_type: mediaType, data } })
const row = (uuid: string, content: unknown, extra: object = {}) => JSON.stringify({ type: 'user', uuid, message: { role: 'user', content }, ...extra })

// Shapes copied from a 2.1.291 transcript: a real paste stores text plus image blocks,
// a typed tag is a plain string, and the paste's source path follows as its own text row.
const LINES = [
  row('u1', [{ type: 'text', text: '[Image #1] 只回覆 OK' }, image('image/png')]),
  row('u1-src', [{ type: 'text', text: '[Image: source: /tmp/a.png]' }]),
  row('u2', [{ type: 'text', text: '[Image #2] 設計稿，[Image #3] 午餐，[Image #4] JPG' }, image('image/png'), image('image/png'), image('image/jpeg')]),
  row('u3', '請把 [Image #1] 和 [Image #99] 當成純文字'),
  row('u4', [{ type: 'tool_result', tool_use_id: 't', content: [image('image/png')] }, { type: 'text', text: '[Image #5]' }]),
  row('u5', [{ type: 'text', text: '[Image #6]' }, image('image/png')], { isMeta: true }),
  '{not json',
].join('\n')

test('only prompts with image blocks count, typed tags and tool screenshots do not', () => {
  expect(sentMessages(LINES)).toEqual([
    { uuid: 'u1', text: '[Image #1] 只回覆 OK', kinds: ['image/png'] },
    { uuid: 'u2', text: '[Image #2] 設計稿，[Image #3] 午餐，[Image #4] JPG', kinds: ['image/png', 'image/png', 'image/jpeg'] },
  ])
})

test('images pair with the newest cached tags, in the order they appear', () => {
  const all = () => true
  expect(pairImages('[Image #2] a [Image #3] b [Image #4]', ['image/png', 'image/png', 'image/jpeg'], all)).toEqual([
    { n: 2, mediaType: 'image/png' },
    { n: 3, mediaType: 'image/png' },
    { n: 4, mediaType: 'image/jpeg' },
  ])
  // A typed old tag before a real paste: the paste got the newer number
  expect(pairImages('像 [Image #1] 那樣，這張 [Image #5]', ['image/jpeg'], all)).toEqual([{ n: 5, mediaType: 'image/jpeg' }])
  // A typed tag with no cached paste never takes the image, however high its number
  expect(pairImages('[Image #5] 和 [Image #99]', ['image/png'], n => n !== 99)).toEqual([{ n: 5, mediaType: 'image/png' }])
  expect(pairImages('[Image #7] [Image #8]', ['image/png'], all)).toEqual([{ n: 8, mediaType: 'image/png' }])
})

test('a row finds its prompt by text, and typed tags find none', () => {
  const messages = sentMessages(LINES)
  expect(messageFor(messages, '[Image #1] 只回覆 OK')?.uuid).toBe('u1')
  expect(messageFor(messages, '請把 [Image #1] 和 [Image #99] 當成純文字')).toBeUndefined()
})

test('image bytes come from the full line by block index', () => {
  const line = row('u2', [{ type: 'text', text: '[Image #2] a [Image #3] b' }, image('image/png', 'AAAA'), image('image/jpeg', 'BBBB')])
  expect(imageBlock(line, 1)).toEqual({ mediaType: 'image/jpeg', base64: 'BBBB' })
  expect(imageBlock(line, 2)).toBeNull()
  expect(imageBlock(row('u2', [{ type: 'text', text: '[Image #2]' }, image('image/png')]), 0)).toBeNull()
})

test('the zoom box fills the pane on one side and keeps the aspect ratio', () => {
  expect(fitBox({ width: 1600, height: 1000 }, 70, 26)).toEqual({ columns: 70, rows: 22 })
  expect(fitBox({ width: 900, height: 1200 }, 70, 26)).toEqual({ columns: 39, rows: 26 })
  expect(fitBox({ width: 4000, height: 100 }, 400, 400)).toEqual({ columns: 255, rows: 3 })
})

test('cards line up under their buttons: CJK counts two cells, `[ ` and ` ]` four more', () => {
  expect(cellWidth('圖 #12')).toBe(6)
  expect(buttonOffsets(['圖 #1', '圖 #2', '圖 #10'])).toEqual([0, 10, 20])
})
