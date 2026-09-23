// The dashboard's "Today's Schedule": today's workouts and meals in one
// horizontal slider, sorted by time. It replaces the separate Today's
// Workout and Upcoming Meal cards and keeps what each did — a workout
// slide opens the Workout tab on that session, a meal slide logs the
// meal in place (once its time has come) or opens the Nutrition tab.
//
// Data comes from the same hooks the two tabs use (useDayWorkoutEvents,
// useDayMeals), so the slider cannot disagree with them about today. The
// slider opens on the session that matters right now: the latest one that
// is due and unlogged, else the next upcoming, else the last one done.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    LayoutChangeEvent,
    NativeScrollEvent,
    NativeSyntheticEvent,
    ScrollView,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { ArrowRight, Check, Dumbbell, UtensilsCrossed } from 'lucide-react-native';
import { colors, withOpacity } from '../../Theme/colors';
import { themedStyles } from '../../Theme/ThemeContext';
import { useToday } from '../../Hooks/useNow';
import { useDayMeals, type DayMealCard } from '../../Hooks/useDayMeals';
import { useDayWorkoutEvents } from '../../Hooks/useDayWorkoutEvents';
import type { CalendarEvent } from '../../Services/calendarEventService';
import { MEAL_TYPE_LABEL, sumItemNutrition } from '../../Services/mealPlanService';
import {
    describeSession,
    pickFocusSession,
    sessionPhase,
    type SessionPhase,
} from '../../Services/sessionSchedule';
import { parseTimeToMinutes } from '../../Services/workoutPlanService';
import { useMealPlansLoading } from '../../Store/mealPlansSlice';
import { useWorkoutPlansLoading } from '../../Store/workoutPlansSlice';
import { useDashboardReady } from './DashboardLoadGate';

export interface TodaysScheduleSliderProps {
    /** Opens the Workout tab scrolled to this plan. */
    onOpenWorkout?: (planId: string) => void;
    /** Opens the Nutrition tab scrolled to this meal plan. */
    onOpenMeal?: (planId: string) => void;
    /** For an empty day: takes the user to plan something. */
    onViewWorkouts?: () => void;
    onViewMeals?: () => void;
}

type Slide =
    | { kind: 'workout'; key: string; time: string; isLogged: boolean; event: CalendarEvent }
    | { kind: 'meal'; key: string; time: string; isLogged: boolean; card: DayMealCard };

const SLIDE_GAP = 12;
/** The scroller clips its children, which cuts off a card's shadow. It
    extends this far past the card on each side (a negative margin) and
    pads its content by the same amount, so the shadow has room and the
    card still lines up with the others. */
const SHADOW_ROOM = 14;

const WORKOUT_BUTTON_LABEL: Record<SessionPhase, string> = {
    upcoming: 'View Workout',
    due: 'Log Workout',
    logged: 'View Log',
};

