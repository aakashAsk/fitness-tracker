import React, { useEffect, useMemo, useState } from 'react';
import {
    ScrollView,
    View,
    Text,
    TouchableOpacity,
    } from 'react-native';
import {
    CalendarDays,
    Flame,
    Plus,
    ChevronRight,
} from 'lucide-react-native';
import { colors, withOpacity } from '../../Theme/colors';
import { spacing, radius } from '../../Theme/spacing';
import NewPlanModal, { NewPlanPayload } from './NewPlanModal';
import { useDayWorkoutEvents } from '../../Hooks/useDayWorkoutEvents';
import { useScrollToItem } from '../../Hooks/useScrollToItem';
import { useExerciseInputs, inputKey, EMPTY_SET_INPUT } from '../../Hooks/useExerciseInputs';
import { EquipmentIcon } from '../../Components/EquipmentIcon';
import WorkoutDateStrip from './WorkoutDateStrip';
import PlanLibrary from './PlanLibrary';
import WorkoutProgressCard from './WorkoutProgressCard';
import WorkoutPlanCard from './WorkoutPlanCard';
import {
    createWorkoutPlan,
    updateWorkoutPlan,
    WorkoutPlanServiceError,
    type WorkoutPlan,
} from '../../Services/workoutPlanService';
import {
    fetchExerciseLogLookup,
    savedEntryKey,
    savePlannedOccurrence,
    saveWorkoutLog,
    toDateKey,
    todayDateKey,
    WorkoutLogServiceError,
} from '../../Services/workoutLogService';
import {
    describeConflict,
    findScheduleConflict,
    MAX_PLANS_PER_USER,
} from '../../Services/planValidation';
import {
    Exercise,
    fetchExercises,
    fetchExercisesBulk,
    isWeightedEquipment,
} from '../../Services/exerciseService';
import { useDialog } from '../../Components/Dialog';
import { themedStyles } from '../../Theme/ThemeContext';
import ExerciseLibrary from './ExerciseLibrary';
import ExerciseDetail from './ExerciseDetail';

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

