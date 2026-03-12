export interface Theme {
  bg: string;
  bgPanel: string;
  bgCard: string;
  border: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  red: string;
  teal: string;
  yellow: string;
  orange: string;
  purple: string;
  tabBarBg: string;
  tabBarBorder: string;
  tabBarActive: string;
  tabBarInactive: string;
  subNavBg: string;
  subNavBorder: string;
  inputBg: string;
  inputBorder: string;
  inputText: string;
  inputPlaceholder: string;
  pillBg: string;
  pillBorder: string;
  pillText: string;
  mapOverlayBg: string;
}

export const darkTheme: Theme = {
  bg:              '#0D0D0D',
  bgPanel:         '#141414',
  bgCard:          '#1A1A1A',
  border:          '#242424',
  textPrimary:     '#FFFFFF',
  textSecondary:   '#E8E4DC',
  textMuted:       '#999999',
  red:             '#D32F2F',
  teal:            '#4ECDC4',
  yellow:          '#F7B731',
  orange:          '#FF6B35',
  purple:          '#A29BFE',
  tabBarBg:        '#141414',
  tabBarBorder:    '#242424',
  tabBarActive:    '#D32F2F',
  tabBarInactive:  '#383838',
  subNavBg:        '#141414',
  subNavBorder:    '#242424',
  inputBg:         '#1A1A1A',
  inputBorder:     '#333333',
  inputText:       '#FFFFFF',
  inputPlaceholder:'#555555',
  pillBg:          '#1A1A1A',
  pillBorder:      '#242424',
  pillText:        '#666666',
  mapOverlayBg:    '#000000AA',
};

export const lightTheme: Theme = {
  bg:              '#F4F4F4',
  bgPanel:         '#FFFFFF',
  bgCard:          '#FFFFFF',
  border:          '#E0E0E0',
  textPrimary:     '#111111',
  textSecondary:   '#222222',
  textMuted:       '#777777',
  red:             '#D32F2F',
  teal:            '#00897B',
  yellow:          '#F59E0B',
  orange:          '#EA580C',
  purple:          '#7C3AED',
  tabBarBg:        '#FFFFFF',
  tabBarBorder:    '#E0E0E0',
  tabBarActive:    '#D32F2F',
  tabBarInactive:  '#AAAAAA',
  subNavBg:        '#FFFFFF',
  subNavBorder:    '#E0E0E0',
  inputBg:         '#F9F9F9',
  inputBorder:     '#DDDDDD',
  inputText:       '#111111',
  inputPlaceholder:'#AAAAAA',
  pillBg:          '#F0F0F0',
  pillBorder:      '#E0E0E0',
  pillText:        '#888888',
  mapOverlayBg:    'rgba(255,255,255,0.85)',
};
