// Approximate benefit numbers for a logged workout: volume, calories
// burned, fat-loss equivalent and recovery time.
//
// Pure — no Firestore, no React — so every rule can be unit-tested and the
// formulas live in exactly one place, the same split as progressService.
//
// These are ESTIMATES, on purpose. The inputs are sets, reps, load, the
// exercises' muscles and body weight; there is no heart rate, no real
// timing and no body-composition data. The constants below are widely
// used rules of thumb, not measurements, and the UI labels the output as
// approximate. What the numbers are good for is comparing one session
// with another and giving a sense of scale — not for accounting.
//
// Bump STATS_VERSION whenever a formula or constant changes, so stored
// rows written under an older formula can be told apart from new ones.
import type { ExerciseSetEntry } from './workoutLogService';

export const STATS_VERSION = 1;

/** Used when the user's profile has no weight — the stored
 * `weightKgUsed` records that it was a stand-in, not a measurement. */
export const DEFAULT_WEIGHT_KG = 70;

/** kcal in one gram of body fat (~7,700 kcal per kg — the standard
 * energy-balance approximation). */
const KCAL_PER_GRAM_FAT = 7.7;

/** Seconds of lifting per rep. */
const SECONDS_PER_REP = 3;
/** Reps assumed for a set logged with a load but no rep count (a hold). */
const REPS_FOR_UNCOUNTED_SET = 10;
/** Rest between sets, seconds — compound lifts need longer. */
const REST_SECONDS_COMPOUND = 90;
const REST_SECONDS_OTHER = 60;

/** Resistance-training MET range (2011 Compendium of Physical
 * Activities): 3.5 light/moderate effort → 6.0 vigorous effort. A session
 * made entirely of compound lifts sits at the top, all isolation work at
 * the bottom. */
const MET_MIN = 3.5;
const MET_MAX = 6.0;

/** Muscle-size groups drive the recovery baseline: big muscles take
 * longer to recover than small ones. Free Exercise DB muscle names. */
const LARGE_MUSCLES: ReadonlySet<string> = new Set([
  'chest',
  'lats',
  'middle back',
  'lower back',
  'quadriceps',
  'hamstrings',
  'glutes',
]);

const RECOVERY = {
  large: { baseHours: 48, perExtraSet: 4 },
  small: { baseHours: 36, perExtraSet: 3 },
  /** Sets a muscle absorbs before recovery time starts to grow. */
  freeSets: 3,
  minHours: 24,
  maxHours: 96,
  /** A muscle only counts once it did this many effective sets — one
   * secondary-muscle set of a press does not make the triceps sore. */
  minEffectiveSets: 2,
  secondarySetWeight: 0.5,
  /** Average reps at or below → heavy; at or above → light. */
  heavyAvgReps: 5,
  lightAvgReps: 15,
  heavyFactor: 1.15,
  lightFactor: 0.9,
  /** When no muscle information is available at all. */
  unknownHours: 48,
} as const;

/** The parts of an Exercise record the estimate needs. */
export interface ExerciseMeta {
  primaryMuscles: string[];
  secondaryMuscles: string[];
  mechanic: 'compound' | 'isolation' | null;
  /** Free Exercise DB category — 'stretching' sets are ignored. */
  category?: string | null;
}

export interface StatsExerciseInput {
  sets: ExerciseSetEntry[];
  /** Null while the exercise's record has not resolved; the sets still
   * count toward volume and time, just not toward recovery. */
  meta: ExerciseMeta | null;
}

export interface MuscleRecovery {
  muscle: string;
  hours: number;
}

export interface WorkoutStats {
  /** Formula version — see STATS_VERSION. */
  version: number;
  /** Σ reps × weight, kg. Same definition as the progress card. */
  volumeKg: number;
  totalSets: number;
  totalReps: number;
  /** Estimated time under load plus rest, minutes. */
  estimatedMinutes: number;
  /** Active calories — above resting metabolism, which is burned anyway. */
  caloriesBurned: number;
  /** Energy-balance fat equivalent of caloriesBurned, grams. */
  fatLossGrams: number;
  /** Hours until the hardest-hit muscle is recovered. */
  recoveryHours: number;
  /** The most-worked muscles, hardest first, at most three. */
  recoveryMuscles: MuscleRecovery[];
  /** The body weight the calorie figure used. */
  weightKgUsed: number;
}

export interface StatsInput {
  exercises: StatsExerciseInput[];
  /** Null/absent falls back to DEFAULT_WEIGHT_KG. */
  bodyWeightKg?: number | null;
}

function isPerformed(set: ExerciseSetEntry): boolean {
  // Same test as buildWorkoutProgress: a set with neither reps nor weight
  // is an untouched row the save wrote as zeroes.
  return set.reps > 0 || set.weight > 0;
}

function recoveryHoursFor(muscle: string, effectiveSets: number): number {
  const tier = LARGE_MUSCLES.has(muscle) ? RECOVERY.large : RECOVERY.small;
  const extra = Math.max(0, effectiveSets - RECOVERY.freeSets);
  return tier.baseHours + extra * tier.perExtraSet;
}

/**
 * Estimates one session's benefit numbers, or null when nothing was
 * actually performed (every set blank), so an untouched save never stores
 * a row of zeroes that reads as a real workout.
 */
