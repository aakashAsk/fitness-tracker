// Normalizes every underlying source of "things on the calendar" into one
// CalendarEvent shape, and picks out only the ones that apply to a given
// date. Right now the only source is workout plans (recurring by weekday),
// but this is the seam to plug in more event types later (meals, hydration
// reminders, gym check-ins, ...) without Schedule.tsx having to change how
// it asks for "everything scheduled on this date".
import { useMemo } from 'react';
import type { DayKey } from '../Screens/Workout/Types';
import type { WorkoutPlan } from './workoutPlanService';
import type { WorkoutLog } from './workoutLogService';
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
  /**
   * True when this date has its own materialized occurrence overriding
   * the plan's exercise list — i.e. the user edited this day alone. The
   * exercises above then come from that row, not from the plan.
   */
  isOverridden: boolean;
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
    isOverridden: false,
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
 * Layers one date's materialized occurrences over the events the
 * recurring rules produced for that date.
 *
 * Two distinct jobs, and the second is the one that is easy to miss:
 *
 *  1. OVERRIDE — a plan that is scheduled on this date AND has a row
 *     for it takes its exercise list from the row. This is what stops a
 *     one-day edit leaking into every other occurrence of the plan.
 *
 *  2. UNION — a row whose plan no longer produces an event on this date
 *     is still rendered. `getEventsForDate` only asks the *current*
 *     rule, so a plan later rescheduled (Mon → Tue), paused, moved to
 *     draft, or deleted outright would make an already-edited or
 *     already-logged day silently vanish along with its history. Those
 *     rows are re-attached here instead.
 *
 * Rows unioned back in are matched against the plan list where possible
 * so a still-existing plan keeps its `muscles` and `time`; for a plan
 * that has been deleted, the row's own `planName` is all that remains
 * and the event degrades to that.
 */
export function applyOccurrencesToEvents(
  events: CalendarEvent[],
  occurrences: WorkoutLog[],
  plans: WorkoutPlan[],
): CalendarEvent[] {
  if (occurrences.length === 0) return events;

  const byPlanId = new Map(occurrences.map((occurrence) => [occurrence.planId, occurrence]));
  const userId = getCurrentUserId();

  const overridden = events.map((event) => {
    const occurrence = byPlanId.get(event.sourceId);
    if (!occurrence) return event;
    return {
      ...event,
      // The row's own name always wins, because it is the name this
      // particular session has: either one the user typed when editing
      // this single date, or the one the plan carried when the session
      // was logged. Either way renaming the plan afterwards must not
      // retitle it — that is the whole point of a per-date row.
      title: occurrence.planName || event.title,
      exerciseIds: occurrence.exercises.map((entry) => entry.exerciseId),
      isOverridden: true,
    };
  });

  const rendered = new Set(events.map((event) => event.sourceId));
  const orphaned = occurrences
    .filter((occurrence) => !rendered.has(occurrence.planId) && occurrence.userId === userId)
    .map((occurrence) => {
      const plan = plans.find((candidate) => candidate.id === occurrence.planId);
      return {
        id: `workout-${occurrence.planId}`,
        userId: occurrence.userId,
        type: 'workout' as const,
        title: plan?.name ?? occurrence.planName,
        time: plan?.time ?? '',
        muscles: plan?.muscles ?? [],
        exerciseIds: occurrence.exercises.map((entry) => entry.exerciseId),
        sourceId: occurrence.planId,
        isOverridden: true,
      };
    });

  return [...overridden, ...orphaned];
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
