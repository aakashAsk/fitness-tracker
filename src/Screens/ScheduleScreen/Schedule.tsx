import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  StatusBar,
  Alert,
  NativeScrollEvent,
  NativeSyntheticEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Dumbbell } from 'lucide-react-native';
import { colors, withOpacity } from '../../Theme/colors';
import { spacing } from '../../Theme/spacing';

import AppHeader from './AppHeader';
import { DateStripHandle } from './DateNavigator';
import WeekStrip, { WeekDay } from './WeekStrip';
import UpcomingSection from './UpcomingSection';
import TimelineRow, { TimelineRowData } from './TimelineRow';
import AICoachBanner from './AICoachBanner';

import { weekDays, upcomingItems } from './ScheduleData';
import InfiniteDateStrip from './DateNavigator';
import { parseTimeToMinutes } from '../../Services/workoutPlanService';
import { Exercise, fetchExercisesBulk } from '../../Services/exerciseService';
import { getEventsForDate, useEventsForDate } from '../../Services/calendarEventService';
import { useWorkoutPlans } from '../../Store/workoutPlansSlice';

// exerciseIds are the Free Exercise DB slug ids (e.g. "3_4_Sit-Up"). Used as
// a placeholder label for an id the bulk fetch below hasn't resolved yet.
function humanizeExerciseId(id: string): string {
  return id.replace(/_/g, ' ');
}

// Every half-hour of the day, as "H:MM AM/PM" strings — the full-day grid
// the timeline renders even when a slot has nothing scheduled in it.
// Computed once at module load since it never changes.
const HALF_HOUR_SLOTS: string[] = (() => {
  const slots: string[] = [];
  for (let hour = 0; hour < 24; hour++) {
    const period = hour < 12 ? 'AM' : 'PM';
    const hour12 = hour % 12 === 0 ? 12 : hour % 12;
    slots.push(`${hour12}:00 ${period}`, `${hour12}:30 ${period}`);
  }
  return slots;
})();

const AVATAR_URL =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuAcdSGhuuZvdjCJ0L7R7npJac0qHdys6wmpoA-IZ-StuvlJ70zHTq271zNycsDusMRMHjS_ECIOGJFAmcoG7Er6NJUzKNkT1owV07G25nNf5YCJvqjA8R_gItCNHU6giPmP94Qji1KRtNGc8kBxH2PkNY0dgAGzM-oiO5KdT5c2kHwcCotoOYMKOaWXpeUdpjgiBWON1UcSzCcZHxDKFhlpGfRVjQO9jfG5HL8D_02mSuV4Mxvb6NBLMQ';

