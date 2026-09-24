// Pure nutrition-summing logic, split out of mealPlanService so it can be
// unit-tested without importing firebaseConfig (which initializes the SDK
// at module load — see mealPlanService.ts and README's testing notes).
//
// mealPlanService re-exports everything here, so this is purely an
// internal split; nothing outside Services should need to know the
// difference.

/**
 * Nutrition for ONE food item, as eaten at its stated quantity.
 *
 * Held per item rather than per meal so it survives the meal changing:
 * remove an item and the remaining figures are still right, swap one
 * and only that one needs re-estimating. Meal and day totals are summed
 * from these — see sumItemNutrition — never stored, so a total can
 * never disagree with the items it is supposedly the sum of.
 *
 * The figures the app tracks per food — referred to as "micros"
 * throughout. Sodium was dropped deliberately: it cost tokens on every
 * estimate and nothing displayed it.
 */
export interface MealItemNutrition {
  /** kcal */
  calories: number;
  /** grams */
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  sugar: number;
  /** The model's confidence in THIS item, 0–1. Per item because one
   * vague entry should not discredit the precise ones beside it. */
  confidence: number;
  /** ISO timestamp, so a figure can be spotted as stale. */
  estimatedAt?: string;
}

/** One food in a meal — "Oats", "80", "g". */
export interface MealItem {
  name: string;
  /** Kept as a string: users type "1/2" or "2 scoops" as readily as "80". */
  quantity: string;
  /** g, ml, scoop, piece… */
  unit: string;
  /** Filled in asynchronously by the AI estimate; absent until then. */
  nutrition?: MealItemNutrition;
}

/** Grams/day. A general dietary guideline (25-38 g depending on age and
 * sex), not derived per-profile the way protein/carbs/fat are — the app
 * has no fiber formula, so this is a flat target rather than one from
 * deriveTargets. */
export const DAILY_FIBER_GOAL_G = 30;

/** Running totals across a set of items. */
export interface NutritionTotals {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  sugar: number;
  /** Lowest confidence among the items counted — a total is only as
   * trustworthy as its weakest part. */
  confidence: number;
  /** How many of the items had an estimate at all. */
  estimated: number;
  /** How many items were counted in total. */
  total: number;
}

/**
 * Reads one stored item back into a MealItem, keeping its nutrition
 * estimate. Shared by the plan and log services: a reader that drops
 * `nutrition` makes every logged meal read back as "no data".
 */
export function toMealItem(raw: unknown): MealItem {
  const entry = (raw ?? {}) as Record<string, unknown>;
  return {
    name: (entry.name as string) ?? '',
    quantity: entry.quantity == null ? '' : String(entry.quantity),
    unit: (entry.unit as string) ?? '',
    // Spread rather than assigned: an explicit `nutrition: undefined`
    // key is rejected by Firestore ("Unsupported field value") the next
    // time these items are written back.
    ...(entry.nutrition ? { nutrition: entry.nutrition as MealItemNutrition } : {}),
  };
}

/**
 * Sums whatever estimates the items carry.
 *
 * Returns null when none of them have one, so a caller can tell "no
 * data yet" from "genuinely zero calories" — a distinction a bare 0
 * throws away.
 */
export function sumItemNutrition(items: MealItem[]): NutritionTotals | null {
  const withData = items.filter((item) => item.nutrition);
  if (withData.length === 0) return null;

  const totals = withData.reduce(
    (acc, item) => {
      const n = item.nutrition!;
      return {
        calories: acc.calories + n.calories,
        protein: acc.protein + n.protein,
        carbs: acc.carbs + n.carbs,
        fat: acc.fat + n.fat,
        fiber: acc.fiber + n.fiber,
        sugar: acc.sugar + n.sugar,
        confidence: Math.min(acc.confidence, n.confidence),
      };
    },
    {
      calories: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
      fiber: 0,
      sugar: 0,
      confidence: 1,
    },
  );

  // Summed at full precision, rounded once at the end. Rounding each
  // item first and adding those made a six-item meal drift by up to
  // 3 g — the error compounded instead of cancelling.
  const round1 = (n: number) => Math.round(n * 10) / 10;

  return {
    ...totals,
    calories: Math.round(totals.calories),
    protein: round1(totals.protein),
    carbs: round1(totals.carbs),
    fat: round1(totals.fat),
    fiber: round1(totals.fiber),
    sugar: round1(totals.sugar),
    estimated: withData.length,
    total: items.length,
  };
}
