import type { TranslationDictionary } from '../types'

/** Static import map — Metro-compatible (no dynamic import paths). */
const loaders: Record<string, () => Promise<{ default: TranslationDictionary }>> = {
  zh: () => import('./zh'),
  // Add new locales here:
  // ja: () => import('./ja'),
  // ko: () => import('./ko'),
}

export function getLocaleLoader(locale: string) {
  return loaders[locale]
}
