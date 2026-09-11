import { TextStyle } from 'react-native';

// Mirrors DESIGN.md's type scale. React Native has no letter-spacing units
// other than raw numbers (treated as px), so em values are converted
// against each style's font size.
const scale = (fontSize: number, em: number) => Math.round(fontSize * em * 100) / 100;

export const typography: Record<string, TextStyle> = {
  displayHero: {
    fontFamily: 'Inter',
    fontSize: 48,
    fontWeight: '800',
    lineHeight: 52,
    letterSpacing: scale(48, -0.03),
  },
  displayHeroMobile: {
    fontFamily: 'Inter',
    fontSize: 36,
    fontWeight: '800',
    lineHeight: 40,
    letterSpacing: scale(36, -0.025),
  },
  metricLarge: {
    fontFamily: 'Inter',
    fontSize: 32,
    fontWeight: '700',
    lineHeight: 36,
    letterSpacing: scale(32, -0.02),
  },
  headlineLg: {
    fontFamily: 'Inter',
    fontSize: 24,
    fontWeight: '700',
    lineHeight: 30,
    letterSpacing: scale(24, -0.015),
  },
  headlineMd: {
    fontFamily: 'Inter',
    fontSize: 20,
    fontWeight: '600',
    lineHeight: 26,
    letterSpacing: scale(20, -0.01),
  },
  headlineSm: {
    fontFamily: 'Inter',
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 22,
    letterSpacing: scale(16, -0.005),
  },
  bodyLg: {
    fontFamily: 'Inter',
    fontSize: 16,
    fontWeight: '400',
    lineHeight: 24,
    letterSpacing: 0,
  },
  bodyMd: {
    fontFamily: 'Inter',
    fontSize: 14,
    fontWeight: '400',
    lineHeight: 20,
    letterSpacing: 0,
  },
  bodySm: {
    fontFamily: 'Inter',
    fontSize: 12,
    fontWeight: '400',
    lineHeight: 16,
    letterSpacing: scale(12, 0.01),
  },
  labelCaps: {
    fontFamily: 'Inter',
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 14,
    letterSpacing: scale(11, 0.08),
  },
  labelRegular: {
    fontFamily: 'Inter',
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 16,
    letterSpacing: scale(12, 0.01),
  },
};

/**
 * Returns a typography scale entry as a React Native TextStyle,
 * spreadable onto a `<Text>` `style` prop.
 */
export const textStyle = (key: keyof typeof typography): TextStyle => {
  return { ...typography[key] };
};
