// Estimates nutrition for each food item in a meal, via Gemini.
//
// PER ITEM, not per meal. Meal and day totals are summed from these
// (sumItemNutrition) rather than asked for separately — a stored total
// would drift the moment an item was edited, removed or swapped, and
// there would be no way to tell which of the two was wrong. Summing
// also means editing one item costs one item's re-estimate, not a
// re-estimate of the whole meal.
//
// Token budget, measured on a four-item meal:
//
//   prompt 129 + output 313 = 442 tokens
//
//  - INPUT: one numbered line per item, "1. 80 g oats". The numbering
//    is what the alignment rule below refers to.
//  - OUTPUT: an array of eight numbers per item, shape-locked by a
//    response schema — no prose, no names echoed back, no totals.
import { generateJson, isGeminiConfigured } from './geminiService';
import type { MealItem, MealItemNutrition } from './mealPlanService';

/**
 * Constrains the reply during decoding: an array of objects, every
 * field required. What a schema cannot express — that the array must
 * have exactly one entry per input line, in order — is the one thing
 * the prompt has to insist on.
 */
const ITEM_SCHEMA = {
  type: 'ARRAY',
  items: {
    type: 'OBJECT',
    properties: {
      calories: { type: 'NUMBER' },
      protein: { type: 'NUMBER' },
      carbs: { type: 'NUMBER' },
      fat: { type: 'NUMBER' },
      fiber: { type: 'NUMBER' },
      sugar: { type: 'NUMBER' },
      sodium: { type: 'NUMBER' },
      confidence: { type: 'NUMBER' },
    },
    required: [
      'calories',
      'protein',
      'carbs',
      'fat',
      'fiber',
      'sugar',
      'sodium',
      'confidence',
    ],
  },
} as const;

const SYSTEM = [
  'For EACH numbered food, estimate its nutrition at the stated quantity using standard food-composition values (USDA-equivalent per 100g).',
  'Return one array entry per input line, in the same order, same count. Do not merge or split lines.',
  'No quantity given means one typical serving.',
  'Whole numbers; sodium mg, others g, calories kcal.',
  'confidence: 0.9 named food with weight, 0.5 vague, 0.3 guess.',
].join(' ');

/** "1. 80 g oats" — numbered, because the reply is matched by position. */
function describeForPrompt(items: MealItem[]): string {
  return items
    .map((item, index) => {
      const amount = [item.quantity.trim(), item.unit.trim()].filter(Boolean).join(' ');
      const name = item.name.trim();
      return `${index + 1}. ${amount ? `${amount} ${name}` : name}`;
    })
    .join('\n');
}

/** Clamps a model number into something a UI can show without checking. */
function toSafe(value: unknown, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.round(Math.min(parsed, max));
}

/** Per-item ceilings — sanity bounds, not nutrition science. They exist
 * so a hallucinated figure cannot reach the UI or the database. */
function toNutrition(raw: Partial<MealItemNutrition>): MealItemNutrition {
  return {
    calories: toSafe(raw.calories, 5000),
    protein: toSafe(raw.protein, 500),
    carbs: toSafe(raw.carbs, 500),
    fat: toSafe(raw.fat, 500),
    fiber: toSafe(raw.fiber, 200),
    sugar: toSafe(raw.sugar, 500),
    sodium: toSafe(raw.sodium, 30000),
    confidence: Math.min(Math.max(Number(raw.confidence) || 0, 0), 1),
    estimatedAt: new Date().toISOString(),
  };
}

/**
 * Returns the items with `nutrition` attached to each, or the items
 * unchanged when there is nothing to estimate or Gemini is not
 * configured.
 *
 * Unchanged rather than thrown: this runs after a successful save, and
 * a meal whose figures are missing is still a usable meal.
 */
export async function estimateItemNutrition(
  items: MealItem[],
  signal?: AbortSignal,
): Promise<MealItem[]> {
  if (!isGeminiConfigured()) {
    // The single most likely reason nothing appears in Firestore, and
    // it used to fail completely silently.
    console.warn(
      '[nutrition] skipped — no EXPO_PUBLIC_GEMINI_API_KEY in .env. ' +
        'Add it and restart Metro: env vars are inlined at bundle time, ' +
        'so a running server will not pick up a new one.',
    );
    return items;
  }

  // Unnamed rows are placeholders the user never filled in. They are
  // excluded from the prompt, so the reply's indices line up with this
  // filtered list — not with `items` — and are mapped back by identity
  // below rather than by position in the original array.
  const named = items.filter((item) => item.name.trim());
  if (named.length === 0) return items;

  const estimates = await generateJson<Partial<MealItemNutrition>[]>(
    describeForPrompt(named),
    {
      system: SYSTEM,
      // Near-deterministic: the same food should not come back with
      // different calories each time a meal is saved.
      temperature: 0.1,
      // Roughly 80 tokens per item, plus room for the array syntax.
      maxOutputTokens: Math.min(120 * named.length + 100, 2000),
      schema: ITEM_SCHEMA as unknown as Record<string, unknown>,
      signal,
    },
  );

  console.log('[nutrition] prompt items:', named.length, 'estimates:', estimates?.length);
  console.log('[nutrition] raw estimates:', JSON.stringify(estimates));

  if (!Array.isArray(estimates)) {
    console.warn('[nutrition] reply was not an array — nothing attached.');
    return items;
  }

  // A model can still return the wrong number of entries despite the
  // instruction. Matching by index only where an entry exists means a
  // short reply leaves the trailing items un-estimated rather than
  // shifting figures onto the wrong food — which would be far worse
  // than having none.
  const byItem = new Map<MealItem, MealItemNutrition>();
  named.forEach((item, index) => {
    const estimate = estimates[index];
    if (estimate) byItem.set(item, toNutrition(estimate));
  });

  const withNutrition = items.map((item) => {
    const nutrition = byItem.get(item);
    return nutrition ? { ...item, nutrition } : item;
  });

  console.log(
    '[nutrition] attached to',
    withNutrition.filter((item) => item.nutrition).length,
    'of',
    items.length,
    'items:',
    JSON.stringify(withNutrition.map((i) => ({ name: i.name, nutrition: i.nutrition }))),
  );

  return withNutrition;
}
