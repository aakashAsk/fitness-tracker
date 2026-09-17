import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import {
    ArrowRight,
    Bell,
    Clock,
    Droplet,
    Flame,
    Footprints,
    Weight,
} from 'lucide-react-native';
import { colors, withOpacity } from '../../Theme/colors';
import UserAvatar from '../../Components/UserAvatar';
import { themedStyles } from '../../Theme/ThemeContext';
import { useDailySteps } from '../../Hooks/useDailySteps';
import { DAILY_BURN_GOAL, DAILY_STEP_GOAL } from '../../Services/stepService';
import { useDailyHydration } from '../../Hooks/useDailyHydration';
import { useGreeting } from '../../Hooks/useGreeting';
import { useAppSelector } from '../../Store/hooks';
import { selectUserProfile } from '../../Store/userProfileSlice';

export interface DashboardOverviewProps {
    // The greeting's wording and date come from the clock, and the name
    // from the signed-in user — see useGreeting — so neither is passed in.
    /** Opens the Profile tab — the top-bar avatar is the entry point. */
    onProfilePress?: () => void;
    // Calories burned is derived from the pedometer, and its trend pill
    // now shows progress against DAILY_BURN_GOAL — neither is passed in.
    // Water intake is read from Firestore by the card itself — see
    // useDailyHydration — so there is nothing to pass in.
    bodyWeightKg?: number;
    bodyWeightDeltaKg?: number;
    weeklyAvgKcal?: number;
    monthlyGoalPercent?: number;
    calorieBudgetTotal?: number;
    calorieBudgetConsumed?: number;
    macros?: { label: string; color: string; grams: number; goalGrams: number }[];
    onNotificationsPress?: () => void;
}

const DEFAULT_MACROS = [
    { label: 'Protein', color: colors.protein, grams: 110, goalGrams: 140 },
    { label: 'Carbs', color: colors.carbs, grams: 165, goalGrams: 220 },
    { label: 'Fats', color: colors.fats, grams: 45, goalGrams: 65 },
];

const WEEK_ACTIVITY = [
    { day: 'M', percent: 0.44 },
    { day: 'T', percent: 0.67 },
    { day: 'W', percent: 1, peak: true, kcal: 567 },
    { day: 'T', percent: 0.56 },
    { day: 'F', percent: 0.67 },
    { day: 'S', percent: 0.28 },
    { day: 'S', percent: 0.08 },
];

const BAR_TRACK_HEIGHT = 96;
const CALORIE_RING_SIZE = 112;
const CALORIE_RING_STROKE = 10;
const GAUGE_SIZE = 40;
const GAUGE_STROKE = 3;
const METRIC_RING_SIZE = 78;
const METRIC_RING_STROKE = 8;
const METRIC_RING_RADIUS = (METRIC_RING_SIZE - METRIC_RING_STROKE) / 2;
const METRIC_RING_CIRCUMFERENCE = 2 * Math.PI * METRIC_RING_RADIUS;

/**
 * The progress dial inside a metric tile — water drunk, calories burned.
 *
 * `progress` is expected clamped to 0–1 by the caller, which is where
 * the goal lives; this only draws what it is given.
 */
const MetricRing: React.FC<{
    progress: number;
    accent: string;
    /** Big number in the middle, already formatted. */
    value: string;
    /** Small line under it, e.g. "/ 2,000 ml". */
    caption: string;
}> = ({ progress, accent, value, caption }) => (
    <View style={styles.metricRingWrapper}>
        <Svg width={METRIC_RING_SIZE} height={METRIC_RING_SIZE}>
            <Circle
                cx={METRIC_RING_SIZE / 2}
                cy={METRIC_RING_SIZE / 2}
                r={METRIC_RING_RADIUS}
                stroke={colors.surfaceContainer}
                strokeWidth={METRIC_RING_STROKE}
                fill="none"
            />
            {/* Drawn only once there is something to show — a zero-length
                arc still paints a dot at the 12 o'clock cap. */}
            {progress > 0 ? (
                <Circle
                    cx={METRIC_RING_SIZE / 2}
                    cy={METRIC_RING_SIZE / 2}
                    r={METRIC_RING_RADIUS}
                    stroke={accent}
                    strokeWidth={METRIC_RING_STROKE}
                    strokeDasharray={METRIC_RING_CIRCUMFERENCE}
                    strokeDashoffset={METRIC_RING_CIRCUMFERENCE * (1 - progress)}
                    strokeLinecap="round"
                    fill="none"
                    rotation={-90}
                    originX={METRIC_RING_SIZE / 2}
                    originY={METRIC_RING_SIZE / 2}
                />
            ) : null}
        </Svg>
        <View style={styles.metricRingCenter}>
            <Text style={styles.metricRingValue}>{value}</Text>
            <Text style={styles.metricRingCaption}>{caption}</Text>
        </View>
    </View>
);

