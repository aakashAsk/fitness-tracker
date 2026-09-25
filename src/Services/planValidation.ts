// Rules a workout plan has to satisfy before it can be saved or made
// live. Kept out of the screens so the create sheet, the edit sheet and
// the plan library all enforce exactly the same thing — a plan promoted
// from draft has to clear the same bar as one created live.
import type { DayKey } from '../Screens/Workout/Types';
import { describeMissingTarget, isRestCategory, isTargetCategory } from './planCategory';
import { parseTimeToMinutes, type WorkoutPlan } from './workoutPlanService';

/** Per-user cap on saved plans, drafts and paused ones included. */
export const MAX_PLANS_PER_USER = 20;

/** The minimum a plan needs before it can go live. Mirrors the create
 * sheet's own validation, so promoting a draft can't sneak past it. */
export const MIN_EXERCISES = 3;

export interface PlanSchedule {
  days: DayKey[];
  /** e.g. "6:30 PM" */
  time: string;
}

export interface ScheduleConflict {
  /** The already-scheduled plan occupying that slot. */
  plan: WorkoutPlan;
  /** The weekday they collide on. */
  day: DayKey;
}

/**
 * Finds an existing live plan that already occupies one of `candidate`'s
 * weekday + time slots.
 *
 * Overlap is exact-time on a shared weekday, because a plan stores a
 * single start time and no duration — there is nothing in the data model
 * to compute a real interval from. Times are compared as minutes since
 * midnight rather than as strings, so "6:30 PM" and "06:30 PM" collide
 * as they should.
 *
 * Only live plans are considered: a draft or paused plan isn't on the
 * calendar, so it cannot clash with anything. That is also why promoting
 * one to live has to re-run this check.
 */
export function findScheduleConflict(
  plans: WorkoutPlan[],
  candidate: PlanSchedule,
  options: { excludePlanId?: string } = {},
): ScheduleConflict | null {
  if (!candidate.time || candidate.days.length === 0) return null;

  const candidateMinutes = parseTimeToMinutes(candidate.time);
  const candidateDays = new Set(candidate.days);

  for (const plan of plans) {
    if (plan.id === options.excludePlanId) continue;
    if (plan.status !== 'live') continue;
    if (!plan.time) continue;
    if (parseTimeToMinutes(plan.time) !== candidateMinutes) continue;

    const clash = plan.days.find((day) => candidateDays.has(day));
    if (clash) return { plan, day: clash };
  }

  return null;
}

/** Sentence for the conflict alert, naming what is already in the slot. */
export function describeConflict(conflict: ScheduleConflict): string {
  return `"${conflict.plan.name}" is already scheduled on ${conflict.day} at ${conflict.plan.time}. Pick a different time so the two don't overlap.`;
}

/**
 * Why this plan can't go live yet, or null when it can. Used when
 * promoting an existing plan, where the values were never run past the
 * create sheet's validation — a draft is allowed to be incomplete right
 * up until the moment someone tries to activate it.
 */
export function describeIncompletePlan(plan: WorkoutPlan): string | null {
  if (!plan.name.trim()) return 'Give the plan a name first.';
  if (isRestCategory(plan.category)) {
    // A rest day is just the days it falls on: no exercises, targets or time.
    if (plan.days.length === 0) return 'Choose at least one rest day first.';
    return null;
  }
  if (isTargetCategory(plan.category)) {
    // These plans are planned by a distance/time target, not exercises.
    const missing = describeMissingTarget(
      plan.category,
      plan.targetKm ?? undefined,
      plan.targetMinutes ?? undefined,
    );
    if (missing) return missing;
  } else if (plan.exerciseIds.length < MIN_EXERCISES) {
    return `Add at least ${MIN_EXERCISES} exercises before making this plan live.`;
  }
  if (plan.days.length === 0) return 'Choose at least one training day first.';
  if (!plan.time) return 'Set a session time first.';
  return null;
}
