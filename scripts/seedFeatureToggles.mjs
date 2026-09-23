// DEV-ONLY. Seeds a couple of `featureToggle` documents into a LOCAL
// Firestore emulator so the feature-flag scenarios start from a known
// state. Idempotent: PATCH upserts, so running it twice leaves the same
// documents.
//
//   firebase emulators:start --only firestore     (one terminal)
//   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npm run seed:flags
//
// Hard guard: refuses to run unless FIRESTORE_EMULATOR_HOST is set AND
// points at a local address, so it can never write to the real project.
// It talks to the emulator's REST API with the emulator-only
// `Authorization: Bearer owner` header, which bypasses security rules;
// no credentials, no SDK, no dependencies.

const LOCAL_HOSTS = ['127.0.0.1', 'localhost', '10.0.2.2', '[::1]', '0.0.0.0'];

const host = process.env.FIRESTORE_EMULATOR_HOST;
if (!host) {
  console.error(
    'Refusing to seed: FIRESTORE_EMULATOR_HOST is not set. This script only ' +
      'writes to a local emulator, never to the real project.',
  );
  process.exit(1);
}
const hostname = host.startsWith('[') ? host.slice(0, host.indexOf(']') + 1) : host.split(':')[0];
if (!LOCAL_HOSTS.includes(hostname)) {
  console.error(`Refusing to seed: FIRESTORE_EMULATOR_HOST "${host}" is not a local address.`);
  process.exit(1);
}

const projectId = process.env.GCLOUD_PROJECT || process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || 'demo-fitness-tracker';

// Keys must exist in src/FeatureFlags/registry.ts to have any effect
// (unknown keys are ignored by the app). `demoUnknownFlag` is here to
// show exactly that.
const SEED = {
  disabledPushNotification: { enabled: false, description: 'Kill switch: true turns all push notification code off' },
  enabledAddForSubscription: { enabled: true, description: 'Shows the subscription advert above the dashboard nav bar' },
  demoUnknownFlag: { enabled: false, description: 'Not in the registry; ignored by the app' },
};

for (const [key, data] of Object.entries(SEED)) {
  const url = `http://${host}/v1/projects/${projectId}/databases/(default)/documents/featureToggle/${key}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fields: {
        enabled: { booleanValue: data.enabled },
        description: { stringValue: data.description },
      },
    }),
  });
  if (!res.ok) {
    console.error(`Failed to seed featureToggle/${key}: HTTP ${res.status}`);
    process.exit(1);
  }
  console.log(`seeded featureToggle/${key} enabled=${data.enabled}`);
}
