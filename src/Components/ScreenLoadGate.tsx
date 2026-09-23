// Holds a tab behind a page-shaped skeleton on its FIRST load of the
// session, then reveals the real screen in one step.
//
// The same idea as DashboardLoadGate, for screens that know for
// themselves when their data has arrived: the caller passes `ready`
// instead of each section reporting in. The real content is mounted
// straight away — that is what makes its hooks fetch — but kept at zero
// height, so nothing shows while the skeleton stands in. It is clipped
// rather than display:none so it still gets its real width and lays
// itself out; the swap then barely moves anything.
//
// Two rules keep it from getting in the way:
//   - Latched. Once revealed it stays revealed, so a later re-read (the
//     user picking another date) never puts the skeleton back over a
//     screen they are looking at — that case has its own per-card
//     placeholders.
//   - Per session. Every later visit to the tab mounts it already
//     revealed: by then the data is cached and paints straight away, so a
//     skeleton would only hide content that is already there.
import React, { useEffect, useState, type ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

/** Longest the skeleton may stay up. A source that never answers must not
    hold the whole tab hostage — its own card already has a loading state. */
const DEFAULT_TIMEOUT_MS = 6000;

const HIDDEN: ViewStyle = { height: 0, overflow: 'hidden' };

/** Screens revealed this session. Module state, not component state: it
    has to outlive the unmount a tab switch causes. */
const revealedScreens = new Set<string>();

/** Puts every skeleton back for the next first load — call on sign-out,
 *  together with clearing the data cache the reveal depends on. */
export function resetScreenGates(): void {
    revealedScreens.clear();
}

export interface ScreenLoadGateProps {
    /** Stable name for the screen, e.g. 'workout'. */
    screenKey: string;
    /** True once everything the first paint needs has arrived. */
    ready: boolean;
    /** Shown until `ready` (or the timeout). */
    skeleton: ReactNode;
    /** Applied to the real content's wrapper — carries the spacing the
        parent used to apply between these children directly. */
    style?: StyleProp<ViewStyle>;
    timeoutMs?: number;
    children: ReactNode;
}

export const ScreenLoadGate: React.FC<ScreenLoadGateProps> = ({
    screenKey,
    ready,
    skeleton,
    style,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    children,
}) => {
    const [latched, setLatched] = useState(() => revealedScreens.has(screenKey));
    // Derived, not waiting on an effect: the render in which `ready` turns
    // true is already the revealed one. A scroll-to-plan that fires on that
    // same beat then measures a full-height screen, not a zero-height one.
    const revealed = latched || ready;

    useEffect(() => {
        if (revealed) {
            revealedScreens.add(screenKey);
            setLatched(true);
            return;
        }
        const id = setTimeout(() => setLatched(true), timeoutMs);
        return () => clearTimeout(id);
    }, [revealed, screenKey, timeoutMs]);

    return (
        <>
            {revealed ? null : skeleton}
            {/* Same element in both states, so revealing it does not
                remount the screen and throw away what it just loaded. */}
            <View
                style={revealed ? style : HIDDEN}
                pointerEvents={revealed ? 'auto' : 'none'}
                accessibilityElementsHidden={!revealed}
                importantForAccessibility={revealed ? 'auto' : 'no-hide-descendants'}
            >
                {children}
            </View>
        </>
    );
};

export default ScreenLoadGate;
