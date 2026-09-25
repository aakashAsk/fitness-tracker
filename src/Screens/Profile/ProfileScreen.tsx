// Profile tab — reads the onboarding profile written by
// userProfileService and shows what the app has actually calibrated
// against. Every number here is loaded, never hard-coded: if a value
// looks wrong, the fix belongs in onboarding or the formulas, not here.
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { signOut } from '@firebase/auth';
import {
  Activity,
  Armchair,
  Camera,
  ChevronRight,
  Dumbbell,
  Flame,
  HeartPulse,
  Lightbulb,
  LogOut,
  Salad,
  Settings as SettingsIcon,
  Target,
  User,
  Utensils,
  Zap,
} from 'lucide-react-native';
import { auth } from '../../Firebase/firebaseConfig';
import { colors, withOpacity } from '../../Theme/colors';
import { radius, spacing } from '../../Theme/spacing';
import { clearCachedThemeMode } from '../../Theme/themeStorage';
import { clearStepLedger } from '../../Services/stepService';
import { useDialog } from '../../Components/Dialog';
import { useHardwareBack } from '../../Hooks/useHardwareBack';
import { SkeletonBlock, SkeletonGroup } from '../../Components/Skeleton';
import {
  ActivityLevel,
  FitnessGoal,
  Gender,
  Obstacle,
  saveUserPhotoUrl,
  UserProfile,
} from '../../Services/userProfileService';
import { useAppDispatch, useAppSelector } from '../../Store/hooks';
import {
  selectUserProfile,
  selectUserProfileError,
  selectUserProfileStatus,
  userPhotoUpdated,
  useRefreshUserProfile,
} from '../../Store/userProfileSlice';
import UserAvatar from '../../Components/UserAvatar';
import {
  AvatarError,
  AvatarSource,
  pickAvatar,
  uploadAvatar,
} from '../../Services/avatarService';
import SettingsScreen from './SettingsScreen';
import { themedStyles } from '../../Theme/ThemeContext';

const GENDER_LABEL: Record<Gender, string> = {
  male: 'Male',
  female: 'Female',
  other: 'Other',
};

const GOAL_LABEL: Record<FitnessGoal, string> = {
  hypertrophy: 'Build Muscle',
  'fat-loss': 'Lose Fat',
  'weight-loss': 'Lose Weight',
  'weight-gain': 'Gain Weight',
  endurance: 'Endurance',
  maintenance: 'Maintain',
};

const ACTIVITY_LABEL: Record<ActivityLevel, { title: string; detail: string }> = {
  sedentary: { title: 'Sedentary', detail: 'Desk job, little movement' },
  light: { title: 'Light', detail: '1–3 days active / wk' },
  moderate: { title: 'Moderate', detail: '3–5 days active / wk' },
  very_active: { title: 'Very Active', detail: '6–7 days active / wk' },
};

const ACTIVITY_ICON: Record<ActivityLevel, React.ComponentType<any>> = {
  sedentary: Armchair,
  light: Activity,
  moderate: Dumbbell,
  very_active: HeartPulse,
};

const PACE_LABEL: Record<number, string> = {
  0.25: 'Gentle',
  0.5: 'Steady',
  0.75: 'Aggressive',
};

const OBSTACLE_LABEL: Record<Obstacle, string> = {
  consistency: 'Lack of Consistency',
  'eating-habits': 'Unhealthy Eating Habits',
  support: 'Lack of Support',
  'busy-schedule': 'Busy Schedule',
  'meal-inspiration': 'Lack of Meal Inspiration',
};

const round1 = (n: number): number => Math.round(n * 10) / 10;

/** 178 -> "5'10"". */
function formatFeetInches(heightCm: number): string {
  const totalInches = Math.round(heightCm / 2.54);
  return `${Math.floor(totalInches / 12)}'${totalInches % 12}"`;
}

