import React from 'react';
import { View } from 'react-native';
import { colors } from '../../Theme/colors';
import { SkeletonBlock, SkeletonGroup } from '../../Components/Skeleton';
import { themedStyles } from '../../Theme/ThemeContext';

// The dashboard's loading placeholder — the same sections in the same
// order and at roughly the same sizes as the real thing (top bar,
// greeting, upcoming events, calories chart, the metric tiles, weekly
// activity, calorie budget, today's schedule), so the swap to the real
// screen changes what is drawn but barely moves anything.
//
// One SkeletonGroup wraps the lot, so the whole screen pulses as a unit.

const CARD_BAR_COUNT = 7;

const MetricTileSkeleton: React.FC<{ wide?: boolean }> = ({ wide = false }) => (
    <View style={[styles.metricTile, wide && styles.metricTileWide]}>
        <View style={styles.metricHeader}>
            <SkeletonBlock width={36} height={36} radius={18} />
            <SkeletonBlock width={62} height={20} radius={10} />
        </View>
        <SkeletonBlock width="45%" height={11} />
        {wide ? (
            <View style={styles.tileLines}>
                <SkeletonBlock width="35%" height={20} />
                <SkeletonBlock width="70%" height={11} />
            </View>
        ) : (
            <View style={styles.ringWrap}>
                <SkeletonBlock width={78} height={78} radius={39} />
            </View>
        )}
    </View>
);

export const DashboardSkeleton: React.FC = () => (
    <SkeletonGroup>
        <View accessibilityLabel="Loading your dashboard" accessibilityRole="progressbar" style={styles.root}>
            {/* Top bar */}
            <View style={styles.topBar}>
                <View style={styles.brandRow}>
                    <SkeletonBlock width={32} height={32} radius={10} />
                    <View style={styles.brandText}>
                        <SkeletonBlock width={64} height={12} />
                        <SkeletonBlock width={48} height={9} radius={5} />
                    </View>
                </View>
                <View style={styles.brandRow}>
                    <SkeletonBlock width={32} height={32} radius={16} />
                    <SkeletonBlock width={32} height={32} radius={16} />
                </View>
            </View>

            {/* Greeting */}
            <View style={styles.greeting}>
                <SkeletonBlock width="58%" height={17} />
                <SkeletonBlock width="32%" height={11} radius={5} />
            </View>

            {/* Upcoming events */}
            <View style={styles.eventsCard}>
                <SkeletonBlock width="34%" height={10} radius={5} />
                {[0, 1].map((row) => (
                    <View key={row} style={styles.eventRow}>
                        <View style={styles.eventText}>
                            <SkeletonBlock width="60%" height={14} />
                            <SkeletonBlock width="30%" height={11} radius={5} />
                        </View>
                        <SkeletonBlock width={68} height={30} radius={15} />
                    </View>
                ))}
            </View>

            {/* Calories chart */}
            <View style={styles.card}>
                <View style={styles.cardHeader}>
                    <View style={styles.headerText}>
                        <SkeletonBlock width={110} height={15} />
                        <SkeletonBlock width={70} height={11} radius={5} />
                    </View>
                    <SkeletonBlock width={128} height={28} radius={14} />
                </View>
                <SkeletonBlock height={150} radius={16} />
            </View>

            {/* Metric tiles — four, then the full-width sleep tile */}
            <View style={styles.metricGrid}>
                <MetricTileSkeleton />
                <MetricTileSkeleton />
                <MetricTileSkeleton wide />
                <MetricTileSkeleton />
                <MetricTileSkeleton wide />
            </View>

            {/* Weekly activity */}
            <View style={styles.card}>
                <View style={styles.cardHeader}>
                    <View style={styles.headerText}>
                        <SkeletonBlock width={120} height={15} />
                        <SkeletonBlock width={90} height={11} radius={5} />
                    </View>
                    <SkeletonBlock width={128} height={28} radius={14} />
                </View>
                <View style={styles.bars}>
                    {Array.from({ length: CARD_BAR_COUNT }).map((_, index) => (
                        <SkeletonBlock key={index} width={14} height={40 + ((index * 23) % 56)} radius={8} />
                    ))}
                </View>
            </View>

            {/* Calorie budget */}
            <View style={styles.card}>
                <View style={styles.headerText}>
                    <SkeletonBlock width={110} height={15} />
                    <SkeletonBlock width={150} height={11} radius={5} />
                </View>
                <View style={styles.budgetRow}>
                    <SkeletonBlock width={112} height={112} radius={56} />
                    <View style={styles.macros}>
                        <SkeletonBlock height={34} radius={10} />
                        <SkeletonBlock height={34} radius={10} />
                        <SkeletonBlock height={34} radius={10} />
                    </View>
                </View>
            </View>

            {/* Today's schedule */}
            <View style={styles.scheduleBlock}>
                <SkeletonBlock width="38%" height={16} />
                <View style={styles.scheduleCard}>
                    <View style={styles.eventRow}>
                        <SkeletonBlock width={96} height={22} radius={11} />
                        <SkeletonBlock width={52} height={12} radius={6} />
                    </View>
                    <SkeletonBlock width="62%" height={18} />
                    <SkeletonBlock width="34%" height={12} radius={6} />
                    <View style={styles.eventRow}>
                        <SkeletonBlock width="38%" height={12} radius={6} />
                        <SkeletonBlock width={116} height={34} radius={17} />
                    </View>
                </View>
            </View>
        </View>
    </SkeletonGroup>
);

const styles = themedStyles(() => ({
    root: {
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
    brandText: {
        gap: 5,
    },
    greeting: {
        gap: 7,
    },
    eventsCard: {
        backgroundColor: colors.surface,
        borderRadius: 20,
        paddingHorizontal: 16,
        paddingVertical: 14,
        borderWidth: 1,
        borderColor: colors.border,
        gap: 14,
    },
    eventRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
    },
    eventText: {
        flex: 1,
        gap: 6,
    },
    card: {
        backgroundColor: colors.surface,
        borderRadius: 24,
        padding: 18,
        gap: 16,
    },
    cardHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    headerText: {
        gap: 7,
    },
    metricGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 12,
    },
    metricTile: {
        flexBasis: '47%',
        flexGrow: 1,
        backgroundColor: colors.surface,
        borderRadius: 20,
        padding: 14,
        gap: 8,
    },
    // The sleep tile takes a row to itself, as the real one does.
    metricTileWide: {
        flexBasis: '100%',
    },
    metricHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 2,
    },
    ringWrap: {
        alignItems: 'center',
        paddingVertical: 4,
    },
    tileLines: {
        gap: 8,
        marginTop: 2,
    },
    bars: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        height: 96,
        paddingHorizontal: 2,
    },
    budgetRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 20,
    },
    macros: {
        flex: 1,
        gap: 12,
    },
    scheduleBlock: {
        gap: 10,
    },
    scheduleCard: {
        backgroundColor: colors.surface,
        borderRadius: 24,
        padding: 18,
        minHeight: 156,
        gap: 12,
        justifyContent: 'space-between',
    },
}));

export default DashboardSkeleton;
