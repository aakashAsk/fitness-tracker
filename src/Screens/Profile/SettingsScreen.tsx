// Settings — deliberately static. None of these preferences has a
// backing store yet, so the screen presents the intended structure
// without pretending to persist anything: the toggles flip locally for
// feel, and the banner at the top says plainly that nothing is saved.
// When a settings service lands, replace the local state below with it
// and delete the banner.
import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import {
  Bell,
  ChevronLeft,
  ChevronRight,
  Download,
  Dumbbell,
  Info,
  Shield,
  Smartphone,
  SlidersHorizontal,
} from 'lucide-react-native';
import { colors, withOpacity } from '../../Theme/colors';
import { radius, spacing } from '../../Theme/spacing';

/** A row that shows a value and goes nowhere yet. */
interface ValueRow {
  kind: 'value';
  label: string;
  detail: string;
  value: string;
  highlight?: boolean;
}

/** A row with a switch, toggled locally. */
interface ToggleRow {
  kind: 'toggle';
  key: string;
  label: string;
  detail: string;
}

type Row = ValueRow | ToggleRow;

const SECTIONS: { title: string; icon: React.ComponentType<any>; rows: Row[] }[] = [
  {
    title: 'Workout & coaching',
    icon: Dumbbell,
    rows: [
      {
        kind: 'toggle',
        key: 'voiceCoach',
        label: 'Voice & audio coach',
        detail: 'Real-time rep tempo and form cues',
      },
      {
        kind: 'toggle',
        key: 'autoRest',
        label: 'Auto-start rest timer',
        detail: 'Starts the countdown after a logged set',
      },
      {
        kind: 'value',
        label: 'Default rest duration',
        detail: 'Standard compound lifts',
        value: '90 sec',
      },
      {
        kind: 'toggle',
        key: 'haptics',
        label: 'Haptic feedback',
        detail: 'Vibration on set completion and timer end',
      },
    ],
  },
  {
    title: 'Connectivity & wearables',
    icon: Smartphone,
    rows: [
      {
        kind: 'value',
        label: 'Health app sync',
        detail: 'Steps, heart rate, workouts',
        value: 'Not connected',
      },
      {
        kind: 'value',
        label: 'Smart scale',
        detail: 'Automatic weight logging',
        value: 'Not connected',
      },
    ],
  },
  {
    title: 'Preferences & units',
    icon: SlidersHorizontal,
    rows: [
      {
        kind: 'value',
        label: 'Units of measure',
        detail: 'Weight, height, energy',
        value: 'Metric (kg, cm, kcal)',
        highlight: true,
      },
      { kind: 'value', label: 'App theme', detail: 'Display brightness mode', value: 'Light' },
      { kind: 'value', label: 'Week starts on', detail: 'Calendar layout', value: 'Monday' },
    ],
  },
  {
    title: 'Notifications & alerts',
    icon: Bell,
    rows: [
      {
        kind: 'toggle',
        key: 'workoutReminders',
        label: 'Workout reminders',
        detail: 'On your scheduled training days',
      },
      {
        kind: 'toggle',
        key: 'mealReminders',
        label: 'Meal & water check-ins',
        detail: 'Macro milestones and hydration alerts',
      },
      {
        kind: 'toggle',
        key: 'weeklyDigest',
        label: 'Weekly progress digest',
        detail: 'Sunday evening performance recap',
      },
    ],
  },
  {
    title: 'Data & privacy',
    icon: Shield,
    rows: [
      {
        kind: 'value',
        label: 'Export health & workout data',
        detail: 'Full history in CSV or JSON',
        value: 'Export',
      },
      {
        kind: 'toggle',
        key: 'biometricLock',
        label: 'Biometric lock',
        detail: 'Require device unlock to open the app',
      },
      { kind: 'value', label: 'Privacy policy', detail: 'How your data is handled', value: '' },
      { kind: 'value', label: 'Terms of service', detail: '', value: '' },
    ],
  },
];

const DEFAULT_TOGGLES: Record<string, boolean> = {
  voiceCoach: true,
  autoRest: true,
  haptics: true,
  workoutReminders: true,
  mealReminders: true,
  weeklyDigest: false,
  biometricLock: false,
};

export interface SettingsScreenProps {
  onBack: () => void;
}

