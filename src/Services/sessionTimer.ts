// Pure helpers for the dashboard's start/end session timer. The timer is
// a start TIMESTAMP, never a counter: elapsed time is always "now minus
// startedAt", so it stays correct while the app is backgrounded, on
// another tab, or even closed and reopened.

export type SessionKind = 'workout' | 'meal';

export interface ActiveSession {
  kind: SessionKind;
  /** The workout/meal plan document id the timer belongs to. */
  planId: string;
  title: string;
  /** "YYYY-MM-DD" the session started on — where its time is logged. */
  dateKey: string;
  /** Epoch milliseconds. */
  startedAt: number;
}

/** Whole seconds since `startedAt`; never negative (clock changes). */
export function elapsedSeconds(startedAt: number, now: number): number {
  return Math.max(0, Math.floor((now - startedAt) / 1000));
}

/** "4:07" under an hour, "1:02:09" from an hour up. */
export function formatElapsed(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  const ss = String(seconds).padStart(2, '0');
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${ss}`;
  return `${minutes}:${ss}`;
}

export function encodeSession(session: ActiveSession): string {
  return JSON.stringify(session);
}

/** Null for anything that is not a well-formed session. Never throws. */
export function decodeSession(raw: string | null | undefined): ActiveSession | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      (parsed.kind === 'workout' || parsed.kind === 'meal') &&
      typeof parsed.planId === 'string' &&
      parsed.planId.length > 0 &&
      typeof parsed.title === 'string' &&
      typeof parsed.dateKey === 'string' &&
      typeof parsed.startedAt === 'number' &&
      Number.isFinite(parsed.startedAt)
    ) {
      return {
        kind: parsed.kind,
        planId: parsed.planId,
        title: parsed.title,
        dateKey: parsed.dateKey,
        startedAt: parsed.startedAt,
      };
    }
    return null;
  } catch {
    return null;
  }
}
