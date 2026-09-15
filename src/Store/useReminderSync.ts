// Keeps the device's scheduled reminders in step with the user's plans.
//
// Both plan lists already arrive live from Firestore via Redux, so this
// only has to react to them: whenever a plan is created, edited, paused
// or deleted, the whole reminder set is rebuilt from what the store now
// holds.
import { useEffect, useRef } from 'react';
import {
  configureAndroidChannel,
  ensureNotificationPermission,
  mealReminder,
  syncReminders,
  workoutReminder,
  type ReminderTarget,
} from '../Services/reminderService';
import { useMealPlans } from './mealPlansSlice';
import { useWorkoutPlans } from './workoutPlansSlice';

/**
 * Call once near the root. `enabled` should be the signed-in flag —
 * there is nothing to remind about before the plans have loaded, and
 * scheduling against an empty list would cancel everything already on
 * the device.
 */
export function useReminderSync(enabled: boolean) {
  const workoutPlans = useWorkoutPlans();
  const mealPlans = useMealPlans();

  // Permission is asked for once per app run, not on every plan change.
  const permission = useRef<boolean | null>(null);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;

    const run = async () => {
      if (permission.current === null) {
        await configureAndroidChannel();
        permission.current = await ensureNotificationPermission();
      }
      if (cancelled || !permission.current) return;

      const targets: ReminderTarget[] = [
        ...workoutPlans.map(workoutReminder),
        ...mealPlans.map(mealReminder),
        // Drafts, paused plans and ones with no time yield null.
      ].filter((target): target is ReminderTarget => target !== null);

      await syncReminders(targets);
    };

    run().catch(() => {
      // Reminders are an extra, not a feature the app depends on — a
      // failure here must never take a screen down with it.
    });

    return () => {
      cancelled = true;
    };
  }, [enabled, workoutPlans, mealPlans]);
}
