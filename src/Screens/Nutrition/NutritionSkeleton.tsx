import React from 'react';
import { View } from 'react-native';
import { colors } from '../../Theme/colors';
import { spacing } from '../../Theme/spacing';
import { themedStyles } from '../../Theme/ThemeContext';
import { SkeletonBlock, SkeletonCard, SkeletonGroup } from '../../Components/Skeleton';

// The Nutrition tab's loading placeholder — the same sections in the same
// order and at roughly the same sizes as the real thing (calorie and
// macro card, date strip, hydration, the day's meals), so the swap to the
// real screen changes what is drawn but barely moves anything.
//
// One SkeletonGroup wraps the lot, so the whole page pulses as a unit.

const DATE_TILE_COUNT = 6;
const GLASS_COUNT = 8;
const MACRO_ROWS = 3;
const MEAL_COUNT = 2;

export const NutritionSkeleton: React.FC = () => (
    <SkeletonGroup>
        <View
            accessibilityLabel="Loading your nutrition"
            accessibilityRole="progressbar"
            style={styles.root}
        >
            {/* Calories and macros */}
            <View style={styles.card}>
                <View style={styles.calorieRow}>
                    <SkeletonBlock width={104} height={104} radius={52} />
                    <View style={styles.macros}>
                        {Array.from({ length: MACRO_ROWS }).map((_, index) => (
                            <View key={index} style={styles.macro}>
                                <View style={styles.macroLabels}>
                                    <SkeletonBlock width={54} height={11} />
                                    <SkeletonBlock width={40} height={11} radius={5} />
                                </View>
                                <SkeletonBlock height={8} radius={4} />
                            </View>
                        ))}
                    </View>
                </View>
            </View>

            {/* Date strip */}
            <View style={styles.dateStrip}>
                {Array.from({ length: DATE_TILE_COUNT }).map((_, index) => (
                    <SkeletonBlock key={index} width={52} height={68} radius={16} />
                ))}
            </View>

            {/* Hydration */}
            <View style={styles.card}>
                <View style={styles.cardHeader}>
                    <View style={styles.headerText}>
                        <SkeletonBlock width={90} height={15} />
                        <SkeletonBlock width={120} height={11} radius={5} />
                    </View>
                    <SkeletonBlock width={56} height={56} radius={28} />
                </View>
                <View style={styles.glasses}>
                    {Array.from({ length: GLASS_COUNT }).map((_, index) => (
                        <View key={index} style={styles.glass}>
                            <SkeletonBlock height={46} radius={14} />
                        </View>
                    ))}
                </View>
                <View style={styles.buttons}>
                    <View style={styles.button}>
                        <SkeletonBlock height={42} radius={14} />
                    </View>
                    <View style={styles.button}>
                        <SkeletonBlock height={42} radius={14} />
                    </View>
                </View>
            </View>

            {/* The day's meals */}
            <View style={styles.meals}>
                <SkeletonBlock width={100} height={16} />
                {Array.from({ length: MEAL_COUNT }).map((_, index) => (
                    <SkeletonCard key={index} withFooter />
                ))}
            </View>
        </View>
    </SkeletonGroup>
);

export default NutritionSkeleton;

const styles = themedStyles(() => ({
    root: { gap: 20 },
    card: {
        gap: 14,
        padding: 16,
        borderRadius: 24,
        marginHorizontal: spacing.screenHorizontalPadding,
        backgroundColor: colors.surface,
    },
    calorieRow: { flexDirection: 'row', alignItems: 'center', gap: 18 },
    macros: { flex: 1, gap: 14 },
    macro: { gap: 7 },
    macroLabels: { flexDirection: 'row', justifyContent: 'space-between' },
    dateStrip: {
        flexDirection: 'row',
        gap: 8,
        paddingHorizontal: spacing.screenHorizontalPadding,
        overflow: 'hidden',
    },
    cardHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    headerText: { gap: 7 },
    glasses: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    // Four to a row: a quarter of the width less its share of the gaps.
    glass: { width: '23%', flexGrow: 1 },
    buttons: { flexDirection: 'row', gap: 10 },
    button: { flex: 1 },
    meals: {
        gap: 12,
        paddingHorizontal: spacing.screenHorizontalPadding,
    },
}));