export const TodaysScheduleSlider: React.FC<TodaysScheduleSliderProps> = ({
    onOpenWorkout,
    onOpenMeal,
    onViewWorkouts,
    onViewMeals,
}) => {
    const { now, today } = useToday();
    const { dayEvents, completedPlanIds, hasOccurrencesForDay } = useDayWorkoutEvents(today);
    const { dayCards, hasLogsForDay, loggingPlanId, logMeal } = useDayMeals(today);

    const loaded = hasOccurrencesForDay && hasLogsForDay;

    // The day's rows can be in hand while the plan stores are still
    // waiting on their first Firestore snapshot — the day then looks
    // empty for a moment and fills in. Every section of the dashboard
    // derives from those stores, so it is awaited once, here.
    // Both hooks are called unconditionally — `a() || b()` would skip the
    // second one whenever the first is true.
    const workoutPlansLoading = useWorkoutPlansLoading();
    const mealPlansLoading = useMealPlansLoading();
    useDashboardReady('plans', !workoutPlansLoading && !mealPlansLoading);
    useDashboardReady('schedule', loaded);

    const slides = useMemo<Slide[]>(() => {
        if (!loaded) return [];
        const workouts: Slide[] = dayEvents.map((event) => ({
            kind: 'workout',
            key: `workout:${event.sourceId}`,
            time: event.time,
            isLogged: completedPlanIds.has(event.sourceId),
            event,
        }));
        const meals: Slide[] = dayCards.map((card) => ({
            kind: 'meal',
            key: `meal:${card.planId}`,
            time: card.time,
            isLogged: card.isLogged,
            card,
        }));
        return [...workouts, ...meals].sort(
            (a, b) => parseTimeToMinutes(a.time) - parseTimeToMinutes(b.time),
        );
    }, [loaded, dayEvents, completedPlanIds, dayCards]);

    const focused = slides.length > 0 ? pickFocusSession(slides, now) : null;
    const focusIndex = focused ? slides.indexOf(focused.session) : 0;

    const [containerWidth, setContainerWidth] = useState(0);
    // One slide fills the full width; the next is entirely off-screen and
    // is reached by swiping (the dots show there is more).
    const slideWidth = containerWidth;
    const step = slideWidth + SLIDE_GAP;

    const scroller = useRef<ScrollView>(null);
    const openedOnFocus = useRef(false);
    const [activeIndex, setActiveIndex] = useState(0);

    // Land on the session that matters, once, when the day first loads.
    useEffect(() => {
        if (openedOnFocus.current || slides.length === 0 || slideWidth === 0) return;
        openedOnFocus.current = true;
        setActiveIndex(focusIndex);
        if (focusIndex > 0) {
            requestAnimationFrame(() =>
                scroller.current?.scrollTo({ x: focusIndex * step, animated: false }),
            );
        }
    }, [slides.length, slideWidth, focusIndex, step]);

    const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
        if (step <= 0) return;
        const index = Math.round(event.nativeEvent.contentOffset.x / step);
        setActiveIndex(Math.min(Math.max(index, 0), slides.length - 1));
    };

    const renderWorkout = (slide: Extract<Slide, { kind: 'workout' }>, phase: SessionPhase) => {
        const { event } = slide;
        const exerciseCount = event.exerciseIds.length;
        const label =
            event.muscles.length > 0 ? event.muscles.slice(0, 2).join(' & ') : 'Workout';
        const open = () => onOpenWorkout?.(event.sourceId);

        return (
            <TouchableOpacity
                activeOpacity={0.9}
                onPress={open}
                style={styles.card}
                accessibilityRole="button"
                accessibilityLabel={`Open ${event.title}`}
            >
                <View style={styles.topRow}>
                    <View style={[styles.pill, { backgroundColor: withOpacity(colors.primary, 0.14) }]}>
                        <Dumbbell size={12} color={colors.primary} strokeWidth={2.4} />
                        <Text style={[styles.pillText, { color: colors.primary }]} numberOfLines={1}>
                            {label}
                        </Text>
                    </View>
                    <Text style={styles.timeText}>{event.time}</Text>
                </View>

                <Text style={styles.title} numberOfLines={2}>
                    {event.title}
                </Text>
                <Text style={styles.meta}>
                    {exerciseCount} {exerciseCount === 1 ? 'exercise' : 'exercises'}
                </Text>

                <View style={styles.footerRow}>
                    <Text style={[styles.status, statusTone(phase)]} numberOfLines={1}>
                        {describeSession(slide, phase, now)}
                    </Text>
                    <TouchableOpacity
                        activeOpacity={0.85}
                        onPress={open}
                        style={[styles.button, { backgroundColor: colors.primary }]}
                        accessibilityRole="button"
                    >
                        <Text style={styles.buttonText}>{WORKOUT_BUTTON_LABEL[phase]}</Text>
                        <ArrowRight size={15} color={colors.white} strokeWidth={2.4} />
                    </TouchableOpacity>
                </View>
            </TouchableOpacity>
        );
    };

    const renderMeal = (slide: Extract<Slide, { kind: 'meal' }>, phase: SessionPhase) => {
        const { card } = slide;
        const nutrition = sumItemNutrition(card.items);
        const isLogging = loggingPlanId === card.planId;
        // Logging needs the plan itself; a meal whose plan was deleted
        // still shows from its row, with nothing left to log it against.
        const canLog = phase === 'due' && !!card.plan && !isLogging;
        const open = () => onOpenMeal?.(card.planId);

        return (
            <TouchableOpacity
                activeOpacity={0.9}
                onPress={open}
                style={styles.card}
                accessibilityRole="button"
                accessibilityLabel={`Open ${card.name}`}
            >
                <View style={styles.topRow}>
                    <View style={[styles.pill, { backgroundColor: withOpacity(colors.secondary, 0.14) }]}>
                        <UtensilsCrossed size={12} color={colors.secondary} strokeWidth={2.4} />
                        <Text style={[styles.pillText, { color: colors.secondary }]} numberOfLines={1}>
                            {MEAL_TYPE_LABEL[card.mealType]}
                        </Text>
                    </View>
                    <Text style={styles.timeText}>{card.time}</Text>
                </View>

                <Text style={styles.title} numberOfLines={2}>
                    {card.name}
                </Text>
                <Text style={styles.meta}>
                    {nutrition
                        ? `${Math.round(nutrition.calories)} kcal • ${Math.round(nutrition.protein)}g Protein`
                        : `${card.items.length} ${card.items.length === 1 ? 'item' : 'items'}`}
                </Text>

                <View style={styles.footerRow}>
                    <Text style={[styles.status, statusTone(phase)]} numberOfLines={1}>
                        {describeSession(slide, phase, now)}
                    </Text>
                    <TouchableOpacity
                        activeOpacity={0.85}
                        onPress={() => {
                            if (canLog && card.plan) void logMeal(card.plan);
                        }}
                        disabled={!canLog}
                        style={[
                            styles.button,
                            { backgroundColor: phase === 'logged' ? colors.success : colors.secondary },
                            // Not yet time, or mid-save: visibly unavailable
                            // rather than a button that silently does nothing.
                            (phase === 'upcoming' || isLogging) && styles.buttonDisabled,
                        ]}
                        accessibilityRole="button"
                        accessibilityLabel={
                            phase === 'logged'
                                ? `${card.name} logged`
                                : phase === 'upcoming'
                                  ? `${card.name} can be logged from ${card.time}`
                                  : `Log ${card.name}`
                        }
                    >
                        {phase === 'logged' ? (
                            <Check size={15} color={colors.white} strokeWidth={2.8} />
                        ) : null}
                        <Text style={styles.buttonText}>
                            {isLogging ? 'Saving…' : phase === 'logged' ? 'Logged' : 'Log Meal'}
                        </Text>
                    </TouchableOpacity>
                </View>
            </TouchableOpacity>
        );
    };

    return (
        <View style={styles.wrapper} onLayout={(e: LayoutChangeEvent) => setContainerWidth(e.nativeEvent.layout.width)}>
            <View style={styles.headerRow}>
                <Text style={styles.sectionTitle}>Today's Schedule</Text>
                {slides.length > 0 ? (
                    <Text style={styles.count}>
                        {slides.length} {slides.length === 1 ? 'event' : 'events'}
                    </Text>
                ) : null}
            </View>

            {!loaded ? (
                <View style={[styles.card, styles.emptyCard]}>
                    <Text style={styles.meta}>Loading…</Text>
                </View>
            ) : slides.length === 0 ? (
                <View style={[styles.card, styles.emptyCard]}>
                    <Text style={styles.title}>Nothing scheduled today</Text>
                    <Text style={styles.meta}>Plan a workout or a meal to see it here.</Text>
                    <View style={styles.emptyActions}>
                        <TouchableOpacity
                            activeOpacity={0.85}
                            onPress={onViewWorkouts}
                            style={[styles.button, { backgroundColor: colors.primary }]}
                        >
                            <Text style={styles.buttonText}>Plan Workout</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            activeOpacity={0.85}
                            onPress={onViewMeals}
                            style={[styles.button, { backgroundColor: colors.secondary }]}
                        >
                            <Text style={styles.buttonText}>Plan Meal</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            ) : slideWidth > 0 ? (
                <>
                    <ScrollView
                        ref={scroller}
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        snapToInterval={step}
                        snapToAlignment="start"
                        decelerationRate="fast"
                        disableIntervalMomentum
                        scrollEventThrottle={16}
                        onScroll={onScroll}
                        // Bottom room so the card's shadow is not clipped by the scroller.
                        style={{ marginHorizontal: -SHADOW_ROOM }}
                        contentContainerStyle={{
                            gap: SLIDE_GAP,
                            paddingHorizontal: SHADOW_ROOM,
                            paddingBottom: 22,
                        }}
                    >
                        {slides.map((slide) => {
                            const phase = sessionPhase(slide, now);
                            return (
                                <View key={slide.key} style={{ width: slideWidth }}>
                                    {slide.kind === 'workout'
                                        ? renderWorkout(slide, phase)
                                        : renderMeal(slide, phase)}
                                </View>
                            );
                        })}
                    </ScrollView>

                    {slides.length > 1 ? (
                        <View style={styles.dots}>
                            {slides.map((slide, index) => (
                                <View
                                    key={slide.key}
                                    style={[styles.dot, index === activeIndex && styles.dotActive]}
                                />
                            ))}
                        </View>
                    ) : null}
                </>
            ) : null}
        </View>
    );
};

