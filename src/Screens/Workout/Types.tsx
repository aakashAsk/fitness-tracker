export interface ExerciseItem {
  id: string;
  name: string;
  sets: number;
  reps: string;
  rest: string;
  category: 'Chest' | 'Shoulders' | 'Triceps' | 'Back' | 'Legs' | 'Core';
}

export interface PlanItem {
  id: string;
  title: string;
  daysPerWeek: number;
  scheduleDays: string;
  time: string;
  active: boolean;
  type: string;
}

export type NavTab = 'home' | 'workout' | 'nutrition' | 'progress' | 'profile';

export type DayKey = 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun';

export type TrainingDays = Record<DayKey, boolean>;