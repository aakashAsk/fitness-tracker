import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    Alert,
    ScrollView,
    View,
    Text,
    TextInput,
    TouchableOpacity,
    StyleSheet,
} from 'react-native';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Stop } from 'react-native-svg';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';
import {
    ChevronDown,
    Dumbbell,
    EllipsisVertical,
    Flame,
    Plus,
    PersonStanding,
    Rows3,
    RotateCcw,
    SlidersHorizontal,
    Timer,
    TrendingUp,
} from 'lucide-react-native';
import { colors, withOpacity } from '../../Theme/colors';
import { spacing } from '../../Theme/spacing';
import NewPlanModal, { NewPlanPayload } from './NewPlanModal';
import WorkoutDateStrip from './WorkoutDateStrip';
import { createWorkoutPlan, WorkoutPlanServiceError } from '../../Services/workoutPlanService';
import {
    fetchExerciseLogLookup,
    savedEntryKey,
    saveWorkoutLog,
    toDateKey,
    WorkoutLogServiceError,
} from '../../Services/workoutLogService';
import { getEventsForDate } from '../../Services/calendarEventService';
import { Exercise, fetchExercisesBulk } from '../../Services/exerciseService';
import { useWorkoutPlans } from '../../Store/workoutPlansSlice';

// Live version of the Workout tab: the exercise list below the date
// strip is now the real workout plan(s) scheduled on whichever weekday
// is selected, for the signed-in user (via calendarEventService, the
// same day-matching logic the Schedule tab used, over the live
// Firestore-synced plans in workoutPlansSlice). A plan created here via
// "Add Workout Plan" shows up automatically once its `days` include the
// selected date's weekday — no local optimistic state needed.
//
// Plans only ever stored `exerciseIds`, never sets/reps/weight per
// exercise, so those numbers below are still invented placeholders
// layered on top of the real exercise names (resolved via the same
// exercise API bulk lookup Schedule.tsx used) — there is no real
// set-tracking data model yet.

// exerciseIds are the Free Exercise DB slug ids (e.g. "3_4_Sit-Up"). Used
// as a placeholder label for an id the bulk fetch hasn't resolved yet.
function humanizeExerciseId(id: string): string {
    return id.replace(/_/g, ' ');
}

// Key for the sets/reps/weight fields. Scoped by date as well as by row,
// since a row id is only plan+exercise — the same exercise on a plan
// that recurs twice a week is the same row id on both days, and each day
// needs its own numbers.
function inputKey(dateKey: string, rowId: string): string {
    return `${dateKey}::${rowId}`;
}

const FILTERS = ['All', 'Push', 'Pull', 'Legs', 'Cardio', 'Core'];

interface PlanExerciseRow {
    // Row key (`${event.id}-${exerciseId}`) — unique across cards, used
    // for React keys and the expand/collapse accordion state.
    id: string;
    // The raw Free Exercise DB id, undecorated — what actually gets saved.
    exerciseId: string;
    name: string;
    // e.g. "Chest • Barbell" — primary muscle + equipment, when the
    // exercise API has resolved this id; blank while it's still loading.
    meta: string;
    Icon: typeof PersonStanding;
    iconColor: string;
    iconBg: string;
}

interface PlanCard {
    // Synthetic calendar-event id — fine for React keys, but not what
    // gets saved (see planDocId).
    id: string;
    // The real WorkoutPlan Firestore doc id (CalendarEvent.sourceId) —
    // what a saved log is actually associated with.
    planDocId: string;
    title: string;
    exercises: PlanExerciseRow[];
}

// Cosmetic-only icon/color cycled across a plan's exercises — there is
// no real per-exercise weight/reps in the data model (see note above),
// so each row just shows an empty weight/reps input with a placeholder.
const EXERCISE_ICON_STYLES: { Icon: typeof PersonStanding; iconColor: string }[] = [
    { Icon: Dumbbell, iconColor: colors.primary },
    { Icon: PersonStanding, iconColor: colors.fats },
    { Icon: Rows3, iconColor: colors.secondary },
];

// How much room to leave above a focused input row once it has been
// scrolled into view, so the exercise name above it stays visible.
const FOCUS_SCROLL_MARGIN = 90;

// Chart geometry for the 1RM trend line (matches the reference SVG viewBox).
const CHART_WIDTH = 320;
const CHART_HEIGHT = 85;
const CHART_POINTS = [
    { x: 10, y: 70 },
    { x: 70, y: 63 },
    { x: 130, y: 52 },
    { x: 190, y: 42 },
    { x: 250, y: 27 },
    { x: 310, y: 10 },
];

