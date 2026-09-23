// Generates a weekly workout plan from the signed-in user's own data —
// age, gender, height, weight, goal, target pace, activity level and any
// injuries — via OpenRouter.
//
// Meant to be called from an AI button's onPress:
//
//   const plan = await generateAiWorkoutPlan({ profile, preferences });
//
// It only GENERATES — nothing is saved here. To save the result, use
// aiWorkoutPlanDraftService (generateAiDraftPlans does both in one call),
// which matches the exercise names to library ids and stores every plan
// as a DRAFT.
//
// All request/prompt/validation logic lives in ./aiWorkoutPlanShape; this
// file is the thin part that gets the profile and makes the call.
//
// The same security note as openRouterService applies: until a proxy is
// configured the API key ships in the bundle. This service goes through
// generateJson, so pointing that at a proxy needs no change here.
import { generateJson, isOpenRouterConfigured, OpenRouterServiceError } from './openRouterService';
import { fetchUserProfile, type UserProfile } from './userProfileService';
import {
  AiWorkoutPlanError,
  buildPlanPrompt,
  buildPlanRequest,
  normalizePlan,
  PLAN_SCHEMA,
  SYSTEM_PROMPT,
  type AiPlanPreferences,
  type AiWorkoutPlan,
} from './aiWorkoutPlanShape';

export * from './aiWorkoutPlanShape';

export interface GenerateAiWorkoutPlanOptions {
  /**
   * The user's profile. Pass the one already in the Redux store
   * (`useUserProfile()`) to save a Firestore read; when omitted it is
   * fetched.
   */
  profile?: UserProfile | null;
  /** What the user picked at tap time; anything left out is derived from
      the profile. */
  preferences?: AiPlanPreferences;
  /** Aborts the request if the user leaves the screen. */
  signal?: AbortSignal;
}

/**
 * Builds a plan for the current user.
 *
 * Every failure is thrown as an AiWorkoutPlanError with a message that
 * is safe to show as-is — an incomplete profile, AI not configured, a
 * network or API failure, or a reply with nothing usable in it.
 */
export async function generateAiWorkoutPlan(
  options: GenerateAiWorkoutPlanOptions = {},
): Promise<AiWorkoutPlan> {
  if (!isOpenRouterConfigured()) {
    throw new AiWorkoutPlanError('AI plans are not set up on this build yet.');
  }

  let profile = options.profile ?? null;
  if (!profile) {
    try {
      profile = await fetchUserProfile();
    } catch {
      throw new AiWorkoutPlanError('Could not load your profile. Please try again.');
    }
  }
  if (!profile) {
    throw new AiWorkoutPlanError('Finish setting up your profile to generate a plan.');
  }

  // Throws for a profile too incomplete to plan from.
  const request = buildPlanRequest(profile, options.preferences);

  let reply: unknown;
  try {
    reply = await generateJson<unknown>(buildPlanPrompt(request), {
      system: SYSTEM_PROMPT,
      schema: PLAN_SCHEMA as unknown as Record<string, unknown>,
      schemaName: 'workout_plan',
      temperature: 0.5,
      // Up to four sessions of up to ten exercises, each a short object.
      maxOutputTokens: 2500,
      signal: options.signal,
    });
  } catch (err) {
    // A cancelled request is the caller's own doing — let it through as
    // itself so they can tell "cancelled" from "failed".
    if (err instanceof Error && err.name === 'AbortError') throw err;
    throw new AiWorkoutPlanError(
      err instanceof OpenRouterServiceError && err.status === 429
        ? 'The AI is busy right now. Please try again in a moment.'
        : 'Could not generate a plan. Check your connection and try again.',
    );
  }

  return normalizePlan(reply, request);
}
