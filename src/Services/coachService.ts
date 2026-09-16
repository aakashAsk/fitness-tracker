// The app's first real use of Gemini: a short coaching note written
// from the user's own logged sessions.
//
// Kept separate from geminiService so the prompt lives with the domain
// it describes, and so swapping models or moving behind a proxy is
// invisible here.
import { generateJson, GeminiServiceError } from './geminiService';
import { buildWorkoutProgress, formatTrendLabel } from './progressService';
import { fetchWorkoutLogsForUser } from './workoutLogService';

export interface CoachInsight {
  /** One line, shown as the banner's headline. */
  headline: string;
  /** A sentence or two of detail. */
  detail: string;
}

const SYSTEM = [
  'You are a concise strength coach inside a fitness app.',
  'You are given a summary of the user\'s recent sessions.',
  'Reply with JSON only: {"headline": string, "detail": string}.',
  'headline: at most 8 words, specific to the numbers given.',
  'detail: at most 30 words, one concrete, actionable observation.',
  'Never invent sessions, exercises or numbers that are not in the summary.',
  'Do not give medical advice.',
].join(' ');

/**
 * Turns the last few weeks of logs into a prompt.
 *
 * Sent as compact rows rather than raw documents: the model only needs
 * the shape of the trend, and a smaller prompt is both cheaper and
 * less likely to be padded out with detail it then invents around.
 */
function describeSessions(
  sessions: { date: string; volume: number; sets: number; reps: number; avgWeight: number }[],
): string {
  return sessions
    .map(
      (session) =>
        `${formatTrendLabel(session.date)}: ${session.volume}kg volume, ` +
        `${session.sets} sets, ${session.reps} reps, avg ${session.avgWeight}kg/rep`,
    )
    .join('\n');
}

/**
 * Builds an insight, or null when there is not enough history to say
 * anything honest about — which is most new accounts.
 *
 * Two sessions is the floor: with one there is no trend, and a model
 * asked for an observation anyway will manufacture one.
 */
export async function fetchCoachInsight(
  signal?: AbortSignal,
): Promise<CoachInsight | null> {
  const logs = await fetchWorkoutLogsForUser();
  const progress = buildWorkoutProgress(logs);

  if (progress.sessions.length < 2) return null;

  const prompt = [
    `Recent sessions (oldest first):`,
    describeSessions(progress.sessions),
    '',
    `Totals across this window: ${progress.totalVolume}kg volume, ` +
      `${progress.totalSets} sets, ${progress.totalReps} reps, ` +
      `heaviest single set ${progress.bestWeight}kg.`,
  ].join('\n');

  const insight = await generateJson<CoachInsight>(prompt, {
    system: SYSTEM,
    temperature: 0.4,
    maxOutputTokens: 200,
    signal,
  });

  // A model can return valid JSON with the wrong shape; a banner with
  // `undefined` in it is worse than no banner.
  if (!insight?.headline || !insight?.detail) {
    throw new GeminiServiceError('The coach reply was missing its text.');
  }

  return insight;
}