/** "1998-03-15" -> "Mar 15, 1998". Null for a profile saved before
 * birthDate existed — callers fall back to not showing it. */
function formatBirthDate(iso: string | null): string | null {
  if (!iso) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatMemberSince(date: Date | null): string {
  if (!date) return 'Member';
  return `Member since ${date.toLocaleString('en-US', {
    month: 'short',
    year: 'numeric',
  })}`;
}

export interface ProfileScreenProps {
  /** Settings is opened from the shared AppTopBar's gear icon now, not a
      header inside this screen — see App.tsx, which owns this state the
      same way it owns the Workout tab's subScreen. */
  showSettings: boolean;
  onShowSettingsChange: (show: boolean) => void;
}

export const ProfileScreen: React.FC<ProfileScreenProps> = ({
  showSettings,
  onShowSettingsChange,
}) => {
  const dialog = useDialog();
  // A hardware back press while Settings is open should close Settings,
  // not exit the app — see useHardwareBack.ts.
  const closeSettings = useCallback(() => {
    onShowSettingsChange(false);
    return true;
  }, [onShowSettingsChange]);
  useHardwareBack(closeSettings, showSettings);

  // Read from the store, which App.tsx populated once at startup —
  // this screen no longer fetches on mount, so opening the tab is
  // instant and shows exactly what the dashboard shows.
  const dispatch = useAppDispatch();
  const profile = useAppSelector(selectUserProfile);
  const status = useAppSelector(selectUserProfileStatus);
  const errorMessage = useAppSelector(selectUserProfileError);
  const refreshProfile = useRefreshUserProfile();

  const [refreshing, setRefreshing] = useState(false);

  const loading = status === 'idle' || (status === 'loading' && !profile);

  const handleRefresh = async () => {
    setRefreshing(true);
    await refreshProfile();
    setRefreshing(false);
  };

  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const changePhoto = async (source: AvatarSource) => {
    try {
      const image = await pickAvatar(source);
      // Backed out of the picker or the crop screen — nothing to do,
      // and nothing worth telling them about.
      if (!image) return;

      setUploadingPhoto(true);
      const photoURL = await uploadAvatar(image);
      await saveUserPhotoUrl(photoURL);

      // Into the store rather than local state, so the dashboard's
      // avatar updates at the same moment this one does.
      dispatch(userPhotoUpdated(photoURL));
    } catch (error) {
      const isPermission = error instanceof AvatarError && error.permissionDenied;
      dialog.show({
        title: isPermission ? 'Permission needed' : 'Could not update your picture',
        message: (error as Error).message,
      });
    } finally {
      setUploadingPhoto(false);
    }
  };

  const openPhotoOptions = () => {
    dialog.show({
      title: 'Profile picture',
      message: 'Choose where to get your picture from. You can crop it before it uploads.',
      actions: [
        { label: 'Cancel', style: 'cancel' },
        { label: 'Take photo', onPress: () => changePhoto('camera') },
        { label: 'Choose from files', onPress: () => changePhoto('library') },
      ],
    });
  };

  // Signing out flips onAuthStateChanged in App.tsx, which unmounts this
  // screen — so there is nothing to do after it resolves.
  const handleLogout = () => {
    dialog.show({
      title: 'Log out?',
      message: 'You will need to sign in again to reach your plans and logs.',
      actions: [
        { label: 'Cancel', style: 'cancel' },
        {
          label: 'Log out',
          style: 'destructive',
          onPress: () => {
            // Dropped before the sign-out so the next account does not
            // open in this one's theme. The preference itself survives
            // in their profile document.
            void clearCachedThemeMode();
            // Likewise the device-local step tally — it belongs to
            // whoever was walking, not to the next person to sign in.
            void clearStepLedger();
            signOut(auth).catch(error =>
              dialog.show({ title: 'Could not log out', message: (error as Error).message }),
            );
          },
        },
      ],
    });
  };

  if (showSettings) {
    return <SettingsScreen />;
  }

  const email = auth.currentUser?.email ?? 'Signed in';

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={handleRefresh}
          tintColor={colors.primary}
        />
      }
    >
      {/* Identity — the email is the only thing we have for a name until
          a display-name field exists. */}
      <View style={styles.identity}>
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={openPhotoOptions}
          disabled={uploadingPhoto}
          accessibilityRole="button"
          accessibilityLabel="Change profile picture"
          style={styles.avatarWrapper}
        >
          <UserAvatar size={84} iconSize={34} />

          {/* Covers the picture while the upload is in flight, so the
              old one is not left looking like the new one. */}
          {uploadingPhoto ? (
            <View style={styles.avatarUploading}>
              <ActivityIndicator color={colors.white} />
            </View>
          ) : null}

          <View style={styles.avatarBadge}>
            <Camera size={14} color={colors.white} strokeWidth={2.6} />
          </View>
        </TouchableOpacity>
        <Text style={styles.identityEmail} numberOfLines={1}>
          {email}
        </Text>
        <Text style={styles.identityMeta}>
          {formatMemberSince(profile?.createdAt ?? null)}
          {profile ? ` • ${GOAL_LABEL[profile.goal]}` : ''}
        </Text>
      </View>

      {loading ? (
        <ProfileSkeleton />
      ) : errorMessage ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{errorMessage}</Text>
          <TouchableOpacity onPress={handleRefresh} activeOpacity={0.8}>
            <Text style={styles.errorRetry}>Tap to retry</Text>
          </TouchableOpacity>
        </View>
      ) : !profile ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>No profile yet</Text>
          <Text style={styles.emptyText}>
            Your calibration data appears here once onboarding is complete.
          </Text>
        </View>
      ) : (
        <ProfileBody profile={profile} />
      )}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Account</Text>
        <View style={styles.menuCard}>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => onShowSettingsChange(true)}
            style={styles.menuRow}
          >
            <View style={[styles.menuIcon, { backgroundColor: withOpacity(colors.primary, 0.12) }]}>
              <SettingsIcon size={16} color={colors.primary} strokeWidth={2.4} />
            </View>
            <View style={styles.menuBody}>
              <Text style={styles.menuLabel}>Settings & Preferences</Text>
              <Text style={styles.menuDetail}>Units, notifications, privacy</Text>
            </View>
            <ChevronRight size={17} color={colors.textMuted} strokeWidth={2.4} />
          </TouchableOpacity>
        </View>

        <TouchableOpacity activeOpacity={0.85} onPress={handleLogout} style={styles.logoutButton}>
          <LogOut size={16} color={colors.white} strokeWidth={2.4} />
          <Text style={styles.logoutText}>Log out</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
};

