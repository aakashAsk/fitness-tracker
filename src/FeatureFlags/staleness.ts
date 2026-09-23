import type { FlagDefinition } from './types';

export interface StaleFlag {
  key: string;
  owner: string;
  plannedRemoval: string;
  daysOverdue: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function dayNumber(isoDate: string): number {
  return Math.floor(Date.parse(`${isoDate}T00:00:00Z`) / DAY_MS);
}

/**
 * Flags whose planned removal date has passed. `today` is "YYYY-MM-DD".
 * On the removal date itself a flag is not yet overdue.
 */
export function findStaleFlags(
  registry: Record<string, FlagDefinition>,
  today: string,
): StaleFlag[] {
  const todayNumber = dayNumber(today);
  return Object.values(registry)
    .map(flag => ({
      key: flag.key,
      owner: flag.owner,
      plannedRemoval: flag.plannedRemoval,
      daysOverdue: todayNumber - dayNumber(flag.plannedRemoval),
    }))
    .filter(flag => flag.daysOverdue > 0);
}
