// Fixed achievement checks, run against numbers the caller already has —
// no new Firestore fields, no "seen/unseen" state to persist. A milestone
// is either reached or it isn't; the UI decides how to present that
// (e.g. only calling out ones reached in the last few days).
//
// Pure — every input is a plain number or count the dashboard's other
// utilities already produce.
export interface Milestone {
  id: string;
  title: string;
  description: string;
  achieved: boolean;
}

export interface MilestoneInput {
  totalWorkoutsLogged: number;
  currentStreak: number;
  /** True when at least one PR was set in the window the caller
   * considers "recent" (see streakService.detectPersonalRecords). */
  hasRecentPersonalRecord: boolean;
  weeklyStepsTotal: number;
}

const WEEKLY_STEPS_MILESTONE = 100_000;
const STREAK_MILESTONE_DAYS = 30;
const FIRST_WORKOUTS_MILESTONE = 10;

/** The fixed milestone list, each checked against the input. Order is
 * display order, not achievement order. */
export function evaluateMilestones(input: MilestoneInput): Milestone[] {
  return [
    {
      id: 'first-10-workouts',
      title: 'First 10 Workouts',
      description: 'Logged your first 10 training sessions.',
      achieved: input.totalWorkoutsLogged >= FIRST_WORKOUTS_MILESTONE,
    },
    {
      id: 'thirty-day-streak',
      title: '30-Day Streak',
      description: 'Trained 30 days in a row.',
      achieved: input.currentStreak >= STREAK_MILESTONE_DAYS,
    },
    {
      id: 'new-personal-record',
      title: 'New Personal Record',
      description: 'Beat your own best on an exercise.',
      achieved: input.hasRecentPersonalRecord,
    },
    {
      id: 'hundred-k-steps-week',
      title: '100k Steps in a Week',
      description: 'Walked 100,000 steps across seven days.',
      achieved: input.weeklyStepsTotal >= WEEKLY_STEPS_MILESTONE,
    },
  ];
}

/** Only the ones actually reached — what a "recently achieved" rail
 * would map over. */
export function achievedMilestones(input: MilestoneInput): Milestone[] {
  return evaluateMilestones(input).filter((milestone) => milestone.achieved);
}

/** An AI (or any) insight card's shape — kept here so both the milestone
 * rail and the insights card can import one type, matching the spec's
 * request for a component that "accepts an array of insights". */
export interface Insight {
  id: string;
  headline: string;
  detail: string;
}
