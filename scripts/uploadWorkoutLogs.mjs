// Uploads a dummy-data JSON file into the REAL `workoutLogs` Firestore
// collection via the Admin SDK. Run manually — this is not wired into
// any npm lifecycle hook.
//
// Usage:
//   GOOGLE_APPLICATION_CREDENTIALS=/path/to/serviceAccountKey.json \
//     node scripts/uploadWorkoutLogs.mjs firebase-dummy.json
//
// Same production warning as uploadMealPlans.mjs: this talks to
// whatever project the service account key belongs to. Never commit
// the key — see .gitignore.
//
// Unlike the mealLogs fixup, this dummy data's planId values already
// match real workoutPlans docs (uploadWorkoutPlans.mjs wrote them at
// those exact ids) — no lookup needed there.
//
// What this script adds that the JSON doesn't have: `stats`
// (caloriesBurned, volume, recovery, …). The app computes that at log
// time from each exercise's Free Exercise DB metadata (mechanic,
// muscles) plus the user's body weight — see estimateWorkoutStats in
// src/Services/workoutStats.ts. A seed script bypasses that code path
// entirely, so without this step every historical workout here would
// silently carry zero burned calories, which would hollow out the
// dashboard's Net Calories chart for this whole date range (see
// useNetCalories.ts — it reads workoutLog.stats.caloriesBurned).
// estimateStats() below is a straight port of that same formula
// (STATS_VERSION 1) — it has no Firestore/React dependency in the
// source either, but importing a .ts file from a plain .mjs script
// isn't worth the tooling for a one-off seed. If workoutStats.ts's
// formula changes, this copy needs to change with it.
import { readFile } from 'node:fs/promises';
import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const WORKOUT_LOGS_COLLECTION = 'workoutLogs';
const EXERCISE_API_BASE_URL =
  process.env.EXPO_PUBLIC_EXERCISE_API_BASE_URL ?? 'https://exercise-db-pi.vercel.app';

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
  console.error(`${filePath} must contain a JSON array of workout-log rows.`);
  process.exit(1);
}

// ---- stats formula, ported from src/Services/workoutStats.ts ----
const STATS_VERSION = 1;
const DEFAULT_WEIGHT_KG = 70;
const KCAL_PER_GRAM_FAT = 7.7;
const SECONDS_PER_REP = 3;
const REPS_FOR_UNCOUNTED_SET = 10;
const REST_SECONDS_COMPOUND = 90;
const REST_SECONDS_OTHER = 60;
const MET_MIN = 3.5;
const MET_MAX = 6.0;
const LARGE_MUSCLES = new Set([
  'chest', 'lats', 'middle back', 'lower back', 'quadriceps', 'hamstrings', 'glutes',
]);
const RECOVERY = {
  large: { baseHours: 48, perExtraSet: 4 },
  small: { baseHours: 36, perExtraSet: 3 },
  freeSets: 3,
  minHours: 24,
  maxHours: 96,
  minEffectiveSets: 2,
  secondarySetWeight: 0.5,
  heavyAvgReps: 5,
  lightAvgReps: 15,
  heavyFactor: 1.15,
  lightFactor: 0.9,
  unknownHours: 48,
};

function isPerformed(set) {
  return set.reps > 0 || set.weight > 0;
}

function recoveryHoursFor(muscle, effectiveSets) {
  const tier = LARGE_MUSCLES.has(muscle) ? RECOVERY.large : RECOVERY.small;
  const extra = Math.max(0, effectiveSets - RECOVERY.freeSets);
  return tier.baseHours + extra * tier.perExtraSet;
}

