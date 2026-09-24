import React from 'react';
import { Linking, View, Text, TouchableOpacity } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import {
    BedDouble,
    Clock,
    Droplet,
    Flame,
    Footprints,
    Moon,
    Pencil,
    Weight,
} from 'lucide-react-native';
import { colors, withOpacity } from '../../Theme/colors';
import ProgressRing from '../../Components/ProgressRing';
import { SkeletonBlock } from '../../Components/Skeleton';
import { useDialog } from '../../Components/Dialog';
import { themedStyles } from '../../Theme/ThemeContext';
import { useDailySteps } from '../../Hooks/useDailySteps';
import { DAILY_BURN_GOAL, DAILY_STEP_GOAL } from '../../Services/stepService';
import { useDailyTelemetry } from '../../Hooks/useDailyTelemetry';
import { useRecordTelemetry } from '../../Hooks/useRecordTelemetry';
import { useDayMeals } from '../../Hooks/useDayMeals';
import { useDayWorkoutEvents } from '../../Hooks/useDayWorkoutEvents';
import { useGreeting } from '../../Hooks/useGreeting';
import { useWeeklyMacroCompletion } from '../../Hooks/useWeeklyMacroCompletion';
import { useAppSelector } from '../../Store/hooks';
import CaloriesBurnCard from './CaloriesBurnCard';
import UpcomingEventsSection from './UpcomingEventsSection';
import WeightEntryModal from './WeightEntryModal';
import { useDashboardReady } from './DashboardLoadGate';
import { selectDerivedTargets, selectLoginStreak, selectUserProfile } from '../../Store/userProfileSlice';
import { useLastNightSleep } from '../../Hooks/useLastNightSleep';
import {
    formatClock,
    formatDuration,
    type SleepStatus,
} from '../../Services/healthConnectSleep';
import { openHealthConnectSettings } from '../../Services/healthConnectSteps';
import { saveDailyWeight, TelemetryServiceError } from '../../Services/telemetryService';
import { todayDateKey } from '../../Services/workoutLogService';

export interface DashboardOverviewProps {
    // The greeting's wording and date come from the clock, and the name
    // from the signed-in user — see useGreeting — so neither is passed in.
    // The brand/notifications/avatar top bar now lives in App.tsx's
    // shared AppTopBar, rendered above every tab — not here.
    // Calories burned is derived from the pedometer, and its trend pill
    // now shows progress against DAILY_BURN_GOAL — neither is passed in.
    // Water intake and body weight are read from today's telemetry row by
    // the card itself — see useDailyTelemetry — so neither is passed in.
    // Calorie budget and macros are read from today's meal logs and the
    // profile's derived targets by the card itself — see useDayMeals and
    // selectDerivedTargets — so neither is passed in either.
    // Body weight comes from today's telemetry row, or the onboarding
    // profile when there has been no weigh-in — so it is not passed in.
    // The weekly bars come from useWeeklyMacroCompletion — also not
    // passed in.
}

const BAR_TRACK_HEIGHT = 96;
const CALORIE_RING_SIZE = 112;
const CALORIE_RING_STROKE = 10;
/** What the Sleep tile says when there is no night to show. Only the
    ones with a fix say "tap" — see sleepAction. */
const SLEEP_STATUS_MESSAGE: Record<SleepStatus, string> = {
    ok: '',
    'no-data':
        'Nothing recorded last night. Sleep appears here once a watch or sleep app saves it to Health Connect.',
    'permission-denied': 'Tap to allow sleep access in Health Connect.',
    'provider-unavailable': 'Tap to install Health Connect to see your sleep.',
    unsupported: 'Sleep tracking is available on Android for now.',
    error: "Couldn't read your sleep. Tap to retry.",
};

/** Deepest first, shaded from full indigo down, so the row reads as a
    scale rather than three unrelated colours. */
const SLEEP_STAGE_ROWS = [
    { key: 'deep', label: 'Deep', opacity: 1 },
    { key: 'rem', label: 'REM', opacity: 0.6 },
    { key: 'light', label: 'Light', opacity: 0.3 },
] as const;

const HEALTH_CONNECT_STORE_URL =
    'https://play.google.com/store/apps/details?id=com.google.android.apps.healthdata';

/** Health Connect itself is missing, so its settings screen cannot open
    — the Play Store listing is the only way forward. */
function openHealthConnectStore() {
    void Linking.openURL(HEALTH_CONNECT_STORE_URL);
}

const METRIC_RING_SIZE = 78;
const METRIC_RING_STROKE = 8;

