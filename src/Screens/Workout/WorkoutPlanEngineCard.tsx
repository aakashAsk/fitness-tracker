// The "Design AI Workout Protocol" promo on the Workout screen, under the
// Training Progress card.
//
// Rendered behind the `enabledAddForSubscription` flag by the caller —
// see registry.ts — so this file knows nothing about flags.
//
// The gradient is drawn with react-native-svg at the measured pixel size,
// for the same reasons SubscriptionAdBanner spells out (percentage sizing
// is unreliable on Android; react-native-linear-gradient may be missing
// from the dev build). It shares that banner's brand stops so the two
// adverts read as one family.
import React, { useState } from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { ArrowRight, CheckCircle2, Clock } from 'lucide-react-native';

import { colors, withOpacity } from '../../Theme/colors';
import { spacing } from '../../Theme/spacing';
import { themedStyles } from '../../Theme/ThemeContext';
import { GRADIENT_STOPS } from '../Dashboard/SubscriptionAdBanner';

const CARD_RADIUS = 24;
const GRADIENT_START = GRADIENT_STOPS[0].color;

export interface WorkoutPlanEngineCardProps {
    /** The card's destination. Optional: with nothing to open, the card is
        not pressable, which is better than a tap that does nothing. */
    onPress?: () => void;
    /** A plan is being generated: the arrow becomes a spinner and the card
        ignores taps, so the ~10s wait reads as work in progress and a
        second tap cannot start a second run. */
    loading?: boolean;
    /** All the copy is overridable so this same gradient card can front a
        different AI feature (the Nutrition tab's meal-plan generator, say)
        without duplicating the SVG/layout — everything below defaults to
        the original workout-plan wording. */
    headerLabel?: string;
    headerHint?: string;
    pillText?: string;
    title?: string;
    description?: string;
    loadingLabel?: string;
    idleLabel?: string;
}

export const WorkoutPlanEngineCard: React.FC<WorkoutPlanEngineCardProps> = ({
    onPress,
    loading = false,
    headerLabel = 'WORKOUT PLAN ENGINE',
    headerHint = '1-Tap Personalization',
    pillText = 'Intelligent Routine Engine',
    title = 'Design AI Workout Protocol',
    description = 'Curate an adaptive split calibrated to your target biomechanics, fatigue capacity, and equipment.',
    loadingLabel = 'Designing your AI workout protocol',
    idleLabel = 'Design AI workout protocol',
}) => {
    const [size, setSize] = useState({ width: 0, height: 0 });

    return (
        <View style={styles.section}>
            <View style={styles.headerRow}>
                <Text style={styles.headerLabel}>{headerLabel}</Text>
                <Text style={styles.headerHint}>{headerHint}</Text>
            </View>

            <View style={styles.shadow}>
                <TouchableOpacity
                    activeOpacity={onPress ? 0.92 : 1}
                    onPress={onPress}
                    disabled={!onPress || loading}
                    accessibilityRole={onPress ? 'button' : undefined}
                    accessibilityState={{ busy: loading, disabled: !onPress || loading }}
                    accessibilityLabel={loading ? loadingLabel : idleLabel}
                    style={styles.card}
                    onLayout={(event) => {
                        const { width, height } = event.nativeEvent.layout;
                        setSize((prev) =>
                            prev.width === width && prev.height === height
                                ? prev
                                : { width, height },
                        );
                    }}
                >
                    {size.width > 0 ? (
                        <Svg style={styles.backdrop} width={size.width} height={size.height}>
                            <Defs>
                                <LinearGradient id="planEngine" x1="0" y1="0" x2="1" y2="1">
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
                                fill="url(#planEngine)"
                            />
                            {/* Two faint rings off the bottom-right corner;
                                the card's overflow clip trims them. */}
                            <Circle
                                cx={size.width - 24}
                                cy={size.height - 8}
                                r={92}
                                stroke={colors.white}
                                strokeOpacity={0.14}
                                strokeWidth={1}
                                fill="none"
                            />
                            <Circle
                                cx={size.width - 24}
                                cy={size.height - 8}
                                r={62}
                                stroke={colors.white}
                                strokeOpacity={0.1}
                                strokeWidth={1}
                                fill="none"
                            />
                        </Svg>
                    ) : null}

                    <View style={styles.topRow}>
                        <View style={styles.textBlock}>
                            <View style={styles.pill}>
                                <View style={styles.pillDot} />
                                <Text style={styles.pillText}>{pillText}</Text>
                            </View>
                            <Text style={styles.title}>{title}</Text>
                            <Text style={styles.description}>{description}</Text>
                        </View>

                        <View style={styles.arrowCircle}>
                            {loading ? (
                                <ActivityIndicator size="small" color={GRADIENT_START} />
                            ) : (
                                <ArrowRight size={22} color={GRADIENT_START} strokeWidth={2.6} />
                            )}
                        </View>
                    </View>

                    <View style={styles.divider} />

                    <View style={styles.footerRow}>
                        <View style={styles.footerItem}>
                            <Clock size={14} color={withOpacity(colors.white, 0.85)} strokeWidth={2.2} />
                            <Text style={styles.footerText}>~10s Synthesis</Text>
                        </View>
                        <View style={styles.footerItem}>
                            <CheckCircle2
                                size={14}
                                color={withOpacity(colors.white, 0.85)}
                                strokeWidth={2.2}
                            />
                            <Text style={styles.footerText}>Volume Auto-Scaled</Text>
                        </View>
                    </View>
                </TouchableOpacity>
            </View>
        </View>
    );
};

