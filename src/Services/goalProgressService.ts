// The dashboard's hero card: "am I getting better, and am I on track for
// my goal?" — answered differently depending on which goal the user set
// at onboarding (see UserProfile.goal).
//
// Pure — every input is a plain value the caller already has (profile,
// weight history, workout sessions, an adherence percentage), so this can
// be unit-tested without Firestore and reused by both the dashboard card
// and its drill-down screen.
//
// WHY THERE IS NO 0-100% "PROGRESS TO TARGET" BAR: the app's data model
// has a target *rate* (weeklyPaceKg — kg to lose per week) but no target
// *weight*, no target 1RM and no target step count. Inventing one of
// those to draw a percentage would be showing the user a number nobody
// asked for. Instead, "on track" compares the user's ACTUAL trend against
// the RATE their own profile already states, which is the one target
// that exists in the data — see computeFatLossProgress. The other three
// goals have no rate either, so their signal is trend direction
// (hypertrophy) or consistency (endurance, maintenance), described in
// words rather than forced into a fabricated percentage.
import type { FitnessGoal } from './userProfileService';
import type { SessionTotals } from './progressService';

export type GoalStatus = 'ahead' | 'on-track' | 'behind' | 'insufficient-data';

export interface GoalProgressResult {
  goal: FitnessGoal;
  status: GoalStatus;
  /** One line, e.g. "On track — losing 0.4 kg/week". */
  headline: string;
  /** A sentence of supporting detail. */
  detail: string;
  /** 0-100 when there is a meaningful percentage to show (currently only
   * the consistency-based goals), otherwise null — see the file header. */
  percent: number | null;
  /** Total change since the starting point, when there is one to show. */
  changeLabel: string | null;
}

export interface WeightPoint {
  /** "YYYY-MM-DD" */
  date: string;
  weightKg: number;
}

/** Ordinary least-squares slope of weight against day number, in kg per
 * week. Null when there are fewer than two points or they do not span at
 * least a week — a slope fit to three days of noisy morning weigh-ins is
 * not a trend, it is measurement error. */
export function linearTrendPerWeek(points: WeightPoint[]): number | null {
  if (points.length < 2) return null;

  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date));
  const firstDayMs = new Date(`${sorted[0].date}T00:00:00`).getTime();
  const spanDays =
    (new Date(`${sorted[sorted.length - 1].date}T00:00:00`).getTime() - firstDayMs) / 86_400_000;
  if (spanDays < 7) return null;

  const xs = sorted.map((p) => (new Date(`${p.date}T00:00:00`).getTime() - firstDayMs) / 86_400_000);
  const ys = sorted.map((p) => p.weightKg);
  const n = xs.length;
  const meanX = xs.reduce((sum, x) => sum + x, 0) / n;
  const meanY = ys.reduce((sum, y) => sum + y, 0) / n;

  let numerator = 0;
  let denominator = 0;
  for (let i = 0; i < n; i += 1) {
    numerator += (xs[i] - meanX) * (ys[i] - meanY);
    denominator += (xs[i] - meanX) ** 2;
  }
  if (denominator === 0) return 0; // every point on the same day-offset — flat

  const slopePerDay = numerator / denominator;
  return Math.round(slopePerDay * 7 * 100) / 100;
}

const round1 = (value: number) => Math.round(value * 10) / 10;

/**
 * Fat-loss progress: actual weekly weight-change rate, from a linear fit
 * over recent weigh-ins, against the profile's own weeklyPaceKg target.
 *
 * `targetWeeklyPaceKg` is POSITIVE (kg to lose per week); the fitted
 * trend is negative while losing, so the ratio of the two is positive
 * exactly when the user is moving the right way, and its size says how
 * fast relative to the plan.
 */
export function computeFatLossProgress(input: {
  startWeightKg: number;
  currentWeightKg: number | null;
  weightHistory: WeightPoint[];
  targetWeeklyPaceKg: number;
}): GoalProgressResult {
  const { startWeightKg, currentWeightKg, weightHistory, targetWeeklyPaceKg } = input;
  const totalChange =
    currentWeightKg !== null ? round1(currentWeightKg - startWeightKg) : null;
  const changeLabel =
    totalChange !== null
      ? `${totalChange <= 0 ? '' : '+'}${totalChange} kg since you started`
      : null;

  const trendPerWeek = linearTrendPerWeek(weightHistory);
  if (trendPerWeek === null) {
    return {
      goal: 'fat-loss',
      status: 'insufficient-data',
      headline: 'Log a weigh-in to see your trend',
      detail: 'Weigh in on a few more days — a week of entries is enough to show a trend.',
      percent: null,
      changeLabel,
    };
  }

  // How fast the user is actually losing, relative to the plan: 1.0 means
  // exactly on the target pace, >1 means faster, <0 means gaining.
  const ratio = targetWeeklyPaceKg > 0 ? -trendPerWeek / targetWeeklyPaceKg : 0;
  const rateLabel = `${Math.abs(trendPerWeek).toFixed(1)} kg/week ${trendPerWeek <= 0 ? 'lost' : 'gained'}`;

  if (ratio >= 1.15) {
    return {
      goal: 'fat-loss',
      status: 'ahead',
      headline: `Ahead of pace — ${rateLabel}`,
      detail: `That's faster than your ${targetWeeklyPaceKg} kg/week target. Make sure it still feels sustainable.`,
      percent: null,
      changeLabel,
    };
  }
  if (ratio >= 0.85) {
    return {
      goal: 'fat-loss',
      status: 'on-track',
      headline: `On track — ${rateLabel}`,
      detail: `Right around your ${targetWeeklyPaceKg} kg/week target. Keep it up.`,
      percent: null,
      changeLabel,
    };
  }
  return {
    goal: 'fat-loss',
    status: 'behind',
    headline: trendPerWeek <= 0 ? `Behind pace — ${rateLabel}` : `Trending up — ${rateLabel}`,
    detail: `Your target is ${targetWeeklyPaceKg} kg/week. Recent calorie and workout logs are the first place to check.`,
    percent: null,
    changeLabel,
  };
}

