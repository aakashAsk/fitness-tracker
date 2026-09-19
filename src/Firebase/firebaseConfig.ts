// Firebase app + Firestore singleton, initialized from `.env`
// (EXPO_PUBLIC_FIREBASE_*). Uses the Firebase JS SDK (not
// @react-native-firebase) so it works out of the box in Expo Go — no
// native config (google-services.json / GoogleService-Info.plist) or
// custom dev client required.
import { getApp, getApps, initializeApp } from 'firebase/app';
// Imported from '@firebase/auth' directly (not 'firebase/auth') — the
// 'firebase' wrapper package's export map has no "react-native"
// condition, so it always resolves to the web build and silently omits
// getReactNativePersistence. '@firebase/auth' declares that condition
// correctly, so Metro picks its React Native build instead.
import { connectAuthEmulator, initializeAuth, getAuth, type Auth } from '@firebase/auth';
// The shared auth-public.d.ts (what TS resolves via package.json
// "types") doesn't declare the RN-only getReactNativePersistence
// export, even though the actual RN build Metro loads at runtime has
// it — so it's pulled in through a plain `require` to sidestep the
// stale typing rather than the whole file being cast to `any`.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { getReactNativePersistence } = require('@firebase/auth');
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

// Reuse the existing app on Fast Refresh instead of calling
// initializeApp() twice (which throws "already exists").
export const firebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const db = getFirestore(firebaseApp);

// initializeAuth() must only be called once — on Fast Refresh it throws
// "already initialized", so fall back to getAuth() which returns the
// existing instance instead. Without getReactNativePersistence the RN JS
// SDK falls back to in-memory auth state, logging the user out on every
// reload.
let auth: Auth;
try {
  auth = initializeAuth(firebaseApp, {
    persistence: getReactNativePersistence(AsyncStorage),
  });
} catch {
  auth = getAuth(firebaseApp);
}

export { auth };

// Opt-in local emulator. Only when EXPO_PUBLIC_USE_FIREBASE_EMULATOR is
// exactly '1' — an unset or missing .env keeps pointing at the real
// project, unchanged. Used to exercise feature flags and security rules
// without ever writing to production.
//
// EXPO_PUBLIC_EMULATOR_HOST defaults to 127.0.0.1, which is right for
// iOS simulators, web and a physical device tunnelled with adb reverse.
// The Android emulator is a VM: 127.0.0.1 inside it is the VM itself,
// not your machine, so set EXPO_PUBLIC_EMULATOR_HOST=10.0.2.2 there.
// A physical device on Wi-Fi needs the computer's LAN address.
//
// The module-level flag plus try/catch guard Fast Refresh, which
// re-evaluates this file: connecting again after the client has been
// used throws.
let emulatorConnected = false;
if (process.env.EXPO_PUBLIC_USE_FIREBASE_EMULATOR === '1' && !emulatorConnected) {
  emulatorConnected = true;
  const host = process.env.EXPO_PUBLIC_EMULATOR_HOST || '127.0.0.1';
  try {
    connectFirestoreEmulator(db, host, 8080);
    connectAuthEmulator(auth, `http://${host}:9099`, { disableWarnings: true });
    console.log(`[firebase] using emulators at ${host}`);
  } catch {
    // Already connected on a previous evaluation (Fast Refresh) — the
    // existing connection is the one we want.
  }
}
