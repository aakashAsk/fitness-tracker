// Firebase app + Firestore singleton, initialized from `.env`
// (EXPO_PUBLIC_FIREBASE_*). Uses the Firebase JS SDK (not
// @react-native-firebase) so it works out of the box in Expo Go — no
// native config (google-services.json / GoogleService-Info.plist) or
// custom dev client required.
import { getApp, getApps, initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
  // Fails loud in dev rather than silently making requests that 400.
  console.warn(
    '[firebase] Missing config — copy .env.example values for ' +
      'EXPO_PUBLIC_FIREBASE_* from your Firebase project settings into .env, ' +
      'then restart the dev server (env vars are only read at Metro startup).',
  );
}

// Reuse the existing app on Fast Refresh instead of calling
// initializeApp() twice (which throws "already exists").
export const firebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const db = getFirestore(firebaseApp);
