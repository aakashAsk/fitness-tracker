// Matches the exercise names an AI plan proposes to real exercises in the
// exercise library.
//
// A plan stores exercise IDS (see WorkoutPlan.exerciseIds), but a model
// only knows names — and not the library's: it says "Incline Barbell
// Bench Press" where the library has "Barbell Incline Bench Press -
// Medium Grip". The library's `search` is a plain substring match on the
// name, so searching the model's name verbatim mostly finds nothing.
//
// So each proposed exercise is looked up with a few cheap queries (the
// full name, then its most distinctive words scoped to the muscle), and
// the union of results is SCORED against the proposed name here. Anything
// that does not score well enough is left unmatched rather than guessed:
// a wrong exercise in someone's plan is worse than a missing one.
//
// Pure apart from the injected `search` function, so it is unit-tested.
import type { AiPlanExercise } from './aiWorkoutPlanShape';

/** The parts of a library exercise that matching needs. */
export interface MatchCandidate {
  id: string;
  name: string;
  equipment: string | null;
  primaryMuscles: string[];
}

export type MatchTarget = Pick<AiPlanExercise, 'name' | 'muscle' | 'equipment'>;

/** Lowest score accepted as "this is that exercise". */
export const MIN_MATCH_SCORE = 0.7;

/** The library's own muscle names — `muscle` is only sent as a filter
 * when it is one of these, since an unknown value would filter to nothing. */
const KNOWN_MUSCLES: ReadonlySet<string> = new Set([
  'abdominals',
  'abductors',
  'adductors',
  'biceps',
  'calves',
  'chest',
  'forearms',
  'glutes',
  'hamstrings',
  'lats',
  'lower back',
  'middle back',
  'neck',
  'quadriceps',
  'shoulders',
  'traps',
  'triceps',
]);

const STOP_WORDS: ReadonlySet<string> = new Set(['the', 'a', 'an', 'with', 'and', 'of']);
const ALIASES: Readonly<Record<string, string>> = { db: 'dumbbell', bb: 'barbell' };

/** Words that name the equipment rather than the movement — useless as a
 * search term, since they match half the library. */
const EQUIPMENT_WORDS: ReadonlySet<string> = new Set([
  'barbell',
  'dumbbell',
  'cable',
  'machine',
  'kettlebell',
  'band',
  'body',
  'only',
  'weight',
  'bodyweight',
  'bar',
  'ball',
  'medicine',
  'exercise',
]);

/** "curls" → "curl", "presses" → "press" — applied to both sides, so all
 * that matters is that it is consistent. */
function singular(word: string): string {
  if (word.length <= 3) return word;
  if (word.endsWith('sses')) return word.slice(0, -2);
  if (word.endsWith('ss')) return word;
  return word.endsWith('s') ? word.slice(0, -1) : word;
}

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length >= 2 && !STOP_WORDS.has(word))
    .map((word) => singular(ALIASES[word] ?? word));
}

/** Maps free text ("Body weight", "Dumbbells") onto the library's
 * equipment names, or null when it is not one we can place. */
export function normalizeEquipment(text: string | null | undefined): string | null {
  const value = (text ?? '').toLowerCase();
  if (!value) return null;
  if (value.includes('body')) return 'body only';
  if (value.includes('dumbbell')) return 'dumbbell';
  if (value.includes('barbell')) return 'barbell';
  if (value.includes('cable')) return 'cable';
  if (value.includes('machine')) return 'machine';
  if (value.includes('kettlebell')) return 'kettlebells';
  if (value.includes('band')) return 'bands';
  if (value.includes('e-z') || value.includes('ez')) return 'e-z curl bar';
  if (value.includes('medicine')) return 'medicine ball';
  if (value.includes('ball')) return 'exercise ball';
  return null;
}

/**
 * How well a library exercise fits a proposed one, 0–1.
 *
 * Mostly word overlap — weighted toward how much of the PROPOSED name
 * the candidate covers (recall), since library names carry extra words
 * like "- Medium Grip" that say nothing against a match. Equipment then
 * decides between near-identical names: "Bench Press" scores the same
 * against the barbell and dumbbell versions on words alone, and someone
 * whose plan says barbell should not be handed the dumbbell one.
 */
