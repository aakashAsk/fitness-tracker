// Client for the "Free Exercise DB" API (exercise + muscle lists used by
// the workout planner's exercise picker).
//
// Base URL comes from `.env` (`EXPO_PUBLIC_EXERCISE_API_BASE_URL`). Expo
// inlines EXPO_PUBLIC_* vars into the bundle automatically — no extra
// package needed. See `.env.example` for the expected key.
const BASE_URL = process.env.EXPO_PUBLIC_EXERCISE_API_BASE_URL;

export type ExerciseForce = 'push' | 'pull' | 'static' | null;
export type ExerciseLevel = 'beginner' | 'intermediate' | 'expert';
export type ExerciseMechanic = 'compound' | 'isolation' | null;
export type ExerciseCategory =
  | 'strength'
  | 'stretching'
  | 'plyometrics'
  | 'strongman'
  | 'powerlifting'
  | 'cardio'
  | 'olympic weightlifting';

export interface Exercise {
  id: string;
  name: string;
  force: ExerciseForce;
  level: ExerciseLevel;
  mechanic: ExerciseMechanic;
  equipment: string | null;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  instructions: string[];
  category: ExerciseCategory;
  images: string[];
}

export interface ExerciseFilters {
  muscle?: string;
  category?: ExerciseCategory | string;
  equipment?: string;
  level?: ExerciseLevel | string;
  search?: string;
  /** Caps how many results come back, e.g. `{ limit: 5 }`. */
  limit?: number;
}

export class ExerciseApiError extends Error {
  status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = 'ExerciseApiError';
    this.status = status;
  }
}

async function request<T>(
  path: string,
  params?: Record<string, string | number | undefined>,
): Promise<T> {
  if (!BASE_URL) {
    throw new ExerciseApiError('Exercise API base URL is not configured.');
  }

  const url = new URL(path, BASE_URL);
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== '') {
        url.searchParams.set(key, String(value));
      }
    });
  }

  let response: Response;
  try {
    response = await fetch(url.toString());
  } catch (err) {
    throw new ExerciseApiError(
      err instanceof Error ? err.message : 'Network request failed',
    );
  }

  if (!response.ok) {
    throw new ExerciseApiError(
      `Exercise API request failed: ${response.status} ${response.statusText}`,
      response.status,
    );
  }

  return response.json() as Promise<T>;
}

/**
 * GET /exercises — optionally filtered by muscle, category, equipment,
 * level, or a free-text search term. Combine filters freely, e.g.
 * `fetchExercises({ muscle: 'biceps', level: 'beginner' })`.
 */
export function fetchExercises(filters: ExerciseFilters = {}): Promise<Exercise[]> {
  return request<Exercise[]>('/exercises', { ...filters });
}

/** GET /exercises/:id — a single exercise by its slug id (e.g. "3_4_Sit-Up"). */
export function fetchExerciseById(id: string): Promise<Exercise> {
  return request<Exercise>(`/exercises/${encodeURIComponent(id)}`);
}

/**
 * POST /exercises/bulk — resolves many exercise ids in one request, e.g.
 * to hydrate a saved plan's `exerciseIds` back into full Exercise records
 * for display. Order of the response isn't guaranteed to match `ids`.
 */
export async function fetchExercisesBulk(ids: string[]): Promise<Exercise[]> {
  if (ids.length === 0) return [];
  if (!BASE_URL) {
    throw new ExerciseApiError('Exercise API base URL is not configured.');
  }

  let response: Response;
  try {
    response = await fetch(new URL('/exercises/bulk', BASE_URL).toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    });
  } catch (err) {
    throw new ExerciseApiError(
      err instanceof Error ? err.message : 'Network request failed',
    );
  }

  if (!response.ok) {
    throw new ExerciseApiError(
      `Exercise API request failed: ${response.status} ${response.statusText}`,
      response.status,
    );
  }

  return response.json() as Promise<Exercise[]>;
}

/** GET /muscles — the full list of muscle group names used to filter exercises. */
export function fetchMuscles(): Promise<string[]> {
  return request<string[]>('/muscles');
}

/**
 * Resolves a relative image path from `Exercise.images` (e.g.
 * "3_4_Sit-Up/0.jpg") to a fully-qualified URL suitable for <Image source>.
 */
export function getExerciseImageUrl(relativePath: string): string {
  return `${BASE_URL ?? ''}/images/${relativePath}`;
}
