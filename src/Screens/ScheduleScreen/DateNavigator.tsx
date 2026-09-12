import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from 'react';
import { View, Text, TouchableOpacity, FlatList, StyleSheet } from 'react-native';
import { colors } from '../../Theme/colors';
import { typography } from '../../Theme/typography';
import { spacing } from '../../Theme/spacing';

// --- Date helpers -----------------------------------------------------

const DAY_LABELS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

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
  return date.toISOString().slice(0, 10); // YYYY-MM-DD
}

// How far back/forward the strip goes. Cheap to generate — a Date object
// is tiny, and FlatList only mounts what's actually visible, so even a
// wider horizon costs nothing at runtime. Bump this if the app needs more.
const MONTHS_BACK = 2;
const MONTHS_FORWARD = 2;
const DAYS_PER_MONTH = 30; // approximate — fine for a scroll-range bound

// --- Component ----------------------------------------------------------

export interface DateStripHandle {
  scrollToToday: () => void;
  scrollToDate: (date: Date) => void;
  /** Nudge the strip by one week. Pass -1 for previous week, 1 for next. */
  scrollByWeek: (direction: -1 | 1) => void;
}

interface InfiniteDateStripProps {
  selectedDate: Date;
  onSelectDate: (date: Date) => void;
  /** Return up to 3 hex colors to render as dots under a given day. */
  getDayDots?: (date: Date) => string[];
}

const ITEM_WIDTH = 46;
const ITEM_GAP = 8;
const STEP = ITEM_WIDTH + ITEM_GAP;

