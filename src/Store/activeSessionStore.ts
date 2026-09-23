// The one running workout/meal timer, held outside React so it survives
// navigation (the dashboard unmounts when another tab is open) and is
// mirrored to AsyncStorage so it survives the app being closed. Only the
// start timestamp is stored — see sessionTimer.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useSyncExternalStore } from 'react';

import { decodeSession, encodeSession, type ActiveSession } from '../Services/sessionTimer';

const SESSION_KEY = 'pulsefit.activeSession';

let session: ActiveSession | null = null;
let hydration: Promise<void> | null = null;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach(listener => listener());
}

/** Loads a session left running by an earlier launch. Safe to call repeatedly. */
export function hydrateActiveSession(): Promise<void> {
  if (!hydration) {
    hydration = AsyncStorage.getItem(SESSION_KEY)
      .then(raw => {
        // A start made while this read was in flight is newer than the disk.
        if (session === null) {
          session = decodeSession(raw);
          emit();
        }
      })
      .catch(() => undefined);
  }
  return hydration;
}

export function startActiveSession(next: ActiveSession): void {
  session = next;
  emit();
  AsyncStorage.setItem(SESSION_KEY, encodeSession(next)).catch(() => undefined);
}

export function clearActiveSession(): void {
  session = null;
  emit();
  AsyncStorage.removeItem(SESSION_KEY).catch(() => undefined);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The running session, or null. Hydrates from disk on first use. */
export function useActiveSession(): ActiveSession | null {
  useEffect(() => {
    hydrateActiveSession();
  }, []);
  return useSyncExternalStore(subscribe, () => session);
}
