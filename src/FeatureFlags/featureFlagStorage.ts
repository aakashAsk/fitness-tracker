// Device-local copy of the last flag values received from Firestore, so
// a launch with no network still starts from the last known switches
// (including a kill) instead of only the bundled defaults.
import AsyncStorage from '@react-native-async-storage/async-storage';

import { decodeCache, encodeCache } from './flagCacheCodec';
import type { FlagValues } from './types';

const FLAGS_KEY = 'pulsefit.featureFlags';

/** Never throws — a cache miss just means falling back to defaults. */
export async function readCachedFlags(): Promise<FlagValues | null> {
  try {
    return decodeCache(await AsyncStorage.getItem(FLAGS_KEY));
  } catch {
    return null;
  }
}

export async function writeCachedFlags(flags: FlagValues): Promise<void> {
  try {
    await AsyncStorage.setItem(FLAGS_KEY, encodeCache(flags));
  } catch {
    // A stale cache only costs one launch's worth of accuracy.
  }
}
