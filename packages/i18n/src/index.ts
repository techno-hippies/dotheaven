// Types
export type { TranslationKeys, TranslationKey, Locale, TranslationDictionary, TranslateParams } from './types'
export { SUPPORTED_LOCALES, DEFAULT_LOCALE, LOCALE_META } from './types'

// Core
export { createI18nCore, loadLocale, optionKey, tagKey, langKey, natKey } from './core'
export type { I18nCore } from './core'

// Detection
export { detectLocale } from './detect'