/** Everything that depends on a loaded profile. */
const ProfileBody: React.FC<{ profile: UserProfile }> = ({ profile }) => {
  const activity = ACTIVITY_LABEL[profile.activityLevel];
  const ActivityIcon = ACTIVITY_ICON[profile.activityLevel];
  const calorieDelta = profile.dailyCalorieTarget - profile.tdee;

  return (
    <>
      {/* Quick biometrics strip */}
      <View style={styles.quickStrip}>
        <QuickStat
          label="Age"
          value={`${profile.age} yrs`}
          caption={formatBirthDate(profile.birthDate) ?? undefined}
        />
        <View style={styles.quickDivider} />
        <QuickStat
          label="Height"
          value={`${Math.round(profile.heightCm)} cm`}
          caption={formatFeetInches(profile.heightCm)}
        />
        <View style={styles.quickDivider} />
        <QuickStat
          label="Weight"
          value={`${profile.weightKg.toFixed(1)} kg`}
          valueColor={colors.primary}
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Physical attributes & calibration</Text>

        <View style={styles.card}>
          <View style={styles.metricGrid}>
            <MetricTile
              label="Biological context"
              value={GENDER_LABEL[profile.gender]}
              caption={`BMR: ${profile.bmr.toLocaleString()} kcal/day`}
              captionColor={colors.primary}
              icon={<User size={15} color={colors.primary} strokeWidth={2.4} />}
              tint={colors.primary}
            />
            <MetricTile
              label="Activity tier"
              value={activity.title}
              caption={activity.detail}
              icon={<ActivityIcon size={15} color={colors.success} strokeWidth={2.4} />}
              tint={colors.success}
            />
            <MetricTile
              label="Weekly pace"
              value={PACE_LABEL[profile.weeklyPaceKg] ?? 'Steady'}
              caption={
                profile.goal === 'fat-loss' || profile.goal === 'weight-loss'
                  ? `-${profile.weeklyPaceKg} kg/wk`
                  : 'Not applied to this goal'
              }
              captionColor={
                profile.goal === 'fat-loss' || profile.goal === 'weight-loss'
                  ? colors.secondary
                  : undefined
              }
              icon={<Flame size={15} color={colors.secondary} strokeWidth={2.4} />}
              tint={colors.secondary}
            />
            <MetricTile
              label="Daily intake target"
              value={`${profile.dailyCalorieTarget.toLocaleString()} kcal`}
              caption={
                calorieDelta === 0
                  ? 'At maintenance'
                  : `${calorieDelta > 0 ? '+' : ''}${calorieDelta} kcal vs TDEE`
              }
              captionColor={calorieDelta === 0 ? undefined : colors.secondary}
              icon={<Utensils size={15} color={colors.primary} strokeWidth={2.4} />}
              tint={colors.primary}
              valueColor={colors.primary}
            />
            <MetricTile
              label="Target weight"
              value={`${profile.targetWeightKg.toFixed(1)} kg`}
              caption={(() => {
                const delta = round1(profile.targetWeightKg - profile.weightKg);
                if (delta === 0) return 'Already there';
                return `${delta > 0 ? '+' : ''}${delta} kg to go`;
              })()}
              captionColor={
                profile.targetWeightKg === profile.weightKg ? colors.success : colors.secondary
              }
              icon={<Target size={15} color={colors.success} strokeWidth={2.4} />}
              tint={colors.success}
            />
            <MetricTile
              label="Main obstacle"
              value={OBSTACLE_LABEL[profile.obstacle]}
              caption="What we're helping you work around"
              icon={<Lightbulb size={15} color={colors.secondary} strokeWidth={2.4} />}
              tint={colors.secondary}
            />
          </View>

          <View style={styles.tdeeBanner}>
            <View style={styles.tdeeIcon}>
              <Zap size={15} color={colors.white} strokeWidth={2.6} />
            </View>
            <Text style={styles.tdeeText}>
              Total daily expenditure (TDEE) is{' '}
              <Text style={styles.tdeeStrong}>{profile.tdee.toLocaleString()} kcal</Text>. Your
              macro split is weighted for {GOAL_LABEL[profile.goal].toLowerCase()}.
            </Text>
          </View>

          <View style={styles.macroRow}>
            <MacroPill label="Protein" grams={profile.macros.proteinG} color={colors.protein} />
            <MacroPill label="Carbs" grams={profile.macros.carbsG} color={colors.carbs} />
            <MacroPill label="Fats" grams={profile.macros.fatsG} color={colors.fats} />
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Health protocols & guardrails</Text>

        <TagCard
          title="Joint guardrails"
          icon={<HeartPulse size={15} color={colors.primary} strokeWidth={2.4} />}
          tint={colors.primary}
          tags={profile.injuries}
          emptyLabel="No injuries flagged"
          footer={
            profile.injuries.length
              ? 'Workouts avoid high-strain movements for these areas.'
              : 'Add areas during recalibration to filter high-strain movements.'
          }
        />

        <TagCard
          title="Dietary protocols"
          icon={<Salad size={15} color={colors.secondary} strokeWidth={2.4} />}
          tint={colors.secondary}
          tags={profile.dietaryPreferences}
          emptyLabel="Standard — no restrictions"
          footer={
            profile.dietaryPreferences.length
              ? 'Meal suggestions and macro splits respect these restrictions.'
              : 'All meal suggestions are available to you.'
          }
        />
      </View>
    </>
  );
};