export function estimateWorkoutStats(input: StatsInput): WorkoutStats | null {
  const weightKg =
    input.bodyWeightKg && input.bodyWeightKg > 0 ? input.bodyWeightKg : DEFAULT_WEIGHT_KG;

  let volume = 0;
  let totalSets = 0;
  let totalReps = 0;
  let compoundSets = 0;
  let seconds = 0;
  let weightedSets = 0;
  let weightedReps = 0;
  const effectiveSetsByMuscle = new Map<string, number>();

  for (const exercise of input.exercises) {
    // Stretching is neither load nor training stress.
    if (exercise.meta?.category === 'stretching') continue;

    const isCompound = exercise.meta?.mechanic === 'compound';
    const performed = exercise.sets.filter(isPerformed);

    for (const set of performed) {
      volume += set.reps * set.weight;
      totalSets += 1;
      totalReps += set.reps;
      if (isCompound) compoundSets += 1;
      if (set.weight > 0) {
        weightedSets += 1;
        weightedReps += set.reps;
      }
      seconds +=
        (set.reps > 0 ? set.reps : REPS_FOR_UNCOUNTED_SET) * SECONDS_PER_REP +
        (isCompound ? REST_SECONDS_COMPOUND : REST_SECONDS_OTHER);
    }

    if (performed.length === 0 || !exercise.meta) continue;
    for (const muscle of exercise.meta.primaryMuscles) {
      const key = muscle.trim().toLowerCase();
      effectiveSetsByMuscle.set(key, (effectiveSetsByMuscle.get(key) ?? 0) + performed.length);
    }
    for (const muscle of exercise.meta.secondaryMuscles) {
      const key = muscle.trim().toLowerCase();
      effectiveSetsByMuscle.set(
        key,
        (effectiveSetsByMuscle.get(key) ?? 0) + performed.length * RECOVERY.secondarySetWeight,
      );
    }
  }

  if (totalSets === 0) return null;

  // Calories: (MET − 1) × kg × hours. Subtracting the resting 1 MET keeps
  // this to what the workout added, which is also what a watch's "active
  // energy" reports and what a deficit is actually built from.
  const met = MET_MIN + (MET_MAX - MET_MIN) * (compoundSets / totalSets);
  const hours = seconds / 3600;
  const caloriesBurned = Math.round((met - 1) * weightKg * hours);

  // Recovery: heavy work is more taxing per set, light high-rep work less.
  const avgWeightedReps = weightedSets > 0 ? weightedReps / weightedSets : null;
  const intensityFactor =
    avgWeightedReps === null
      ? 1
      : avgWeightedReps <= RECOVERY.heavyAvgReps
        ? RECOVERY.heavyFactor
        : avgWeightedReps >= RECOVERY.lightAvgReps
          ? RECOVERY.lightFactor
          : 1;

  const muscles: MuscleRecovery[] = [];
  effectiveSetsByMuscle.forEach((effectiveSets, muscle) => {
    if (effectiveSets < RECOVERY.minEffectiveSets) return;
    const hoursNeeded = recoveryHoursFor(muscle, effectiveSets) * intensityFactor;
    muscles.push({
      muscle,
      hours: Math.round(Math.min(RECOVERY.maxHours, Math.max(RECOVERY.minHours, hoursNeeded))),
    });
  });
  muscles.sort((a, b) => b.hours - a.hours);

  return {
    version: STATS_VERSION,
    volumeKg: Math.round(volume),
    totalSets,
    totalReps,
    estimatedMinutes: Math.max(1, Math.round(seconds / 60)),
    caloriesBurned,
    fatLossGrams: Math.round((caloriesBurned / KCAL_PER_GRAM_FAT) * 10) / 10,
    recoveryHours: muscles.length > 0 ? muscles[0].hours : RECOVERY.unknownHours,
    recoveryMuscles: muscles.slice(0, 3),
    weightKgUsed: weightKg,
  };
}

function toNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Reads a stored `stats` field back, or undefined when it is absent or
 * not shaped like one — a log written before this feature existed simply
 * has none, and must read as "no stats" rather than as zeroes.
 */
export function toWorkoutStats(raw: unknown): WorkoutStats | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const data = raw as Record<string, unknown>;
  if (typeof data.caloriesBurned !== 'number') return undefined;

  return {
    version: toNumber(data.version) || STATS_VERSION,
    volumeKg: toNumber(data.volumeKg),
    totalSets: toNumber(data.totalSets),
    totalReps: toNumber(data.totalReps),
    estimatedMinutes: toNumber(data.estimatedMinutes),
    caloriesBurned: toNumber(data.caloriesBurned),
    fatLossGrams: toNumber(data.fatLossGrams),
    recoveryHours: toNumber(data.recoveryHours),
    recoveryMuscles: (Array.isArray(data.recoveryMuscles) ? data.recoveryMuscles : [])
      .map((entry) => (entry ?? {}) as Record<string, unknown>)
      .map((entry) => ({ muscle: String(entry.muscle ?? ''), hours: toNumber(entry.hours) }))
      .filter((entry) => entry.muscle !== ''),
    weightKgUsed: toNumber(data.weightKgUsed) || DEFAULT_WEIGHT_KG,
  };
}

/** 48 → "2 days", 36 → "1.5 days", 20 → "20 h". */
export function formatRecovery(hours: number): string {
  if (hours < 24) return `${Math.round(hours)} h`;
  const days = Math.round((hours / 24) * 2) / 2;
  return `${days} ${days === 1 ? 'day' : 'days'}`;
}
