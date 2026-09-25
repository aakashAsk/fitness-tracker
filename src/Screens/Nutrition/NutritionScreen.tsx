import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, View, Text, TouchableOpacity } from 'react-native';
import Animated, {
    FadeInDown,
    FadeOutDown,
    useAnimatedStyle,
    useSharedValue,
    withTiming,
} from 'react-native-reanimated';
import { Plus, ShoppingCart, UtensilsCrossed } from 'lucide-react-native';
import { colors, withOpacity } from '../../Theme/colors';
import { spacing } from '../../Theme/spacing';
import WorkoutDateStrip from '../Workout/WorkoutDateStrip';
import { useDialog } from '../../Components/Dialog';
import NewMealPlanModal, { type MealPlanPayload } from './NewMealPlanModal';
import GroceryListModal from './GroceryListModal';
import {
    createGroceryList,
    GroceryListServiceError,
    type GroceryListInput,
} from '../../Services/groceryListService';
import { estimateItemNutrition } from '../../Services/nutritionAiService';
import {
    createMealPlan,
    updateMealPlan,
    describeMealConflict,
    findMealScheduleConflict,
    MealPlanServiceError,
    type MealPlan,
} from '../../Services/mealPlanService';
import MealPlanLibrary from './MealPlanLibrary';
import GroceryListLibrary from './GroceryListLibrary';
import WorkoutPlanEngineCard from '../Workout/WorkoutPlanEngineCard';
import { useAiDraftMealPlans } from '../../Hooks/useAiDraftMealPlans';
import { FeatureGate } from '../../FeatureFlags';
import { useMealPlans, useMealPlansError, useMealPlansLoading } from '../../Store/mealPlansSlice';
import { parseTimeToMinutes } from '../../Services/workoutPlanService';
import { useWorkoutPlans } from '../../Store/workoutPlansSlice';
import {
    DAILY_ML_GOAL,
    fetchTelemetry,
    formatEntryTime,
    glassesFrom,
    ML_PER_GLASS,
    saveWaterEntries,
    TelemetryServiceError,
    totalMl,
    type WaterEntry,
} from '../../Services/telemetryService';
import {
    MealLogServiceError,
} from '../../Services/mealLogService';
import { toDateKey, todayDateKey } from '../../Services/workoutLogService';
import { themedStyles } from '../../Theme/ThemeContext';
import { useDayMeals } from '../../Hooks/useDayMeals';
import { useDayWorkoutEvents } from '../../Hooks/useDayWorkoutEvents';
import { useScrollToItem } from '../../Hooks/useScrollToItem';
import { useDailySteps } from '../../Hooks/useDailySteps';
import { useAppSelector } from '../../Store/hooks';
import { selectDerivedTargets } from '../../Store/userProfileSlice';
import HydrationCard from './HydrationCard';
import CalorieMacroCard from './CalorieMacroCard';
import MealLogsCard from './MealLogsCard';
import NutritionSkeleton from './NutritionSkeleton';
import ScreenLoadGate from '../../Components/ScreenLoadGate';

