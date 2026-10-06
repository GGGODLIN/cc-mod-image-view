export type Locale = 'en' | 'zh-TW'

export type Strings = {
  noPreview: string
  sentButton: (n: number) => string
  zoom: string
  paneTitle: (n: number) => string
  closeHint: (n: number) => string
  noSelection: string
}

const STRINGS: Record<Locale, Strings> = {
  en: {
    noPreview: 'no preview',
    sentButton: n => `img #${n}`,
    zoom: '⤢ Zoom',
    paneTitle: n => `Image #${n}`,
    closeHint: n => `#${n} · Esc to close`,
    noSelection: 'No image selected',
  },
  'zh-TW': {
    noPreview: '無法預覽',
    // CJK, not an emoji: a CJK glyph is two cells on every terminal, so the card offsets add up
    sentButton: n => `圖 #${n}`,
    zoom: '⤢ 放大',
    paneTitle: n => `圖片 #${n}`,
    closeHint: n => `#${n} · Esc 關閉`,
    noSelection: '沒有選取的圖片',
  },
}

export const stringsFor = (locale: Locale): Strings => STRINGS[locale]

const CHINESE = /中文|漢語|汉语|華語|华语|國語|国语|chinese|mandarin|^zh(?:[-_.\s]|$)/i
const ENGLISH = /英文|英語|english|^en(?:[-_.\s]|$)/i

/**
 * The UI language: the mod's own setting when it names one, then Claude Code's free-text
 * `language` setting, then LC_ALL / LANG; English when none of them says. Any Chinese maps to
 * Traditional Chinese, the only Chinese the mod ships.
 */
export function pickLocale(input: { option: unknown; claudeLanguage: unknown; envLang: string | undefined }): Locale {
  if (input.option === 'en' || input.option === 'zh-TW') return input.option
  if (typeof input.claudeLanguage === 'string') {
    const language = input.claudeLanguage.trim()
    if (CHINESE.test(language)) return 'zh-TW'
    if (ENGLISH.test(language)) return 'en'
  }
  return /^zh/i.test(input.envLang ?? '') ? 'zh-TW' : 'en'
}
