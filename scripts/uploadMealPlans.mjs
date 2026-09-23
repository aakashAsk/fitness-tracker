// Uploads a dummy-data JSON file into the REAL `mealPlans` Firestore
// collection via the Admin SDK. Run manually — this is not wired into
// any npm lifecycle hook.
//
// Usage:
//   GOOGLE_APPLICATION_CREDENTIALS=/path/to/serviceAccountKey.json \
//     node scripts/uploadMealPlans.mjs firebase-dummy.json
//
// Unlike seedFeatureToggles.mjs, there is no local-only guard here: the
// Admin SDK talks to whatever project the service account key belongs
// to, which is production unless FIRESTORE_EMULATOR_HOST is also set.
// Never commit the service account key — see .gitignore.
//
// Shape fix: the source JSON nests mealType/status/time inside each
// items[] entry, but MealPlanInput (src/Services/mealPlanService.ts)
// expects them on the plan itself. This lifts them from the first item
// onto the plan and strips them back out of every item before writing,
// so the written docs are real MealPlan-shaped rows the app can read.
import { readFile } from 'node:fs/promises';
import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const MEAL_PLANS_COLLECTION = 'mealPlans';

const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (!keyPath) {
  console.error(
    'Set GOOGLE_APPLICATION_CREDENTIALS to a service account key JSON before running this script.\n' +
      'This writes to the REAL Firebase project that key belongs to.',
  );
  process.exit(1);
}

const serviceAccount = JSON.parse(await readFile(keyPath, 'utf8'));
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const filePath = process.argv[2] ?? 'firebase-dummy.json';
const rows = JSON.parse(await readFile(filePath, 'utf8'));
if (!Array.isArray(rows)) {
  console.error(`${filePath} must contain a JSON array of meal-plan rows.`);
  process.exit(1);
}

/** Strips mealType/status/time off one item, leaving the fields
 * MealItem actually carries (name, quantity, unit, nutrition, …). */
function stripPlanFields(item) {
  const { mealType, status, time, ...rest } = item;
  return rest;
}

let written = 0;
let skipped = 0;
for (const row of rows) {
  const [firstItem, ...restItems] = row.items ?? [];
  if (!firstItem) {
    console.warn(`Skipping "${row.name}" (${row.createdAt}): no items.`);
    skipped += 1;
    continue;
  }

  const plan = {
    name: row.name,
    mealType: firstItem.mealType,
    status: firstItem.status,
    time: firstItem.time,
    days: row.days,
    items: [firstItem, ...restItems].map(stripPlanFields),
    userId: row.userId,
    createdAt: new Date(row.createdAt),
  };

  await db.collection(MEAL_PLANS_COLLECTION).add(plan);
  written += 1;
  console.log(`Uploaded "${plan.name}" (${plan.mealType}, ${row.createdAt})`);
}

console.log(`Done: ${written} written, ${skipped} skipped, out of ${rows.length} rows.`);
