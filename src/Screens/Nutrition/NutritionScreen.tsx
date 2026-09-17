import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, View, Text, TouchableOpacity } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { SkeletonBlock, SkeletonCard, SkeletonGroup } from '../../Components/Skeleton';
import {
    ChartPie,
    Check,
    CheckCircle,
    Clock,
    Droplet,
    SquarePen,
    Flame,
    GlassWater,
    Pill,
    Plus,
    Stethoscope,
    UtensilsCrossed,
    X,
} from 'lucide-react-native';
import { colors, withOpacity } from '../../Theme/colors';
import { spacing } from '../../Theme/spacing';
import WorkoutDateStrip from '../Workout/WorkoutDateStrip';
import { useDialog } from '../../Components/Dialog';
import NewMealPlanModal, { type MealPlanPayload } from './NewMealPlanModal';
// ── Gemini nutrition estimates: temporarily disabled ─────────────────
// The API key lives in EXPO_PUBLIC_*, which ships inside the app
// bundle, so shipping it would publish the key. The feature is off
// until the call goes through a proxy that holds the key server-side
// (EXPO_PUBLIC_GEMINI_PROXY_URL in .env.example).
//
// Commented rather than deleted, and the only import of the service —
// with it off, neither nutritionAiService nor geminiService is reached
// by the bundler at all. To re-enable: uncomment this line and the body
// of estimateNutritionFor() below.
//
// import { estimateItemNutrition } from '../../Services/nutritionAiService';
// ─────────────────────────────────────────────────────────────────────
import {
    createMealPlan,
    updateMealPlan,
    describeItems,
    getMealPlansForDate,
    MEAL_TYPE_LABEL,
    sumItemNutrition,
    MealPlanServiceError,
    type MealPlan,
} from '../../Services/mealPlanService';
import { useMealPlans, useMealPlansError } from '../../Store/mealPlansSlice';
import { parseTimeToMinutes } from '../../Services/workoutPlanService';
import {
    DAILY_GLASS_GOAL,
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
    fetchMealLogsForDate,
    MealLogServiceError,
    saveMealLog,
    type MealLog,
} from '../../Services/mealLogService';
import { toDateKey, todayDateKey } from '../../Services/workoutLogService';
import { themedStyles } from '../../Theme/ThemeContext';

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




// Stands in for the glass tiles and quick-add buttons while the day's
// water is being fetched. The card cannot draw its real state earlier:
// an empty row of tiles would read as "nothing drunk today", which is a
// claim rather than a blank — and it is wrong as often as it is right.
const HydrationSkeleton: React.FC = () => (
    <>
        <SkeletonGroup style={styles.glassesGrid}>
            {Array.from({ length: DAILY_GLASS_GOAL }).map((_, index) => (
                <View key={index} style={styles.glassColumn}>
                    <SkeletonBlock height={46} radius={14} />
                    <SkeletonBlock width={10} height={8} radius={4} style={styles.hydrationSkeletonIndex} />
                </View>
            ))}
        </SkeletonGroup>

        <SkeletonGroup style={styles.quickAddRow}>
            <SkeletonBlock height={42} radius={14} style={styles.hydrationSkeletonButton} />
            <SkeletonBlock height={42} radius={14} style={styles.hydrationSkeletonButton} />
        </SkeletonGroup>
    </>
);

// Shown while the day's logs are still arriving. The meal cards cannot
// render earlier than this: which buttons they show depends entirely on
// whether a log exists, so drawing them first would flash "Log Meal" on
// a meal that is already logged.
const MealSkeleton: React.FC<{ rows: number }> = ({ rows }) => (
    <>
        {Array.from({ length: rows }).map((_, index) => (
            <SkeletonCard key={index} withFooter />
        ))}
    </>
);

// Fixed width, with the summary list taking whatever is left of the row.
// Kept modest for that reason: every dp here comes straight out of the
// space "Consumed · 1,310 kcal" has to fit into on a narrow screen.
const RING_SIZE = 120;
const RING_STROKE = 9;