/** exercises: [{ sets: [{reps, weight}], meta: {primaryMuscles, secondaryMuscles, mechanic, category} | null }] */
function estimateStats({ exercises, bodyWeightKg }) {
  const weightKg = bodyWeightKg && bodyWeightKg > 0 ? bodyWeightKg : DEFAULT_WEIGHT_KG;

  let volume = 0, totalSets = 0, totalReps = 0, compoundSets = 0, seconds = 0;
  let weightedSets = 0, weightedReps = 0;
  const effectiveSetsByMuscle = new Map();

  for (const exercise of exercises) {
    if (exercise.meta?.category === 'stretching') continue;
    const isCompound = exercise.meta?.mechanic === 'compound';
    const performed = exercise.sets.filter(isPerformed);

    for (const set of performed) {
      volume += set.reps * set.weight;
      totalSets += 1;
      totalReps += set.reps;
      if (isCompound) compoundSets += 1;
      if (set.weight > 0) {
        weightedSets += 1;
        weightedReps += set.reps;
      }
      seconds +=
        (set.reps > 0 ? set.reps : REPS_FOR_UNCOUNTED_SET) * SECONDS_PER_REP +
        (isCompound ? REST_SECONDS_COMPOUND : REST_SECONDS_OTHER);
    }

    if (performed.length === 0 || !exercise.meta) continue;
    for (const muscle of exercise.meta.primaryMuscles ?? []) {
      const key = muscle.trim().toLowerCase();
      effectiveSetsByMuscle.set(key, (effectiveSetsByMuscle.get(key) ?? 0) + performed.length);
    }
    for (const muscle of exercise.meta.secondaryMuscles ?? []) {
      const key = muscle.trim().toLowerCase();
      effectiveSetsByMuscle.set(
        key,
        (effectiveSetsByMuscle.get(key) ?? 0) + performed.length * RECOVERY.secondarySetWeight,
      );
    }
  }

  if (totalSets === 0) return null;

  const met = MET_MIN + (MET_MAX - MET_MIN) * (compoundSets / totalSets);
  const hours = seconds / 3600;
  const caloriesBurned = Math.round((met - 1) * weightKg * hours);

  const avgWeightedReps = weightedSets > 0 ? weightedReps / weightedSets : null;
  const intensityFactor =
    avgWeightedReps === null
      ? 1
      : avgWeightedReps <= RECOVERY.heavyAvgReps
        ? RECOVERY.heavyFactor
        : avgWeightedReps >= RECOVERY.lightAvgReps
          ? RECOVERY.lightFactor
          : 1;

  const muscles = [];
  effectiveSetsByMuscle.forEach((effectiveSets, muscle) => {
    if (effectiveSets < RECOVERY.minEffectiveSets) return;
    const hoursNeeded = recoveryHoursFor(muscle, effectiveSets) * intensityFactor;
    muscles.push({
      muscle,
      hours: Math.round(Math.min(RECOVERY.maxHours, Math.max(RECOVERY.minHours, hoursNeeded))),
    });
  });
  muscles.sort((a, b) => b.hours - a.hours);

  return {
    version: STATS_VERSION,
    volumeKg: Math.round(volume),
    totalSets,
    totalReps,
    estimatedMinutes: Math.max(1, Math.round(seconds / 60)),
    caloriesBurned,
    fatLossGrams: Math.round((caloriesBurned / KCAL_PER_GRAM_FAT) * 10) / 10,
    recoveryHours: muscles.length > 0 ? muscles[0].hours : RECOVERY.unknownHours,
    recoveryMuscles: muscles.slice(0, 3),
    weightKgUsed: weightKg,
  };
}
// ---- end ported formula ----

/** Resolves every distinct exerciseId used across all rows in one
 * request, mirroring fetchExercisesBulk (src/Services/exerciseService.ts). */
async function loadExerciseMeta(exerciseIds) {
  const res = await fetch(new URL('/exercises/bulk', EXERCISE_API_BASE_URL).toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids: exerciseIds }),
  });
  if (!res.ok) {
    throw new Error(`Exercise API bulk request failed: ${res.status} ${res.statusText}`);
  }
  const exercises = await res.json();
  const byId = new Map();
  for (const ex of exercises) byId.set(ex.id, ex);
  return byId;
}

const distinctExerciseIds = [...new Set(rows.flatMap((r) => r.exercises.map((e) => e.exerciseId)))];
console.log(`Resolving metadata for ${distinctExerciseIds.length} distinct exercises…`);
const exerciseMetaById = await loadExerciseMeta(distinctExerciseIds);
const missingMeta = distinctExerciseIds.filter((id) => !exerciseMetaById.has(id));
if (missingMeta.length > 0) {
  console.warn(`No exercise-API match for ${missingMeta.length} id(s), stats will treat them as unknown:`, missingMeta);
}

const weightKgByUser = new Map();
async function bodyWeightFor(userId) {
  if (weightKgByUser.has(userId)) return weightKgByUser.get(userId);
  const snap = await db.collection('userProfiles').doc(userId).get();
  const weightKg = snap.exists ? Number(snap.data().weightKg) || null : null;
  weightKgByUser.set(userId, weightKg);
  return weightKg;
}

let written = 0;

for (const row of rows) {
  const bodyWeightKg = await bodyWeightFor(row.userId);

  const statsExercises = row.exercises.map((exercise) => {
    const meta = exerciseMetaById.get(exercise.exerciseId);
    return {
      sets: exercise.sets,
      meta: meta
        ? {
            primaryMuscles: meta.primaryMuscles,
            secondaryMuscles: meta.secondaryMuscles,
            mechanic: meta.mechanic,
            category: meta.category,
          }
        : null,
    };
  });
  const stats = estimateStats({ exercises: statsExercises, bodyWeightKg });

  const log = {
    date: row.date,
    exercises: row.exercises,
    planId: row.planId,
    planName: row.planName,
    state: row.state,
    userId: row.userId,
    updatedAt: new Date(row.updatedAt),
    ...(stats ? { stats } : {}),
  };

  if (!stats) {
    console.warn(`"${row.planName}" on ${row.date}: no performed sets, writing without stats.`);
  }

  const docId = `${row.userId}_${row.planId}_${row.date}`;
  await db.collection(WORKOUT_LOGS_COLLECTION).doc(docId).set(log, { merge: true });
  written += 1;
  console.log(
    `Uploaded ${row.date} "${row.planName}"${stats ? ` (${stats.caloriesBurned} kcal)` : ''}`,
  );
}

console.log(`Done: ${written} written, out of ${rows.length} rows.`);
