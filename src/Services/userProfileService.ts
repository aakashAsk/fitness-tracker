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
import { nextLoginStreak } from './streakService.ts';
import { toDateKey } from './dateRange.ts';

const PROFILE_COLLECTION = 'userProfiles';

export type Gender = 'male' | 'female' | 'other';

/**
 * 'weight-loss' and 'weight-gain' are the plain, general-purpose
 * versions of 'fat-loss' and 'hypertrophy' — a deficit/surplus without
 * the lean-mass-preservation or muscle-building emphasis those carry.
 * 'hypertrophy' is kept (not offered as a fresh choice in GoalStep, but
 * still valid) so an existing profile that already picked it keeps
 * working exactly as before.
 */
export type FitnessGoal =
  | 'weight-loss'
  | 'weight-gain'
  | 'hypertrophy'
  | 'fat-loss'
  | 'endurance'
  | 'maintenance';

export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'very_active';

/** The main challenge the user wants help overcoming, asked right after the goal. */
export type Obstacle =
  | 'consistency'
  | 'eating-habits'
  | 'support'
  | 'busy-schedule'
  | 'meal-inspiration';

/** Target weekly weight change, in kg. */
export type WeeklyPace = 0.25 | 0.5 | 0.75;

/** The answers the user actually gave, before anything is derived. */
export interface ProfileAnswers {
  /**
   * What the user asked to be called. Collected as the first onboarding
   * step, because the dashboard greets by name and the email local-part
   * is a poor stand-in for one.
   */
  displayName: string;
  /**
   * Digits as typed, or '' when skipped. Stored unverified — there is no
   * OTP check on it yet, so nothing may treat it as a proven contact.
   */
  phoneNumber: string;
  gender: Gender;
  /** Years. Kept alongside birthDate rather than derived from it on every
   * read: birthDate is null for any profile saved before this field
   * existed, and age is the number every formula and screen already
   * reads. */
  age: number;
  /** "YYYY-MM-DD", or null for a profile saved before this field existed
   * (or one that answered by age directly, since birthDate is optional
   * nowhere but the onboarding step that collects it). Source of truth
   * for `age` going forward — see BodyMetricsStep, which derives age
   * from this and writes both. */
  birthDate: string | null;
  heightCm: number;
  weightKg: number;
  /** What the user is aiming for — drives progress bars against current weight. */
  targetWeightKg: number;
  goal: FitnessGoal;
  /** Main challenge the user picked when asked what gets in their way. */
  obstacle: Obstacle;
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
  /** Consecutive days, ending today, the user has opened the app.
   * 0 for a profile that predates this field. */
  loginStreak: number;
  /** "YYYY-MM-DD" the streak was last bumped, or null before this
   * field existed. Local calendar date, same key the workout streak
   * uses — see recordDailyLogin. */
  lastLoginDate: string | null;
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
  // Highest of the six: protein is what protects lean mass while in a
  // deficit.
  'fat-loss': 2.2,
  // A plainer deficit than fat-loss — still enough protein to protect
  // lean mass, just not the specialised cut target.
  'weight-loss': 1.8,
  // A plainer surplus than hypertrophy — general weight gain, not a
  // muscle-building program, so less protein is asked for.
  'weight-gain': 1.6,
  endurance: 1.6,
  maintenance: 1.6,
};