export const SettingsScreen: React.FC<SettingsScreenProps> = ({ onBack }) => {
  const [toggles, setToggles] = useState<Record<string, boolean>>(DEFAULT_TOGGLES);

  const flip = (key: string) =>
    setToggles(current => ({ ...current, [key]: !current[key] }));

  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.headerRow}>
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel="Back to profile"
          style={styles.backButton}
        >
          <ChevronLeft size={19} color={colors.textPrimary} strokeWidth={2.4} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={styles.backButtonSpacer} />
      </View>

      <View style={styles.notice}>
        <Info size={15} color={colors.info} strokeWidth={2.4} />
        <Text style={styles.noticeText}>
          Preview only — these preferences are not saved yet. Your profile and plans are
          unaffected.
        </Text>
      </View>

      {SECTIONS.map(section => {
        const SectionIcon = section.icon;
        return (
          <View key={section.title} style={styles.section}>
            <View style={styles.sectionHeader}>
              <SectionIcon size={15} color={colors.primary} strokeWidth={2.4} />
              <Text style={styles.sectionTitle}>{section.title}</Text>
            </View>

            <View style={styles.card}>
              {section.rows.map((row, index) => (
                <View key={row.kind === 'toggle' ? row.key : row.label}>
                  {index > 0 ? <View style={styles.divider} /> : null}

                  <View style={styles.row}>
                    <View style={styles.rowBody}>
                      <Text style={styles.rowLabel}>{row.label}</Text>
                      {row.detail ? <Text style={styles.rowDetail}>{row.detail}</Text> : null}
                    </View>

                    {row.kind === 'toggle' ? (
                      <Switch on={toggles[row.key]} onPress={() => flip(row.key)} label={row.label} />
                    ) : (
                      <View style={styles.rowTrailing}>
                        {row.value ? (
                          <View
                            style={[
                              styles.valuePill,
                              row.highlight && {
                                backgroundColor: withOpacity(colors.primary, 0.12),
                              },
                            ]}
                          >
                            <Text
                              style={[
                                styles.valueText,
                                row.highlight && { color: colors.primary },
                              ]}
                            >
                              {row.value}
                            </Text>
                          </View>
                        ) : null}
                        {row.value === 'Export' ? (
                          <Download size={16} color={colors.textMuted} strokeWidth={2.4} />
                        ) : (
                          <ChevronRight size={16} color={colors.textMuted} strokeWidth={2.4} />
                        )}
                      </View>
                    )}
                  </View>
                </View>
              ))}
            </View>
          </View>
        );
      })}

      <Text style={styles.version}>PulseFit • Preferences coming soon</Text>
    </ScrollView>
  );
};

/**
 * RN ships a Switch, but its platform look does not match the rest of
 * the app's surfaces, so this is the same pill used elsewhere.
 */
const Switch: React.FC<{ on: boolean; onPress: () => void; label: string }> = ({
  on,
  onPress,
  label,
}) => (
  <TouchableOpacity
    activeOpacity={0.8}
    onPress={onPress}
    accessibilityRole="switch"
    accessibilityLabel={label}
    accessibilityState={{ checked: on }}
    style={[styles.switch, on && styles.switchOn]}
  >
    <View style={[styles.knob, on && styles.knobOn]} />
  </TouchableOpacity>
);

export default SettingsScreen;

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
    paddingBottom: 24,
    gap: spacing.lg,
  },

  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.4,
    color: colors.textPrimary,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  // Keeps the title optically centred against the back button.
  backButtonSpacer: { width: 40 },

  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: withOpacity(colors.info, 0.1),
  },
  noticeText: { flex: 1, fontSize: 11.5, lineHeight: 16, color: colors.textSecondary },

  section: { gap: spacing.xs },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing['2xs'],
    paddingHorizontal: spacing['2xs'],
  },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: colors.textPrimary },

  card: {
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  divider: { height: 1, backgroundColor: colors.border, marginHorizontal: spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
  },
  rowBody: { flex: 1, gap: 1 },
  rowLabel: { fontSize: 13, fontWeight: '700', color: colors.textPrimary },
  rowDetail: { fontSize: 11, lineHeight: 15, color: colors.textSecondary },
  rowTrailing: { flexDirection: 'row', alignItems: 'center', gap: spacing['2xs'] },
  valuePill: {
    paddingHorizontal: spacing.xs,
    paddingVertical: 4,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceLow,
  },
  valueText: { fontSize: 11, fontWeight: '700', color: colors.textSecondary },

  switch: {
    width: 46,
    height: 27,
    borderRadius: radius.full,
    padding: 3,
    justifyContent: 'center',
    backgroundColor: colors.surfaceContainer,
  },
  switchOn: { backgroundColor: colors.primary },
  knob: {
    width: 21,
    height: 21,
    borderRadius: radius.full,
    backgroundColor: colors.white,
    transform: [{ translateX: 0 }],
  },
  knobOn: { transform: [{ translateX: 19 }] },

  version: {
    textAlign: 'center',
    fontSize: 10.5,
    fontWeight: '600',
    letterSpacing: 0.4,
    color: colors.textMuted,
  },
});