const QuickStat: React.FC<{
  label: string;
  value: string;
  caption?: string;
  valueColor?: string;
}> = ({ label, value, caption, valueColor }) => (
  <View style={styles.quickStat}>
    <Text style={styles.quickLabel}>{label}</Text>
    <Text style={[styles.quickValue, valueColor ? { color: valueColor } : null]}>{value}</Text>
    {caption ? <Text style={styles.quickCaption}>{caption}</Text> : null}
  </View>
);

const MetricTile: React.FC<{
  label: string;
  value: string;
  caption: string;
  captionColor?: string;
  icon: React.ReactNode;
  tint: string;
  valueColor?: string;
}> = ({ label, value, caption, captionColor, icon, tint, valueColor }) => (
  <View style={[styles.metricTile, { backgroundColor: withOpacity(tint, 0.06) }]}>
    <Text style={styles.metricLabel}>{label.toUpperCase()}</Text>
    <View style={styles.metricValueRow}>
      {icon}
      <Text style={[styles.metricValue, valueColor ? { color: valueColor } : null]}>{value}</Text>
    </View>
    <Text style={[styles.metricCaption, captionColor ? { color: captionColor } : null]}>
      {caption}
    </Text>
  </View>
);

const MacroPill: React.FC<{ label: string; grams: number; color: string }> = ({
  label,
  grams,
  color,
}) => (
  <View style={[styles.macroPill, { backgroundColor: withOpacity(color, 0.12) }]}>
    <Text style={[styles.macroValue, { color }]}>{grams}g</Text>
    <Text style={styles.macroLabel}>{label}</Text>
  </View>
);

