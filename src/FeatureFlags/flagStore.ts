// Module-level holder of the current flag values. It lives outside React
// so non-React code (the tab switch in App.tsx, services, future deep-link
// and notification handlers) can ask `isFeatureEnabled` synchronously,
// while hooks subscribe to it with useSyncExternalStore.
//
// Only FeatureFlagProvider writes to it. Pure — no Firebase or React Native
// imports — so it is covered by `npm test`.
import { FEATURE_FLAGS, type FeatureFlagKey } from './registry.ts';
import { resolveAll, type ResolvedFlag } from './resolveFlag.ts';
import type { FlagValues } from './types.ts';

type Resolved = Record<FeatureFlagKey, ResolvedFlag>;

let server: FlagValues | null = null;
let cache: FlagValues | null = null;
let ready = false;
let resolved: Resolved = resolveAll(FEATURE_FLAGS, null, null);

const listeners = new Set<() => void>();

function recompute(): void {
  // Once the database has answered it is authoritative: a flag document
  // deleted in the console reverts to its registry default rather than
  // lingering as a stale cached value.
  resolved = resolveAll(FEATURE_FLAGS, server, server ? null : cache);
  listeners.forEach(listener => listener());
}

export function setServerFlags(flags: FlagValues): void {
  server = flags;
  recompute();
}

export function setCachedFlags(flags: FlagValues | null): void {
  cache = flags;
  recompute();
}

/** Latches: once flags are considered loaded they stay loaded. */
export function markFlagsReady(): void {
  if (ready) return;
  ready = true;
  recompute();
}

export function subscribeToFlagStore(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getResolvedFlags(): Resolved {
  return resolved;
}

export function getFlagsReady(): boolean {
  return ready;
}

/**
 * For services, navigation guards and other non-React code. Before the
 * provider has loaded anything this returns the registry default, which
 * is the safe answer by construction (closed flags are OFF).
 */
export function isFeatureEnabled(key: FeatureFlagKey): boolean {
  return resolved[key].enabled;
}

/** Test-only: back to the boot state. */
export function resetFlagStoreForTests(): void {
  server = null;
  cache = null;
  ready = false;
  listeners.clear();
  resolved = resolveAll(FEATURE_FLAGS, null, null);
}
