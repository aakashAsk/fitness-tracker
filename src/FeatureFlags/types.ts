// Where a resolved flag value came from, best to worst. `default` means
// neither the database nor the device cache had an answer.
export type FlagSource = 'server' | 'cache' | 'default';

// Raw values as stored: flag key -> enabled. Keys the registry does not
// know about may appear here and are ignored by the resolver.
export type FlagValues = Record<string, boolean>;

export interface FlagDefinition {
  /** Stable key. Also the Firestore document id in `featureToggle`. Never rename — retire instead. */
  readonly key: string;
  /** What the flag controls, in one sentence. */
  readonly description: string;
  /** Who decides whether this is on. */
  readonly owner: string;
  /** Used when no value is available from the database or the cache. */
  readonly defaultValue: boolean;
  /** "YYYY-MM-DD" the flag was added. */
  readonly createdAt: string;
  /** "YYYY-MM-DD" by which the flag should be deleted from code. */
  readonly plannedRemoval: string;
  /**
   * What happens when nothing has an answer.
   * 'open'   — use defaultValue (long-lived, proven features).
   * 'closed' — always OFF (every new or risky feature).
   */
  readonly failMode: 'open' | 'closed';
}
