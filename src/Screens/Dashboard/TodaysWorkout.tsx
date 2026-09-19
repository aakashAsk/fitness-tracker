// The dashboard's "Today's Workout" card — today's live session, read
// from the same place the Workout tab reads it (useDayWorkoutEvents) and
// timed by the same rules as the meal card (sessionSchedule).
//
// It deliberately does not log anything itself. Logging a workout means
// entering sets, reps and weight per exercise, which lives in the Workout
// tab; tapping here takes the user there, scrolled to this session.
import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { ArrowRight, Dumbbell, Timer } from 'lucide-react-native';
import { colors, withOpacity } from '../../Theme/colors';
import { themedStyles } from '../../Theme/ThemeContext';
import { useToday } from '../../Hooks/useNow';
import { useDayWorkoutEvents } from '../../Hooks/useDayWorkoutEvents';
import {
    countOtherDue,
    describeSession,
    pickFocusSession,
    type SessionPhase,
} from '../../Services/sessionSchedule';

export interface TodaysWorkoutCardProps {
    /** Opens the Workout tab scrolled to this plan. */
    onOpenWorkout?: (planId: string) => void;
    onViewAll?: () => void;
}

const BUTTON_LABEL: Record<SessionPhase, string> = {
    upcoming: 'View Workout',
    due: 'Log Workout',
    logged: 'View Log',
};

export const TodaysWorkoutCard: React.FC<TodaysWorkoutCardProps> = ({
    onOpenWorkout,
    onViewAll,
}) => {
    const { now, today } = useToday();
    const { dayEvents, completedPlanIds, hasOccurrencesForDay } = useDayWorkoutEvents(today);

    const sessions = useMemo(
        () =>
            dayEvents.map((event) => ({
                event,
                time: event.time,
                isLogged: completedPlanIds.has(event.sourceId),
            })),
        [dayEvents, completedPlanIds],
    );
    const focused = pickFocusSession(sessions, now);
    const event = focused?.session.event;

    // Whether a session is logged is only known once today's occurrences
    // arrive. Until then the phase could read "Log Workout" and flip to
    // "View Log" a moment later, so the status stays quiet instead.
    const phaseKnown = hasOccurrencesForDay;
    const otherDue = focused ? countOtherDue(sessions, focused.session, now) : 0;
    const status = !focused
        ? 'Rest day — nothing scheduled'
        : !phaseKnown
          ? ''
          : describeSession(focused.session, focused.phase, now) +
            (otherDue > 0 ? ` · +${otherDue} earlier not logged` : '');

    const categoryLabel = event
        ? event.muscles.length > 0
            ? event.muscles.slice(0, 2).join(' & ')
            : 'Workout'
        : 'Rest Day';
    const exerciseCount = event?.exerciseIds.length ?? 0;

    const open = () => {
        if (event) onOpenWorkout?.(event.sourceId);
        else onViewAll?.();
    };

    return (
        <View style={styles.wrapper}>
            <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionTitle}>Today's Workout</Text>
                <TouchableOpacity activeOpacity={0.7} onPress={onViewAll}>
                    <Text style={styles.viewAllText}>View All</Text>
                </TouchableOpacity>
            </View>

            <TouchableOpacity
                activeOpacity={0.9}
                onPress={open}
                style={styles.card}
                accessibilityRole="button"
                accessibilityLabel={event ? `Open ${event.title}` : 'Open workouts'}
            >
                <View style={styles.glowAccent} />

                <View style={styles.headerRow}>
                    <View style={styles.titleColumn}>
                        <View style={styles.categoryPill}>
                            <Text style={styles.categoryPillText}>{categoryLabel}</Text>
                        </View>
                        <Text style={styles.workoutTitle} numberOfLines={2}>
                            {event ? event.title : 'No workout today'}
                        </Text>
                        {event ? (
                            <View style={styles.metaRow}>
                                <View style={styles.metaItem}>
                                    <Timer size={14} color={colors.textSecondary} strokeWidth={2.2} />
                                    <Text style={styles.metaText}>{event.time}</Text>
                                </View>
                                <Text style={styles.metaSeparator}>•</Text>
                                <View style={styles.metaItem}>
                                    <Dumbbell size={14} color={colors.textSecondary} strokeWidth={2.2} />
                                    <Text style={styles.metaText}>
                                        {exerciseCount} {exerciseCount === 1 ? 'exercise' : 'exercises'}
                                    </Text>
                                </View>
                            </View>
                        ) : null}
                    </View>

                    <View style={styles.thumbnail}>
                        <Dumbbell size={26} color={colors.primary} strokeWidth={2} />
                    </View>
                </View>

                <View style={styles.footerRow}>
                    {/* The slot the placeholder participant avatars held —
                        there is no social data behind them, so it carries
                        the session's real status instead. */}
                    <Text
                        style={[
                            styles.statusText,
                            phaseKnown && focused?.phase === 'due' && styles.statusTextDue,
                            phaseKnown && focused?.phase === 'logged' && styles.statusTextLogged,
                        ]}
                        numberOfLines={2}
                    >
                        {status}
                    </Text>

                    <TouchableOpacity activeOpacity={0.85} onPress={open} style={styles.startButton}>
                        <Text style={styles.startButtonText}>
                            {!focused
                                ? 'Plan Workout'
                                : !phaseKnown
                                  ? 'Open Workout'
                                  : BUTTON_LABEL[focused.phase]}
                        </Text>
                        <ArrowRight size={16} color={colors.white} strokeWidth={2.4} />
                    </TouchableOpacity>
                </View>
            </TouchableOpacity>
        </View>
    );
};

