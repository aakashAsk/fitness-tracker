// Firestore-backed water intake, one document per (user, date).
//
// Same deterministic-id pattern as workoutLogs and mealLogs, minus the
// plan segment: hydration is not scheduled, so the id is just
// `${userId}_${date}` and writing the same day again overwrites rather
// than accumulating.
//
// Shape: `userId` and `date` sit on the document, and each drink is an
// entry inside `entries`. Storing the individual drinks rather than a
// running total keeps *when* the user drank, which a single number
// throws away — and it is what lets a mistaken entry be removed without
// guessing how big it was.
import { doc, getDoc, serverTimestamp, setDoc, Timestamp } from 'firebase/firestore';
import { db } from '../Firebase/firebaseConfig';
import { getCurrentUserId } from './userService';

const HYDRATION_COLLECTION = 'hydrationLogs';

/** One glass, in millilitres. */
export const ML_PER_GLASS = 250;

/** The daily target, in glasses — 2 litres. */
export const DAILY_GLASS_GOAL = 8;

/** The daily target, in millilitres. */
export const DAILY_ML_GOAL = DAILY_GLASS_GOAL * ML_PER_GLASS;

/** A single drink. */
export interface HydrationEntry {
  /** Millilitres. */
  ml: number;
  /** e.g. "8:30 AM" — when it was drunk, local to the device. */
  time: string;
}

export interface HydrationLog {
  id: string;
  userId: string;
  /** "YYYY-MM-DD", local to the device. */
  date: string;
  /** Oldest first. */
  entries: HydrationEntry[];
  updatedAt: Date | null;
}

export class HydrationLogServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HydrationLogServiceError';
  }
}

export function hydrationDocId(userId: string, date: string): string {
  return `${userId}_${date}`;
}

/** "8:30 AM" — the same clock format meal and workout plans use. */
export function formatEntryTime(date: Date): string {
  const hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const period = hours >= 12 ? 'PM' : 'AM';
  return `${hours % 12 || 12}:${minutes} ${period}`;
}

function toHydrationEntry(raw: unknown): HydrationEntry {
  const entry = (raw ?? {}) as Record<string, unknown>;
  return {
    ml: Math.max(Number(entry.ml) || 0, 0),
    time: (entry.time as string) ?? '',
  };
}

function toHydrationLog(id: string, data: Record<string, unknown>): HydrationLog {
  return {
    id,
    userId: (data.userId as string) ?? '',
    date: (data.date as string) ?? '',
    entries: ((data.entries as unknown[]) ?? [])
      .map(toHydrationEntry)
      // A zero-ml entry records nothing and would show as a blank row.
      .filter((entry) => entry.ml > 0),
    updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt.toDate() : null,
  };
}

/** Total millilitres across a day's entries. */
export function totalMl(entries: HydrationEntry[]): number {
  return entries.reduce((sum, entry) => sum + entry.ml, 0);
}

/** How many whole glasses a day's entries add up to, capped at the goal
 * so the tracker's eight tiles cannot overflow. */
export function glassesFrom(entries: HydrationEntry[]): number {
  return Math.min(Math.floor(totalMl(entries) / ML_PER_GLASS), DAILY_GLASS_GOAL);
}

/** The day's log, or null when nothing has been drunk yet. */
export async function fetchHydrationLog(date: string): Promise<HydrationLog | null> {
  const userId = getCurrentUserId();
  try {
    const snapshot = await getDoc(
      doc(db, HYDRATION_COLLECTION, hydrationDocId(userId, date)),
    );
    if (!snapshot.exists()) return null;
    return toHydrationLog(snapshot.id, snapshot.data());
  } catch (err) {
    throw new HydrationLogServiceError(
      err instanceof Error ? err.message : 'Failed to load water intake.',
    );
  }
}

/**
 * Writes the day's entries, replacing whatever was stored.
 *
 * The whole array is sent rather than an arrayUnion: entries are also
 * removed and reordered here, and a day holds a handful of them at
 * most, so a full rewrite is simpler than reconciling two operations —
 * and it keeps the document consistent with what the caller just showed
 * on screen.
 */
export async function saveHydrationEntries(
  date: string,
  entries: HydrationEntry[],
): Promise<void> {
  const userId = getCurrentUserId();
  try {
    await setDoc(
      doc(db, HYDRATION_COLLECTION, hydrationDocId(userId, date)),
      {
        userId,
        date,
        // Sanitised here rather than trusted from the caller, so a stray
        // negative or fractional value can never reach the database.
        entries: entries
          .filter((entry) => entry.ml > 0)
          .map((entry) => ({ ml: Math.round(entry.ml), time: entry.time })),
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  } catch (err) {
    throw new HydrationLogServiceError(
      err instanceof Error ? err.message : 'Failed to save water intake.',
    );
  }
}
