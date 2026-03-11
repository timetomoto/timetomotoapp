export const Colors = {
  TTM_RED: '#D32F2F',
  TTM_DARK: '#0D0D0D',
  TTM_PANEL: '#141414',
  TTM_CARD: '#1A1A1A',
  TTM_BORDER: '#242424',

  // Tab bar
  TAB_ACTIVE: '#D32F2F',
  TAB_INACTIVE: '#383838',

  // Text
  TEXT_PRIMARY: '#FFFFFF',
  TEXT_SECONDARY: '#8A8A8A',
} as const;

export const Fonts = {
  header: 'BarlowCondensed',
  body: 'Barlow',
} as const;

export type ColorKey = keyof typeof Colors;
