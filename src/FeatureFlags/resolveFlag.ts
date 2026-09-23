import type { FlagDefinition, FlagSource, FlagValues } from './types';

export interface ResolvedFlag {
  enabled: boolean;
  source: FlagSource;
}

/**
 * Decides one flag. Order: database value, then cached value, then the
 * registry default. A 'closed' flag with no value anywhere is always OFF,
 * so a new feature can never switch itself on because the backend was
 * unreachable.
 */
export function resolveFlag(
  definition: FlagDefinition,
  server: FlagValues | null | undefined,
  cache: FlagValues | null | undefined,
): ResolvedFlag {
  const fromServer = server?.[definition.key];
  if (typeof fromServer === 'boolean') return { enabled: fromServer, source: 'server' };

  const fromCache = cache?.[definition.key];
  if (typeof fromCache === 'boolean') return { enabled: fromCache, source: 'cache' };

  return {
    enabled: definition.failMode === 'closed' ? false : definition.defaultValue,
    source: 'default',
  };
}

/** Resolves every flag in a registry. */
export function resolveAll<R extends Record<string, FlagDefinition>>(
  registry: R,
  server: FlagValues | null | undefined,
  cache: FlagValues | null | undefined,
): Record<keyof R, ResolvedFlag> {
  const out = {} as Record<keyof R, ResolvedFlag>;
  for (const key of Object.keys(registry) as (keyof R)[]) {
    out[key] = resolveFlag(registry[key], server, cache);
  }
  return out;
}
