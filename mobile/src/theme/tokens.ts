export const COLORS = {
  // Primary visual tokens from spec
  navy: '#101C2C',
  navyLight: '#1C2C40',
  navyMuted: '#2C3D52',
  lime: '#C8F169',
  limePressed: '#B3DC52',
  limeSubtle: '#F4FCE6',
  white: '#FFFFFF',
  mist: '#F3F5F7',
  success: '#16805D',
  successLight: '#E8F5F0',

  // UI helpers
  border: '#E2E6EC',
  borderSelected: '#101C2C',
  textPrimary: '#101C2C',
  textSecondary: '#526274',
  textMuted: '#8493A3',
  warning: '#B45309',
  warningBg: '#FFFBEB',
  warningBorder: '#FDE68A',
} as const;

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

export const RADII = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  full: 9999,
} as const;

export const TYPOGRAPHY = {
  fontFamily: 'System', // Falls back smoothly on iOS/Android; Inter is loaded when available
  h1: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '800' as const,
    color: COLORS.navy,
  },
  h2: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '700' as const,
    color: COLORS.navy,
  },
  h3: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '600' as const,
    color: COLORS.navy,
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '400' as const,
    color: COLORS.textSecondary,
  },
  bodyBold: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '600' as const,
    color: COLORS.navy,
  },
  caption: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500' as const,
    color: COLORS.textMuted,
  },
  button: {
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '700' as const,
    color: COLORS.navy,
  },
} as const;
