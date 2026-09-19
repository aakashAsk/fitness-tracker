import React, { useEffect, useState } from 'react';
import { ScrollView, View, Text, TouchableOpacity } from 'react-native';
import { Plus, UtensilsCrossed } from 'lucide-react-native';
import { colors } from '../../Theme/colors';
import { spacing } from '../../Theme/spacing';
import WorkoutDateStrip from '../Workout/WorkoutDateStrip';
import { useDialog } from '../../Components/Dialog';
import NewMealPlanModal, { type MealPlanPayload } from './NewMealPlanModal';
import { estimateItemNutrition } from '../../Services/nutritionAiService';
import {
    createMealPlan,
    updateMealPlan,
    MealPlanServiceError,
    type MealPlan,
} from '../../Services/mealPlanService';
import { useMealPlansError } from '../../Store/mealPlansSlice';
import {
    DAILY_ML_GOAL,
    fetchHydrationLog,
    formatEntryTime,
    glassesFrom,
    HydrationLogServiceError,
    ML_PER_GLASS,
    saveHydrationEntries,
    totalMl,
    type HydrationEntry,
} from '../../Services/hydrationLogService';
import {
    MealLogServiceError,
} from '../../Services/mealLogService';
import { toDateKey, todayDateKey } from '../../Services/workoutLogService';
import { themedStyles } from '../../Theme/ThemeContext';
import { useDayMeals } from '../../Hooks/useDayMeals';
import { useScrollToItem } from '../../Hooks/useScrollToItem';
import { useDailySteps } from '../../Hooks/useDailySteps';
import { useAppSelector } from '../../Store/hooks';
import { selectDerivedTargets } from '../../Store/userProfileSlice';
import HydrationCard from './HydrationCard';
import CalorieMacroCard from './CalorieMacroCard';
import MealLogsCard from './MealLogsCard';

export interface NutritionScreenProps {
    /** A meal plan to scroll to on arrival — set when the user comes here
        from the dashboard's meal card. */
    focusPlanId?: string | null;
    /** Called once the tab has landed on `focusPlanId`, so the caller can
        clear it and a later visit does not jump again. */
    onFocusHandled?: () => void;
}

