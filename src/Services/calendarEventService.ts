// Normalizes every underlying source of "things on the calendar" into one
// CalendarEvent shape, and picks out only the ones that apply to a given
// date. Right now the only source is workout plans (recurring by weekday),
// but this is the seam to plug in more event types later (meals, hydration
// reminders, gym check-ins, ...) without Schedule.tsx having to change how
// it asks for "everything scheduled on this date".
import { useMemo } from 'react';
import type { DayKey } from '../Screens/Workout/Types';
import type { WorkoutPlan } from './workoutPlanService';
import { getCurrentUserId } from './userService';
import { useWorkoutPlans } from '../Store/workoutPlansSlice';

export type CalendarEventType = 'workout';

export interface CalendarEvent {
  id: string;
  userId: string;
  type: CalendarEventType;
  title: string;
  /** e.g. "6:30 PM" — a single start time, no end/duration is tracked yet. */
  time: string;
  muscles: string[];
  exerciseIds: string[];
  /** id of the underlying record this event was derived from. */
  sourceId: string;
}

const WEEKDAY_BY_INDEX: DayKey[] = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function workoutPlanToEvent(plan: WorkoutPlan): CalendarEvent {
  return {
    id: `workout-${plan.id}`,
    userId: plan.userId,
    type: 'workout',
    title: plan.name,
    time: plan.time,
    muscles: plan.muscles,
    exerciseIds: plan.exerciseIds,
    sourceId: plan.id,
  };
}

/**
 * Every event for `date`, for the current user, across all event sources.
 * Today that's just live workout plans whose recurring `days` include
 * `date`'s weekday — a plan for Mon/Wed/Fri only produces an event when
 * `date` actually falls on one of those days.
 *
 * `plans` is passed in (rather than fetched here) because it's already
 * kept live in the Redux store by App.tsx's single useWorkoutPlansSync()
 * listener — no extra network round-trip needed on top of that.
 */
export function getEventsForDate(date: Date, plans: WorkoutPlan[]): CalendarEvent[] {
  const weekday = WEEKDAY_BY_INDEX[date.getDay()];
  const userId = getCurrentUserId();
  return plans
    .filter(
      (plan) =>
        plan.userId === userId &&
        plan.status === 'live' &&
        plan.days.includes(weekday) &&
        plan.time,
    )
    .map(workoutPlanToEvent);
}

/**
 * All of the current user's events for `date`. Reads plans from the
 * already-live Redux store, so this is ready as soon as the screen mounts
 * — no fetch/loading state needed here on top of the app-wide plan sync.
 */
export function useEventsForDate(date: Date): CalendarEvent[] {
  const plans = useWorkoutPlans();
  return useMemo(() => getEventsForDate(date, plans), [date, plans]);
}
