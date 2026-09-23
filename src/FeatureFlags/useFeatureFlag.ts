import { useSyncExternalStore } from 'react';

import type { FeatureFlagKey } from './registry';
import { getFlagsReady, getResolvedFlags, subscribeToFlagStore } from './flagStore';

/** The resolved on/off value for a flag. Re-renders live when it changes. */
export function useFeatureFlag(key: FeatureFlagKey): boolean {
  return useSyncExternalStore(
    subscribeToFlagStore,
    () => getResolvedFlags()[key].enabled,
  );
}

/** True once flags have loaded (or the load timed out). Used by the boot splash. */
export function useFeatureFlagsReady(): boolean {
  return useSyncExternalStore(subscribeToFlagStore, getFlagsReady);
}
