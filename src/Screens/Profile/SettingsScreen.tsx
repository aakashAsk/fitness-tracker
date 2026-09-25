// Settings — almost entirely static. Dark mode is the one preference
// with a real backing store: it applies instantly and is saved to the
// user's profile document. Everything else has none yet, so the screen
// presents the intended structure without pretending to persist
// anything — those toggles flip locally for feel, and the banner says
// plainly that they are not saved. When a settings service lands,
// replace the local state below with it and narrow the banner further.
import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import {
  Bell,
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

import { themedStyles, useTheme } from '../../Theme/ThemeContext';
import { useDialog } from '../../Components/Dialog';
import { useAppDispatch, useAppSelector } from '../../Store/hooks';
import { selectUserProfile, userThemeModeUpdated } from '../../Store/userProfileSlice';
import { saveUserThemeMode } from '../../Services/userProfileService';
import type { ThemeMode } from '../../Theme/colors';
import { useFeatureFlag } from '../../FeatureFlags';
import { PrimaryButton, Stepper } from '../Onboarding/OnboardingUI';

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

/** The dark-mode switch. Unlike ToggleRow this one is real: it drives
    the app's theme and is persisted. */
interface ThemeRow {
  kind: 'theme';
  label: string;
  detail: string;
}

/** The one ValueRow that actually opens something — a popup to change
 * the rest duration, in seconds. Its own kind rather than a generic
 * "onPress" on ValueRow, since it is the only row with a real value to
 * edit right now. */
interface RestDurationRow {
  kind: 'restDuration';
  label: string;
  detail: string;
}

type Row = ValueRow | ToggleRow | ThemeRow | RestDurationRow;

const SECTIONS: {
  title: string;
  icon: React.ComponentType<any>;
  rows: Row[];
  /** Hidden entirely while push notifications are killed. */
  notificationSection?: boolean;
}[] = [
  {
    title: 'Workout',
    icon: Dumbbell,
    rows: [
      {
        kind: 'toggle',
        key: 'autoStartWorkout',
        label: 'Auto-start workout',
        detail: "Starts today's session timer the moment it's due",
      },
      {
        kind: 'toggle',
        key: 'autoRest',
        label: 'Auto-start rest timer',
        detail: 'Starts the countdown after a logged set',
      },
      {
        kind: 'restDuration',
        label: 'Default rest duration',
        detail: 'Standard compound lifts',
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
      {
        kind: 'theme',
        label: 'Dark mode',
        detail: 'Dims every screen to the low-light palette',
      },
      { kind: 'value', label: 'Week starts on', detail: 'Calendar layout', value: 'Monday' },
    ],
  },
  {
    title: 'Notifications & alerts',
    icon: Bell,
    notificationSection: true,
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
  autoStartWorkout: false,
  autoRest: true,
  haptics: true,
  workoutReminders: true,
  mealReminders: true,
  weeklyDigest: false,
  biometricLock: false,
};

const REST_DURATION_MIN_SEC = 15;
const REST_DURATION_MAX_SEC = 300;
const REST_DURATION_STEP_SEC = 15;

export const SettingsScreen: React.FC = () => {
  const [toggles, setToggles] = useState<Record<string, boolean>>(DEFAULT_TOGGLES);

  const flip = (key: string) =>
    setToggles(current => ({ ...current, [key]: !current[key] }));

  // Same "flips locally for feel" contract as the toggles above — see
  // the file header. Held in whole seconds so the stepper's +/- always
  // lands on a clean number rather than drifting with rounding.
  const [restDurationSec, setRestDurationSec] = useState(90);
  const [showRestDurationPicker, setShowRestDurationPicker] = useState(false);
  const adjustRestDuration = (direction: 1 | -1) =>
    setRestDurationSec(current =>
      Math.min(
        REST_DURATION_MAX_SEC,
        Math.max(REST_DURATION_MIN_SEC, current + direction * REST_DURATION_STEP_SEC),
      ),
    );

  const pushDisabled = useFeatureFlag('disabledPushNotification');
  const visibleSections = SECTIONS.filter(
    section => !section.notificationSection || !pushDisabled,
  );

  const { mode, isDark, setModePersisted } = useTheme();
  const dispatch = useAppDispatch();
  const dialog = useDialog();
  const hasProfile = !!useAppSelector(selectUserProfile);

  /**
   * Repaints first, saves second. The switch is the kind of control a
   * user expects to respond on touch, and the write is a round-trip; if
   * it fails we put the theme back rather than leave the app showing a
   * preference that was not stored.
   */
  const applyTheme = async (next: ThemeMode) => {
    const previous = mode;
    setModePersisted(next);
    dispatch(userThemeModeUpdated(next));

    // Signed in but pre-onboarding there is no profile document to
    // merge into; the choice still applies for this session.
    if (!hasProfile) return;

    try {
      await saveUserThemeMode(next);
    } catch (error) {
      setModePersisted(previous);
      dispatch(userThemeModeUpdated(previous));
      dialog.show({
        title: 'Theme not saved',
        message: (error as Error).message,
      });
    }
  };

  return (
    <>
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      {/* No header here — the shared AppTopBar shows the back button and
          "Settings" title while this screen is open (see App.tsx's
          openSettings), so this screen does not duplicate it. */}
      <View style={styles.notice}>
        <Info size={15} color={colors.info} strokeWidth={2.4} />
        <Text style={styles.noticeText}>
          Dark mode is saved to your profile. The other preferences here are a preview —
          they are not stored yet, and your profile and plans are unaffected.
        </Text>
      </View>

      {visibleSections.map(section => {
        const SectionIcon = section.icon;
        return (
          <View key={section.title} style={styles.section}>
            <View style={styles.sectionHeader}>
              <SectionIcon size={15} color={colors.primary} strokeWidth={2.4} />
              <Text style={styles.sectionTitle}>{section.title}</Text>
            </View>

            <View style={styles.card}>
              {section.rows.map((row, index) => {
                const isRestDuration = row.kind === 'restDuration';
                return (
                  <View key={row.label}>
                    {index > 0 ? <View style={styles.divider} /> : null}

                    <TouchableOpacity
                      style={styles.row}
                      activeOpacity={isRestDuration ? 0.7 : 1}
                      disabled={!isRestDuration}
                      onPress={isRestDuration ? () => setShowRestDurationPicker(true) : undefined}
                      accessibilityRole={isRestDuration ? 'button' : undefined}
                      accessibilityLabel={
                        isRestDuration ? `${row.label}, ${restDurationSec} seconds` : undefined
                      }
                    >
                      <View style={styles.rowBody}>
                        <Text style={styles.rowLabel}>{row.label}</Text>
                        {row.detail ? <Text style={styles.rowDetail}>{row.detail}</Text> : null}
                      </View>

                      {row.kind === 'theme' ? (
                        <Switch
                          on={isDark}
                          onPress={() => applyTheme(isDark ? 'light' : 'dark')}
                          label={row.label}
                        />
                      ) : row.kind === 'toggle' ? (
                        <Switch on={toggles[row.key]} onPress={() => flip(row.key)} label={row.label} />
                      ) : row.kind === 'restDuration' ? (
                        <View style={styles.rowTrailing}>
                          <View style={styles.valuePill}>
                            <Text style={styles.valueText}>{restDurationSec} sec</Text>
                          </View>
                          <ChevronRight size={16} color={colors.textMuted} strokeWidth={2.4} />
                        </View>
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
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>
          </View>
        );
      })}

      <Text style={styles.version}>PulseFit • Preferences coming soon</Text>
    </ScrollView>

    <Modal
      transparent
      visible={showRestDurationPicker}
      animationType="fade"
      onRequestClose={() => setShowRestDurationPicker(false)}
    >
      <Pressable
        style={pickerStyles.overlay}
        onPress={() => setShowRestDurationPicker(false)}
      >
        {/* Swallows the tap so it doesn't fall through to the overlay's
            own onPress and close the popup the moment it opens. */}
        <Pressable style={pickerStyles.card} onPress={() => undefined}>
          <Text style={pickerStyles.title}>Default rest duration</Text>
          <Text style={pickerStyles.subtitle}>
            How long the rest timer counts down for, unless a set overrides it.
          </Text>

          <View style={pickerStyles.stepperWrap}>
            <Stepper
              value={String(restDurationSec)}
              unit="sec"
              accessibilityLabel="default rest duration"
              onDecrement={() => adjustRestDuration(-1)}
              onIncrement={() => adjustRestDuration(1)}
              decrementDisabled={restDurationSec <= REST_DURATION_MIN_SEC}
              incrementDisabled={restDurationSec >= REST_DURATION_MAX_SEC}
            />
          </View>

          <PrimaryButton label="Done" onPress={() => setShowRestDurationPicker(false)} />
        </Pressable>
      </Pressable>
    </Modal>
    </>
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

const pickerStyles = themedStyles(() => ({
  overlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    backgroundColor: 'rgba(17, 24, 39, 0.5)',
  },
  card: {
    width: '100%',
    maxWidth: 320,
    padding: spacing.lg,
    borderRadius: radius.xl,
    backgroundColor: colors.surface,
    gap: spacing.md,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.2,
    shadowRadius: 28,
    elevation: 14,
  },
  title: {
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.3,
    color: colors.textPrimary,
  },
  subtitle: {
    marginTop: -8,
    fontSize: 12.5,
    lineHeight: 18,
    color: colors.textSecondary,
  },
  stepperWrap: { marginVertical: 4 },
}));

const styles = themedStyles(() => ({
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
    paddingBottom: 24,
    gap: spacing.lg,
  },


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
}));