const InfiniteDateStrip = forwardRef<DateStripHandle, InfiniteDateStripProps>(
  ({ selectedDate, onSelectDate, getDayDots }, ref) => {
    const listRef = useRef<FlatList<Date>>(null);
    const today = useMemo(() => new Date(), []);

    // The full virtual range. Building this once with useMemo means it's
    // only computed on mount, not on every render/selection change.
    const dates = useMemo(() => {
      const start = addDays(today, -DAYS_PER_MONTH * MONTHS_BACK);
      const totalDays = DAYS_PER_MONTH * (MONTHS_BACK + MONTHS_FORWARD);
      return Array.from({ length: totalDays }, (_, i) => addDays(start, i));
    }, [today]);

    const todayIndex = useMemo(
      () => dates.findIndex((d) => isSameDay(d, today)),
      [dates, today]
    );

    // FlatList doesn't expose "current scroll position" as a prop — we
    // track it ourselves from onScroll so the arrow buttons know where to
    // jump to next. Seeded to today's offset (not 0) because FlatList
    // jumps straight to initialScrollIndex without ever firing onScroll
    // for it — without this seed, a "next week" tap before any manual
    // scrolling would wrongly think it's starting from the very beginning.
    const scrollOffsetRef = useRef(spacing.gutterMobile + todayIndex * STEP);

    const scrollToDate = useCallback(
      (date: Date, animated = true) => {
        const index = dates.findIndex((d) => isSameDay(d, date));
        if (index >= 0) {
          listRef.current?.scrollToIndex({ index, animated, viewPosition: 0.5 });
        }
      },
      [dates]
    );

    // Keeps whatever date is selected centered in the strip — on the
    // initial date (no animation, so it doesn't visibly slide in from the
    // edge on mount) and every time it changes afterward (animated), from
    // either a tap on the strip itself or selectedDate changing externally.
    const hasCenteredRef = useRef(false);
    useEffect(() => {
      scrollToDate(selectedDate, hasCenteredRef.current);
      hasCenteredRef.current = true;
    }, [selectedDate, scrollToDate]);

    const maxOffset = spacing.gutterMobile + (dates.length - 1) * STEP;

    const scrollByWeek = useCallback(
      (direction: -1 | 1) => {
        const target = scrollOffsetRef.current + direction * 7 * STEP;
        // FlatList clamps out-of-range offsets on its own, but clamping
        // here too avoids handing it a negative number, which some
        // Android versions render oddly for a frame before correcting.
        const clamped = Math.max(0, Math.min(target, maxOffset));
        listRef.current?.scrollToOffset({ offset: clamped, animated: true });
      },
      [maxOffset]
    );

    useImperativeHandle(ref, () => ({
      scrollToToday: () => scrollToDate(today),
      scrollToDate,
      scrollByWeek,
    }));

    // `length` must be the item's own width (not item+gap) and `offset`
    // must include the list's leading paddingHorizontal — FlatList uses
    // both verbatim (not the actual measured layout) to compute where an
    // item sits, so getting either wrong throws off scrollToIndex's
    // viewPosition centering by a consistent, systematic amount.
    const getItemLayout = useCallback(
      (_: unknown, index: number) => ({
        length: ITEM_WIDTH,
        offset: spacing.gutterMobile + STEP * index,
        index,
      }),
      []
    );

    const renderItem = useCallback(
      ({ item: date }: { item: Date }) => {
        const active = isSameDay(date, selectedDate);
        const dots = getDayDots?.(date) ?? [];

        return (
          <TouchableOpacity
            style={styles.dayColumn}
            activeOpacity={0.7}
            onPress={() => onSelectDate(date)}
          >
            <Text style={[styles.dayLabel, active && styles.dayLabelActive]}>
              {DAY_LABELS[date.getDay()]}
            </Text>

            <View style={[styles.dayCircle, active && styles.dayCircleActive]}>
              <Text style={[styles.dayNumber, active && styles.dayNumberActive]}>
                {date.getDate()}
              </Text>
            </View>

            <View style={styles.dotsRow}>
              {dots.slice(0, 3).map((color, i) => (
                <View
                  key={i}
                  style={[
                    styles.dot,
                    { backgroundColor: active ? colors.onPrimaryFixed : color },
                  ]}
                />
              ))}
            </View>
          </TouchableOpacity>
        );
      },
      [selectedDate, getDayDots, onSelectDate]
    );

    return (
      <FlatList
        ref={listRef}
        data={dates}
        keyExtractor={toKey}
        renderItem={renderItem}
        horizontal
        showsHorizontalScrollIndicator={false}
        initialScrollIndex={todayIndex}
        getItemLayout={getItemLayout}
        onScroll={(e) => {
          scrollOffsetRef.current = e.nativeEvent.contentOffset.x;
        }}
        // 16ms ≈ once per frame — frequent enough that scrollByWeek always
        // has a fresh position, without firing on every pixel of scroll.
        scrollEventThrottle={16}
        // Prevents the "blank flash" scrollToIndex can cause if the
        // estimated offset is briefly wrong during fast scrolling.
        onScrollToIndexFailed={(info) => {
          setTimeout(() => {
            listRef.current?.scrollToIndex({
              index: info.index,
              animated: false,
              viewPosition: 0.5,
            });
          }, 50);
        }}
        contentContainerStyle={styles.listContent}
        // Only keep a modest render window — with 1000+ items this is
        // what keeps memory/CPU flat no matter how far the user scrolls.
        windowSize={7}
        maxToRenderPerBatch={14}
        initialNumToRender={14}
        removeClippedSubviews
      />
    );
  }
);

export default InfiniteDateStrip;

const styles = StyleSheet.create({
  listContent: {
    paddingHorizontal: spacing.gutterMobile,
    gap: ITEM_GAP,
  },
  dayColumn: {
    alignItems: 'center',
    gap: 6,
    width: ITEM_WIDTH,
  },
  dayLabel: {
    ...typography.labelCaps,
    fontSize: 10,
    color: colors.onSurfaceVariant,
  },
  dayLabelActive: {
    color: colors.primaryContainer,
  },
  dayCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceContainerLow,
  },
  dayCircleActive: {
    backgroundColor: colors.primaryContainer,
    shadowColor: colors.primaryContainer,
    shadowOpacity: 0.6,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
    elevation: 4,
  },
  dayNumber: {
    ...typography.bodyMd,
    fontWeight: '700',
    color: colors.onSurface,
  },
  dayNumberActive: {
    color: colors.onPrimaryFixed,
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 3,
    height: 4,
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
});