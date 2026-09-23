// Small date-key math shared by the progress utilities (week-over-week
// comparison, adherence, streaks). Pure — no Firestore, no React.
//
// Dates are "YYYY-MM-DD" strings throughout, the same key every log
// collection uses (see toDateKey in workoutLogService) — comparable with
// plain string operators since the format sorts lexicographically in
// calendar order.
//
// toDateKey is duplicated from workoutLogService rather than imported:
// workoutLogService pulls in the Firebase SDK, and this module (plus
// everything that depends on it — streakService, the week/adherence
// utilities) needs to stay Firestore-free to run under `node --test`
// without a Firebase app initialized. Keep the two in sync if the format
// ever changes — neither is likely to, since it is just zero-padded
// Y-M-D.

/** Formats a Date as "YYYY-MM-DD" in local time (not UTC — avoids an
 * off-by-one-day date near midnight in timezones behind UTC). Mirrors
 * workoutLogService's toDateKey — see the note above. */
export function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

/** Monday=0 … Sunday=6, unlike Date#getDay (Sunday=0). The app's week
 * strips and plan schedules are Mon-first (see DAY_ORDER), so weekly
 * comparisons use the same week boundary. */
function mondayIndex(date: Date): number {
  return (date.getDay() + 6) % 7;
}

export interface DateWindow {
  /** Inclusive, "YYYY-MM-DD". */
  startKey: string;
  /** Inclusive, "YYYY-MM-DD". */
  endKey: string;
}

/**
 * The Monday-to-Sunday week containing `reference`, offset by whole
 * weeks. `weekWindow(today, 0)` is the current week to date (Monday
 * through today, not through the coming Sunday — a week that has not
 * happened yet has nothing to compare); `weekWindow(today, -1)` is the
 * seven days of last week.
 */
export function weekWindow(reference: Date, weeksAgo: number): DateWindow {
  const monday = addDays(reference, -mondayIndex(reference) + weeksAgo * 7);
  const endOfWindow = weeksAgo === 0 ? reference : addDays(monday, 6);
  return { startKey: toDateKey(monday), endKey: toDateKey(endOfWindow) };
}

/** The `count` calendar days up to and including `reference`, oldest
 * first — e.g. lastNDays(today, 7) for a rolling week. */
export function lastNDays(reference: Date, count: number): string[] {
  return Array.from({ length: count }, (_, index) =>
    toDateKey(addDays(reference, -(count - 1 - index))),
  );
}

/** Every date key from `startKey` to `endKey` inclusive, oldest first. */
export function daysBetween(startKey: string, endKey: string): string[] {
  const start = new Date(`${startKey}T00:00:00`);
  const end = new Date(`${endKey}T00:00:00`);
  const days: string[] = [];
  for (let cursor = start; cursor <= end; cursor = addDays(cursor, 1)) {
    days.push(toDateKey(cursor));
  }
  return days;
}

/** Whole days between two date keys — positive when `endKey` is later. */
export function daySpan(startKey: string, endKey: string): number {
  const start = new Date(`${startKey}T00:00:00`).getTime();
  const end = new Date(`${endKey}T00:00:00`).getTime();
  return Math.round((end - start) / 86_400_000);
}