export const DashboardOverview: React.FC<DashboardOverviewProps> = () => {
    // "Good morning" is the clock's business, not a caller's, and the
    // name is whatever the user gave at onboarding. A profile written
    // before the name step shipped has none, in which case the greeting
    // simply stands alone rather than addressing nobody.
    const { greeting, dateLabel } = useGreeting();
    const profile = useAppSelector(selectUserProfile);
    const userName = profile?.displayName?.trim() ?? '';
    const loginStreak = useAppSelector(selectLoginStreak);

    // Steps come from the device rather than props — the pedometer is
    // the source of truth, and nothing upstream has a better number.
    const stepData = useDailySteps();
    const stepsUnknown = stepData.loading || stepData.source === 'unavailable';
    // Each source below tells the dashboard's load gate when it has
    // answered, so the skeleton stays up until all of them have.
    // An unavailable pedometer still counts as answered — it is the
    // reading that landed, and the tile explains why it is empty.
    useDashboardReady('steps', !stepData.loading);
    const stepGoalPercent = Math.round(stepData.goalProgress * 100);
    // A bare "no sensor" gave no way to tell an emulator from a refused
    // permission, so the card names the actual blocker instead.
    const stepUnitLabel =
        stepData.unavailableReason === 'no-hardware'
            ? 'no sensor'
            : stepData.unavailableReason === 'permission'
                ? 'allow motion'
                : stepData.unavailableReason === 'platform'
                    ? 'phone only'
                    : `of ${DAILY_STEP_GOAL.toLocaleString()}`;

    // Today's stored row — water, and a weigh-in if there has been one.
    // Firestore is the shared source of truth between this card and the
    // Nutrition tab's hydration tracker, which writes the same document.
    const telemetry = useDailyTelemetry();
    const waterUnknown = telemetry.loading || telemetry.error !== null;
    // A failed read is still an answer — waterUnknown covers how it shows.
    useDashboardReady('telemetry', !telemetry.loading);

    // The pedometer reading converted at a fixed kcal-per-step. Kept
    // separate from the tile's combined total below: this is the only
    // figure written into today's telemetry row (see useRecordTelemetry
    // below), because useNetCalories sums step-derived telemetry and
    // workout-derived stats from two different places — writing the
    // combined total here would double-count workouts on that chart.
    const stepCaloriesBurned = stepData.caloriesBurned;

    // Today's completed workouts, for the calories they report burning.
    // Same source the Workout tab's own summaries read from, so this
    // figure can never disagree with what a session card shows.
    const today = React.useMemo(() => new Date(), []);
    const dayWorkouts = useDayWorkoutEvents(today);
    const workoutCaloriesBurned = React.useMemo(
        () =>
            Array.from(dayWorkouts.statsByPlanId.values()).reduce(
                (sum, stats) => sum + stats.caloriesBurned,
                0,
            ),
        [dayWorkouts.statsByPlanId],
    );

    // The Calories Burned tile is the day's total activity, not just
    // steps — a pedometer reading plus whatever today's workouts logged.
    const caloriesBurned = stepCaloriesBurned + workoutCaloriesBurned;
    const burnProgress = Math.min(caloriesBurned / DAILY_BURN_GOAL, 1);
    const burnGoalPercent = Math.round((caloriesBurned / DAILY_BURN_GOAL) * 100);
    // Loading only while BOTH sources are still unanswered — a workout
    // total is real information even before the pedometer answers, and
    // vice versa, so neither alone should keep the tile on a placeholder.
    const burnUnknown = stepsUnknown && !dayWorkouts.hasOccurrencesForDay;

    // Sleep comes from Health Connect, written there by a watch or sleep
    // app — this app never measures it. Every non-'ok' status gets its
    // own line, because "no data" means something quite different when
    // the cause is a missing permission than when nothing recorded sleep.
    const sleep = useLastNightSleep();
    useDashboardReady('sleep', !sleep.loading);
    const sleepSummary = sleep.loading ? null : sleep.summary;
    const sleepMessage = sleep.loading
        ? 'Checking Health Connect…'
        : SLEEP_STATUS_MESSAGE[sleep.status];
    const sleepAction: { label: string; onPress: () => void } | null = sleep.loading
        ? null
        : sleep.status === 'permission-denied'
            ? // Android stops showing the dialog after two refusals, so the
              // tile sends the user to the settings screen instead.
              { label: 'Allow sleep access in Health Connect', onPress: openHealthConnectSettings }
            : sleep.status === 'provider-unavailable'
                ? { label: 'Install Health Connect', onPress: openHealthConnectStore }
                : sleep.status === 'error'
                    ? { label: 'Retry reading sleep', onPress: sleep.refresh }
                    : null;

    // Everything the device just told us, written into today's telemetry
    // row. Values are passed as undefined until their source has actually
    // answered — a pedometer that has not reported is not a zero-step day,
    // and writing it as one would overwrite a real count.
    useRecordTelemetry(
        {
            steps: stepsUnknown ? undefined : stepData.steps,
            caloriesBurned: stepsUnknown ? undefined : stepCaloriesBurned,
            sleep: sleep.loading
                ? undefined
                : sleepSummary
                  ? {
                        asleepMinutes: sleepSummary.asleepMinutes,
                        inBedMinutes: sleepSummary.inBedMinutes,
                        start: sleepSummary.start.toISOString(),
                        end: sleepSummary.end.toISOString(),
                        stages: sleepSummary.stages,
                    }
                  : null,
        },
        // Nothing is written until the day's own row has been read, or the
        // first write would race the read and the screen could show a
        // stale document it just overwrote.
        !telemetry.loading,
    );

    // The weight tile shows the latest weigh-in on today's row, falling
    // back to the weight captured at onboarding — which is the only one
    // the app has until a weigh-in is recorded.
    const weightKg = telemetry.weightKg ?? profile?.weightKg ?? null;

    // Logging today's weigh-in from the tile's pencil icon.
    const dialog = useDialog();
    const [showWeightModal, setShowWeightModal] = React.useState(false);
    const [savingWeight, setSavingWeight] = React.useState(false);

    const handleSaveWeight = async (nextWeightKg: number) => {
        setSavingWeight(true);
        try {
            await saveDailyWeight(todayDateKey(), nextWeightKg);
            telemetry.refresh();
            setShowWeightModal(false);
        } catch (error) {
            dialog.show({
                title: 'Could not save weight',
                message:
                    error instanceof TelemetryServiceError
                        ? error.message
                        : 'Something went wrong. Please try again.',
            });
            throw error;
        } finally {
            setSavingWeight(false);
        }
    };

    // Calorie budget & macros come from today's meal logs and the
    // profile's derived targets — the exact same aggregation the
    // Nutrition tab uses (see useDayMeals) — rather than from props, so
    // logging a meal there and returning Home shows the same figure.
    // The tab switch unmounts and remounts the Dashboard (README:556-560)
    // so no cross-screen invalidation is needed. `today` itself is
    // declared above, alongside the workout totals that share it.
    const { hasLogsForDay, totals: nutritionTotals } = useDayMeals(today);
    // Only the meal logs are awaited here: the profile's targets are
    // already in the store — the app does not reach the dashboard until
    // the profile has loaded.
    useDashboardReady('calorie-budget', hasLogsForDay);
    const targets = useAppSelector(selectDerivedTargets);

    // The week's macro completion — one % per day, averaging that day's
    // protein/carbs/fiber ratios. Waits for the profile's targets, same
    // reason calorieBudgetLoading below waits for them.
    const weeklyMacros = useWeeklyMacroCompletion(
        targets ? { proteinG: targets.proteinG, carbsG: targets.carbsG } : null,
    );

    // Which bar shows its percentage badge. Starts on today, same as
    // before tapping existed; tapping any other bar moves the badge
    // there instead of opening anything — one number, no popup.
    const [selectedDateKey, setSelectedDateKey] = React.useState<string | null>(null);

    const calorieBudgetLoading = !hasLogsForDay || !targets;
    const calorieBudgetTotal = targets?.calorieTarget ?? 0;
    const calorieBudgetConsumed = nutritionTotals?.calories ?? 0;
    const hasCalorieData = !calorieBudgetLoading && nutritionTotals !== null;

    const macros = [
        {
            label: 'Protein',
            color: colors.protein,
            grams: nutritionTotals?.protein ?? 0,
            goalGrams: targets?.proteinG ?? 0,
        },
        {
            label: 'Carbs',
            color: colors.carbs,
            grams: nutritionTotals?.carbs ?? 0,
            goalGrams: targets?.carbsG ?? 0,
        },
        {
            label: 'Fats',
            color: colors.fats,
            grams: nutritionTotals?.fat ?? 0,
            goalGrams: targets?.fatsG ?? 0,
        },
    ];

    const kcalLeft = hasCalorieData ? Math.max(calorieBudgetTotal - calorieBudgetConsumed, 0) : null;
    const calorieRingRadius = (CALORIE_RING_SIZE - CALORIE_RING_STROKE) / 2;
    const calorieCircumference = 2 * Math.PI * calorieRingRadius;
    const calorieConsumedPercent =
        hasCalorieData && calorieBudgetTotal > 0
            ? Math.min(calorieBudgetConsumed / calorieBudgetTotal, 1)
            : 0;
    const calorieDashOffset = calorieCircumference * (1 - calorieConsumedPercent);

    return (
        <View style={styles.wrapper}>
            {/* Greeting row — the avatar lives in the shared top bar
                (App.tsx's AppTopBar), so the name/date block has the full
                width. The streak pill sits at the far (flex-end) side: 0
                for a brand-new profile is not worth a pill, so it only
                shows once there is something to show. */}
            <View style={styles.greetingRow}>
                <View style={styles.greetingTextBlock}>
                    <View style={styles.greetingTitleRow}>
                        <Text style={styles.greetingTitle}>
                            {greeting}
                            {userName ? `, ${userName}` : ''}
                        </Text>
                        <Text style={styles.greetingEmoji}>✨</Text>
                    </View>
                    <View style={styles.dateRow}>
                        <Clock size={12} color={colors.secondary} strokeWidth={2.4} />
                        <Text style={styles.dateText}>{dateLabel}</Text>
                    </View>
                </View>
                {loginStreak > 0 ? (
                    <View style={styles.streakPill}>
                        <Flame size={16} color={colors.secondary} strokeWidth={2.6} />
                        <Text style={styles.streakPillText}>{loginStreak}</Text>
                    </View>
                ) : null}
            </View>

            {/* Today's unlogged workouts and meals, each with a start/end timer */}
            <UpcomingEventsSection />

            {/* Weekly calories chart — static placeholder data for now */}
            <CaloriesBurnCard />

            {/* Metric snapshot grid */}
            <View style={styles.metricGrid}>
                <View style={styles.metricCard}>
                    <View style={styles.metricCardHeader}>
                        <View
                            style={[
                                styles.metricIconCircle,
                                { backgroundColor: withOpacity(colors.secondary, 0.14) },
                            ]}
                        >
                            <Flame size={18} color={colors.secondary} strokeWidth={2.4} />
                        </View>
                        <View
                            style={[
                                styles.metricTrendPill,
                                { backgroundColor: withOpacity(colors.secondary, 0.14) },
                            ]}
                        >
                            <Text style={[styles.metricTrendText, { color: colors.secondary }]}>
                                {burnUnknown ? '0% Goal' : `${burnGoalPercent}% Goal`}
                            </Text>
                        </View>
                    </View>
                    <Text style={styles.metricLabel}>Calories Burned</Text>
                    <ProgressRing
                        size={METRIC_RING_SIZE}
                        strokeWidth={METRIC_RING_STROKE}
                        progress={burnUnknown ? 0 : burnProgress}
                        accent={colors.secondary}
                        value={burnUnknown ? '0' : caloriesBurned.toLocaleString()}
                        caption={`/ ${DAILY_BURN_GOAL.toLocaleString()} kcal`}
                    />
                </View>

                <View style={styles.metricCard}>
                    <View style={styles.metricCardHeader}>
                        <View
                            style={[
                                styles.metricIconCircle,
                                { backgroundColor: withOpacity(colors.primary, 0.14) },
                            ]}
                        >
                            <Droplet size={18} color={colors.primary} strokeWidth={2.4} />
                        </View>
                        <View
                            style={[
                                styles.metricTrendPill,
                                { backgroundColor: withOpacity(colors.primary, 0.14) },
                            ]}
                        >
                            <Text style={[styles.metricTrendText, { color: colors.primary }]}>
                                {waterUnknown ? '0% Goal' : `${telemetry.goalPercent}% Goal`}
                            </Text>
                        </View>
                    </View>
                    <Text style={styles.metricLabel}>Water Intake</Text>
                    <ProgressRing
                        size={METRIC_RING_SIZE}
                        strokeWidth={METRIC_RING_STROKE}
                        progress={telemetry.progress}
                        accent={colors.primary}
                        value={waterUnknown ? '0' : telemetry.ml.toLocaleString()}
                        caption={`/ ${telemetry.goalMl.toLocaleString()} ml`}
                    />
                </View>

                <View style={styles.metricCard}>
                    <View style={styles.metricCardHeader}>
                        <View style={[styles.metricIconCircle, { backgroundColor: colors.surfaceContainer }]}>
                            <Weight size={18} color={colors.textPrimary} strokeWidth={2.2} />
                        </View>
                        <View style={styles.metricHeaderRight}>
                            <View
                                style={[
                                    styles.metricTrendPill,
                                    { backgroundColor: withOpacity(colors.primary, 0.12) },
                                ]}
                            >
                                <Text style={[styles.metricTrendText, { color: colors.primary }]}>
                                    {/* No history widget reads this yet — it
                                        just says where today's number came
                                        from, a real weigh-in or the value
                                        set at onboarding. */}
                                    {telemetry.weightKg !== null ? 'Today' : 'Profile'}
                                </Text>
                            </View>
                            <TouchableOpacity
                                accessibilityLabel="Log today's weight"
                                activeOpacity={0.7}
                                hitSlop={6}
                                onPress={() => setShowWeightModal(true)}
                                style={styles.weightEditButton}
                            >
                                <Pencil size={12} color={colors.textSecondary} strokeWidth={2.4} />
                            </TouchableOpacity>
                        </View>
                    </View>
                    <Text style={styles.metricLabel}>Body Weight</Text>
                    <View style={styles.metricValueRow}>
                        <Text style={styles.metricValue}>
                            {weightKg !== null ? weightKg.toFixed(1) : '0'}
                        </Text>
                        <Text style={styles.metricUnit}>kg</Text>
                    </View>
                </View>

                <View style={styles.metricCard}>
                    <View style={styles.metricCardHeader}>
                        <View
                            style={[
                                styles.metricIconCircle,
                                { backgroundColor: withOpacity(colors.recovery, 0.16) },
                            ]}
                        >
                            <Footprints size={18} color={colors.recovery} strokeWidth={2.2} />
                        </View>
                        <View
                            style={[
                                styles.metricTrendPill,
                                {
                                    backgroundColor: stepsUnknown
                                        ? colors.surfaceContainer
                                        : withOpacity(colors.recovery, 0.14),
                                },
                            ]}
                        >
                            <Text
                                style={[
                                    styles.metricTrendText,
                                    { color: stepsUnknown ? colors.textSecondary : colors.recovery },
                                ]}
                            >
                                {stepsUnknown ? 'Today' : `${stepGoalPercent}% Goal`}
                            </Text>
                        </View>
                    </View>
                    <Text style={styles.metricLabel}>Steps</Text>
                    <View style={styles.metricValueRow}>
                        <Text style={styles.metricValue}>
                            {stepsUnknown ? '0' : stepData.steps.toLocaleString()}
                        </Text>
                        <Text style={styles.metricUnit}>{stepUnitLabel}</Text>
                    </View>
                    <View style={styles.stepTrack}>
                        <View
                            style={[
                                styles.stepFill,
                                {
                                    width: `${stepsUnknown ? 0 : Math.max(stepGoalPercent, 2)}%`,
                                    backgroundColor: colors.recovery,
                                },
                            ]}
                        />
                    </View>
                </View>

                {/* Sleep — the fifth tile, so it takes the grid's last row
                    on its own at full width, which the bed-to-wake line
                    and stage breakdown need. */}
                <TouchableOpacity
                    style={styles.metricCard}
                    activeOpacity={sleepAction ? 0.85 : 1}
                    disabled={!sleepAction}
                    onPress={sleepAction?.onPress}
                    accessibilityRole={sleepAction ? 'button' : undefined}
                    accessibilityLabel={sleepAction?.label}
                >
                    <View style={styles.metricCardHeader}>
                        <View
                            style={[
                                styles.metricIconCircle,
                                { backgroundColor: withOpacity(colors.sleep, 0.14) },
                            ]}
                        >
                            <Moon size={18} color={colors.sleep} strokeWidth={2.4} />
                        </View>
                        <View
                            style={[
                                styles.metricTrendPill,
                                {
                                    backgroundColor: sleepSummary
                                        ? withOpacity(colors.sleep, 0.14)
                                        : colors.surfaceContainer,
                                },
                            ]}
                        >
                            <Text
                                style={[
                                    styles.metricTrendText,
                                    { color: sleepSummary ? colors.sleep : colors.textSecondary },
                                ]}
                            >
                                Last night
                            </Text>
                        </View>
                    </View>
                    <Text style={styles.metricLabel}>Sleep</Text>
                    <View style={styles.metricValueRow}>
                        <Text style={styles.metricValue}>
                            {sleepSummary ? formatDuration(sleepSummary.asleepMinutes) : '0'}
                        </Text>
                        {sleepSummary ? <Text style={styles.metricUnit}>asleep</Text> : null}
                    </View>
                    {sleepSummary ? (
                        <>
                            <View style={styles.sleepTimesRow}>
                                <BedDouble size={13} color={colors.textSecondary} strokeWidth={2.2} />
                                <Text style={styles.sleepTimesText}>
                                    {formatClock(sleepSummary.start)} → {formatClock(sleepSummary.end)}
                                </Text>
                            </View>
                            {sleepSummary.stages ? (
                                <View style={styles.sleepStagesRow}>
                                    {SLEEP_STAGE_ROWS.map(({ key, label, opacity }) => (
                                        <View key={key} style={styles.sleepStage}>
                                            <View
                                                style={[
                                                    styles.sleepStageDot,
                                                    { backgroundColor: withOpacity(colors.sleep, opacity) },
                                                ]}
                                            />
                                            <Text style={styles.sleepStageText}>
                                                {label} {formatDuration(sleepSummary.stages![key])}
                                            </Text>
                                        </View>
                                    ))}
                                </View>
                            ) : null}
                        </>
                    ) : (
                        <Text style={styles.sleepHint}>{sleepMessage}</Text>
                    )}
                </TouchableOpacity>
            </View>

            {/* Weekly activity card — one bar per day, each the mean of
                that day's protein, carbs and fiber ratios (not a single
                metric). A Friday bar at 50% means protein + carbs + fiber
                averaged 50% of their targets that day. */}
            <View style={styles.card}>
                <View style={styles.cardHeaderTextBlock}>
                    <Text style={styles.cardTitle}>Weekly Activity</Text>
                    <Text style={styles.cardSubtitle} numberOfLines={1}>
                        Protein, carbs &amp; fiber
                    </Text>
                </View>

                <View style={styles.barChartRow}>
                    {weeklyMacros.loading && weeklyMacros.days.length === 0
                        ? Array.from({ length: 7 }, (_, index) => (
                              <View key={index} style={styles.barColumn}>
                                  <SkeletonBlock width={14} height={BAR_TRACK_HEIGHT} radius={8} />
                              </View>
                          ))
                        : weeklyMacros.days.map((day) => {
                              const dayPercent = Math.round(day.percent * 100);
                              // Today's badge shows by default; tapping any
                              // bar moves it there instead — never both,
                              // and never neither once something is picked.
                              const isHighlighted = selectedDateKey
                                  ? selectedDateKey === day.dateKey
                                  : day.isToday;
                              return (
                                  <TouchableOpacity
                                      key={day.dateKey}
                                      style={styles.barColumn}
                                      activeOpacity={0.7}
                                      onPress={() => setSelectedDateKey(day.dateKey)}
                                      accessibilityRole="button"
                                      accessibilityLabel={`${day.label} — ${dayPercent}% of goal`}
                                  >
                                      {isHighlighted ? (
                                          <View style={styles.barPeakBadge}>
                                              <Text style={styles.barPeakBadgeText}>{dayPercent}%</Text>
                                          </View>
                                      ) : null}
                                      <View style={[styles.barTrack, isHighlighted && styles.barTrackPeak]}>
                                          <View
                                              style={[
                                                  styles.barFill,
                                                  {
                                                      height: Math.max(BAR_TRACK_HEIGHT * day.percent, 8),
                                                      backgroundColor: isHighlighted
                                                          ? colors.primary
                                                          : withOpacity(colors.primary, 0.35),
                                                  },
                                              ]}
                                          />
                                      </View>
                                      <Text
                                          style={[styles.barDayLabel, isHighlighted && styles.barDayLabelActive]}
                                      >
                                          {day.label}
                                      </Text>
                                  </TouchableOpacity>
                              );
                          })}
                </View>
            </View>

            {/* Calorie budget card */}
            <View style={styles.card}>
                <View style={styles.cardHeaderRow}>
                    <View>
                        <Text style={styles.cardTitle}>Calorie Budget</Text>
                        <Text style={styles.cardSubtitle}>
                            {hasCalorieData
                                ? `${calorieBudgetConsumed.toLocaleString()} / ${calorieBudgetTotal.toLocaleString()} kcal consumed`
                                : calorieBudgetLoading
                                    ? 'Loading…'
                                    : 'No meals logged today'}
                        </Text>
                    </View>
                </View>

                {calorieBudgetLoading ? (
                    <View style={styles.calorieBudgetRow}>
                        <SkeletonBlock width={CALORIE_RING_SIZE} height={CALORIE_RING_SIZE} radius={CALORIE_RING_SIZE / 2} />
                        <View style={styles.macroList}>
                            <SkeletonBlock height={34} radius={10} />
                            <SkeletonBlock height={34} radius={10} />
                            <SkeletonBlock height={34} radius={10} />
                        </View>
                    </View>
                ) : (
                    <View style={styles.calorieBudgetRow}>
                        <View style={styles.calorieRingWrapper}>
                            <Svg width={CALORIE_RING_SIZE} height={CALORIE_RING_SIZE}>
                                <Circle
                                    cx={CALORIE_RING_SIZE / 2}
                                    cy={CALORIE_RING_SIZE / 2}
                                    r={calorieRingRadius}
                                    stroke={colors.surfaceContainer}
                                    strokeWidth={CALORIE_RING_STROKE}
                                    fill="none"
                                />
                                <Circle
                                    cx={CALORIE_RING_SIZE / 2}
                                    cy={CALORIE_RING_SIZE / 2}
                                    r={calorieRingRadius}
                                    stroke={colors.secondary}
                                    strokeWidth={CALORIE_RING_STROKE}
                                    strokeDasharray={calorieCircumference}
                                    strokeDashoffset={calorieDashOffset}
                                    strokeLinecap="round"
                                    fill="none"
                                    rotation={-90}
                                    originX={CALORIE_RING_SIZE / 2}
                                    originY={CALORIE_RING_SIZE / 2}
                                />
                            </Svg>
                            <View style={styles.calorieRingTextWrap}>
                                <Text style={styles.calorieRingValue}>{kcalLeft ?? '0'}</Text>
                                <Text style={styles.calorieRingLabel}>KCAL LEFT</Text>
                            </View>
                        </View>

                        <View style={styles.macroList}>
                            {macros.map((macro) => (
                                <View key={macro.label} style={styles.macroItem}>
                                    <View style={styles.macroHeaderRow}>
                                        <View style={styles.macroLabelRow}>
                                            <View style={[styles.macroDot, { backgroundColor: macro.color }]} />
                                            <Text style={styles.macroLabel}>{macro.label}</Text>
                                        </View>
                                        <Text style={styles.macroValue}>
                                            {hasCalorieData ? `${macro.grams} / ${macro.goalGrams}g` : `0 / ${macro.goalGrams}g`}
                                        </Text>
                                    </View>
                                    <View style={styles.macroTrack}>
                                        <View
                                            style={[
                                                styles.macroFill,
                                                {
                                                    width: hasCalorieData && macro.goalGrams > 0
                                                        ? `${Math.min((macro.grams / macro.goalGrams) * 100, 100)}%`
                                                        : '0%',
                                                    backgroundColor: macro.color,
                                                },
                                            ]}
                                        />
                                    </View>
                                </View>
                            ))}
                        </View>
                    </View>
                )}
            </View>

            {showWeightModal ? (
                <WeightEntryModal
                    initialWeightKg={weightKg}
                    saving={savingWeight}
                    onClose={() => setShowWeightModal(false)}
                    onSave={handleSaveWeight}
                />
            ) : null}
        </View>
    );
};

