// Holds the dashboard behind a skeleton until everything on it has loaded.
//
// The dashboard is assembled from sections that each fetch for
// themselves — steps, today's telemetry, sleep, meal logs, workout
// occurrences, the plan stores. Left alone they land one after another,
// so the screen paints half-empty and then fills in piece by piece.
//
// This gate fixes that without moving any of that loading. The real
// dashboard is mounted straight away — that is what makes its hooks
// fetch — but kept at zero height, so nothing is visible; a skeleton
// stands in for it. Each section tells the gate when its own data has
// arrived (useDashboardReady), and once every section has, the skeleton
// is swapped for the real thing in one step.
//
// The hidden copy is clipped to zero height rather than display:none, so
// it still gets its real width and lays itself out. Sections that size
// themselves from their own layout (the schedule slider) are then already
// sized at the moment of the swap and do not flash an empty card.
import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
    type ReactNode,
} from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

/** Longest the skeleton may stay up. A source that never answers — a
    Health Connect permission prompt left open, say — must not hold the
    whole dashboard hostage; its own tile already has a loading state. */
const DEFAULT_TIMEOUT_MS = 6000;

interface GateApi {
    report: (key: string, ready: boolean) => void;
    forget: (key: string) => void;
}

const GateContext = createContext<GateApi | null>(null);

/**
 * Whether the dashboard has been shown yet this session. The skeleton is
 * for the FIRST load — the one where nothing is in memory. Every later
 * visit to the Home tab remounts the dashboard, but by then its sections
 * are seeded from the read cache (see dataCache) and paint straight away,
 * so putting the skeleton back would only hide content that is already
 * there. Module state, not component state: it has to outlive the
 * unmount that a tab switch causes.
 */
let hasRevealedThisSession = false;

/** Puts the skeleton back for the next first load — call on sign-out,
 * together with clearing the data cache the reveal depends on. */
export function resetDashboardGate(): void {
    hasRevealedThisSession = false;
}

/**
 * Tells the surrounding DashboardLoadGate whether this section's data has
 * arrived. Call it unconditionally, before any early return, with a stable
 * `key` per source. Outside a gate it does nothing, so a section stays
 * usable on its own.
 */
export function useDashboardReady(key: string, ready: boolean): void {
    const gate = useContext(GateContext);

    useEffect(() => {
        gate?.report(key, ready);
    }, [gate, key, ready]);

    // A section that goes away before the reveal must not block it.
    useEffect(() => () => gate?.forget(key), [gate, key]);
}

export interface DashboardLoadGateProps {
    /** Shown until every source has reported ready (or the timeout hits). */
    skeleton: ReactNode;
    /** Applied to the real content's wrapper — carries the spacing the
        parent used to apply between these children directly. */
    style?: StyleProp<ViewStyle>;
    timeoutMs?: number;
    children: ReactNode;
}

const HIDDEN: ViewStyle = { height: 0, overflow: 'hidden' };

export const DashboardLoadGate: React.FC<DashboardLoadGateProps> = ({
    skeleton,
    style,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    children,
}) => {
    const [sources, setSources] = useState<Record<string, boolean>>({});
    // Latched: once the dashboard has been shown it stays shown. A later
    // re-read (a date rolling over, a foreground refresh) flips a source
    // back to loading, and the skeleton must not reappear over a screen
    // the user is already looking at.
    //
    // Starts revealed on every visit after the first (see
    // hasRevealedThisSession) — decided in the initial state, not in an
    // effect, so there is no skeleton frame to flash past.
    const [revealed, setRevealed] = useState(hasRevealedThisSession);

    // State rather than a ref, so every section's first report — they all
    // mount in the same commit — is batched into ONE re-render. Evaluating
    // as each one arrived would see only the first, find it ready, and
    // reveal before the rest had even registered.
    const report = useCallback((key: string, ready: boolean) => {
        setSources((prev) => (prev[key] === ready ? prev : { ...prev, [key]: ready }));
    }, []);

    const forget = useCallback((key: string) => {
        setSources((prev) => {
            if (!(key in prev)) return prev;
            const { [key]: _removed, ...rest } = prev;
            return rest;
        });
    }, []);

    const api = useMemo<GateApi>(() => ({ report, forget }), [report, forget]);

    const keys = Object.keys(sources);
    const allReady = keys.length > 0 && keys.every((key) => sources[key]);

    useEffect(() => {
        if (allReady) setRevealed(true);
    }, [allReady]);

    useEffect(() => {
        if (revealed) {
            hasRevealedThisSession = true;
            return;
        }
        const id = setTimeout(() => setRevealed(true), timeoutMs);
        return () => clearTimeout(id);
    }, [revealed, timeoutMs]);

    return (
        <GateContext.Provider value={api}>
            {revealed ? null : skeleton}
            {/* Same element in both states, so revealing it does not remount
                the dashboard and throw away everything it just loaded. */}
            <View
                style={revealed ? style : HIDDEN}
                pointerEvents={revealed ? 'auto' : 'none'}
                accessibilityElementsHidden={!revealed}
                importantForAccessibility={revealed ? 'auto' : 'no-hide-descendants'}
            >
                {children}
            </View>
        </GateContext.Provider>
    );
};

export default DashboardLoadGate;