export const WorkoutSession: React.FC = () => {
    const [selectedDate, setSelectedDate] = useState(() => new Date());
    const [activeFilter, setActiveFilter] = useState('Push');
    const [showNewPlanModal, setShowNewPlanModal] = useState(false);
    const [isSavingPlan, setIsSavingPlan] = useState(false);
    // Per-exercise sets/reps/weight fields, keyed by DATE + exercise row
    // id (see inputKey below). The date has to be part of the key: a row
    // id is plan+exercise only, so without it Monday's numbers would
    // still be sitting in the fields when you flip to Thursday.
    const [exerciseInputs, setExerciseInputs] = useState<
        Record<string, { sets: string; weight: string; reps: string }>
    >({});
    // Accordion — only one exercise row's sets/reps/weight fields are
    // expanded at a time; opening another closes whichever was open.
    const [expandedExerciseId, setExpandedExerciseId] = useState<string | null>(null);
    const toggleExerciseExpanded = (exerciseId: string) => {
        setExpandedExerciseId((prev) => (prev === exerciseId ? null : exerciseId));
    };
    // Scrolling a focused input clear of the numpad. RN gives no
    // "scroll to focused input" out of the box, and measureLayout()
    // against a ScrollView throws on this RN/Expo version (same reason
    // ScheduleScreen measures via onLayout), so positions are tracked
    // with onLayout at each nesting level and summed: card within the
    // scroll content + list within the card + row within the list.
    const scrollRef = useRef<ScrollView>(null);
    const cardOffsets = useRef<Record<string, number>>({});
    const listOffsets = useRef<Record<string, number>>({});
    const rowOffsets = useRef<Record<string, number>>({});

    const handleInputFocus = (planId: string, rowId: string) => {
        const y =
            (cardOffsets.current[planId] ?? 0) +
            (listOffsets.current[planId] ?? 0) +
            (rowOffsets.current[rowId] ?? 0);

        // Park the row near the top of the viewport rather than trying to
        // work out where the keyboard's top edge is — that way it's clear
        // of the numpad regardless of keyboard height. The delay lets
        // Android finish resizing the window first, otherwise the target
        // offset gets clamped against the pre-resize scroll height.
        setTimeout(() => {
            scrollRef.current?.scrollTo({ y: Math.max(y - FOCUS_SCROLL_MARGIN, 0), animated: true });
        }, 120);
    };

    // Live-synced plans (App.tsx's useWorkoutPlansSync() keeps this fed
    // from Firestore) → whichever of them are scheduled on selectedDate's
    // weekday, for the signed-in user. Same day-matching logic the
    // Schedule tab uses.
    const workoutPlans = useWorkoutPlans();
    const dayEvents = useMemo(
        () => getEventsForDate(selectedDate, workoutPlans),
        [selectedDate, workoutPlans],
    );

    // Real exercise names for today's events, resolved via POST
    // /exercises/bulk and cached by id — same pattern as the old
    // Schedule.tsx.
    const [exerciseCache, setExerciseCache] = useState<Record<string, Exercise>>({});
    const todaysExerciseIds = useMemo(() => {
        const ids = new Set<string>();
        dayEvents.forEach((event) => event.exerciseIds.forEach((id) => ids.add(id)));
        return Array.from(ids);
    }, [dayEvents]);

    useEffect(() => {
        const missingIds = todaysExerciseIds.filter((id) => !exerciseCache[id]);
        if (missingIds.length === 0) return;

        let cancelled = false;
        fetchExercisesBulk(missingIds)
            .then((exercises) => {
                if (cancelled) return;
                setExerciseCache((prev) => {
                    const next = { ...prev };
                    exercises.forEach((ex) => {
                        next[ex.id] = ex;
                    });
                    return next;
                });
            })
            .catch(() => {});

        return () => {
            cancelled = true;
        };
    }, [todaysExerciseIds, exerciseCache]);

    // One card per scheduled plan (event) for the selected day, each
    // listing its real exercises — icon/color just cycles cosmetically,
    // since there's nothing in the data model to derive it from.
    const planCards: PlanCard[] = useMemo(() => {
        let index = 0;
        return dayEvents.map((event) => ({
            id: event.id,
            planDocId: event.sourceId,
            title: event.title,
            exercises: event.exerciseIds.map((id) => {
                const details = exerciseCache[id];
                const style = EXERCISE_ICON_STYLES[index % EXERCISE_ICON_STYLES.length];
                index += 1;
                const meta = details
                    ? [details.primaryMuscles[0], details.equipment].filter(Boolean).join(' • ')
                    : '';
                return {
                    id: `${event.id}-${id}`,
                    exerciseId: id,
                    name: details?.name ?? humanizeExerciseId(id),
                    meta,
                    Icon: style.Icon,
                    iconColor: style.iconColor,
                    iconBg: withOpacity(style.iconColor, 0.16),
                };
            }),
        }));
    }, [dayEvents, exerciseCache]);

    const totalExerciseCount = planCards.reduce((sum, plan) => sum + plan.exercises.length, 0);
    const hasWorkoutToday = planCards.length > 0;

    // Auto-open the first exercise whenever the selected day changes, or
    // its plans first load in — keyed on selectedDate + how many events
    // that day has (not planCards itself), so a background exercise-name
    // resolve (which changes planCards but not the day or its plan
    // count) doesn't re-force this open after the user has closed it.
    useEffect(() => {
        setExpandedExerciseId(planCards[0]?.exercises[0]?.id ?? null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedDate, dayEvents.length]);

    // Which plans already have a saved log for the selected day — drives
    // the "Logged" badge, so it's clear whether the numbers on screen are
    // that day's actual record or just carried forward from an earlier
    // session.
    const [loggedPlanIds, setLoggedPlanIds] = useState<Set<string>>(new Set());

    // Fills in each exercise's sets/reps/weight for the selected day, in
    // priority order:
    //   1. What was actually saved FOR THAT DAY — so reopening a logged
    //      day shows exactly what was logged, not another day's numbers.
    //   2. Otherwise, the nearest session that logged THAT EXERCISE
    //      anywhere in the user's history, under any plan — the most
    //      recent earlier one, or the closest later one when there is no
    //      earlier one (backfilling a day you skipped). An exercise
    //      sitting in several plans (bench press in both a Monday push
    //      day and a Thursday upper-body day) carries forward either
    //      way, so you only re-type what actually changed.
    //
    // Matching is strictly by `exerciseId`, never by name or list
    // position, so numbers can never land on the wrong exercise — and
    // only still-empty fields are filled, so nothing already typed gets
    // overwritten.
    const todaysExerciseIdsKey = todaysExerciseIds.join(',');
    useEffect(() => {
        if (!todaysExerciseIdsKey) return;
        let cancelled = false;
        const dateKey = toDateKey(selectedDate);

        fetchExerciseLogLookup(todaysExerciseIds, dateKey)
            .then(({ savedForDate, nearest }) => {
                if (cancelled) return;

                setLoggedPlanIds(
                    new Set(
                        planCards
                            .filter((plan) =>
                                plan.exercises.some(
                                    (exercise) =>
                                        savedForDate[savedEntryKey(plan.planDocId, exercise.exerciseId)],
                                ),
                            )
                            .map((plan) => plan.id),
                    ),
                );

                setExerciseInputs((prev) => {
                    const next = { ...prev };
                    let changed = false;

                    planCards.forEach((plan) => {
                        plan.exercises.forEach((exercise) => {
                            const key = inputKey(dateKey, exercise.id);
                            const existing = prev[key];
                            const isEmpty =
                                !existing || (!existing.sets && !existing.reps && !existing.weight);
                            if (!isEmpty) return;

                            const match =
                                savedForDate[savedEntryKey(plan.planDocId, exercise.exerciseId)] ??
                                nearest[exercise.exerciseId];
                            if (!match) return;

                            next[key] = {
                                sets: match.sets ? String(match.sets) : '',
                                reps: match.reps ? String(match.reps) : '',
                                weight: match.weight ? String(match.weight) : '',
                            };
                            changed = true;
                        });
                    });

                    return changed ? next : prev;
                });
            })
            .catch(() => {});

        return () => {
            cancelled = true;
        };
        // planCards is intentionally omitted — which exercises are on the
        // selected day is what should re-trigger this, not every reference
        // change from an in-flight exercise-name resolve.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [todaysExerciseIdsKey, selectedDate]);

    const setExerciseInput = (rowId: string, field: 'sets' | 'weight' | 'reps', value: string) => {
        const key = inputKey(toDateKey(selectedDate), rowId);
        setExerciseInputs((prev) => ({
            ...prev,
            [key]: {
                sets: prev[key]?.sets ?? '',
                weight: prev[key]?.weight ?? '',
                reps: prev[key]?.reps ?? '',
                [field]: value,
            },
        }));
    };

    // Which plan's Save button is currently mid-request (disables that
    // card's button only, not every card's).
    const [savingPlanId, setSavingPlanId] = useState<string | null>(null);

    // Persists one plan card's entered numbers as a single log document
    // for (user, plan, selected day) — see workoutLogService for the
    // data-shape reasoning. Every exercise in the card is saved even if
    // its fields were left blank (blank -> 0), so the log always reflects
    // the plan's full exercise list for that day.
    const handleSaveWorkout = async (plan: PlanCard) => {
        const dateKey = toDateKey(selectedDate);
        setSavingPlanId(plan.id);
        try {
            await saveWorkoutLog({
                planId: plan.planDocId,
                planName: plan.title,
                date: dateKey,
                exercises: plan.exercises.map((exercise) => {
                    const input = exerciseInputs[inputKey(dateKey, exercise.id)];
                    return {
                        exerciseId: exercise.exerciseId,
                        name: exercise.name,
                        sets: parseInt(input?.sets ?? '', 10) || 0,
                        reps: parseInt(input?.reps ?? '', 10) || 0,
                        weight: parseFloat(input?.weight ?? '') || 0,
                    };
                }),
            });
            const wasAlreadyLogged = loggedPlanIds.has(plan.id);
            setLoggedPlanIds((prev) => new Set(prev).add(plan.id));
            Alert.alert(
                wasAlreadyLogged ? 'Updated' : 'Saved',
                `${plan.title} logged for ${dateKey}.`,
            );
        } catch (error) {
            Alert.alert(
                'Could not save workout',
                error instanceof WorkoutLogServiceError
                    ? error.message
                    : 'Something went wrong. Please try again.',
            );
        } finally {
            setSavingPlanId(null);
        }
    };

    // Saves the plan to Firestore (workoutPlanService — the same
    // collection/service the old plan-builder used). No local optimistic
    // update needed — dayEvents above is derived live from the same
    // Firestore-synced plans list, so a plan scheduled on the selected
    // day's weekday appears here automatically once the write lands.
    const savePlan = async (payload: NewPlanPayload, status: 'live' | 'draft') => {
        setIsSavingPlan(true);
        try {
            await createWorkoutPlan({
                name: payload.name,
                muscles: payload.muscles,
                exerciseIds: payload.exerciseIds,
                days: payload.days,
                time: payload.time,
                status,
            });
            setShowNewPlanModal(false);
        } catch (error) {
            Alert.alert(
                'Could not save workout plan',
                error instanceof WorkoutPlanServiceError
                    ? error.message
                    : 'Something went wrong. Please try again.',
            );
        } finally {
            setIsSavingPlan(false);
        }
    };

    const handleCreatePlan = (payload: NewPlanPayload) => savePlan(payload, 'live');
    const handleSaveDraft = (payload: NewPlanPayload) => savePlan(payload, 'draft');

    return (
        <View style={styles.root}>
        <ScrollView
            ref={scrollRef}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
        >
            {/* Header */}
            <View style={styles.headerRow}>
                <View style={styles.headerTextBlock}>
                    <View style={styles.headerTitleRow}>
                        <Text style={styles.headerTitle}>
                            {hasWorkoutToday ? dayEvents[0].title : 'Rest Day'}
                        </Text>
                        <Flame size={18} color={colors.secondary} strokeWidth={2.4} />
                    </View>
                    <Text style={styles.headerSubtitle}>
                        {hasWorkoutToday
                            ? dayEvents[0].muscles.length > 0
                                ? `Targeting ${dayEvents[0].muscles.join(', ')}`
                                : `${totalExerciseCount} exercises scheduled`
                            : 'No workout scheduled for this day'}
                    </Text>
                </View>
                <TouchableOpacity activeOpacity={0.7} style={styles.historyButton}>
                    <RotateCcw size={14} color={colors.primary} strokeWidth={2.4} />
                    <Text style={styles.historyButtonText}>Log History</Text>
                </TouchableOpacity>
            </View>

            {/* Filter chips */}
            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.filterRow}
            >
                {FILTERS.map((filter) => {
                    const active = filter === activeFilter;
                    return (
                        <TouchableOpacity
                            key={filter}
                            activeOpacity={0.85}
                            onPress={() => setActiveFilter(filter)}
                            style={[styles.filterChip, active && styles.filterChipActive]}
                        >
                            <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                                {filter}
                            </Text>
                        </TouchableOpacity>
                    );
                })}
            </ScrollView>

            {/* 1RM trend card */}
            <View style={styles.card}>
                <View style={styles.trendHeaderRow}>
                    <View>
                        <View style={styles.trendTitleRow}>
                            <TrendingUp size={16} color={colors.primary} strokeWidth={2.4} />
                            <Text style={styles.trendTitle}>
                                {planCards[0]?.exercises[0]
                                    ? `${planCards[0].exercises[0].name} 1RM Trend`
                                    : '1RM Trend'}
                            </Text>
                        </View>
                        <View style={styles.trendStatRow}>
                            <Text style={styles.trendValue}>85</Text>
                            <Text style={styles.trendUnit}>kg</Text>
                            <View style={styles.prBadge}>
                                <Text style={styles.prBadgeText}>+5 kg PR</Text>
                            </View>
                        </View>
                    </View>
                    <View style={styles.runsPill}>
                        <Text style={styles.runsPillText}>Last 6 Runs</Text>
                    </View>
                </View>

                <Svg
                    width="100%"
                    height={110}
                    viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
                    style={styles.chart}
                >
                    <Defs>
                        <LinearGradient id="areaGradient" x1="0" y1="0" x2="0" y2={CHART_HEIGHT}>
                            <Stop offset="0%" stopColor={colors.primary} stopOpacity={0.25} />
                            <Stop offset="100%" stopColor={colors.primary} stopOpacity={0} />
                        </LinearGradient>
                    </Defs>

                    <Line x1={0} y1={20} x2={CHART_WIDTH} y2={20} stroke={colors.surfaceContainer} strokeWidth={1} strokeDasharray="3 3" />
                    <Line x1={0} y1={50} x2={CHART_WIDTH} y2={50} stroke={colors.surfaceContainer} strokeWidth={1} strokeDasharray="3 3" />
                    <Line x1={0} y1={80} x2={CHART_WIDTH} y2={80} stroke={colors.surfaceContainer} strokeWidth={1} />

                    <Path
                        d="M 10 70 C 50 68, 80 58, 120 54 C 160 50, 190 42, 230 32 C 270 24, 290 14, 310 10 L 310 85 L 10 85 Z"
                        fill="url(#areaGradient)"
                    />
                    <Path
                        d="M 10 70 C 50 68, 80 58, 120 54 C 160 50, 190 42, 230 32 C 270 24, 290 14, 310 10"
                        stroke={colors.primary}
                        strokeWidth={3.5}
                        strokeLinecap="round"
                        fill="none"
                    />

                    {CHART_POINTS.slice(0, -1).map((point) => (
                        <Circle
                            key={point.x}
                            cx={point.x}
                            cy={point.y}
                            r={3.5}
                            fill={colors.white}
                            stroke={colors.primary}
                            strokeWidth={2.5}
                        />
                    ))}
                    <Circle
                        cx={CHART_POINTS[CHART_POINTS.length - 1].x}
                        cy={CHART_POINTS[CHART_POINTS.length - 1].y}
                        r={5}
                        fill={colors.primary}
                        stroke={colors.white}
                        strokeWidth={2.5}
                    />
                </Svg>

                <View style={styles.chartLabelsRow}>
                    <Text style={styles.chartLabel}>Wk 1</Text>
                    <Text style={styles.chartLabel}>Wk 2</Text>
                    <Text style={styles.chartLabel}>Wk 3</Text>
                    <Text style={styles.chartLabel}>Wk 4</Text>
                    <Text style={styles.chartLabel}>Wk 5</Text>
                    <Text style={styles.chartLabelActive}>Today</Text>
                </View>
            </View>

            {/* Section title */}
            <View style={styles.sectionHeaderRow}>
                <View style={styles.sectionTitleRow}>
                    <Text style={styles.sectionTitle}>Workout Plan</Text>
                    <View style={styles.exerciseCountPill}>
                        <Text style={styles.exerciseCountText}>
                            {totalExerciseCount} Exercises
                        </Text>
                    </View>
                </View>
                <TouchableOpacity activeOpacity={0.7} style={styles.editOrderButton}>
                    <Text style={styles.editOrderText}>Edit Order</Text>
                    <SlidersHorizontal size={13} color={colors.primary} strokeWidth={2.4} />
                </TouchableOpacity>
            </View>

            {/* Date strip */}
            <View style={styles.dateStripWrapper}>
                <WorkoutDateStrip
                    selectedDate={selectedDate}
                    onSelectDate={setSelectedDate}
                    screenHorizontalPadding={spacing.screenHorizontalPadding}
                />
            </View>

            {/* One card per plan scheduled on the selected day: plan name
                + its exercises, each with a weight/reps placeholder field
                (no real per-exercise set data exists yet). */}
            {!hasWorkoutToday ? (
                <View style={styles.card}>
                    <Text style={styles.emptyStateTitle}>No workout scheduled</Text>
                    <Text style={styles.emptyStateSubtitle}>
                        Nothing's planned for this day yet — tap "Add Workout Plan" below to
                        schedule one.
                    </Text>
                </View>
            ) : (
                planCards.map((plan) => (
                    <View
                        key={plan.id}
                        style={styles.card}
                        onLayout={(e) => {
                            cardOffsets.current[plan.id] = e.nativeEvent.layout.y;
                        }}
                    >
                        <View style={styles.planCardHeaderRow}>
                            <View style={styles.planCardHeaderLeft}>
                                <Text style={styles.planCardTitle} numberOfLines={1}>
                                    {plan.title}
                                </Text>
                                <View style={styles.planCardCountPill}>
                                    <Text style={styles.planCardCountText}>
                                        {plan.exercises.length}
                                    </Text>
                                </View>
                                {loggedPlanIds.has(plan.id) ? (
                                    <View style={styles.planCardLoggedPill}>
                                        <Text style={styles.planCardLoggedText}>Logged</Text>
                                    </View>
                                ) : null}
                            </View>
                            <TouchableOpacity activeOpacity={0.7} style={styles.exerciseMoreButton}>
                                <EllipsisVertical size={16} color={colors.textSecondary} strokeWidth={2.2} />
                            </TouchableOpacity>
                        </View>

                        <View
                            style={styles.planExerciseList}
                            onLayout={(e) => {
                                listOffsets.current[plan.id] = e.nativeEvent.layout.y;
                            }}
                        >
                            {plan.exercises.map((exercise, index) => {
                                const input = exerciseInputs[inputKey(toDateKey(selectedDate), exercise.id)];
                                const isLast = index === plan.exercises.length - 1;
                                const isExpanded = expandedExerciseId === exercise.id;
                                return (
                                    <Animated.View
                                        key={exercise.id}
                                        layout={LinearTransition.duration(220)}
                                        onLayout={(e) => {
                                            rowOffsets.current[exercise.id] = e.nativeEvent.layout.y;
                                        }}
                                        style={[styles.planExerciseRow, !isLast && styles.planExerciseRowDivider]}
                                    >
                                        <TouchableOpacity
                                            activeOpacity={0.7}
                                            onPress={() => toggleExerciseExpanded(exercise.id)}
                                            style={styles.planExerciseTopRow}
                                        >
                                            <Text style={styles.planExerciseIndex}>
                                                {String(index + 1).padStart(2, '0')}
                                            </Text>
                                            <View style={[styles.planExerciseIcon, { backgroundColor: exercise.iconBg }]}>
                                                <exercise.Icon size={18} color={exercise.iconColor} strokeWidth={2.2} />
                                            </View>
                                            <View style={styles.planExerciseTextBlock}>
                                                <Text style={styles.planExerciseName} numberOfLines={1}>
                                                    {exercise.name}
                                                </Text>
                                                <Text style={styles.planExerciseMeta} numberOfLines={1}>
                                                    {exercise.meta || 'Loading details…'}
                                                </Text>
                                            </View>
                                            <View
                                                style={[
                                                    styles.planExerciseChevron,
                                                    isExpanded && styles.planExerciseChevronExpanded,
                                                ]}
                                            >
                                                <ChevronDown size={16} color={colors.textSecondary} strokeWidth={2.4} />
                                            </View>
                                        </TouchableOpacity>

                                        {isExpanded ? (
                                            <Animated.View
                                                entering={FadeIn.duration(160)}
                                                exiting={FadeOut.duration(120)}
                                                style={styles.planExerciseInputRow}
                                            >
                                                <View style={styles.planInputField}>
                                                    <TextInput
                                                        style={styles.planInput}
                                                        value={input?.sets ?? ''}
                                                        onChangeText={(text) => setExerciseInput(exercise.id, 'sets', text)}
                                                        onFocus={() => handleInputFocus(plan.id, exercise.id)}
                                                        placeholder="—"
                                                        placeholderTextColor={colors.textMuted}
                                                        keyboardType="number-pad"
                                                    />
                                                    <Text style={styles.planInputUnit}>sets</Text>
                                                </View>
                                                <Text style={styles.setInputSeparator}>×</Text>
                                                <View style={styles.planInputField}>
                                                    <TextInput
                                                        style={styles.planInput}
                                                        value={input?.reps ?? ''}
                                                        onChangeText={(text) => setExerciseInput(exercise.id, 'reps', text)}
                                                        onFocus={() => handleInputFocus(plan.id, exercise.id)}
                                                        placeholder="—"
                                                        placeholderTextColor={colors.textMuted}
                                                        keyboardType="number-pad"
                                                    />
                                                    <Text style={styles.planInputUnit}>reps</Text>
                                                </View>
                                                <Text style={styles.setInputSeparator}>@</Text>
                                                <View style={styles.planInputField}>
                                                    <TextInput
                                                        style={styles.planInput}
                                                        value={input?.weight ?? ''}
                                                        onChangeText={(text) => setExerciseInput(exercise.id, 'weight', text)}
                                                        onFocus={() => handleInputFocus(plan.id, exercise.id)}
                                                        placeholder="—"
                                                        placeholderTextColor={colors.textMuted}
                                                        keyboardType="decimal-pad"
                                                    />
                                                    <Text style={styles.planInputUnit}>kg</Text>
                                                </View>
                                            </Animated.View>
                                        ) : null}
                                    </Animated.View>
                                );
                            })}
                        </View>

                        <TouchableOpacity
                            activeOpacity={0.85}
                            disabled={savingPlanId === plan.id}
                            onPress={() => handleSaveWorkout(plan)}
                            style={[
                                styles.saveWorkoutButton,
                                savingPlanId === plan.id && styles.submitButtonDisabled,
                            ]}
                        >
                            <Text style={styles.saveWorkoutButtonText}>
                                {savingPlanId === plan.id
                                    ? 'Saving…'
                                    : loggedPlanIds.has(plan.id)
                                      ? 'Update Log'
                                      : 'Save Log'}
                            </Text>
                        </TouchableOpacity>
                    </View>
                ))
            )}

            {/* Rest timer widget */}
            {hasWorkoutToday ? (
            <View style={styles.restTimerCard}>
                <View style={styles.restTimerLeft}>
                    <View style={styles.restTimerIcon}>
                        <Timer size={20} color={colors.secondary} strokeWidth={2.2} />
                    </View>
                    <View>
                        <Text style={styles.restTimerTitle}>Automated Rest Timer</Text>
                        <Text style={styles.restTimerSubtitle}>
                            Auto-starts when a set is checked (90s)
                        </Text>
                    </View>
                </View>
                <View style={styles.restTimerPill}>
                    <Text style={styles.restTimerPillText}>90s</Text>
                </View>
            </View>
            ) : null}

            <View style={styles.fabSpacer} />
        </ScrollView>

        <TouchableOpacity
            activeOpacity={0.85}
            style={styles.fab}
            disabled={isSavingPlan}
            onPress={() => setShowNewPlanModal(true)}
        >
            <Plus size={20} color={colors.white} strokeWidth={2.6} />
            <Text style={styles.fabText}>Add Workout Plan</Text>
        </TouchableOpacity>

        {showNewPlanModal ? (
            <NewPlanModal
                onClose={() => setShowNewPlanModal(false)}
                onCreate={handleCreatePlan}
                onSaveDraft={handleSaveDraft}
            />
        ) : null}
        </View>
    );
};

const styles = StyleSheet.create({
    root: {
        flex: 1,
    },
    scrollContent: {
        paddingBottom: 32,
        gap: 16,
    },
    fab: {
        position: 'absolute',
        right: spacing.screenHorizontalPadding,
        bottom: 8,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        backgroundColor: colors.secondary,
        paddingHorizontal: 20,
        paddingVertical: 15,
        borderRadius: 28,
        shadowColor: colors.secondary,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.35,
        shadowRadius: 16,
        elevation: 6,
    },
    fabText: {
        fontSize: 13.5,
        fontWeight: '800',
        color: colors.white,
    },
    headerRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        paddingHorizontal: spacing.screenHorizontalPadding,
    },
    headerTextBlock: {
        flexShrink: 1,
    },
    headerTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    headerTitle: {
        fontSize: 20,
        fontWeight: '800',
        color: colors.textPrimary,
        letterSpacing: -0.3,
    },
    headerSubtitle: {
        fontSize: 12,
        fontWeight: '500',
        color: colors.textSecondary,
        marginTop: 2,
    },
    historyButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        backgroundColor: colors.surfaceContainer,
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 20,
    },
    historyButtonText: {
        fontSize: 12,
        fontWeight: '700',
        color: colors.textPrimary,
    },
    dateStripWrapper: {
         paddingHorizontal: spacing.screenHorizontalPadding,
    },
    filterRow: {
        gap: 8,
        paddingVertical: 2,
        paddingHorizontal: spacing.screenHorizontalPadding,
    },
    filterChip: {
        paddingHorizontal: 16,
        paddingVertical: 9,
        borderRadius: 20,
        backgroundColor: colors.surface,
        shadowColor: colors.black,
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
        elevation: 1,
    },
    filterChipActive: {
        backgroundColor: colors.primary,
        shadowColor: colors.primary,
        shadowOpacity: 0.25,
        shadowRadius: 8,
    },
    filterChipText: {
        fontSize: 13,
        fontWeight: '600',
        color: colors.textSecondary,
    },
    filterChipTextActive: {
        color: colors.white,
        fontWeight: '700',
    },
    card: {
        backgroundColor: colors.surface,
        borderRadius: 24,
        padding: 16,
        marginHorizontal: spacing.screenHorizontalPadding,
        shadowColor: colors.primary,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.07,
        shadowRadius: 18,
        elevation: 3,
    },
    trendHeaderRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
    },
    trendTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginBottom: 4,
    },
    trendTitle: {
        fontSize: 12.5,
        fontWeight: '700',
        color: colors.textSecondary,
    },
    trendStatRow: {
        flexDirection: 'row',
        alignItems: 'baseline',
        gap: 5,
    },
    trendValue: {
        fontSize: 26,
        fontWeight: '800',
        color: colors.textPrimary,
        letterSpacing: -0.4,
    },
    trendUnit: {
        fontSize: 13,
        fontWeight: '700',
        color: colors.textSecondary,
    },
    prBadge: {
        marginLeft: 4,
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: withOpacity(colors.secondary, 0.14),
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 12,
    },
    prBadgeText: {
        fontSize: 10.5,
        fontWeight: '800',
        color: colors.secondary,
    },
    runsPill: {
        backgroundColor: colors.surfaceContainer,
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 14,
    },
    runsPillText: {
        fontSize: 10.5,
        fontWeight: '700',
        color: colors.textSecondary,
    },
    chart: {
        marginTop: 10,
    },
    chartLabelsRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginTop: 2,
        paddingHorizontal: 2,
    },
    chartLabel: {
        fontSize: 10.5,
        fontWeight: '600',
        color: colors.textSecondary,
    },
    chartLabelActive: {
        fontSize: 10.5,
        fontWeight: '800',
        color: colors.primary,
    },
    sectionHeaderRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: spacing.screenHorizontalPadding,
    },
    sectionTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    sectionTitle: {
        fontSize: 16,
        fontWeight: '800',
        color: colors.textPrimary,
        letterSpacing: -0.2,
    },
    exerciseCountPill: {
        backgroundColor: withOpacity(colors.primary, 0.14),
        paddingHorizontal: 9,
        paddingVertical: 3,
        borderRadius: 12,
    },
    exerciseCountText: {
        fontSize: 10.5,
        fontWeight: '800',
        color: colors.primary,
    },
    editOrderButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    editOrderText: {
        fontSize: 12.5,
        fontWeight: '700',
        color: colors.primary,
    },
    exerciseTitleRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
    },
    exerciseTitleLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        flex: 1,
        minWidth: 0,
    },
    exerciseIcon: {
        width: 48,
        height: 48,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
    },
    exerciseTitleTextBlock: {
        flexShrink: 1,
        minWidth: 0,
    },
    exerciseName: {
        fontSize: 15.5,
        fontWeight: '800',
        color: colors.textPrimary,
        letterSpacing: -0.2,
    },
    exerciseMeta: {
        fontSize: 12,
        fontWeight: '500',
        color: colors.textSecondary,
        marginTop: 2,
    },
    exerciseMoreButton: {
        width: 32,
        height: 32,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
    },
    planCardHeaderRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 12,
    },
    planCardHeaderLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        flexShrink: 1,
    },
    planCardTitle: {
        fontSize: 16.5,
        fontWeight: '800',
        color: colors.textPrimary,
        letterSpacing: -0.2,
        flexShrink: 1,
    },
    planCardCountPill: {
        backgroundColor: withOpacity(colors.primary, 0.14),
        width: 22,
        height: 22,
        borderRadius: 11,
        alignItems: 'center',
        justifyContent: 'center',
    },
    planCardCountText: {
        fontSize: 11,
        fontWeight: '800',
        color: colors.primary,
    },
    planCardLoggedPill: {
        backgroundColor: withOpacity(colors.success, 0.16),
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 10,
    },
    planCardLoggedText: {
        fontSize: 10,
        fontWeight: '800',
        color: colors.success,
        letterSpacing: 0.2,
    },
    planExerciseList: {},
    planExerciseRow: {
        paddingVertical: 12,
        gap: 10,
    },
    planExerciseTopRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    planExerciseRowDivider: {
        borderBottomWidth: 1,
        borderBottomColor: colors.border,

    },
    planExerciseIndex: {
        width: 18,
        fontSize: 11,
        fontWeight: '700',
        color: colors.textMuted,
        fontVariant: ['tabular-nums'],
    },
    planExerciseIcon: {
        width: 34,
        height: 34,
        borderRadius: 11,
        alignItems: 'center',
        justifyContent: 'center',
    },
    planExerciseTextBlock: {
        flex: 1,
        minWidth: 0,
    },
    planExerciseName: {
        fontSize: 13.5,
        fontWeight: '700',
        color: colors.textPrimary,
    },
    planExerciseMeta: {
        fontSize: 11,
        fontWeight: '500',
        color: colors.textSecondary,
        marginTop: 1,
        textTransform: 'capitalize',
    },
    planExerciseChevron: {
        transform: [{ rotate: '0deg' }],
    },
    planExerciseChevronExpanded: {
        transform: [{ rotate: '180deg' }],
    },
    planExerciseInputRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingLeft: 62,
    },
    planInputField: {
        flex: 1,
        alignItems: 'center',
        backgroundColor: colors.surfaceLow,
        borderRadius: 10,
        paddingHorizontal: 10,
        paddingVertical: 6,
        minWidth: 62,
    },
    planInput: {
        alignSelf: 'stretch',
        textAlign: 'center',
        fontSize: 14,
        fontWeight: '800',
        color: colors.textPrimary,
        padding: 0,
    },
    planInputUnit: {
        fontSize: 9,
        fontWeight: '700',
        color: colors.textMuted,
        letterSpacing: 0.3,
        textTransform: 'uppercase',
        marginTop: 1,
    },
    saveWorkoutButton: {
        backgroundColor: colors.primary,
        borderRadius: 16,
        paddingVertical: 13,
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 16,
        shadowColor: colors.primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.25,
        shadowRadius: 10,
        elevation: 3,
    },
    submitButtonDisabled: {
        opacity: 0.5,
        shadowOpacity: 0,
        elevation: 0,
    },
    saveWorkoutButtonText: {
        fontSize: 13.5,
        fontWeight: '800',
        color: colors.white,
    },
    trendBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: colors.surfaceLow,
        borderRadius: 14,
        paddingHorizontal: 12,
        paddingVertical: 9,
        marginTop: 12,
    },
    trendBannerLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        flexShrink: 1,
    },
    trendBannerText: {
        fontSize: 11.5,
        fontWeight: '500',
        color: colors.textSecondary,
    },
    trendBannerStrong: {
        fontWeight: '800',
        color: colors.textPrimary,
    },
    trendBannerTarget: {
        fontSize: 11.5,
        fontWeight: '700',
        color: colors.secondary,
    },
    setHeaderRow: {
        flexDirection: 'row',
        paddingHorizontal: 4,
        marginTop: 14,
        marginBottom: 6,
    },
    setHeaderText: {
        fontSize: 10,
        fontWeight: '700',
        color: colors.textSecondary,
        textAlign: 'center',
    },
    setColSet: {
        width: 32,
    },
    setColPrevious: {
        flex: 1,
    },
    setColWeight: {
        flex: 1.3,
    },
    setColStatus: {
        width: 44,
        alignItems: 'center',
    },
    setList: {
        gap: 6,
    },
    setRow: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.surfaceLow,
        borderRadius: 14,
        paddingVertical: 9,
        paddingHorizontal: 4,
    },
    setRowPending: {
        backgroundColor: withOpacity(colors.secondary, 0.1),
    },
    setNumber: {
        fontSize: 13,
        fontWeight: '800',
        color: colors.textPrimary,
        textAlign: 'center',
    },
    setNumberPending: {
        color: colors.secondary,
    },
    setPreviousText: {
        fontSize: 12,
        fontWeight: '500',
        color: colors.textSecondary,
        textAlign: 'center',
    },
    setWeightText: {
        fontSize: 13,
        fontWeight: '700',
        color: colors.textPrimary,
        textAlign: 'center',
    },
    setInputRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
    },
    setInput: {
        width: 44,
        textAlign: 'center',
        fontSize: 13,
        fontWeight: '800',
        color: colors.textPrimary,
        backgroundColor: colors.surface,
        borderRadius: 8,
        paddingVertical: 5,
    },
    setInputSmall: {
        width: 32,
    },
    setInputSeparator: {
        fontSize: 11,
        color: colors.textSecondary,
    },
    setCheckButton: {
        width: 28,
        height: 28,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.surfaceContainer,
    },
    setCheckButtonDone: {
        backgroundColor: colors.primary,
    },
    addSetButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        backgroundColor: colors.surfaceContainer,
        borderRadius: 16,
        paddingVertical: 11,
        marginTop: 12,
    },
    addSetText: {
        fontSize: 13,
        fontWeight: '700',
        color: colors.primary,
    },
    collapsedExerciseCard: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    collapsedMetaRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginTop: 2,
    },
    metaSeparator: {
        color: colors.textMuted,
        fontSize: 11,
    },
    collapsedMetaStrong: {
        fontSize: 12,
        fontWeight: '700',
        color: colors.textPrimary,
    },
    collapsedRight: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    progressBadge: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: colors.surfaceContainer,
        alignItems: 'center',
        justifyContent: 'center',
    },
    progressBadgeText: {
        fontSize: 11,
        fontWeight: '800',
        color: colors.primary,
    },
    restTimerCard: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: colors.surfaceContainer,
        borderRadius: 24,
        padding: 14,
        marginHorizontal: spacing.screenHorizontalPadding,
    },
    restTimerLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        flexShrink: 1,
    },
    restTimerIcon: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: colors.surface,
        alignItems: 'center',
        justifyContent: 'center',
    },
    restTimerTitle: {
        fontSize: 13,
        fontWeight: '700',
        color: colors.textPrimary,
    },
    restTimerSubtitle: {
        fontSize: 11.5,
        fontWeight: '500',
        color: colors.textSecondary,
        marginTop: 2,
    },
    restTimerPill: {
        backgroundColor: colors.surface,
        paddingHorizontal: 12,
        paddingVertical: 7,
        borderRadius: 14,
        shadowColor: colors.black,
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06,
        shadowRadius: 3,
    },
    restTimerPillText: {
        fontSize: 12,
        fontWeight: '700',
        color: colors.textPrimary,
    },
    fabSpacer: {
        height: 56,
    },
    emptyStateTitle: {
        fontSize: 15.5,
        fontWeight: '800',
        color: colors.textPrimary,
    },
    emptyStateSubtitle: {
        fontSize: 12.5,
        fontWeight: '500',
        color: colors.textSecondary,
        marginTop: 6,
        lineHeight: 18,
    },
});

export default WorkoutSession;
