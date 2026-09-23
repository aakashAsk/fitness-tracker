import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, LayoutChangeEvent, Text, TouchableOpacity, View } from 'react-native';
import { colors, withOpacity } from '../../Theme/colors';
import { spacing } from '../../Theme/spacing';
import { themedStyles } from '../../Theme/ThemeContext';

// A horizontally-scrolling date strip spanning 2 months back / 2 months
// forward from today, sized so exactly 7 day-tiles fit on screen at
// once, and keeping the selected date centered (scrollToIndex with
// viewPosition 0.5) whenever it changes — same pattern as the Schedule
// tab's InfiniteDateStrip (src/Screens/ScheduleScreen/DateNavigator.tsx).
//
// Sized from its own measured width (onLayout), not useWindowDimensions —
// the device width is only the same as this component's available width
// when nothing between them adds padding of its own, which does not hold
// everywhere this is used. The wrapper below applies marginHorizontal the
// same way every sibling card on these screens does (see ScheduleSession/
// WorkoutSession's `marginHorizontal: spacing.screenHorizontalPadding`
// cards), so the strip's edges land exactly where theirs do regardless of
// what the actual parent width turns out to be.

const MONTHS_BACK = 2;
const MONTHS_FORWARD = 2;
const DAYS_PER_MONTH = 30; // approximate — fine for a scroll-range bound
const VISIBLE_TILES = 7;
const TILE_GAP = 7;
const TILE_HEIGHT = 64;
const STRIP_VERTICAL_PADDING = 2;

function addDays(date: Date, days: number) {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d;
}

function isSameDay(a: Date, b: Date) {
    return (
        a.getFullYear() === b.getFullYear() &&
        a.getMonth() === b.getMonth() &&
        a.getDate() === b.getDate()
    );
}

