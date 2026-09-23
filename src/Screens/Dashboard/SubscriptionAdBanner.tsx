// The subscription advert that slides in over the dashboard, just above
// the bottom navigation.
//
// Behind the `enabledAddForSubscription` flag — see registry.ts. It is
// an advert, so two things matter beyond how it looks:
//
//   - it must never be the first thing a user meets. It waits out
//     APPEAR_DELAY_MS so the dashboard they opened is what they see;
//   - it must be trivially dismissable, and stay dismissed. Whoever
//     renders this owns that state (see App.tsx), because a banner that
//     came back on the next tab switch would be worse than one that
//     never left.
//
// The gradient is drawn with react-native-svg rather than
// react-native-linear-gradient: the latter is in package.json but is
// imported nowhere, so it may not be in the installed dev build, and an
// advert is not worth risking a missing-native-module crash over. SVG is
// already used across this screen's rings.
import React, { useEffect, useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import Animated, { SlideInLeft, SlideOutLeft } from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { ArrowRight, Sparkles, X } from 'lucide-react-native';

import { colors, withOpacity } from '../../Theme/colors';
import { themedStyles } from '../../Theme/ThemeContext';

/** How long the dashboard is left alone before the advert appears. */
export const APPEAR_DELAY_MS = 5000;

const SLIDE_IN_MS = 420;
const SLIDE_OUT_MS = 240;
const CARD_RADIUS = 18;

/**
 * Deep royal: electric blue, through a darker indigo, into violet.
 *
 * Fixed hexes rather than theme tokens — this is the advert's own brand
 * treatment and must read identically in light and dark mode, where a
 * token like `colors.primary` deliberately shifts. The white text and
 * translucent tiles on top are legible against all three stops.
 *
 * The midpoint is what makes it "deep": a straight blue→violet ramp
 * passes through a washed-out periwinkle instead.
 */
export const GRADIENT_STOPS = [
    { offset: '0', color: '#4F6BF6' },
    { offset: '0.5', color: '#3B49DF' },
    { offset: '1', color: '#7C3AED' },
] as const;

/** The first stop, used where a flat colour has to stand in for the
 *  gradient — see `card.backgroundColor`. */
const GRADIENT_START = GRADIENT_STOPS[0].color;

export interface SubscriptionAdBannerProps {
    /** Dismissed by the user — the caller should stop rendering this. */
    onDismiss: () => void;
    /** The advert's destination. Optional: with nothing to open, the card
        is not pressable, which is better than a tap that does nothing. */
    onPress?: () => void;
    /** Overridable so a caller (or a test) need not wait 5 s. */
    delayMs?: number;
}

export const SubscriptionAdBanner: React.FC<SubscriptionAdBannerProps> = ({
    onDismiss,
    onPress,
    delayMs = APPEAR_DELAY_MS,
}) => {
    const [visible, setVisible] = useState(false);
    // The gradient is drawn at the card's measured pixel size rather than
    // "100%". A percentage on the root <Svg> is not resolved reliably by
    // react-native-svg on Android when its parent is absolutely positioned
    // — the rect collapses and the flat fallback colour shows through
    // instead of the ramp. Every working gradient in this app (the
    // calories chart, TrendGraph) sizes its Svg in px for the same reason.
    const [size, setSize] = useState({ width: 0, height: 0 });

    useEffect(() => {
        const timer = setTimeout(() => setVisible(true), delayMs);
        return () => clearTimeout(timer);
    }, [delayMs]);

    if (!visible) return null;

    return (
        <Animated.View
            entering={SlideInLeft.duration(SLIDE_IN_MS)}
            exiting={SlideOutLeft.duration(SLIDE_OUT_MS)}
            style={styles.wrapper}
        >
            <TouchableOpacity
                activeOpacity={onPress ? 0.9 : 1}
                onPress={onPress}
                disabled={!onPress}
                accessibilityRole={onPress ? 'button' : undefined}
                accessibilityLabel="Generate AI workout"
                style={styles.card}
                onLayout={(event) => {
                    const { width, height } = event.nativeEvent.layout;
                    // Guarded so re-layouts with identical numbers do not
                    // loop through state on every render.
                    setSize((prev) =>
                        prev.width === width && prev.height === height
                            ? prev
                            : { width, height },
                    );
                }}
            >
                {/* Fills the card behind its content — the rounded corners
                    are the rect's own, so nothing has to clip. Skipped
                    until measured; the card's flat fallback colour covers
                    that first frame. */}
                {size.width > 0 ? (
                    <Svg style={styles.gradient} width={size.width} height={size.height}>
                        <Defs>
                            <LinearGradient id="subscriptionAd" x1="0" y1="0" x2="1" y2="0">
                                {GRADIENT_STOPS.map((stop) => (
                                    <Stop
                                        key={stop.offset}
                                        offset={stop.offset}
                                        stopColor={stop.color}
                                        stopOpacity={1}
                                    />
                                ))}
                            </LinearGradient>
                        </Defs>
                        <Rect
                            x={0}
                            y={0}
                            width={size.width}
                            height={size.height}
                            rx={CARD_RADIUS}
                            fill="url(#subscriptionAd)"
                        />
                    </Svg>
                ) : null}

                <View style={styles.iconTile}>
                    <Sparkles size={20} color={colors.white} strokeWidth={2.2} />
                </View>

                {/* Copy is cut to fit one line each rather than wrapped.
                    On a 360dp screen the icon tile, arrow and padding
                    leave the text about 200dp; the original wording
                    needed ~230dp, so it either truncated mid-pitch or
                    wrapped the card to nearly double height. Short
                    enough to fit is the only version that is both fully
                    readable and compact. */}
                <View style={styles.textBlock}>
                    <Text style={styles.title} numberOfLines={1}>
                        Generate AI Workout
                    </Text>
                    <Text style={styles.subtitle} numberOfLines={1}>
                        Tuned to your recovery pace
                    </Text>
                </View>

                <View style={styles.arrowCircle}>
                    <ArrowRight size={16} color={colors.white} strokeWidth={2.6} />
                </View>
            </TouchableOpacity>

            {/* Outside the card's touchable, or a press would register as
                "open the advert" on its way to the close button. The hit
                slop matters more than the glyph: this is the control the
                user is reaching for when they want it gone. */}
            <TouchableOpacity
                activeOpacity={0.8}
                onPress={onDismiss}
                accessibilityRole="button"
                accessibilityLabel="Dismiss this advert"
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                style={styles.closeButton}
            >
                <X size={12} color={colors.white} strokeWidth={3} />
            </TouchableOpacity>
        </Animated.View>
    );
};

export default SubscriptionAdBanner;

const styles = themedStyles(() => ({
    wrapper: {
        // Positioned by the caller; this only spaces it off the screen edges.
        marginHorizontal: 16,
    },
    card: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 12,
        paddingHorizontal: 14,
        borderRadius: CARD_RADIUS,
        // The gradient is painted by the SVG below, but a background here
        // means a failed/slow SVG never shows the dashboard through the card.
        backgroundColor: GRADIENT_START,
        shadowColor: GRADIENT_START,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.3,
        shadowRadius: 16,
        elevation: 6,
    },
    gradient: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
    },
    iconTile: {
        // Never squeezed to make room for the wrapped text — the text
        // block is the flexible one.
        flexShrink: 0,
        width: 40,
        height: 40,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: withOpacity(colors.white, 0.18),
    },
    textBlock: {
        flex: 1,
        minWidth: 0,
    },
    title: {
        fontSize: 14,
        // Explicit line heights: wrapped text with the default leading
        // sits too loose at this size and the two lines stop reading as
        // one sentence.
        lineHeight: 18,
        fontWeight: '800',
        color: colors.white,
        letterSpacing: -0.2,
    },
    subtitle: {
        marginTop: 3,
        fontSize: 11.5,
        lineHeight: 15,
        fontWeight: '500',
        color: withOpacity(colors.white, 0.82),
    },
    arrowCircle: {
        flexShrink: 0,
        width: 32,
        height: 32,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: withOpacity(colors.white, 0.22),
    },
    closeButton: {
        position: 'absolute',
        top: -6,
        right: -6,
        width: 22,
        height: 22,
        borderRadius: 11,
        alignItems: 'center',
        justifyContent: 'center',
        // Fixed dark chip, not `colors.textPrimary`: that token is near
        // white in dark mode, which put a white glyph on a white circle
        // and left the close button looking like an empty dot. The card
        // it sits on is a fixed gradient, so this is fixed to match.
        backgroundColor: '#12131F',
        borderWidth: 2,
        borderColor: colors.background,
    },
}));
