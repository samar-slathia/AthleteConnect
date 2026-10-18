export const TOKENS = {
  colors: {
    navy: '#101C2C',
    navyLight: '#1C2B3E',
    navyMuted: '#2A3B50',
    lime: '#C8F169',
    limeHover: '#B6E552',
    limeSubtle: '#F1FCD4',
    white: '#FFFFFF',
    mist: '#F3F5F7',
    border: '#E2E6EA',
    borderDark: '#223246',
    textPrimary: '#101C2C',
    textSecondary: '#5A6878',
    textMuted: '#8896A6',
    success: '#16805D',
    successBg: '#E8F6F0',
    warning: '#B45309',
    warningBg: '#FEF3C7',
  },
  fonts: {
    family: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  },
  radii: {
    sm: '6px',
    md: '10px',
    lg: '14px',
    full: '9999px',
  },
} as const;

export type NavigationItemKey = 'overview' | 'coaches' | 'users' | 'bookings' | 'finance';
