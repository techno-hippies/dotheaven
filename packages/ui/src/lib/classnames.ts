import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Haptic feedback utilities (Android Chrome only, graceful no-op elsewhere)
 */
export const haptic = {
  /** Light tap - tab switches, toggles (5ms) */
  light: () => navigator.vibrate?.(5),
  /** Medium tap - button presses, selections (10ms) */
  medium: () => navigator.vibrate?.(10),
  /** Heavy tap - important actions like send, confirm (15ms) */
  heavy: () => navigator.vibrate?.(15),
  /** Success pattern - achievements */
  success: () => navigator.vibrate?.([10, 50, 10]),
  /** Double tap - likes, favorites */
  double: () => navigator.vibrate?.([8, 30, 8]),
}
