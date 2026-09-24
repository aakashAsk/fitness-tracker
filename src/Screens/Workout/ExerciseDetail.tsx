// Exercise detail — the "Exercise Detail" screen from the design.
//
// Every section of that design is here. Several of them have no data
// behind them yet, and those render an explicit empty state rather than
// a plausible-looking number:
//
//   REAL      name, level, mechanic, category, equipment, primary and
//             secondary muscles, instructions, images — all from the
//             Free Exercise DB.
//   REAL      1RM and its trend, derived from THIS user's own logged
//             sets (progressService.buildExerciseTrend).
//   EMPTY     cadence tempo, rep range, recovery window — not in the
//             dataset and not inferable.
//   EMPTY     muscle activation percentages. The design labelled these
//             "EMG Telemetry"; there is no EMG data, and inventing a
//             "92% pectoralis activation" figure would be a scientific
//             claim the app cannot support. The section lists which
//             muscles are primary and which are secondary instead —
//             which is real — and says the percentages are unavailable.
//   EMPTY     common mistakes and joint safety. The dataset carries
//             execution steps only.
//
// Dropped rather than faked: the star rating and log count (no ratings
// exist anywhere), the video player with camera angles (the dataset has
// two static images, not 4K video), and the favourite/share buttons
// (nothing would persist a favourite). Add them back when there is
// something behind them.
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import {
  Dumbbell,
  Hourglass,
  Info,
  Repeat,
  ShieldCheck,
  Timer,
  TrendingUp,
  Trophy,
} from 'lucide-react-native';

import { colors, withOpacity } from '../../Theme/colors';
import { radius, spacing } from '../../Theme/spacing';
import { themedStyles } from '../../Theme/ThemeContext';
import EquipmentIcon, { equipmentAccent } from '../../Components/EquipmentIcon';
import { SkeletonBlock, SkeletonGroup } from '../../Components/Skeleton';
import {
  fetchExerciseById,
  getExerciseImageUrl,
  type Exercise,
} from '../../Services/exerciseService';
import { buildExerciseTrend, type ExerciseTrend } from '../../Services/progressService';
import { fetchExerciseLogLookup, todayDateKey } from '../../Services/workoutLogService';

/** Title-cases the dataset's lowercase muscle and equipment strings. */
const titleCase = (value: string): string =>
  value.replace(/\b\w/g, (char) => char.toUpperCase());

const TABS = ['steps', 'mistakes', 'safety'] as const;
type TabKey = (typeof TABS)[number];

const TAB_LABEL: Record<TabKey, string> = {
  steps: 'Execution Steps',
  mistakes: 'Common Mistakes',
  safety: 'Joint Safety',
};

export interface ExerciseDetailProps {
  /** Already-resolved exercise, when the caller has one. */
  exercise?: Exercise;
  /** Otherwise the slug id, fetched on mount. */
  exerciseId?: string;
}

