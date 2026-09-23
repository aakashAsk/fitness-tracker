// Turns a generated AI week into saved workout plans — every one a DRAFT.
//
//   const { drafts } = await generateAiDraftPlans({ profile, preferences });
//
// Drafts are the app's "not committed yet" state: they never appear on
// the calendar, are not checked for schedule clashes, and wait in the plan
// library until the user has looked them over and made them live. That is
// the point of routing AI output through here rather than straight into
// createWorkoutPlan — nothing an AI suggested can reach the user's real
// schedule without them choosing to. The status is fixed in
// toDraftPlanInput; there is deliberately no option to change it.
//
// What is and is not saved: a plan stores its exercise IDS and nothing
// about how to do them, so the AI's sets, rep ranges and rest times are
// not kept — the WorkoutPlan model has nowhere to put them.
import type { DayKey } from '../Screens/Workout/Types';
import { fetchExercises } from './exerciseService';
import {
  resolveExercises,
  type MatchCandidate,
  type SearchFn,
} from './aiExerciseMatch';
import {
  AiWorkoutPlanError,
  toDraftPlanInput,
  type AiWorkoutPlan,
} from './aiWorkoutPlanShape';
import { generateAiWorkoutPlan, type GenerateAiWorkoutPlanOptions } from './aiWorkoutPlanService';
import { MAX_PLANS_PER_USER } from './planValidation';
import { createWorkoutPlans, fetchWorkoutPlans } from './workoutPlanService';

export interface SavedAiDraft {
  /** The new WorkoutPlan document id. */
  id: string;
  name: string;
  /** The days the AI suggested — kept on the draft, not yet scheduled. */
  days: DayKey[];
  exerciseCount: number;
  /** Names the AI proposed that could not be matched to the exercise
      library, and so are not in the draft. */
  unmatchedExercises: string[];
}

export interface SaveAiDraftsResult {
  drafts: SavedAiDraft[];
  /** Plans left out entirely because none of their exercises matched. */
  skippedPlans: string[];
}

/** The library search, shaped for the matcher. */
const searchLibrary: SearchFn = async (filters) => {
  const exercises = await fetchExercises(filters);
  return exercises.map(
    (exercise): MatchCandidate => ({
      id: exercise.id,
      name: exercise.name,
      equipment: exercise.equipment,
      primaryMuscles: exercise.primaryMuscles,
    }),
  );
};

/**
 * Saves a generated plan as drafts.
 *
 * Nothing is written until every step that can fail has succeeded: the
 * exercises are looked up first, then the user's plan allowance is
 * checked, then all the drafts go in as one atomic batch. So a failure
 * never leaves half a week behind.
 *
 * Throws AiWorkoutPlanError, with a message safe to show as-is, when the
 * exercise library cannot be reached, none of the exercises match, the
 * user has no room for the drafts, or the write fails.
 */
export async function saveAiPlansAsDrafts(plan: AiWorkoutPlan): Promise<SaveAiDraftsResult> {
  const allExercises = plan.plans.flatMap((session) => session.exercises);

  let matches: (MatchCandidate | null)[];
  try {
    matches = await resolveExercises(allExercises, searchLibrary);
  } catch {
    throw new AiWorkoutPlanError('Could not look up the exercises. Check your connection and try again.');
  }

  // `matches` is in the same order as `allExercises`, so walk it with a
  // cursor while rebuilding each plan's own list.
  let cursor = 0;
  const inputs: ReturnType<typeof toDraftPlanInput>[] = [];
  const details: Omit<SavedAiDraft, 'id'>[] = [];
  const skippedPlans: string[] = [];

  for (const session of plan.plans) {
    const ids: string[] = [];
    const unmatchedExercises: string[] = [];

    for (const exercise of session.exercises) {
      const match = matches[cursor++];
      if (!match) unmatchedExercises.push(exercise.name);
      else if (!ids.includes(match.id)) ids.push(match.id);
    }

    // A draft with no exercises would just be an empty shell in the list.
    if (ids.length === 0) {
      skippedPlans.push(session.name);
      continue;
    }

    inputs.push(toDraftPlanInput(session, ids));
    details.push({
      name: session.name,
      days: session.days,
      exerciseCount: ids.length,
      unmatchedExercises,
    });
  }

  if (inputs.length === 0) {
    throw new AiWorkoutPlanError(
      'None of the suggested exercises could be found in the exercise library. Please try again.',
    );
  }

  // Drafts count toward the cap — the plan library holds every plan the
  // user owns, whatever its status.
  let existingCount: number;
  try {
    existingCount = (await fetchWorkoutPlans()).length;
  } catch {
    throw new AiWorkoutPlanError('Could not check your saved plans. Please try again.');
  }
  const room = Math.max(0, MAX_PLANS_PER_USER - existingCount);
  if (inputs.length > room) {
    throw new AiWorkoutPlanError(
      `You can keep up to ${MAX_PLANS_PER_USER} plans and have ${existingCount}. ` +
        `Delete ${inputs.length - room} to make room for the ${inputs.length} AI drafts.`,
    );
  }

  let ids: string[];
  try {
    ids = await createWorkoutPlans(inputs);
  } catch {
    throw new AiWorkoutPlanError('Could not save the drafts. Please try again.');
  }

  return {
    drafts: ids.map((id, index) => ({ id, ...details[index] })),
    skippedPlans,
  };
}

export interface GenerateAiDraftPlansResult extends SaveAiDraftsResult {
  /** What the AI proposed, before matching — for showing its summary. */
  plan: AiWorkoutPlan;
}

/**
 * The AI button's whole job in one call: generate a week from the user's
 * data, then save it as drafts.
 */
export async function generateAiDraftPlans(
  options: GenerateAiWorkoutPlanOptions = {},
): Promise<GenerateAiDraftPlansResult> {
  const plan = await generateAiWorkoutPlan(options);
  const saved = await saveAiPlansAsDrafts(plan);
  return { plan, ...saved };
}