function humanizeExerciseId(id: string): string {
    return id.replace(/_/g, ' ');
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
    // Whether this exercise's sets take a kg figure — false for
    // bodyweight work, where a weight field would only ever collect 0.
    isWeighted: boolean;
    // Drives both the icon and its colour — see EquipmentIcon. Null
    // while the exercise API has yet to resolve this id.
    equipment: string | null;
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

// Placeholder rows shown while a newly selected day resolves its
// exercise names and logged numbers — a pulsing outline reads as
// "loading" without the layout jump of swapping real content in and out.
const ExerciseSkeleton: React.FC<{ rows: number }> = ({ rows }) => (
    <SkeletonGroup style={styles.skeletonList}>
        {Array.from({ length: rows }).map((_, index) => (
            <View key={index} style={styles.skeletonRow}>
                <SkeletonBlock width={38} height={38} radius={12} />
                <View style={styles.skeletonTextBlock}>
                    <SkeletonBlock width="60%" height={11} />
                    <SkeletonBlock width="35%" height={9} radius={5} />
                </View>
            </View>
        ))}
    </SkeletonGroup>
);

export interface WorkoutSessionProps {
    /** A plan to scroll to on arrival — set when the user comes here from
        the dashboard's Today's Workout card. */
    focusPlanId?: string | null;
    /** Called once the tab has landed on `focusPlanId`, so the caller can
        clear it and a later visit does not jump again. */
    onFocusHandled?: () => void;
}

export const WorkoutSession: React.FC<WorkoutSessionProps> = ({ focusPlanId, onFocusHandled }) => {
    const dialog = useDialog();
    const [selectedDate, setSelectedDate] = useState(() => new Date());
    const [activeFilter, setActiveFilter] = useState('Push');
    const [showNewPlanModal, setShowNewPlanModal] = useState(false);
    const [isSavingPlan, setIsSavingPlan] = useState(false);

    const { exerciseInputs, setExerciseInputs, getSetInputs, stepSetInput, addSet, removeSet, setAllInputs } = useExerciseInputs({
        selectedDate,
    });
    // Accordion — only one exercise row's sets/reps/weight fields are
    // expanded at a time; opening another closes whichever was open.
    const [expandedExerciseId, setExpandedExerciseId] = useState<string | null>(null);
    const toggleExerciseExpanded = (exerciseId: string) => {
        setExpandedExerciseId((prev) => (prev === exerciseId ? null : exerciseId));
    };

    const selectedDateKey = toDateKey(selectedDate);
    // A day is "past" purely by date key — never by comparing Date
    // objects, which carry a time-of-day and would reclassify the
    // selected day as the clock rolls past midnight mid-session.
    const isPastDay = selectedDateKey < todayDateKey();
    const isToday = selectedDateKey === todayDateKey();
    // Nothing can be logged for a day that hasn't happened yet.
    const isFutureDay = selectedDateKey > todayDateKey();

    // The selected date's workouts — plan rules plus that date's own
    // occurrences. Shared with the dashboard's Today's Workout card (see
    // useDayWorkoutEvents), so the two can never disagree about a day.
    const {
        workoutPlans,
        dayEvents,
        hasOccurrencesForDay,
        refreshKey: occurrenceRefreshKey,
        refresh: refreshOccurrences,
    } = useDayWorkoutEvents(selectedDate);

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
    // listing its real exercises, each with the icon for the equipment
    // it is done with.
    const planCards: PlanCard[] = useMemo(() => {
        return dayEvents.map((event) => ({
            id: event.id,
            planDocId: event.sourceId,
            title: event.title,
            exercises: event.exerciseIds.map((id) => {
                const details = exerciseCache[id];
                const meta = details
                    ? [details.primaryMuscles[0], details.equipment].filter(Boolean).join(' • ')
                    : '';
                return {
                    id: `${event.id}-${id}`,
                    exerciseId: id,
                    name: details?.name ?? humanizeExerciseId(id),
                    meta,
                    isWeighted: isWeightedEquipment(details?.equipment),
                    equipment: details?.equipment ?? null,
                };
            }),
        }));
    }, [dayEvents, exerciseCache]);

    const totalExerciseCount = planCards.reduce((sum, plan) => sum + plan.exercises.length, 0);
    const hasWorkoutToday = planCards.length > 0;

    // ── Exercise browser ───────────────────────────────────────────────
    // Sub-screens of this tab rather than routes: the app has no router,
    // and the Profile tab already swaps to Settings the same way.
    const [browsing, setBrowsing] = useState(false);
    const [detailExercise, setDetailExercise] = useState<Exercise | null>(null);

    // The strip above "View All". Preference is the day's own planned
    // exercises — the ones the user is about to do. With nothing
    // scheduled there is nothing personal to show, so it falls back to
    // the first few from the library just to give the row content.
    const plannedExerciseIds = useMemo(
        () => planCards.flatMap((plan) => plan.exercises.map((item) => item.exerciseId)),
        [planCards],
    );

    const [fallbackExercises, setFallbackExercises] = useState<Exercise[]>([]);

    useEffect(() => {
        // Only fetched when the day is genuinely empty, so a user with a
        // plan never pays for this request.
        if (plannedExerciseIds.length > 0 || fallbackExercises.length > 0) return;

        let active = true;
        fetchExercises({ limit: 5 })
            .then((list) => {
                if (active) setFallbackExercises(list.slice(0, 5));
            })
            // The row simply stays empty — it is a shortcut, not content
            // the screen depends on.
            .catch(() => undefined);

        return () => {
            active = false;
        };
    }, [plannedExerciseIds.length, fallbackExercises.length]);

    // `exercise` is the full record where it has resolved. The planned
    // path reads it from the cache the plan cards already populate; the
    // fallback path already holds it. Null means the name is a humanised
    // slug and there is nothing to open yet.
    const featuredExercises: {
        id: string;
        name: string;
        equipment: string | null;
        exercise: Exercise | null;
    }[] = useMemo(() => {
        if (plannedExerciseIds.length > 0) {
            // A plan can list the same exercise twice; the row is a
            // shortcut, so show each one once.
            const unique = Array.from(new Set(plannedExerciseIds)).slice(0, 5);
            return unique.map((id) => {
                const details = exerciseCache[id] ?? null;
                return {
                    id,
                    name: details?.name ?? humanizeExerciseId(id),
                    equipment: details?.equipment ?? null,
                    exercise: details,
                };
            });
        }
        return fallbackExercises.map((item) => ({
            id: item.id,
            name: item.name,
            equipment: item.equipment,
            exercise: item,
        }));
    }, [plannedExerciseIds, exerciseCache, fallbackExercises]);

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

    // Arriving from the dashboard's Today's Workout card: land on that
    // plan, with its first exercise open and ready for sets. Waits for
    // the day to finish loading so it scrolls to the real card, not to a
    // skeleton that is about to change height.
    const isFocusReady = !isDayLoading && hasOccurrencesForDay;
    const focus = useScrollToItem(focusPlanId, isFocusReady, onFocusHandled);

    useEffect(() => {
        if (!focusPlanId || !isFocusReady) return;
        const target = planCards.find((plan) => plan.planDocId === focusPlanId);
        if (target?.exercises[0]) setExpandedExerciseId(target.exercises[0].id);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [focusPlanId, isFocusReady]);

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

                            // A 'planned' row is a saved entry too, and
                            // any exercise added by a single-day edit
                            // sits in it with NO sets. Letting that win
                            // the lookup suppresses the carry-forward
                            // and leaves the field blank, so an entry
                            // only counts when it holds actual numbers.
                            const saved =
                                savedForDate[savedEntryKey(plan.planDocId, exercise.exerciseId)];
                            const match =
                                saved && saved.sets.length > 0
                                    ? saved
                                    : nearest[exercise.exerciseId];
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
                            // Forced to 0 where there is no weight field
                            // to see: the carry-forward prefill fills
                            // every exercise from history, so a
                            // bodyweight movement can hold a stale kg
                            // value the user was never shown and has no
                            // way to clear.
                            weight: exercise.isWeighted ? parseFloat(set.weight) || 0 : 0,
                        }),
                    ),
                })),
            });
            const wasAlreadyLogged = loggedPlanIds.has(plan.id);
            setLoggedPlanIds((prev) => new Set(prev).add(plan.id));
            // The row just changed state to 'completed' — re-read so the
            // day view reflects it without a manual refresh.
            refreshOccurrences();
            dialog.show({
                title: wasAlreadyLogged ? 'Updated' : 'Saved',
                message: `${plan.title} logged for ${dateKey}.`,
            });
        } catch (error) {
            dialog.show({
                title: 'Could not save workout',
                message:
                    error instanceof WorkoutLogServiceError
                        ? error.message
                        : 'Something went wrong. Please try again.',
            });
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
        // The cap counts every plan the user owns, drafts and paused
        // ones included — they all occupy a slot in the library.
        if (workoutPlans.length >= MAX_PLANS_PER_USER) {
            dialog.show({
                title: 'Plan limit reached',
                message: `You can keep up to ${MAX_PLANS_PER_USER} plans. Delete or replace one before adding another.`,
            });
            return;
        }

        // Only a live plan can clash — a draft isn't on the calendar
        // yet, so the check runs again when it is made live.
        if (status === 'live') {
            const conflict = findScheduleConflict(workoutPlans, {
                days: payload.days,
                time: payload.time,
            });
            if (conflict) {
                dialog.show({
                    title: 'That time is already taken',
                    message: describeConflict(conflict),
                });
                return;
            }
        }

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
            dialog.show({
                title: 'Could not save workout plan',
                message:
                    error instanceof WorkoutPlanServiceError
                        ? error.message
                        : 'Something went wrong. Please try again.',
            });
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
                // For a single day, start from the name that day is
                // actually showing — which is its own, if it has been
                // renamed before. Starting from the plan's name would
                // quietly revert a custom one on the next save.
                name: scope === 'thisDay' ? plan.title : (planDoc?.name ?? plan.title),
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

    // Editing straight from the plan library. Always whole-plan scope:
    // that list isn't tied to a date, so there is no single day a change
    // could be scoped to, and no prompt to show.
    const openPlanEditorFromLibrary = (planDoc: WorkoutPlan) => {
        setEditingPlan({
            planDocId: planDoc.id,
            planName: planDoc.name,
            scope: 'rule',
            initial: {
                name: planDoc.name,
                muscles: planDoc.muscles,
                exerciseIds: planDoc.exerciseIds,
                days: planDoc.days,
                time: planDoc.time,
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

        dialog.show({
            title: 'Edit workout',
            message: `"${plan.title}" repeats every week. Apply your changes to this day only, or to the whole plan?`,
            actions: [
                { label: 'Cancel', style: 'cancel' },
                { label: 'This day only', onPress: () => beginEdit(plan, 'thisDay') },
                { label: 'The whole plan', onPress: () => beginEdit(plan, 'rule') },
            ],
        });
    };

    // Commits the edit, to whichever of the two places the chosen scope
    // says. A 'rule' save needs no manual refresh — the screen reads
    // plans from the live Firestore-synced list, so cards re-render as
    // soon as the write lands — but occurrences are not synced that
    // way, so a 'thisDay' save re-reads them explicitly.
    const handleUpdatePlan = async (payload: NewPlanPayload) => {
        if (!editingPlan) return;

        // Rescheduling the rule can move a plan on top of another one.
        // Excluded from the search by id, or it would clash with itself.
        // Single-day edits skip this: they change only the exercise
        // list, never the day or time.
        if (editingPlan.scope === 'rule') {
            const editedPlan = workoutPlans.find((plan) => plan.id === editingPlan.planDocId);
            if (editedPlan?.status === 'live') {
                const conflict = findScheduleConflict(
                    workoutPlans,
                    { days: payload.days, time: payload.time },
                    { excludePlanId: editingPlan.planDocId },
                );
                if (conflict) {
                    dialog.show({
                    title: 'That time is already taken',
                    message: describeConflict(conflict),
                });
                    return;
                }
            }
        }

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
                    // The name from the sheet, not the plan's — renaming
                    // here renames this date's session only.
                    planName: payload.name.trim() || editingPlan.planName,
                    date: selectedDateKey,
                    exercises: payload.exerciseIds.map((exerciseId) => ({
                        exerciseId,
                        name: resolved[exerciseId]?.name ?? humanizeExerciseId(exerciseId),
                    })),
                });
                refreshOccurrences();
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
            dialog.show({
                title: 'Could not update workout plan',
                message:
                    error instanceof WorkoutPlanServiceError ||
                    error instanceof WorkoutLogServiceError
                        ? error.message
                        : 'Something went wrong. Please try again.',
            });
        } finally {
            setIsSavingPlan(false);
        }
    };

    // Detail sits above the library so backing out of it returns to the
    // list the user came from, with its search and filters intact.
    if (detailExercise) {
        return (
            <ExerciseDetail
                exercise={detailExercise}
                onBack={() => setDetailExercise(null)}
            />
        );
    }

    if (browsing) {
        return (
            <ExerciseLibrary
                onBack={() => setBrowsing(false)}
                onSelectExercise={setDetailExercise}
            />
        );
    }

    return (
        <View style={styles.root}>
        <ScrollView
            ref={focus.scrollRef}
            onScrollBeginDrag={focus.onScrollBeginDrag}
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
            </View>


            {/* Progress across every logged session — sets, reps and
                weight rolled up per day. Not tied to the selected date,
                so it has data to draw whenever the user has trained. */}
            <WorkoutProgressCard refreshKey={occurrenceRefreshKey} />

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

                {/* Jump back to the current date — sits in the header
                    row's empty right slot. The strip spans two months
                    either side of today, so it is easy to scroll a long
                    way off and tedious to swipe back. Disabled rather
                    than hidden when today is already selected, so the
                    heading row doesn't reflow as you scrub dates. */}
                <TouchableOpacity
                    accessibilityLabel="Jump to today"
                    activeOpacity={0.8}
                    disabled={isToday}
                    onPress={() => setSelectedDate(new Date())}
                    style={[styles.todayButton, isToday && styles.todayButtonDisabled]}
                >
                    <CalendarDays size={12} color={colors.primary} strokeWidth={2.6} />
                    <Text style={styles.todayButtonText}>Today</Text>
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
                    const isLogStateKnown = !isDayLoading;
                    const isLogged = isLogStateKnown && loggedPlanIds.has(plan.id);

                    return (
                        <WorkoutPlanCard
                            key={plan.id}
                            id={plan.id}
                            planDocId={plan.planDocId}
                            title={plan.title}
                            exercises={plan.exercises}
                            isLogged={isLogged}
                            isLogStateKnown={isLogStateKnown}
                            isDayLoading={isDayLoading}
                            isSaving={savingPlanId === plan.id || isFutureDay}
                            expandedExerciseId={expandedExerciseId}
                            exerciseInputs={exerciseInputs}
                            onToggleExercise={toggleExerciseExpanded}
                            onEditPlan={() => openPlanEditor(plan)}
                            onSaveWorkout={() => handleSaveWorkout(plan)}
                            onStepSetInput={stepSetInput}
                            onAddSet={addSet}
                            onRemoveSet={removeSet}
                            onFocusLayout={focus.onItemLayout(plan.planDocId)}
                        />
                    );
                })
            )}

            {/* Every plan the user owns, regardless of date — always
                rendered, unlike the cards above, which only cover what
                is scheduled on the selected day. */}
            <PlanLibrary onEditPlan={openPlanEditorFromLibrary} />

            {/* Shortcut into the exercise library. Shows the day's own
                planned exercises where there are any — see
                featuredExercises above for the fallback. */}
            {featuredExercises.length > 0 ? (
                <View style={styles.browseSection}>
                    <View style={styles.browseHeader}>
                        <Text style={styles.browseTitle}>
                            {plannedExerciseIds.length > 0 ? "Today's Exercises" : 'Exercises'}
                        </Text>
                        <TouchableOpacity
                            activeOpacity={0.8}
                            onPress={() => setBrowsing(true)}
                            accessibilityRole="button"
                            accessibilityLabel="View all exercises"
                            style={styles.browseAllButton}
                        >
                            <Text style={styles.browseAllText}>View All</Text>
                            <ChevronRight size={13} color={colors.primary} strokeWidth={2.6} />
                        </TouchableOpacity>
                    </View>

                    <View style={styles.browseList}>
                        {featuredExercises.map((item) => (
                            <TouchableOpacity
                                key={item.id}
                                activeOpacity={0.85}
                                onPress={() => setDetailExercise(item.exercise)}
                                // A planned exercise whose record has not
                                // resolved yet has nothing to show on the
                                // detail screen, so it stays inert rather
                                // than opening a blank one.
                                disabled={!item.exercise}
                                accessibilityRole="button"
                                accessibilityLabel={item.name}
                                style={styles.browseRow}
                            >
                                <View style={styles.browseIcon}>
                                    <EquipmentIcon equipment={item.equipment} size={17} />
                                </View>
                                <Text style={styles.browseRowText} numberOfLines={1}>
                                    {item.name}
                                </Text>
                                <ChevronRight
                                    size={15}
                                    color={colors.textMuted}
                                    strokeWidth={2.4}
                                />
                            </TouchableOpacity>
                        ))}
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

const styles = themedStyles(() => ({
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
        // No horizontal padding here — WorkoutDateStrip applies
        // screenHorizontalPadding itself via its contentContainerStyle, and
        // sizes its tiles assuming that is the only inset.
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
    todayButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        backgroundColor: withOpacity(colors.primary, 0.12),
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 20,
    },
    todayButtonDisabled: {
        opacity: 0.45,
    },
    todayButtonText: {
        fontSize: 11,
        fontWeight: '800',
        color: colors.primary,
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
    browseSection: { gap: spacing.xs, margin: spacing.screenHorizontalPadding, },
    browseHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: spacing['2xs'],
    },
    browseTitle: { fontSize: 15, fontWeight: '800', color: colors.textPrimary },
    browseAllButton: { flexDirection: 'row', alignItems: 'center', gap: 2 },
    browseAllText: { fontSize: 12.5, fontWeight: '800', color: colors.primary },
    browseList: {
        borderRadius: radius.lg,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
        overflow: 'hidden',
    },
    browseRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        paddingHorizontal: spacing.sm,
        paddingVertical: 11,
    },
    browseIcon: {
        width: 32,
        height: 32,
        borderRadius: radius.full,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.surfaceLow,
    },
    browseRowText: { flex: 1, fontSize: 13, fontWeight: '700', color: colors.textPrimary },

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
}));

export default WorkoutSession;
