import React, { useEffect, useMemo, useState } from 'react';
import {
    Alert,
    ScrollView,
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
} from 'react-native';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Stop } from 'react-native-svg';
import Animated, {
    FadeIn,
    FadeOut,
    LinearTransition,
    useAnimatedStyle,
    useSharedValue,
    withRepeat,
    withTiming,
} from 'react-native-reanimated';
import {
    ChevronDown,
    Dumbbell,
    Flame,
    Minus,
    Plus,
    PersonStanding,
    Rows3,
    RotateCcw,
    SlidersHorizontal,
    Timer,
    Trash2,
    TrendingUp,
} from 'lucide-react-native';
import { colors, withOpacity } from '../../Theme/colors';
import { spacing } from '../../Theme/spacing';
import NewPlanModal, { NewPlanPayload } from './NewPlanModal';
import WorkoutDateStrip from './WorkoutDateStrip';
import {
    createWorkoutPlan,
    updateWorkoutPlan,
    WorkoutPlanServiceError,
} from '../../Services/workoutPlanService';
import {
    fetchExerciseLogLookup,
    fetchOccurrencesForDate,
    savedEntryKey,
    savePlannedOccurrence,
    saveWorkoutLog,
    toDateKey,
    todayDateKey,
    WorkoutLogServiceError,
    type WorkoutLog,
} from '../../Services/workoutLogService';
import {
    applyOccurrencesToEvents,
    getEventsForDate,
} from '../../Services/calendarEventService';
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

const EMPTY_SET_INPUT = { reps: '', weight: '' };

// Step sizes for the +/− controls: reps move one at a time, weight in
// 2.5kg jumps (the smallest plate pair on most bars).
const SET_STEPS = { reps: 1, weight: 2.5 } as const;

/** Trims the float noise 2.5-steps produce — 62.5 stays 62.5, 65.0 shows as 65. */
function formatStepValue(value: number): string {
    return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));
}

interface SetStepperProps {
    value: string;
    unit: string;
    onStep: (direction: 1 | -1) => void;
}

// Tap targets rather than a numeric keyboard: mid-workout the keyboard
// is slow to open, covers the row, and is fiddly with sweaty hands —
// nudging a prefilled number up or down is almost always what's wanted.
const SetStepper: React.FC<SetStepperProps> = ({ value, unit, onStep }) => (
    <View style={styles.stepper}>
        <TouchableOpacity
            activeOpacity={0.6}
            onPress={() => onStep(-1)}
            hitSlop={6}
            style={styles.stepperButton}
        >
            <Minus size={14} color={colors.textSecondary} strokeWidth={2.8} />
        </TouchableOpacity>

        <View style={styles.stepperValueBlock}>
            <Text style={styles.stepperValue}>{value === '' ? '—' : value}</Text>
            <Text style={styles.stepperUnit}>{unit}</Text>
        </View>

        <TouchableOpacity
            activeOpacity={0.6}
            onPress={() => onStep(1)}
            hitSlop={6}
            style={styles.stepperButton}
        >
            <Plus size={14} color={colors.primary} strokeWidth={2.8} />
        </TouchableOpacity>
    </View>
);

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

// Placeholder rows shown while a newly selected day resolves its exercise
// names and logged numbers — a pulsing outline reads as "loading" without
// the layout jump of swapping real content in and out.
const ExerciseSkeleton: React.FC<{ rows: number }> = ({ rows }) => {
    const pulse = useSharedValue(0.45);

    useEffect(() => {
        pulse.value = withRepeat(withTiming(1, { duration: 750 }), -1, true);
    }, [pulse]);

    const pulseStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));

    return (
        <View style={styles.skeletonList}>
            {Array.from({ length: rows }).map((_, index) => (
                <Animated.View key={index} style={[styles.skeletonRow, pulseStyle]}>
                    <View style={styles.skeletonIcon} />
                    <View style={styles.skeletonTextBlock}>
                        <View style={styles.skeletonLineWide} />
                        <View style={styles.skeletonLineNarrow} />
                    </View>
                </Animated.View>
            ))}
        </View>
    );
};

