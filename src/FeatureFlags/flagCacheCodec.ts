// Pure (de)serialisation for the on-device flag cache, kept apart from
// AsyncStorage so it can be tested without React Native.
import type { FlagValues } from './types';

const CACHE_VERSION = 1;

export function encodeCache(flags: FlagValues): string {
  return JSON.stringify({ v: CACHE_VERSION, flags });
}

/** Null for anything that is not a well-formed v1 cache. Never throws. */
export function decodeCache(raw: string | null | undefined): FlagValues | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.v !== CACHE_VERSION || typeof parsed.flags !== 'object' || !parsed.flags) {
      return null;
    }
    const out: FlagValues = {};
    for (const [key, value] of Object.entries(parsed.flags)) {
      if (typeof value === 'boolean') out[key] = value;
    }
    return out;
  } catch {
    return null;
  }
}
