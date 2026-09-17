// Animated launch screen.
//
// This is the in-app splash, not the native one: it mounts as the first
// thing AppContent renders and stays up until two things are both true —
// the animation has run its course, and the app actually knows what to
// show next (auth resolved, profile read). App.tsx owns that second
// condition; this component owns the first and reports it via onFinish.
//
// The point of the animation is to make the wait feel deliberate rather
// than empty. A cold start has to resolve Firebase auth and read the
// profile document before it can pick a screen, and without something
// on top the user sees a blank frame, then possibly a flash of the
// sign-in screen before the session restores.
//
// Everything here is theme-aware, so it follows the dark-mode switch
// like the rest of the app.
import React, { useEffect, useRef } from 'react';
import { Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedProps,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

import { colors, withOpacity } from '../../Theme/colors';
import { radius, spacing } from '../../Theme/spacing';
import { themedStyles } from '../../Theme/ThemeContext';

const AnimatedPath = Animated.createAnimatedComponent(Path);

/**
 * How long the full sequence runs. App.tsx will hold the splash longer
 * if it is still loading, but never cuts it short — a splash that
 * vanishes mid-animation reads as a glitch.
 */
export const SPLASH_DURATION_MS = 2400;

/** Reduced motion still gets a branded beat, just without the theatre. */
const REDUCED_DURATION_MS = 700;

const BADGE_SIZE = 108;

// The ECG trace, in the 120x64 viewBox below. Drawn by animating
// strokeDashoffset from the path's length down to zero.
const TRACE = 'M4 32 H34 L44 12 L56 52 L66 26 L74 32 H116';

// Sum of the segment lengths above (~174). The dash array has to be at
// least the true length or the tail never finishes drawing, and much
// larger would waste the first part of the animation on an invisible
// offset, so this is rounded up only slightly.
const TRACE_LENGTH = 176;

export interface SplashScreenProps {
  /** Fired once the animation has finished. */
  onFinish: () => void;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({ onFinish }) => {
  const reducedMotion = useReducedMotion();
  const duration = reducedMotion ? REDUCED_DURATION_MS : SPLASH_DURATION_MS;

  // Progress of each stage, 0 -> 1.
  const badge = useSharedValue(0);
  const trace = useSharedValue(0);
  const wordmark = useSharedValue(0);
  const tagline = useSharedValue(0);
  const bar = useSharedValue(0);
  const pulse = useSharedValue(0);

  // Read through a ref so a parent that passes a new closure each render
  // cannot restart the sequence half-way through.
  const finishRef = useRef(onFinish);
  finishRef.current = onFinish;

  useEffect(() => {
    if (reducedMotion) {
      // No movement, no repeating pulse — just present the mark.
      badge.value = withTiming(1, { duration: 200 });
      trace.value = withTiming(1, { duration: 200 });
      wordmark.value = withTiming(1, { duration: 200 });
      tagline.value = withTiming(1, { duration: 200 });
      bar.value = withTiming(1, { duration: REDUCED_DURATION_MS });
    } else {
      const easeOut = { duration: 520, easing: Easing.out(Easing.cubic) };

      badge.value = withTiming(1, { duration: 620, easing: Easing.out(Easing.back(1.6)) });

      // Starts as the badge settles, so the line appears to be drawn
      // *into* a mark that is already there.
      trace.value = withDelay(
        420,
        withTiming(1, { duration: 1000, easing: Easing.inOut(Easing.cubic) }),
      );

      wordmark.value = withDelay(560, withTiming(1, easeOut));
      tagline.value = withDelay(760, withTiming(1, easeOut));

      // The rings keep moving for the whole splash, which is what makes
      // a slow cold start feel alive rather than stalled.
      pulse.value = withDelay(
        300,
        withRepeat(withTiming(1, { duration: 1800, easing: Easing.out(Easing.quad) }), -1, false),
      );

      // Eases out at the end so it settles at full width just before the
      // handoff, instead of being cut off mid-travel.
      bar.value = withDelay(
        260,
        withSequence(
          withTiming(0.72, { duration: 1100, easing: Easing.out(Easing.quad) }),
          withTiming(1, { duration: 900, easing: Easing.inOut(Easing.quad) }),
        ),
      );
    }

    const timer = setTimeout(() => finishRef.current(), duration);
    return () => clearTimeout(timer);
  }, [badge, bar, duration, pulse, reducedMotion, tagline, trace, wordmark]);

  const badgeStyle = useAnimatedStyle(() => ({
    opacity: badge.value,
    transform: [{ scale: 0.6 + badge.value * 0.4 }],
  }));

  const traceProps = useAnimatedProps(() => ({
    strokeDashoffset: TRACE_LENGTH * (1 - trace.value),
  }));

  const wordmarkStyle = useAnimatedStyle(() => ({
    opacity: wordmark.value,
    transform: [{ translateY: (1 - wordmark.value) * 14 }],
  }));

  const taglineStyle = useAnimatedStyle(() => ({
    opacity: tagline.value * 0.9,
    transform: [{ translateY: (1 - tagline.value) * 10 }],
  }));

  const barStyle = useAnimatedStyle(() => ({
    transform: [{ scaleX: bar.value }],
  }));

  return (
    <View style={styles.root}>
      <View style={styles.center}>
        <View style={styles.badgeArea}>
          {/* Behind the badge: three rings on the same clock, offset so
              one is always mid-flight. */}
          <PulseRing progress={pulse} offset={0} />
          <PulseRing progress={pulse} offset={0.33} />
          <PulseRing progress={pulse} offset={0.66} />

          <Animated.View style={[styles.badge, badgeStyle]}>
            <Svg width={72} height={38} viewBox="0 0 120 64">
              <AnimatedPath
                d={TRACE}
                stroke={colors.primary}
                strokeWidth={7}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
                strokeDasharray={TRACE_LENGTH}
                animatedProps={traceProps}
              />
            </Svg>
          </Animated.View>
        </View>

        <Animated.Text style={[styles.wordmark, wordmarkStyle]}>PulseFit</Animated.Text>
        <Animated.Text style={[styles.tagline, taglineStyle]}>
          Train. Track. Transform.
        </Animated.Text>
      </View>

      <View style={styles.footer}>
        <View style={styles.barTrack}>
          <Animated.View style={[styles.barFill, barStyle]} />
        </View>
        <Text style={styles.footerNote}>Getting your day ready</Text>
      </View>
    </View>
  );
};

/**
 * One expanding ring. They all read the same shared value and shift it
 * by a fixed amount, so the three stay evenly spaced forever without
 * three separate animations that could drift apart.
 */
const PulseRing: React.FC<{
  progress: { value: number };
  offset: number;
}> = ({ progress, offset }) => {
  const style = useAnimatedStyle(() => {
    // Wraps back to 0 rather than running past 1, which is what turns
    // one repeating timer into a continuous stagger.
    const t = (progress.value + offset) % 1;
    return {
      opacity: (1 - t) * 0.5,
      transform: [{ scale: 0.85 + t * 0.9 }],
    };
  });

  return <Animated.View pointerEvents="none" style={[styles.ring, style]} />;
};

export default SplashScreen;

const styles = themedStyles(() => ({
  root: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },

  center: { alignItems: 'center' },

  // Fixed box so the rings, which overflow the badge, have room to grow
  // without shifting the wordmark underneath them.
  badgeArea: {
    width: BADGE_SIZE * 2,
    height: BADGE_SIZE * 2,
    alignItems: 'center',
    justifyContent: 'center',
  },

  ring: {
    position: 'absolute',
    width: BADGE_SIZE,
    height: BADGE_SIZE,
    borderRadius: radius.full,
    borderWidth: 2,
    borderColor: colors.primary,
  },

  badge: {
    width: BADGE_SIZE,
    height: BADGE_SIZE,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: withOpacity(colors.primary, 0.12),
    borderWidth: 1,
    borderColor: withOpacity(colors.primary, 0.3),
    // Reads as a glow on dark, as a soft lift on light.
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 24,
    elevation: 12,
  },

  wordmark: {
    marginTop: spacing.lg,
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: -0.8,
    color: colors.textPrimary,
  },

  tagline: {
    marginTop: spacing['2xs'],
    fontSize: 13.5,
    fontWeight: '600',
    letterSpacing: 0.3,
    color: colors.textSecondary,
  },

  footer: {
    position: 'absolute',
    bottom: spacing['3xl'],
    alignItems: 'center',
    gap: spacing.sm,
  },

  barTrack: {
    width: 132,
    height: 4,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceContainer,
    overflow: 'hidden',
  },

  barFill: {
    width: '100%',
    height: '100%',
    borderRadius: radius.full,
    backgroundColor: colors.primary,
    // Grows from the left instead of from the middle, which is what
    // scaleX does by default.
    transformOrigin: 'left center',
  },

  footerNote: {
    fontSize: 11.5,
    fontWeight: '600',
    letterSpacing: 0.4,
    color: colors.textMuted,
  },
}));
