import React from 'react';
import { View } from 'react-native';
import { colors } from '../../Theme/colors';
import { spacing } from '../../Theme/spacing';
import { themedStyles } from '../../Theme/ThemeContext';
import { SkeletonBlock, SkeletonGroup } from '../../Components/Skeleton';
import { useFeatureFlag } from '../../FeatureFlags';

// The Workout tab's loading placeholder — the same sections in the same
// order and at roughly the same sizes as the real thing (day header,
// training progress, the AI plan promo, the plan heading and date strip,
// the day's plan card, the plan library), so the swap to the real screen
// changes what is drawn but barely moves anything.
//
// One SkeletonGroup wraps the lot, so the whole page pulses as a unit.

const DATE_TILE_COUNT = 6;
const EXERCISE_ROW_COUNT = 3;

export const WorkoutSkeleton: React.FC = () => {
    // Mirrors the real screen: the promo card only exists behind this flag,
    // so drawing its placeholder unconditionally would leave a gap.
    const showPromo = useFeatureFlag('enabledAddForSubscription');

    return (
        <SkeletonGroup>
            <View
                accessibilityLabel="Loading your workouts"
                accessibilityRole="progressbar"
                style={styles.root}
            >
                {/* Day header */}
                <View style={styles.header}>
                    <SkeletonBlock width="48%" height={20} />
                    <SkeletonBlock width="66%" height={11} radius={5} />
                </View>

                {/* Training progress */}
                <View style={styles.card}>
                    <View style={styles.cardHeader}>
                        <View style={styles.headerText}>
                            <SkeletonBlock width={120} height={15} />
                            <SkeletonBlock width={80} height={11} radius={5} />
                        </View>
                        <SkeletonBlock width={110} height={28} radius={14} />
                    </View>
                    <SkeletonBlock height={130} radius={16} />
                </View>

                {/* AI plan promo */}
                {showPromo ? (
                    <View style={styles.promo}>
                        <SkeletonBlock height={200} radius={24} />
                    </View>
                ) : null}

                {/* Plan heading + date strip */}
                <View style={styles.sectionRow}>
                    <View style={styles.sectionTitle}>
                        <SkeletonBlock width={96} height={16} />
                        <SkeletonBlock width={76} height={22} radius={12} />
                    </View>
                    <SkeletonBlock width={64} height={26} radius={13} />
                </View>
                <View style={styles.dateStrip}>
                    {Array.from({ length: DATE_TILE_COUNT }).map((_, index) => (
                        <SkeletonBlock key={index} width={52} height={68} radius={16} />
                    ))}
                </View>

                {/* The day's plan */}
                <View style={styles.card}>
                    <View style={styles.cardHeader}>
                        <SkeletonBlock width="45%" height={16} />
                        <SkeletonBlock width={82} height={26} radius={13} />
                    </View>
                    {Array.from({ length: EXERCISE_ROW_COUNT }).map((_, index) => (
                        <View key={index} style={styles.exerciseRow}>
                            <SkeletonBlock width={38} height={38} radius={12} />
                            <View style={styles.exerciseText}>
                                <SkeletonBlock width="60%" height={12} />
                                <SkeletonBlock width="35%" height={9} radius={5} />
                            </View>
                        </View>
                    ))}
                    <SkeletonBlock height={46} radius={16} />
                </View>

                {/* Plan library */}
                <View style={styles.library}>
                    <SkeletonBlock width={110} height={16} />
                    <SkeletonBlock height={64} radius={18} />
                    <SkeletonBlock height={64} radius={18} />
                </View>
            </View>
        </SkeletonGroup>
    );
};

export default WorkoutSkeleton;

const styles = themedStyles(() => ({
    root: { gap: 16 },
    header: {
        gap: 8,
        paddingHorizontal: spacing.screenHorizontalPadding,
    },
    card: {
        gap: 14,
        padding: 16,
        borderRadius: 24,
        marginHorizontal: spacing.screenHorizontalPadding,
        backgroundColor: colors.surface,
    },
    cardHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    headerText: { gap: 7 },
    promo: { marginHorizontal: spacing.screenHorizontalPadding },
    sectionRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: spacing.screenHorizontalPadding,
    },
    sectionTitle: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    dateStrip: {
        flexDirection: 'row',
        gap: 8,
        paddingHorizontal: spacing.screenHorizontalPadding,
        overflow: 'hidden',
    },
    exerciseRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    exerciseText: { flex: 1, gap: 7 },
    library: {
        gap: 12,
        paddingHorizontal: spacing.screenHorizontalPadding,
    },
}));
