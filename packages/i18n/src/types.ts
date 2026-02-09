import type en from './locales/en'

export type TranslationKeys = typeof en
export type TranslationKey = keyof TranslationKeys

/** Supported locale codes */
export type Locale = 'en' | 'zh'

export const SUPPORTED_LOCALES: Locale[] = ['en', 'zh']
export const DEFAULT_LOCALE: Locale = 'en'

/** Locale metadata for language picker UI */
export const LOCALE_META: { code: Locale; name: string; nativeName: string }[] = [
  { code: 'en', name: 'English', nativeName: 'English' },
  { code: 'zh', name: 'Chinese', nativeName: '中文' },
]

/** A complete translation dictionary */
export type TranslationDictionary = {
  [K in TranslationKey]: string
}

/**
 * Extract interpolation variable names from a template string.
 * "Hello {{name}}, you have {{count}} items" -> "name" | "count"
 */
type ExtractVars<T extends string> =
  T extends `${string}{{${infer Var}}}${infer Rest}`
    ? Var | ExtractVars<Rest>
    : never

/**
 * If a key's English value has {{variables}}, require them as params.
 * Otherwise, no params needed.
 */
export type TranslateParams<K extends TranslationKey> =
  ExtractVars<TranslationKeys[K]> extends never
    ? []
    : [params: Record<ExtractVars<TranslationKeys[K]>, string | number>]
