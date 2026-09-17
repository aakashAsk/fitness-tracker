// Device-local copy of the user's theme choice.
//
// The profile in Firestore stays the source of truth — it is what
// follows the user between devices. But it arrives several hundred
// milliseconds into a cold start, and the splash and auth screens are
// already on screen by then. Reading the profile alone meant the app
// always opened light and then snapped to dark once the document
// landed.
//
// So the chosen mode is also mirrored here, on the device, and read
// back before the first frame. Firestore corrects it afterwards if the
// user changed the theme somewhere else.
import AsyncStorage from '@react-native-async-storage/async-storage';

import type { ThemeMode } from './colors';

const THEME_KEY = 'pulsefit.themeMode';

/**
 * The cached mode, or null when there is nothing cached (a fresh
 * install) or storage is unreadable.
 *
 * Never throws: a theme preference is not worth failing a launch over,
 * and the caller's fallback — light — is the correct default anyway.
 */
export async function readCachedThemeMode(): Promise<ThemeMode | null> {
    try {
        const stored = await AsyncStorage.getItem(THEME_KEY);
        return stored === 'dark' || stored === 'light' ? stored : null;
    } catch {
        return null;
    }
}

/**
 * Mirrors the mode to the device. Also non-throwing — the Firestore
 * write is the one whose failure the user is told about; this is a
 * cache, and a stale cache only costs one frame on the next launch.
 */
export async function writeCachedThemeMode(mode: ThemeMode): Promise<void> {
    try {
        await AsyncStorage.setItem(THEME_KEY, mode);
    } catch {
        // Ignored on purpose — see above.
    }
}

/** Dropped on sign-out so the next account does not open in the
    previous one's theme. */
export async function clearCachedThemeMode(): Promise<void> {
    try {
        await AsyncStorage.removeItem(THEME_KEY);
    } catch {
        // Ignored on purpose — see above.
    }
}
