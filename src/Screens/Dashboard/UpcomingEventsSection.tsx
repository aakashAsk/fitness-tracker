// The dashboard's "Upcoming Events" strip: today's unlogged workouts and
// meals, each with a Start button. Start begins a timer that keeps
// running in the background (it is a stored start time, so other tabs,
// a locked phone or a closed app do not stop it). The button then reads
// End; pressing it stops the timer and adds the elapsed time to that
// workout's or meal's log for the day, marking it completed.
import React, { useEffect, useMemo, useState } from 'react';
import { AppState, Text, TouchableOpacity, View } from 'react-native';
import { colors, withOpacity } from '../../Theme/colors';
import { themedStyles } from '../../Theme/ThemeContext';
import { useDialog } from '../../Components/Dialog';
import { useToday } from '../../Hooks/useNow';
import { useDayMeals } from '../../Hooks/useDayMeals';
import { useDayWorkoutEvents } from '../../Hooks/useDayWorkoutEvents';
import { saveMealLog } from '../../Services/mealLogService';
import { notifyLogsChanged } from '../../Services/logChangeBus';
import { logWorkoutSessionTime, toDateKey } from '../../Services/workoutLogService';
import { parseTimeToMinutes } from '../../Services/workoutPlanService';
import { elapsedSeconds, formatElapsed, type SessionKind } from '../../Services/sessionTimer';
import { clearActiveSession, startActiveSession, useActiveSession } from '../../Store/activeSessionStore';
import { useMealPlans } from '../../Store/mealPlansSlice';
import { useDashboardReady } from './DashboardLoadGate';

const MAX_VISIBLE = 3;

interface EventRow {
    key: string;
    kind: SessionKind;
    planId: string;
    title: string;
    time: string;
}

/** Wall-clock milliseconds, ticking once a second while `enabled`, and
    re-read the moment the app returns to the foreground. */
function useTick(enabled: boolean): number {
    const [now, setNow] = useState(() => Date.now());

    useEffect(() => {
        if (!enabled) return;
        setNow(Date.now());
        const id = setInterval(() => setNow(Date.now()), 1000);
        const sub = AppState.addEventListener('change', (state) => {
            if (state === 'active') setNow(Date.now());
        });
        return () => {
            clearInterval(id);
            sub.remove();
        };
    }, [enabled]);

    return now;
}