function statusTone(phase: SessionPhase) {
    if (phase === 'due') return styles.statusDue;
    if (phase === 'logged') return styles.statusLogged;
    return null;
}

const styles = themedStyles(() => ({
    wrapper: {
        gap: 10,
    },
    headerRow: {
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
    count: {
        fontSize: 12,
        fontWeight: '600',
        color: colors.textSecondary,
    },
    card: {
        backgroundColor: colors.surface,
        borderRadius: 24,
        padding: 18,
        minHeight: 156,
        shadowColor: colors.primary,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.08,
        shadowRadius: 20,
        elevation: 3,
    },
    emptyCard: {
        justifyContent: 'center',
        gap: 4,
    },
    emptyActions: {
        flexDirection: 'row',
        gap: 10,
        marginTop: 14,
    },
    topRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 10,
    },
    pill: {
        flexShrink: 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        borderRadius: 10,
        paddingHorizontal: 10,
        paddingVertical: 4,
    },
    pillText: {
        flexShrink: 1,
        fontSize: 11,
        fontWeight: '800',
    },
    timeText: {
        fontSize: 12.5,
        fontWeight: '700',
        color: colors.textSecondary,
    },
    title: {
        marginTop: 12,
        fontSize: 20,
        fontWeight: '800',
        color: colors.textPrimary,
        letterSpacing: -0.3,
    },
    meta: {
        marginTop: 4,
        fontSize: 12.5,
        fontWeight: '500',
        color: colors.textSecondary,
    },
    footerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        marginTop: 'auto',
        paddingTop: 16,
    },
    status: {
        flex: 1,
        fontSize: 12.5,
        fontWeight: '600',
        color: colors.textSecondary,
    },
    // Due is the one state asking the user to act, so it alone takes the
    // accent; logged settles into the success tone.
    statusDue: {
        color: colors.secondary,
        fontWeight: '800',
    },
    statusLogged: {
        color: colors.success,
        fontWeight: '800',
    },
    button: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 22,
    },
    buttonDisabled: {
        opacity: 0.4,
    },
    buttonText: {
        fontSize: 13,
        fontWeight: '800',
        color: colors.white,
    },
    dots: {
        flexDirection: 'row',
        justifyContent: 'center',
        gap: 6,
    },
    dot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: colors.surfaceContainer,
    },
    dotActive: {
        width: 18,
        backgroundColor: colors.primary,
    },
}));

export default TodaysScheduleSlider;
