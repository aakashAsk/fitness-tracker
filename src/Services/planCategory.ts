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
