// Scrolls a ScrollView to one item once it has rendered — how the
// dashboard's workout and meal cards land the user on that exact
// session in the Workout and Nutrition tabs.
//
// The item's position is not known up front and does not hold still:
// its tab renders skeletons first, and cards above it (progress chart,
// hydration tracker) resize as their own data arrives. So instead of one
// scroll, this follows the item for a short settling window, re-scrolling
// whenever its measured position changes, then lets go. It lets go early
// the moment the user drags, so it never fights their thumb.
import { useCallback, useEffect, useRef } from 'react';
import type { LayoutChangeEvent, ScrollView } from 'react-native';

/** How long to keep following the item after the list is ready. */
const SETTLE_MS = 1200;
/** Breathing room left above the item, so it does not sit flush. */
const TOP_MARGIN = 12;

export interface UseScrollToItemResult {
    scrollRef: React.RefObject<ScrollView | null>;
    /** onLayout for the item's container, when the items are nested one
        level inside the scroll content rather than directly in it. */
    onContainerLayout: (event: LayoutChangeEvent) => void;
    /** onLayout for an item, by id. */
    onItemLayout: (id: string) => (event: LayoutChangeEvent) => void;
    /** Pass to the ScrollView — a user drag ends the follow at once. */
    onScrollBeginDrag: () => void;
}

/**
 * @param targetId The item to land on, or null for none.
 * @param ready    True once the list shows real rows, not skeletons —
 *                 scrolling to a skeleton's position would be scrolling
 *                 to a spot that is about to move.
 * @param onDone   Called once, when the follow ends for any reason, so the
 *                 caller can clear the target and a later visit does not
 *                 jump again.
 */
export function useScrollToItem(
    targetId: string | null | undefined,
    ready: boolean,
    onDone?: () => void,
): UseScrollToItemResult {
    const scrollRef = useRef<ScrollView>(null);
    const containerY = useRef(0);
    const itemY = useRef<Record<string, number>>({});
    const following = useRef(Boolean(targetId));
    const onDoneRef = useRef(onDone);
    onDoneRef.current = onDone;

    const finish = useCallback(() => {
        if (!following.current) return;
        following.current = false;
        onDoneRef.current?.();
    }, []);

    const scroll = useCallback(() => {
        if (!following.current || !ready || !targetId) return;
        const y = itemY.current[targetId];
        if (y === undefined) return;
        scrollRef.current?.scrollTo({
            y: Math.max(containerY.current + y - TOP_MARGIN, 0),
            animated: true,
        });
    }, [ready, targetId]);

    // A new target starts a new follow.
    useEffect(() => {
        following.current = Boolean(targetId);
    }, [targetId]);

    // Once real rows are on screen: scroll now, keep correcting for the
    // settling window, then stop. A target that never appears — the
    // session was deleted between tap and render — still ends here, so
    // it cannot leave the screen following forever.
    useEffect(() => {
        if (!ready || !targetId || !following.current) return;
        scroll();
        const timer = setTimeout(finish, SETTLE_MS);
        return () => clearTimeout(timer);
    }, [ready, targetId, scroll, finish]);

    const onContainerLayout = useCallback(
        (event: LayoutChangeEvent) => {
            containerY.current = event.nativeEvent.layout.y;
            scroll();
        },
        [scroll],
    );

    const onItemLayout = useCallback(
        (id: string) => (event: LayoutChangeEvent) => {
            itemY.current[id] = event.nativeEvent.layout.y;
            if (id === targetId) scroll();
        },
        [scroll, targetId],
    );

    return { scrollRef, onContainerLayout, onItemLayout, onScrollBeginDrag: finish };
}

export default useScrollToItem;