export const NutritionScreen: React.FC = () => {
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

    // One app-wide listener feeds this (App.tsx's useMealPlansSync), so a
    // plan saved here is on screen — and on the Schedule tab — the moment
    // Firestore acknowledges the write.
    const mealPlans = useMealPlans();
    const mealPlansError = useMealPlansError();

    // A listener that never connects would otherwise look exactly like a
    // day with nothing planned.
    useEffect(() => {
        if (mealPlansError) {
            dialog.show({ title: 'Could not load meal plans', message: mealPlansError });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mealPlansError]);

    // The plans that recur on the selected date's weekday, earliest first.
    const dayMeals = useMemo(
        () =>
            [...getMealPlansForDate(selectedDate, mealPlans)].sort(
                (a, b) => parseTimeToMinutes(a.time) - parseTimeToMinutes(b.time),
            ),
        [selectedDate, mealPlans],
    );

    // What the user has actually eaten on the selected date. Fetched per
    // date rather than subscribed: unlike plans, only this screen reads
    // it, and it changes only when the user logs something here.
    const [mealLogs, setMealLogs] = useState<{ dateKey: string; rows: MealLog[] }>({
        dateKey: '',
        rows: [],
    });
    const hasLogsForDay = mealLogs.dateKey === selectedDateKey;
    const [logRefreshKey, setLogRefreshKey] = useState(0);

    useEffect(() => {
        let cancelled = false;
        fetchMealLogsForDate(selectedDateKey)
            .then((rows) => {
                if (!cancelled) setMealLogs({ dateKey: selectedDateKey, rows });
            })
            .catch((error) => {
                if (cancelled) return;
                // The planned meals still render, but silently dropping
                // this made a denied read indistinguishable from a day
                // with nothing logged — and the Log/Edit buttons are
                // driven entirely by what comes back here.
                setMealLogs({ dateKey: selectedDateKey, rows: [] });
                dialog.show({
                    title: 'Could not load logged meals',
                    message:
                        error instanceof MealLogServiceError
                            ? error.message
                            : 'Something went wrong loading this day.',
                });
            });
        return () => {
            cancelled = true;
        };
    }, [selectedDateKey, logRefreshKey]);

    /**
     * This plan's row for the selected day, whatever state it is in.
     *
     * A 'planned' row means the user adjusted what they were going to
     * eat but has not logged it yet; a 'completed' one means they have.
     * Both need to be found, because the card shows the adjusted items
     * either way — the state only decides which buttons appear.
     */
    const rowFor = (planId: string): MealLog | undefined =>
        hasLogsForDay ? mealLogs.rows.find((row) => row.planId === planId) : undefined;

    /**
     * What to show for the selected day.
     *
     * The log rows are the authority: if one exists for a date it holds
     * what was actually eaten (or the adjustment about to be logged), so
     * its values win over the plan's. The plan is the fallback for days
     * with no row yet.
     *
     * Rows whose plan no longer recurs on this weekday — rescheduled,
     * paused, or deleted since — are added back at the end. Otherwise a
     * meal you logged would vanish from its own day the moment you
     * changed the plan behind it.
     */
    const dayCards = useMemo(() => {
        const rows = hasLogsForDay ? mealLogs.rows : [];
        const byPlanId = new Map(rows.map((row) => [row.planId, row]));

        const fromPlans = dayMeals.map((plan) => {
            const row = byPlanId.get(plan.id);
            return {
                plan,
                planId: plan.id,
                name: row?.planName ?? plan.name,
                mealType: row?.mealType ?? plan.mealType,
                time: row?.time ?? plan.time,
                items: row?.items ?? plan.items,
                isLogged: row?.state === 'completed',
            };
        });

        const shown = new Set(dayMeals.map((plan) => plan.id));
        const orphaned = rows
            .filter((row) => !shown.has(row.planId))
            .map((row) => ({
                // The plan may be gone entirely, in which case the row is
                // all that is left to render from.
                plan: mealPlans.find((plan) => plan.id === row.planId),
                planId: row.planId,
                name: row.planName,
                mealType: row.mealType,
                time: row.time,
                items: row.items,
                isLogged: row.state === 'completed',
            }));

        return [...fromPlans, ...orphaned].sort(
            (a, b) => parseTimeToMinutes(a.time) - parseTimeToMinutes(b.time),
        );
    }, [dayMeals, mealLogs, hasLogsForDay, mealPlans]);

    const [loggingPlanId, setLoggingPlanId] = useState<string | null>(null);

    /** Merges one saved row into the day's logs, replacing any earlier
     * row for the same plan. */
    const applyLoggedRow = (row: MealLog) =>
        setMealLogs((prev) => {
            const rows = (prev.dateKey === selectedDateKey ? prev.rows : []).filter(
                (existing) => existing.planId !== row.planId,
            );
            return { dateKey: selectedDateKey, rows: [...rows, row] };
        });

    // Logs whatever the card is currently showing — the plan as it
    // stands, or the adjusted version if the user edited it first.
    const handleLogMeal = async (plan: MealPlan) => {
        const pending = rowFor(plan.id);
        const items = pending?.items ?? plan.items;
        const time = pending?.time ?? plan.time;
        const name = pending?.planName ?? plan.name;
        const mealType = pending?.mealType ?? plan.mealType;

        setLoggingPlanId(plan.id);
        try {
            await saveMealLog({
                planId: plan.id,
                planName: name,
                mealType,
                date: selectedDateKey,
                time,
                items,
                state: 'completed',
            });
            // Applied locally as well as refetched: the write is the
            // authority on what was just saved, so the button flips
            // immediately even if the follow-up read is slow.
            applyLoggedRow({
                id: `${plan.id}-${selectedDateKey}`,
                userId: '',
                planId: plan.id,
                planName: name,
                mealType,
                date: selectedDateKey,
                time,
                items,
                state: 'completed',
                updatedAt: null,
            });
            setLogRefreshKey((key) => key + 1);
        } catch (error) {
            dialog.show({
                title: 'Could not log meal',
                message:
                    error instanceof MealLogServiceError
                        ? error.message
                        : 'Something went wrong. Please try again.',
            });
        } finally {
            setLoggingPlanId(null);
        }
    };

    // Adjusting what will be eaten today, before logging it. Writes
    // that date's row only — never the recurring plan, which is why the
    // sheet opens with the weekday strip hidden.
    const [editingLog, setEditingLog] = useState<MealPlan | null>(null);

    const handleSaveLogEdit = async (payload: MealPlanPayload) => {
        if (!editingLog) return;
        setIsSavingMeal(true);
        try {
            await saveMealLog({
                planId: editingLog.id,
                planName: payload.name,
                mealType: payload.mealType,
                date: selectedDateKey,
                time: payload.time,
                items: payload.items,
                // Still 'planned': the user changed what they intend to
                // eat, they have not said they ate it. Log Meal is what
                // marks it completed.
                state: 'planned',
            });
            applyLoggedRow({
                id: `${editingLog.id}-${selectedDateKey}`,
                userId: '',
                planId: editingLog.id,
                planName: payload.name,
                mealType: payload.mealType,
                date: selectedDateKey,
                time: payload.time,
                items: payload.items,
                state: 'planned',
                updatedAt: null,
            });
            setEditingLog(null);
            setLogRefreshKey((key) => key + 1);
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
    const estimateNutritionFor = async (_planId: string, _payload: MealPlanPayload) => {
        // Disabled with the import at the top of this file. The meal
        // still saves — it simply keeps whatever nutrition figures the
        // user typed, instead of having them filled in by the model.
        //
        // To re-enable, uncomment the import above and this body:
        //
        // setEstimatingIds((prev) => [...prev, planId]);
        // try {
        //     // Writes the items back with a nutrition block on each, so
        //     // the figures travel with the food they describe.
        //     const items = await estimateItemNutrition(payload.items);
        //     if (items.some((item) => item.nutrition)) {
        //         await updateMealPlan(planId, { items });
        //         console.log('[nutrition] written to mealPlans/' + planId);
        //     } else {
        //         console.warn('[nutrition] nothing to write — no item got an estimate.');
        //     }
        // } catch (error) {
        //     // Still not shown to the user: they asked to save a meal,
        //     // not to run an estimate. But swallowing it entirely made a
        //     // missing key indistinguishable from a working feature.
        //     console.warn('[nutrition] estimate failed:', error);
        // } finally {
        //     setEstimatingIds((prev) => prev.filter((id) => id !== planId));
        // }
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

    const calorieTotal = 2200;
    const calorieConsumed = 1310;
    const calorieBurned = 650;
    const kcalLeft = calorieTotal - calorieConsumed;

    const ringRadius = (RING_SIZE - RING_STROKE) / 2;
    const ringCircumference = 2 * Math.PI * ringRadius;
    const ringPercent = Math.min(calorieConsumed / calorieTotal, 1);
    const ringDashOffset = ringCircumference * (1 - ringPercent);


    const hasHydrationForDay = hydration.dateKey === selectedDateKey;
    const waterEntries = hasHydrationForDay ? hydration.entries : [];
    const waterMl = totalMl(waterEntries);
    const filledGlasses = glassesFrom(waterEntries);

    // Water is only logged as you drink it, so only today can be
    // changed. A past day is finished, and a future one has not
    // happened — both are read-only.
    const canLogWater = isToday;

    // The tiles are a selection control. On a read-only day with nothing
    // stored there is nothing to select and nothing to show, so the card
    // reports 0% and leaves them out entirely rather than presenting a
    // row of empty glasses that cannot be tapped.
    const showGlasses = canLogWater || waterEntries.length > 0;

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
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
            >

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
                                    <Text style={styles.summaryLabel} numberOfLines={1}>
                                        Consumed
                                    </Text>
                                </View>
                                <Text style={styles.summaryValue} numberOfLines={1}>
                                    {calorieConsumed.toLocaleString()} kcal
                                </Text>
                            </View>
                            <View style={styles.summaryRow}>
                                <View style={styles.summaryLeft}>
                                    <View style={[styles.summaryDot, { backgroundColor: colors.textMuted }]} />
                                    <Text style={styles.summaryLabel} numberOfLines={1}>
                                        Target
                                    </Text>
                                </View>
                                <Text style={styles.summaryValue} numberOfLines={1}>
                                    {calorieTotal.toLocaleString()} kcal
                                </Text>
                            </View>
                            <View style={styles.summaryRow}>
                                <View style={styles.summaryLeft}>
                                    <View style={[styles.summaryDot, { backgroundColor: colors.primary }]} />
                                    <Text style={styles.summaryLabel} numberOfLines={1}>
                                        Burned
                                    </Text>
                                </View>
                                <Text
                                    style={[styles.summaryValue, { color: colors.primary }]}
                                    numberOfLines={1}
                                >
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

                {/* Date strip — sits under the stats, and drives which
                    meal plans the list below shows. Same component the
                    Workout and Schedule tabs use. */}
                <View style={styles.dateStripWrapper} >
                    <WorkoutDateStrip
                        selectedDate={selectedDate}
                        onSelectDate={setSelectedDate}
                        screenHorizontalPadding={spacing.screenHorizontalPadding}
                        accentColor={colors.secondary}
                    />
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
                                    {!hasHydrationForDay
                                        ? 'Loading…'
                                        : `${waterMl}ml of ${DAILY_ML_GOAL}ml${
                                              waterEntries.length > 0
                                                  ? ` · ${waterEntries.length} ${
                                                        waterEntries.length === 1
                                                            ? 'drink'
                                                            : 'drinks'
                                                    }`
                                                  : ''
                                          }`}
                                </Text>
                            </View>
                        </View>
                        <View style={styles.hydrationGoalPill}>
                            <Text style={styles.hydrationGoalText}>
                                {hasHydrationForDay
                                    ? Math.min(Math.round((waterMl / DAILY_ML_GOAL) * 100), 999)
                                    : 0}
                                % Goal
                            </Text>
                        </View>
                    </View>

                    {!hasHydrationForDay ? <HydrationSkeleton /> : null}

                    {hasHydrationForDay && showGlasses ? (
                    <View style={styles.glassesGrid}>
                        {Array.from({ length: DAILY_GLASS_GOAL }).map((_, index) => {
                            const filled = index < filledGlasses;
                            return (
                                <TouchableOpacity
                                    key={index}
                                    activeOpacity={canLogWater ? 0.8 : 1}
                                    disabled={!canLogWater}
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
                    ) : null}

                    {hasHydrationForDay && !showGlasses ? (
                        <Text style={styles.hydrationEmptyText}>
                            No water logged on this day.
                        </Text>
                    ) : null}

                    {waterEntries.length > 0 ? (
                        <View style={styles.waterLogList}>
                            {waterEntries.map((entry, index) => (
                                <View key={`${entry.time}-${index}`} style={styles.waterLogRow}>
                                    <Droplet
                                        size={13}
                                        color={colors.water}
                                        strokeWidth={2.4}
                                        fill={colors.water}
                                    />
                                    <Text style={styles.waterLogMl}>{entry.ml}ml</Text>
                                    <Text style={styles.waterLogTime}>{entry.time}</Text>
                                    {canLogWater ? (
                                        <TouchableOpacity
                                            accessibilityLabel={`Remove ${entry.ml}ml at ${entry.time}`}
                                            hitSlop={8}
                                            onPress={() => removeWaterEntry(index)}
                                        >
                                            <X
                                                size={14}
                                                color={colors.textMuted}
                                                strokeWidth={2.4}
                                            />
                                        </TouchableOpacity>
                                    ) : null}
                                </View>
                            ))}
                        </View>
                    ) : null}

                    {canLogWater && hasHydrationForDay ? (
                    <View style={styles.quickAddRow}>
                        <TouchableOpacity
                            activeOpacity={0.8}
                            style={styles.quickAddButton}
                            onPress={() => addWater(ML_PER_GLASS)}
                        >
                            <Plus size={16} color={colors.primary} strokeWidth={2.4} />
                            <Text style={styles.quickAddText}>{ML_PER_GLASS}ml Glass</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            activeOpacity={0.8}
                            style={styles.quickAddButton}
                            onPress={() => addWater(ML_PER_GLASS * 2)}
                        >
                            <Plus size={16} color={colors.primary} strokeWidth={2.4} />
                            <Text style={styles.quickAddText}>{ML_PER_GLASS * 2}ml Bottle</Text>
                        </TouchableOpacity>
                    </View>
                    ) : null}

                    {hasHydrationForDay && !canLogWater ? (
                        <Text style={styles.hydrationLockedText}>
                            Water can only be logged on the day you drink it.
                        </Text>
                    ) : null}
                </View>

                {/* Today's meals */}
                <View style={styles.mealsSection}>
                    <View style={styles.mealsHeaderRow}>
                        <Text style={styles.sectionTitle}>
                            {isToday ? "Today's Meals" : 'Planned Meals'}
                        </Text>
                        <Text style={styles.mealsHeaderKcal}>
                            {dayCards.length} {dayCards.length === 1 ? 'meal' : 'meals'}
                        </Text>
                    </View>

                    {!hasLogsForDay ? (
                        <MealSkeleton rows={Math.max(dayMeals.length, 2)} />
                    ) : dayCards.length === 0 ? (
                        <View style={styles.mealEmptyCard}>
                            <Text style={styles.mealEmptyTitle}>No meals planned</Text>
                            <Text style={styles.mealEmptySubtitle}>
                                Tap "Create Meal Plan" to add one. Plans repeat on the days you
                                pick, so they show up here automatically.
                            </Text>
                        </View>
                    ) : (
                        dayCards.map((card) => {
                            const { isLogged, items: shownItems, time: shownTime } = card;
                            // Summed from the items rather than stored,
                            // so it always matches what is listed above
                            // it — including after a per-day edit.
                            const nutrition = sumItemNutrition(shownItems);
                            const isEstimating = estimatingIds.includes(card.planId);
                            return (
                            <View key={card.planId} style={styles.mealCard}>
                                <View style={styles.mealTopRow}>
                                    <View style={styles.mealThumbnail}>
                                        <UtensilsCrossed
                                            size={22}
                                            color={colors.secondary}
                                            strokeWidth={1.8}
                                        />
                                    </View>
                                    <View style={styles.mealInfo}>
                                        <View style={styles.mealTitleRow}>
                                            <Text style={styles.mealName} numberOfLines={1}>
                                                {card.name}
                                            </Text>
                                            {isLogged ? (
                                                <View style={styles.mealLoggedPill}>
                                                    <CheckCircle
                                                        size={11}
                                                        color={colors.success}
                                                        strokeWidth={2.6}
                                                    />
                                                    <Text style={styles.mealLoggedText}>
                                                        {shownTime}
                                                    </Text>
                                                </View>
                                            ) : (
                                                <View style={styles.mealStatusPillUpcoming}>
                                                    <Clock
                                                        size={11}
                                                        color={colors.secondary}
                                                        strokeWidth={2.4}
                                                    />
                                                    <Text style={styles.mealStatusTextUpcoming}>
                                                        {shownTime}
                                                    </Text>
                                                </View>
                                            )}
                                        </View>
                                        <Text style={styles.mealDescription} numberOfLines={2}>
                                            {describeItems(shownItems)}
                                        </Text>
                                        <Text style={styles.mealCalories}>
                                            {MEAL_TYPE_LABEL[card.mealType]} · {shownItems.length}{' '}
                                            {shownItems.length === 1 ? 'item' : 'items'}
                                        </Text>
                                    </View>
                                </View>

                                {isEstimating ? (
                                    <Text style={styles.macroPending}>Estimating nutrition…</Text>
                                ) : nutrition ? (
                                    <View style={styles.mealMacroRow}>
                                        <View style={styles.macroKcal}>
                                            <Text style={styles.macroKcalValue}>
                                                {nutrition.calories}
                                            </Text>
                                            <Text style={styles.macroKcalUnit}>kcal</Text>
                                        </View>
                                        {(
                                            [
                                                ['P', nutrition.protein, colors.protein],
                                                ['C', nutrition.carbs, colors.carbs],
                                                ['F', nutrition.fat, colors.fats],
                                            ] as const
                                        ).map(([label, grams, tone]) => (
                                            <View key={label} style={styles.macroChip}>
                                                <Text style={[styles.macroChipLabel, { color: tone }]}>
                                                    {label}
                                                </Text>
                                                <Text style={styles.macroChipValue}>{grams}g</Text>
                                            </View>
                                        ))}
                                        {/* A rough estimate should not look
                                            like a measured figure. */}
                                        {nutrition.estimated < nutrition.total ? (
                                            <Text style={styles.macroRough}>
                                                {nutrition.estimated}/{nutrition.total} items
                                            </Text>
                                        ) : nutrition.confidence < 0.6 ? (
                                            <Text style={styles.macroRough}>approx</Text>
                                        ) : null}
                                    </View>
                                ) : null}

                                <View style={styles.mealActionRow}>
                                    {isLogged ? (
                                        // Nothing to edit once it is
                                        // logged — the meal is settled.
                                        <View style={styles.mealDoneChip}>
                                            <Check
                                                size={13}
                                                color={colors.success}
                                                strokeWidth={3}
                                            />
                                            <Text style={styles.mealDoneText}>Logged</Text>
                                        </View>
                                    ) : (
                                        <>
                                        <TouchableOpacity
                                            activeOpacity={0.85}
                                            disabled={!card.plan || loggingPlanId === card.planId}
                                            onPress={() => card.plan && handleLogMeal(card.plan)}
                                            style={[
                                                styles.mealLogButton,
                                                (!card.plan || loggingPlanId === card.planId) &&
                                                    styles.mealLogButtonBusy,
                                            ]}
                                        >
                                            <Check
                                                size={14}
                                                color={colors.white}
                                                strokeWidth={3}
                                            />
                                            <Text style={styles.mealLogText}>
                                                {loggingPlanId === card.planId
                                                    ? 'Saving…'
                                                    : 'Log Meal'}
                                            </Text>
                                        </TouchableOpacity>

                                        {/* Adjust what you actually ate
                                            before committing it. */}
                                        <TouchableOpacity
                                            activeOpacity={0.8}
                                            disabled={!card.plan}
                                            onPress={() => card.plan && setEditingLog(card.plan)}
                                            style={[
                                                styles.mealEditButton,
                                                !card.plan && styles.mealLogButtonBusy,
                                            ]}
                                        >
                                            <SquarePen
                                                size={13}
                                                color={colors.secondary}
                                                strokeWidth={2.4}
                                            />
                                            <Text style={styles.mealEditText}>Edit</Text>
                                        </TouchableOpacity>
                                        </>
                                    )}
                                </View>
                            </View>
                            );
                        })
                    )}
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
    subNavRow: {
        paddingHorizontal: spacing.screenHorizontalPadding,
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
        marginHorizontal: spacing.screenHorizontalPadding,
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
        fontSize: 23,
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
        paddingHorizontal: 9,
        paddingVertical: 8,
    },
    summaryLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        // Shrinks so a long label truncates rather than pushing the
        // value out of the row.
        flexShrink: 1,
        marginRight: 6,
    },
    summaryDot: {
        width: 7,
        height: 7,
        borderRadius: 3.5,
    },
    summaryLabel: {
        fontSize: 11.5,
        fontWeight: '600',
        color: colors.textSecondary,
        flexShrink: 1,
    },
    summaryValue: {
        fontSize: 12,
        fontWeight: '800',
        color: colors.textPrimary,
        // The figure is the point of the row — it keeps its full width
        // and the label absorbs the squeeze.
        flexShrink: 0,
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
    dateStripWrapper: {
        paddingHorizontal: spacing.screenHorizontalPadding,
    },
    card: {
        marginHorizontal: spacing.screenHorizontalPadding,
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
    hydrationSkeletonIndex: { marginTop: 6 },
    hydrationSkeletonButton: { flex: 1 },
    hydrationEmptyText: {
        marginTop: 14,
        fontSize: 12.5,
        color: colors.textSecondary,
    },
    hydrationLockedText: {
        marginTop: 14,
        fontSize: 11.5,
        color: colors.textMuted,
    },
    waterLogList: {
        gap: 6,
        marginTop: 14,
        paddingTop: 12,
        borderTopWidth: 1,
        borderTopColor: colors.border,
    },
    waterLogRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingVertical: 7,
        paddingHorizontal: 10,
        borderRadius: 12,
        backgroundColor: colors.surfaceLow,
    },
    waterLogMl: { fontSize: 12.5, fontWeight: '800', color: colors.textPrimary },
    // Pushed to the right of the row, leaving the delete button at the end.
    waterLogTime: { flex: 1, fontSize: 11.5, color: colors.textSecondary },
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
        marginHorizontal: spacing.screenHorizontalPadding,
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
    mealLoggedPill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 10,
        backgroundColor: withOpacity(colors.success, 0.14),
    },
    mealLoggedText: { fontSize: 10, fontWeight: '800', color: colors.success },
    macroPending: {
        marginTop: 12,
        fontSize: 11.5,
        fontWeight: '600',
        color: colors.textSecondary,
    },
    mealMacroRow: {
        flexDirection: 'row',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 6,
        marginTop: 12,
        paddingTop: 12,
        borderTopWidth: 1,
        borderTopColor: colors.border,
    },
    macroKcal: {
        flexDirection: 'row',
        alignItems: 'baseline',
        gap: 3,
        paddingHorizontal: 9,
        paddingVertical: 5,
        borderRadius: 10,
        backgroundColor: withOpacity(colors.secondary, 0.14),
    },
    macroKcalValue: { fontSize: 13, fontWeight: '800', color: colors.secondary },
    macroKcalUnit: { fontSize: 9.5, fontWeight: '700', color: colors.secondary },
    macroChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 9,
        paddingVertical: 5,
        borderRadius: 10,
        backgroundColor: colors.surfaceLow,
    },
    macroChipLabel: { fontSize: 10, fontWeight: '800' },
    macroChipValue: { fontSize: 11.5, fontWeight: '700', color: colors.textPrimary },
    macroRough: {
        fontSize: 9.5,
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 0.4,
        color: colors.textMuted,
    },
    mealActionRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginTop: 12,
    },
    mealLogButton: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingVertical: 10,
        borderRadius: 14,
        backgroundColor: colors.secondary,
    },
    mealLogButtonBusy: { opacity: 0.6 },
    mealLogText: { fontSize: 13, fontWeight: '800', color: colors.white },
    mealDoneChip: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingVertical: 10,
        borderRadius: 14,
        backgroundColor: withOpacity(colors.success, 0.14),
    },
    mealDoneText: { fontSize: 13, fontWeight: '800', color: colors.success },
    mealEditButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: 14,
        backgroundColor: withOpacity(colors.secondary, 0.14),
    },
    mealEditText: { fontSize: 13, fontWeight: '800', color: colors.secondary },
    mealEmptyCard: {
        padding: 16,
        borderRadius: 18,
        backgroundColor: colors.surfaceLow,
        gap: 5,
    },
    mealEmptyTitle: {
        fontSize: 14,
        fontWeight: '800',
        color: colors.textPrimary,
    },
    mealEmptySubtitle: {
        fontSize: 12.5,
        lineHeight: 18,
        color: colors.textSecondary,
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
