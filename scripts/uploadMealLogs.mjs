// Uploads a dummy-data JSON file into the REAL `mealLogs` Firestore
// collection via the Admin SDK. Run manually — this is not wired into
// any npm lifecycle hook.
//
// Usage:
//   GOOGLE_APPLICATION_CREDENTIALS=/path/to/serviceAccountKey.json \
//     node scripts/uploadMealLogs.mjs firebase-dummy.json
//
// Same production warning as uploadMealPlans.mjs: this talks to
// whatever project the service account key belongs to. Never commit
// the key — see .gitignore.
//
// planId fix: the source rows carry a single placeholder/stale planId
// per mealType (e.g. every breakfast row points at one made-up id),
// but this app's mealPlans are one document PER WEEKDAY (see
// uploadMealPlans.mjs's dummy data — a "Breakfast" plan for Fri, a
// separate one for Sat, etc. — src/Services/mealPlanService.ts's
// `days: DayKey[]`). A log's planId has to match the real plan doc
// for that row's actual weekday, or useDayMeals.ts's rowFor() can
// never find it and the log shows up "orphaned" instead of against
// its meal card. So for every (userId, mealType, weekday) this script
// looks up the matching mealPlans doc and rewrites planId/planName to
// the real ones before writing — never trusts what the JSON says.
//
// Doc id is deterministic, same as saveMealLog:
// `${userId}_${planId}_${date}` — written with the REAL planId, so it
// lands at the exact id the app itself would use if the user logged
// this meal by hand (re-running this script is therefore idempotent).
import { readFile } from 'node:fs/promises';
import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const MEAL_PLANS_COLLECTION = 'mealPlans';
const MEAL_LOGS_COLLECTION = 'mealLogs';
const WEEKDAY_BY_INDEX = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

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
  console.error(`${filePath} must contain a JSON array of meal-log rows.`);
  process.exit(1);
}

/** "YYYY-MM-DD" -> weekday abbreviation, built from date parts (not
 * `new Date(dateString)`, which parses as UTC midnight and can land on
 * the wrong local weekday). */
function weekdayOf(dateKey) {
  const [year, month, day] = dateKey.split('-').map(Number);
  return WEEKDAY_BY_INDEX[new Date(year, month - 1, day).getDay()];
}

/** (mealType, weekday) -> { id, name } for one user's real mealPlans docs. */
async function loadPlanLookup(userId) {
  const snapshot = await db
    .collection(MEAL_PLANS_COLLECTION)
    .where('userId', '==', userId)
    .get();
  const lookup = new Map();
  for (const doc of snapshot.docs) {
    const plan = doc.data();
    for (const weekday of plan.days ?? []) {
      lookup.set(`${plan.mealType}::${weekday}`, { id: doc.id, name: plan.name });
    }
  }
  return lookup;
}

const planLookupByUser = new Map();
let written = 0;
let skipped = 0;

for (const row of rows) {
  if (!planLookupByUser.has(row.userId)) {
    planLookupByUser.set(row.userId, await loadPlanLookup(row.userId));
  }
  const lookup = planLookupByUser.get(row.userId);
  const weekday = weekdayOf(row.date);
  const plan = lookup.get(`${row.mealType}::${weekday}`);

  if (!plan) {
    console.warn(
      `Skipping ${row.date} (${weekday}) ${row.mealType}: no matching mealPlans doc for user ${row.userId}.`,
    );
    skipped += 1;
    continue;
  }

  const log = {
    date: row.date,
    items: row.items,
    mealType: row.mealType,
    planId: plan.id,
    planName: plan.name,
    state: row.state,
    time: row.time,
    userId: row.userId,
    updatedAt: new Date(row.updatedAt),
  };

  const docId = `${row.userId}_${plan.id}_${row.date}`;
  await db.collection(MEAL_LOGS_COLLECTION).doc(docId).set(log, { merge: true });
  written += 1;
  console.log(`Uploaded ${row.date} (${weekday}) ${row.mealType} -> plan ${plan.id}`);
}

console.log(`Done: ${written} written, ${skipped} skipped, out of ${rows.length} rows.`);
