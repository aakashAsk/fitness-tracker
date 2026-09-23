// The single owner of flag loading. Mounted once at the app root; no
// screen, hook or service fetches flags on its own.
//
//   1. A 2500 ms timer is armed FIRST, so nothing below can delay it.
//   2. The Firestore listener starts and the device cache is read
//      concurrently.
//   3. "Ready" (which releases the splash) is the first of: the first
//      database snapshot, a listener error, or the timeout.
//   4. The timeout never cancels the listener — a slow first snapshot
//      still lands and updates the app live, as does every later change.
//   5. Every snapshot is mirrored to the device for the next cold start.
//
// Fallback per flag: database -> device cache -> registry default.
import React, { useEffect } from 'react';

import { subscribeToFeatureFlags } from '../Services/featureFlagService';
import { readCachedFlags, writeCachedFlags } from './featureFlagStorage';
import { FEATURE_FLAGS } from './registry';
import {
  getResolvedFlags,
  markFlagsReady,
  setCachedFlags,
  setServerFlags,
} from './flagStore';
import { findStaleFlags } from './staleness';

const READY_TIMEOUT_MS = 2500;

function logStartupSummary(): void {
  if (!__DEV__) return;
  const resolved = getResolvedFlags();
  const summary = Object.entries(resolved)
    .map(([key, value]) => `${key}=${value.enabled} (${value.source})`)
    .join(', ');
  console.log(`[featureFlags] ${summary}`);

  const stale = findStaleFlags(FEATURE_FLAGS, new Date().toISOString().slice(0, 10));
  if (stale.length > 0) {
    console.warn(
      `[featureFlags] past planned removal: ${stale
        .map(flag => `${flag.key} (${flag.daysOverdue}d)`)
        .join(', ')}`,
    );
  }
}

export function FeatureFlagProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    let active = true;

    const becomeReady = () => {
      markFlagsReady();
      logStartupSummary();
    };

    const timer = setTimeout(becomeReady, READY_TIMEOUT_MS);

    readCachedFlags().then(cached => {
      if (active) setCachedFlags(cached);
    });

    let unsubscribe: (() => void) | undefined;
    try {
      unsubscribe = subscribeToFeatureFlags(
        flags => {
          if (!active) return;
          setServerFlags(flags);
          writeCachedFlags(flags);
          clearTimeout(timer);
          becomeReady();
        },
        message => {
          // Not fatal: cache or defaults stay in force.
          if (__DEV__) console.warn(`[featureFlags] listener error: ${message}`);
          if (!active) return;
          clearTimeout(timer);
          becomeReady();
        },
      );
    } catch (error) {
      if (__DEV__) console.warn('[featureFlags] could not subscribe', error);
    }

    return () => {
      active = false;
      clearTimeout(timer);
      unsubscribe?.();
    };
  }, []);

  return <>{children}</>;
}
