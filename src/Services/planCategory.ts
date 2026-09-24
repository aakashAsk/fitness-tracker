// Plan categories and the distance/time targets that some of them use.
// Pure, so the create sheet, the plan service and validation all agree.

export const PLAN_CATEGORIES = [
  { key: 'workout', label: 'Workout' },
  { key: 'cross-fit', label: 'Cross-Fit' },
  { key: 'cardio', label: 'Cardio' },
  { key: 'cycling', label: 'Cycling' },
  { key: 'walking', label: 'Walking' },
  { key: 'swimming', label: 'Swimming' },
  { key: 'rest', label: 'Rest Day' },
] as const;

export type PlanCategory = (typeof PLAN_CATEGORIES)[number]['key'];

/** Planned by a distance and/or time target instead of a list of exercises. */
const DISTANCE_AND_TIME: ReadonlySet<PlanCategory> = new Set(['cardio', 'cycling', 'walking']);
/** Planned by time alone — how long to spend in the pool. */
const TIME_ONLY: ReadonlySet<PlanCategory> = new Set(['swimming']);

/** True for every category that replaces the exercise picker with targets. */
export function isTargetCategory(category: PlanCategory | undefined): boolean {
  return category !== undefined && (DISTANCE_AND_TIME.has(category) || TIME_ONLY.has(category));
}

/** A rest / recovery day: just the days it falls on — no time, exercises or targets. */
export function isRestCategory(category: PlanCategory | undefined): boolean {
  return category === 'rest';
}

/** True when the category also has a distance target (swimming does not). */
export function usesDistanceTarget(category: PlanCategory | undefined): boolean {
  return category !== undefined && DISTANCE_AND_TIME.has(category);
}

/** Whether a stored string is one of the known categories. */
export function toPlanCategory(value: unknown): PlanCategory | undefined {
  return PLAN_CATEGORIES.some(entry => entry.key === value) ? (value as PlanCategory) : undefined;
}

export const MAX_TARGET_KM = 500;
export const MAX_TARGET_MINUTES = 24 * 60;

/**
 * A typed target as a positive number, or undefined for empty, zero,
 * negative, non-numeric or absurdly large input. Accepts "5,5" as 5.5.
 */
export function parseTarget(text: string, max: number): number | undefined {
  const value = Number.parseFloat(text.trim().replace(',', '.'));
  if (!Number.isFinite(value) || value <= 0 || value > max) return undefined;
  return Math.round(value * 100) / 100;
}

interface PlanSummaryInput {
  category?: PlanCategory;
  exerciseIds: readonly string[];
  targetKm?: number | null;
  targetMinutes?: number | null;
}

/** One line for a plan list: what the plan asks of the user. */
export function describePlanSummary(plan: PlanSummaryInput): string {
  if (isRestCategory(plan.category)) return 'Rest day';
  if (plan.category === 'swimming') {
    return plan.targetMinutes ? `${plan.targetMinutes} min in the pool` : 'No target set';
  }
  if (isTargetCategory(plan.category)) {
    const parts: string[] = [];
    if (plan.targetKm) parts.push(`${plan.targetKm} km`);
    if (plan.targetMinutes) parts.push(`${plan.targetMinutes} min`);
    return parts.length > 0 ? parts.join(' · ') : 'No target set';
  }
  const count = plan.exerciseIds.length;
  return `${count} ${count === 1 ? 'exercise' : 'exercises'}`;
}

/** Minutes assumed per exercise — sets, reps and rest combined — and a
 * fixed warm-up/transition allowance on top. Matches the AI plan
 * generator's own assumption (see aiWorkoutPlanShape's maxExercisesFor:
 * "about 8 minutes each once warm-up, rest and transitions are
 * counted"), so the two estimates agree instead of disagreeing about the
 * same workout. */
const MINUTES_PER_EXERCISE = 8;
const WARMUP_MINUTES = 5;
/** An easy, conversational pace — the fallback when a distance target
 * has no explicit time alongside it. */
const ASSUMED_MINUTES_PER_KM = 6;

/**
 * A rough session length in minutes, for the create sheet's live preview
 * and the plan library's summary — a plausible starting point to see
 * before a single session of this plan has actually been logged, not a
 * promise.
 *
 * Deliberately a fixed formula rather than an AI estimate: the inputs
 * (how many exercises, or a stated distance/time target) are already
 * exactly what a session's length depends on, so a model would have
 * nothing to add beyond what arithmetic already gives — instantly, for
 * free, and the same way every time it's asked.
 */
export function estimateWorkoutMinutes(plan: PlanSummaryInput): number {
  if (isRestCategory(plan.category)) return 0;
  if (plan.targetMinutes) return plan.targetMinutes;
  if (usesDistanceTarget(plan.category) && plan.targetKm) {
    return Math.round(plan.targetKm * ASSUMED_MINUTES_PER_KM);
  }
  // A target category with neither a time nor a distance typed yet has
  // nothing to estimate from.
  if (isTargetCategory(plan.category)) return 0;
  return plan.exerciseIds.length > 0
    ? WARMUP_MINUTES + plan.exerciseIds.length * MINUTES_PER_EXERCISE
    : 0;
}

/**
 * What is missing from a target-category plan, or null when it has what
 * it needs: swimming needs a time; the others need a distance or a time.
 * Distance is ignored for swimming even if one was typed.
 */
export function describeMissingTarget(
  category: PlanCategory | undefined,
  km: number | undefined,
  minutes: number | undefined,
): string | null {
  if (category === 'swimming') {
    return minutes === undefined ? 'Enter how much time you want to spend in the pool.' : null;
  }
  return km === undefined && minutes === undefined
    ? 'Enter a target distance or a target time.'
    : null;
}