export const NutritionScreen: React.FC<NutritionScreenProps> = ({
    focusPlanId,
    onFocusHandled,
}) => {
    const [activeSubNav, setActiveSubNav] = useState('diet');
    // Water logged on the selected date. Held with the date it belongs
    // to so a stale count from the previous day can never be shown — or,
    // worse, saved over the new day's record.
    const [hydration, setHydration] = useState<{
        dateKey: string;
        entries: HydrationEntry[];
    }>({ dateKey: '', entries: [] });
    const dialog = useDialog();

    const [selectedDate, setSelectedDate] = useState(() => new Date());
    const selectedDateKey = toDateKey(selectedDate);
    const isToday = selectedDateKey === todayDateKey();

    const mealPlansError = useMealPlansError();

    // A listener that never connects would otherwise look exactly like a
    // day with nothing planned.
    useEffect(() => {
        if (mealPlansError) {
            dialog.show({ title: 'Could not load meal plans', message: mealPlansError });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mealPlansError]);

    // The selected date's meals, and logging / adjusting them. Shared
    // with the dashboard's meal card (see useDayMeals), so a meal logged
    // from either place is the same write and shows as logged in both.
    const {
        dayMeals,
        dayCards,
        hasLogsForDay,
        rowFor,
        loggingPlanId,
        totals,
        logMeal: handleLogMeal,
        saveDayEdit,
    } = useDayMeals(selectedDate);

    const targets = useAppSelector(selectDerivedTargets);
    const stepData = useDailySteps();
    // Steps are device-local with no history (README:397-400) — only
    // today can show a burn figure. A past date always shows '—'.
    const calorieBurned =
        isToday && !stepData.loading && stepData.source !== 'unavailable'
            ? stepData.caloriesBurned
            : null;

    // Arriving from the dashboard's meal card: land on that meal, where
    // its Log and Edit buttons are. Waits for the day's logs so it
    // scrolls to the real card rather than a skeleton row.
    const focus = useScrollToItem(focusPlanId, hasLogsForDay, onFocusHandled);

    // Adjusting what will be eaten today, before logging it. Writes
    // that date's row only — never the recurring plan, which is why the
    // sheet opens with the weekday strip hidden.
    const [editingLog, setEditingLog] = useState<MealPlan | null>(null);

    const handleSaveLogEdit = async (payload: MealPlanPayload) => {
        if (!editingLog) return;
        setIsSavingMeal(true);
        try {
            await saveDayEdit(editingLog, payload);
            setEditingLog(null);
        } catch (error) {
            dialog.show({
                title: 'Could not save meal log',
                message:
                    error instanceof MealLogServiceError
                        ? error.message
                        : 'Something went wrong. Please try again.',
            });
        } finally {
            setIsSavingMeal(false);
        }
    };

    const [showMealModal, setShowMealModal] = useState(false);
    const [isSavingMeal, setIsSavingMeal] = useState(false);

    // Plans whose nutrition is still being estimated, so the card can
    // say so rather than showing nothing where the macros will appear.
    const [estimatingIds, setEstimatingIds] = useState<string[]>([]);

    /**
     * Asks the model what the meal contains and writes the answer onto
     * the plan.
     *
     * Deliberately after the save and deliberately not awaited by it:
     * the estimate is a nice-to-have that costs a network round trip,
     * and a plan that saved successfully must not appear to fail
     * because an AI call did.
     */
    const estimateNutritionFor = async (planId: string, payload: MealPlanPayload) => {
        setEstimatingIds((prev) => [...prev, planId]);
        try {
            // Writes the items back with a nutrition block on each, so
            // the figures travel with the food they describe.
            const items = await estimateItemNutrition(payload.items);
            if (items.some((item) => item.nutrition)) {
                await updateMealPlan(planId, { items });
            } else {
                console.warn('[nutrition] nothing to write — no item got an estimate.');
            }
        } catch (error) {
            // Not shown to the user: they asked to save a meal, not to
            // run an estimate. But swallowing it entirely made a missing
            // key indistinguishable from a working feature.
            console.warn('[nutrition] estimate failed:', error);
        } finally {
            setEstimatingIds((prev) => prev.filter((id) => id !== planId));
        }
    };

    const handleCreateMealPlan = async (payload: MealPlanPayload) => {
        setIsSavingMeal(true);
        try {
            const planId = await createMealPlan({ ...payload, status: 'live' });
            setShowMealModal(false);
            void estimateNutritionFor(planId, payload);
            dialog.show({
                title: 'Meal plan saved',
                message: `"${payload.name}" will show up on ${payload.days.join(', ')} at ${payload.time}.`,
            });
        } catch (error) {
            dialog.show({
                title: 'Could not save meal plan',
                message:
                    error instanceof MealPlanServiceError
                        ? error.message
                        : 'Something went wrong. Please try again.',
            });
        } finally {
            setIsSavingMeal(false);
        }
    };

    const hasHydrationForDay = hydration.dateKey === selectedDateKey;
    const waterEntries = hasHydrationForDay ? hydration.entries : [];
    const waterMl = totalMl(waterEntries);
    const filledGlasses = glassesFrom(waterEntries);
    const canLogWater = isToday;

    useEffect(() => {
        let cancelled = false;
        fetchHydrationLog(selectedDateKey)
            .then((log) => {
                if (!cancelled) {
                    setHydration({ dateKey: selectedDateKey, entries: log?.entries ?? [] });
                }
            })
            .catch((error) => {
                if (cancelled) return;
                setHydration({ dateKey: selectedDateKey, entries: [] });
                dialog.show({
                    title: 'Could not load water intake',
                    message:
                        error instanceof HydrationLogServiceError
                            ? error.message
                            : 'Something went wrong loading this day.',
                });
            });
        return () => {
            cancelled = true;
        };
    }, [selectedDateKey]);

    /**
     * Applies a new entry list optimistically, then persists it.
     *
     * Optimistic because tapping a glass has to feel instant — waiting
     * on a round trip before the tile fills makes the row feel broken.
     * On failure it rolls back to what was on screen, so the UI never
     * keeps a state the database rejected.
     */
    const commitEntries = async (next: HydrationEntry[]) => {
        const previous = waterEntries;
        setHydration({ dateKey: selectedDateKey, entries: next });
        try {
            await saveHydrationEntries(selectedDateKey, next);
        } catch (error) {
            setHydration({ dateKey: selectedDateKey, entries: previous });
            dialog.show({
                title: 'Could not save water intake',
                message:
                    error instanceof HydrationLogServiceError
                        ? error.message
                        : 'Something went wrong. Please try again.',
            });
        }
    };

    /** Adds one drink, stamped with the time it was logged. */
    const addWater = (ml: number) => {
        // Belt and braces: the controls are already hidden on a locked
        // day, but nothing should be able to write to one.
        if (!canLogWater || ml <= 0) return;
        commitEntries([...waterEntries, { ml, time: formatEntryTime(new Date()) }]);
    };

    const removeWaterEntry = (index: number) => {
        if (!canLogWater) return;
        commitEntries(waterEntries.filter((_, i) => i !== index));
    };

    /**
     * Tapping tile N fills up to N glasses, recorded as one drink of
     * whatever was missing. Tapping the tile that is currently last
     * removes the most recent drink instead, so a mis-tap is undone by
     * tapping the same tile again.
     */
    const toggleGlass = (index: number) => {
        if (!canLogWater) return;
        if (index + 1 === filledGlasses) {
            if (waterEntries.length === 0) return;
            commitEntries(waterEntries.slice(0, -1));
            return;
        }
        addWater((index + 1 - filledGlasses) * ML_PER_GLASS);
    };

    return (
        <View style={styles.root}>
            <ScrollView
                ref={focus.scrollRef}
                onScrollBeginDrag={focus.onScrollBeginDrag}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
            >
                <CalorieMacroCard
                    calorieTotal={targets?.calorieTarget ?? null}
                    calorieConsumed={totals?.calories ?? null}
                    calorieBurned={calorieBurned}
                    macros={[
                        {
                            label: 'Protein',
                            grams: totals?.protein ?? null,
                            goalGrams: targets?.proteinG ?? 0,
                            color: colors.protein,
                        },
                        {
                            label: 'Carbs',
                            grams: totals?.carbs ?? null,
                            goalGrams: targets?.carbsG ?? 0,
                            color: colors.carbs,
                        },
                        {
                            label: 'Fats',
                            grams: totals?.fat ?? null,
                            goalGrams: targets?.fatsG ?? 0,
                            color: colors.fats,
                        },
                    ]}
                />

                <View style={styles.dateStripWrapper}>
                    <WorkoutDateStrip
                        selectedDate={selectedDate}
                        onSelectDate={setSelectedDate}
                        screenHorizontalPadding={spacing.screenHorizontalPadding}
                        accentColor={colors.secondary}
                    />
                </View>

                <HydrationCard
                    waterEntries={waterEntries}
                    waterMl={waterMl}
                    filledGlasses={filledGlasses}
                    canLogWater={canLogWater}
                    hasHydrationForDay={hasHydrationForDay}
                    onToggleGlass={toggleGlass}
                    onAddWater={addWater}
                    onRemoveEntry={removeWaterEntry}
                />

                <View onLayout={focus.onContainerLayout}>
                    <MealLogsCard
                        dayCards={dayCards}
                        hasLogsForDay={hasLogsForDay}
                        isToday={isToday}
                        loggingPlanId={loggingPlanId}
                        estimatingIds={estimatingIds}
                        onLogMeal={handleLogMeal}
                        onEditMeal={setEditingLog}
                        onFocusItem={focus.onItemLayout}
                    />
                </View>

                <View style={styles.fabSpacer} />
            </ScrollView>

            <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => setShowMealModal(true)}
                style={styles.fab}
            >
                <UtensilsCrossed size={17} color={colors.white} strokeWidth={2.2} />
                <Text style={styles.fabText}>Create Meal Plan</Text>
            </TouchableOpacity>

            {showMealModal ? (
                <NewMealPlanModal
                    onClose={() => setShowMealModal(false)}
                    onCreate={handleCreateMealPlan}
                    saving={isSavingMeal}
                />
            ) : null}

            {editingLog ? (
                <NewMealPlanModal
                    logMode
                    logDateLabel={selectedDateKey}
                    initialPlan={{
                        name: rowFor(editingLog.id)?.planName ?? editingLog.name,
                        mealType: rowFor(editingLog.id)?.mealType ?? editingLog.mealType,
                        // Start from what was logged, not from the plan —
                        // otherwise reopening the sheet would quietly
                        // revert an earlier correction.
                        items: rowFor(editingLog.id)?.items ?? editingLog.items,
                        days: editingLog.days,
                        time: rowFor(editingLog.id)?.time ?? editingLog.time,
                    }}
                    onClose={() => setEditingLog(null)}
                    onCreate={handleSaveLogEdit}
                    saving={isSavingMeal}
                />
            ) : null}
        </View>
    );
};

const styles = themedStyles(() => ({
    root: {
        flex: 1,
    },
    scrollContent: {
        paddingBottom: 32,
        gap: 20,
    },
    dateStripWrapper: {
        // No horizontal padding here — WorkoutDateStrip applies
        // screenHorizontalPadding itself via its contentContainerStyle, and
        // sizes its tiles assuming that is the only inset.
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
}));

export default NutritionScreen;
