import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, View, Text, TouchableOpacity } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import {
    Calendar,
    CheckCircle,
    ChevronDown,
    Dumbbell,
    Play,
    UtensilsCrossed,
    Rows3,
    Timer,
} from 'lucide-react-native';
import { colors, withOpacity } from '../../Theme/colors';
import { spacing } from '../../Theme/spacing';
import WorkoutDateStrip from '../Workout/WorkoutDateStrip';
import { useWorkoutPlans, useWorkoutPlansLoading } from '../../Store/workoutPlansSlice';
import {
    applyOccurrencesToEvents,
    getEventsForDate,
    type CalendarEvent,
} from '../../Services/calendarEventService';
import {
    fetchOccurrencesForDate,
    toDateKey,
    todayDateKey,
    type WorkoutLog,
} from '../../Services/workoutLogService';
import { parseTimeToMinutes } from '../../Services/workoutPlanService';
import { Exercise, fetchExercisesBulk } from '../../Services/exerciseService';
import {
    describeItems,
    getMealPlansForDate,
    MEAL_TYPE_LABEL,
    type MealPlan,
    type MealType,
} from '../../Services/mealPlanService';
import { useMealPlans, useMealPlansLoading } from '../../Store/mealPlansSlice';
import { SkeletonBlock, SkeletonGroup } from '../../Components/Skeleton';
import { themedStyles } from '../../Theme/ThemeContext';

/** These three are a quick marker around training, not something to sit
 * and read — the timeline collapses them to one line instead of the full
 * meal card breakfast/lunch/dinner/snack get. */
const COMPACT_MEAL_TYPES: ReadonlySet<MealType> = new Set([
    'pre-workout',
    'post-workout',
    'supplement',
]);

// Day timeline for the Schedule tab, driven by the user's real plans.
//
// It reads the same two sources the Workout tab does — the recurring
// plan rules expanded for the selected date, plus that date's own
// occurrence rows — so a plan edited for a single day shows the edited
// exercises here too, and a rescheduled plan cannot make an already
// logged day disappear.

const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
];

const DAY_NAMES = [
    'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
];

/** "Bench Press, Incline DB, …" — the leading exercises, then a count. */
function describeExercises(exerciseIds: string[], cache: Record<string, Exercise>): string {
    if (exerciseIds.length === 0) return 'No exercises yet';
    const names = exerciseIds.map((id) => cache[id]?.name ?? id.replace(/_/g, ' '));
    const shown = names.slice(0, 3).join(', ');
    const rest = names.length - 3;
    return rest > 0 ? `${shown} +${rest} more` : shown;
}

/** ISO-8601 week number — the "Week 42" pill. */
function isoWeek(date: Date): number {
    const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    // The Thursday of the current week decides which year the week
    // belongs to, which is what makes this correct across New Year.
    target.setDate(target.getDate() + 3 - ((target.getDay() + 6) % 7));
    const firstThursday = new Date(target.getFullYear(), 0, 4);
    firstThursday.setDate(firstThursday.getDate() + 3 - ((firstThursday.getDay() + 6) % 7));
    return 1 + Math.round((target.getTime() - firstThursday.getTime()) / (7 * 86400000));
}

/** Splits "6:30 PM" for the timeline two-line time column. */
function splitTime(time: string): { clock: string; period: string } {
    const match = time.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (!match) return { clock: '--:--', period: '' };
    return {
        clock: `${match[1].padStart(2, '0')}:${match[2]}`,
        period: match[3].toUpperCase(),
    };
}

function formatClock(date: Date): string {
    const hours = date.getHours();
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const period = hours >= 12 ? 'PM' : 'AM';
    return `${String(hours % 12 || 12).padStart(2, '0')}:${minutes} ${period}`;
}

function NowMarker({ label }: { label: string }) {
    return (
        <View style={styles.nowRow}>
            <View style={styles.timeColumn} />
            <View style={styles.nodeColumn}>
                <View style={styles.nowDot} />
            </View>
            <View style={styles.nowLineWrapper}>
                <View style={styles.nowLine} />
                <View style={styles.nowPill}>
                    <Text style={styles.nowPillText}>Now • {label}</Text>
                </View>
            </View>
        </View>
    );
}

type TimelineEntry =
    | { key: string; minutes: number; kind: 'workout'; event: CalendarEvent }
    | { key: string; minutes: number; kind: 'meal'; meal: MealPlan };

