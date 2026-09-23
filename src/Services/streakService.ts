// Consistency signals that need the FULL log history rather than a
// single date range: the current streak, a month's heatmap, and personal
// records.
//
// PRs reuse fetchWorkoutLogsForUser's existing result (already fetched
// for the Workout tab's progress card) rather than a new query — every
// completed log already carries every exercise's sets, which is all a
// PR needs. Pure — no Firestore.
// Explicit .ts extension: dateRange.ts is Firebase-free like this file,
// so — unlike workoutLogService/progressService above — there is no
// reason to duplicate its two tiny date helpers instead of importing
// them; tsconfig's allowImportingTsExtensions exists for this.
import { addDays, toDateKey } from './dateRange.ts';
import type { ExerciseSetEntry } from './workoutLogService';

/**
 * Estimated one-rep max, via the Epley formula. Duplicated from
 * progressService rather than imported — see dateRange.ts's note on
 * toDateKey for why: keeping this file's dependency graph free of
 * anything that would drag Firebase in lets it run under `node --test`
 * with no app to initialize. progressService.test.ts already covers this
 * formula; kept in sync here since it will not change without a reason
 * to touch both.
 */
function estimateOneRepMax(set: ExerciseSetEntry): number {
  if (set.weight <= 0) return 0;
  if (set.reps <= 1) return set.weight;
  return set.weight * (1 + set.reps / 30);
}

/**
 * Consecutive days, ending today or yesterday, with at least one
 * completed workout.
 *
 * Ending at YESTERDAY still counts, so the streak does not reset to zero
 * first thing in the morning before the day's session is logged — it
 * only breaks once a full day has passed with nothing logged.
 */
export function currentWorkoutStreak(completedDateKeys: Iterable<string>, today: Date): number {
  const completed = new Set(completedDateKeys);
  let cursor = today;

  if (!completed.has(toDateKey(cursor))) {
    cursor = addDays(cursor, -1);
    if (!completed.has(toDateKey(cursor))) return 0;
  }

  let streak = 0;
  while (completed.has(toDateKey(cursor))) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

export interface HeatmapDay {
  /** "YYYY-MM-DD" */
  date: string;
  hasWorkout: boolean;
}

/** Every day of the given month, marked with whether a workout was
 * completed that day — the heatmap's raw material. `monthKey` is
 * "YYYY-MM". */
export function buildMonthlyHeatmap(
  completedDateKeys: Iterable<string>,
  monthKey: string,
): HeatmapDay[] {
  const completed = new Set(completedDateKeys);
  const [year, month] = monthKey.split('-').map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();

  return Array.from({ length: daysInMonth }, (_, index) => {
    const date = `${monthKey}-${String(index + 1).padStart(2, '0')}`;
    return { date, hasWorkout: completed.has(date) };
  });
}

export interface PersonalRecord {
  exerciseId: string;
  exerciseName: string;
  /** "YYYY-MM-DD" the record was set. */
  date: string;
  oneRepMax: number;
  previousBest: number;
  /** null when there was no earlier attempt to compare against. */
  improvementPercent: number | null;
}

interface LoggedExercise {
  exerciseId: string;
  name: string;
  sets: ExerciseSetEntry[];
}

interface CompletedLog {
  date: string;
  state: string;
  exercises: LoggedExercise[];
}

/**
 * Every point at which an exercise's estimated 1RM beat its own previous
 * best, across the whole history — newest first.
 *
 * The FIRST time an exercise is ever logged is not a PR: there is
 * nothing yet to have beaten, and counting it would call every new
 * exercise a personal record on day one.
 */
export function detectPersonalRecords(logs: CompletedLog[]): PersonalRecord[] {
  const sorted = [...logs]
    .filter((log) => log.state === 'completed')
    .sort((a, b) => a.date.localeCompare(b.date));

  const bestSoFar = new Map<string, { oneRepMax: number; name: string }>();
  const records: PersonalRecord[] = [];

  for (const log of sorted) {
    for (const exercise of log.exercises) {
      let sessionBest = 0;
      for (const set of exercise.sets) {
        sessionBest = Math.max(sessionBest, estimateOneRepMax(set));
      }
      if (sessionBest <= 0) continue;

      const previous = bestSoFar.get(exercise.exerciseId);
      if (!previous) {
        bestSoFar.set(exercise.exerciseId, { oneRepMax: sessionBest, name: exercise.name });
        continue; // first sighting — nothing beaten yet
      }

      if (sessionBest > previous.oneRepMax) {
        records.push({
          exerciseId: exercise.exerciseId,
          exerciseName: exercise.name,
          date: log.date,
          oneRepMax: sessionBest,
          previousBest: previous.oneRepMax,
          improvementPercent: Math.round(((sessionBest - previous.oneRepMax) / previous.oneRepMax) * 100),
        });
        bestSoFar.set(exercise.exerciseId, { oneRepMax: sessionBest, name: exercise.name });
      }
    }
  }

  return records.reverse();
}
