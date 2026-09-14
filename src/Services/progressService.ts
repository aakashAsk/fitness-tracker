// Turns logged sets into the numbers a progress chart plots.
//
// Everything here is pure — it works on the history the log lookup
// already returns, so charting costs no extra Firestore reads.
import type { ExerciseSessionEntry, ExerciseSetEntry } from './workoutLogService';

/**
 * Estimated one-rep max, via the Epley formula:
 *
 *   1RM = weight × (1 + reps / 30)
 *
 * Why estimate rather than plot the raw weight: a set of 5×60kg and a
 * set of 12×60kg are the same on a weight-only chart, even though the
 * second is a clear improvement. Epley folds both numbers into one
 * comparable figure, which is what makes a trend line meaningful across
 * sessions where the rep count moved instead of the load.
 *
 * A single rep returns the weight unchanged, and so does a set with no
 * reps recorded — so this degrades to a plain weight chart rather than
 * collapsing to zero when rep data is missing.
 */
export function estimateOneRepMax(set: ExerciseSetEntry): number {
  if (set.weight <= 0) return 0;
  if (set.reps <= 1) return set.weight;
  return set.weight * (1 + set.reps / 30);
}

export interface TrendPoint {
  /** "YYYY-MM-DD" */
  date: string;
  /** Best estimated 1RM across that session's sets, rounded to 0.5kg. */
  oneRepMax: number;
  /** Heaviest single set that session — shown alongside the estimate. */
  topWeight: number;
  /** Σ reps × weight for the session. */
  volume: number;
}

export interface ExerciseTrend {
  points: TrendPoint[];
  /** Most recent session's estimate, or 0 when there is nothing to plot. */
  latest: number;
  /** Change against the session before it — negative when it dropped. */
  delta: number;
  /** Best estimate across the whole window. */
  best: number;
  /** True when the latest session is the best one in the window. */
  isPersonalBest: boolean;
}

/** Rounds to the nearest 0.5 — finer than 1kg, but not a false-precision
 * decimal like 82.33333. */
function roundToHalf(value: number): number {
  return Math.round(value * 2) / 2;
}

/**
 * Builds the series for one exercise.
 *
 * Sessions with no usable weight are dropped rather than plotted as
 * zero: a bodyweight exercise logs reps only, and a line diving to the
 * axis would read as a collapse in strength rather than an absence of
 * data.
 *
 * `limit` keeps only the most recent N sessions, since the card is a
 * recent-trend view, not the full history.
 */
export function buildExerciseTrend(
  sessions: ExerciseSessionEntry[] = [],
  limit = 8,
): ExerciseTrend {
  const points: TrendPoint[] = [];

  for (const session of sessions) {
    let oneRepMax = 0;
    let topWeight = 0;
    let volume = 0;

    for (const set of session.sets) {
      oneRepMax = Math.max(oneRepMax, estimateOneRepMax(set));
      topWeight = Math.max(topWeight, set.weight);
      volume += set.reps * set.weight;
    }

    if (oneRepMax <= 0) continue;

    points.push({
      date: session.date,
      oneRepMax: roundToHalf(oneRepMax),
      topWeight: roundToHalf(topWeight),
      volume: Math.round(volume),
    });
  }

  const windowed = points.slice(-limit);
  const latest = windowed.length > 0 ? windowed[windowed.length - 1].oneRepMax : 0;
  const previous = windowed.length > 1 ? windowed[windowed.length - 2].oneRepMax : 0;
  const best = windowed.reduce((max, point) => Math.max(max, point.oneRepMax), 0);

  return {
    points: windowed,
    latest,
    delta: previous > 0 ? roundToHalf(latest - previous) : 0,
    best,
    // `>=` so repeating your best still reads as holding a PB, not as
    // having fallen short of one.
    isPersonalBest: windowed.length > 1 && latest >= best,
  };
}

export interface SessionTotals {
  /** "YYYY-MM-DD" */
  date: string;
  /** Σ reps × weight across every set logged that day, in kg. */
  volume: number;
  /** Heaviest single set of the day. */
  topWeight: number;
  /**
   * Average load lifted that day, as a volume-weighted mean:
   *
   *   avgWeight = Σ(reps × weight) / Σ(reps)
   *
   * i.e. the average kg moved per rep. A plain mean of the set weights
   * would treat a 1-rep top single and a 15-rep back-off set as equally
   * important, so a couple of light warm-ups could drag the day's
   * average below a session that was objectively heavier. Weighting by
   * reps makes each repetition count once, which is what "how heavy was
   * today" actually means.
   *
   * Because it's derived from running sums, it stays correct as new
   * sets arrive — no recalculation from scratch and no stored average
   * to drift out of date.
   */
  avgWeight: number;
  /** How many sets were logged. */
  sets: number;
  /** Σ reps across every set. */
  reps: number;
}