export const DashboardOverview: React.FC<DashboardOverviewProps> = ({
    onProfilePress,
    bodyWeightKg = 68.4,
    bodyWeightDeltaKg = -0.4,
    weeklyAvgKcal = 485,
    monthlyGoalPercent = 89,
    calorieBudgetTotal = 2100,
    calorieBudgetConsumed = 1420,
    macros = DEFAULT_MACROS,
    onNotificationsPress,
}) => {
    // "Good morning" is the clock's business, not a caller's, and the
    // name is whatever the user gave at onboarding. A profile written
    // before the name step shipped has none, in which case the greeting
    // simply stands alone rather than addressing nobody.
    const { greeting, dateLabel } = useGreeting();
    const profile = useAppSelector(selectUserProfile);
    const userName = profile?.displayName?.trim() ?? '';

    // Steps come from the device rather than props — the pedometer is
    // the source of truth, and nothing upstream has a better number.
    const stepData = useDailySteps();
    const stepsUnknown = stepData.loading || stepData.source === 'unavailable';
    const stepGoalPercent = Math.round(stepData.goalProgress * 100);
    // A bare "no sensor" gave no way to tell an emulator from a refused
    // permission, so the card names the actual blocker instead.
    const stepUnitLabel =
        stepData.unavailableReason === 'no-hardware'
            ? 'no sensor'
            : stepData.unavailableReason === 'permission'
                ? 'allow motion'
                : stepData.unavailableReason === 'platform'
                    ? 'phone only'
                    : `of ${DAILY_STEP_GOAL.toLocaleString()}`;

    // Water, like steps, comes from storage rather than props: the
    // Nutrition tab's hydration tracker is the only thing that writes it,
    // and Firestore is the shared source of truth between the two.
    const hydration = useDailyHydration();
    const waterUnknown = hydration.loading || hydration.error !== null;

    // Calories burned are the step count's other face — the pedometer
    // reading converted at a fixed kcal-per-step — so the ring fills
    // against the burn equivalent of the step goal.
    const caloriesBurned = stepData.caloriesBurned;
    const burnProgress = Math.min(caloriesBurned / DAILY_BURN_GOAL, 1);
    const burnGoalPercent = Math.round((caloriesBurned / DAILY_BURN_GOAL) * 100);

    const kcalLeft = Math.max(calorieBudgetTotal - calorieBudgetConsumed, 0);
    const calorieRingRadius = (CALORIE_RING_SIZE - CALORIE_RING_STROKE) / 2;
    const calorieCircumference = 2 * Math.PI * calorieRingRadius;
    const calorieConsumedPercent = Math.min(calorieBudgetConsumed / calorieBudgetTotal, 1);
    const calorieDashOffset = calorieCircumference * (1 - calorieConsumedPercent);

    const gaugeRadius = (GAUGE_SIZE - GAUGE_STROKE) / 2;
    const gaugeCircumference = 2 * Math.PI * gaugeRadius;
    const gaugeDashOffset = gaugeCircumference * (1 - monthlyGoalPercent / 100);

    return (
        <View style={styles.wrapper}>
            {/* Top app bar */}
            <View style={styles.topBar}>
                <View style={styles.brandRow}>
                    <View style={styles.brandMark}>
                        <Flame size={16} color={colors.white} strokeWidth={2.6} />
                    </View>
                    <View>
                        <Text style={styles.brandTitle}>PulseFit</Text>
                        <Text style={styles.brandSubtitle}>Dashboard</Text>
                    </View>
                </View>
                <View style={styles.topBarActions}>
                    <TouchableOpacity
                        style={styles.iconButton}
                        activeOpacity={0.7}
                        onPress={onNotificationsPress}
                    >
                        <Bell size={20} color={colors.textSecondary} strokeWidth={2.2} />
                    </TouchableOpacity>
                    <TouchableOpacity
                        activeOpacity={0.7}
                        onPress={onProfilePress}
                        accessibilityRole="button"
                        accessibilityLabel="Open your profile"
                    >
                        <UserAvatar size={32} />
                    </TouchableOpacity>
                </View>
            </View>

            {/* Greeting row — the avatar lives in the top bar and the
                streak moved out, so the name has the full width and no
                longer needs to truncate. */}
            <View style={styles.greetingRow}>
                <View style={styles.greetingTitleRow}>
                    <Text style={styles.greetingTitle}>
                        {greeting}
                        {userName ? `, ${userName}` : ''}
                    </Text>
                    <Text style={styles.greetingEmoji}>✨</Text>
                </View>
                <View style={styles.dateRow}>
                    <Clock size={12} color={colors.secondary} strokeWidth={2.4} />
                    <Text style={styles.dateText}>{dateLabel}</Text>
                </View>
            </View>

            {/* Metric snapshot grid */}
            <View style={styles.metricGrid}>
                <View style={styles.metricCard}>
                    <View style={styles.metricCardHeader}>
                        <View
                            style={[
                                styles.metricIconCircle,
                                { backgroundColor: withOpacity(colors.secondary, 0.14) },
                            ]}
                        >
                            <Flame size={18} color={colors.secondary} strokeWidth={2.4} />
                        </View>
                        <View
                            style={[
                                styles.metricTrendPill,
                                { backgroundColor: withOpacity(colors.secondary, 0.14) },
                            ]}
                        >
                            <Text style={[styles.metricTrendText, { color: colors.secondary }]}>
                                {stepsUnknown ? '—' : `${burnGoalPercent}% Goal`}
                            </Text>
                        </View>
                    </View>
                    <Text style={styles.metricLabel}>Calories Burned</Text>
                    <MetricRing
                        progress={stepsUnknown ? 0 : burnProgress}
                        accent={colors.secondary}
                        value={stepsUnknown ? '—' : caloriesBurned.toLocaleString()}
                        caption={`/ ${DAILY_BURN_GOAL.toLocaleString()} kcal`}
                    />
                </View>

                <View style={styles.metricCard}>
                    <View style={styles.metricCardHeader}>
                        <View
                            style={[
                                styles.metricIconCircle,
                                { backgroundColor: withOpacity(colors.primary, 0.14) },
                            ]}
                        >
                            <Droplet size={18} color={colors.primary} strokeWidth={2.4} />
                        </View>
                        <View
                            style={[
                                styles.metricTrendPill,
                                { backgroundColor: withOpacity(colors.primary, 0.14) },
                            ]}
                        >
                            <Text style={[styles.metricTrendText, { color: colors.primary }]}>
                                {waterUnknown ? '—' : `${hydration.goalPercent}% Goal`}
                            </Text>
                        </View>
                    </View>
                    <Text style={styles.metricLabel}>Water Intake</Text>
                    <MetricRing
                        progress={hydration.progress}
                        accent={colors.primary}
                        value={waterUnknown ? '—' : hydration.ml.toLocaleString()}
                        caption={`/ ${hydration.goalMl.toLocaleString()} ml`}
                    />
                </View>

                <View style={styles.metricCard}>
                    <View style={styles.metricCardHeader}>
                        <View style={[styles.metricIconCircle, { backgroundColor: colors.surfaceContainer }]}>
                            <Weight size={18} color={colors.textPrimary} strokeWidth={2.2} />
                        </View>
                        <View
                            style={[
                                styles.metricTrendPill,
                                { backgroundColor: withOpacity(colors.primary, 0.12) },
                            ]}
                        >
                            <Text style={[styles.metricTrendText, { color: colors.primary }]}>
                                {bodyWeightDeltaKg > 0 ? '+' : ''}
                                {bodyWeightDeltaKg} kg
                            </Text>
                        </View>
                    </View>
                    <Text style={styles.metricLabel}>Body Weight</Text>
                    <View style={styles.metricValueRow}>
                        <Text style={styles.metricValue}>{bodyWeightKg}</Text>
                        <Text style={styles.metricUnit}>kg</Text>
                    </View>
                </View>

                <View style={styles.metricCard}>
                    <View style={styles.metricCardHeader}>
                        <View
                            style={[
                                styles.metricIconCircle,
                                { backgroundColor: withOpacity(colors.recovery, 0.16) },
                            ]}
                        >
                            <Footprints size={18} color={colors.recovery} strokeWidth={2.2} />
                        </View>
                        <View
                            style={[
                                styles.metricTrendPill,
                                {
                                    backgroundColor: stepsUnknown
                                        ? colors.surfaceContainer
                                        : withOpacity(colors.recovery, 0.14),
                                },
                            ]}
                        >
                            <Text
                                style={[
                                    styles.metricTrendText,
                                    { color: stepsUnknown ? colors.textSecondary : colors.recovery },
                                ]}
                            >
                                {stepsUnknown ? 'Today' : `${stepGoalPercent}% Goal`}
                            </Text>
                        </View>
                    </View>
                    <Text style={styles.metricLabel}>Steps</Text>
                    <View style={styles.metricValueRow}>
                        <Text style={styles.metricValue}>
                            {stepsUnknown ? '—' : stepData.steps.toLocaleString()}
                        </Text>
                        <Text style={styles.metricUnit}>{stepUnitLabel}</Text>
                    </View>
                    <View style={styles.stepTrack}>
                        <View
                            style={[
                                styles.stepFill,
                                {
                                    width: `${stepsUnknown ? 0 : Math.max(stepGoalPercent, 2)}%`,
                                    backgroundColor: colors.recovery,
                                },
                            ]}
                        />
                    </View>
                </View>
            </View>

            {/* Weekly activity card */}
            <View style={styles.card}>
                <View style={styles.cardHeaderRow}>
                    <View>
                        <Text style={styles.cardTitle}>Weekly Activity</Text>
                        <Text style={styles.cardSubtitle}>Avg. {weeklyAvgKcal} kcal / day</Text>
                    </View>
                    <View style={styles.segmentedControl}>
                        <View style={[styles.segmentPill, styles.segmentPillActive]}>
                            <Text style={styles.segmentTextActive}>Week</Text>
                        </View>
                        <View style={styles.segmentPill}>
                            <Text style={styles.segmentText}>Month</Text>
                        </View>
                        <View style={styles.segmentPill}>
                            <Text style={styles.segmentText}>Year</Text>
                        </View>
                    </View>
                </View>

                <View style={styles.barChartRow}>
                    {WEEK_ACTIVITY.map((item, index) => (
                        <View key={index} style={styles.barColumn}>
                            {item.peak ? (
                                <View style={styles.barPeakBadge}>
                                    <Text style={styles.barPeakBadgeText}>{item.kcal}</Text>
                                </View>
                            ) : null}
                            <View
                                style={[
                                    styles.barTrack,
                                    item.peak && styles.barTrackPeak,
                                ]}
                            >
                                <View
                                    style={[
                                        styles.barFill,
                                        {
                                            height: Math.max(BAR_TRACK_HEIGHT * item.percent, 8),
                                            backgroundColor: item.peak
                                                ? colors.primary
                                                : withOpacity(colors.primary, 0.35),
                                        },
                                    ]}
                                />
                            </View>
                            <Text style={[styles.barDayLabel, item.peak && styles.barDayLabelActive]}>
                                {item.day}
                            </Text>
                        </View>
                    ))}
                </View>

                <TouchableOpacity activeOpacity={0.8} style={styles.calloutRow}>
                    <View style={styles.calloutLeft}>
                        <View style={styles.gaugeWrapper}>
                            <Svg width={GAUGE_SIZE} height={GAUGE_SIZE}>
                                <Circle
                                    cx={GAUGE_SIZE / 2}
                                    cy={GAUGE_SIZE / 2}
                                    r={gaugeRadius}
                                    stroke={colors.surfaceContainer}
                                    strokeWidth={GAUGE_STROKE}
                                    fill="none"
                                />
                                <Circle
                                    cx={GAUGE_SIZE / 2}
                                    cy={GAUGE_SIZE / 2}
                                    r={gaugeRadius}
                                    stroke={colors.primary}
                                    strokeWidth={GAUGE_STROKE}
                                    strokeDasharray={gaugeCircumference}
                                    strokeDashoffset={gaugeDashOffset}
                                    strokeLinecap="round"
                                    fill="none"
                                    rotation={-90}
                                    originX={GAUGE_SIZE / 2}
                                    originY={GAUGE_SIZE / 2}
                                />
                            </Svg>
                            <Text style={styles.gaugeText}>{monthlyGoalPercent}%</Text>
                        </View>
                        <View style={styles.calloutTextBlock}>
                            <Text style={styles.calloutTitle}>Bravo! You're Crushing It</Text>
                            <Text style={styles.calloutSubtitle}>
                                {monthlyGoalPercent}% of monthly activity goal reached
                            </Text>
                        </View>
                    </View>
                    <ArrowRight size={18} color={colors.primary} strokeWidth={2.4} />
                </TouchableOpacity>
            </View>

            {/* Calorie budget card */}
            <View style={styles.card}>
                <View style={styles.cardHeaderRow}>
                    <View>
                        <Text style={styles.cardTitle}>Calorie Budget</Text>
                        <Text style={styles.cardSubtitle}>
                            {calorieBudgetConsumed.toLocaleString()} / {calorieBudgetTotal.toLocaleString()} kcal consumed
                        </Text>
                    </View>
                </View>

                <View style={styles.calorieBudgetRow}>
                    <View style={styles.calorieRingWrapper}>
                        <Svg width={CALORIE_RING_SIZE} height={CALORIE_RING_SIZE}>
                            <Circle
                                cx={CALORIE_RING_SIZE / 2}
                                cy={CALORIE_RING_SIZE / 2}
                                r={calorieRingRadius}
                                stroke={colors.surfaceContainer}
                                strokeWidth={CALORIE_RING_STROKE}
                                fill="none"
                            />
                            <Circle
                                cx={CALORIE_RING_SIZE / 2}
                                cy={CALORIE_RING_SIZE / 2}
                                r={calorieRingRadius}
                                stroke={colors.secondary}
                                strokeWidth={CALORIE_RING_STROKE}
                                strokeDasharray={calorieCircumference}
                                strokeDashoffset={calorieDashOffset}
                                strokeLinecap="round"
                                fill="none"
                                rotation={-90}
                                originX={CALORIE_RING_SIZE / 2}
                                originY={CALORIE_RING_SIZE / 2}
                            />
                        </Svg>
                        <View style={styles.calorieRingTextWrap}>
                            <Text style={styles.calorieRingValue}>{kcalLeft}</Text>
                            <Text style={styles.calorieRingLabel}>KCAL LEFT</Text>
                        </View>
                    </View>

                    <View style={styles.macroList}>
                        {macros.map((macro) => (
                            <View key={macro.label} style={styles.macroItem}>
                                <View style={styles.macroHeaderRow}>
                                    <View style={styles.macroLabelRow}>
                                        <View style={[styles.macroDot, { backgroundColor: macro.color }]} />
                                        <Text style={styles.macroLabel}>{macro.label}</Text>
                                    </View>
                                    <Text style={styles.macroValue}>
                                        {macro.grams} / {macro.goalGrams}g
                                    </Text>
                                </View>
                                <View style={styles.macroTrack}>
                                    <View
                                        style={[
                                            styles.macroFill,
                                            {
                                                width: `${Math.min((macro.grams / macro.goalGrams) * 100, 100)}%`,
                                                backgroundColor: macro.color,
                                            },
                                        ]}
                                    />
                                </View>
                            </View>
                        ))}
                    </View>
                </View>
            </View>
        </View>
    );
};