export default function ScheduleScreen() {
  const [days, setDays] = useState<WeekDay[]>(weekDays);
  const stripRef = useRef<DateStripHandle>(null);
  const scrollViewRef = useRef<ScrollView>(null);

  // "Upcoming" collapses to a single-line (icon + title + start time) list
  // once the timeline is scrolled — it lives outside the ScrollView (fixed
  // below the date strip), so it's driven off this scroll listener rather
  // than being part of the scrolling content itself. Hysteresis (different
  // thresholds going down vs. up) stops it flickering back and forth when
  // the scroll position sits right at the boundary.
  const [isUpcomingCompact, setIsUpcomingCompact] = useState(false);
  // The actual crossfade/resize animation lives in UpcomingCard/
  // UpcomingSection (Reanimated's entering/exiting/layout transitions) —
  // this just flips the boolean that decides which layout to render.
  const handleTimelineScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const y = e.nativeEvent.contentOffset.y;
      setIsUpcomingCompact((prev) => {
        if (!prev && y > 60) return true;
        if (prev && y < 30) return false;
        return prev;
      });
    },
    [],
  );

  const [selectedDate, setSelectedDate] = useState(new Date());

  // Positions used to auto-scroll to the day's first event — measured via
  // onLayout rather than ref.measureLayout(), which (on this RN/Expo
  // version) throws "must be called with a ref to a native component" when
  // the target is a ScrollView. `timelineY` is where the row list starts
  // within the scroll content; `firstEventRowY` is the first event row's
  // offset within that list. Reset on date change so a stale position from
  // the previous day is never scrolled to while the new day's rows are
  // still laying out.
  const [timelineY, setTimelineY] = useState(0);
  const [firstEventRowY, setFirstEventRowY] = useState<number | null>(null);

  const handleSelectDay = (day: WeekDay) => {
    setDays((prev) => prev.map((d) => ({ ...d, isActive: d.label === day.label })));
  };

  // All plans, kept live by App.tsx's useWorkoutPlansSync() — used below to
  // mark, on the date strip itself, which days actually have an event.
  const workoutPlans = useWorkoutPlans();

  // Recurring plans repeat every week, so this has to work for arbitrary
  // past/future dates on the strip, not just `selectedDate` — reuses the
  // same getEventsForDate() the timeline itself is built from, so a day
  // shows a dot if and only if it would actually render an event.
  const getDayDots = useCallback(
    (date: Date) => {
      return getEventsForDate(date, workoutPlans).length > 0 ? [colors.primary] : [];
    },
    [workoutPlans],
  );

  // Every event (currently: live workout plans) scheduled on the selected
  // date, for the current user — via calendarEventService, which reads
  // from the store already kept live by App.tsx's useWorkoutPlansSync().
  // Ready as soon as this screen mounts, no extra fetch/loading state.
  const events = useEventsForDate(selectedDate);

  // Real exercise names/equipment for the ids on today's events, resolved
  // via POST /exercises/bulk and cached by id (persists across day changes,
  // so flipping back to a previously-seen day never re-fetches).
  const [exerciseCache, setExerciseCache] = useState<Record<string, Exercise>>({});

  const todaysExerciseIds = useMemo(() => {
    const ids = new Set<string>();
    events.forEach((event) => event.exerciseIds.forEach((id) => ids.add(id)));
    return Array.from(ids);
  }, [events]);

  useEffect(() => {
    const missingIds = todaysExerciseIds.filter((id) => !exerciseCache[id]);
    if (missingIds.length === 0) return;

    let cancelled = false;
    fetchExercisesBulk(missingIds)
      .then((exercises) => {
        if (cancelled) return;
        setExerciseCache((prev) => {
          const next = { ...prev };
          exercises.forEach((ex) => {
            next[ex.id] = ex;
          });
          return next;
        });
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [todaysExerciseIds, exerciseCache]);

  // The entire timeline is now built from real event data — no more static
  // ScheduleData.timelineRows mock. Sorted chronologically in case more
  // than one event lands on the same day.
  const planRows: TimelineRowData[] = useMemo(() => {
    const eventRows: TimelineRowData[] = events.map((event) => ({
      id: event.id,
      time: event.time,
      kind: 'cards' as const,
      cards: [
        {
          id: `${event.id}-card`,
          icon: Dumbbell,
          iconColor: colors.primary,
          iconBg: withOpacity(colors.primary, 0.15),
          title: event.title,
          badge: { label: 'Scheduled', variant: 'focus' as const },
          description:
            event.muscles.length > 0
              ? `${event.muscles.join(', ')} · ${event.exerciseIds.length} exercises`
              : `${event.exerciseIds.length} exercises`,
          // Start time only — no session duration is tracked yet, so
          // there's no end time to show.
          timeRange: event.time,
          emphasized: true,
          exercises: event.exerciseIds.map((id) => {
            const details = exerciseCache[id];
            return {
              name: details?.name ?? humanizeExerciseId(id),
              detail: details?.equipment ?? details?.level ?? '',
            };
          }),
          // No calorie-estimation feature yet — flat placeholder until
          // that's built.
          kcal: '0 kcal',
          onStartPress: () => Alert.alert('Start Workout', event.title),
        },
      ],
    }));

    // Fill in every half-hour of the day that doesn't already have an
    // event, as an empty row — so the timeline always shows the full 24h
    // grid instead of only the moments something's scheduled.
    const occupiedMinutes = new Set(eventRows.map((row) => parseTimeToMinutes(row.time)));
    const emptySlotRows: TimelineRowData[] = HALF_HOUR_SLOTS.filter(
      (slot) => !occupiedMinutes.has(parseTimeToMinutes(slot)),
    ).map((slot) => ({
      id: `slot-${slot}`,
      time: slot,
      kind: 'note' as const,
      text: '',
    }));

    return [...eventRows, ...emptySlotRows].sort(
      (a, b) => parseTimeToMinutes(a.time) - parseTimeToMinutes(b.time),
    );
  }, [events, exerciseCache]);

  // Earliest scheduled time for the selected date, independent of
  // exerciseCache — so the auto-scroll below only re-fires when the date
  // (or which events exist) actually changes, not every time an exercise
  // name finishes loading.
  const firstEventTime = useMemo(() => {
    if (events.length === 0) return null;
    return events.reduce(
      (min, event) => Math.min(min, parseTimeToMinutes(event.time)),
      Infinity,
    );
  }, [events]);

  // A new date's rows haven't laid out yet, so any previously-measured
  // first-event position is stale — clear it until the new day's onLayout
  // callbacks (below) report fresh numbers.
  useEffect(() => {
    setFirstEventRowY(null);
  }, [selectedDate]);

  // Auto-scroll the timeline to the first event of whatever date is
  // selected — including the initial date on first mount, not just
  // subsequent taps on the date strip. Fires once firstEventRowY has a
  // fresh value from this date's layout.
  useEffect(() => {
    if (firstEventTime === null || firstEventRowY === null) return;
    scrollViewRef.current?.scrollTo({
      y: Math.max(timelineY + firstEventRowY - 16, 0),
      animated: true,
    });
  }, [selectedDate, firstEventTime, firstEventRowY, timelineY]);

  const handleSelectDate = (date: Date) => setSelectedDate(date);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <StatusBar barStyle="light-content" backgroundColor={colors.surface} />

      <AppHeader sectionLabel="Home" avatarUrl={AVATAR_URL} />

      {/* Fixed at the top — stays put while the timeline below scrolls. */}
      <View style={styles.dateStripBar}>
        <InfiniteDateStrip
          ref={stripRef}
          selectedDate={selectedDate}
          onSelectDate={handleSelectDate}
          getDayDots={getDayDots}
        />
      </View>

      {/* Also fixed, right below the date strip — collapses to one line
          per event once the timeline underneath is scrolled. */}
      <View style={styles.upcomingBar}>
        <UpcomingSection items={upcomingItems} compact={isUpcomingCompact} />
      </View>

      <ScrollView
        ref={scrollViewRef}
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        onScroll={handleTimelineScroll}
        scrollEventThrottle={16}
      >

        <View style={styles.timeline} onLayout={(e) => setTimelineY(e.nativeEvent.layout.y)}>
          {(() => {
            let firstEventAssigned = false;
            return planRows.map((row) => {
              const isFirstEventRow = !firstEventAssigned && row.kind === 'cards';
              if (isFirstEventRow) firstEventAssigned = true;
              return (
                <View
                  key={row.id}
                  onLayout={
                    isFirstEventRow
                      ? (e) => setFirstEventRowY(e.nativeEvent.layout.y)
                      : undefined
                  }
                >
                  <TimelineRow row={row} />
                </View>
              );
            });
          })()}
        </View>

        <AICoachBanner
          message="Your nervous system recovery is at 92%. Based on circadian biorhythms, your peak muscle contractile strength will peak at 6:10 PM."
          planLabel="Perfect Day Plan"
          restLabel="Rest between heavy sets: 90-120s"
        />

        <View style={{ height: spacing.xl }} />
      </ScrollView>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  dateStripBar: {
    backgroundColor: colors.surface,
    paddingVertical: spacing.xs,
    gap: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: withOpacity(colors.border, 0.6),
  },
  upcomingBar: {
    backgroundColor: colors.surface,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: withOpacity(colors.border, 0.6),
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    gap: spacing.lg,
    paddingTop: spacing.xs,
  },
  timeline: {
    paddingHorizontal: spacing.gutterMobile,
  },
});