/** Share of total calories coming from fat, by goal. */
const FAT_CALORIE_SHARE: Record<FitnessGoal, number> = {
  hypertrophy: 0.25,
  'fat-loss': 0.3,
  'weight-loss': 0.3,
  // Slightly higher than hypertrophy's — a plain weight-gain target
  // leaves more of the surplus flexible rather than steering it all to
  // carbs for training fuel.
  'weight-gain': 0.3,
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

/** Midpoint of the WHO "healthy weight" BMI band (18.5-24.9), used below
 * as the one number to build a suggested target weight from. */
const HEALTHY_BMI_MIDPOINT = 21.7;

/**
 * A starting-point target weight, from height alone — BMI * height²,
 * at the middle of the healthy range.
 *
 * This is a population-level estimate, not a personal one: it knows
 * nothing about frame size, muscle mass or the user's own goal, which is
 * exactly why onboarding pre-fills it rather than requiring it — a
 * number to adjust from, not a prescription. Rounded to the nearest
 * 0.5 kg to match the target-weight stepper's own step size.
 */
export function estimateHealthyWeightKg(heightCm: number): number {
  const heightM = heightCm / 100;
  const raw = HEALTHY_BMI_MIDPOINT * heightM * heightM;
  return Math.round(raw * 2) / 2;
}

export function calculateTdee(bmr: number, activityLevel: ActivityLevel): number {
  return Math.round(bmr * ACTIVITY_MULTIPLIER[activityLevel]);
}

/**
 * The daily intake target. Fat loss and plain weight loss subtract the
 * pace deficit; hypertrophy adds a 15% surplus and plain weight gain a
 * 10% one; endurance and maintenance eat at maintenance.
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
    case 'weight-loss':
      return Math.max(1200, tdee - (PACE_CALORIE_DELTA[weeklyPaceKg] ?? 500));
    case 'hypertrophy':
      return Math.round(tdee * 1.15);
    // A plainer, smaller surplus than hypertrophy's 15% — general weight
    // gain rather than a muscle-building program.
    case 'weight-gain':
      return Math.round(tdee * 1.1);
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
    // Empty on every profile written before the name step shipped —
    // callers fall back rather than showing a blank greeting.
    displayName: ((data.displayName as string) ?? '').trim(),
    phoneNumber: ((data.phoneNumber as string) ?? '').trim(),
    gender: (data.gender as Gender) ?? 'other',
    age: Number(data.age) || 0,
    birthDate: (data.birthDate as string) || null,
    heightCm: Number(data.heightCm) || 0,
    weightKg: Number(data.weightKg) || 0,
    // Falls back to current weight for profiles written before this field
    // existed, so a progress bar against it starts at 0% rather than NaN.
    targetWeightKg: Number(data.targetWeightKg) || Number(data.weightKg) || 0,
    goal: (data.goal as FitnessGoal) ?? 'maintenance',
    obstacle: (data.obstacle as Obstacle) ?? 'consistency',
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
    loginStreak: Number(data.loginStreak) || 0,
    lastLoginDate: (data.lastLoginDate as string) ?? null,
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
    // Trimmed here rather than trusted from the form, so a stray space
    // can never reach the greeting as part of the name.
    displayName: answers.displayName.trim(),
    phoneNumber: answers.phoneNumber.trim(),
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
    displayName: payload.displayName,
    phoneNumber: payload.phoneNumber,
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
    // Onboarding does not touch the login streak — recordDailyLogin
    // bumps it separately, right after this profile is loaded.
    loginStreak: 0,
    lastLoginDate: null,
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
 * Bumps the login streak for today, once per day.
 *
 * Reads the doc first rather than blind-writing, since the new value
 * depends on the old one (nextLoginStreak). Safe to call every time the
 * app opens: a second call the same day reads back the same streak and
 * skips the write, so there is no double-count and no wasted write for
 * a user who force-quits and reopens the app.
 *
 * Returns the current streak either way, so the caller always has a
 * number to show even for a profile that does not exist yet (a signed-in
 * user who has not finished onboarding).
 */
export async function recordDailyLogin(
  userId?: string,
): Promise<{ loginStreak: number; lastLoginDate: string }> {
  const uid = userId ?? getCurrentUserId();
  const todayKey = toDateKey(new Date());

  try {
    const ref = doc(db, PROFILE_COLLECTION, uid);
    const snapshot = await getDoc(ref);
    const data = snapshot.exists() ? (snapshot.data() as Record<string, unknown>) : {};

    const previousStreak = Number(data.loginStreak) || 0;
    const lastLoginDate = (data.lastLoginDate as string) ?? null;
    const loginStreak = nextLoginStreak(previousStreak, lastLoginDate, new Date());

    if (lastLoginDate === todayKey) {
      return { loginStreak, lastLoginDate: todayKey };
    }

    await setDoc(
      ref,
      { loginStreak, lastLoginDate: todayKey, userId: uid, updatedAt: serverTimestamp() },
      { merge: true },
    );

    return { loginStreak, lastLoginDate: todayKey };
  } catch (error) {
    throw new UserProfileServiceError(
      `Could not update your login streak: ${(error as Error).message}`,
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
