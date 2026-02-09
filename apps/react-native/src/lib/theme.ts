/** Heaven Dark Theme — matches web app CSS variables exactly */

export const colors = {
  // Backgrounds (Catppuccin neutral grays)
  bgPage: '#171717',
  bgSurface: '#1c1c1c',
  bgElevated: '#262626',
  bgHighlight: '#1c1c1c',
  bgHighlightHover: '#202020',

  // Text
  textPrimary: '#fafafa',
  textSecondary: '#d4d4d4',
  textMuted: '#a3a3a3',

  // Accents (Catppuccin)
  accentBlue: '#89b4fa',
  accentBlueHover: '#b4befe',
  accentPurple: '#cba6f7',
  accentCoral: '#fab387',
  success: '#a6e3a1',
  successSoft: 'rgba(166, 227, 161, 0.1)',

  // Borders
  borderDefault: '#404040',
  borderSubtle: '#363636',

  // Overlay
  overlay: 'rgba(23, 23, 23, 0.9)',

  // Semantic
  white: '#ffffff',
  black: '#000000',
} as const;

export const spacing = {
  headerPaddingTop: 56,
  headerPaddingBottom: 16,
  headerPaddingHorizontal: 16,
  trackRowHeight: 72,
  trackRowHeightDesktop: 56,
  miniPlayerHeight: 64,
  tabBarHeight: 64,
  albumCoverSm: 48,
  albumCoverMd: 56,
} as const;

export const radii = {
  full: 9999,
  md: 8,
  lg: 12,
  xl: 16,
} as const;

export const fontSize = {
  xs: 10,
  sm: 13,
  base: 16,
  lg: 18,
  xl: 20,
  '2xl': 24,
} as const;