const styles = themedStyles(() => ({
    wrapper: {
        gap: 10,
    },
    sectionHeaderRow: {
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
    viewAllText: {
        fontSize: 13,
        fontWeight: '700',
        color: colors.primary,
    },
    card: {
        backgroundColor: colors.surface,
        borderRadius: 24,
        padding: 18,
        overflow: 'hidden',
        shadowColor: colors.primary,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.08,
        shadowRadius: 20,
        elevation: 3,
    },
    glowAccent: {
        position: 'absolute',
        right: -32,
        bottom: -32,
        width: 176,
        height: 176,
        borderRadius: 88,
        backgroundColor: withOpacity(colors.primary, 0.1),
    },
    headerRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
    },
    titleColumn: {
        flex: 1,
        paddingRight: 12,
    },
    categoryPill: {
        alignSelf: 'flex-start',
        backgroundColor: withOpacity(colors.primary, 0.14),
        borderRadius: 10,
        paddingHorizontal: 10,
        paddingVertical: 4,
        marginBottom: 8,
    },
    categoryPillText: {
        fontSize: 11,
        fontWeight: '800',
        color: colors.primary,
    },
    workoutTitle: {
        fontSize: 20,
        fontWeight: '800',
        color: colors.textPrimary,
        letterSpacing: -0.3,
    },
    metaRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginTop: 6,
    },
    metaItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
    },
    metaText: {
        fontSize: 12.5,
        fontWeight: '500',
        color: colors.textSecondary,
    },
    metaSeparator: {
        color: colors.textMuted,
        fontSize: 12,
    },
    thumbnail: {
        width: 64,
        height: 64,
        borderRadius: 18,
        backgroundColor: colors.surfaceContainer,
        alignItems: 'center',
        justifyContent: 'center',
    },
    footerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: 18,
    },
    statusText: {
        flex: 1,
        marginRight: 12,
        fontSize: 12.5,
        fontWeight: '600',
        color: colors.textSecondary,
    },
    // Due is the one state asking the user to act, so it alone takes
    // the accent; logged settles into the success tone.
    statusTextDue: {
        color: colors.secondary,
        fontWeight: '800',
    },
    statusTextLogged: {
        color: colors.success,
        fontWeight: '800',
    },
    startButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: colors.primary,
        paddingHorizontal: 18,
        paddingVertical: 12,
        borderRadius: 24,
        shadowColor: colors.primary,
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.3,
        shadowRadius: 12,
        elevation: 4,
    },
    startButtonText: {
        fontSize: 13.5,
        fontWeight: '800',
        color: colors.white,
    },
}));

export default TodaysWorkoutCard;
