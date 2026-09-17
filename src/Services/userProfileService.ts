// Firestore-backed onboarding profile — one document per user, keyed by
// the Firebase uid itself rather than an auto-id. The app asks "has this
// user onboarded?" on every cold start, and a deterministic id turns
// that into a single getDoc() instead of a query.
//
// This is the only place the derived numbers (BMR, TDEE, calorie target,
// macro split) are computed. They are stored alongside the raw answers
// on purpose: the raw answers are what the user edits later, the derived
// values are what the dashboard reads, and recomputing them on every
// read would mean every screen carrying a copy of the formula.
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../Firebase/firebaseConfig';
import { getCurrentUserId } from './userService';
import type { ThemeMode } from '../Theme/colors';

const PROFILE_COLLECTION = 'userProfiles';

export type Gender = 'male' | 'female' | 'other';

export type FitnessGoal = 'hypertrophy' | 'fat-loss' | 'endurance' | 'maintenance';

export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'very_active';

/** Target weekly weight change, in kg. */
export type WeeklyPace = 0.25 | 0.5 | 0.75;

/** The answers the user actually gave, before anything is derived. */
export interface ProfileAnswers {
  gender: Gender;
  /** Years. */
  age: number;
  heightCm: number;
  weightKg: number;
  goal: FitnessGoal;
  activityLevel: ActivityLevel;
  weeklyPaceKg: WeeklyPace;
  /** Free-form area labels, e.g. ['Knees']. Empty means injury-free. */
  injuries: string[];
  /** e.g. ['Gluten-Free']. Empty means no restrictions. */
  dietaryPreferences: string[];
}

export interface MacroTargets {
  /** Grams per day. */
  proteinG: number;
  carbsG: number;
  fatsG: number;
}

/** Everything the formulas produce from the answers above. */
export interface DerivedTargets {
  /** Basal metabolic rate, kcal/day. */
  bmr: number;
  /** Total daily energy expenditure, kcal/day. */
  tdee: number;
  /** What the user should actually eat, kcal/day. */
  dailyCalorieTarget: number;
  macros: MacroTargets;
}

export interface UserProfile extends ProfileAnswers, DerivedTargets {
  userId: string;
  /**
   * Firebase Storage download URL for the profile picture, or null
   * when the user has not set one. Not part of ProfileAnswers: it is
   * set from the Profile tab, never asked for during onboarding.
   */
  photoURL: string | null;
  /**
   * Chosen display theme. Absent on every profile written before the
   * dark-mode switch shipped, which is why it reads as 'light' below —
   * an existing user is not silently flipped into dark.
   */
  themeMode: ThemeMode;
  /** True once step 3 has been saved. */
  onboardingCompleted: boolean;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export class UserProfileServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UserProfileServiceError';
  }
}

// ── Formulas ─────────────────────────────────────────────────────────

/** Mifflin-St Jeor's per-gender constant. */
const GENDER_BMR_OFFSET: Record<Gender, number> = {
  male: 5,
  female: -161,
  // Midpoint of the two — the offsets above stand in for average lean
  // mass, and there is no published constant for a third option.
  other: -78,
};

const ACTIVITY_MULTIPLIER: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  very_active: 1.725,
};

/** kcal/day to add or remove for each supported weekly pace. */
const PACE_CALORIE_DELTA: Record<number, number> = {
  0.25: 250,
  0.5: 500,
  0.75: 750,
};

/** Protein, grams per kg of bodyweight, by goal. */
const PROTEIN_PER_KG: Record<FitnessGoal, number> = {
  hypertrophy: 2.0,
  // Highest of the four: protein is what protects lean mass while in a
  // deficit.
  'fat-loss': 2.2,
  endurance: 1.6,
  maintenance: 1.6,
};

/** Share of total calories coming from fat, by goal. */
const FAT_CALORIE_SHARE: Record<FitnessGoal, number> = {
  hypertrophy: 0.25,
  'fat-loss': 0.3,
  // Lower, so more of the budget is left for the carbohydrate that
  // actually fuels long sessions.
  endurance: 0.22,
  maintenance: 0.28,
};