// A meal within this many minutes of a scheduled workout, on a shared
// day, is flagged as a clash rather than silently overlapping it.
const WORKOUT_CONFLICT_WINDOW_MINUTES = 30;

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
    // Water and burn calories logged on the selected date. Held with the
    // date it belongs to so a stale reading from the previous day can
    // never be shown — or, worse, saved over the new day's record.
    const [hydration, setHydration] = useState<{
        dateKey: string;
        entries: WaterEntry[];
        /** From the day's telemetry row — step-derived, written whenever
            the Dashboard has been opened that day. Null when the day has
            no telemetry document yet. */
        caloriesBurned: number | null;
    }>({ dateKey: '', entries: [], caloriesBurned: null });
    const dialog = useDialog();
    const { generate: generateAiMealPlans, isGenerating: isGeneratingAiMealPlans } =
        useAiDraftMealPlans();

    const [selectedDate, setSelectedDate] = useState(() => new Date());
    const selectedDateKey = toDateKey(selectedDate);
    const isToday = selectedDateKey === todayDateKey();
    // Nothing scheduled for a day that hasn't happened yet can be logged —
    // MealLogsCard needs this to distinguish "later today" (time-gated)
    // from "a future day entirely" (gated regardless of time).
    const isFutureDay = selectedDateKey > todayDateKey();

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
    // The profile stores no fiber target, so use the common guideline of
    // 14 g per 1,000 kcal (25 g until a calorie target exists).
    const fiberGoalG = targets ? Math.round((targets.calorieTarget / 1000) * 14) : 25;
    const stepData = useDailySteps();

    // Today's completed workouts, for the calories they report burning —
    // same source the Workout tab's own summaries read from, so this
    // figure can never disagree with what a session card shows there.
    const dayWorkouts = useDayWorkoutEvents(selectedDate);
    const workoutCaloriesBurned = React.useMemo(
        () =>
            Array.from(dayWorkouts.statsByPlanId.values()).reduce(
                (sum, stats) => sum + stats.caloriesBurned,
                0,
            ),
        [dayWorkouts.statsByPlanId],
    );

    // Step-derived calories come from the day's telemetry row — written
    // by the Dashboard (see LiveTelementry's useRecordTelemetry) — which
    // works for any date, not just today: the live pedometer reading is
    // only ever "today", but a past day's step burn survives in
    // Firestore once the Dashboard has recorded it. Today additionally
    // falls back to the live sensor reading for the moments before that
    // day's telemetry row has been written yet.
    const hasHydrationForDay = hydration.dateKey === selectedDateKey;
    const telemetryStepCalories = hasHydrationForDay ? hydration.caloriesBurned : null;
    const liveStepCalories =
        isToday && !stepData.loading && stepData.source !== 'unavailable'
            ? stepData.caloriesBurned
            : null;
    const stepCaloriesBurned = telemetryStepCalories ?? liveStepCalories ?? 0;

    // Never null — a day with nothing recorded yet is a real zero, not a
    // missing figure the card should blank out.
    const calorieBurned = stepCaloriesBurned + workoutCaloriesBurned;

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

    // Editing a plan's recurring rule from the library below — every day
    // it produces changes, past and future, unlike editingLog above which
    // only ever touches the selected date.
    const [editingPlan, setEditingPlan] = useState<MealPlan | null>(null);
    const mealPlans = useMealPlans();

    const handleUpdateMealPlan = async (payload: MealPlanPayload) => {
        if (!editingPlan) return;

        // Rescheduling a live plan can move it on top of another one.
        // Excluded from the search by id, or it would clash with itself.
        if (editingPlan.status === 'live') {
            const conflict = findMealScheduleConflict(
                mealPlans,
                { days: payload.days, time: payload.time },
                { excludePlanId: editingPlan.id },
            );
            if (conflict) {
                dialog.show({
                    title: 'That time is already taken',
                    message: describeMealConflict(conflict),
                });
                return;
            }
        }

        setIsSavingMeal(true);
        try {
            await updateMealPlan(editingPlan.id, payload);
            setEditingPlan(null);
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

    const [showMealModal, setShowMealModal] = useState(false);
    const [isSavingMeal, setIsSavingMeal] = useState(false);
    const [showGroceryModal, setShowGroceryModal] = useState(false);
    const [isSavingGroceryList, setIsSavingGroceryList] = useState(false);

    // The FAB's speed-dial: two small actions slide up above it instead
    // of a popup. Rotation is the "+" turning into an "x" while open —
    // the same affordance most speed-dial FABs use to say "tap again to
    // close" without extra copy.
    const [fabMenuOpen, setFabMenuOpen] = useState(false);
    const fabRotation = useSharedValue(0);
    useEffect(() => {
        fabRotation.value = withTiming(fabMenuOpen ? 1 : 0, { duration: 180 });
    }, [fabMenuOpen, fabRotation]);
    const fabIconStyle = useAnimatedStyle(() => ({
        transform: [{ rotate: `${fabRotation.value * 45}deg` }],
    }));

    const openCreateMealPlan = () => {
        setFabMenuOpen(false);
        setShowMealModal(true);
    };
    const openGroceriesList = () => {
        setFabMenuOpen(false);
        setShowGroceryModal(true);
    };

    const handleCreateGroceryList = async (payload: GroceryListInput) => {
        setIsSavingGroceryList(true);
        try {
            await createGroceryList(payload);
            setShowGroceryModal(false);
            dialog.show({
                title: 'Grocery list saved',
                message: `"${payload.name}" has ${payload.items.length} ${
                    payload.items.length === 1 ? 'item' : 'items'
                }.`,
            });
        } catch (error) {
            dialog.show({
                title: 'Could not save grocery list',
                message:
                    error instanceof GroceryListServiceError
                        ? error.message
                        : 'Something went wrong. Please try again.',
            });
        } finally {
            setIsSavingGroceryList(false);
        }
    };

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

    const workoutPlans = useWorkoutPlans();

    /**
     * A live workout sharing a day with this meal plan and scheduled
     * within WORKOUT_CONFLICT_WINDOW_MINUTES of it, or null. Used to warn
     * before saving rather than block — the user may genuinely want to
     * eat right before or after a session.
     */
    const findWorkoutConflict = (payload: MealPlanPayload) => {
        const mealMinutes = parseTimeToMinutes(payload.time);
        const days = new Set(payload.days);
        return (
            workoutPlans.find(
                (plan) =>
                    plan.status === 'live' &&
                    !!plan.time &&
                    plan.days.some((day) => days.has(day)) &&
                    Math.abs(parseTimeToMinutes(plan.time) - mealMinutes) <=
                        WORKOUT_CONFLICT_WINDOW_MINUTES,
            ) ?? null
        );
    };

    const saveMealPlan = async (payload: MealPlanPayload) => {
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

    const handleCreateMealPlan = async (payload: MealPlanPayload) => {
        const conflict = findWorkoutConflict(payload);
        if (conflict) {
            dialog.show({
                title: 'Clashes with a workout',
                message: `"${conflict.name}" is scheduled at ${conflict.time} on ${conflict.days.join(', ')} — close to this meal's ${payload.time}. Add it anyway?`,
                actions: [
                    { label: 'Cancel', style: 'cancel' },
                    {
                        label: 'Add Anyway',
                        style: 'primary',
                        onPress: () => void saveMealPlan(payload),
                    },
                ],
            });
            return;
        }
        await saveMealPlan(payload);
    };

    // Everything the first paint needs: the meal store's first snapshot and
    // the selected day's logs and water.
    const mealPlansLoading = useMealPlansLoading();
    const isScreenReady = !mealPlansLoading && hasLogsForDay && hasHydrationForDay;
    const waterEntries = hasHydrationForDay ? hydration.entries : [];
    const waterMl = totalMl(waterEntries);
    const filledGlasses = glassesFrom(waterEntries);
    const canLogWater = isToday;

    useEffect(() => {
        let cancelled = false;
        fetchTelemetry(selectedDateKey)
            .then((day) => {
                if (!cancelled) {
                    setHydration({
                        dateKey: selectedDateKey,
                        entries: day?.water ?? [],
                        caloriesBurned: day?.caloriesBurned ?? null,
                    });
                }
            })
            .catch((error) => {
                if (cancelled) return;
                setHydration({ dateKey: selectedDateKey, entries: [], caloriesBurned: null });
                dialog.show({
                    title: 'Could not load water intake',
                    message:
                        error instanceof TelemetryServiceError
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
    const commitEntries = async (next: WaterEntry[]) => {
        const previous = waterEntries;
        setHydration((prev) => ({ ...prev, dateKey: selectedDateKey, entries: next }));
        try {
            await saveWaterEntries(selectedDateKey, next);
        } catch (error) {
            setHydration((prev) => ({ ...prev, dateKey: selectedDateKey, entries: previous }));
            dialog.show({
                title: 'Could not save water intake',
                message:
                    error instanceof TelemetryServiceError
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
                {/* First load of the session: a page-shaped skeleton stands in until
                    the day's meals and water have loaded, then the real screen
                    replaces it in one step. The gate carries the spacing scrollContent
                    used to apply between these sections directly. */}
                <ScreenLoadGate
                    screenKey="nutrition"
                    ready={isScreenReady}
                    skeleton={<NutritionSkeleton />}
                    style={styles.stack}
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
                                label: 'Fiber',
                                grams: totals?.fiber ?? null,
                                goalGrams: fiberGoalG,
                                color: colors.success,
                            },
                        ]}
                    />

                    <FeatureGate flag="enabledAddForSubscription">
                        <WorkoutPlanEngineCard
                            onPress={generateAiMealPlans}
                            loading={isGeneratingAiMealPlans}
                            headerLabel="MEAL PLAN ENGINE"
                            headerHint="1-Tap Personalization"
                            pillText="Intelligent Nutrition Engine"
                            title="Design AI Meal Plan"
                            description="Build a week of meals calibrated to your calorie target, macros, goal, and dietary needs."
                            loadingLabel="Designing your AI meal plan"
                            idleLabel="Design AI meal plan"
                        />
                    </FeatureGate>

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
                            isFutureDay={isFutureDay}
                            loggingPlanId={loggingPlanId}
                            estimatingIds={estimatingIds}
                            onLogMeal={handleLogMeal}
                            onEditMeal={setEditingLog}
                            onFocusItem={focus.onItemLayout}
                        />
                    </View>

                    <GroceryListLibrary />

                    <MealPlanLibrary onEditPlan={setEditingPlan} />

                    <View style={styles.fabSpacer} />
                </ScreenLoadGate>
            </ScrollView>

            {/* A transparent tap-anywhere-else-to-close layer — only
                present while the speed-dial is open, and behind it in
                the stack so its own buttons still take the tap first. */}
            {fabMenuOpen ? (
                <Pressable
                    style={styles.fabBackdrop}
                    onPress={() => setFabMenuOpen(false)}
                    accessibilityLabel="Close menu"
                />
            ) : null}

            <View style={styles.fabColumn} pointerEvents="box-none">
                {fabMenuOpen ? (
                    <>
                        <Animated.View
                            entering={FadeInDown.duration(160)}
                            exiting={FadeOutDown.duration(120)}
                            style={styles.fabMenuItem}
                        >
                            <View style={styles.fabMenuLabel}>
                                <Text style={styles.fabMenuLabelText}>Create Meal Plan</Text>
                            </View>
                            <TouchableOpacity
                                activeOpacity={0.85}
                                onPress={openCreateMealPlan}
                                accessibilityRole="button"
                                accessibilityLabel="Create meal plan"
                                style={styles.fabMenuButton}
                            >
                                <UtensilsCrossed size={18} color={colors.white} strokeWidth={2.4} />
                            </TouchableOpacity>
                        </Animated.View>

                        <Animated.View
                            entering={FadeInDown.duration(160).delay(40)}
                            exiting={FadeOutDown.duration(120)}
                            style={styles.fabMenuItem}
                        >
                            <View style={styles.fabMenuLabel}>
                                <Text style={styles.fabMenuLabelText}>Add Groceries List</Text>
                            </View>
                            <TouchableOpacity
                                activeOpacity={0.85}
                                onPress={openGroceriesList}
                                accessibilityRole="button"
                                accessibilityLabel="Add groceries list"
                                style={styles.fabMenuButton}
                            >
                                <ShoppingCart size={18} color={colors.white} strokeWidth={2.4} />
                            </TouchableOpacity>
                        </Animated.View>
                    </>
                ) : null}

                <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => setFabMenuOpen((open) => !open)}
                    accessibilityRole="button"
                    accessibilityLabel={fabMenuOpen ? 'Close menu' : 'Add to nutrition'}
                    style={styles.fab}
                >
                    <Animated.View style={fabIconStyle}>
                        <Plus size={22} color={colors.white} strokeWidth={2.6} />
                    </Animated.View>
                </TouchableOpacity>
            </View>

            {showMealModal ? (
                <NewMealPlanModal
                    onClose={() => setShowMealModal(false)}
                    onCreate={handleCreateMealPlan}
                    saving={isSavingMeal}
                />
            ) : null}

            {showGroceryModal ? (
                <GroceryListModal
                    onClose={() => setShowGroceryModal(false)}
                    onCreate={handleCreateGroceryList}
                    saving={isSavingGroceryList}
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

            {editingPlan ? (
                <NewMealPlanModal
                    initialPlan={{
                        name: editingPlan.name,
                        mealType: editingPlan.mealType,
                        items: editingPlan.items,
                        days: editingPlan.days,
                        time: editingPlan.time,
                    }}
                    onClose={() => setEditingPlan(null)}
                    onCreate={handleUpdateMealPlan}
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
    },
    // Spacing between the sections, carried by the load gate's wrapper.
    stack: {
        gap: 20,
    },
    dateStripWrapper: {
        // No horizontal padding here — WorkoutDateStrip applies
        // screenHorizontalPadding itself, via marginHorizontal on its own
        // root View, and sizes its tiles from its own measured width.
    },
    fabSpacer: {
        height: 56,
    },
    fabBackdrop: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: withOpacity(colors.black, 0.1),
    },
    // The column that positions everything — the main button and, while
    // open, the two mini-actions stacked above it. Column order in JSX
    // (menu items first, main button last) is what makes them appear
    // above it rather than below.
    fabColumn: {
        position: 'absolute',
        right: spacing.screenHorizontalPadding,
        bottom: 8,
        alignItems: 'flex-end',
        gap: 14,
    },
    fabMenuItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    fabMenuLabel: {
        backgroundColor: colors.surface,
        paddingHorizontal: 12,
        paddingVertical: 7,
        borderRadius: 10,
        shadowColor: colors.black,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.12,
        shadowRadius: 6,
        elevation: 3,
    },
    fabMenuLabelText: {
        fontSize: 12.5,
        fontWeight: '700',
        color: colors.textPrimary,
    },
    // Same size, shape and color as the main "+/×" button — the two
    // menu items read as instances of the same control, not smaller
    // secondary buttons, since they're doing the same job (each is a
    // one-tap create action) as the FAB itself.
    fabMenuButton: {
        width: 56,
        height: 56,
        borderRadius: 28,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.secondary,
        shadowColor: colors.secondary,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.35,
        shadowRadius: 16,
        elevation: 6,
    },
    fab: {
        width: 56,
        height: 56,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.secondary,
        borderRadius: 28,
        shadowColor: colors.secondary,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.35,
        shadowRadius: 16,
        elevation: 6,
    },
}));

export default NutritionScreen;
