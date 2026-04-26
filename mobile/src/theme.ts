export const Colors = {
  // Backgrounds
  bg: '#050D1E',         // AVERO navy
  surface: '#0D1A30',    // AVERO navy surface
  surfaceAlt: '#162540', // AVERO navy alt

  // Borders
  border: '#1E3358',
  borderMuted: '#284570',

  // Brand
  primary: '#2563EB',    // AVERO blue
  primaryMuted: '#1D4ED8',

  // Text
  textPrimary: '#fafafa',
  textMuted: '#a1a1aa',
  textDisabled: '#71717a',

  // Status
  statusOpen: '#2563EB',
  statusInProgress: '#3b82f6',
  statusDone: '#22c55e',
  statusError: '#ef4444',

  // Transparent
  overlay: 'rgba(0,0,0,0.6)',
} as const;

export const Radii = {
  card: 12,
  input: 8,
  badge: 6,
  button: 10,
  full: 9999,
} as const;

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const FontSize = {
  xs: 11,
  sm: 13,
  base: 15,
  md: 17,
  lg: 20,
  xl: 24,
  xxl: 30,
} as const;

export const FontWeight = {
  regular: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
  bold: '700' as const,
};
