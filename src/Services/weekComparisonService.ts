// "This week vs last week" — one row per metric, with a % change and a
// colour that says whether the change is good news, not just which way
// the arrow points.
//
// Pure — takes the two weeks' already-aggregated numbers and the user's
// current targets, and returns what to render. Aggregating raw logs into
// those numbers is the caller's job (a hook that reads
// fetchTelemetryRange / fetchMealLogsForRange / fetchWorkoutLogsForUser).

export type ComparisonTone = 'good' | 'bad' | 'neutral';

export interface MetricComparison {
  key: string;
  label: string;
  unit: string;
  current: number;
  previous: number;
  /** Rounded percentage change; null when there is no previous value to
   * compare against (division by zero), which is data absence, not 0%. */
  percentChange: number | null;
  tone: ComparisonTone;
}

function percentChangeOf(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return Math.round(((current - previous) / previous) * 100);
}

/**
 * A metric with a fixed target (calories, protein): moving CLOSER to the
 * target is good, moving away is bad, regardless of which goal the user
 * is on. This is deliberately not "lower is always good for fat loss" —
 * the user's own daily targets already encode their goal's direction
 * (see calculateCalorieTarget/calculateMacros in userProfileService), so
 * distance-to-target is the one rule that is correct for every goal
 * without hardcoding a per-goal assumption here.
 */
function towardTargetTone(current: number, previous: number, target: number): ComparisonTone {
  if (target <= 0) return 'neutral';
  const currentDistance = Math.abs(current - target);
  const previousDistance = Math.abs(previous - target);
  // A tolerance band avoids labelling a 1-calorie wobble as progress.
  const tolerance = target * 0.02;
  if (currentDistance < previousDistance - tolerance) return 'good';
  if (currentDistance > previousDistance + tolerance) return 'bad';
  return 'neutral';
}

/** More is generically better — steps, workouts completed, training
 * volume. No goal makes "did less of this" the win. */
function higherIsBetterTone(current: number, previous: number): ComparisonTone {
  if (current > previous) return 'good';
  if (current < previous) return 'bad';
  return 'neutral';
}

export interface WeekComparisonInput {
  avgCalories: { current: number; previous: number; target: number };
  avgProtein: { current: number; previous: number; target: number };
  totalSteps: { current: number; previous: number };
  workoutsCompleted: { current: number; previous: number };
  totalVolumeKg: { current: number; previous: number };
}

export function buildWeekComparison(input: WeekComparisonInput): MetricComparison[] {
  const entries: (Omit<MetricComparison, 'percentChange' | 'tone'> & {
    tone: ComparisonTone;
  })[] = [
    {
      key: 'avgCalories',
      label: 'Avg Calories',
      unit: 'kcal',
      current: input.avgCalories.current,
      previous: input.avgCalories.previous,
      tone: towardTargetTone(
        input.avgCalories.current,
        input.avgCalories.previous,
        input.avgCalories.target,
      ),
    },
    {
      key: 'avgProtein',
      label: 'Avg Protein',
      unit: 'g',
      current: input.avgProtein.current,
      previous: input.avgProtein.previous,
      tone: towardTargetTone(
        input.avgProtein.current,
        input.avgProtein.previous,
        input.avgProtein.target,
      ),
    },
    {
      key: 'totalSteps',
      label: 'Total Steps',
      unit: '',
      current: input.totalSteps.current,
      previous: input.totalSteps.previous,
      tone: higherIsBetterTone(input.totalSteps.current, input.totalSteps.previous),
    },
    {
      key: 'workoutsCompleted',
      label: 'Workouts',
      unit: '',
      current: input.workoutsCompleted.current,
      previous: input.workoutsCompleted.previous,
      tone: higherIsBetterTone(input.workoutsCompleted.current, input.workoutsCompleted.previous),
    },
    {
      key: 'totalVolumeKg',
      label: 'Training Volume',
      unit: 'kg',
      current: input.totalVolumeKg.current,
      previous: input.totalVolumeKg.previous,
      tone: higherIsBetterTone(input.totalVolumeKg.current, input.totalVolumeKg.previous),
    },
  ];

  return entries.map((entry) => ({
    ...entry,
    percentChange: percentChangeOf(entry.current, entry.previous),
  }));
}
