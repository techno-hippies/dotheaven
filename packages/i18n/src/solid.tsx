import { createContext, useContext, createSignal, type JSX } from 'solid-js'
import { createI18nCore, loadLocale } from './core'
import type { Locale, TranslationKey, TranslateParams } from './types'
import { detectLocale } from './detect'

interface I18nContextValue {
  locale: () => Locale
  setLocale: (locale: Locale) => Promise<void>
  t: <K extends TranslationKey>(key: K, ...args: TranslateParams<K>) => string
}

const I18nContext = createContext<I18nContextValue>()

export function I18nProvider(props: { children: JSX.Element; initialLocale?: Locale }) {
  const initial = props.initialLocale ?? detectLocale()

  const [locale, setLocaleSignal] = createSignal<Locale>(initial)
  const [version, setVersion] = createSignal(0)

  const core = createI18nCore(initial, () => {
    setVersion((v) => v + 1)
  })

  // If initial locale is not English, load it
  if (initial !== 'en') {
    loadLocale(initial).then(() => {
      core.setLocale(initial)
    })
  }

  const setLocale = async (newLocale: Locale) => {
    await core.setLocale(newLocale)
    setLocaleSignal(newLocale)
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('heaven:locale', newLocale)
    }
  }

  const value: I18nContextValue = {
    locale,
    setLocale,
    t: <K extends TranslationKey>(key: K, ...args: TranslateParams<K>) => {
      // Reading version() + locale() makes this reactive in SolidJS.
      // Any component calling t() in JSX will re-evaluate on locale change.
      void version()
      void locale()
      return core.t(key, ...args)
    },
  }

  return (
    // @ts-ignore - solid-js context typing
    <I18nContext.Provider value={value}>
      {props.children}
    </I18nContext.Provider>
  )
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useI18n must be used within an I18nProvider')
  return ctx
}
