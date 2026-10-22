// User-facing text in English (default) or German. Texts are written in German in the code and looked up
// in the English table (i18n-en.ts); i18n.test.ts checks that every t()/msg() text in the sources has an English entry.
// Main and renderer each hold the current language: the renderer sets it from its store and tells main.
import { EN } from './i18n-en.ts'

export type Lang = 'en' | 'de'
export const LANGS: Lang[] = ['en', 'de']

let current: Lang = 'en'

export const getLang = (): Lang => current
export function setLang(lang: unknown): void {
  if (lang === 'en' || lang === 'de') current = lang
}

/** Locale for numbers and dates in the current language. */
export const locale = (): string => (current === 'de' ? 'de-DE' : 'en-US')

/** The text in the current language; `{name}` placeholders are filled from `vars`. */
export function t(text: string, vars?: Record<string, string | number>): string {
  const s = current === 'de' ? text : (EN[text] ?? text)
  return vars ? s.replace(/\{(\w+)\}/g, (m: string, k: string) => (k in vars ? String(vars[k]) : m)) : s
}

/** Marks a text in a table for translation where it is shown with t(); returns it unchanged. */
export const msg = (text: string): string => text