const styles = themedStyles(() => ({
    wrapper: {
        gap: 20,
    },
    topBar: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 4,
    },
    brandRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    brandMark: {
        width: 32,
        height: 32,
        borderRadius: 10,
        backgroundColor: colors.primary,
        alignItems: 'center',
        justifyContent: 'center',
    },
    brandTitle: {
        fontSize: 15,
        fontWeight: '800',
        color: colors.textPrimary,
        letterSpacing: -0.3,
        lineHeight: 18,
    },
    brandSubtitle: {
        fontSize: 11,
        fontWeight: '500',
        color: colors.textSecondary,
        lineHeight: 14,
    },
    topBarActions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    iconButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
    },
    avatarBadge: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: colors.primary,
        alignItems: 'center',
        justifyContent: 'center',
    },
    greetingRow: {
        // A plain block now, not a row: with the avatar and streak pill
        // gone there is nothing to sit beside, and the name can use the
        // whole width.
        alignItems: 'flex-start',
    },
    greetingTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        // Wraps rather than truncates — a name that does not fit on one
        // line should still be readable in full.
        flexWrap: 'wrap',
    },
    greetingTitle: {
        fontSize: 17,
        fontWeight: '800',
        color: colors.textPrimary,
        letterSpacing: -0.3,
    },
    greetingEmoji: {
        fontSize: 15,
        // Never the thing that gets squeezed — it is 15px wide and the
        // name beside it has hundreds to give.
        flexShrink: 0,
    },
    dateRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        marginTop: 3,
    },
    dateText: {
        fontSize: 12,
        fontWeight: '600',
        color: colors.textSecondary,
    },
    metricGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 12,
    },
    metricCard: {
        flexBasis: '47%',
        flexGrow: 1,
        backgroundColor: colors.surface,
        borderRadius: 20,
        padding: 14,
        shadowColor: colors.primary,
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.06,
        shadowRadius: 14,
        elevation: 2,
    },
    metricCardHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 10,
    },
    metricIconCircle: {
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
    },
    metricTrendPill: {
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 12,
    },
    metricTrendText: {
        fontSize: 11,
        fontWeight: '700',
    },
    metricLabel: {
        fontSize: 12,
        fontWeight: '500',
        color: colors.textSecondary,
    },
    metricValueRow: {
        flexDirection: 'row',
        alignItems: 'baseline',
        gap: 4,
        marginTop: 3,
    },
    metricValue: {
        fontSize: 22,
        fontWeight: '800',
        color: colors.textPrimary,
        letterSpacing: -0.3,
    },
    metricUnit: {
        fontSize: 12,
        fontWeight: '600',
        color: colors.textSecondary,
    },
    metricRingWrapper: {
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 6,
    },
    metricRingCenter: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        alignItems: 'center',
        justifyContent: 'center',
    },
    metricRingValue: {
        fontSize: 18,
        fontWeight: '800',
        color: colors.textPrimary,
        letterSpacing: -0.3,
    },
    metricRingCaption: {
        fontSize: 9,
        fontWeight: '600',
        color: colors.textSecondary,
        marginTop: 1,
    },
    stepTrack: {
        height: 5,
        borderRadius: 3,
        backgroundColor: colors.surfaceContainer,
        overflow: 'hidden',
        marginTop: 9,
    },
    stepFill: {
        height: '100%',
        borderRadius: 3,
    },
    card: {
        backgroundColor: colors.surface,
        borderRadius: 24,
        padding: 18,
        gap: 16,
        shadowColor: colors.primary,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.08,
        shadowRadius: 20,
        elevation: 3,
    },
    cardHeaderRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    cardTitle: {
        fontSize: 16,
        fontWeight: '800',
        color: colors.textPrimary,
        letterSpacing: -0.2,
    },
    cardSubtitle: {
        fontSize: 12,
        fontWeight: '500',
        color: colors.textSecondary,
        marginTop: 2,
    },
    segmentedControl: {
        flexDirection: 'row',
        backgroundColor: colors.surfaceContainer,
        borderRadius: 20,
        padding: 3,
        gap: 2,
    },
    segmentPill: {
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 16,
    },
    segmentPillActive: {
        backgroundColor: colors.surface,
        shadowColor: colors.black,
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.08,
        shadowRadius: 3,
        elevation: 1,
    },
    segmentText: {
        fontSize: 11,
        fontWeight: '600',
        color: colors.textSecondary,
    },
    segmentTextActive: {
        fontSize: 11,
        fontWeight: '800',
        color: colors.primary,
    },
    barChartRow: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        height: BAR_TRACK_HEIGHT + 44,
        paddingHorizontal: 2,
    },
    barColumn: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'flex-end',
        gap: 8,
    },
    barPeakBadge: {
        backgroundColor: colors.primary,
        paddingHorizontal: 7,
        paddingVertical: 3,
        borderRadius: 10,
        marginBottom: 4,
    },
    barPeakBadgeText: {
        fontSize: 10,
        fontWeight: '800',
        color: colors.white,
    },
    barTrack: {
        width: 14,
        height: BAR_TRACK_HEIGHT,
        borderRadius: 8,
        backgroundColor: colors.surfaceContainer,
        justifyContent: 'flex-end',
        overflow: 'hidden',
    },
    barTrackPeak: {
        width: 16,
    },
    barFill: {
        width: '100%',
        borderRadius: 8,
    },
    barDayLabel: {
        fontSize: 11,
        fontWeight: '600',
        color: colors.textSecondary,
    },
    barDayLabelActive: {
        color: colors.primary,
        fontWeight: '800',
    },
    calloutRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: colors.surfaceLow,
        borderRadius: 18,
        padding: 12,
    },
    calloutLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        flexShrink: 1,
    },
    gaugeWrapper: {
        width: GAUGE_SIZE,
        height: GAUGE_SIZE,
        alignItems: 'center',
        justifyContent: 'center',
    },
    gaugeText: {
        position: 'absolute',
        fontSize: 10,
        fontWeight: '800',
        color: colors.primary,
    },
    calloutTextBlock: {
        flexShrink: 1,
    },
    calloutTitle: {
        fontSize: 13.5,
        fontWeight: '800',
        color: colors.textPrimary,
    },
    calloutSubtitle: {
        fontSize: 12,
        fontWeight: '500',
        color: colors.textSecondary,
        marginTop: 2,
    },
    calorieBudgetRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 20,
    },
    calorieRingWrapper: {
        width: CALORIE_RING_SIZE,
        height: CALORIE_RING_SIZE,
        alignItems: 'center',
        justifyContent: 'center',
    },
    calorieRingTextWrap: {
        position: 'absolute',
        alignItems: 'center',
    },
    calorieRingValue: {
        fontSize: 22,
        fontWeight: '800',
        color: colors.textPrimary,
        letterSpacing: -0.3,
    },
    calorieRingLabel: {
        fontSize: 9,
        fontWeight: '700',
        color: colors.textSecondary,
        letterSpacing: 0.4,
        marginTop: 2,
    },
    macroList: {
        flex: 1,
        gap: 12,
    },
    macroItem: {
        gap: 6,
    },
    macroHeaderRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    macroLabelRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    macroDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
    },
    macroLabel: {
        fontSize: 12,
        fontWeight: '700',
        color: colors.textPrimary,
    },
    macroValue: {
        fontSize: 11,
        fontWeight: '600',
        color: colors.textSecondary,
    },
    macroTrack: {
        height: 8,
        borderRadius: 4,
        backgroundColor: colors.surfaceContainer,
        overflow: 'hidden',
    },
    macroFill: {
        height: '100%',
        borderRadius: 4,
    },
}));

export default DashboardOverview;
