import React, { useMemo, useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';
import {
    CalendarDays,
    ChevronDown,
    Clock,
    Layers,
    Pause,
    Pencil,
    Play,
    Trash2,
    UtensilsCrossed,
} from 'lucide-react-native';
import { colors, withOpacity } from '../../Theme/colors';
import { spacing } from '../../Theme/spacing';
import {
    deleteMealPlan,
    describeIncompleteMealPlan,
    describeItems,
    describeMealConflict,
    findMealScheduleConflict,
    MAX_MEAL_PLANS_PER_USER,
    MEAL_TYPE_LABEL,
    MEAL_TYPES,
    updateMealPlan,
    MealPlanServiceError,
    type MealPlan,
    type MealPlanStatus,
    type MealType,
} from '../../Services/mealPlanService';
import { parseTimeToMinutes } from '../../Services/workoutPlanService';
import { DAY_ORDER } from '../Workout/Data';
import { useMealPlans, useMealPlansLoading } from '../../Store/mealPlansSlice';
import { SkeletonBlock, SkeletonGroup } from '../../Components/Skeleton';
import { useDialog } from '../../Components/Dialog';
import { themedStyles } from '../../Theme/ThemeContext';

// Every meal plan the user owns, independent of any date — the
// nutrition-side counterpart to the workout tab's PlanLibrary, and
// deliberately built the same way: getMealPlansForDate only expands
// plans whose status is 'live', so a draft or paused plan would
// otherwise never be reachable at all.

const STATUS_ORDER: MealPlanStatus[] = ['live', 'paused', 'draft'];

const STATUS_LABEL: Record<MealPlanStatus, string> = {
    live: 'Live',
    paused: 'Paused',
    draft: 'Draft',
};

const STATUS_COLOR: Record<MealPlanStatus, string> = {
    live: colors.success,
    paused: colors.warning,
    draft: colors.textMuted,
};

/** "Mon, Wed, Fri" — or a plain count once the list gets long. */
function describeDays(plan: MealPlan): string {
    if (plan.days.length === 0) return 'No days set';
    if (plan.days.length > 3) return `${plan.days.length} days/week`;
    return plan.days.join(', ');
}

/** Index of the earliest day a plan is eaten, Monday first. A plan with
 * no days set has nothing to sort by, so it sorts after every scheduled one. */
function earliestDayIndex(plan: MealPlan): number {
    if (plan.days.length === 0) return DAY_ORDER.length;
    return Math.min(...plan.days.map((day) => DAY_ORDER.indexOf(day)));
}

export interface MealPlanLibraryProps {
    /**
     * Opens the full plan editor. Editing from here is always a
     * whole-plan edit — there is no date in context to scope a change
     * to, unlike the day cards above.
     */
    onEditPlan?: (plan: MealPlan) => void;
}

/** "All", then one tab per MealType, in the same order MEAL_TYPES lists
 * them — tabs mirror the enum exactly rather than only the types that
 * happen to have a plan, so the section a user is about to fill in
 * (say, Snack) is still there to switch to. */
const TAB_KEYS: ('all' | MealType)[] = ['all', ...MEAL_TYPES.map((entry) => entry.key)];

const TAB_LABEL: Record<'all' | MealType, string> = {
    all: 'All',
    ...MEAL_TYPE_LABEL,
};

export const MealPlanLibrary: React.FC<MealPlanLibraryProps> = ({ onEditPlan }) => {
    const plans = useMealPlans();
    const isLoading = useMealPlansLoading();
    const dialog = useDialog();
    const [updatingId, setUpdatingId] = useState<string | null>(null);
    // Accordion — one plan's details open at a time.
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<'all' | MealType>('all');

    // Monday first, by each plan's earliest day; same-day plans sort by
    // time. A plan with no days set falls to the end, and among ties the
    // store's own order (newest first) is preserved — sort() is stable.
    const ordered = useMemo(
        () =>
            [...plans].sort((a, b) => {
                const dayDiff = earliestDayIndex(a) - earliestDayIndex(b);
                if (dayDiff !== 0) return dayDiff;
                return parseTimeToMinutes(a.time) - parseTimeToMinutes(b.time);
            }),
        [plans],
    );

    // Counts feed the tab badges — computed off the full list, not the
    // filtered one, so switching tabs doesn't change any other tab's number.
    const countByType = useMemo(() => {
        const counts = new Map<MealType, number>();
        for (const plan of plans) counts.set(plan.mealType, (counts.get(plan.mealType) ?? 0) + 1);
        return counts;
    }, [plans]);

    const visible = useMemo(
        () => (activeTab === 'all' ? ordered : ordered.filter((plan) => plan.mealType === activeTab)),
        [ordered, activeTab],
    );

    const changeStatus = async (plan: MealPlan, next: MealPlanStatus) => {
        if (next === plan.status) return;

        // Going live is the point at which a plan actually lands on the
        // calendar, so it has to clear the same bar as one created live:
        // complete first, then free of schedule clashes. A draft is
        // allowed to be half-finished right up until this moment.
        if (next === 'live') {
            const incomplete = describeIncompleteMealPlan(plan);
            if (incomplete) {
                dialog.show({ title: 'Plan isn’t ready yet', message: incomplete });
                return;
            }

            const conflict = findMealScheduleConflict(
                plans,
                { days: plan.days, time: plan.time },
                { excludePlanId: plan.id },
            );
            if (conflict) {
                dialog.show({
                    title: 'That time is already taken',
                    message: describeMealConflict(conflict),
                });
                return;
            }
        }

        setUpdatingId(plan.id);
        try {
            await updateMealPlan(plan.id, { status: next });
        } catch (error) {
            dialog.show({
                title: 'Could not update plan',
                message:
                    error instanceof MealPlanServiceError
                        ? error.message
                        : 'Something went wrong. Please try again.',
            });
        } finally {
            setUpdatingId(null);
        }
    };

    const deletePlan = async (plan: MealPlan) => {
        setUpdatingId(plan.id);
        try {
            await deleteMealPlan(plan.id);
        } catch (error) {
            dialog.show({
                title: 'Could not delete plan',
                message:
                    error instanceof MealPlanServiceError
                        ? error.message
                        : 'Something went wrong. Please try again.',
            });
        } finally {
            setUpdatingId(null);
        }
    };

    // Deleting is permanent — a live plan disappears from the calendar
    // the moment this confirms, same as a draft leaving the library for
    // good — so it always asks first rather than being a single tap.
    const confirmDelete = (plan: MealPlan) => {
        dialog.show({
            title: 'Delete this plan?',
            message: `"${plan.name || 'Untitled plan'}" will be removed for good. This can't be undone.`,
            actions: [
                { label: 'Cancel', style: 'cancel' },
                { label: 'Delete', style: 'destructive', onPress: () => deletePlan(plan) },
            ],
        });
    };

    // A plan has to be able to move between states from here, or a draft
    // could never become live.
    const promptStatus = (plan: MealPlan) => {
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
                    <Layers size={16} color={colors.secondary} strokeWidth={2.4} />
                    <Text style={styles.headerTitle}>All Meal Plans</Text>
                </View>
                {/* Shown against the cap so the limit is visible before
                    the user hits it, rather than only as an alert. */}
                <View style={styles.countPill}>
                    <Text style={styles.countText}>
                        {isLoading ? '—' : `${plans.length}/${MAX_MEAL_PLANS_PER_USER}`}
                    </Text>
                </View>
            </View>

            {isLoading ? null : (
                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.tabRow}
                >
                    {TAB_KEYS.map((key) => {
                        const isActive = activeTab === key;
                        const count = key === 'all' ? plans.length : countByType.get(key) ?? 0;
                        return (
                            <TouchableOpacity
                                key={key}
                                activeOpacity={0.8}
                                onPress={() => setActiveTab(key)}
                                accessibilityRole="button"
                                accessibilityState={{ selected: isActive }}
                                style={[styles.tab, isActive && styles.tabActive]}
                            >
                                <Text style={[styles.tabText, isActive && styles.tabTextActive]}>
                                    {TAB_LABEL[key]}
                                </Text>
                                {count > 0 ? (
                                    <View style={[styles.tabBadge, isActive && styles.tabBadgeActive]}>
                                        <Text
                                            style={[
                                                styles.tabBadgeText,
                                                isActive && styles.tabBadgeTextActive,
                                            ]}
                                        >
                                            {count}
                                        </Text>
                                    </View>
                                ) : null}
                            </TouchableOpacity>
                        );
                    })}
                </ScrollView>
            )}

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
            ) : visible.length === 0 ? (
                <Text style={styles.emptyText}>
                    {ordered.length === 0
                        ? 'No meal plans yet — tap "Create Meal Plan" to add your first one.'
                        : `No ${TAB_LABEL[activeTab].toLowerCase()} plans yet.`}
                </Text>
            ) : (
                <View style={styles.list}>
                    {visible.map((plan, index) => {
                        const isLast = index === visible.length - 1;
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
                                            <UtensilsCrossed
                                                size={15}
                                                color={colors.secondary}
                                                strokeWidth={2.3}
                                            />
                                        </View>

                                        <View style={styles.rowText}>
                                            <Text style={styles.rowTitle} numberOfLines={1}>
                                                {plan.name || 'Untitled plan'}
                                            </Text>
                                            <Text style={styles.rowMeta} numberOfLines={1}>
                                                {MEAL_TYPE_LABEL[plan.mealType]} ·{' '}
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
                                                color={colors.secondary}
                                                strokeWidth={2.4}
                                            />
                                        </TouchableOpacity>
                                    ) : null}

                                    <TouchableOpacity
                                        accessibilityLabel={`Delete ${plan.name}`}
                                        activeOpacity={0.7}
                                        hitSlop={6}
                                        disabled={isBusy}
                                        onPress={() => confirmDelete(plan)}
                                        style={[styles.deleteButton, isBusy && styles.actionBusy]}
                                    >
                                        <Trash2 size={14} color={colors.error} strokeWidth={2.4} />
                                    </TouchableOpacity>

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
                                                    : 'No days set'}
                                            </Text>
                                        </View>

                                        <View style={styles.detailLine}>
                                            <Clock size={13} color={colors.textMuted} />
                                            <Text style={styles.detailText}>
                                                {plan.time || 'No meal time set'}
                                            </Text>
                                        </View>

                                        <View style={styles.detailLine}>
                                            <UtensilsCrossed size={13} color={colors.textMuted} />
                                            <Text style={styles.detailText} numberOfLines={2}>
                                                {describeItems(plan.items)}
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

export default MealPlanLibrary;

const styles = themedStyles(() => ({
    card: {
        backgroundColor: colors.surface,
        borderRadius: 24,
        padding: 16,
        marginHorizontal: spacing.screenHorizontalPadding,
        shadowColor: colors.secondary,
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
        backgroundColor: withOpacity(colors.secondary, 0.14),
        paddingHorizontal: 9,
        paddingVertical: 3,
        borderRadius: 12,
    },
    countText: {
        fontSize: 10.5,
        fontWeight: '800',
        color: colors.secondary,
    },
    emptyText: {
        fontSize: 13,
        lineHeight: 19,
        color: colors.textSecondary,
    },
    tabRow: {
        gap: 6,
        paddingRight: 4,
    },
    tab: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        paddingHorizontal: 12,
        paddingVertical: 7,
        borderRadius: 20,
        backgroundColor: colors.surfaceContainer,
    },
    tabActive: {
        backgroundColor: colors.secondary,
    },
    tabText: {
        fontSize: 12,
        fontWeight: '700',
        color: colors.textSecondary,
    },
    tabTextActive: {
        color: colors.white,
    },
    tabBadge: {
        minWidth: 16,
        height: 16,
        paddingHorizontal: 4,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: withOpacity(colors.secondary, 0.16),
    },
    tabBadgeActive: {
        backgroundColor: withOpacity(colors.white, 0.25),
    },
    tabBadgeText: {
        fontSize: 9.5,
        fontWeight: '800',
        color: colors.secondary,
    },
    tabBadgeTextActive: {
        color: colors.white,
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
        backgroundColor: withOpacity(colors.secondary, 0.12),
    },
    deleteButton: {
        width: 28,
        height: 28,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: withOpacity(colors.error, 0.12),
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
        backgroundColor: colors.secondary,
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
        backgroundColor: withOpacity(colors.secondary, 0.12),
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