/**
 * Hypertrophy progress: total training volume this window against the
 * window before it. The app has no target volume, so this is a trend
 * signal (is total work going up) rather than a percentage toward a goal.
 */
export function computeMuscleGainProgress(input: {
  recentSessions: SessionTotals[];
  previousSessions: SessionTotals[];
}): GoalProgressResult {
  const { recentSessions, previousSessions } = input;
  if (recentSessions.length === 0) {
    return {
      goal: 'hypertrophy',
      status: 'insufficient-data',
      headline: 'Log a few workouts to see your trend',
      detail: 'Volume trends need at least one logged session in the last two weeks.',
      percent: null,
      changeLabel: null,
    };
  }

  const sum = (sessions: SessionTotals[]) => sessions.reduce((total, s) => total + s.volume, 0);
  const recentVolume = sum(recentSessions);
  const previousVolume = sum(previousSessions);

  if (previousVolume === 0) {
    return {
      goal: 'hypertrophy',
      status: 'insufficient-data',
      headline: `${Math.round(recentVolume).toLocaleString()} kg lifted recently`,
      detail: 'One more window of training will show whether that volume is climbing.',
      percent: null,
      changeLabel: null,
    };
  }

  const percentChange = Math.round(((recentVolume - previousVolume) / previousVolume) * 100);
  const changeLabel = `${percentChange >= 0 ? '+' : ''}${percentChange}% volume vs. the period before`;

  if (percentChange >= 5) {
    return {
      goal: 'hypertrophy',
      status: 'ahead',
      headline: `Volume climbing — ${changeLabel}`,
      detail: 'Training volume is trending up, which is what drives muscle growth over time.',
      percent: null,
      changeLabel,
    };
  }
  if (percentChange >= -5) {
    return {
      goal: 'hypertrophy',
      status: 'on-track',
      headline: `Holding steady — ${changeLabel}`,
      detail: 'Volume is stable. Add a rep or a little weight when a session feels easy.',
      percent: null,
      changeLabel,
    };
  }
  return {
    goal: 'hypertrophy',
    status: 'behind',
    headline: `Volume slipping — ${changeLabel}`,
    detail: 'Training volume has dropped from the period before — check for missed or shortened sessions.',
    percent: null,
    changeLabel,
  };
}

/**
 * Endurance and general-fitness progress: the % of planned sessions
 * actually completed in the trailing window — the one thing every goal
 * without a rate or a volume target still has: whether the user showed
 * up. `PLAN_ADHERENCE_GOAL_HOURS` isn't a thing; endurance and
 * maintenance share this because neither has a better signal available
 * in the data model today (see adherenceService for how the % is built).
 */
export function computeConsistencyProgress(
  goal: FitnessGoal,
  input: { plannedCount: number; completedCount: number },
): GoalProgressResult {
  const { plannedCount, completedCount } = input;
  if (plannedCount === 0) {
    return {
      goal,
      status: 'insufficient-data',
      headline: 'Schedule a plan to track consistency',
      detail: 'Once you have workouts on the calendar, this card shows how many you complete.',
      percent: null,
      changeLabel: null,
    };
  }

  const percent = Math.round((completedCount / plannedCount) * 100);
  const changeLabel = `${completedCount} of ${plannedCount} planned sessions this period`;

  if (percent >= 90) {
    return {
      goal,
      status: 'ahead',
      headline: `${percent}% of planned sessions done`,
      detail: 'Excellent consistency — that is what compounds into results.',
      percent,
      changeLabel,
    };
  }
  if (percent >= 70) {
    return {
      goal,
      status: 'on-track',
      headline: `${percent}% of planned sessions done`,
      detail: 'Good consistency. A couple more logged sessions gets you to excellent.',
      percent,
      changeLabel,
    };
  }
  return {
    goal,
    status: 'behind',
    headline: `${percent}% of planned sessions done`,
    detail: 'A few sessions have slipped. Consistency matters more than any single hard workout.',
    percent,
    changeLabel,
  };
}
