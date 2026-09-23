// "Did the user do what the plan asked" — calorie/protein adherence and
// plan adherence, each as a simple % of days or sessions hit.
//
// Pure. The caller assembles the per-day figures (from
// fetchMealLogsForRange + the profile's targets) and the planned/
// completed counts (from calendarEventService's occurrence generation +
// fetchWorkoutLogsForUser) — this file only turns them into a percentage
// and a hit/miss count.

export interface AdherenceResult {
  hitDays: number;
  totalDays: number;
  /** null when there were no days to judge — "no data" is not 0%. */
  percent: number | null;
}

export interface DayNutrition {
  /** "YYYY-MM-DD" */
  date: string;
  /** null for a day nothing was logged — counted as a miss: not logging
   * is not hitting the target, and silently excluding it would inflate
   * the percentage for someone who simply stopped tracking. */
  consumedCalories: number | null;
}

export interface DayProtein {
  date: string;
  consumedProtein: number | null;
}

/**
 * A day "hits" its calorie target when consumption falls within
 * `tolerancePercent` of it either way — a diet target is a band to eat
 * within, not a single number to land on exactly.
 */
export function computeCalorieAdherence(
  days: DayNutrition[],
  targetCalories: number,
  tolerancePercent = 10,
): AdherenceResult {
  if (days.length === 0 || targetCalories <= 0) {
    return { hitDays: 0, totalDays: days.length, percent: null };
  }

  const tolerance = targetCalories * (tolerancePercent / 100);
  const hitDays = days.filter(
    (day) => day.consumedCalories !== null && Math.abs(day.consumedCalories - targetCalories) <= tolerance,
  ).length;

  return { hitDays, totalDays: days.length, percent: Math.round((hitDays / days.length) * 100) };
}

/**
 * A day "hits" its protein target at or above `minPercentOfTarget` of
 * it — protein is a floor to clear, not a band, so eating MORE than the
 * target is never a miss the way overeating calories is.
 */
export function computeProteinAdherence(
  days: DayProtein[],
  targetProtein: number,
  minPercentOfTarget = 90,
): AdherenceResult {
  if (days.length === 0 || targetProtein <= 0) {
    return { hitDays: 0, totalDays: days.length, percent: null };
  }

  const threshold = targetProtein * (minPercentOfTarget / 100);
  const hitDays = days.filter(
    (day) => day.consumedProtein !== null && day.consumedProtein >= threshold,
  ).length;

  return { hitDays, totalDays: days.length, percent: Math.round((hitDays / days.length) * 100) };
}

/** Planned-vs-logged, for either workouts or meals — same shape, so one
 * function serves both cards. */
export function computePlanAdherence(plannedCount: number, completedCount: number): AdherenceResult {
  if (plannedCount === 0) return { hitDays: 0, totalDays: 0, percent: null };
  // A day can be logged even when it wasn't strictly "planned" (a one-off
  // extra session) — clamped so that can't push adherence past 100%.
  const hitDays = Math.min(completedCount, plannedCount);
  return { hitDays, totalDays: plannedCount, percent: Math.round((hitDays / plannedCount) * 100) };
}
