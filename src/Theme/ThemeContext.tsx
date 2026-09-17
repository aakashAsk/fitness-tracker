// Theme switching for the whole app.
//
// The problem this solves: every screen builds its styles once, at
// import time, with `StyleSheet.create({ ..., color: colors.textPrimary })`.
// Those are plain strings baked into the style object, so flipping the
// palette later does nothing for them — the screen keeps its original
// colors until the bundle is reloaded.
//
// Rather than rewrite ~55 screens into `useMemo(() => makeStyles(c), [c])`,
// each one swaps `StyleSheet.create({...})` for `themedStyles(() => ({...}))`.
// That hands us the FACTORY, not just its result, so on a theme switch we
// can re-run every factory and refresh the style objects in place.
//
// Two rules make a switch actually reach the screen:
//
//  1. `themedStyles` returns a stable container object whose ENTRIES are
//     replaced on a switch. A component reads `styles.card` during render,
//     so it gets the new sub-object; because that sub-object has a new
//     identity, React sees a changed `style` prop and repaints.
//
//  2. The mode lives in the root `App` component, not in a provider
//     wrapped around opaque children. Re-rendering a provider does NOT
//     re-render a `children` element it received unchanged, so the tree
//     would keep its old styles. State at the root makes React rebuild
//     the child elements and re-render everything below.

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { StyleSheet, type ImageStyle, type TextStyle, type ViewStyle } from 'react-native';

import { getActiveMode, setActivePalette, type ThemeMode } from './colors';
import { readCachedThemeMode, writeCachedThemeMode } from './themeStorage';

/**
 * Mirrors RN's own constraint on `StyleSheet.create`. Without it the
 * factory's return type widens — `alignItems: 'center'` infers as
 * `string` and every style prop in the app fails to type-check.
 */
type NamedStyles<T> = { [P in keyof T]: ViewStyle | TextStyle | ImageStyle };

type StyleMap = Record<string, unknown>;
type StyleFactory = () => StyleMap;

interface Registered {
    container: StyleMap;
    factory: StyleFactory;
}

/**
 * Every themed stylesheet in the bundle. Modules register as they are
 * first imported, so a screen loaded AFTER a theme switch is still
 * correct — its factory runs against the palette that is active by then.
 */
const registry: Registered[] = [];

const rebuild = ({ container, factory }: Registered): void => {
    const next = StyleSheet.create(factory() as Parameters<typeof StyleSheet.create>[0]);

    // Mutate the same container the screens already hold a reference to,
    // replacing each entry with a freshly built one. Deleting first
    // matters: a factory whose shape is conditional could otherwise
    // leave a stale key behind.
    for (const key of Object.keys(container)) delete container[key];
    Object.assign(container, next);
};

/**
 * Drop-in replacement for `StyleSheet.create`, for any stylesheet that
 * reads `colors`. Pass a factory, not an object literal — the factory is
 * what lets the sheet be rebuilt when the theme changes.
 *
 *   const styles = themedStyles(() => ({ card: { backgroundColor: colors.surface } }));
 *
 * The return type matches `StyleSheet.create`, so call sites are
 * unchanged: `styles.card` still type-checks and still works in arrays
 * and conditional style props.
 */
export function themedStyles<T extends NamedStyles<T> | NamedStyles<any>>(
    factory: () => T & NamedStyles<any>,
): T {
    const entry: Registered = { container: {}, factory: factory as StyleFactory };
    rebuild(entry);
    registry.push(entry);
    return entry.container as T;
}

/** Repoints `colors` and rebuilds every registered stylesheet. */
const applyMode = (mode: ThemeMode): void => {
    setActivePalette(mode);
    registry.forEach(rebuild);
};

export interface ThemeValue {
    mode: ThemeMode;
    isDark: boolean;
    /** Applies a theme immediately. Does not persist it. */
    setMode: (mode: ThemeMode) => void;
    /**
     * Applies a theme AND mirrors it to device storage, so the next cold
     * start opens in it without waiting on Firestore. This is what the
     * Settings switch calls.
     */
    setModePersisted: (mode: ThemeMode) => void;
    toggle: () => void;
    /**
     * False until the cached mode has been read back. The app renders
     * nothing while it is false — see App.tsx. It is a single
     * AsyncStorage read, so this lasts a frame or two, and it is what
     * keeps a dark-mode user from seeing a light splash first.
     */
    hydrated: boolean;
}

const ThemeContext = createContext<ThemeValue | null>(null);

/**
 * Holds the active mode. Mount this AS the root component's own state
 * (see App.tsx) — see rule 2 at the top of this file for why wrapping
 * children in a provider alone is not enough.
 */
export const useThemeState = (): ThemeValue => {
    const [mode, setModeState] = useState<ThemeMode>(getActiveMode());
    const [hydrated, setHydrated] = useState(false);

    const setMode = useCallback((next: ThemeMode) => {
        // Order matters: the palette and stylesheets are swapped
        // synchronously, before the state update schedules the render
        // that reads them.
        applyMode(next);
        setModeState(next);
    }, []);

    const setModePersisted = useCallback(
        (next: ThemeMode) => {
            setMode(next);
            // Fire-and-forget: writeCachedThemeMode never rejects, and
            // the UI has already moved on.
            void writeCachedThemeMode(next);
        },
        [setMode],
    );

    // Runs once, before anything is painted. Nothing cached means a
    // fresh install, which stays on the light default.
    useEffect(() => {
        let active = true;

        readCachedThemeMode().then(cached => {
            if (!active) return;
            if (cached) setMode(cached);
            setHydrated(true);
        });

        return () => {
            active = false;
        };
    }, [setMode]);

    return useMemo<ThemeValue>(
        () => ({
            mode,
            isDark: mode === 'dark',
            setMode,
            setModePersisted,
            toggle: () => setModePersisted(mode === 'dark' ? 'light' : 'dark'),
            hydrated,
        }),
        [hydrated, mode, setMode, setModePersisted],
    );
};

export const ThemeProvider: React.FC<{ value: ThemeValue; children: React.ReactNode }> = ({
    value,
    children,
}) => <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;

export const useTheme = (): ThemeValue => {
    const value = useContext(ThemeContext);
    if (!value) {
        throw new Error('useTheme must be used inside <ThemeProvider>');
    }
    return value;
};
