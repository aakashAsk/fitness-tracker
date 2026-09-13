import React, { useState } from 'react';
import { ScrollView, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import {
    ChartPie,
    CheckCircle,
    Clock,
    Droplet,
    Flame,
    GlassWater,
    Pill,
    Plus,
    Stethoscope,
    UtensilsCrossed,
} from 'lucide-react-native';
import { colors, withOpacity } from '../../Theme/colors';

// Presentational nutrition tab — matches the PulseFit "Nutrition
// Tracker" design (calorie/macro ring, hydration tracker, meal log).
// Sample data only; the previous Nutrition tab was an empty
// placeholder, so there's no existing logic being replaced here.

interface SubNavItem {
    key: string;
    label: string;
    Icon: typeof UtensilsCrossed;
}

const SUB_NAV: SubNavItem[] = [
    { key: 'diet', label: 'Diet Plan', Icon: UtensilsCrossed },
    { key: 'micros', label: 'Micros', Icon: ChartPie },
    { key: 'supplements', label: 'Supplements', Icon: Pill },
    { key: 'medication', label: 'Medication', Icon: Stethoscope },
    { key: 'water', label: 'Water', Icon: Droplet },
];

interface Macro {
    label: string;
    percent: number;
    grams: number;
    goalGrams: number;
    color: string;
}

const MACROS: Macro[] = [
    { label: 'Protein', percent: 78, grams: 125, goalGrams: 160, color: colors.protein },
    { label: 'Carbs', percent: 75, grams: 180, goalGrams: 240, color: colors.carbs },
    { label: 'Fats', percent: 74, grams: 52, goalGrams: 70, color: colors.fats },
];

interface Meal {
    id: string;
    name: string;
    description: string;
    calories: number;
    status: 'completed' | 'upcoming';
    protein: number;
    carbs: number;
    fats: number;
}

const MEALS: Meal[] = [
    {
        id: 'breakfast',
        name: 'Breakfast',
        description: 'Oatmeal with Blueberries & Almond Butter',
        calories: 480,
        status: 'completed',
        protein: 32,
        carbs: 54,
        fats: 12,
    },
    {
        id: 'lunch',
        name: 'Lunch',
        description: 'Grilled Chicken, Quinoa & Steamed Broccoli',
        calories: 620,
        status: 'completed',
        protein: 52,
        carbs: 48,
        fats: 16,
    },
    {
        id: 'snack',
        name: 'Snack',
        description: 'Greek Yogurt with Chia Seeds',
        calories: 210,
        status: 'completed',
        protein: 18,
        carbs: 12,
        fats: 5,
    },
    {
        id: 'dinner',
        name: 'Dinner',
        description: 'Pan-seared Salmon & Sweet Potato Mash',
        calories: 650,
        status: 'upcoming',
        protein: 45,
        carbs: 50,
        fats: 18,
    },
];

const WATER_GLASSES_TOTAL = 8;
const WATER_GLASSES_FILLED = 6;

const RING_SIZE = 140;
const RING_STROKE = 10;

export const NutritionScreen: React.FC = () => {
    const [activeSubNav, setActiveSubNav] = useState('diet');
    const [filledGlasses, setFilledGlasses] = useState(WATER_GLASSES_FILLED);

    const calorieTotal = 2200;
    const calorieConsumed = 1310;
    const calorieBurned = 650;
    const kcalLeft = calorieTotal - calorieConsumed;

    const ringRadius = (RING_SIZE - RING_STROKE) / 2;
    const ringCircumference = 2 * Math.PI * ringRadius;
    const ringPercent = Math.min(calorieConsumed / calorieTotal, 1);
    const ringDashOffset = ringCircumference * (1 - ringPercent);

    const mealsConsumed = MEALS.filter((m) => m.status === 'completed').reduce(
        (sum, m) => sum + m.calories,
        0,
    );
    const mealsTarget = MEALS.reduce((sum, m) => sum + m.calories, 0) + 1310;

    const toggleGlass = (index: number) => {
        setFilledGlasses(index + 1 === filledGlasses ? index : index + 1);
    };

    return (
        <View style={styles.root}>
            <ScrollView
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
            >
                {/* Sub-navigation pills */}
                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.subNavRow}
                >
                    {SUB_NAV.map(({ key, label, Icon }) => {
                        const active = key === activeSubNav;
                        return (
                            <TouchableOpacity
                                key={key}
                                activeOpacity={0.85}
                                onPress={() => setActiveSubNav(key)}
                                style={[styles.subNavPill, active && styles.subNavPillActive]}
                            >
                                <Icon
                                    size={17}
                                    color={active ? colors.white : colors.textSecondary}
                                    strokeWidth={2.2}
                                />
                                <Text
                                    style={[styles.subNavPillText, active && styles.subNavPillTextActive]}
                                >
                                    {label}
                                </Text>
                            </TouchableOpacity>
                        );
                    })}
                </ScrollView>

                {/* Calorie & macro hero card */}
                <View style={styles.heroCard}>
                    <View style={styles.heroHeaderRow}>
                        <View>
                            <Text style={styles.heroEyebrow}>DAILY BALANCE</Text>
                            <Text style={styles.heroTitle}>Caloric & Macro Goals</Text>
                        </View>
                        <View style={styles.heroIconCircle}>
                            <Flame size={18} color={colors.secondary} strokeWidth={2.4} />
                        </View>
                    </View>

                    <View style={styles.ringSummaryRow}>
                        <View style={styles.ringWrapper}>
                            <Svg width={RING_SIZE} height={RING_SIZE}>
                                <Circle
                                    cx={RING_SIZE / 2}
                                    cy={RING_SIZE / 2}
                                    r={ringRadius}
                                    stroke={withOpacity(colors.secondary, 0.16)}
                                    strokeWidth={RING_STROKE}
                                    fill="none"
                                />
                                <Circle
                                    cx={RING_SIZE / 2}
                                    cy={RING_SIZE / 2}
                                    r={ringRadius}
                                    stroke={colors.secondary}
                                    strokeWidth={RING_STROKE}
                                    strokeDasharray={ringCircumference}
                                    strokeDashoffset={ringDashOffset}
                                    strokeLinecap="round"
                                    fill="none"
                                    rotation={-90}
                                    originX={RING_SIZE / 2}
                                    originY={RING_SIZE / 2}
                                />
                            </Svg>
                            <View style={styles.ringTextWrap}>
                                <Text style={styles.ringValue}>{kcalLeft.toLocaleString()}</Text>
                                <Text style={styles.ringLabel}>kcal left</Text>
                            </View>
                        </View>

                        <View style={styles.summaryList}>
                            <View style={styles.summaryRow}>
                                <View style={styles.summaryLeft}>
                                    <View style={[styles.summaryDot, { backgroundColor: colors.secondary }]} />
                                    <Text style={styles.summaryLabel}>Consumed</Text>
                                </View>
                                <Text style={styles.summaryValue}>
                                    {calorieConsumed.toLocaleString()} kcal
                                </Text>
                            </View>
                            <View style={styles.summaryRow}>
                                <View style={styles.summaryLeft}>
                                    <View style={[styles.summaryDot, { backgroundColor: colors.textMuted }]} />
                                    <Text style={styles.summaryLabel}>Target</Text>
                                </View>
                                <Text style={styles.summaryValue}>
                                    {calorieTotal.toLocaleString()} kcal
                                </Text>
                            </View>
                            <View style={styles.summaryRow}>
                                <View style={styles.summaryLeft}>
                                    <View style={[styles.summaryDot, { backgroundColor: colors.primary }]} />
                                    <Text style={styles.summaryLabel}>Burned</Text>
                                </View>
                                <Text style={[styles.summaryValue, { color: colors.primary }]}>
                                    +{calorieBurned} kcal
                                </Text>
                            </View>
                        </View>
                    </View>

                    {/* Macro bars */}
                    <View style={styles.macroRow}>
                        {MACROS.map((macro) => (
                            <View key={macro.label} style={styles.macroColumn}>
                                <View style={styles.macroHeaderRow}>
                                    <Text style={styles.macroLabel}>{macro.label}</Text>
                                    <Text style={[styles.macroPercent, { color: macro.color }]}>
                                        {macro.percent}%
                                    </Text>
                                </View>
                                <View style={styles.macroTrack}>
                                    <View
                                        style={[
                                            styles.macroFill,
                                            { width: `${macro.percent}%`, backgroundColor: macro.color },
                                        ]}
                                    />
                                </View>
                                <Text style={styles.macroGrams}>
                                    {macro.grams}
                                    <Text style={styles.macroGramsGoal}>/{macro.goalGrams}g</Text>
                                </Text>
                            </View>
                        ))}
                    </View>
                </View>

                {/* Hydration tracker */}
                <View style={styles.card}>
                    <View style={styles.hydrationHeaderRow}>
                        <View style={styles.hydrationHeaderLeft}>
                            <View style={styles.hydrationIconCircle}>
                                <GlassWater size={16} color={colors.primary} strokeWidth={2.2} />
                            </View>
                            <View>
                                <Text style={styles.cardTitle}>Hydration Tracker</Text>
                                <Text style={styles.cardSubtitle}>
                                    {filledGlasses} of {WATER_GLASSES_TOTAL} glasses logged (
                                    {filledGlasses * 250}ml)
                                </Text>
                            </View>
                        </View>
                        <View style={styles.hydrationGoalPill}>
                            <Text style={styles.hydrationGoalText}>
                                {Math.round((filledGlasses / WATER_GLASSES_TOTAL) * 100)}% Goal
                            </Text>
                        </View>
                    </View>

                    <View style={styles.glassesGrid}>
                        {Array.from({ length: WATER_GLASSES_TOTAL }).map((_, index) => {
                            const filled = index < filledGlasses;
                            return (
                                <TouchableOpacity
                                    key={index}
                                    activeOpacity={0.8}
                                    onPress={() => toggleGlass(index)}
                                    style={styles.glassColumn}
                                >
                                    <View style={[styles.glassTile, filled && styles.glassTileFilled]}>
                                        <Droplet
                                            size={16}
                                            color={filled ? colors.white : colors.textMuted}
                                            strokeWidth={2.2}
                                            fill={filled ? colors.white : 'none'}
                                        />
                                    </View>
                                    <Text style={styles.glassIndex}>{index + 1}</Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>

                    <View style={styles.quickAddRow}>
                        <TouchableOpacity
                            activeOpacity={0.8}
                            style={styles.quickAddButton}
                            onPress={() => setFilledGlasses((v) => Math.min(v + 1, WATER_GLASSES_TOTAL))}
                        >
                            <Plus size={16} color={colors.primary} strokeWidth={2.4} />
                            <Text style={styles.quickAddText}>250ml Glass</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            activeOpacity={0.8}
                            style={styles.quickAddButton}
                            onPress={() => setFilledGlasses((v) => Math.min(v + 2, WATER_GLASSES_TOTAL))}
                        >
                            <Plus size={16} color={colors.primary} strokeWidth={2.4} />
                            <Text style={styles.quickAddText}>500ml Bottle</Text>
                        </TouchableOpacity>
                    </View>
                </View>

                {/* Today's meals */}
                <View style={styles.mealsSection}>
                    <View style={styles.mealsHeaderRow}>
                        <Text style={styles.sectionTitle}>Today's Meals</Text>
                        <Text style={styles.mealsHeaderKcal}>
                            {mealsConsumed.toLocaleString()} / {mealsTarget.toLocaleString()} kcal
                        </Text>
                    </View>

                    {MEALS.map((meal) => {
                        const isUpcoming = meal.status === 'upcoming';
                        return (
                            <View
                                key={meal.id}
                                style={[styles.mealCard, isUpcoming && styles.mealCardUpcoming]}
                            >
                                <View style={styles.mealTopRow}>
                                    <View style={styles.mealThumbnail}>
                                        <UtensilsCrossed size={22} color={colors.secondary} strokeWidth={1.8} />
                                    </View>
                                    <View style={styles.mealInfo}>
                                        <View style={styles.mealTitleRow}>
                                            <Text style={styles.mealName}>{meal.name}</Text>
                                            {isUpcoming ? (
                                                <View style={styles.mealStatusPillUpcoming}>
                                                    <Clock size={11} color={colors.secondary} strokeWidth={2.4} />
                                                    <Text style={styles.mealStatusTextUpcoming}>Upcoming</Text>
                                                </View>
                                            ) : (
                                                <View style={styles.mealStatusPillDone}>
                                                    <CheckCircle size={11} color={colors.primary} strokeWidth={2.4} />
                                                    <Text style={styles.mealStatusTextDone}>Completed</Text>
                                                </View>
                                            )}
                                        </View>
                                        <Text style={styles.mealDescription} numberOfLines={1}>
                                            {meal.description}
                                        </Text>
                                        {isUpcoming ? (
                                            <Text style={styles.mealTargetText}>
                                                Target: {meal.calories} kcal
                                            </Text>
                                        ) : (
                                            <Text style={styles.mealCalories}>{meal.calories} kcal</Text>
                                        )}
                                    </View>
                                </View>

                                {isUpcoming ? (
                                    <View style={styles.mealFooterRow}>
                                        <Text style={styles.mealMacroTextMuted}>
                                            Target P: {meal.protein}g • C: {meal.carbs}g • F: {meal.fats}g
                                        </Text>
                                        <TouchableOpacity activeOpacity={0.85} style={styles.logFoodButton}>
                                            <Plus size={14} color={colors.white} strokeWidth={2.6} />
                                            <Text style={styles.logFoodText}>Log Food</Text>
                                        </TouchableOpacity>
                                    </View>
                                ) : (
                                    <View style={styles.mealMacroPill}>
                                        <Text style={styles.mealMacroText}>
                                            <Text style={styles.mealMacroStrong}>P: </Text>
                                            {meal.protein}g
                                        </Text>
                                        <Text style={styles.mealMacroSeparator}>•</Text>
                                        <Text style={styles.mealMacroText}>
                                            <Text style={styles.mealMacroStrong}>C: </Text>
                                            {meal.carbs}g
                                        </Text>
                                        <Text style={styles.mealMacroSeparator}>•</Text>
                                        <Text style={styles.mealMacroText}>
                                            <Text style={styles.mealMacroStrong}>F: </Text>
                                            {meal.fats}g
                                        </Text>
                                    </View>
                                )}
                            </View>
                        );
                    })}
                </View>

                <View style={styles.fabSpacer} />
            </ScrollView>

            <TouchableOpacity activeOpacity={0.85} style={styles.fab}>
                <UtensilsCrossed size={17} color={colors.white} strokeWidth={2.2} />
                <Text style={styles.fabText}>Quick Log</Text>
            </TouchableOpacity>
        </View>
    );
};

const styles = StyleSheet.create({
    root: {
        flex: 1,
    },
    scrollContent: {
        paddingBottom: 32,
        gap: 20,
    },
    subNavRow: {
        gap: 8,
        paddingVertical: 2,
    },
    subNavPill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: colors.surfaceContainer,
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 22,
    },
    subNavPillActive: {
        backgroundColor: colors.secondary,
        shadowColor: colors.secondary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.25,
        shadowRadius: 10,
        elevation: 3,
    },
    subNavPillText: {
        fontSize: 13,
        fontWeight: '700',
        color: colors.textSecondary,
    },
    subNavPillTextActive: {
        color: colors.white,
    },
    heroCard: {
        backgroundColor: colors.surface,
        borderRadius: 22,
        padding: 18,
        shadowColor: colors.secondary,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.1,
        shadowRadius: 20,
        elevation: 3,
    },
    heroHeaderRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        marginBottom: 14,
    },
    heroEyebrow: {
        fontSize: 10.5,
        fontWeight: '800',
        color: colors.secondary,
        letterSpacing: 0.6,
    },
    heroTitle: {
        fontSize: 17,
        fontWeight: '800',
        color: colors.textPrimary,
        marginTop: 3,
        letterSpacing: -0.2,
    },
    heroIconCircle: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: withOpacity(colors.secondary, 0.14),
        alignItems: 'center',
        justifyContent: 'center',
    },
    ringSummaryRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 16,
    },
    ringWrapper: {
        width: RING_SIZE,
        height: RING_SIZE,
        alignItems: 'center',
        justifyContent: 'center',
    },
    ringTextWrap: {
        position: 'absolute',
        alignItems: 'center',
    },
    ringValue: {
        fontSize: 26,
        fontWeight: '800',
        color: colors.textPrimary,
        letterSpacing: -0.4,
    },
    ringLabel: {
        fontSize: 11,
        fontWeight: '600',
        color: colors.textSecondary,
        marginTop: 2,
    },
    summaryList: {
        flex: 1,
        gap: 8,
    },
    summaryRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: colors.surfaceLow,
        borderRadius: 12,
        paddingHorizontal: 10,
        paddingVertical: 8,
    },
    summaryLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 7,
    },
    summaryDot: {
        width: 7,
        height: 7,
        borderRadius: 3.5,
    },
    summaryLabel: {
        fontSize: 12,
        fontWeight: '600',
        color: colors.textSecondary,
    },
    summaryValue: {
        fontSize: 12.5,
        fontWeight: '800',
        color: colors.textPrimary,
    },
    macroRow: {
        flexDirection: 'row',
        gap: 12,
        marginTop: 16,
        paddingTop: 14,
        borderTopWidth: 1,
        borderTopColor: colors.border,
    },
    macroColumn: {
        flex: 1,
        gap: 6,
    },
    macroHeaderRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    macroLabel: {
        fontSize: 11.5,
        fontWeight: '600',
        color: colors.textSecondary,
    },
    macroPercent: {
        fontSize: 11.5,
        fontWeight: '800',
    },
    macroTrack: {
        height: 7,
        borderRadius: 4,
        backgroundColor: colors.surfaceContainer,
        overflow: 'hidden',
    },
    macroFill: {
        height: '100%',
        borderRadius: 4,
    },
    macroGrams: {
        fontSize: 11.5,
        fontWeight: '800',
        color: colors.textPrimary,
    },
    macroGramsGoal: {
        fontWeight: '500',
        color: colors.textSecondary,
    },
    card: {
        backgroundColor: colors.surface,
        borderRadius: 20,
        padding: 16,
        gap: 14,
        shadowColor: colors.primary,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.06,
        shadowRadius: 18,
        elevation: 2,
    },
    hydrationHeaderRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
    },
    hydrationHeaderLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        flexShrink: 1,
    },
    hydrationIconCircle: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: withOpacity(colors.primary, 0.14),
        alignItems: 'center',
        justifyContent: 'center',
    },
    cardTitle: {
        fontSize: 15,
        fontWeight: '800',
        color: colors.textPrimary,
    },
    cardSubtitle: {
        fontSize: 11.5,
        fontWeight: '500',
        color: colors.textSecondary,
        marginTop: 2,
    },
    hydrationGoalPill: {
        backgroundColor: withOpacity(colors.primary, 0.14),
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 14,
    },
    hydrationGoalText: {
        fontSize: 11,
        fontWeight: '800',
        color: colors.primary,
    },
    glassesGrid: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        backgroundColor: colors.surfaceLow,
        borderRadius: 16,
        paddingVertical: 12,
        paddingHorizontal: 8,
    },
    glassColumn: {
        alignItems: 'center',
        gap: 4,
    },
    glassTile: {
        width: 28,
        height: 34,
        borderRadius: 8,
        backgroundColor: colors.surfaceContainer,
        alignItems: 'center',
        justifyContent: 'center',
    },
    glassTileFilled: {
        backgroundColor: colors.primary,
    },
    glassIndex: {
        fontSize: 10,
        fontWeight: '600',
        color: colors.textSecondary,
    },
    quickAddRow: {
        flexDirection: 'row',
        gap: 10,
    },
    quickAddButton: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        backgroundColor: colors.surfaceContainer,
        borderRadius: 20,
        paddingVertical: 11,
    },
    quickAddText: {
        fontSize: 12.5,
        fontWeight: '700',
        color: colors.primary,
    },
    mealsSection: {
        gap: 12,
    },
    mealsHeaderRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 2,
    },
    sectionTitle: {
        fontSize: 16,
        fontWeight: '800',
        color: colors.textPrimary,
        letterSpacing: -0.2,
    },
    mealsHeaderKcal: {
        fontSize: 12.5,
        fontWeight: '700',
        color: colors.secondary,
    },
    mealCard: {
        backgroundColor: colors.surface,
        borderRadius: 20,
        padding: 14,
        gap: 10,
        shadowColor: colors.black,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.04,
        shadowRadius: 12,
        elevation: 1,
    },
    mealCardUpcoming: {
        backgroundColor: withOpacity(colors.secondary, 0.06),
    },
    mealTopRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    mealThumbnail: {
        width: 64,
        height: 64,
        borderRadius: 16,
        backgroundColor: withOpacity(colors.secondary, 0.12),
        alignItems: 'center',
        justifyContent: 'center',
    },
    mealInfo: {
        flex: 1,
        minWidth: 0,
    },
    mealTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    mealName: {
        fontSize: 15.5,
        fontWeight: '800',
        color: colors.textPrimary,
    },
    mealStatusPillDone: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 3,
        backgroundColor: withOpacity(colors.primary, 0.14),
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 10,
    },
    mealStatusTextDone: {
        fontSize: 10,
        fontWeight: '700',
        color: colors.primary,
    },
    mealStatusPillUpcoming: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 3,
        backgroundColor: withOpacity(colors.secondary, 0.16),
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 10,
    },
    mealStatusTextUpcoming: {
        fontSize: 10,
        fontWeight: '700',
        color: colors.secondary,
    },
    mealDescription: {
        fontSize: 12.5,
        fontWeight: '500',
        color: colors.textSecondary,
        marginTop: 3,
    },
    mealCalories: {
        fontSize: 13,
        fontWeight: '800',
        color: colors.secondary,
        marginTop: 4,
    },
    mealTargetText: {
        fontSize: 12,
        fontWeight: '600',
        color: colors.textSecondary,
        marginTop: 4,
    },
    mealMacroPill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        backgroundColor: colors.surfaceLow,
        borderRadius: 12,
        paddingHorizontal: 12,
        paddingVertical: 8,
    },
    mealMacroText: {
        fontSize: 11.5,
        fontWeight: '500',
        color: colors.textSecondary,
    },
    mealMacroStrong: {
        fontWeight: '800',
        color: colors.textPrimary,
    },
    mealMacroSeparator: {
        color: colors.textMuted,
        fontSize: 11,
    },
    mealMacroTextMuted: {
        fontSize: 11.5,
        fontWeight: '500',
        color: colors.textSecondary,
        flexShrink: 1,
    },
    mealFooterRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
    },
    logFoodButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        backgroundColor: colors.secondary,
        paddingHorizontal: 14,
        paddingVertical: 9,
        borderRadius: 18,
    },
    logFoodText: {
        fontSize: 12.5,
        fontWeight: '800',
        color: colors.white,
    },
    fabSpacer: {
        height: 56,
    },
    fab: {
        position: 'absolute',
        right: 0,
        bottom: 8,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        backgroundColor: colors.secondary,
        paddingHorizontal: 20,
        paddingVertical: 14,
        borderRadius: 26,
        shadowColor: colors.secondary,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.35,
        shadowRadius: 16,
        elevation: 6,
    },
    fabText: {
        fontSize: 13,
        fontWeight: '800',
        color: colors.white,
    },
});

export default NutritionScreen;
