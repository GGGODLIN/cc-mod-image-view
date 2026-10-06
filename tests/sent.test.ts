import { expect, test } from 'claude-code/testing'

import { buttonOffsets, cellWidth, fitBox } from '../hooks/layout'
import { imageBlock, messageFor, sentMessages } from '../hooks/sent'

const image = (mediaType: string, data = '') => ({ type: 'image', source: { type: 'base64', media_type: mediaType, data } })
const row = (uuid: string, content: unknown, extra: object = {}) => JSON.stringify({ type: 'user', uuid, message: { role: 'user', content }, ...extra })

// Shapes copied from a 2.1.291 transcript: a real paste stores text plus image blocks and the
// paste numbers in imagePasteIds; a typed prompt is one string with no ids.
const LINES = [
  row('u1', [{ type: 'text', text: '[Image #1] 只回覆 OK' }, image('image/png')], { imagePasteIds: [1] }),
  row('u2', [{ type: 'text', text: '[Image #2] 設計稿，[Image #3] 午餐，[Image #4] JPG' }, image('image/png'), image('image/png'), image('image/jpeg')], { imagePasteIds: [2, 3, 4] }),
  row('u3', '請把 [Image #1] 和 [Image #99] 當成純文字'),
  row('u4', [{ type: 'tool_result', tool_use_id: 't', content: [image('image/png')] }, { type: 'text', text: '[Image #5]' }], { imagePasteIds: [5] }),
  row('u5', [{ type: 'text', text: '[Image #6]' }, image('image/png')], { isMeta: true, imagePasteIds: [6] }),
  row('u6', [{ type: 'text', text: '像 [Image #1] 那樣，這張 [Image #7]' }, image('image/jpeg')], { imagePasteIds: [7] }),
  row('u7', [{ type: 'text', text: '[Image #8] [Image #9]' }, image('image/png')], { imagePasteIds: [8, 9] }),
  '{not json',
].join('\n')

test('each image is bound by imagePasteIds; typed prompts and tool screenshots carry none', () => {
  const messages = sentMessages(LINES)
  expect(messages.map(m => [m.uuid, m.ids, m.kinds])).toEqual([
    ['u1', [1], ['image/png']],
    ['u2', [2, 3, 4], ['image/png', 'image/png', 'image/jpeg']],
    ['u3', [], []],
    ['u6', [7], ['image/jpeg']],
    // Ids that don't match the image blocks one to one are not guessed at
    ['u7', [], []],
  ])
})

test('a typed old tag next to a new paste binds only the paste', () => {
  expect(messageFor(sentMessages(LINES), '像 [Image #1] 那樣，這張 [Image #7]')?.ids).toEqual([7])
})

test('typed tags find nothing, and a typed copy of a real prompt hides both', () => {
  const messages = sentMessages(LINES)
  expect(messageFor(messages, '[Image #1] 只回覆 OK')?.uuid).toBe('u1')
  expect(messageFor(messages, '請把 [Image #1] 和 [Image #99] 當成純文字')).toBeUndefined()
  const copied = sentMessages([LINES, row('u8', '[Image #1] 只回覆 OK')].join('\n'))
  expect(messageFor(copied, '[Image #1] 只回覆 OK')).toBeUndefined()
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
