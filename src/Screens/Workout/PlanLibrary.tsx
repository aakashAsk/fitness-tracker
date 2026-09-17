import React, { useMemo, useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';
import {
    CalendarDays,
    ChevronDown,
    Clock,
    Dumbbell,
    Layers,
    Pause,
    Pencil,
    Play,
    Target,
} from 'lucide-react-native';
import { colors, withOpacity } from '../../Theme/colors';
import { spacing } from '../../Theme/spacing';
import {
    updateWorkoutPlan,
    WorkoutPlanServiceError,
    type WorkoutPlan,
    type WorkoutPlanStatus,
} from '../../Services/workoutPlanService';
import { useWorkoutPlans, useWorkoutPlansLoading } from '../../Store/workoutPlansSlice';
import { SkeletonBlock, SkeletonGroup } from '../../Components/Skeleton';
import { useDialog } from '../../Components/Dialog';
import {
    describeConflict,
    describeIncompletePlan,
    findScheduleConflict,
    MAX_PLANS_PER_USER,
} from '../../Services/planValidation';
import { themedStyles } from '../../Theme/ThemeContext';

// Every plan the user owns, independent of any date — the counterpart
// to the day view above it, which only ever shows what is scheduled on
// the selected date.
//
// It exists mainly so drafts and paused plans are reachable at all:
// getEventsForDate only expands plans whose status is 'live', so a
// plan saved as a draft never appears on any date and would otherwise
// be invisible the moment it was created.

const STATUS_ORDER: WorkoutPlanStatus[] = ['live', 'paused', 'draft'];

const STATUS_LABEL: Record<WorkoutPlanStatus, string> = {
    live: 'Live',
    paused: 'Paused',
    draft: 'Draft',
};

const STATUS_COLOR: Record<WorkoutPlanStatus, string> = {
    live: colors.success,
    paused: colors.warning,
    draft: colors.textMuted,
};

/** "Mon, Wed, Fri" — or a plain count once the list gets long. */
function describeDays(plan: WorkoutPlan): string {
    if (plan.days.length === 0) return 'No days set';
    if (plan.days.length > 3) return `${plan.days.length} days/week`;
    return plan.days.join(', ');
}

export interface PlanLibraryProps {
    /**
     * Opens the full plan editor. Editing from here is always a
     * whole-plan edit — there is no date in context to scope a change
     * to, unlike the cards in the day view.
     */
    onEditPlan?: (plan: WorkoutPlan) => void;
}

export const PlanLibrary: React.FC<PlanLibraryProps> = ({ onEditPlan }) => {
    const plans = useWorkoutPlans();
    const isLoading = useWorkoutPlansLoading();
    const dialog = useDialog();
    const [updatingId, setUpdatingId] = useState<string | null>(null);
    // Accordion — one plan's details open at a time, matching the
    // exercise rows in the day cards above.
    const [expandedId, setExpandedId] = useState<string | null>(null);

    // Live first, then paused, then drafts. Within a group the store's
    // own order (newest first) is preserved — sort() is stable.
    const ordered = useMemo(
        () =>
            [...plans].sort(
                (a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status),
            ),
        [plans],
    );

    const changeStatus = async (plan: WorkoutPlan, next: WorkoutPlanStatus) => {
        if (next === plan.status) return;

        // Going live is the point at which a plan actually lands on the
        // calendar, so it has to clear the same bar as one created live:
        // complete first, then free of schedule clashes. A draft is
        // allowed to be half-finished right up until this moment.
        if (next === 'live') {
            const incomplete = describeIncompletePlan(plan);
            if (incomplete) {
                dialog.show({ title: 'Plan isn’t ready yet', message: incomplete });
                return;
            }

            const conflict = findScheduleConflict(
                plans,
                { days: plan.days, time: plan.time },
                { excludePlanId: plan.id },
            );
            if (conflict) {
                dialog.show({
                    title: 'That time is already taken',
                    message: describeConflict(conflict),
                });
                return;
            }
        }

        setUpdatingId(plan.id);
        try {
            await updateWorkoutPlan(plan.id, { status: next });
        } catch (error) {
            dialog.show({
                title: 'Could not update plan',
                message:
                    error instanceof WorkoutPlanServiceError
                        ? error.message
                        : 'Something went wrong. Please try again.',
            });
        } finally {
            setUpdatingId(null);
        }
    };

    // A plan has to be able to move between states from here, or a draft
    // could never become live and the Save as Draft button would be a
    // one-way trip.
    const promptStatus = (plan: WorkoutPlan) => {
        dialog.show({
            title: plan.name,
            message: `Currently ${STATUS_LABEL[plan.status].toLowerCase()}. Move it to:`,
            actions: [
                { label: 'Cancel', style: 'cancel' },
                ...STATUS_ORDER.filter((status) => status !== plan.status).map((status) => ({
                    label: STATUS_LABEL[status],
                    onPress: () => changeStatus(plan, status),
                })),
            ],
        });
    };

    return (
        <View style={styles.card}>
            <View style={styles.headerRow}>
                <View style={styles.headerLeft}>
                    <Layers size={16} color={colors.primary} strokeWidth={2.4} />
                    <Text style={styles.headerTitle}>All Plans</Text>
                </View>
                {/* Shown against the cap so the limit is visible before
                    the user hits it, rather than only as an alert. */}
                <View style={styles.countPill}>
                    <Text style={styles.countText}>
                        {isLoading ? '—' : `${plans.length}/${MAX_PLANS_PER_USER}`}
                    </Text>
                </View>
            </View>

            {isLoading ? (
                <View style={styles.list}>
                    {[0, 1, 2].map((row) => (
                        <SkeletonGroup key={row} style={styles.row}>
                            <View style={styles.rowHeader}>
                                <SkeletonBlock width={32} height={32} radius={10} />
                                <View style={styles.rowText}>
                                    <SkeletonBlock width="55%" height={11} />
                                    <SkeletonBlock width="35%" height={9} radius={5} />
                                </View>
                                <SkeletonBlock width={58} height={22} radius={20} />
                            </View>
                        </SkeletonGroup>
                    ))}
                </View>
            ) : ordered.length === 0 ? (
                <Text style={styles.emptyText}>
                    No plans yet — tap "Add Workout Plan" to create your first one.
                </Text>
            ) : (
                <View style={styles.list}>
                    {ordered.map((plan, index) => {
                        const isLast = index === ordered.length - 1;
                        const statusColor = STATUS_COLOR[plan.status];
                        const isExpanded = expandedId === plan.id;
                        const isBusy = updatingId === plan.id;
                        const isPaused = plan.status === 'paused';

                        return (
                            <Animated.View
                                key={plan.id}
                                layout={LinearTransition.duration(220)}
                                style={[styles.row, !isLast && styles.rowDivider]}
                            >
                                {/* The expand target and the edit button are
                                    siblings, not nested touchables — a
                                    Touchable inside a Touchable fires both
                                    handlers on Android, so tapping edit
                                    would also toggle the accordion. */}
                                <View style={styles.rowHeader}>
                                    <TouchableOpacity
                                        accessibilityLabel={`${isExpanded ? 'Hide' : 'Show'} details for ${plan.name}`}
                                        activeOpacity={0.7}
                                        onPress={() => setExpandedId(isExpanded ? null : plan.id)}
                                        style={styles.rowMain}
                                    >
                                        <View style={styles.rowIcon}>
                                            <Dumbbell size={15} color={colors.primary} strokeWidth={2.3} />
                                        </View>

                                        <View style={styles.rowText}>
                                            <Text style={styles.rowTitle} numberOfLines={1}>
                                                {plan.name || 'Untitled plan'}
                                            </Text>
                                            <Text style={styles.rowMeta} numberOfLines={1}>
                                                {plan.exerciseIds.length} exercises ·{' '}
                                                {describeDays(plan)}
                                            </Text>
                                        </View>

                                        <View
                                            style={[
                                                styles.statusPill,
                                                { backgroundColor: withOpacity(statusColor, 0.14) },
                                            ]}
                                        >
                                            <View
                                                style={[
                                                    styles.statusDot,
                                                    { backgroundColor: statusColor },
                                                ]}
                                            />
                                            <Text style={[styles.statusText, { color: statusColor }]}>
                                                {STATUS_LABEL[plan.status]}
                                            </Text>
                                        </View>
                                    </TouchableOpacity>

                                    {onEditPlan ? (
                                        <TouchableOpacity
                                            accessibilityLabel={`Edit ${plan.name}`}
                                            activeOpacity={0.7}
                                            hitSlop={6}
                                            onPress={() => onEditPlan(plan)}
                                            style={styles.editButton}
                                        >
                                            <Pencil
                                                size={14}
                                                color={colors.primary}
                                                strokeWidth={2.4}
                                            />
                                        </TouchableOpacity>
                                    ) : null}

                                    <TouchableOpacity
                                        accessibilityLabel={`${isExpanded ? 'Hide' : 'Show'} details`}
                                        activeOpacity={0.7}
                                        hitSlop={6}
                                        onPress={() => setExpandedId(isExpanded ? null : plan.id)}
                                        style={[
                                            styles.chevron,
                                            isExpanded && styles.chevronExpanded,
                                        ]}
                                    >
                                        <ChevronDown
                                            size={16}
                                            color={colors.textSecondary}
                                            strokeWidth={2.4}
                                        />
                                    </TouchableOpacity>
                                </View>

                                {isExpanded ? (
                                    <Animated.View
                                        entering={FadeIn.duration(160)}
                                        exiting={FadeOut.duration(120)}
                                        style={styles.details}
                                    >
                                        <View style={styles.detailLine}>
                                            <CalendarDays size={13} color={colors.textMuted} />
                                            <Text style={styles.detailText}>
                                                {plan.days.length > 0
                                                    ? plan.days.join(', ')
                                                    : 'No training days set'}
                                            </Text>
                                        </View>

                                        <View style={styles.detailLine}>
                                            <Clock size={13} color={colors.textMuted} />
                                            <Text style={styles.detailText}>
                                                {plan.time || 'No session time set'}
                                            </Text>
                                        </View>

                                        <View style={styles.detailLine}>
                                            <Target size={13} color={colors.textMuted} />
                                            <Text style={styles.detailText} numberOfLines={2}>
                                                {plan.muscles.length > 0
                                                    ? plan.muscles.join(', ')
                                                    : 'No muscle groups set'}
                                            </Text>
                                        </View>

                                        <View style={styles.actionRow}>
                                            {/* Drafts have nothing to pause — they were
                                                never running — so the primary action
                                                there is to publish instead. */}
                                            {plan.status === 'draft' ? (
                                                <TouchableOpacity
                                                    activeOpacity={0.8}
                                                    disabled={isBusy}
                                                    onPress={() => changeStatus(plan, 'live')}
                                                    style={[
                                                        styles.actionButton,
                                                        styles.actionPrimary,
                                                        isBusy && styles.actionBusy,
                                                    ]}
                                                >
                                                    <Play
                                                        size={13}
                                                        color={colors.white}
                                                        strokeWidth={2.6}
                                                    />
                                                    <Text style={styles.actionPrimaryText}>
                                                        Make Live
                                                    </Text>
                                                </TouchableOpacity>
                                            ) : (
                                                <TouchableOpacity
                                                    accessibilityLabel={
                                                        isPaused
                                                            ? `Resume ${plan.name}`
                                                            : `Pause ${plan.name}`
                                                    }
                                                    activeOpacity={0.8}
                                                    disabled={isBusy}
                                                    onPress={() =>
                                                        changeStatus(plan, isPaused ? 'live' : 'paused')
                                                    }
                                                    style={[
                                                        styles.actionButton,
                                                        isPaused
                                                            ? styles.actionPrimary
                                                            : styles.actionNeutral,
                                                        isBusy && styles.actionBusy,
                                                    ]}
                                                >
                                                    {isPaused ? (
                                                        <Play
                                                            size={13}
                                                            color={colors.white}
                                                            strokeWidth={2.6}
                                                        />
                                                    ) : (
                                                        <Pause
                                                            size={13}
                                                            color={colors.textPrimary}
                                                            strokeWidth={2.6}
                                                        />
                                                    )}
                                                    <Text
                                                        style={
                                                            isPaused
                                                                ? styles.actionPrimaryText
                                                                : styles.actionNeutralText
                                                        }
                                                    >
                                                        {isPaused ? 'Resume' : 'Pause'}
                                                    </Text>
                                                </TouchableOpacity>
                                            )}

                                            <TouchableOpacity
                                                activeOpacity={0.8}
                                                disabled={isBusy}
                                                onPress={() => promptStatus(plan)}
                                                style={[
                                                    styles.actionButton,
                                                    styles.actionNeutral,
                                                    isBusy && styles.actionBusy,
                                                ]}
                                            >
                                                <Text style={styles.actionNeutralText}>
                                                    Change Status
                                                </Text>
                                            </TouchableOpacity>
                                        </View>
                                    </Animated.View>
                                ) : null}
                            </Animated.View>
                        );
                    })}
                </View>
            )}
        </View>
    );
};

export default PlanLibrary;

const styles = themedStyles(() => ({
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
        gap: 12,
    },
    headerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    headerLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 7,
    },
    headerTitle: {
        fontSize: 15,
        fontWeight: '800',
        color: colors.textPrimary,
        letterSpacing: -0.2,
    },
    countPill: {
        backgroundColor: withOpacity(colors.primary, 0.14),
        paddingHorizontal: 9,
        paddingVertical: 3,
        borderRadius: 12,
    },
    countText: {
        fontSize: 10.5,
        fontWeight: '800',
        color: colors.primary,
    },
    emptyText: {
        fontSize: 13,
        lineHeight: 19,
        color: colors.textSecondary,
    },
    list: {
        gap: 2,
    },
    row: {
        paddingVertical: 9,
    },
    rowHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    rowMain: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    editButton: {
        width: 28,
        height: 28,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: withOpacity(colors.primary, 0.12),
    },
    rowDivider: {
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
    },
    chevron: {
        width: 20,
        alignItems: 'center',
    },
    chevronExpanded: {
        transform: [{ rotate: '180deg' }],
    },
    details: {
        gap: 7,
        paddingTop: 11,
        paddingLeft: 42,
    },
    detailLine: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 7,
    },
    detailText: {
        flex: 1,
        fontSize: 11.5,
        color: colors.textSecondary,
        textTransform: 'capitalize',
    },
    actionRow: {
        flexDirection: 'row',
        gap: 8,
        paddingTop: 4,
    },
    actionButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        paddingHorizontal: 12,
        paddingVertical: 7,
        borderRadius: 20,
    },
    actionPrimary: {
        backgroundColor: colors.primary,
    },
    actionPrimaryText: {
        fontSize: 11.5,
        fontWeight: '800',
        color: colors.white,
    },
    actionNeutral: {
        backgroundColor: colors.surfaceContainer,
    },
    actionNeutralText: {
        fontSize: 11.5,
        fontWeight: '800',
        color: colors.textPrimary,
    },
    actionBusy: {
        opacity: 0.5,
    },
    rowIcon: {
        width: 32,
        height: 32,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: withOpacity(colors.primary, 0.12),
    },
    rowText: {
        flex: 1,
        gap: 1,
    },
    rowTitle: {
        fontSize: 13.5,
        fontWeight: '700',
        color: colors.textPrimary,
    },
    rowMeta: {
        fontSize: 11,
        color: colors.textSecondary,
    },
    statusPill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        paddingHorizontal: 9,
        paddingVertical: 5,
        borderRadius: 20,
    },
    statusDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
    },
    statusText: {
        fontSize: 10.5,
        fontWeight: '800',
    },
}));
