export const colors = {
  background: '#f3ece2',
  backgroundWarm: '#efe1d0',
  surface: '#fffaf2',
  surfaceElevated: '#ffffff',
  surfaceMuted: '#efe4d4',
  surfaceSoft: '#fff4e7',
  border: '#d8c8b4',
  divider: '#e8ddd0',
  overlay: 'rgba(19, 32, 45, 0.5)',
  ink: '#13202d',
  inkMuted: '#5d676f',
  accent: '#e15a2b',
  accentPressed: '#b8471f',
  accentSoft: '#fde8e0',
  teal: '#255d62',
  tealSoft: '#e0eeef',
  success: '#2d7a58',
  successSoft: '#d8ecdf',
  warning: '#a06200',
  warningSoft: '#f7ead3',
  danger: '#8d2436',
  dangerSoft: '#f7d8df',
  white: '#ffffff',
  whiteSoft: '#fff7ef',
};

export const spacing = {
  xxs: 2,
  xs: 6,
  sm: 10,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const radius = {
  sm: 12,
  md: 18,
  lg: 24,
  xl: 32,
  full: 999,
};

export const typography = {
  displayLg: {
    fontSize: 34,
    fontWeight: '900' as const,
    lineHeight: 38,
  },
  displaySm: {
    fontSize: 26,
    fontWeight: '900' as const,
    lineHeight: 30,
  },
  headingLg: {
    fontSize: 20,
    fontWeight: '800' as const,
    lineHeight: 26,
  },
  headingSm: {
    fontSize: 16,
    fontWeight: '800' as const,
    lineHeight: 22,
  },
  bodyLg: {
    fontSize: 16,
    fontWeight: '400' as const,
    lineHeight: 24,
  },
  bodySm: {
    fontSize: 14,
    fontWeight: '400' as const,
    lineHeight: 20,
  },
  caption: {
    fontSize: 12,
    fontWeight: '600' as const,
    lineHeight: 16,
  },
  overline: {
    fontSize: 12,
    fontWeight: '700' as const,
    lineHeight: 16,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.8,
  },
};

export const shadows = {
  sm: {
    shadowColor: '#13202d',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  md: {
    shadowColor: '#13202d',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  lg: {
    shadowColor: '#13202d',
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
};

export const timing = {
  fast: 150,
  normal: 250,
  slow: 400,
  spring: {
    damping: 15,
    stiffness: 150,
  },
};
