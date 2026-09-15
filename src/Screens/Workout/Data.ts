import { ExerciseItem, PlanItem, TrainingDays } from './Types';

export const INITIAL_EXERCISES: ExerciseItem[] = [
  {
    id: 'ex-1',
    name: 'Bench Press (Barbell)',
    sets: 3,
    reps: '8-10 reps',
    rest: '90s rest',
    category: 'Chest',
  },
  {
    id: 'ex-2',
    name: 'Incline Dumbbell Press',
    sets: 3,
    reps: '10-12 reps',
    rest: '75s rest',
    category: 'Chest',
  },
  {
    id: 'ex-3',
    name: 'Standing Overhead Press',
    sets: 3,
    reps: '8-10 reps',
    rest: '90s rest',
    category: 'Shoulders',
  },
  {
    id: 'ex-4',
    name: 'Cable Lateral Raise',
    sets: 4,
    reps: '12-15 reps',
    rest: '60s rest',
    category: 'Shoulders',
  },
];

export const INITIAL_PLANS: PlanItem[] = [
  {
    id: 'ppl',
    title: 'Push Pull Legs',
    daysPerWeek: 3,
    scheduleDays: 'Mon · Wed · Fri',
    time: '06:30 PM',
    active: true,
    type: 'Hypertrophy Focus',
  },
  {
    id: 'ul',
    title: 'Upper / Lower Split',
    daysPerWeek: 4,
    scheduleDays: 'Mon · Tue · Thu · Fri',
    time: '07:00 AM',
    active: false,
    type: 'Strength Focus',
  },
  {
    id: 'fb',
    title: 'Full Body Hybrid',
    daysPerWeek: 3,
    scheduleDays: 'Tue · Thu · Sat',
    time: '06:00 PM',
    active: false,
    type: 'Functional Conditioning',
  },
];

export const INITIAL_TRAINING_DAYS: TrainingDays = {
  Mon: true,
  Tue: false,
  Wed: true,
  Thu: false,
  Fri: true,
  Sat: false,
  Sun: false,
};

export const EXERCISE_CATEGORY_FILTERS = [
  'All',
  'Chest',
  'Shoulders',
  'Triceps',
  'Back',
  'Legs',
] as const;

export const DURATION_OPTIONS = ['30m', '45m', '60m', '75m', '90m'] as const;

export const REMINDER_OFFSET_OPTIONS = ['10m', '15m', '30m'] as const;

export const DAY_ORDER = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

// DAY_ORDER starts on Monday for display, but Date.getDay() counts from
// Sunday — hence the separate lookup rather than indexing DAY_ORDER.
const DAY_BY_DATE_INDEX = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

/** Today's weekday key, used to preselect it when creating a new plan. */
export function todayDayKey(): (typeof DAY_BY_DATE_INDEX)[number] {
  return DAY_BY_DATE_INDEX[new Date().getDay()];
}