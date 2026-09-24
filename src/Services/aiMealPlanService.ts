// Generates a weekly meal plan from the signed-in user's already-derived
// calorie/macro targets, goal and dietary restrictions, via OpenRouter.
//
// Meant to be called from an AI button's onPress:
//
//   const plan = await generateAiMealPlan({ profile, preferences });
//
// It only GENERATES — nothing is saved here. To save the result, use
// aiMealPlanDraftService (generateAiDraftMealPlans does both in one
// call), which stores every plan as a DRAFT.
//
// All request/prompt/validation logic lives in ./aiMealPlanShape; this
// file is the thin part that gets the profile and makes the call — same
// split as aiWorkoutPlanService/aiWorkoutPlanShape.
import { generateJson, isOpenRouterConfigured, OpenRouterServiceError } from './openRouterService';
import { fetchUserProfile, type UserProfile } from './userProfileService';
import {
  AiMealPlanError,
  buildPlanPrompt,
  buildPlanRequest,
  MEAL_PLAN_SCHEMA,
  normalizePlan,
  SYSTEM_PROMPT,
  type AiMealPlan,
  type AiMealPlanPreferences,
} from './aiMealPlanShape';

export * from './aiMealPlanShape';

export interface GenerateAiMealPlanOptions {
  /**
   * The user's profile. Pass the one already in the Redux store
   * (`useUserProfile()`) to save a Firestore read; when omitted it is
   * fetched.
   */
  profile?: UserProfile | null;
  /** What the user picked at tap time; anything left out defaults to
      3 meals a day. */
  preferences?: AiMealPlanPreferences;
  /** Aborts the request if the user leaves the screen. */
  signal?: AbortSignal;
}

/**
 * Builds a meal plan for the current user.
 *
 * Every failure is thrown as an AiMealPlanError with a message that is
 * safe to show as-is — an incomplete profile, AI not configured, a
 * network or API failure, or a reply with nothing usable in it.
 */
export async function generateAiMealPlan(
  options: GenerateAiMealPlanOptions = {},
): Promise<AiMealPlan> {
  if (!isOpenRouterConfigured()) {
    throw new AiMealPlanError('AI plans are not set up on this build yet.');
  }

  let profile = options.profile ?? null;
  if (!profile) {
    try {
      profile = await fetchUserProfile();
    } catch {
      throw new AiMealPlanError('Could not load your profile. Please try again.');
    }
  }
  if (!profile) {
    throw new AiMealPlanError('Finish setting up your profile to generate a meal plan.');
  }

  // Throws for a profile with no calorie target yet.
  const request = buildPlanRequest(profile, options.preferences);

  let reply: unknown;
  try {
    reply = await generateJson<unknown>(buildPlanPrompt(request), {
      system: SYSTEM_PROMPT,
      schema: MEAL_PLAN_SCHEMA as unknown as Record<string, unknown>,
      schemaName: 'meal_plan',
      temperature: 0.5,
      // Up to 12 meals (4 types × 3 variants) of up to 6 short items each
      // — a smaller reply than the workout plan's, since no numeric
      // nutrition is asked for (see aiMealPlanShape's file header).
      maxOutputTokens: 2000,
      signal: options.signal,
    });
  } catch (err) {
    // A cancelled request is the caller's own doing — let it through as
    // itself so they can tell "cancelled" from "failed".
    if (err instanceof Error && err.name === 'AbortError') throw err;
    throw new AiMealPlanError(
      err instanceof OpenRouterServiceError && err.status === 429
        ? 'The AI is busy right now. Please try again in a moment.'
        : 'Could not generate a meal plan. Check your connection and try again.',
    );
  }

  return normalizePlan(reply, request);
}
