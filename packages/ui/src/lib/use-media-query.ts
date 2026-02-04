import { createSignal, onCleanup, onMount } from 'solid-js'

/**
 * Reactive media query hook for SolidJS.
 * Returns a signal that updates when the media query match changes.
 *
 * @param query - CSS media query string (e.g., '(min-width: 768px)')
 * @returns Signal indicating if the query matches
 */
export function useMediaQuery(query: string) {
  const [matches, setMatches] = createSignal(false)

  onMount(() => {
    const mediaQuery = window.matchMedia(query)
    setMatches(mediaQuery.matches)

    const handler = (e: MediaQueryListEvent) => setMatches(e.matches)
    mediaQuery.addEventListener('change', handler)

    onCleanup(() => mediaQuery.removeEventListener('change', handler))
  })

  return matches
}

/**
 * Breakpoint constants matching Tailwind defaults.
 */
export const BREAKPOINTS = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  '2xl': 1536,
} as const

/**
 * Common responsive hooks for the app.
 */
export function useIsMobile() {
  return useMediaQuery(`(max-width: ${BREAKPOINTS.md - 1}px)`)
}

export function useIsTablet() {
  return useMediaQuery(`(min-width: ${BREAKPOINTS.md}px) and (max-width: ${BREAKPOINTS.lg - 1}px)`)
}

export function useIsDesktop() {
  return useMediaQuery(`(min-width: ${BREAKPOINTS.lg}px)`)
}
