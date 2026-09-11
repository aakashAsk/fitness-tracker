import React, { useMemo, useRef, useState } from 'react';
import { View, ScrollView, StyleSheet, StatusBar, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../../Theme/colors';
import { spacing } from '../../Theme/spacing';

import AppHeader from './AppHeader';
import ScheduleTitleBar from './ScheduleTitleBar';
import { DateStripHandle } from './DateNavigator';
import WeekStrip, { WeekDay } from './WeekStrip';
import ViewToggle, { ScheduleView } from './ViewToggle';
import UpcomingSection from './UpcomingSection';
import TimelineRow from './TimelineRow';
import AICoachBanner from './AICoachBanner';

import { weekDays, upcomingItems, timelineRows } from './ScheduleData';
import InfiniteDateStrip from './DateNavigator';

const AVATAR_URL =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuAcdSGhuuZvdjCJ0L7R7npJac0qHdys6wmpoA-IZ-StuvlJ70zHTq271zNycsDusMRMHjS_ECIOGJFAmcoG7Er6NJUzKNkT1owV07G25nNf5YCJvqjA8R_gItCNHU6giPmP94Qji1KRtNGc8kBxH2PkNY0dgAGzM-oiO5KdT5c2kHwcCotoOYMKOaWXpeUdpjgiBWON1UcSzCcZHxDKFhlpGfRVjQO9jfG5HL8D_02mSuV4Mxvb6NBLMQ';

export default function ScheduleScreen() {
  const [days, setDays] = useState<WeekDay[]>(weekDays);
  const [view, setView] = useState<ScheduleView>('day');
  const stripRef = useRef<DateStripHandle>(null);
  const [selectedDate, setSelectedDate] = useState(new Date());

  const rowsWithHandlers = useMemo(
    () =>
      timelineRows.map((row) => {
        if (row.kind !== 'cards') return row;
        return {
          ...row,
          cards: row.cards.map((card: any) =>
            card.id === 'push-day-main'
              ? { ...card, onStartPress: () => Alert.alert('Start Workout', 'Push Day: Hypertrophy') }
              : card
          ),
        };
      }),
    []
  );

  const handleSelectDay = (day: WeekDay) => {
    setDays((prev) => prev.map((d) => ({ ...d, isActive: d.label === day.label })));
  };

  const onSelectedDate = () => {
    console.log('Selected Date:', selectedDate);
    return (date: Date) => {
      setSelectedDate(date);
      console.log('Date selected:', date);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <StatusBar barStyle="light-content" backgroundColor={colors.surface} />

      <AppHeader sectionLabel="Home" avatarUrl={AVATAR_URL} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <ScheduleTitleBar
          onFilterPress={() => Alert.alert('Filter')}
          onAddPress={() => Alert.alert('Add event')}
        />

        <InfiniteDateStrip
          ref={stripRef}
          selectedDate={selectedDate}
          onSelectDate={onSelectedDate()}
        />

        

        <ViewToggle activeView={view} onChange={setView} eventsPlannedCount={7} />

        <UpcomingSection items={upcomingItems} />

        <View style={styles.timeline}>
          {rowsWithHandlers.map((row) => (
            <TimelineRow key={row.id} row={row} />
          ))}
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