/** Mifflin-St Jeor. */
export function calculateBmr(
  answers: Pick<ProfileAnswers, 'gender' | 'age' | 'heightCm' | 'weightKg'>,
): number {
  const { gender, age, heightCm, weightKg } = answers;
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  return Math.round(base + GENDER_BMR_OFFSET[gender]);
}

export function calculateTdee(bmr: number, activityLevel: ActivityLevel): number {
  return Math.round(bmr * ACTIVITY_MULTIPLIER[activityLevel]);
}

/**
 * The daily intake target. Fat loss subtracts the pace deficit;
 * hypertrophy adds a 15% surplus; endurance and maintenance eat at
 * maintenance.
 *
 * Floored at 1200 kcal — below that a target stops being a plan and
 * starts being a medical question, and the pace slider can otherwise
 * push a small, sedentary user there.
 */
export function calculateCalorieTarget(
  tdee: number,
  goal: FitnessGoal,
  weeklyPaceKg: WeeklyPace,
): number {
  switch (goal) {
    case 'fat-loss':
      return Math.max(1200, tdee - (PACE_CALORIE_DELTA[weeklyPaceKg] ?? 500));
    case 'hypertrophy':
      return Math.round(tdee * 1.15);
    default:
      return tdee;
  }
}

export function calculateMacros(
  calorieTarget: number,
  goal: FitnessGoal,
  weightKg: number,
): MacroTargets {
  const proteinG = Math.round(PROTEIN_PER_KG[goal] * weightKg);
  const fatsG = Math.round((calorieTarget * FAT_CALORIE_SHARE[goal]) / 9);

  // Carbs take whatever calories are left. With a high protein target
  // and a deep deficit that remainder can go negative, which would
  // render as a nonsense "-40 g" on the dashboard.
  const remainingCalories = calorieTarget - proteinG * 4 - fatsG * 9;
  const carbsG = Math.max(0, Math.round(remainingCalories / 4));

  return { proteinG, carbsG, fatsG };
}

/** Runs the whole chain — the only entry point screens should need. */
export function deriveTargets(answers: ProfileAnswers): DerivedTargets {
  const bmr = calculateBmr(answers);
  const tdee = calculateTdee(bmr, answers.activityLevel);
  const dailyCalorieTarget = calculateCalorieTarget(tdee, answers.goal, answers.weeklyPaceKg);
  const macros = calculateMacros(dailyCalorieTarget, answers.goal, answers.weightKg);

  return { bmr, tdee, dailyCalorieTarget, macros };
}

// ── Firestore ────────────────────────────────────────────────────────

function toUserProfile(userId: string, data: Record<string, unknown>): UserProfile {
  const macros = (data.macros ?? {}) as Record<string, unknown>;

  return {
    userId: (data.userId as string) ?? userId,
    gender: (data.gender as Gender) ?? 'other',
    age: Number(data.age) || 0,
    heightCm: Number(data.heightCm) || 0,
    weightKg: Number(data.weightKg) || 0,
    goal: (data.goal as FitnessGoal) ?? 'maintenance',
    activityLevel: (data.activityLevel as ActivityLevel) ?? 'moderate',
    weeklyPaceKg: (Number(data.weeklyPaceKg) || 0.5) as WeeklyPace,
    injuries: ((data.injuries as unknown[]) ?? []).map(String),
    dietaryPreferences: ((data.dietaryPreferences as unknown[]) ?? []).map(String),
    bmr: Number(data.bmr) || 0,
    tdee: Number(data.tdee) || 0,
    dailyCalorieTarget: Number(data.dailyCalorieTarget) || 0,
    macros: {
      proteinG: Number(macros.proteinG) || 0,
      carbsG: Number(macros.carbsG) || 0,
      fatsG: Number(macros.fatsG) || 0,
    },
    photoURL: (data.photoURL as string) || null,
    themeMode: data.themeMode === 'dark' ? 'dark' : 'light',
    onboardingCompleted: data.onboardingCompleted === true,
    createdAt: (data.createdAt as { toDate?: () => Date })?.toDate?.() ?? null,
    updatedAt: (data.updatedAt as { toDate?: () => Date })?.toDate?.() ?? null,
  };
}

