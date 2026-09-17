// Estimates nutrition for each food item in a meal, via OpenRouter.
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
//   prompt 129 + output ~280 = ~410 tokens
//
//  - INPUT: one numbered line per item, "1. 80 g oats". The numbering
//    is what the alignment rule below refers to.
//  - OUTPUT: an array of seven numbers per item, shape-locked by a
//    response schema — no prose, no names echoed back, no totals.
import { generateJson, isOpenRouterConfigured } from './openRouterService';
import type { MealItem, MealItemNutrition } from './mealPlanService';

/**
 * Constrains the reply during decoding: one object per food, every
 * field required. What a schema cannot express — that the array must
 * have exactly one entry per input line, in order — is the one thing
 * the prompt has to insist on.
 *
 * Note the wrapper. OpenAI-style strict structured outputs, which is
 * what OpenRouter forwards, require the ROOT to be an object, so the
 * list travels as { items: [...] } and is unwrapped below. The old
 * Gemini schema could return a bare array and used uppercase OpenAPI
 * type names ('NUMBER'); this is plain JSON Schema.
 */
const NUMBER = { type: 'number' } as const;

// Only the four tracked figures, plus confidence. Every field here is
// asked for on every call, so this list IS the token budget.
const ITEM_FIELDS = {
  calories: NUMBER,
  protein: NUMBER,
  carbs: NUMBER,
  fat: NUMBER,
  fiber: NUMBER,
  sugar: NUMBER,
  confidence: NUMBER,
} as const;

const ITEM_SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: ITEM_FIELDS,
        // strict mode rejects a schema that omits either of these.
        required: Object.keys(ITEM_FIELDS),
        additionalProperties: false,
      },
    },
  },
  required: ['items'],
  additionalProperties: false,
} as const;

const SYSTEM = [
  'For EACH numbered food, estimate its nutrition at the stated quantity using standard food-composition values (USDA-equivalent per 100g).',
  'Return one array entry per input line, in the same order, same count. Do not merge or split lines.',
  'No quantity given means one typical serving.',
  // Without this the model reads a bare 'rice' as raw grain (365 kcal)
  // rather than the cooked food someone actually ate (130 kcal) — a
  // 2.8x overestimate on every staple. Soya chunks swing 3.5x the same
  // way. People log what is on the plate, so that is the default.
  'Assume the food is in the state it is EATEN — cooked, boiled, soaked or otherwise prepared — and that any weight given is the prepared weight. Use dry or raw values only when the entry explicitly says dry, raw or uncooked.',
  // The rule above alone was not enough for pulses: bare "chana dal"
  // and "rajma" still came back at their DRY values (360 and 333 kcal
  // per 100g) instead of cooked (~160 and ~127) — a 2.3-2.6x
  // overestimate on two staples of this app's audience. Naming the
  // category and giving anchors is what actually moved it.
  'This applies especially to pulses and legumes — dal, chana dal, moong, masoor, rajma, chole, chickpeas, lentils, beans — which absorb water and roughly triple in weight. Cooked they are about 120-170 kcal per 100g, NOT the 330-360 kcal per 100g of the dry grain. Same for rice, pasta and other grains.',
  'Calories as a whole number in kcal. Protein, carbs, fat, fiber and sugar in grams, to one decimal place — do NOT round to whole grams, small values like 0.4 matter.',
  'confidence: 0.9 named food with weight, 0.5 vague, 0.3 guess.',
  'Scale to the stated quantity — 150 g of a food is 1.5x its per-100g values, not the per-100g values.',
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
function toSafe(value: unknown, max: number, decimals = 1): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  const factor = 10 ** decimals;
  return Math.round(Math.min(parsed, max) * factor) / factor;
}

/** Per-item ceilings — sanity bounds, not nutrition science. They exist
 * so a hallucinated figure cannot reach the UI or the database. */
function toNutrition(raw: Partial<MealItemNutrition>): MealItemNutrition {
  return {
    // Calories are whole; a tenth of a kcal is noise.
    calories: toSafe(raw.calories, 5000, 0),
    protein: toSafe(raw.protein, 500),
    carbs: toSafe(raw.carbs, 500),
    fat: toSafe(raw.fat, 500),
    fiber: toSafe(raw.fiber, 200),
    sugar: toSafe(raw.sugar, 500),
    confidence: Math.min(Math.max(Number(raw.confidence) || 0, 0), 1),
    estimatedAt: new Date().toISOString(),
  };
}

/**
 * Returns the items with `nutrition` attached to each, or the items
 * unchanged when there is nothing to estimate or OpenRouter is not
 * configured.
 *
 * Unchanged rather than thrown: this runs after a successful save, and
 * a meal whose figures are missing is still a usable meal.
 */
export async function estimateItemNutrition(
  items: MealItem[],
  signal?: AbortSignal,
): Promise<MealItem[]> {
  if (!isOpenRouterConfigured()) {
    // The single most likely reason nothing appears in Firestore, and
    // it used to fail completely silently.
    console.warn(
      '[nutrition] skipped — no EXPO_PUBLIC_OPENROUTER_API_KEY in .env. ' +
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

  const reply = await generateJson<{ items?: Partial<MealItemNutrition>[] }>(
    describeForPrompt(named),
    {
      system: SYSTEM,
      // Near-deterministic: the same food should not come back with
      // different calories each time a meal is saved.
      temperature: 0.1,
      // Roughly 80 tokens per item, plus room for the array syntax.
      maxOutputTokens: Math.min(110 * named.length + 100, 2000),
      schema: ITEM_SCHEMA as unknown as Record<string, unknown>,
      schemaName: 'item_nutrition',
      signal,
    },
  );

  // Unwrapped here rather than in the service: the { items: [...] }
  // envelope exists only to satisfy strict mode's object-root rule, and
  // the rest of this file thinks in terms of a plain list.
  const estimates = reply?.items;

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
