export interface Theme {
  bg: string;
  bgPanel: string;
  bgCard: string;
  border: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  red: string;
  green: string;
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
  cardDivider: string;
  mapOverlayBg: string;
  toggleTrackOff: string;
  toggleTrackOn: string;
  toggleThumbOff: string;
  toggleThumbOn: string;
  white: string;
  // Chrome metallic borders (only meaningful for chrome theme, defaults for others)
  cardBorderTop?: string;
  cardBorderBottom?: string;
  btnBorderTop?: string;
  btnBorderBottom?: string;
}

export const darkTheme: Theme = {
  bg:              '#0D0D0D',
  bgPanel:         '#141414',
  bgCard:          '#1A1A1A',
  border:          '#242424',
  textPrimary:     '#FFFFFF',
  textSecondary:   '#E8E4DC',
  textMuted:       '#999999',
  red:             '#E53935',
  green:           '#4CAF50',
  teal:            '#4ECDC4',
  yellow:          '#F7B731',
  orange:          '#FF6B35',
  purple:          '#A29BFE',
  tabBarBg:        '#141414',
  tabBarBorder:    '#242424',
  tabBarActive:    '#E53935',
  tabBarInactive:  '#9E9E9E',
  subNavBg:        '#141414',
  subNavBorder:    '#242424',
  inputBg:         '#1A1A1A',
  inputBorder:     '#333333',
  inputText:       '#FFFFFF',
  inputPlaceholder:'#555555',
  pillBg:          '#1A1A1A',
  pillBorder:      '#242424',
  pillText:        '#9E9E9E',
  cardDivider:     '#444444',
  mapOverlayBg:    '#000000AA',
  toggleTrackOff:  '#3A3A3A',
  toggleTrackOn:   '#4CAF50',
  toggleThumbOff:  '#8A8A8A',
  toggleThumbOn:   '#FFFFFF',
  white:           '#FFFFFF',
};

export const sandTheme: Theme = {
  bg:              '#F5ECD7',
  bgPanel:         '#EDE0C4',
  bgCard:          '#E5D4AE',
  border:          '#C8B48A',
  textPrimary:     '#1A0F00',
  textSecondary:   '#3D2B10',
  textMuted:       '#6B4F2E',
  red:             '#E53935',
  green:           '#4CAF50',
  teal:            '#00897B',
  yellow:          '#F59E0B',
  orange:          '#EA580C',
  purple:          '#7C3AED',
  tabBarBg:        '#EDE0C4',
  tabBarBorder:    '#C8B48A',
  tabBarActive:    '#9B5E00',
  tabBarInactive:  '#6B4F2E',
  subNavBg:        '#EDE0C4',
  subNavBorder:    '#C8B48A',
  inputBg:         '#EDE0C4',
  inputBorder:     '#C8B48A',
  inputText:       '#2C1F0E',
  inputPlaceholder:'#8B7355',
  pillBg:          '#EDE0C4',
  pillBorder:      '#C8B48A',
  pillText:        '#3D2B10',
  cardDivider:     '#C8B48A',
  mapOverlayBg:    'rgba(245,236,215,0.85)',
  toggleTrackOff:  '#C8B48A',
  toggleTrackOn:   '#4CAF50',
  toggleThumbOff:  '#FFFFFF',
  toggleThumbOn:   '#FFFFFF',
  white:           '#FFFFFF',
  // Sand beveled edges
  cardBorderTop:   '#EDE0C4',
  cardBorderBottom:'#B8A07A',
  btnBorderTop:    '#EF5350',
  btnBorderBottom: '#B71C1C',
};

export const lightTheme: Theme = {
  bg:              '#F4F4F4',
  bgPanel:         '#FFFFFF',
  bgCard:          '#FFFFFF',
  border:          '#E0E0E0',
  textPrimary:     '#111111',
  textSecondary:   '#222222',
  textMuted:       '#777777',
  red:             '#C62828',
  green:           '#4CAF50',
  teal:            '#00897B',
  yellow:          '#F59E0B',
  orange:          '#EA580C',
  purple:          '#7C3AED',
  tabBarBg:        '#FFFFFF',
  tabBarBorder:    '#E0E0E0',
  tabBarActive:    '#C62828',
  tabBarInactive:  '#111111',
  subNavBg:        '#FFFFFF',
  subNavBorder:    '#E0E0E0',
  inputBg:         '#F9F9F9',
  inputBorder:     '#DDDDDD',
  inputText:       '#111111',
  inputPlaceholder:'#AAAAAA',
  pillBg:          '#F0F0F0',
  pillBorder:      '#E0E0E0',
  pillText:        '#111111',
  cardDivider:     '#E0E0E0',
  mapOverlayBg:    'rgba(255,255,255,0.85)',
  toggleTrackOff:  '#D1D1D1',
  toggleTrackOn:   '#4CAF50',
  toggleThumbOff:  '#FFFFFF',
  toggleThumbOn:   '#FFFFFF',
  white:           '#FFFFFF',
};
