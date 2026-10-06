import { expect, test } from 'claude-code/testing'

import { pickLocale, stringsFor } from '../hooks/i18n'

test('an explicit choice wins over everything else', () => {
  expect(pickLocale({ option: 'en', claudeLanguage: '繁體中文', envLang: 'zh_TW.UTF-8' })).toBe('en')
  expect(pickLocale({ option: 'zh-TW', claudeLanguage: 'English', envLang: 'en_US.UTF-8' })).toBe('zh-TW')
})

test('auto follows Claude Code language, then the locale variables, then English', () => {
  expect(pickLocale({ option: 'auto', claudeLanguage: '繁體中文', envLang: 'en_US.UTF-8' })).toBe('zh-TW')
  expect(pickLocale({ option: 'auto', claudeLanguage: 'Chinese (Traditional)', envLang: undefined })).toBe('zh-TW')
  expect(pickLocale({ option: 'auto', claudeLanguage: 'English', envLang: 'zh_TW.UTF-8' })).toBe('en')
  // A language the mod doesn't ship says nothing about which of the two to use
  expect(pickLocale({ option: 'auto', claudeLanguage: '日本語', envLang: 'zh_TW.UTF-8' })).toBe('zh-TW')
  expect(pickLocale({ option: 'auto', claudeLanguage: undefined, envLang: 'zh_CN.UTF-8' })).toBe('zh-TW')
  expect(pickLocale({ option: 'auto', claudeLanguage: undefined, envLang: 'en_US.UTF-8' })).toBe('en')
  expect(pickLocale({ option: undefined, claudeLanguage: 42, envLang: undefined })).toBe('en')
  // Locale codes with an underscore, as people write them in settings.json
  expect(pickLocale({ option: 'auto', claudeLanguage: 'zh_TW', envLang: 'en_US.UTF-8' })).toBe('zh-TW')
  expect(pickLocale({ option: 'auto', claudeLanguage: 'en_US', envLang: 'zh_TW.UTF-8' })).toBe('en')
})

test('both tables say the same things', () => {
  const en = stringsFor('en')
  const zh = stringsFor('zh-TW')
  expect(Object.keys(zh).sort()).toEqual(Object.keys(en).sort())
  expect(en.sentButton(3)).toBe('img #3')
  expect(zh.sentButton(3)).toBe('圖 #3')
  expect(zh.closeHint(2)).toBe('#2 · Esc 關閉')
})
