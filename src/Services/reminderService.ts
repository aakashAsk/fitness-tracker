// Local reminders, fired shortly before each scheduled workout or meal.
//
// These are LOCAL notifications, not push: everything is scheduled on
// the device from plans the app already holds. Nothing is sent from a
// server, so no token, no backend, and they keep working offline.
//
// Each plan is a weekly rule, so every (plan, weekday) pair becomes one
// repeating weekly notification. The OS then fires it every week until
// it is cancelled — the app does not need to be open, or even to have
// been opened that day.
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import type { DayKey } from '../Screens/Workout/Types';
import { parseTimeToMinutes, type WorkoutPlan } from './workoutPlanService';
import { MEAL_TYPE_LABEL, type MealPlan } from './mealPlanService';

/** How far ahead of the session the reminder fires. */
export const REMINDER_LEAD_MINUTES = 15;
export const REMINDER_LEAD_MINUTES_EARLY = 1;

/**
 * expo-notifications counts weekdays 1–7 starting on SUNDAY, while
 * DAY_ORDER starts on Monday for display. Mapping through this table
 * rather than indexing DAY_ORDER keeps the two from silently differing
 * by one.
 */
const TRIGGER_WEEKDAY: Record<DayKey, number> = {
  Sun: 1,
  Mon: 2,
  Tue: 3,
  Wed: 4,
  Thu: 5,
  Fri: 6,
  Sat: 7,
};

const MINUTES_PER_DAY = 24 * 60;

export interface ReminderTarget {
  /** Stable id for the plan this belongs to. */
  planId: string;
  title: string;
  body: string;
  days: DayKey[];
  /** e.g. "6:30 PM" */
  time: string;
  /** How many minutes before the session this fires. */
  leadMinutes: number;
}

/**
 * Asks for permission, returning whether reminders can be scheduled.
 *
 * Safe to call repeatedly: it only prompts when the user has not
 * already answered, so it can sit in an effect without nagging.
 */
export async function ensureNotificationPermission(): Promise<boolean> {
  const existing = await Notifications.getPermissionsAsync();
  if (existing.granted) return true;
  // canAskAgain is false once the user has denied it for good — asking
  // again would be a no-op that still costs a round trip.
  if (!existing.canAskAgain) return false;

  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
}

/**
 * Android shows nothing at all unless the notification has a channel,
 * and the channel's importance is what decides whether it appears as a
 * heads-up banner rather than only in the tray.
 */
export async function configureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('session-reminders', {
    name: 'Session reminders',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
  });
}

/**
 * Shifts a time back by the lead, wrapping to the previous day when it
 * crosses midnight — a 00:05 session reminds at 23:50 the evening
 * before, not at -00:10 on the same day.
 */
function applyLead(
  day: DayKey,
  timeMinutes: number,
  leadMinutes: number = REMINDER_LEAD_MINUTES,
): { weekday: number; hour: number; minute: number } {
  const shifted = timeMinutes - leadMinutes;
  const wrapped = (shifted + MINUTES_PER_DAY) % MINUTES_PER_DAY;

  // Wrapped past midnight? The reminder belongs to the previous weekday.
  const dayOffset = shifted < 0 ? -1 : 0;
  const weekday = ((TRIGGER_WEEKDAY[day] - 1 + dayOffset + 7) % 7) + 1;

  return {
    weekday,
    hour: Math.floor(wrapped / 60),
    minute: wrapped % 60,
  };
}

/** Turns a workout plan into its reminder, or null if it can't have one. */
export function workoutReminder(plan: WorkoutPlan): ReminderTarget[] {
  if (plan.status !== 'live' || plan.days.length === 0 || !plan.time) return [];
  const baseTarget = {
    planId: plan.id,
    body:
      plan.muscles.length > 0
        ? `Targeting ${plan.muscles.slice(0, 3).join(', ')} · ${plan.time}`
        : `${plan.exerciseIds.length} exercises · ${plan.time}`,
    days: plan.days,
    time: plan.time,
  };
  return [
    {
      ...baseTarget,
      title: `${plan.name} in ${REMINDER_LEAD_MINUTES} min`,
      leadMinutes: REMINDER_LEAD_MINUTES,
    },
    {
      ...baseTarget,
      title: `${plan.name} in ${REMINDER_LEAD_MINUTES_EARLY} min`,
      leadMinutes: REMINDER_LEAD_MINUTES_EARLY,
    },
  ];
}

