// Android's hardware/gesture back button.
//
// This app has no router — every "screen" the user thinks of as
// pushed/popped (Exercise Library, Exercise Detail, Settings, an
// onboarding step) is really just component state on the screen above
// it (see WorkoutSession's own comment on this). Nothing was listening
// for the hardware back button, so Android fell through to its default
// behaviour: closing the whole app, from ANY depth. Pressing back while
// three sub-screens deep felt like a crash, not a screens.
//
// The fix is a small stack rather than one handler per screen: several
// sub-screens can be open at once (e.g. Exercise Detail on top of the
// Exercise Library), and back must undo only the top one. Each screen
// registers its own "go back one level" while it is mounted; the most
// recently registered handler runs first, and only when NONE is
// registered does Android's default (exit, or pop the tab) apply.
import { useEffect } from 'react';
import { BackHandler } from 'react-native';

/** Return true to say "I handled this, stop here"; false to let the
 * next-oldest handler (or Android's default) run instead. */
type BackHandlerFn = () => boolean;

const stack: BackHandlerFn[] = [];

/**
 * Registers `handler` as the thing a hardware back press should do while
 * this screen is on top. Registered only while `enabled` is true, so a
 * screen mounted-but-hidden (e.g. behind a modal) does not steal back
 * presses meant for what's actually showing.
 */
export function useHardwareBack(handler: BackHandlerFn, enabled: boolean = true): void {
    useEffect(() => {
        if (!enabled) return;
        stack.push(handler);
        return () => {
            const index = stack.lastIndexOf(handler);
            if (index !== -1) stack.splice(index, 1);
        };
    }, [handler, enabled]);
}

/**
 * Installed ONCE, at the app root (see App.tsx). Runs the most recently
 * registered handler; with none registered, returning false hands the
 * press to Android's own default — which on the root screen is exiting
 * the app, exactly as it should be there.
 */
export function useRootHardwareBackHandler(): void {
    useEffect(() => {
        const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
            const topHandler = stack[stack.length - 1];
            return topHandler ? topHandler() : false;
        });
        return () => subscription.remove();
    }, []);
}
