// Firestore access for feature flags. One document per flag in the
// `featureToggle` collection: id = flag key, body `{ enabled: boolean }`.
// Toggled by hand in the Firebase console; the app only ever reads.
//
// Only FeatureFlagProvider calls this — screens read flags through
// useFeatureFlag / FeatureGate / isFeatureEnabled.
import { collection, onSnapshot } from 'firebase/firestore';

import { db } from '../Firebase/firebaseConfig';
import type { FlagValues } from '../FeatureFlags/types';

const FLAGS_COLLECTION = 'featureToggle';

/**
 * The flag's value from its document: the `enabled` field, or a boolean
 * field named after the flag itself (e.g. `disabledPushNotification: true`).
 * Anything else is ignored, and the registry default applies.
 */
function readFlagValue(id: string, data: Record<string, unknown>): boolean | undefined {
  if (typeof data.enabled === 'boolean') return data.enabled;
  if (typeof data[id] === 'boolean') return data[id] as boolean;
  return undefined;
}

/**
 * Live subscription to every flag document. Calls `onChange` with the
 * full key -> enabled map on the first snapshot and on every change.
 * Documents whose `enabled` is not a boolean are skipped. Returns the
 * unsubscribe function.
 */
export function subscribeToFeatureFlags(
  onChange: (flags: FlagValues) => void,
  onError?: (message: string) => void,
): () => void {
  return onSnapshot(
    collection(db, FLAGS_COLLECTION),
    snapshot => {
      const flags: FlagValues = {};
      snapshot.docs.forEach(d => {
        const value = readFlagValue(d.id, d.data());
        if (typeof value === 'boolean') flags[d.id] = value;
      });
      if (__DEV__) {
        const seen = snapshot.docs.map(d => {
          const fields = Object.entries(d.data()).map(([k, v]) => `${k}: ${typeof v}`);
          return `${d.id}{${fields.join(', ')}}`;
        });
        console.log(
          `[featureFlags] "${FLAGS_COLLECTION}" snapshot fromCache=${snapshot.metadata.fromCache} docs=[${seen.join(', ')}]`,
        );
      }
      onChange(flags);
    },
    err => onError?.(err.message),
  );
}