export function scoreCandidate(target: MatchTarget, candidate: MatchCandidate): number {
  const wanted = new Set(tokenize(target.name));
  const have = new Set(tokenize(candidate.name));
  if (wanted.size === 0 || have.size === 0) return 0;

  let shared = 0;
  wanted.forEach((word) => {
    if (have.has(word)) shared += 1;
  });

  const recall = shared / wanted.size;
  const precision = shared / have.size;
  let score = 0.7 * recall + 0.3 * precision;

  const wantedEquipment = normalizeEquipment(target.equipment);
  const haveEquipment = normalizeEquipment(candidate.equipment);
  if (wantedEquipment && haveEquipment) {
    score += wantedEquipment === haveEquipment ? 0.15 : -0.15;
  }

  const muscle = target.muscle.trim().toLowerCase();
  if (muscle && candidate.primaryMuscles.some((m) => m.toLowerCase() === muscle)) {
    score += 0.05;
  }

  return Math.min(1, Math.max(0, score));
}

/** The best-scoring candidate at or above `minScore`, or null. */
export function pickBestMatch(
  target: MatchTarget,
  candidates: readonly MatchCandidate[],
  minScore: number = MIN_MATCH_SCORE,
): MatchCandidate | null {
  let best: MatchCandidate | null = null;
  let bestScore = minScore;
  for (const candidate of candidates) {
    const score = scoreCandidate(target, candidate);
    if (score >= bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return best;
}

/** Up to two search words for a name: the longest ones that describe the
 * movement rather than the equipment. */
export function distinctiveTokens(name: string): string[] {
  return Array.from(new Set(tokenize(name)))
    .filter((word) => !EQUIPMENT_WORDS.has(word))
    .sort((a, b) => b.length - a.length)
    .slice(0, 2);
}

export interface SearchFilters {
  search?: string;
  muscle?: string;
  limit?: number;
}

export type SearchFn = (filters: SearchFilters) => Promise<MatchCandidate[]>;

/** Requests in flight at once — a plan can have ~30 exercises. */
const MAX_PARALLEL = 6;

/**
 * Resolves each target to a library exercise, in the same order, with
 * null for any that could not be matched with confidence.
 *
 * Identical queries are shared, so two plans that both ask for
 * "squat" cost one request. A failed search rejects the whole call:
 * treating it as "no results" would report every exercise as unmatched
 * when the real problem is the network.
 */
export async function resolveExercises(
  targets: readonly MatchTarget[],
  search: SearchFn,
): Promise<(MatchCandidate | null)[]> {
  let active = 0;
  const waiting: (() => void)[] = [];
  const limited = async <T>(task: () => Promise<T>): Promise<T> => {
    if (active >= MAX_PARALLEL) await new Promise<void>((resolve) => waiting.push(resolve));
    active += 1;
    try {
      return await task();
    } finally {
      active -= 1;
      waiting.shift()?.();
    }
  };

  const cache = new Map<string, Promise<MatchCandidate[]>>();
  const run = (filters: SearchFilters) => {
    const key = JSON.stringify(filters);
    let hit = cache.get(key);
    if (!hit) {
      hit = limited(() => search(filters));
      cache.set(key, hit);
    }
    return hit;
  };

  return Promise.all(
    targets.map(async (target) => {
      const muscle = target.muscle.trim().toLowerCase();
      const scope = KNOWN_MUSCLES.has(muscle) ? { muscle } : {};

      const queries: SearchFilters[] = [
        { search: target.name.trim(), limit: 25 },
        ...distinctiveTokens(target.name).map((word) => ({ search: word, ...scope, limit: 50 })),
      ];

      const found = (await Promise.all(queries.map(run))).flat();
      const unique = Array.from(new Map(found.map((exercise) => [exercise.id, exercise])).values());
      return pickBestMatch(target, unique);
    }),
  );
}