function toKey(date: Date) {
    return date.toISOString().slice(0, 10);
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export interface WorkoutDateStripProps {
    selectedDate: Date;
    onSelectDate: (date: Date) => void;
    // Horizontal padding of the screen this strip sits in — used to size
    // tiles so exactly VISIBLE_TILES fit on screen. Defaults to
    // WorkoutSession's own screen padding (App.tsx's tabContent: 20).
    screenHorizontalPadding?: number;
    /**
     * Colour of the selected tile. Defaults to the app's primary blue,
     * which is what the Workout and Schedule tabs use; the Nutrition
     * tab passes its own orange so the strip matches the accent of the
     * screen it sits on.
     */
    accentColor?: string;
}

export const WorkoutDateStrip: React.FC<WorkoutDateStripProps> = ({
    selectedDate,
    onSelectDate,
    screenHorizontalPadding = spacing.screenHorizontalPadding,
    accentColor = colors.primary,
}) => {
    const [wrapperWidth, setWrapperWidth] = useState(0);
    const onWrapperLayout = useCallback(
        (event: LayoutChangeEvent) => setWrapperWidth(event.nativeEvent.layout.width),
        [],
    );
    const listRef = useRef<FlatList<Date>>(null);
    const today = useMemo(() => new Date(), []);

    // wrapperWidth is already net of the marginHorizontal below — no
    // second subtraction of screenHorizontalPadding needed here.
    const tileWidth = useMemo(() => {
        if (wrapperWidth === 0) return 0;
        return (wrapperWidth - TILE_GAP * (VISIBLE_TILES - 1)) / VISIBLE_TILES;
    }, [wrapperWidth]);

    const step = tileWidth + TILE_GAP;

    const dates = useMemo(() => {
        const start = addDays(today, -DAYS_PER_MONTH * MONTHS_BACK);
        const totalDays = DAYS_PER_MONTH * (MONTHS_BACK + MONTHS_FORWARD);
        return Array.from({ length: totalDays }, (_, i) => addDays(start, i));
    }, [today]);

    const scrollToDate = useCallback(
        (date: Date, animated: boolean) => {
            const index = dates.findIndex((d) => isSameDay(d, date));
            if (index >= 0) {
                listRef.current?.scrollToIndex({ index, animated, viewPosition: 0.5 });
            }
        },
        [dates],
    );

    const selectedIndex = useMemo(
        () => dates.findIndex((date) => isSameDay(date, selectedDate)),
        [dates, selectedDate],
    );

    const hasCenteredRef = useRef(false);
    useEffect(() => {
        // Before the wrapper has measured, the list hasn't mounted yet
        // (see the `wrapperWidth > 0` guard below) — listRef is null and
        // this run would be a no-op. It must not count as "already
        // centered", or the list's actual first centering — once it
        // really mounts — would animate into place instead of already
        // being there on the first frame.
        if (!listRef.current) return;
        scrollToDate(selectedDate, hasCenteredRef.current);
        hasCenteredRef.current = true;
        // Re-run only when the selected date or tile sizing changes — not
        // on every `dates`/`scrollToDate` identity change.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedDate, tileWidth]);

    // No leading offset term needed any more — the FlatList's own content
    // no longer carries its own horizontal padding, so item 0 starts at x=0.
    const getItemLayout = useCallback(
        (_: unknown, index: number) => ({
            length: tileWidth,
            offset: step * index,
            index,
        }),
        [tileWidth, step],
    );

    const renderItem = useCallback(
        ({ item: date }: { item: Date }) => {
            const active = isSameDay(date, selectedDate);
            return (
                <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => onSelectDate(date)}
                    style={[
                        styles.dateTile,
                        { width: tileWidth },
                        active && styles.dateTileActive,
                        active && { backgroundColor: accentColor, shadowColor: accentColor },
                    ]}
                >
                    <Text style={[styles.dateTileDay, active && styles.dateTileDayActive]}>
                        {DAY_LABELS[date.getDay()]}
                    </Text>
                    <Text style={[styles.dateTileNum, active && styles.dateTileNumActive]}>
                        {date.getDate()}
                    </Text>
                    {active ? <View style={styles.dateTileDot} /> : null}
                </TouchableOpacity>
            );
        },
        [selectedDate, onSelectDate, tileWidth, accentColor],
    );

    return (
        <View
            // The single source of the strip's edge inset — same property,
            // same value, as every sibling card on these screens.
            style={{ marginHorizontal: screenHorizontalPadding }}
            onLayout={onWrapperLayout}
        >
            {wrapperWidth > 0 ? (
                <FlatList
                    ref={listRef}
                    data={dates}
                    keyExtractor={toKey}
                    renderItem={renderItem}
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    // A horizontal FlatList is a ScrollView, and a bare
                    // ScrollView dropped straight into a flex parent — e.g.
                    // the Schedule tab's vertical ScrollView content
                    // container — stretches to fill the screen. Pinning
                    // flexGrow to 0 and the height to the tile makes the
                    // strip exactly as tall as its tiles wherever it is used.
                    style={styles.list}
                    // initialScrollIndex puts the item at the LEFT edge, so
                    // it is offset by half a screenful of tiles to land
                    // centred on the very first paint rather than sliding
                    // into place after.
                    initialScrollIndex={Math.max(selectedIndex - Math.floor(VISIBLE_TILES / 2), 0)}
                    getItemLayout={getItemLayout}
                    onScrollToIndexFailed={(info) => {
                        setTimeout(() => {
                            listRef.current?.scrollToIndex({
                                index: info.index,
                                animated: false,
                                viewPosition: 0.5,
                            });
                        }, 50);
                    }}
                    // Centring on mount can run before the list has
                    // measured, in which case scrollToIndex silently does
                    // nothing. Re-centring once layout lands makes it
                    // deterministic; it is a no-op when the date is already
                    // in the middle.
                    onLayout={() => scrollToDate(selectedDate, false)}
                    contentContainerStyle={{
                        gap: TILE_GAP,
                        paddingVertical: STRIP_VERTICAL_PADDING,
                    }}
                    windowSize={7}
                    maxToRenderPerBatch={14}
                    initialNumToRender={14}
                    removeClippedSubviews
                />
            ) : (
                // Reserves the strip's height for the one frame before
                // wrapperWidth is known, so nothing above/below jumps once
                // the FlatList mounts in.
                <View style={styles.list} />
            )}
        </View>
    );
};

const styles = themedStyles(() => ({
    list: {
        flexGrow: 0,
        flexShrink: 0,
        height: TILE_HEIGHT + STRIP_VERTICAL_PADDING * 2,
    },
    dateTile: {
        height: TILE_HEIGHT,
        borderRadius: 16,
        backgroundColor: colors.surface,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 2,
        shadowColor: colors.black,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 6,
        elevation: 1,
    },
    dateTileActive: {
        backgroundColor: colors.primary,
        shadowColor: colors.primary,
        shadowOpacity: 0.3,
        shadowRadius: 10,
        elevation: 3,
    },
    dateTileDay: {
        fontSize: 11,
        fontWeight: '600',
        color: colors.textSecondary,
    },
    dateTileDayActive: {
        color: withOpacity(colors.white, 0.9),
    },
    dateTileNum: {
        fontSize: 15,
        fontWeight: '800',
        color: colors.textPrimary,
    },
    dateTileNumActive: {
        color: colors.white,
        fontSize: 16,
    },
    dateTileDot: {
        width: 5,
        height: 5,
        borderRadius: 2.5,
        backgroundColor: withOpacity(colors.white, 0.65),
        marginTop: 1,
    },
}));

export default WorkoutDateStrip;