export const ExerciseDetail: React.FC<ExerciseDetailProps> = ({
  exercise: provided,
  exerciseId,
}) => {
  const [exercise, setExercise] = useState<Exercise | null>(provided ?? null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>('steps');

  // Only fetched when the caller passed an id instead of the record.
  useEffect(() => {
    if (provided || !exerciseId) return;

    let active = true;
    setLoadError(null);

    fetchExerciseById(exerciseId)
      .then((result) => {
        if (active) setExercise(result);
      })
      .catch((error: unknown) => {
        if (active) setLoadError((error as Error).message);
      });

    return () => {
      active = false;
    };
  }, [exerciseId, provided]);

  // The user's own history for this lift. Absent for anyone who has not
  // logged it, which is the common case — hence the empty state below
  // rather than a zero.
  const [trend, setTrend] = useState<ExerciseTrend | null>(null);
  const [trendLoading, setTrendLoading] = useState(true);

  useEffect(() => {
    const id = exercise?.id;
    if (!id) return;

    let active = true;
    setTrendLoading(true);

    // history[] is this exercise's completed sessions, already filtered
    // and ordered — the same source the progress card plots from.
    fetchExerciseLogLookup([id], todayDateKey())
      .then((lookup) => {
        if (!active) return;
        setTrend(buildExerciseTrend(lookup.history[id] ?? []));
      })
      // A failed history read must not take the whole screen down: the
      // exercise itself is still perfectly readable without it.
      .catch(() => {
        if (active) setTrend(null);
      })
      .finally(() => {
        if (active) setTrendLoading(false);
      });

    return () => {
      active = false;
    };
  }, [exercise?.id]);

  const imageUrl = useMemo(() => {
    const first = exercise?.images?.[0];
    return first ? getExerciseImageUrl(first) : null;
  }, [exercise?.images]);

  if (loadError) {
    return (
      <View style={styles.root}>
        <View style={styles.centered}>
          <Text style={styles.errorTitle}>Could not load this exercise</Text>
          <Text style={styles.errorBody}>{loadError}</Text>
        </View>
      </View>
    );
  }

  if (!exercise) {
    return (
      <View style={styles.root}>
        <SkeletonGroup style={styles.content}>
          <SkeletonBlock height={190} radius={radius.xl} />
          <SkeletonBlock height={26} radius={radius.full} />
          <SkeletonBlock height={96} radius={radius.lg} />
          <SkeletonBlock height={96} radius={radius.lg} />
        </SkeletonGroup>
      </View>
    );
  }

  const primary = exercise.primaryMuscles ?? [];
  const secondary = exercise.secondaryMuscles ?? [];

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Title block — the design's "CHEST PROTOCOL / name" pair. */}
        <View style={styles.titleBlock}>
          <Text style={styles.eyebrow}>
            {primary.length > 0 ? titleCase(primary[0]) : titleCase(exercise.category)} Protocol
          </Text>
          <Text style={styles.title}>{exercise.name}</Text>
        </View>

        {/* Hero. The dataset ships stills, not the design's video player,
            so there is no play button or camera-angle switcher to wire. */}
        <View style={styles.hero}>
          {imageUrl ? (
            <Image source={{ uri: imageUrl }} style={styles.heroImage} resizeMode="cover" />
          ) : (
            <View style={[styles.heroImage, styles.heroFallback]}>
              <EquipmentIcon equipment={exercise.equipment} size={34} />
            </View>
          )}

          <View style={styles.heroBadgeRow}>
            {exercise.mechanic ? (
              <View style={styles.heroBadge}>
                <Text style={styles.heroBadgeText}>{titleCase(exercise.mechanic)}</Text>
              </View>
            ) : null}
            <View style={styles.heroBadge}>
              <Text style={styles.heroBadgeText}>{titleCase(exercise.level)}</Text>
            </View>
          </View>
        </View>

        {/* Meta strip — muscles and equipment, all real. */}
        <View style={styles.metaStrip}>
          <View style={styles.chipRow}>
            {primary.length > 0 ? (
              <View style={styles.chipPrimary}>
                <Dumbbell size={13} color={colors.primary} strokeWidth={2.4} />
                <Text style={styles.chipPrimaryText}>
                  {primary.map(titleCase).join(' · ')}
                </Text>
              </View>
            ) : null}
            {secondary.length > 0 ? (
              <View style={styles.chipMuted}>
                <Text style={styles.chipMutedText}>{secondary.map(titleCase).join(' · ')}</Text>
              </View>
            ) : null}
          </View>

          <View style={styles.equipmentRow}>
            <EquipmentIcon equipment={exercise.equipment} size={15} />
            <Text style={styles.equipmentText}>
              {exercise.equipment ? titleCase(exercise.equipment) : 'No equipment needed'}
            </Text>
          </View>
        </View>

        {/* Telemetry grid. Only the 1RM tile has a data source today. */}
        <View style={styles.grid}>
          <StatCard
            label="1RM Benchmark"
            Icon={Trophy}
            tone={colors.primary}
            value={trend?.best ? `${Math.round(trend.best)}` : null}
            unit="kg"
            caption={
              trendLoading
                ? 'Reading your logs…'
                : trend?.best
                  ? 'Your best, estimated from logged sets'
                  : 'Log a set to see your estimate'
            }
            loading={trendLoading}
          />
          <StatCard
            label="Cadence Tempo"
            Icon={Timer}
            tone={colors.secondary}
            value={null}
            caption="Not tracked yet"
          />
          <StatCard
            label="Volume Target"
            Icon={Repeat}
            tone={colors.primary}
            value={null}
            caption="Not tracked yet"
          />
          <StatCard
            label="Recovery Window"
            Icon={Hourglass}
            tone={colors.secondary}
            value={null}
            caption="Not tracked yet"
          />
        </View>

        {/* Muscle recruitment. The design's percentages came from "EMG
            telemetry" the app does not have, so the bars are replaced by
            the real primary/secondary split plus a note. */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.cardHeaderLeft}>
              <TrendingUp size={17} color={colors.primary} strokeWidth={2.4} />
              <Text style={styles.cardTitle}>Muscle Recruitment</Text>
            </View>
          </View>

          <View style={styles.muscleList}>
            {primary.map((muscle) => (
              <MuscleRow key={muscle} name={titleCase(muscle)} role="Primary" primary />
            ))}
            {secondary.map((muscle) => (
              <MuscleRow key={muscle} name={titleCase(muscle)} role="Secondary" />
            ))}
            {primary.length === 0 && secondary.length === 0 ? (
              <Text style={styles.emptyBody}>No muscle data for this exercise.</Text>
            ) : null}
          </View>

          <View style={styles.notice}>
            <Info size={14} color={colors.info} strokeWidth={2.4} />
            <Text style={styles.noticeText}>
              Activation percentages need EMG data, which isn’t available yet — these are the
              muscles the exercise targets, in order of involvement.
            </Text>
          </View>
        </View>

        {/* Tabs. Only "Execution Steps" has content in the dataset. */}
        <View style={styles.tabBar}>
          {TABS.map((tab) => {
            const active = tab === activeTab;
            return (
              <TouchableOpacity
                key={tab}
                activeOpacity={0.85}
                onPress={() => setActiveTab(tab)}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                style={[styles.tab, active && styles.tabActive]}
              >
                <Text style={[styles.tabText, active && styles.tabTextActive]}>
                  {TAB_LABEL[tab]}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {activeTab === 'steps' ? (
          exercise.instructions?.length ? (
            <View style={styles.stepList}>
              {exercise.instructions.map((step, index) => (
                <View key={index} style={styles.stepCard}>
                  <View style={[styles.stepIndex, index === 0 && styles.stepIndexFirst]}>
                    <Text
                      style={[styles.stepIndexText, index === 0 && styles.stepIndexTextFirst]}
                    >
                      {index + 1}
                    </Text>
                  </View>
                  <Text style={styles.stepBody}>{step}</Text>
                </View>
              ))}
            </View>
          ) : (
            <EmptyTab
              Icon={Info}
              title="No steps for this exercise"
              body="The exercise database doesn’t carry instructions for this one."
            />
          )
        ) : null}

        {activeTab === 'mistakes' ? (
          <EmptyTab
            Icon={Info}
            title="Common mistakes coming soon"
            body="The exercise database only carries execution steps today, so there’s nothing to show here yet."
          />
        ) : null}

        {activeTab === 'safety' ? (
          <EmptyTab
            Icon={ShieldCheck}
            title="Joint safety notes coming soon"
            body="Warm-up and joint guidance isn’t part of the exercise data yet."
          />
        ) : null}
      </ScrollView>
    </View>
  );
};

/**
 * One tile of the 2x2 grid. A null `value` renders the empty dash rather
 * than a zero — "0 kg" reads as a measurement, "—" reads as absent.
 */
const StatCard: React.FC<{
  label: string;
  Icon: React.ComponentType<any>;
  tone: string;
  value: string | null;
  unit?: string;
  caption: string;
  loading?: boolean;
}> = ({ label, Icon, tone, value, unit, caption, loading }) => (
  <View style={styles.statCard}>
    <View style={styles.statTop}>
      <Text style={styles.statLabel}>{label}</Text>
      <View style={[styles.statIcon, { backgroundColor: withOpacity(tone, 0.12) }]}>
        <Icon size={15} color={tone} strokeWidth={2.4} />
      </View>
    </View>

    {loading ? (
      <ActivityIndicator size="small" color={colors.primary} style={styles.statSpinner} />
    ) : (
      <View style={styles.statValueRow}>
        <Text style={[styles.statValue, !value && styles.statValueEmpty]}>{value ?? '—'}</Text>
        {value && unit ? <Text style={styles.statUnit}>{unit}</Text> : null}
      </View>
    )}

    <Text style={styles.statCaption} numberOfLines={2}>
      {caption}
    </Text>
  </View>
);

const MuscleRow: React.FC<{ name: string; role: string; primary?: boolean }> = ({
  name,
  role,
  primary,
}) => (
  <View style={styles.muscleRow}>
    <View style={[styles.muscleDot, primary ? styles.muscleDotPrimary : null]} />
    <Text style={styles.muscleName}>{name}</Text>
    <View style={[styles.rolePill, primary && styles.rolePillPrimary]}>
      <Text style={[styles.roleText, primary && styles.roleTextPrimary]}>{role}</Text>
    </View>
  </View>
);

const EmptyTab: React.FC<{
  Icon: React.ComponentType<any>;
  title: string;
  body: string;
}> = ({ Icon, title, body }) => (
  <View style={styles.emptyCard}>
    <View style={styles.emptyIcon}>
      <Icon size={19} color={colors.textMuted} strokeWidth={2.2} />
    </View>
    <Text style={styles.emptyTitle}>{title}</Text>
    <Text style={styles.emptyBody}>{body}</Text>
  </View>
);

export default ExerciseDetail;

const styles = themedStyles(() => ({
  root: { flex: 1, backgroundColor: colors.background },

  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
    paddingBottom: spacing['2xl'],
    gap: spacing.md,
  },

  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg, gap: 6 },
  errorTitle: { fontSize: 14, fontWeight: '800', color: colors.textPrimary },
  errorBody: { fontSize: 12, lineHeight: 17, color: colors.textSecondary, textAlign: 'center' },

  titleBlock: { gap: 2 },
  eyebrow: {
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: colors.primary,
  },
  title: { fontSize: 21, fontWeight: '800', letterSpacing: -0.4, color: colors.textPrimary },

  hero: {
    width: '100%',
    height: 190,
    borderRadius: radius.xl,
    overflow: 'hidden',
    backgroundColor: colors.surfaceContainer,
    borderWidth: 1,
    borderColor: colors.border,
  },
  heroImage: { width: '100%', height: '100%' },
  heroFallback: { alignItems: 'center', justifyContent: 'center' },
  heroBadgeRow: {
    position: 'absolute',
    top: spacing.sm,
    left: spacing.sm,
    flexDirection: 'row',
    gap: 6,
  },
  heroBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.full,
    backgroundColor: withOpacity(colors.black, 0.55),
  },
  heroBadgeText: { fontSize: 10.5, fontWeight: '700', color: colors.white },

  metaStrip: { gap: spacing.xs },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chipPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.full,
    backgroundColor: withOpacity(colors.primary, 0.1),
    borderWidth: 1,
    borderColor: withOpacity(colors.primary, 0.18),
  },
  chipPrimaryText: { fontSize: 11.5, fontWeight: '700', color: colors.primary },
  chipMuted: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceLow,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipMutedText: { fontSize: 11.5, fontWeight: '600', color: colors.textSecondary },
  equipmentRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 2 },
  equipmentText: { fontSize: 12, color: colors.textSecondary },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  statCard: {
    // Two per row, with the gap removed from each half.
    width: '48%',
    flexGrow: 1,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 6,
  },
  statTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  statLabel: {
    flex: 1,
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: colors.textSecondary,
  },
  statIcon: { width: 26, height: 26, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center' },
  statSpinner: { alignSelf: 'flex-start', marginVertical: 4 },
  statValueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 3 },
  statValue: { fontSize: 24, fontWeight: '800', letterSpacing: -0.5, color: colors.textPrimary },
  statValueEmpty: { color: colors.textMuted },
  statUnit: { fontSize: 12, fontWeight: '600', color: colors.textSecondary },
  statCaption: { fontSize: 10.5, lineHeight: 14, color: colors.textMuted },

  card: {
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cardTitle: { fontSize: 14.5, fontWeight: '800', color: colors.textPrimary },

  muscleList: { gap: 8 },
  muscleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  muscleDot: {
    width: 7,
    height: 7,
    borderRadius: radius.full,
    backgroundColor: colors.textMuted,
  },
  muscleDotPrimary: { backgroundColor: colors.primary },
  muscleName: { flex: 1, fontSize: 13, fontWeight: '600', color: colors.textPrimary },
  rolePill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceLow,
  },
  rolePillPrimary: { backgroundColor: withOpacity(colors.primary, 0.12) },
  roleText: { fontSize: 10, fontWeight: '700', color: colors.textSecondary },
  roleTextPrimary: { color: colors.primary },

  notice: {
    flexDirection: 'row',
    gap: 8,
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: withOpacity(colors.info, 0.08),
  },
  noticeText: { flex: 1, fontSize: 11, lineHeight: 15.5, color: colors.textSecondary },

  tabBar: {
    flexDirection: 'row',
    gap: 4,
    padding: 4,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceContainer,
  },
  tab: { flex: 1, paddingVertical: 8, borderRadius: radius.DEFAULT, alignItems: 'center' },
  tabActive: { backgroundColor: colors.surface },
  tabText: { fontSize: 11.5, fontWeight: '700', color: colors.textSecondary },
  tabTextActive: { color: colors.textPrimary },

  stepList: { gap: spacing.xs },
  stepCard: {
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  stepIndex: {
    width: 26,
    height: 26,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceLow,
    borderWidth: 1,
    borderColor: colors.border,
  },
  stepIndexFirst: { backgroundColor: colors.primary, borderColor: colors.primary },
  stepIndexText: { fontSize: 12, fontWeight: '800', color: colors.textPrimary },
  stepIndexTextFirst: { color: colors.white },
  stepBody: { flex: 1, fontSize: 13, lineHeight: 19, color: colors.textSecondary },

  emptyCard: {
    alignItems: 'center',
    gap: 6,
    padding: spacing.xl,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  emptyIcon: {
    width: 38,
    height: 38,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceLow,
  },
  emptyTitle: { fontSize: 13.5, fontWeight: '800', color: colors.textPrimary, textAlign: 'center' },
  emptyBody: {
    fontSize: 11.5,
    lineHeight: 16,
    color: colors.textSecondary,
    textAlign: 'center',
  },
}));