/** Null when the user has never been through onboarding. */
export async function fetchUserProfile(userId?: string): Promise<UserProfile | null> {
  const uid = userId ?? getCurrentUserId();

  try {
    const snapshot = await getDoc(doc(db, PROFILE_COLLECTION, uid));
    if (!snapshot.exists()) return null;
    return toUserProfile(uid, snapshot.data() as Record<string, unknown>);
  } catch (error) {
    throw new UserProfileServiceError(
      `Could not load your profile: ${(error as Error).message}`,
    );
  }
}

/**
 * Writes the completed onboarding answers plus everything derived from
 * them, and marks the user as onboarded.
 *
 * merge: true so a later edit of, say, weight alone does not wipe
 * createdAt — which is written only when the document is new.
 */
export async function saveUserProfile(
  answers: ProfileAnswers,
  userId?: string,
): Promise<UserProfile> {
  const uid = userId ?? getCurrentUserId();
  const derived = deriveTargets(answers);

  const payload = {
    ...answers,
    ...derived,
    userId: uid,
    onboardingCompleted: true,
    updatedAt: serverTimestamp(),
  };

  try {
    const ref = doc(db, PROFILE_COLLECTION, uid);
    const existing = await getDoc(ref);

    await setDoc(
      ref,
      existing.exists() ? payload : { ...payload, createdAt: serverTimestamp() },
      { merge: true },
    );
  } catch (error) {
    throw new UserProfileServiceError(
      `Could not save your profile: ${(error as Error).message}`,
    );
  }

  return {
    ...answers,
    ...derived,
    userId: uid,
    // Onboarding never sets a picture; it is added later from the
    // Profile tab via saveUserPhotoUrl.
    photoURL: null,
    // Same story for the theme — onboarding does not ask, so a new
    // profile starts on light and Settings changes it from there.
    themeMode: 'light',
    onboardingCompleted: true,
    // serverTimestamp() resolves on the server, so these are sentinels
    // rather than dates until the document is read back.
    createdAt: null,
    updatedAt: null,
  };
}

/**
 * Persists the display theme the user picked in Settings.
 *
 * A targeted merge, for the same reason as saveUserPhotoUrl below: the
 * onboarding answers are not in hand here, and rewriting them from a
 * stale copy would quietly revert an edit made elsewhere.
 */
export async function saveUserThemeMode(mode: ThemeMode, userId?: string): Promise<void> {
  const uid = userId ?? getCurrentUserId();

  try {
    await setDoc(
      doc(db, PROFILE_COLLECTION, uid),
      { themeMode: mode, userId: uid, updatedAt: serverTimestamp() },
      { merge: true },
    );
  } catch (error) {
    throw new UserProfileServiceError(
      `Could not save your theme: ${(error as Error).message}`,
    );
  }
}

/**
 * Points the profile at a newly uploaded picture.
 *
 * A targeted merge rather than a full saveUserProfile: the answers are
 * not in hand here, and rewriting them from a stale copy would quietly
 * revert an edit made elsewhere.
 */
export async function saveUserPhotoUrl(photoURL: string, userId?: string): Promise<void> {
  const uid = userId ?? getCurrentUserId();

  try {
    await setDoc(
      doc(db, PROFILE_COLLECTION, uid),
      // userId travels with every write: the security rule requires it
      // on the incoming document, and a merge that omitted it would be
      // rejected for a profile written before that field existed.
      { photoURL, userId: uid, updatedAt: serverTimestamp() },
      { merge: true },
    );
  } catch (error) {
    throw new UserProfileServiceError(
      `Could not save your picture: ${(error as Error).message}`,
    );
  }
}
