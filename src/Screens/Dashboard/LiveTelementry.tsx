import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import {
    ArrowRight,
    Bell,
    Clock,
    Droplet,
    Flame,
    Weight,
} from 'lucide-react-native';
import { colors, withOpacity } from '../../Theme/colors';
import UserAvatar from '../../Components/UserAvatar';

export interface DashboardOverviewProps {
    userName?: string;
    dateLabel?: string;
    streakDays?: number;
    caloriesBurned?: number;
    caloriesTrendPercent?: number;
    waterIntakeMl?: number;
    waterGoalPercent?: number;
    bodyWeightKg?: number;
    bodyWeightDeltaKg?: number;
    activeMinutes?: number;
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

export const DashboardOverview: React.FC<DashboardOverviewProps> = ({
    userName = 'Alex',
    dateLabel = 'Wednesday, 18 Oct',
    streakDays = 6,
    caloriesBurned = 567,
    caloriesTrendPercent = 12,
    waterIntakeMl = 1750,
    waterGoalPercent = 70,
    bodyWeightKg = 68.4,
    bodyWeightDeltaKg = -0.4,
    activeMinutes = 52,
    weeklyAvgKcal = 485,
    monthlyGoalPercent = 89,
    calorieBudgetTotal = 2100,
    calorieBudgetConsumed = 1420,
    macros = DEFAULT_MACROS,
    onNotificationsPress,
}) => {
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
                    <UserAvatar size={32} />
                </View>
            </View>

            {/* Greeting row */}
            <View style={styles.greetingRow}>
                <View style={styles.greetingLeft}>
                    <View style={styles.greetingAvatar}>
                        <UserAvatar
                            size={48}
                            background={colors.surfaceContainer}
                            iconColor={colors.textSecondary}
                            iconSize={22}
                        />
                        <View style={styles.greetingAvatarDot} />
                    </View>
                    <View>
                        <View style={styles.greetingTitleRow}>
                            <Text style={styles.greetingTitle}>Good morning, {userName}</Text>
                            <Text style={styles.greetingEmoji}>✨</Text>
                        </View>
                        <View style={styles.dateRow}>
                            <Clock size={12} color={colors.secondary} strokeWidth={2.4} />
                            <Text style={styles.dateText}>{dateLabel}</Text>
                        </View>
                    </View>
                </View>

                <View style={styles.streakPill}>
                    <Flame size={16} color={colors.secondary} strokeWidth={2.4} />
                    <Text style={styles.streakText}>{streakDays} Days</Text>
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
                                +{caloriesTrendPercent}%
                            </Text>
                        </View>
                    </View>
                    <Text style={styles.metricLabel}>Calories Burned</Text>
                    <View style={styles.metricValueRow}>
                        <Text style={styles.metricValue}>{caloriesBurned}</Text>
                        <Text style={styles.metricUnit}>kcal</Text>
                    </View>
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
                                {waterGoalPercent}% Goal
                            </Text>
                        </View>
                    </View>
                    <Text style={styles.metricLabel}>Water Intake</Text>
                    <View style={styles.metricValueRow}>
                        <Text style={styles.metricValue}>{waterIntakeMl.toLocaleString()}</Text>
                        <Text style={styles.metricUnit}>ml</Text>
                    </View>
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
                                { backgroundColor: withOpacity(colors.fats, 0.16) },
                            ]}
                        >
                            <Clock size={18} color={colors.fats} strokeWidth={2.2} />
                        </View>
                        <View style={[styles.metricTrendPill, { backgroundColor: colors.surfaceContainer }]}>
                            <Text style={[styles.metricTrendText, { color: colors.textSecondary }]}>
                                Today
                            </Text>
                        </View>
                    </View>
                    <Text style={styles.metricLabel}>Active Minutes</Text>
                    <View style={styles.metricValueRow}>
                        <Text style={styles.metricValue}>{activeMinutes}</Text>
                        <Text style={styles.metricUnit}>mins</Text>
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

const styles = StyleSheet.create({
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
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    greetingLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        flexShrink: 1,
    },
    greetingAvatar: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: colors.surfaceContainer,
        alignItems: 'center',
        justifyContent: 'center',
    },
    greetingAvatarDot: {
        position: 'absolute',
        bottom: 0,
        right: 0,
        width: 13,
        height: 13,
        borderRadius: 7,
        backgroundColor: colors.primary,
        borderWidth: 2,
        borderColor: colors.surface,
    },
    greetingTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    greetingTitle: {
        fontSize: 17,
        fontWeight: '800',
        color: colors.textPrimary,
        letterSpacing: -0.3,
    },
    greetingEmoji: {
        fontSize: 15,
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
    streakPill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        backgroundColor: withOpacity(colors.secondary, 0.14),
        paddingHorizontal: 12,
        paddingVertical: 7,
        borderRadius: 20,
    },
    streakText: {
        fontSize: 13,
        fontWeight: '800',
        color: colors.secondary,
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
});

export default DashboardOverview;