export const UpcomingEventsSection: React.FC = () => {
    const dialog = useDialog();
    const { today } = useToday();
    const active = useActiveSession();
    const nowMs = useTick(active !== null);

    const { dayEvents, completedPlanIds, hasOccurrencesForDay } = useDayWorkoutEvents(today);
    const { dayCards, hasLogsForDay } = useDayMeals(today);
    const mealPlans = useMealPlans();
    // Before the `rows.length === 0` early return below: this section
    // renders nothing on an empty day, but it must still tell the gate
    // that it has finished loading.
    useDashboardReady('upcoming-events', hasOccurrencesForDay && hasLogsForDay);

    const [savingKey, setSavingKey] = useState<string | null>(null);

    const activeKey = active ? `${active.kind}:${active.planId}` : null;

    const rows = useMemo<EventRow[]>(() => {
        const workouts: EventRow[] = hasOccurrencesForDay
            ? dayEvents
                  .filter((event) => !completedPlanIds.has(event.sourceId))
                  .map((event) => ({
                      key: `workout:${event.sourceId}`,
                      kind: 'workout' as const,
                      planId: event.sourceId,
                      title: event.title,
                      time: event.time,
                  }))
            : [];
        const meals: EventRow[] = hasLogsForDay
            ? dayCards
                  .filter((card) => card.plan && !card.isLogged)
                  .map((card) => ({
                      key: `meal:${card.planId}`,
                      kind: 'meal' as const,
                      planId: card.planId,
                      title: card.name,
                      time: card.time,
                  }))
            : [];

        const list = [...workouts, ...meals].sort(
            (a, b) => parseTimeToMinutes(a.time) - parseTimeToMinutes(b.time),
        );

        // A running timer always shows, even if its event has since been
        // logged elsewhere or belongs to an earlier day.
        if (active && activeKey && !list.some((row) => row.key === activeKey)) {
            list.unshift({
                key: activeKey,
                kind: active.kind,
                planId: active.planId,
                title: active.title,
                time: '',
            });
        }

        // The running one first, then by time.
        return list.sort((a, b) => Number(b.key === activeKey) - Number(a.key === activeKey));
    }, [dayEvents, completedPlanIds, hasOccurrencesForDay, dayCards, hasLogsForDay, active, activeKey]);

    if (rows.length === 0) return null;

    const visible = rows.slice(0, MAX_VISIBLE);
    const hiddenCount = rows.length - visible.length;

    const start = (row: EventRow) => {
        if (active) return;
        startActiveSession({
            kind: row.kind,
            planId: row.planId,
            title: row.title,
            dateKey: toDateKey(new Date()),
            startedAt: Date.now(),
        });
    };

    const end = async () => {
        if (!active || savingKey) return;
        const seconds = Math.max(1, elapsedSeconds(active.startedAt, Date.now()));
        setSavingKey(activeKey);

        try {
            if (active.kind === 'workout') {
                await logWorkoutSessionTime({
                    planId: active.planId,
                    planName: active.title,
                    date: active.dateKey,
                    seconds,
                });
            } else {
                // Today's card carries any one-day edits; for a timer left
                // running from an earlier day, fall back to the plan.
                const card =
                    active.dateKey === toDateKey(new Date())
                        ? dayCards.find((c) => c.planId === active.planId)
                        : undefined;
                const plan = mealPlans.find((p) => p.id === active.planId);
                await saveMealLog(
                    {
                        planId: active.planId,
                        planName: card?.name ?? plan?.name ?? active.title,
                        mealType: card?.mealType ?? plan?.mealType ?? 'breakfast',
                        date: active.dateKey,
                        time: card?.time ?? plan?.time ?? '',
                        items: card?.items ?? plan?.items ?? [],
                        state: 'completed',
                    },
                    { addSeconds: seconds },
                );
            }
            // Only after the write lands: a failed save keeps the timer
            // running, so the time is not lost.
            clearActiveSession();
            notifyLogsChanged();
        } catch (error) {
            dialog.show({
                title: 'Could not log your time',
                message:
                    error instanceof Error && error.message
                        ? error.message
                        : 'Something went wrong. Your timer is still running — try End again.',
            });
        } finally {
            setSavingKey(null);
        }
    };

    return (
        <View style={styles.card} accessibilityLabel="Upcoming events">
            <View style={styles.header}>
                <Text style={styles.title}>Upcoming Events</Text>
                {hiddenCount > 0 ? <Text style={styles.more}>+{hiddenCount} more</Text> : null}
            </View>

            {visible.map((row, index) => {
                const isActive = row.key === activeKey;
                const isSaving = isActive && savingKey === activeKey;
                const blocked = !!active && !isActive;

                return (
                    <View key={row.key} style={[styles.row, index > 0 && styles.rowDivider]}>
                        <View style={styles.rowText}>
                            <Text style={styles.rowTitle} numberOfLines={1}>
                                {row.title}
                            </Text>
                            {/* The scheduled time. Empty for a timer left
                                running from an earlier day, whose row is
                                rebuilt from the timer alone — nothing to
                                show there rather than a blank line. */}
                            {row.time ? (
                                <Text style={styles.rowTime} numberOfLines={1}>
                                    {row.time}
                                </Text>
                            ) : null}
                            {isActive && active ? (
                                <Text style={styles.elapsed}>
                                    {formatElapsed(elapsedSeconds(active.startedAt, nowMs))}
                                </Text>
                            ) : null}
                        </View>

                        <TouchableOpacity
                            activeOpacity={0.8}
                            disabled={blocked || isSaving}
                            onPress={() => (isActive ? end() : start(row))}
                            style={[
                                styles.button,
                                isActive ? styles.buttonEnd : styles.buttonStart,
                                (blocked || isSaving) && styles.buttonDisabled,
                            ]}
                            accessibilityRole="button"
                            accessibilityLabel={`${isActive ? 'End' : 'Start'} ${row.title}`}
                        >
                            <Text style={styles.buttonText}>
                                {isSaving ? 'Saving…' : isActive ? 'End' : 'Start'}
                            </Text>
                        </TouchableOpacity>
                    </View>
                );
            })}
        </View>
    );
};

const styles = themedStyles(() => ({
    card: {
        backgroundColor: colors.surface,
        borderRadius: 20,
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderWidth: 1,
        borderColor: colors.border,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 4,
    },
    title: {
        fontSize: 11.5,
        fontWeight: '800',
        letterSpacing: 0.7,
        color: colors.textSecondary,
        textTransform: 'uppercase',
    },
    more: {
        fontSize: 11,
        fontWeight: '700',
        color: colors.textMuted,
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        paddingVertical: 9,
    },
    rowDivider: {
        borderTopWidth: 1,
        borderTopColor: colors.border,
    },
    rowText: {
        flex: 1,
    },
    rowTitle: {
        fontSize: 15,
        fontWeight: '700',
        color: colors.textPrimary,
    },
    rowTime: {
        marginTop: 2,
        fontSize: 12,
        fontWeight: '600',
        color: colors.textSecondary,
    },
    elapsed: {
        marginTop: 2,
        fontSize: 12,
        fontWeight: '700',
        color: colors.secondary,
    },
    button: {
        minWidth: 68,
        alignItems: 'center',
        paddingHorizontal: 14,
        paddingVertical: 7,
        borderRadius: 9999,
    },
    buttonStart: {
        backgroundColor: colors.primary,
    },
    buttonEnd: {
        backgroundColor: colors.secondary,
    },
    buttonDisabled: {
        opacity: 0.4,
    },
    buttonText: {
        fontSize: 13,
        fontWeight: '800',
        color: colors.white,
    },
}));

export default UpcomingEventsSection;