export interface WorkoutProgress {
  /** One entry per logged day, oldest first. */
  sessions: SessionTotals[];
  totalVolume: number;
  totalSets: number;
  totalReps: number;
  /** Heaviest single set across the whole window. */
  bestWeight: number;
  /** Same volume-weighted mean as `SessionTotals.avgWeight`, but across
   * every session in the window. Derived from the window totals, not
   * averaged from the per-day averages — a mean of means would weight a
   * two-set day the same as a twenty-set one. */
  avgWeight: number;
}

/**
 * Rolls every completed log up into one row per day, across all plans
 * and all exercises.
 *
 * Deliberately not scoped to one exercise or one plan: a chart tied to
 * "the first exercise on the day you happen to be looking at" is empty
 * far more often than not — a rest day, or any exercise the user hasn't
 * logged before, leaves nothing to draw. Day totals are populated
 * whenever the user has trained at all.
 *
 * Two days' logs for different plans merge into a single point, since a
 * "session" here means a day of training, not a plan.
 */
export function buildWorkoutProgress(
  logs: { date: string; state: string; exercises: { sets: ExerciseSetEntry[] }[] }[],
  limit = 15,
): WorkoutProgress {
  // Carries two extra running sums so the average can be derived at the
  // end rather than recomputed per set — and so a day split across
  // several plan logs still averages over all of them together.
  interface Accumulator extends SessionTotals {
    /** Σ weight over sets that had a weight — the fallback denominator
     * when a day was logged with no reps at all. */
    weightSum: number;
    weightedSets: number;
  }

  const byDate = new Map<string, Accumulator>();

  for (const log of logs) {
    // 'planned' rows carry an exercise list but no performed numbers.
    if (log.state !== 'completed') continue;

    const totals: Accumulator = byDate.get(log.date) ?? {
      date: log.date,
      volume: 0,
      topWeight: 0,
      avgWeight: 0,
      sets: 0,
      reps: 0,
      weightSum: 0,
      weightedSets: 0,
    };

    for (const exercise of log.exercises) {
      for (const set of exercise.sets) {
        // A set with neither reps nor weight is an untouched row the
        // save wrote as zeroes, not something the user performed.
        if (set.reps <= 0 && set.weight <= 0) continue;
        totals.volume += set.reps * set.weight;
        totals.topWeight = Math.max(totals.topWeight, set.weight);
        totals.sets += 1;
        totals.reps += set.reps;

        if (set.weight > 0) {
          totals.weightSum += set.weight;
          totals.weightedSets += 1;
        }
      }
    }

    byDate.set(log.date, totals);
  }

  const windowed = Array.from(byDate.values())
    .filter((session) => session.sets > 0)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-limit);

  const sessions: SessionTotals[] = windowed.map(
    ({ weightSum, weightedSets, ...session }) => ({
      ...session,
      volume: Math.round(session.volume),
      avgWeight: averageLoad(session.volume, session.reps, weightSum, weightedSets),
    }),
  );

  const totalVolume = windowed.reduce((sum, session) => sum + session.volume, 0);
  const totalReps = windowed.reduce((sum, session) => sum + session.reps, 0);

  return {
    sessions,
    totalVolume: Math.round(totalVolume),
    totalSets: windowed.reduce((sum, session) => sum + session.sets, 0),
    totalReps,
    bestWeight: windowed.reduce((max, session) => Math.max(max, session.topWeight), 0),
    avgWeight: averageLoad(
      totalVolume,
      totalReps,
      windowed.reduce((sum, session) => sum + session.weightSum, 0),
      windowed.reduce((sum, session) => sum + session.weightedSets, 0),
    ),
  };
}

/**
 * Volume ÷ reps, with a fallback for the case that breaks it.
 *
 * Normally the answer is Σ(reps × weight) / Σ(reps). But a set logged
 * with a weight and no reps — a timed hold, or a row saved before the
 * reps were filled in — contributes to neither sum, so a day made
 * entirely of those would divide by zero. It falls back to the plain
 * mean of the set weights there, which is the best available answer
 * when there are no reps to weight by.
 */
function averageLoad(
  volume: number,
  reps: number,
  weightSum: number,
  weightedSets: number,
): number {
  if (reps > 0 && volume > 0) return roundToHalf(volume / reps);
  if (weightedSets > 0) return roundToHalf(weightSum / weightedSets);
  return 0;
}

/** 12500 → "12.5k" — keeps big volume figures inside a stat tile. */
export function formatCompact(value: number): string {
  if (value >= 10000) return `${(value / 1000).toFixed(1)}k`;
  if (value >= 1000) return `${(value / 1000).toFixed(2)}k`;
  return String(Math.round(value));
}

/** "12 Sep" — compact enough for an axis label. */
export function formatTrendLabel(dateKey: string): string {
  const [, month, day] = dateKey.split('-').map(Number);
  const MONTHS = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];
  return `${day} ${MONTHS[month - 1] ?? ''}`.trim();
}