const TagCard: React.FC<{
  title: string;
  icon: React.ReactNode;
  tint: string;
  tags: string[];
  emptyLabel: string;
  footer: string;
}> = ({ title, icon, tint, tags, emptyLabel, footer }) => (
  <View style={styles.card}>
    <View style={styles.tagHeader}>
      <View style={[styles.tagIcon, { backgroundColor: withOpacity(tint, 0.12) }]}>{icon}</View>
      <Text style={styles.tagTitle}>{title}</Text>
      {tags.length ? (
        <View style={[styles.countPill, { backgroundColor: withOpacity(tint, 0.12) }]}>
          <Text style={[styles.countText, { color: tint }]}>{tags.length} active</Text>
        </View>
      ) : null}
    </View>

    <View style={styles.tagWrap}>
      {tags.length ? (
        tags.map(tag => (
          <View key={tag} style={[styles.tag, { backgroundColor: tint }]}>
            <Text style={styles.tagText}>{tag}</Text>
          </View>
        ))
      ) : (
        <View style={[styles.tag, styles.tagEmpty]}>
          <Text style={styles.tagEmptyText}>{emptyLabel}</Text>
        </View>
      )}
    </View>

    <Text style={styles.tagFooter}>{footer}</Text>
  </View>
);

const ProfileSkeleton: React.FC = () => (
  <SkeletonGroup style={styles.skeleton}>
    <SkeletonBlock height={64} radius={radius.lg} />
    <SkeletonBlock height={180} radius={radius.lg} />
    <SkeletonBlock height={120} radius={radius.lg} />
  </SkeletonGroup>
);

export default ProfileScreen;