const styles = themedStyles(() => ({
    wrapper: {
        gap: 20,
    },
    greetingRow: {
        // Row, not a block: the streak pill sits at the far (flex-end)
        // side, opposite the name/date block.
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 8,
    },
    greetingTextBlock: {
        flexShrink: 1,
        alignItems: 'flex-start',
    },
    greetingTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        // Wraps rather than truncates — a name that does not fit on one
        // line should still be readable in full.
        flexWrap: 'wrap',
    },
    greetingTitle: {
        fontSize: 17,
        fontWeight: '800',
        color: colors.textPrimary,
        letterSpacing: -0.3,
    },
    greetingEmoji: {
        fontSize: 15,
        // Never the thing that gets squeezed — it is 15px wide and the
        // name beside it has hundreds to give.
        flexShrink: 0,
    },
    streakPill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        paddingHorizontal: 11,
        paddingVertical: 6,
        borderRadius: 14,
        backgroundColor: withOpacity(colors.secondary, 0.14),
        flexShrink: 0,
    },
    streakPillText: {
        fontSize: 14,
        fontWeight: '800',
        color: colors.secondary,
    },
    dateRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        marginTop: 3,
    },
    dateText: {
        fontSize: 12,
        fontWeight: '600',
        color: colors.textSecondary,
    },
    metricGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 12,
    },
    metricCard: {
        flexBasis: '47%',
        flexGrow: 1,
        backgroundColor: colors.surface,
        borderRadius: 20,
        padding: 14,
        shadowColor: colors.primary,
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.06,
        shadowRadius: 14,
        elevation: 2,
    },
    metricCardHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 10,
    },
    metricIconCircle: {
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
    },
    metricTrendPill: {
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 12,
    },
    metricHeaderRight: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    weightEditButton: {
        width: 22,
        height: 22,
        borderRadius: 11,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.surfaceContainer,
    },
    metricTrendText: {
        fontSize: 11,
        fontWeight: '700',
    },
    metricLabel: {
        fontSize: 12,
        fontWeight: '500',
        color: colors.textSecondary,
    },
    metricValueRow: {
        flexDirection: 'row',
        alignItems: 'baseline',
        gap: 4,
        marginTop: 3,
    },
    metricValue: {
        fontSize: 22,
        fontWeight: '800',
        color: colors.textPrimary,
        letterSpacing: -0.3,
    },
    metricUnit: {
        fontSize: 12,
        fontWeight: '600',
        color: colors.textSecondary,
    },
    sleepTimesRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        marginTop: 6,
    },
    sleepTimesText: {
        fontSize: 12,
        fontWeight: '600',
        color: colors.textSecondary,
    },
    sleepStagesRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 12,
        marginTop: 8,
    },
    sleepStage: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
    },
    sleepStageDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
    },
    sleepStageText: {
        fontSize: 11.5,
        fontWeight: '600',
        color: colors.textPrimary,
    },
    sleepHint: {
        fontSize: 12,
        lineHeight: 17,
        color: colors.textSecondary,
        marginTop: 4,
    },
    stepTrack: {
        height: 5,
        borderRadius: 3,
        backgroundColor: colors.surfaceContainer,
        overflow: 'hidden',
        marginTop: 9,
    },
    stepFill: {
        height: '100%',
        borderRadius: 3,
    },
    card: {
        backgroundColor: colors.surface,
        borderRadius: 24,
        padding: 18,
        gap: 16,
        shadowColor: colors.primary,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.08,
        shadowRadius: 20,
        elevation: 3,
    },
    cardHeaderRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
    },
    cardHeaderTextBlock: {
        flexShrink: 1,
    },
    cardTitle: {
        fontSize: 16,
        fontWeight: '800',
        color: colors.textPrimary,
        letterSpacing: -0.2,
    },
    cardSubtitle: {
        fontSize: 12,
        fontWeight: '500',
        color: colors.textSecondary,
        marginTop: 2,
    },
    barChartRow: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        height: BAR_TRACK_HEIGHT + 44,
        paddingHorizontal: 2,
    },
    barColumn: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'flex-end',
        gap: 8,
    },
    barPeakBadge: {
        backgroundColor: colors.primary,
        paddingHorizontal: 7,
        paddingVertical: 3,
        borderRadius: 10,
        marginBottom: 4,
    },
    barPeakBadgeText: {
        fontSize: 10,
        fontWeight: '800',
        color: colors.white,
    },
    barTrack: {
        width: 14,
        height: BAR_TRACK_HEIGHT,
        borderRadius: 8,
        backgroundColor: colors.surfaceContainer,
        justifyContent: 'flex-end',
        overflow: 'hidden',
    },
    barTrackPeak: {
        width: 16,
    },
    barFill: {
        width: '100%',
        borderRadius: 8,
    },
    barDayLabel: {
        fontSize: 11,
        fontWeight: '600',
        color: colors.textSecondary,
    },
    barDayLabelActive: {
        color: colors.primary,
        fontWeight: '800',
    },
    calorieBudgetRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 20,
    },
    calorieRingWrapper: {
        width: CALORIE_RING_SIZE,
        height: CALORIE_RING_SIZE,
        alignItems: 'center',
        justifyContent: 'center',
    },
    calorieRingTextWrap: {
        position: 'absolute',
        alignItems: 'center',
    },
    calorieRingValue: {
        fontSize: 22,
        fontWeight: '800',
        color: colors.textPrimary,
        letterSpacing: -0.3,
    },
    calorieRingLabel: {
        fontSize: 9,
        fontWeight: '700',
        color: colors.textSecondary,
        letterSpacing: 0.4,
        marginTop: 2,
    },
    macroList: {
        flex: 1,
        gap: 12,
    },
    macroItem: {
        gap: 6,
    },
    macroHeaderRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    macroLabelRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    macroDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
    },
    macroLabel: {
        fontSize: 12,
        fontWeight: '700',
        color: colors.textPrimary,
    },
    macroValue: {
        fontSize: 11,
        fontWeight: '600',
        color: colors.textSecondary,
    },
    macroTrack: {
        height: 8,
        borderRadius: 4,
        backgroundColor: colors.surfaceContainer,
        overflow: 'hidden',
    },
    macroFill: {
        height: '100%',
        borderRadius: 4,
    },
}));

export default DashboardOverview;
