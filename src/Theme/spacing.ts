// 8pt-derived spacing/radius scale from DESIGN.md (rem -> px at base 16).
export const spacing = {
  '2xs': 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  '2xl': 32,
  '3xl': 48,
  gutterMobile: 16,
  cardPadding: 20,
  bottomNavHeight: 72,
  // Side padding applied per-section on screens with no global screen
  // padding (e.g. the Workout tab) — kept as one constant so shadows
  // have consistent breathing room and can be retuned in one place.
  screenHorizontalPadding: 20,
} as const;

export const radius = {
  sm: 4,
  DEFAULT: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 9999,
} as const;