export const WorkoutSession: React.FC = () => {
    const [selectedDate, setSelectedDate] = useState(() => new Date());
    const [activeFilter, setActiveFilter] = useState('Push');
    const [showNewPlanModal, setShowNewPlanModal] = useState(false);
    const [isSavingPlan, setIsSavingPlan] = useState(false);
    // Per-exercise set rows, keyed by DATE + exercise row id (see
    // inputKey below). The date has to be part of the key: a row id is
    // plan+exercise only, so without it Monday's numbers would still be
    // sitting in the fields when you flip to Thursday.
    //
    // Each exercise holds one entry per set — Set 1, Set 2, … — so every
    // set carries its own reps and weight.
    const [exerciseInputs, setExerciseInputs] = useState<
        Record<string, { reps: string; weight: string }[]>
    >({});

    // An exercise with nothing entered yet still shows a single empty
    // "Set 1" row to type into.
    const getSetInputs = (rowId: string) =>
        exerciseInputs[inputKey(toDateKey(selectedDate), rowId)] ?? [EMPTY_SET_INPUT];

    const stepSetInput = (
        rowId: string,
        setIndex: number,
        field: 'reps' | 'weight',
        direction: 1 | -1,
    ) => {
        const key = inputKey(toDateKey(selectedDate), rowId);
        setExerciseInputs((prev) => {
            const sets = prev[key] ?? [EMPTY_SET_INPUT];
            return {
                ...prev,
                [key]: sets.map((set, i) => {
                    if (i !== setIndex) return set;
                    const current = parseFloat(set[field]) || 0;
                    // Never below zero — a negative rep count or weight
                    // is meaningless, and blank + "−" should stay blank-ish.
                    const next = Math.max(current + SET_STEPS[field] * direction, 0);
                    return { ...set, [field]: formatStepValue(next) };
                }),
            };
        });
    };

    const addSet = (rowId: string) => {
        const key = inputKey(toDateKey(selectedDate), rowId);
        setExerciseInputs((prev) => {
            const sets = prev[key] ?? [EMPTY_SET_INPUT];
            // A new set usually repeats the previous one, so seeding it
            // with those numbers is less typing than starting blank.
            const last = sets[sets.length - 1] ?? EMPTY_SET_INPUT;
            return { ...prev, [key]: [...sets, { ...last }] };
        });
    };

    const removeSet = (rowId: string, setIndex: number) => {
        const key = inputKey(toDateKey(selectedDate), rowId);
        setExerciseInputs((prev) => {
            const sets = prev[key] ?? [EMPTY_SET_INPUT];
            if (sets.length <= 1) return prev; // always keep Set 1
            return { ...prev, [key]: sets.filter((_, i) => i !== setIndex) };
        });
    };
    // Accordion — only one exercise row's sets/reps/weight fields are
    // expanded at a time; opening another closes whichever was open.
    const [expandedExerciseId, setExpandedExerciseId] = useState<string | null>(null);
    const toggleExerciseExpanded = (exerciseId: string) => {
        setExpandedExerciseId((prev) => (prev === exerciseId ? null : exerciseId));
    };

    // Live-synced plans (App.tsx's useWorkoutPlansSync() keeps this fed
    // from Firestore) → whichever of them are scheduled on selectedDate's
    // weekday, for the signed-in user. Same day-matching logic the
    // Schedule tab uses.
    const workoutPlans = useWorkoutPlans();

    const selectedDateKey = toDateKey(selectedDate);
    // A day is "past" purely by date key — never by comparing Date
    // objects, which carry a time-of-day and would reclassify the
    // selected day as the clock rolls past midnight mid-session.
    const isPastDay = selectedDateKey < todayDateKey();

    // This date's materialized occurrences (see workoutLogService):
    // rows that either override the plan's exercise list for this day
    // alone, or record a session that was actually performed.
    //
    // Bumping `occurrenceRefreshKey` re-reads them after a write —
    // unlike plans, these are not kept live in Redux by App.tsx.
    // Results are stored together with the date they describe, rather
    // than alongside a separate isLoading flag. A flag is set inside an
    // effect, which runs only AFTER the first commit for the new date —
    // leaving one rendered frame where the flag still says "loaded" but
    // the data is the previous day's. Comparing the date instead makes
    // "is this day's data here yet" true only when it genuinely is.
    const [occurrences, setOccurrences] = useState<{ dateKey: string; rows: WorkoutLog[] }>({
        dateKey: '',
        rows: [],
    });
    const [occurrenceRefreshKey, setOccurrenceRefreshKey] = useState(0);
    const hasOccurrencesForDay = occurrences.dateKey === selectedDateKey;

    useEffect(() => {
        let cancelled = false;
        fetchOccurrencesForDate(selectedDateKey)
            .then((rows) => {
                if (!cancelled) setOccurrences({ dateKey: selectedDateKey, rows });
            })
            .catch(() => {
                // Non-fatal: the day still renders from the plan rules
                // alone, just without this date's overrides. It is still
                // marked as loaded, or the card would stay a skeleton
                // forever whenever this read fails.
                if (!cancelled) setOccurrences({ dateKey: selectedDateKey, rows: [] });
            });
        return () => {
            cancelled = true;
        };
    }, [selectedDateKey, occurrenceRefreshKey]);

    // The recurring rules for this weekday, with this date's own
    // overrides layered on top — and any occurrence whose plan no
    // longer schedules this date unioned back in, so an edited or
    // logged day cannot disappear when its plan is later rescheduled,
    // paused or deleted.
    const dayEvents = useMemo(
        () =>
            applyOccurrencesToEvents(
                getEventsForDate(selectedDate, workoutPlans),
                // Never layer another day's rows over this day.
                hasOccurrencesForDay ? occurrences.rows : [],
                workoutPlans,
            ),
        [selectedDate, workoutPlans, occurrences, hasOccurrencesForDay],
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

    // Switching days swaps the plans instantly (they come from the live
    // store) but their exercise names and logged numbers are both network
    // round-trips. Rather than flash humanised slug ids and empty fields
    // for a few hundred ms, the rows render as a skeleton until both land.
    // Which date the log lookup below has finished resolving — same
    // date-keyed approach as `occurrences`, for the same reason.
    const [logsDateKey, setLogsDateKey] = useState('');
    const hasLogsForDay = logsDateKey === selectedDateKey;
    const isResolvingNames = todaysExerciseIds.some((id) => !exerciseCache[id]);
    // Occurrences are part of this too: they decide *which* exercises a
    // day has, so rendering before they arrive would show the plan's
    // list and then visibly swap it for the day's edited one.
    const isDayLoading =
        hasWorkoutToday && (isResolvingNames || !hasLogsForDay || !hasOccurrencesForDay);

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
        const dateKey = toDateKey(selectedDate);

        // Nothing to look up — but the day still has to be marked
        // resolved, or a card whose exercise list is empty would sit on
        // a skeleton forever waiting for a fetch that never runs.
        if (!todaysExerciseIdsKey) {
            setLoggedPlanIds(new Set());
            setLogsDateKey(dateKey);
            return;
        }

        let cancelled = false;

        fetchExerciseLogLookup(todaysExerciseIds, dateKey)
            .then(({ savedForDate, nearest, completedPlanIds }) => {
                if (cancelled) return;

                // Keyed off completed rows only. Testing for the mere
                // presence of a saved entry would flip a day to "Logged"
                // the instant its exercises were edited — a 'planned'
                // row is a saved entry too — and, since the edit button
                // is hidden once logged, would lock the day after a
                // single edit.
                const completed = new Set(completedPlanIds);
                setLoggedPlanIds(
                    new Set(
                        planCards
                            .filter((plan) => completed.has(plan.planDocId))
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
                                !existing ||
                                existing.every((set) => !set.reps && !set.weight);
                            if (!isEmpty) return;

                            const match =
                                savedForDate[savedEntryKey(plan.planDocId, exercise.exerciseId)] ??
                                nearest[exercise.exerciseId];
                            if (!match || match.sets.length === 0) return;

                            next[key] = match.sets.map((set) => ({
                                reps: set.reps ? String(set.reps) : '',
                                weight: set.weight ? String(set.weight) : '',
                            }));
                            changed = true;
                        });
                    });

                    return changed ? next : prev;
                });
            })
            .catch(() => {
                // Marked resolved on failure too: the numbers are then
                // simply unprefilled, which is recoverable, whereas a
                // permanent skeleton is not.
                if (!cancelled) setLoggedPlanIds(new Set());
            })
            .finally(() => {
                if (!cancelled) setLogsDateKey(dateKey);
            });

        return () => {
            cancelled = true;
        };
        // planCards is intentionally omitted — which exercises are on the
        // selected day is what should re-trigger this, not every reference
        // change from an in-flight exercise-name resolve.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [todaysExerciseIdsKey, selectedDate]);


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
                state: 'completed',
                // `plan.exercises` comes from the merged day events, so
                // on a day with its own override this is that day's
                // edited list — not the plan's. Building it from the
                // plan would write the plan's exercises straight back
                // over the user's per-day edit on the next save.
                exercises: plan.exercises.map((exercise) => ({
                    exerciseId: exercise.exerciseId,
                    name: exercise.name,
                    sets: (exerciseInputs[inputKey(dateKey, exercise.id)] ?? [EMPTY_SET_INPUT]).map(
                        (set) => ({
                            reps: parseInt(set.reps, 10) || 0,
                            weight: parseFloat(set.weight) || 0,
                        }),
                    ),
                })),
            });
            const wasAlreadyLogged = loggedPlanIds.has(plan.id);
            setLoggedPlanIds((prev) => new Set(prev).add(plan.id));
            // The row just changed state to 'completed' — re-read so the
            // day view reflects it without a manual refresh.
            setOccurrenceRefreshKey((key) => key + 1);
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

    // Editing an existing plan. The sheet needs the full WorkoutPlan (its
    // `days` live on the plan doc, not on the calendar event derived from
    // it), so the card's planDocId is looked up against the live plan list.
    const [editingPlan, setEditingPlan] = useState<
        {
            planDocId: string;
            planName: string;
            initial: NewPlanPayload;
            /**
             * 'rule'    — rewrite the plan document; every date it
             *             recurs on changes, past and future.
             * 'thisDay' — write an occurrence for the selected date
             *             only; the plan document is untouched.
             */
            scope: 'rule' | 'thisDay';
        } | null
    >(null);

    // Opens the sheet for one day's worth of a plan. `scope` decides
    // where the save lands; `thisDay` also restricts the sheet to the
    // exercise list, since re-timing or re-scheduling a single past
    // occurrence is meaningless.
    const beginEdit = (plan: PlanCard, scope: 'rule' | 'thisDay') => {
        const planDoc = workoutPlans.find((candidate) => candidate.id === plan.planDocId);

        // A plan can be missing here: an occurrence unioned back in for
        // a deleted plan still renders a card. There is no rule left to
        // rewrite, so such a card can only ever be edited for its day.
        if (!planDoc && scope === 'rule') return;

        setEditingPlan({
            planDocId: plan.planDocId,
            planName: plan.title,
            scope,
            initial: {
                name: planDoc?.name ?? plan.title,
                muscles: planDoc?.muscles ?? [],
                // For a single day, start from what that day currently
                // shows (the override if there is one), not from the
                // plan's list.
                exerciseIds:
                    scope === 'thisDay'
                        ? plan.exercises.map((exercise) => exercise.exerciseId)
                        : (planDoc?.exerciseIds ?? []),
                days: planDoc?.days ?? [],
                time: planDoc?.time ?? '',
            },
        });
    };

    const openPlanEditor = (plan: PlanCard) => {
        // A past day can only ever be edited for itself. Rewriting the
        // recurring rule from a date that has already happened is the
        // bug this whole flow exists to prevent, and "this and all
        // future days" is never what someone means while looking
        // backwards — so there is nothing to ask.
        if (isPastDay) {
            beginEdit(plan, 'thisDay');
            return;
        }

        Alert.alert(
            'Edit workout',
            `"${plan.title}" repeats every week. Apply your changes to this day only, or to the whole plan?`,
            [
                { text: 'Cancel', style: 'cancel' },
                { text: 'This day only', onPress: () => beginEdit(plan, 'thisDay') },
                { text: 'The whole plan', onPress: () => beginEdit(plan, 'rule') },
            ],
        );
    };

    // Commits the edit, to whichever of the two places the chosen scope
    // says. A 'rule' save needs no manual refresh — the screen reads
    // plans from the live Firestore-synced list, so cards re-render as
    // soon as the write lands — but occurrences are not synced that
    // way, so a 'thisDay' save re-reads them explicitly.
    const handleUpdatePlan = async (payload: NewPlanPayload) => {
        if (!editingPlan) return;
        setIsSavingPlan(true);
        try {
            if (editingPlan.scope === 'thisDay') {
                // Nothing is written to the plan document — the
                // recurring rule is left exactly as it was, so every
                // other date it produces is unaffected.
                // The log stores a name snapshot alongside each id. An
                // exercise just picked in the sheet won't be in the
                // screen's cache yet, so resolve the stragglers rather
                // than persisting a humanised slug.
                const unresolved = payload.exerciseIds.filter((id) => !exerciseCache[id]);
                const resolved = { ...exerciseCache };
                if (unresolved.length > 0) {
                    try {
                        (await fetchExercisesBulk(unresolved)).forEach((exercise) => {
                            resolved[exercise.id] = exercise;
                        });
                        setExerciseCache(resolved);
                    } catch {
                        // Names are cosmetic here — the id is what every
                        // lookup matches on — so a failed resolve must
                        // not block saving the edit.
                    }
                }

                await savePlannedOccurrence({
                    planId: editingPlan.planDocId,
                    planName: editingPlan.planName,
                    date: selectedDateKey,
                    exercises: payload.exerciseIds.map((exerciseId) => ({
                        exerciseId,
                        name: resolved[exerciseId]?.name ?? humanizeExerciseId(exerciseId),
                    })),
                });
                setOccurrenceRefreshKey((key) => key + 1);
            } else {
                await updateWorkoutPlan(editingPlan.planDocId, {
                    name: payload.name,
                    muscles: payload.muscles,
                    exerciseIds: payload.exerciseIds,
                    days: payload.days,
                    time: payload.time,
                });
            }
            setEditingPlan(null);
        } catch (error) {
            Alert.alert(
                'Could not update workout plan',
                error instanceof WorkoutPlanServiceError ||
                    error instanceof WorkoutLogServiceError
                    ? error.message
                    : 'Something went wrong. Please try again.',
            );
        } finally {
            setIsSavingPlan(false);
        }
    };

    return (
        <View style={styles.root}>
        <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
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
                planCards.map((plan) => {
                    // `loggedPlanIds` still holds the PREVIOUS day's
                    // result until this day's lookup resolves, so
                    // anything driven by it has to wait for the same
                    // signal the exercise rows wait for. Rendering it
                    // early flashes the wrong control — a logged day
                    // shows "Edit Plan" for a moment before flipping to
                    // the "Logged" badge.
                    const isLogStateKnown = !isDayLoading;
                    const isLogged = isLogStateKnown && loggedPlanIds.has(plan.id);
                    return (
                    <View key={plan.id} style={styles.card}>
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
                                {isLogged ? (
                                    <View style={styles.planCardLoggedPill}>
                                        <Text style={styles.planCardLoggedText}>Logged</Text>
                                    </View>
                                ) : null}
                            </View>
                            {/* Neither control renders until the day's
                                log state is known — showing one and
                                then swapping it for the other is worse
                                than showing nothing for the same
                                moment the rows are skeletons. */}
                            {isLogStateKnown && !isLogged ? (
                                <TouchableOpacity
                                    activeOpacity={0.7}
                                    onPress={() => openPlanEditor(plan)}
                                    style={styles.editPlanButton}
                                >
                                    <Text style={styles.editPlanText}>Edit Plan</Text>
                                    <SlidersHorizontal size={13} color={colors.primary} strokeWidth={2.4} />
                                </TouchableOpacity>
                            ) : null}
                        </View>

                        {isDayLoading ? (
                            <ExerciseSkeleton rows={plan.exercises.length || 3} />
                        ) : (
                        <View style={styles.planExerciseList}>
                            {plan.exercises.map((exercise, index) => {
                                const setInputs = getSetInputs(exercise.id);
                                const isLast = index === plan.exercises.length - 1;
                                const isExpanded = expandedExerciseId === exercise.id;
                                return (
                                    <Animated.View
                                        key={exercise.id}
                                        layout={LinearTransition.duration(220)}
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
                                                style={styles.planSetList}
                                            >
                                                {setInputs.map((set, setIndex) => (
                                                    <View key={setIndex} style={styles.planSetRow}>
                                                        <Text style={styles.planSetLabel}>
                                                            Set {setIndex + 1}
                                                        </Text>
                                                        <SetStepper
                                                            value={set.reps}
                                                            unit="reps"
                                                            onStep={(direction) =>
                                                                stepSetInput(exercise.id, setIndex, 'reps', direction)
                                                            }
                                                        />
                                                        <SetStepper
                                                            value={set.weight}
                                                            unit="kg"
                                                            onStep={(direction) =>
                                                                stepSetInput(exercise.id, setIndex, 'weight', direction)
                                                            }
                                                        />
                                                        {setInputs.length > 1 ? (
                                                            <TouchableOpacity
                                                                activeOpacity={0.7}
                                                                onPress={() => removeSet(exercise.id, setIndex)}
                                                                style={styles.removeSetButton}
                                                                hitSlop={8}
                                                            >
                                                                <Trash2 size={15} color={colors.error} strokeWidth={2.2} />
                                                            </TouchableOpacity>
                                                        ) : (
                                                            <View style={styles.removeSetButton} />
                                                        )}
                                                    </View>
                                                ))}

                                                <TouchableOpacity
                                                    activeOpacity={0.8}
                                                    onPress={() => addSet(exercise.id)}
                                                    style={styles.addSetRowButton}
                                                >
                                                    <Plus size={15} color={colors.primary} strokeWidth={2.6} />
                                                    <Text style={styles.addSetRowText}>
                                                        Add set {setInputs.length + 1}
                                                    </Text>
                                                </TouchableOpacity>
                                            </Animated.View>
                                        ) : null}
                                    </Animated.View>
                                );
                            })}
                        </View>
                        )}

                        <TouchableOpacity
                            activeOpacity={0.85}
                            disabled={savingPlanId === plan.id || isDayLoading}
                            onPress={() => handleSaveWorkout(plan)}
                            style={[
                                styles.saveWorkoutButton,
                                savingPlanId === plan.id && styles.submitButtonDisabled,
                            ]}
                        >
                            <Text style={styles.saveWorkoutButtonText}>
                                {savingPlanId === plan.id
                                    ? 'Saving…'
                                    : !isLogStateKnown
                                      ? 'Loading…'
                                      : isLogged
                                        ? 'Update Log'
                                        : 'Save Log'}
                            </Text>
                        </TouchableOpacity>
                    </View>
                    );
                })
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

        {editingPlan ? (
            <NewPlanModal
                initialPlan={editingPlan.initial}
                exercisesOnly={editingPlan.scope === 'thisDay'}
                singleDateLabel={editingPlan.scope === 'thisDay' ? selectedDateKey : undefined}
                onClose={() => setEditingPlan(null)}
                onCreate={handleUpdatePlan}
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
    editPlanButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingVertical: 4,
        paddingLeft: 8,
    },
    editPlanText: {
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
    skeletonList: {
        gap: 14,
        paddingVertical: 6,
    },
    skeletonRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    skeletonIcon: {
        width: 34,
        height: 34,
        borderRadius: 11,
        backgroundColor: colors.surfaceContainer,
    },
    skeletonTextBlock: {
        flex: 1,
        gap: 6,
    },
    skeletonLineWide: {
        height: 11,
        borderRadius: 6,
        backgroundColor: colors.surfaceContainer,
        width: '62%',
    },
    skeletonLineNarrow: {
        height: 9,
        borderRadius: 5,
        backgroundColor: colors.surfaceLow,
        width: '38%',
    },
    planSetList: {
        gap: 8,
        marginTop: 2,
    },
    planSetRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    planSetLabel: {
        width: 46,
        fontSize: 11.5,
        fontWeight: '800',
        color: colors.textSecondary,
    },
    removeSetButton: {
        width: 28,
        height: 28,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
        alignSelf: 'center',
    },
    addSetRowButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        backgroundColor: withOpacity(colors.primary, 0.1),
        borderRadius: 12,
        paddingVertical: 9,
        marginTop: 2,
    },
    addSetRowText: {
        fontSize: 12.5,
        fontWeight: '800',
        color: colors.primary,
    },
    stepper: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: colors.surfaceLow,
        borderRadius: 12,
        paddingHorizontal: 4,
        paddingVertical: 4,
    },
    stepperButton: {
        width: 28,
        height: 28,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.surface,
    },
    stepperValueBlock: {
        flex: 1,
        alignItems: 'center',
    },
    stepperValue: {
        fontSize: 14,
        fontWeight: '800',
        color: colors.textPrimary,
    },
    stepperUnit: {
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