export default WorkoutPlanEngineCard;

const styles = themedStyles(() => ({
    section: {
        gap: 10,
    },
    headerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: spacing.screenHorizontalPadding + 4,
    },
    headerLabel: {
        fontSize: 12,
        fontWeight: '800',
        letterSpacing: 0.9,
        color: colors.primary,
    },
    headerHint: {
        fontSize: 12.5,
        fontWeight: '500',
        color: colors.textSecondary,
    },
    // The shadow lives here rather than on the card: the card clips its
    // overflow (to trim the rings), and iOS clips a shadow drawn by the
    // same view.
    shadow: {
        marginHorizontal: spacing.screenHorizontalPadding,
        borderRadius: CARD_RADIUS,
        backgroundColor: GRADIENT_START,
        shadowColor: GRADIENT_START,
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.3,
        shadowRadius: 18,
        elevation: 6,
    },
    card: {
        borderRadius: CARD_RADIUS,
        overflow: 'hidden',
        backgroundColor: GRADIENT_START,
        paddingHorizontal: 20,
        paddingTop: 22,
        paddingBottom: 16,
    },
    backdrop: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
    },
    topRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    textBlock: {
        flex: 1,
        minWidth: 0,
    },
    pill: {
        alignSelf: 'flex-start',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 7,
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 14,
        backgroundColor: withOpacity(colors.black, 0.22),
        borderWidth: 1,
        borderColor: withOpacity(colors.white, 0.14),
    },
    pillDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: colors.success,
    },
    pillText: {
        fontSize: 12,
        fontWeight: '700',
        color: colors.white,
    },
    title: {
        marginTop: 14,
        fontSize: 20,
        lineHeight: 26,
        fontWeight: '800',
        letterSpacing: -0.3,
        color: colors.white,
    },
    description: {
        marginTop: 8,
        fontSize: 14,
        lineHeight: 21,
        fontWeight: '500',
        color: withOpacity(colors.white, 0.85),
    },
    arrowCircle: {
        flexShrink: 0,
        width: 56,
        height: 56,
        borderRadius: 28,
        alignItems: 'center',
        justifyContent: 'center',
        // Fixed white, not a theme token: it sits on a fixed gradient.
        backgroundColor: '#FFFFFF',
    },
    divider: {
        marginTop: 16,
        height: 1,
        backgroundColor: withOpacity(colors.white, 0.18),
    },
    footerRow: {
        marginTop: 12,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 18,
    },
    footerItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    footerText: {
        fontSize: 12.5,
        fontWeight: '600',
        color: withOpacity(colors.white, 0.9),
    },
}));