const styles = themedStyles(() => ({
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
    paddingBottom: 24,
    gap: spacing.lg,
  },

  identity: { alignItems: 'center', gap: 4 },
  // Holds the badge, which sits outside the avatar's clipped circle.
  avatarWrapper: { marginBottom: spacing['2xs'] },
  avatarUploading: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: withOpacity(colors.black, 0.45),
  },
  avatarBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 30,
    height: 30,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.secondary,
    // Separates the badge from the avatar behind it.
    borderWidth: 2.5,
    borderColor: colors.background,
  },
  identityEmail: {
    maxWidth: '100%',
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.3,
    color: colors.textPrimary,
  },
  identityMeta: { fontSize: 12, fontWeight: '600', color: colors.textSecondary },

  quickStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.sm,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  quickStat: { flex: 1, alignItems: 'center', gap: 1 },
  quickDivider: { width: 1, height: 28, backgroundColor: colors.border },
  quickLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: colors.textMuted,
  },
  quickValue: { fontSize: 15, fontWeight: '800', color: colors.textPrimary },
  quickCaption: { fontSize: 10, color: colors.textMuted },

  section: { gap: spacing.xs },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
    color: colors.textSecondary,
    paddingHorizontal: spacing['2xs'],
  },

  card: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },

  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  metricTile: {
    // Two per row: half the width minus half the gap.
    width: '48.5%',
    flexGrow: 1,
    gap: 2,
    padding: spacing.sm,
    borderRadius: radius.md,
  },
  metricLabel: {
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 0.4,
    color: colors.textMuted,
  },
  metricValueRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  metricValue: {
    flexShrink: 1,
    fontSize: 15,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  metricCaption: { fontSize: 10.5, fontWeight: '600', color: colors.textSecondary },

  tdeeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceLow,
  },
  tdeeIcon: {
    width: 28,
    height: 28,
    borderRadius: radius.DEFAULT,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  tdeeText: { flex: 1, fontSize: 11.5, lineHeight: 16, color: colors.textSecondary },
  tdeeStrong: { fontWeight: '800', color: colors.textPrimary },

  macroRow: { flexDirection: 'row', gap: spacing.xs },
  macroPill: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.xs,
    borderRadius: radius.md,
  },
  macroValue: { fontSize: 15, fontWeight: '800' },
  macroLabel: { fontSize: 10.5, fontWeight: '600', color: colors.textSecondary },

  tagHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  tagIcon: {
    width: 28,
    height: 28,
    borderRadius: radius.DEFAULT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tagTitle: { flex: 1, fontSize: 13, fontWeight: '700', color: colors.textPrimary },
  countPill: { paddingHorizontal: spacing.xs, paddingVertical: 2, borderRadius: radius.full },
  countText: { fontSize: 10, fontWeight: '800' },
  tagWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing['2xs'] },
  tag: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radius.full,
  },
  tagText: { fontSize: 11.5, fontWeight: '700', color: colors.white },
  tagEmpty: { backgroundColor: colors.surfaceLow },
  tagEmptyText: { fontSize: 11.5, fontWeight: '600', color: colors.textSecondary },
  tagFooter: { fontSize: 11, lineHeight: 15, color: colors.textMuted },

  menuCard: {
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
  },
  menuIcon: {
    width: 32,
    height: 32,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuBody: { flex: 1 },
  menuLabel: { fontSize: 13, fontWeight: '700', color: colors.textPrimary },
  menuDetail: { fontSize: 11, color: colors.textSecondary },

  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.lg,
    // Solid danger fill rather than a white button with a red outline —
    // logging out is destructive enough to read as such at a glance.
    backgroundColor: colors.error,
    marginTop: spacing['2xs'],
  },
  logoutText: { fontSize: 13, fontWeight: '800', color: colors.white },

  skeleton: { gap: spacing.sm },

  errorBanner: {
    gap: 4,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: withOpacity(colors.error, 0.1),
  },
  errorText: { fontSize: 12.5, fontWeight: '600', color: colors.error },
  errorRetry: { fontSize: 12, fontWeight: '800', color: colors.error },

  emptyCard: {
    gap: 4,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  emptyTitle: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  emptyText: { fontSize: 12, lineHeight: 17, color: colors.textSecondary },
}));
