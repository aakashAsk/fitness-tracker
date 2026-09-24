// Turns a generated AI week into saved meal plans — every one a DRAFT.
//
//   const { drafts } = await generateAiDraftMealPlans({ profile, preferences });
//
// Drafts are the app's "not committed yet" state: they never appear on
// the calendar and wait in the meal library until the user has looked
// them over and made them live. That is the point of routing AI output
// through here rather than straight into createMealPlan — nothing an AI
// suggested can reach the user's real schedule without them choosing to.
// The status is fixed in toDraftMealPlanInput; there is deliberately no
// option to change it.
//
// Simpler than the workout side: meal items are free text (no exercise
// library to match names against), so generation and saving is a
// straight validate-then-write with no lookup step in between.
import type { DayKey } from '../Screens/Workout/Types';
import {
  AiMealPlanError,
  toDraftMealPlanInput,
  type AiMealPlan,
} from './aiMealPlanShape';
import { generateAiMealPlan, type GenerateAiMealPlanOptions } from './aiMealPlanService';
import {
  createMealPlans,
  fetchMealPlans,
  MAX_MEAL_PLANS_PER_USER,
  type MealType,
} from './mealPlanService';

export interface SavedAiMealDraft {
  /** The new MealPlan document id. */
  id: string;
  name: string;
  mealType: MealType;
  /** The days the AI suggested — kept on the draft, not yet scheduled. */
  days: DayKey[];
  itemCount: number;
}

export interface SaveAiMealDraftsResult {
  drafts: SavedAiMealDraft[];
}

/**
 * Saves a generated meal plan as drafts.
 *
 * Nothing is written until the user's plan allowance is confirmed — then
 * every draft goes in as one atomic batch, so a failure never leaves
 * half a week behind.
 *
 * Throws AiMealPlanError, with a message safe to show as-is, when the
 * user has no room for the drafts or the write fails.
 */
export async function saveAiMealPlansAsDrafts(plan: AiMealPlan): Promise<SaveAiMealDraftsResult> {
  const inputs = plan.plans.map(toDraftMealPlanInput);

  // Drafts count toward the cap — the meal library holds every plan the
  // user owns, whatever its status.
  let existingCount: number;
  try {
    existingCount = (await fetchMealPlans()).length;
  } catch {
    throw new AiMealPlanError('Could not check your saved meal plans. Please try again.');
  }
  const room = Math.max(0, MAX_MEAL_PLANS_PER_USER - existingCount);
  if (inputs.length > room) {
    throw new AiMealPlanError(
      `You can keep up to ${MAX_MEAL_PLANS_PER_USER} meal plans and have ${existingCount}. ` +
        `Delete ${inputs.length - room} to make room for the ${inputs.length} AI drafts.`,
    );
  }

  let ids: string[];
  try {
    ids = await createMealPlans(inputs);
  } catch {
    throw new AiMealPlanError('Could not save the drafts. Please try again.');
  }

  return {
    drafts: ids.map((id, index) => ({
      id,
      name: plan.plans[index].name,
      mealType: plan.plans[index].mealType,
      days: plan.plans[index].days,
      itemCount: plan.plans[index].items.length,
    })),
  };
}

export interface GenerateAiDraftMealPlansResult extends SaveAiMealDraftsResult {
  /** What the AI proposed — for showing its summary. */
  plan: AiMealPlan;
}

/**
 * The AI button's whole job in one call: generate a week from the user's
 * data, then save it as drafts.
 */
export async function generateAiDraftMealPlans(
  options: GenerateAiMealPlanOptions = {},
): Promise<GenerateAiDraftMealPlansResult> {
  const plan = await generateAiMealPlan(options);
  const saved = await saveAiMealPlansAsDrafts(plan);
  return { plan, ...saved };
}
