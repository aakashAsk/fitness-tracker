// Uploads a dummy-data JSON file into the REAL `workoutPlans` Firestore
// collection via the Admin SDK. Run manually — this is not wired into
// any npm lifecycle hook.
//
// Usage:
//   GOOGLE_APPLICATION_CREDENTIALS=/path/to/serviceAccountKey.json \
//     node scripts/uploadWorkoutPlans.mjs firebase-dummy.json
//
// Same production warning as uploadMealPlans.mjs: this talks to
// whatever project the service account key belongs to. Never commit
// the key — see .gitignore.
//
// Unlike the mealPlans upload, each row here already carries its own
// `planId` — a pre-generated Firestore-looking id, not a placeholder.
// That only makes sense if a later workoutLogs dummy file is going to
// reference these same ids (exactly the planId problem the mealLogs
// upload had to work around — see uploadMealLogs.mjs). So this script
// writes each row at that EXACT document id (db.collection(...).doc(id))
// instead of letting Firestore generate one, and `planId` itself is
// stripped before writing since WorkoutPlan carries its id as the
// document id, not as a field (see workoutPlanService.ts's WorkoutPlan
// type — id/userId/createdAt sit alongside the WorkoutPlanInput fields,
// with no planId field inside the document).
import { readFile } from 'node:fs/promises';
import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const WORKOUT_PLANS_COLLECTION = 'workoutPlans';

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
  console.error(`${filePath} must contain a JSON array of workout-plan rows.`);
  process.exit(1);
}

let written = 0;
let skipped = 0;

for (const row of rows) {
  if (!row.planId) {
    console.warn(`Skipping "${row.name}": no planId.`);
    skipped += 1;
    continue;
  }

  const { planId, createdAt, ...rest } = row;
  const plan = {
    ...rest,
    createdAt: new Date(createdAt),
  };

  await db.collection(WORKOUT_PLANS_COLLECTION).doc(planId).set(plan, { merge: true });
  written += 1;
  console.log(`Uploaded "${plan.name}" -> ${planId}`);
}

console.log(`Done: ${written} written, ${skipped} skipped, out of ${rows.length} rows.`);