/** Turns a meal plan into its reminder, or null if it can't have one. */
export function mealReminder(plan: MealPlan): ReminderTarget[] {
  if (plan.status !== 'live' || plan.days.length === 0 || !plan.time) return [];
  const items = plan.items
    .map((item) => item.name.trim())
    .filter(Boolean)
    .slice(0, 3);
  const baseTarget = {
    planId: plan.id,
    body:
      items.length > 0
        ? `${MEAL_TYPE_LABEL[plan.mealType]} · ${items.join(', ')}`
        : `${MEAL_TYPE_LABEL[plan.mealType]} · ${plan.time}`,
    days: plan.days,
    time: plan.time,
  };
  return [
    {
      ...baseTarget,
      title: `${plan.name} in ${REMINDER_LEAD_MINUTES} min`,
      leadMinutes: REMINDER_LEAD_MINUTES,
    },
    {
      ...baseTarget,
      title: `${plan.name} in ${REMINDER_LEAD_MINUTES_EARLY} min`,
      leadMinutes: REMINDER_LEAD_MINUTES_EARLY,
    },
  ];
}

/**
 * One id per (plan, weekday, lead). The lead is part of it because each
 * plan deliberately has two reminders per day — 15 min and 1 min out —
 * and those must stay distinct rather than replace each other.
 */
function reminderIdentifier(target: ReminderTarget, day: DayKey): string {
  return `reminder:${target.planId}:${day}:${target.leadMinutes}`;
}

/**
 * Replaces every reminder this app has scheduled with one derived from
 * the plans passed in.
 *
 * Cancel-all-then-reschedule rather than diffing: a plan's days, time,
 * name and status can all change, and its notifications are keyed by
 * (plan, weekday), so working out which individual entries to add,
 * update or drop is more error-prone than rebuilding a list that is
 * only ever a few dozen entries long.
 *
 * Returns how many were scheduled, which is useful to assert against in
 * a console check.
 *
 * Calls are serialised, and a call that has been superseded by a newer
 * one stops early. This is what prevents duplicate notifications: the
 * workout and meal plan lists arrive from two separate Firestore
 * listeners, so on launch this is called twice within milliseconds. Run
 * concurrently, both would cancel-all up front and then both schedule
 * their full set — every reminder on the device twice, firing as a
 * pair at the same moment.
 */
export function syncReminders(targets: ReminderTarget[]): Promise<number> {
  const generation = ++latestGeneration;
  const run = syncQueue.then(() => runSync(targets, generation));
  // The queue must survive a failed run, or one error would wedge every
  // later sync behind a rejected promise.
  syncQueue = run.catch(() => undefined);
  return run;
}

/** Tail of the serial queue — each sync starts only once this settles. */
let syncQueue: Promise<unknown> = Promise.resolve();
/** Bumped by every call; a run whose number is stale has been superseded. */
let latestGeneration = 0;

async function runSync(targets: ReminderTarget[], generation: number): Promise<number> {
  // A newer call is already queued behind this one and will rebuild the
  // whole set from fresher plans — doing the work twice would only
  // widen the window for the OS to fire something stale.
  if (generation !== latestGeneration) return 0;

  await Notifications.cancelAllScheduledNotificationsAsync();

  let scheduled = 0;
  for (const target of targets) {
    const timeMinutes = parseTimeToMinutes(target.time);

    for (const day of target.days) {
      // Superseded mid-way: stop. What is scheduled so far is harmless —
      // the newer run starts with its own cancel-all.
      if (generation !== latestGeneration) return scheduled;

      const { weekday, hour, minute } = applyLead(day, timeMinutes, target.leadMinutes);

      await Notifications.scheduleNotificationAsync({
        // Deterministic, so the same reminder always maps to the same
        // entry. A second schedule of it replaces the first rather than
        // stacking beside it — a backstop in case anything else ever
        // manages to schedule the set twice.
        identifier: reminderIdentifier(target, day),
        content: {
          title: target.title,
          body: target.body,
          sound: true,
          // Lets a tap be routed to the right plan later, and makes the
          // scheduled list readable when debugging.
          data: { planId: target.planId, day },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
          weekday,
          hour,
          minute,
          channelId: 'session-reminders',
        },
      });
      scheduled += 1;
    }
  }

  return scheduled;
}

/** Everything currently scheduled — for checking behaviour by hand. */
export function listScheduledReminders() {
  return Notifications.getAllScheduledNotificationsAsync();
}

export async function cancelAllReminders(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
}
