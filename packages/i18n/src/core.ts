import type { Locale, TranslationKey, TranslateParams, TranslationDictionary } from './types'
import { DEFAULT_LOCALE } from './types'
import { getLocaleLoader } from './locales'
import en from './locales/en'

/** Simple {{variable}} interpolation. */
function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    return key in params ? String(params[key]) : `{{${key}}}`
  })
}

export interface I18nCore {
  locale: Locale
  t<K extends TranslationKey>(key: K, ...args: TranslateParams<K>): string
  setLocale(locale: Locale): Promise<void>
}

const dictionaries: Partial<Record<Locale, TranslationDictionary>> = {
  en: en as TranslationDictionary,
}

/** Lazy-load a locale dictionary. Returns cached if already loaded. */
export async function loadLocale(locale: Locale): Promise<TranslationDictionary> {
  if (dictionaries[locale]) return dictionaries[locale]!
  const loader = getLocaleLoader(locale)
  if (!loader) return en as TranslationDictionary // fallback
  const mod = await loader()
  dictionaries[locale] = mod.default
  return mod.default
}

/** Create an i18n core instance. Framework adapters wrap this. */
export function createI18nCore(
  initialLocale: Locale = DEFAULT_LOCALE,
  onChange?: (locale: Locale) => void,
): I18nCore {
  let currentLocale: Locale = initialLocale
  let currentDict: TranslationDictionary = (dictionaries[initialLocale] ?? en) as TranslationDictionary

  return {
    get locale() { return currentLocale },

    t<K extends TranslationKey>(key: K, ...args: TranslateParams<K>): string {
      const template = currentDict[key] ?? (en as TranslationDictionary)[key] ?? key
      return interpolate(template, args[0] as Record<string, string | number> | undefined)
    },

    async setLocale(locale: Locale) {
      const dict = await loadLocale(locale)
      currentLocale = locale
      currentDict = dict
      onChange?.(locale)
    },
  }
}

/**
 * Get the i18n key for a profile option label.
 * Usage: t(optionKey('gender', 'woman'))
 */
export function optionKey(category: string, value: string): TranslationKey {
  return `option.${category}.${value}` as TranslationKey
}

/**
 * Get the i18n key for a tag label.
 * Usage: t(tagKey(1))
 */
export function tagKey(id: number): TranslationKey {
  return `tag.${id}` as TranslationKey
}

/**
 * Get the i18n key for a language name.
 * Usage: t(langKey('en'))
 */
export function langKey(code: string): TranslationKey {
  return `lang.${code}` as TranslationKey
}

/**
 * Get the i18n key for a nationality label.
 * Usage: t(natKey('US'))
 */
export function natKey(code: string): TranslationKey {
  return `nat.${code}` as TranslationKey
}
