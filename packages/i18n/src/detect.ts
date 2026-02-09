import type { Locale } from './types'
import { SUPPORTED_LOCALES, DEFAULT_LOCALE } from './types'

/**
 * Detect the user's preferred locale.
 * Checks stored preference first, then browser/device locale.
 */
export function detectLocale(): Locale {
  try {
    // Check stored preference (browser)
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem('heaven:locale') as Locale | null
      if (stored && SUPPORTED_LOCALES.includes(stored)) return stored
    }

    // Browser or React Native: navigator.languages / navigator.language
    const languages =
      typeof navigator !== 'undefined' && navigator.languages
        ? navigator.languages
        : typeof navigator !== 'undefined' && navigator.language
          ? [navigator.language]
          : []

    for (const lang of languages) {
      const code = lang.split('-')[0].toLowerCase() as Locale
      if (SUPPORTED_LOCALES.includes(code)) return code
    }
  } catch {
    // Silent fallback
  }
  return DEFAULT_LOCALE
}
