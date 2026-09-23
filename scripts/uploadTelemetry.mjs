// Uploads a dummy-data JSON file into the REAL `telemetry` Firestore
// collection via the Admin SDK. Run manually — this is not wired into
// any npm lifecycle hook.
//
// Usage:
//   GOOGLE_APPLICATION_CREDENTIALS=/path/to/serviceAccountKey.json \
//     node scripts/uploadTelemetry.mjs firebase-dummy.json
//
// Same production warning as uploadMealPlans.mjs: this talks to
// whatever project the service account key belongs to. Never commit
// the key — see .gitignore.
//
// No shape fixup needed here (unlike mealPlans/mealLogs) — each row
// already matches TelemetryDay exactly (src/Services/telemetryShape.ts).
// Doc id is deterministic: `${userId}_${date}` (telemetryDocId), same
// scheme the app itself writes at.
import { readFile } from 'node:fs/promises';
import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const TELEMETRY_COLLECTION = 'telemetry';

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
  console.error(`${filePath} must contain a JSON array of telemetry rows.`);
  process.exit(1);
}

let written = 0;

for (const row of rows) {
  const { updatedAt, ...rest } = row;
  const day = {
    ...rest,
    updatedAt: new Date(updatedAt),
  };

  const docId = `${row.userId}_${row.date}`;
  await db.collection(TELEMETRY_COLLECTION).doc(docId).set(day, { merge: true });
  written += 1;
  console.log(`Uploaded ${row.date} -> ${docId} (${row.steps} steps, ${row.caloriesBurned} kcal)`);
}

console.log(`Done: ${written} written, out of ${rows.length} rows.`);