const GAUGE_SIZE = 40;
const GAUGE_STROKE = 3;

export const ScheduleSession: React.FC = () => {
    const [selectedDate, setSelectedDate] = useState(() => new Date());
    const selectedDateKey = toDateKey(selectedDate);
    const isToday = selectedDateKey === todayDateKey();

    const workoutPlans = useWorkoutPlans();

    // This date's occurrence rows. They do double duty: overriding the
    // plan exercise list for a single day, and recording which sessions
    // were actually completed (what the gauge below counts).
    const [occurrences, setOccurrences] = useState<{ dateKey: string; rows: WorkoutLog[] }>({
        dateKey: '',
        rows: [],
    });
    const hasOccurrences = occurrences.dateKey === selectedDateKey;

    useEffect(() => {
        let cancelled = false;
        fetchOccurrencesForDate(selectedDateKey)
            .then((rows) => {
                if (!cancelled) setOccurrences({ dateKey: selectedDateKey, rows });
            })
            .catch(() => {
                // Non-fatal — the plan rules alone still render the day.
                if (!cancelled) setOccurrences({ dateKey: selectedDateKey, rows: [] });
            });
        return () => {
            cancelled = true;
        };
    }, [selectedDateKey]);

    // Sessions scheduled for the day, earliest first.
    const dayEvents = useMemo(() => {
        const merged = applyOccurrencesToEvents(
            getEventsForDate(selectedDate, workoutPlans),
            hasOccurrences ? occurrences.rows : [],
            workoutPlans,
        );
        return [...merged].sort(
            (a, b) => parseTimeToMinutes(a.time) - parseTimeToMinutes(b.time),
        );
    }, [selectedDate, workoutPlans, occurrences, hasOccurrences]);

    // Meal plans recur by weekday exactly like workout plans, so the
    // timeline can show both against the same clock.
    const mealPlans = useMealPlans();

    // The day is only knowable once all three sources have landed: the
    // two plan feeds decide what recurs today, and the occurrence rows
    // override them. Rendering earlier shows "Rest day" on a day that
    // has a workout on it.
    // Called unconditionally and combined afterwards. Inlining these
    // into one `||` expression would short-circuit past the second hook
    // whenever the first returned true — a different number of hooks
    // between renders, which React treats as a hard error.
    const plansLoading = useWorkoutPlansLoading();
    const mealsLoading = useMealPlansLoading();
    const isDayLoading = plansLoading || mealsLoading || !hasOccurrences;

    const dayMeals = useMemo(
        () => getMealPlansForDate(selectedDate, mealPlans),
        [selectedDate, mealPlans],
    );

    // Workouts and meals interleaved by time of day — one list, so the
    // timeline reads as the day actually runs rather than as two
    // separate sections.
    const timeline = useMemo(() => {
        const entries: TimelineEntry[] = [
            ...dayEvents.map((event) => ({
                key: `workout-${event.sourceId}`,
                minutes: parseTimeToMinutes(event.time),
                kind: 'workout' as const,
                event,
            })),
            ...dayMeals.map((meal) => ({
                key: `meal-${meal.id}`,
                minutes: parseTimeToMinutes(meal.time),
                kind: 'meal' as const,
                meal,
            })),
        ];
        return entries.sort((a, b) => a.minutes - b.minutes);
    }, [dayEvents, dayMeals]);

    // Real exercise names for the card subtitles.
    const [exerciseCache, setExerciseCache] = useState<Record<string, Exercise>>({});
    const dayExerciseIds = useMemo(() => {
        const ids = new Set<string>();
        dayEvents.forEach((event) => event.exerciseIds.forEach((id) => ids.add(id)));
        return Array.from(ids);
    }, [dayEvents]);

    useEffect(() => {
        const missing = dayExerciseIds.filter((id) => !exerciseCache[id]);
        if (missing.length === 0) return;

        let cancelled = false;
        fetchExercisesBulk(missing)
            .then((exercises) => {
                if (cancelled) return;
                setExerciseCache((prev) => {
                    const next = { ...prev };
                    exercises.forEach((exercise) => {
                        next[exercise.id] = exercise;
                    });
                    return next;
                });
            })
            .catch(() => {});

        return () => {
            cancelled = true;
        };
    }, [dayExerciseIds, exerciseCache]);

    const completedPlanIds = useMemo(
        () =>
            new Set(
                (hasOccurrences ? occurrences.rows : [])
                    .filter((row) => row.state === 'completed')
                    .map((row) => row.planId),
            ),
        [occurrences, hasOccurrences],
    );

    const completedCount = dayEvents.filter((event) =>
        completedPlanIds.has(event.sourceId),
    ).length;
    const completionPercent =
        dayEvents.length > 0 ? Math.round((completedCount / dayEvents.length) * 100) : 0;

    const gaugeRadius = (GAUGE_SIZE - GAUGE_STROKE) / 2;
    const gaugeCircumference = 2 * Math.PI * gaugeRadius;
    const gaugeDashOffset = gaugeCircumference * (1 - completionPercent / 100);

    // The now marker belongs only on today, and sits between the
    // sessions that have passed and those still to come.
    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const nowIndex = isToday
        ? timeline.filter((entry) => entry.minutes <= nowMinutes).length
        : -1;

    const renderMeal = (meal: MealPlan, isLast: boolean) => {
        const { clock, period } = splitTime(meal.time);

        // Supplement and pre/post-workout entries are a quick marker
        // around a training session, not a meal to sit and read about —
        // the full card (icon, item list) is more than they need, so
        // they collapse to one line: just the type and the name, next to
        // their time like everything else on the timeline.
        if (COMPACT_MEAL_TYPES.has(meal.mealType)) {
            return (
                <View
                    style={[
                        styles.timelineRow,
                        styles.compactTimelineRow,
                        isLast && styles.timelineRowLast,
                    ]}
                >
                    <View style={styles.timeColumn}>
                        <Text style={styles.timeText}>{clock}</Text>
                        <Text style={styles.periodText}>{period}</Text>
                    </View>

                    <View style={styles.nodeColumn}>
                        <View style={[styles.mealPip, styles.compactPip]}>
                            <View style={styles.mealPipDot} />
                        </View>
                        {!isLast ? <View style={styles.nodeLine} /> : null}
                    </View>

                    <View style={styles.eventCardWrapper}>
                        <View style={styles.compactMealRow}>
                            <Text style={styles.compactMealType} numberOfLines={1}>
                                {MEAL_TYPE_LABEL[meal.mealType]}
                            </Text>
                            <Text style={styles.compactMealName} numberOfLines={1}>
                                {meal.name}
                            </Text>
                        </View>
                    </View>
                </View>
            );
        }

        return (
            <View style={[styles.timelineRow, isLast && styles.timelineRowLast]}>
                <View style={styles.timeColumn}>
                    <Text style={styles.timeText}>{clock}</Text>
                    <Text style={styles.periodText}>{period}</Text>
                </View>

                <View style={styles.nodeColumn}>
                    <View style={styles.mealPip}>
                        <View style={styles.mealPipDot} />
                    </View>
                    {!isLast ? <View style={styles.nodeLine} /> : null}
                </View>

                <View style={styles.eventCardWrapper}>
                    <View style={styles.mealCard}>
                        <View style={styles.mealIcon}>
                            <UtensilsCrossed
                                size={17}
                                color={colors.secondary}
                                strokeWidth={2.2}
                            />
                        </View>
                        <View style={styles.mealText}>
                            <View style={styles.mealTitleRow}>
                                <Text style={styles.mealTitle} numberOfLines={1}>
                                    {meal.name}
                                </Text>
                                <View style={styles.mealTypePill}>
                                    <Text style={styles.mealTypeText}>
                                        {MEAL_TYPE_LABEL[meal.mealType]}
                                    </Text>
                                </View>
                            </View>
                            <Text style={styles.mealItems} numberOfLines={2}>
                                {describeItems(meal.items)}
                            </Text>
                        </View>
                    </View>
                </View>
            </View>
        );
    };

    const renderSession = (event: CalendarEvent, isLast: boolean) => {
        const { clock, period } = splitTime(event.time);
        const isDone = completedPlanIds.has(event.sourceId);

        return (
            <View style={[styles.timelineRow, isLast && styles.timelineRowLast]}>
                <View style={styles.timeColumn}>
                    <Text style={[styles.timeText, styles.timeTextPrimary]}>{clock}</Text>
                    <Text style={[styles.periodText, styles.periodTextPrimary]}>{period}</Text>
                </View>

                <View style={styles.nodeColumn}>
                    <View style={styles.nodePipHighlight}>
                        <View style={styles.nodeDotWhite} />
                    </View>
                    {!isLast ? <View style={styles.nodeLine} /> : null}
                </View>

                <View style={styles.eventCardWrapper}>
                    <View style={styles.workoutHeroCard}>
                        <View style={styles.heroGlow} />

                        <View style={styles.heroTopRow}>
                            <View style={styles.heroTopLeft}>
                                <View style={styles.heroBadge}>
                                    <Text style={styles.heroBadgeText}>
                                        {event.muscles.length > 0
                                            ? event.muscles.slice(0, 2).join(' & ')
                                            : 'Workout'}
                                    </Text>
                                </View>
                                <View style={styles.heroDurationRow}>
                                    <Timer
                                        size={13}
                                        color={withOpacity(colors.white, 0.85)}
                                        strokeWidth={2.4}
                                    />
                                    <Text style={styles.heroDurationText}>
                                        {event.exerciseIds.length} exercises
                                    </Text>
                                </View>
                            </View>
                            <View style={styles.heroIconCircle}>
                                {isDone ? (
                                    <CheckCircle size={17} color={colors.white} strokeWidth={2.2} />
                                ) : (
                                    <Dumbbell size={17} color={colors.white} strokeWidth={2.2} />
                                )}
                            </View>
                        </View>

                        <Text style={styles.heroTitle}>{event.title}</Text>
                        <Text style={styles.heroSubtitle} numberOfLines={2}>
                            {describeExercises(event.exerciseIds, exerciseCache)}
                        </Text>

                        <View style={styles.heroStatsRow}>
                            <View style={styles.heroStatsLeft}>
                                <View>
                                    <Text style={styles.heroStatLabel}>Scheduled</Text>
                                    <Text style={styles.heroStatValue}>{event.time}</Text>
                                </View>
                                <View style={styles.heroStatDivider} />
                                <View>
                                    <Text style={styles.heroStatLabel}>Status</Text>
                                    <Text style={styles.heroStatValue}>
                                        {isDone ? 'Logged' : 'Pending'}
                                    </Text>
                                </View>
                            </View>

                            <View style={styles.heroStartButton}>
                                <Text style={styles.heroStartButtonText}>
                                    {isDone ? 'Done' : 'Start'}
                                </Text>
                                {isDone ? null : (
                                    <Play
                                        size={13}
                                        color={colors.primary}
                                        strokeWidth={2.6}
                                        fill={colors.primary}
                                    />
                                )}
                            </View>
                        </View>
                    </View>
                </View>
            </View>
        );
    };

    return (
        <View style={styles.root}>
            <ScrollView
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
            >
                {/* Month / view selector bar */}
                <View style={styles.monthBarRow}>
                    <View style={styles.monthBarLeft}>
                        <TouchableOpacity activeOpacity={0.7} style={styles.monthPill}>
                            <Text style={styles.monthPillText}>
                                {MONTH_NAMES[selectedDate.getMonth()]} {selectedDate.getFullYear()}
                            </Text>
                            <ChevronDown size={16} color={colors.textSecondary} strokeWidth={2.4} />
                        </TouchableOpacity>
                        <View style={styles.weekPill}>
                            <Text style={styles.weekPillText}>Week {isoWeek(selectedDate)}</Text>
                        </View>
                    </View>

                    <View style={styles.viewToggle}>
                        <TouchableOpacity
                            activeOpacity={0.8}
                            style={[styles.viewToggleButton, styles.viewToggleButtonActive]}
                        >
                            <Rows3 size={16} color={colors.primary} strokeWidth={2.4} />
                        </TouchableOpacity>
                        <TouchableOpacity activeOpacity={0.8} style={styles.viewToggleButton}>
                            <Calendar size={16} color={colors.textSecondary} strokeWidth={2.2} />
                        </TouchableOpacity>
                    </View>
                </View>

                {/* Date strip — the same component the Workout tab uses, so
                    both tabs scroll, centre and span dates identically. */}
                <WorkoutDateStrip
                    selectedDate={selectedDate}
                    onSelectDate={setSelectedDate}
                    screenHorizontalPadding={spacing.screenHorizontalPadding}
                />

                {/* Day highlights */}
                <View style={styles.highlightsCard}>
                    <View style={styles.highlightsLeft}>
                        <View style={styles.gaugeWrapper}>
                            <Svg width={GAUGE_SIZE} height={GAUGE_SIZE}>
                                <Circle
                                    cx={GAUGE_SIZE / 2}
                                    cy={GAUGE_SIZE / 2}
                                    r={gaugeRadius}
                                    stroke={colors.surfaceContainer}
                                    strokeWidth={GAUGE_STROKE}
                                    fill="none"
                                />
                                <Circle
                                    cx={GAUGE_SIZE / 2}
                                    cy={GAUGE_SIZE / 2}
                                    r={gaugeRadius}
                                    stroke={colors.primary}
                                    strokeWidth={GAUGE_STROKE}
                                    strokeDasharray={gaugeCircumference}
                                    strokeDashoffset={gaugeDashOffset}
                                    strokeLinecap="round"
                                    fill="none"
                                    rotation={-90}
                                    originX={GAUGE_SIZE / 2}
                                    originY={GAUGE_SIZE / 2}
                                />
                            </Svg>
                            <Text style={styles.gaugeText}>
                                {isDayLoading ? '—' : `${completionPercent}%`}
                            </Text>
                        </View>
                        <View style={styles.highlightsTextBlock}>
                            <Text style={styles.highlightsTitle}>
                                {DAY_NAMES[selectedDate.getDay()]} Plan Flow
                            </Text>
                            <Text style={styles.highlightsSubtitle}>
                                {isDayLoading
                                    ? 'Loading your day…'
                                    : dayEvents.length === 0
                                    ? 'Nothing scheduled for this day'
                                    : `${completedCount} of ${dayEvents.length} session${
                                          dayEvents.length === 1 ? '' : 's'
                                      } logged`}
                            </Text>
                        </View>
                    </View>
                    <View style={styles.highlightsIconStack}>
                        <View
                            style={[styles.highlightsIconChip, { backgroundColor: colors.primary }]}
                        >
                            <Dumbbell size={12} color={colors.white} strokeWidth={2.4} />
                        </View>
                    </View>
                </View>

                {/* Vertical timeline */}
                {isDayLoading ? (
                    <View style={styles.timeline}>
                        {[0, 1].map((row) => (
                            <SkeletonGroup key={row} style={styles.timelineRow}>
                                <View style={styles.timeColumn}>
                                    <SkeletonBlock width={36} height={12} />
                                </View>
                                <View style={styles.nodeColumn}>
                                    <SkeletonBlock width={14} height={14} radius={7} />
                                </View>
                                <View style={styles.eventCardWrapper}>
                                    <SkeletonBlock height={96} radius={18} />
                                </View>
                            </SkeletonGroup>
                        ))}
                    </View>
                ) : timeline.length === 0 ? (
                    <View style={styles.emptyCard}>
                        <Text style={styles.emptyTitle}>Rest day</Text>
                        <Text style={styles.emptySubtitle}>
                            Nothing is scheduled for this date. Workout and meal plans show up
                            here on the weekdays they repeat on.
                        </Text>
                    </View>
                ) : (
                    <View style={styles.timeline}>
                        {timeline.map((entry, index) => {
                            const isLast = index === timeline.length - 1;
                            return (
                                <React.Fragment key={entry.key}>
                                    {index === nowIndex ? (
                                        <NowMarker label={formatClock(now)} />
                                    ) : null}
                                    {entry.kind === 'workout'
                                        ? renderSession(entry.event, isLast)
                                        : renderMeal(entry.meal, isLast)}
                                </React.Fragment>
                            );
                        })}

                        {/* Everything today is already behind us. */}
                        {nowIndex === timeline.length ? (
                            <NowMarker label={formatClock(now)} />
                        ) : null}
                    </View>
                )}

                <View style={styles.fabSpacer} />
            </ScrollView>
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
    monthBarRow: {
        marginHorizontal: spacing.screenHorizontalPadding,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    monthBarLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    monthPill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        backgroundColor: colors.surfaceContainer,
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 18,
    },
    monthPillText: {
        fontSize: 15,
        fontWeight: '800',
        color: colors.textPrimary,
        letterSpacing: -0.2,
    },
    weekPill: {
        backgroundColor: withOpacity(colors.primary, 0.14),
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 12,
    },
    weekPillText: {
        fontSize: 11,
        fontWeight: '700',
        color: colors.primary,
    },
    viewToggle: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 2,
        backgroundColor: colors.surfaceLow,
        borderRadius: 18,
        padding: 3,
    },
    viewToggleButton: {
        width: 32,
        height: 32,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
    },
    viewToggleButtonActive: {
        backgroundColor: colors.surface,
        shadowColor: colors.black,
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.08,
        shadowRadius: 3,
        elevation: 1,
    },
    highlightsCard: {
        marginHorizontal: spacing.screenHorizontalPadding,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: colors.surfaceLow,
        borderRadius: 18,
        padding: 14,
    },
    highlightsLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        flexShrink: 1,
    },
    gaugeWrapper: {
        width: GAUGE_SIZE,
        height: GAUGE_SIZE,
        alignItems: 'center',
        justifyContent: 'center',
    },
    gaugeText: {
        position: 'absolute',
        fontSize: 10,
        fontWeight: '800',
        color: colors.textPrimary,
    },
    highlightsTextBlock: {
        flexShrink: 1,
    },
    highlightsTitle: {
        fontSize: 13.5,
        fontWeight: '800',
        color: colors.textPrimary,
    },
    highlightsSubtitle: {
        fontSize: 12,
        fontWeight: '500',
        color: colors.textSecondary,
        marginTop: 2,
    },
    highlightsIconStack: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    highlightsIconChip: {
        width: 24,
        height: 24,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 2,
        borderColor: colors.surfaceLow,
    },
    emptyCard: {
        marginHorizontal: spacing.screenHorizontalPadding,
        padding: 18,
        borderRadius: 20,
        backgroundColor: colors.surface,
        gap: 6,
    },
    emptyTitle: {
        fontSize: 15,
        fontWeight: '800',
        color: colors.textPrimary,
    },
    emptySubtitle: {
        fontSize: 12.5,
        lineHeight: 18,
        color: colors.textSecondary,
    },
    mealPip: {
        width: 14,
        height: 14,
        borderRadius: 7,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: withOpacity(colors.secondary, 0.22),
    },
    mealPipDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: colors.secondary,
    },
    // Deliberately lighter than the workout hero card: meals are markers
    // through the day, not the thing the day is built around.
    mealCard: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        padding: 12,
        borderRadius: 16,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
    },
    mealIcon: {
        width: 34,
        height: 34,
        borderRadius: 11,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: withOpacity(colors.secondary, 0.14),
    },
    mealText: { flex: 1, gap: 2 },
    mealTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    mealTitle: {
        flex: 1,
        fontSize: 13.5,
        fontWeight: '800',
        color: colors.textPrimary,
    },
    mealTypePill: {
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 10,
        backgroundColor: withOpacity(colors.secondary, 0.14),
    },
    mealTypeText: {
        fontSize: 9.5,
        fontWeight: '800',
        color: colors.secondary,
    },
    mealItems: {
        fontSize: 11.5,
        lineHeight: 16,
        color: colors.textSecondary,
    },
    // The one-line variant for supplement/pre-/post-workout entries —
    // no card, no icon, just the type and name beside their time.
    // Its row overrides timelineRow's flex-start with 'center': that
    // alignment is right for the full meal/workout cards (tall, so their
    // top should line up with the time and the node dot) but leaves a
    // single line of text sitting below a top-pinned dot instead of
    // beside it.
    compactTimelineRow: {
        alignItems: 'center',
    },
    compactPip: {
        // A touch smaller than the full meal pip: this row carries a lot
        // less visual weight, and a same-size node would overstate it.
        transform: [{ scale: 0.8 }],
        // Nudged up from dead-center — sitting exactly level with the
        // text's middle read as low against the label's cap-height.
        marginTop: 0,
    },
    compactMealRow: {
        flexDirection: 'row',
        alignItems: 'baseline',
        gap: 6,
    },
    compactMealType: {
        fontSize: 10.5,
        fontWeight: '800',
        letterSpacing: 0.3,
        textTransform: 'uppercase',
        color: colors.textMuted,
    },
    compactMealName: {
        flex: 1,
        fontSize: 12.5,
        fontWeight: '600',
        color: colors.textSecondary,
    },
    timeline: {
        marginHorizontal: spacing.screenHorizontalPadding,
        marginTop: 4,
    },
    timelineRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        marginBottom: 12,
    },
    timelineRowLast: {
        marginBottom: 0,
    },
    timeColumn: {
        width: 44,
        alignItems: 'flex-end',
        paddingTop: 4,
        paddingRight: 8,
    },
    timeText: {
        fontSize: 12,
        fontWeight: '800',
        color: colors.textPrimary,
    },
    timeTextPrimary: {
        color: colors.primary,
    },
    periodText: {
        fontSize: 9,
        fontWeight: '700',
        color: colors.textSecondary,
        marginTop: 1,
    },
    periodTextPrimary: {
        color: colors.primary,
    },
    nodeColumn: {
        width: 20,
        alignItems: 'center',
    },
    nodePipHighlight: {
        width: 18,
        height: 18,
        borderRadius: 9,
        backgroundColor: colors.primary,
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 6,
        shadowColor: colors.primary,
        shadowOpacity: 0.4,
        shadowRadius: 6,
    },
    nodeDotWhite: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: colors.white,
    },
    nodeLine: {
        width: 2,
        flex: 1,
        minHeight: 20,
        backgroundColor: colors.surfaceContainer,
        marginTop: 2,
    },
    eventCardWrapper: {
        flex: 1,
        minWidth: 0,
    },
    nowRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
    },
    nowDot: {
        width: 9,
        height: 9,
        borderRadius: 4.5,
        backgroundColor: colors.primary,
    },
    nowLineWrapper: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    nowLine: {
        flex: 1,
        height: 2,
        backgroundColor: withOpacity(colors.primary, 0.3),
    },
    nowPill: {
        backgroundColor: withOpacity(colors.primary, 0.14),
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 12,
    },
    nowPillText: {
        fontSize: 10,
        fontWeight: '800',
        color: colors.primary,
        letterSpacing: 0.2,
    },
    workoutHeroCard: {
        borderRadius: 20,
        padding: 16,
        backgroundColor: colors.primary,
        overflow: 'hidden',
        shadowColor: colors.primary,
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.32,
        shadowRadius: 20,
        elevation: 6,
    },
    heroGlow: {
        position: 'absolute',
        right: -24,
        bottom: -24,
        width: 112,
        height: 112,
        borderRadius: 56,
        backgroundColor: withOpacity(colors.white, 0.12),
    },
    heroTopRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
    },
    heroTopLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        flexWrap: 'wrap',
    },
    heroBadge: {
        backgroundColor: withOpacity(colors.white, 0.2),
        paddingHorizontal: 9,
        paddingVertical: 3,
        borderRadius: 10,
    },
    heroBadgeText: {
        fontSize: 10,
        fontWeight: '800',
        color: colors.white,
        letterSpacing: 0.3,
    },
    heroDurationRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    heroDurationText: {
        fontSize: 11.5,
        fontWeight: '600',
        color: withOpacity(colors.white, 0.85),
    },
    heroIconCircle: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: withOpacity(colors.white, 0.2),
        alignItems: 'center',
        justifyContent: 'center',
    },
    heroTitle: {
        fontSize: 17,
        fontWeight: '800',
        color: colors.white,
        marginTop: 10,
        letterSpacing: -0.2,
    },
    heroSubtitle: {
        fontSize: 12,
        fontWeight: '500',
        color: withOpacity(colors.white, 0.85),
        marginTop: 3,
    },
    heroStatsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: 14,
        paddingTop: 12,
        borderTopWidth: 1,
        borderTopColor: withOpacity(colors.white, 0.18),
    },
    heroStatsLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    heroStatLabel: {
        fontSize: 9,
        fontWeight: '700',
        color: withOpacity(colors.white, 0.75),
        letterSpacing: 0.4,
        textTransform: 'uppercase',
    },
    heroStatValue: {
        fontSize: 13,
        fontWeight: '800',
        color: colors.white,
        marginTop: 2,
    },
    heroStatDivider: {
        width: 1,
        height: 22,
        backgroundColor: withOpacity(colors.white, 0.2),
    },
    heroStartButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: colors.surface,
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 18,
    },
    heroStartButtonText: {
        fontSize: 12.5,
        fontWeight: '800',
        color: colors.primary,
    },
    fabSpacer: {
        height: 56,
    },
}));

export default ScheduleSession;
