// Exercise library — the browse screen from the design, reached from
// "View All" in the Workout tab.
//
// Layout follows the design closely: search + filter button, the
// "TARGET BIOMECHANICS" muscle carousel, category chips, a featured
// hero card for the first result, compact thumbnail rows for the rest,
// and the floating result capsule.
//
// WHERE IT DIVERGES, AND WHY
// The design carries data this app has no source for. Rather than
// invent it, each slot either shows something real or is dropped:
//
//   design                        here
//   4.9 ★ (1.2k logs)             dropped — no ratings exist anywhere
//   "Primary Chest Activation 94%"  "Primary · Chest" (real)
//   "4 Sets" / "8-12 Reps"        level + mechanic (real)
//   bookmark button               dropped — nothing would persist it
//   "+ Custom"                    dropped — no user-created exercises
//
// Everything else — names, images, muscles, equipment, level, mechanic
// and the per-muscle counts — comes from the Free Exercise DB.
//
// PAGING IS SERVER-SIDE. Every filter — muscle, equipment, mechanic and
// the search term — is a query parameter, and rows arrive a page at a
// time via limit + offset. Nothing is filtered or sliced on the device.
//
// One consequence worth knowing: this API exposes no total-count header
// and no count endpoint, so a result total is unknowable until the list
// has been paged to the end. That is why the muscle pills no longer
// carry a count, and the capsule reports what has loaded rather than
// what exists. A short page is likewise the only end-of-list signal.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Image,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  Activity,
  ChevronLeft,
  ChevronRight,
  Dumbbell as DumbbellIcon,
  Footprints,
  Hand,
  PersonStanding,
  Search,
  Shield,
  SlidersHorizontal,
  X,
} from 'lucide-react-native';

import { colors, withOpacity } from '../../Theme/colors';
import { radius, spacing } from '../../Theme/spacing';
import { themedStyles } from '../../Theme/ThemeContext';
import EquipmentIcon, { equipmentAccent } from '../../Components/EquipmentIcon';
import { SkeletonBlock, SkeletonGroup } from '../../Components/Skeleton';
import {
  fetchExercises,
  fetchMuscles,
  getExerciseImageUrl,
  type Exercise,
  type ExerciseFilters,
} from '../../Services/exerciseService';

const titleCase = (value: string): string =>
  value.replace(/\b\w/g, (char) => char.toUpperCase());

/** Muscle-group glyphs, mirroring the design's per-zone icons. */
const MUSCLE_ICON: Record<string, React.ComponentType<any>> = {
  chest: PersonStanding,
  lats: DumbbellIcon,
  'middle back': DumbbellIcon,
  'lower back': Shield,
  shoulders: Activity,
  biceps: Hand,
  triceps: Hand,
  forearms: Hand,
  abdominals: Shield,
  quadriceps: Footprints,
  hamstrings: Footprints,
  glutes: Footprints,
  calves: Footprints,
  abductors: Footprints,
  adductors: Footprints,
  traps: Activity,
  neck: Activity,
};

const CATEGORY_FILTERS = [
  { key: 'all', label: 'All', field: null },
  { key: 'compound', label: 'Compound', field: 'mechanic' },
  { key: 'isolation', label: 'Isolation', field: 'mechanic' },
  { key: 'barbell', label: 'Barbell', field: 'equipment' },
  { key: 'dumbbell', label: 'Dumbbell', field: 'equipment' },
  { key: 'cable', label: 'Cable', field: 'equipment' },
  { key: 'machine', label: 'Machine', field: 'equipment' },
  { key: 'body only', label: 'Bodyweight', field: 'equipment' },
] as const;

/** Rows per request. Also the end-of-list probe: a shorter page is the
 *  last one. */
const PAGE_SIZE = 12;

export interface ExerciseLibraryProps {
  onBack: () => void;
  onSelectExercise: (exercise: Exercise) => void;
  initialMuscle?: string;
}

export const ExerciseLibrary: React.FC<ExerciseLibraryProps> = ({
  onBack,
  onSelectExercise,
  initialMuscle,
}) => {
  const [items, setItems] = useState<Exercise[]>([]);
  const [error, setError] = useState<string | null>(null);
  // Separate flags: `loading` replaces the whole feed with skeletons,
  // `loadingMore` appends a couple below the existing rows. Conflating
  // them would blank the list on every scroll.
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [reachedEnd, setReachedEnd] = useState(false);

  const [search, setSearch] = useState('');
  const [muscle, setMuscle] = useState<string | null>(initialMuscle ?? null);
  const [category, setCategory] = useState<string>('all');
  const [showFilters, setShowFilters] = useState(true);
  const [autoLoad, setAutoLoad] = useState(false);

  const [muscleZones, setMuscleZones] = useState<string[]>([]);

  useEffect(() => {
    let active = true;
    fetchMuscles()
      .then((list) => {
        if (active) setMuscleZones(list);
      })
      // The carousel is a convenience; search still works without it.
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  /** The current filter set, as the API's query parameters. */
  const filters = useMemo((): ExerciseFilters => {
    const chip = CATEGORY_FILTERS.find((item) => item.key === category);
    return {
      ...(search.trim() ? { search: search.trim() } : {}),
      ...(muscle ? { muscle } : {}),
      ...(chip?.field === 'equipment' ? { equipment: chip.key } : {}),
      ...(chip?.field === 'mechanic' ? { mechanic: chip.key } : {}),
    };
  }, [search, muscle, category]);

  /**
   * Guards against out-of-order replies. Every request takes the token
   * current when it started; a reply whose token has since moved on is
   * from a filter the user has already changed, and is dropped rather
   * than written over the newer results.
   */
  const requestToken = useRef(0);

  /**
   * Set synchronously, unlike the loadingMore state, which React applies
   * asynchronously. onEndReached can fire several times before a state
   * flag catches up, so the state alone cannot stop a burst of duplicate
   * requests for the same offset.
   */
  const inFlight = useRef(false);

  const loadPage = useCallback(
    async (offset: number) => {
      // A page request never supersedes another; only a filter change
      // (offset 0) does.
      if (inFlight.current && offset !== 0) return;
      inFlight.current = true;

      const token = ++requestToken.current;
      if (offset === 0) {
        setLoading(true);
        setError(null);
      } else {
        setLoadingMore(true);
      }

      try {
        const page = await fetchExercises({ ...filters, limit: PAGE_SIZE, offset });
        if (token !== requestToken.current) return;

        setItems((current) => (offset === 0 ? page : [...current, ...page]));
        // The API has no total count and no count endpoint, so a short
        // page is the only end-of-list signal there is.
        setReachedEnd(page.length < PAGE_SIZE);
      } catch (err) {
        if (token !== requestToken.current) return;
        setError((err as Error).message);
      } finally {
        inFlight.current = false;
        if (token === requestToken.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [filters],
  );

  // Refetches from the top whenever the query changes. Debounced so
  // typing costs one request rather than one per keystroke — with the
  // filtering now server-side, every keystroke would otherwise be a
  // round trip.
  useEffect(() => {
    setAutoLoad(false);
    setReachedEnd(false);
    const timer = setTimeout(() => void loadPage(0), 300);
    return () => clearTimeout(timer);
  }, [loadPage]);

  /**
   * Pulls the next page in. FlatList re-evaluates this after the data
   * changes, not only on a scroll gesture — which is what the old
   * onScroll version got wrong: a user who flicked to the bottom and
   * stopped produced no further events, so the list quietly stopped
   * growing and looked hung.
   */
  const handleEndReached = useCallback(() => {
    if (!autoLoad || loading || loadingMore || reachedEnd) return;
    void loadPage(items.length);
  }, [autoLoad, loading, loadingMore, reachedEnd, items.length, loadPage]);

  const activeFilterCount = (muscle ? 1 : 0) + (category !== 'all' ? 1 : 0);
  const [featured, ...rest] = items;

  const clearAll = useCallback(() => {
    setMuscle(null);
    setCategory('all');
  }, []);

  /**
   * Passed as an ELEMENT, never an inline component. Writing
   * `ListHeaderComponent={() => ...}` creates a new component type on
   * every render, so React unmounts and remounts it — which would blur
   * the search field on every keystroke.
   */
  const listHeader = (
    <>
        {/* Search + filter toggle */}
        <View style={styles.searchRow}>
          <View style={styles.searchField}>
            <Search size={17} color={colors.textMuted} strokeWidth={2.2} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search exercises, muscles, equipment"
              placeholderTextColor={colors.textMuted}
              style={styles.searchInput}
              autoCorrect={false}
              returnKeyType="search"
            />
            {search.length > 0 ? (
              <TouchableOpacity
                onPress={() => setSearch('')}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Clear search"
                style={styles.clearButton}
              >
                <X size={12} color={colors.textSecondary} strokeWidth={2.8} />
              </TouchableOpacity>
            ) : null}
          </View>

          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => setShowFilters((value) => !value)}
            accessibilityRole="button"
            accessibilityLabel={showFilters ? 'Hide filters' : 'Show filters'}
            style={[styles.filterButton, showFilters && styles.filterButtonActive]}
          >
            <SlidersHorizontal size={17} color={colors.primary} strokeWidth={2.4} />
            {activeFilterCount > 0 ? (
              <View style={styles.filterBadge}>
                <Text style={styles.filterBadgeText}>{activeFilterCount}</Text>
              </View>
            ) : null}
          </TouchableOpacity>
        </View>

        {showFilters ? (
          <>
            {/* Target biomechanics */}
            <View style={styles.zoneHeader}>
              <View style={styles.zoneHeaderLeft}>
                <View style={styles.zoneDot} />
                <Text style={styles.zoneLabel}>Target biomechanics</Text>
              </View>
              {activeFilterCount > 0 ? (
                <TouchableOpacity onPress={clearAll} hitSlop={8}>
                  <Text style={styles.zoneCount}>Clear filters</Text>
                </TouchableOpacity>
              ) : (
                <Text style={styles.zoneCount}>{muscleZones.length} Primary Zones</Text>
              )}
            </View>

            {muscleZones.length === 0 ? (
              <SkeletonGroup style={styles.carousel}>
                <SkeletonBlock width={150} height={62} radius={radius.full} />
                <SkeletonBlock width={150} height={62} radius={radius.full} />
              </SkeletonGroup>
            ) : (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.carousel}
              >
                {muscleZones.map((zone) => (
                  <MuscleCard
                    key={zone}
                    name={zone}
                    active={muscle === zone}
                    onPress={() => setMuscle(muscle === zone ? null : zone)}
                  />
                ))}
              </ScrollView>
            )}

            {/* Category chips */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipRow}
            >
              {CATEGORY_FILTERS.map((chip) => {
                const active = category === chip.key;
                // "All" reads as "All Chest" once a zone is picked, as
                // in the design.
                const label =
                  chip.key === 'all' && muscle ? `All ${titleCase(muscle)}` : chip.label;
                return (
                  <TouchableOpacity
                    key={chip.key}
                    activeOpacity={0.85}
                    onPress={() => setCategory(chip.key)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    style={[styles.chip, active && styles.chipActive]}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>
                      {label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </>
        ) : null}

      {/* Featured card leads the feed; the rest are FlatList rows. */}
      {!loading && !error && featured ? (
        <View style={styles.featuredWrap}>
          <FeaturedCard exercise={featured} onPress={() => onSelectExercise(featured)} />
        </View>
      ) : null}

      {error ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>Could not load exercises</Text>
          <Text style={styles.emptyBody}>{error}</Text>
        </View>
      ) : loading ? (
        <View style={styles.list}>
          <FeaturedSkeleton />
          <RowSkeleton />
          <RowSkeleton />
          <RowSkeleton />
        </View>
      ) : items.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>No exercises match</Text>
          <Text style={styles.emptyBody}>
            Try a different zone, or clear the search and filters.
          </Text>
        </View>
      ) : null}
    </>
  );

  const listFooter = (
    <View style={styles.footerBlock}>
      {/* Placeholders for the page currently in flight. */}
      {loadingMore ? (
        <>
          <RowSkeleton />
          <RowSkeleton />
        </>
      ) : null}

      {!loading && !error && !reachedEnd && !autoLoad && !loadingMore && items.length > 0 ? (
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => {
            // Hands over to onEndReached, which requests each further
            // page as the bottom comes into range.
            setAutoLoad(true);
            void loadPage(items.length);
          }}
          style={styles.moreButton}
        >
          <Text style={styles.moreText}>Show all exercises</Text>
        </TouchableOpacity>
      ) : null}

      {reachedEnd && items.length > PAGE_SIZE ? (
        <Text style={styles.endOfList}>That&apos;s all {items.length} exercises</Text>
      ) : null}
    </View>
  );

  return (
    <View style={styles.root}>
      {/* Header */}
      <View style={styles.headerRow}>
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel="Back to workout"
          style={styles.backButton}
        >
          <ChevronLeft size={19} color={colors.textPrimary} strokeWidth={2.4} />
        </TouchableOpacity>
        <View style={styles.headerTextBlock}>
          <Text style={styles.headerEyebrow}>PULSEFIT</Text>
          <Text style={styles.headerTitle}>Exercises</Text>
        </View>
        <View style={styles.backButtonSpacer} />
      </View>

      <FlatList
        data={rest}
        keyExtractor={(item: Exercise) => item.id}
        renderItem={({ item }: { item: Exercise }) => (
          <CompactRow exercise={item} onPress={() => onSelectExercise(item)} />
        )}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        // Re-evaluated when the data changes, not only on a gesture, so
        // a user who flicks to the bottom and stops still gets the next
        // page. The old onScroll version stalled there.
        onEndReached={handleEndReached}
        onEndReachedThreshold={0.6}
        // Virtualisation is the other half of the fix: rows outside this
        // window are unmounted, so a long list costs a screenful of
        // views rather than hundreds.
        initialNumToRender={PAGE_SIZE}
        maxToRenderPerBatch={PAGE_SIZE}
        windowSize={7}
        removeClippedSubviews
        ListHeaderComponent={listHeader}
        ListFooterComponent={listFooter}
      />

      {/* Floating result capsule. Counts what has loaded — the total is
          unknowable until the last page proves itself short. */}
      {!loading && !error && items.length > 0 ? (
        <View style={styles.countBar}>
          <View style={styles.countDot} />
          <Text style={styles.countText}>
            {reachedEnd ? 'All ' : 'Showing '}
            <Text style={styles.countStrong}>{items.length}</Text>
            {muscle ? ` ${titleCase(muscle)}` : ''} exercises
          </Text>
        </View>
      ) : null}
    </View>
  );
};

/**
 * Placeholders shaped like the cards they stand in for — same heights,
 * same radii, same gaps. A generic block would make the list jump as
 * real content replaced it.
 */
const FeaturedSkeleton: React.FC = () => (
  <SkeletonGroup style={styles.featured}>
    <SkeletonBlock height={168} radius={0} />
    <View style={styles.featuredBody}>
      <SkeletonBlock width="70%" height={16} />
      <SkeletonBlock width="45%" height={11} radius={5} />
      <View style={styles.featuredTags}>
        <SkeletonBlock width={82} height={24} radius={radius.DEFAULT} />
        <SkeletonBlock width={58} height={24} radius={radius.DEFAULT} />
      </View>
      <View style={styles.skeletonFooter}>
        <SkeletonBlock width="40%" height={11} radius={5} />
      </View>
    </View>
  </SkeletonGroup>
);

const RowSkeleton: React.FC = () => (
  <SkeletonGroup style={styles.row}>
    <SkeletonBlock width={72} height={72} radius={radius.md} />
    <View style={styles.skeletonRowBody}>
      <SkeletonBlock width="72%" height={12} />
      <SkeletonBlock width="48%" height={10} radius={5} />
      <View style={styles.skeletonTagRow}>
        <SkeletonBlock width={54} height={14} radius={radius.sm} />
        <SkeletonBlock width={46} height={14} radius={radius.sm} />
      </View>
    </View>
  </SkeletonGroup>
);

/** A zone pill. The design showed a count beside the name; the API
 *  cannot supply one without fetching every match, so it is omitted
 *  rather than guessed. */
const MuscleCard: React.FC<{
  name: string;
  active: boolean;
  onPress: () => void;
}> = ({ name, active, onPress }) => {
  const Icon = MUSCLE_ICON[name] ?? DumbbellIcon;
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={[styles.muscleCard, active && styles.muscleCardActive]}
    >
      <View style={[styles.muscleIcon, active && styles.muscleIconActive]}>
        <Icon
          size={19}
          color={active ? colors.primary : colors.textMuted}
          strokeWidth={2.2}
        />
      </View>
      <Text style={[styles.muscleName, active && styles.muscleNameActive]}>
        {titleCase(name)}
      </Text>
    </TouchableOpacity>
  );
};

/** The hero card at the top of the feed — the design's featured lift. */
const FeaturedCard: React.FC<{ exercise: Exercise; onPress: () => void }> = ({
  exercise,
  onPress,
}) => {
  const image = exercise.images?.[0] ? getExerciseImageUrl(exercise.images[0]) : null;
  const primary = (exercise.primaryMuscles ?? []).map(titleCase).join(', ');
  const secondary = (exercise.secondaryMuscles ?? []).map(titleCase).join(', ');

  return (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={exercise.name}
      style={styles.featured}
    >
      <View style={styles.featuredBanner}>
        {image ? (
          <Image source={{ uri: image }} style={styles.featuredImage} resizeMode="cover" />
        ) : (
          <View style={[styles.featuredImage, styles.featuredFallback]}>
            <EquipmentIcon equipment={exercise.equipment} size={32} />
          </View>
        )}

        <View style={styles.featuredBadges}>
          {exercise.mechanic ? (
            <View style={styles.featuredBadgeAccent}>
              <Text style={styles.featuredBadgeAccentText}>
                {titleCase(exercise.mechanic)}
              </Text>
            </View>
          ) : null}
          <View style={styles.featuredBadge}>
            <Text style={styles.featuredBadgeText}>{titleCase(exercise.category)}</Text>
          </View>
        </View>
      </View>

      <View style={styles.featuredBody}>
        <View style={styles.featuredTitleRow}>
          <Text style={styles.featuredTitle} numberOfLines={2}>
            {exercise.name}
          </Text>
          <Text style={styles.featuredLevel}>{titleCase(exercise.level)}</Text>
        </View>

        {primary ? (
          <Text style={styles.featuredSubtitle} numberOfLines={2}>
            {[primary, secondary].filter(Boolean).join(' · ')}
          </Text>
        ) : null}

        <View style={styles.featuredTags}>
          {exercise.equipment ? (
            <View style={styles.featuredTag}>
              <EquipmentIcon equipment={exercise.equipment} size={12} />
              <Text style={styles.featuredTagText}>{titleCase(exercise.equipment)}</Text>
            </View>
          ) : null}
          {exercise.force ? (
            <View style={styles.featuredTag}>
              <Text style={styles.featuredTagText}>{titleCase(exercise.force)}</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.featuredFooter}>
          <View style={styles.featuredFooterLeft}>
            <View style={styles.featuredFooterDot} />
            <Text style={styles.featuredFooterText}>
              Primary · <Text style={styles.featuredFooterStrong}>{primary || '—'}</Text>
            </Text>
          </View>
          <View style={styles.featuredCta}>
            <Text style={styles.featuredCtaText}>View Form</Text>
            <ChevronRight size={14} color={colors.primary} strokeWidth={2.8} />
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
};

/** Thumbnail row for everything below the hero. */
const CompactRow: React.FC<{ exercise: Exercise; onPress: () => void }> = ({
  exercise,
  onPress,
}) => {
  const image = exercise.images?.[0] ? getExerciseImageUrl(exercise.images[0]) : null;
  const accent = equipmentAccent(exercise.equipment);
  const muscles = (exercise.primaryMuscles ?? []).map(titleCase).join(' · ');

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={exercise.name}
      style={styles.row}
    >
      <View style={styles.rowThumb}>
        {image ? (
          <Image source={{ uri: image }} style={styles.rowThumbImage} resizeMode="cover" />
        ) : (
          <View style={[styles.rowThumbImage, styles.rowThumbFallback]}>
            <EquipmentIcon equipment={exercise.equipment} size={18} />
          </View>
        )}
        <View style={[styles.rowThumbBadge, { borderColor: withOpacity(accent, 0.4) }]}>
          <EquipmentIcon equipment={exercise.equipment} size={10} />
        </View>
      </View>

      <View style={styles.rowBody}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {exercise.name}
        </Text>
        {muscles ? (
          <Text style={styles.rowSubtitle} numberOfLines={1}>
            {muscles}
          </Text>
        ) : null}

        <View style={styles.rowTags}>
          {exercise.equipment ? (
            <View style={styles.tag}>
              <Text style={styles.tagText}>{titleCase(exercise.equipment)}</Text>
            </View>
          ) : null}
          <View style={styles.tagAccent}>
            <Text style={styles.tagAccentText}>{titleCase(exercise.level)}</Text>
          </View>
          {exercise.mechanic ? (
            <Text style={styles.rowMechanic}>{titleCase(exercise.mechanic)}</Text>
          ) : null}
        </View>
      </View>

      <View style={styles.rowChevron}>
        <ChevronRight size={16} color={colors.primary} strokeWidth={2.6} />
      </View>
    </TouchableOpacity>
  );
};

export default ExerciseLibrary;

const styles = themedStyles(() => ({
  root: { flex: 1, backgroundColor: colors.background },

  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xs,
  },
  headerTextBlock: { flex: 1, alignItems: 'center' },
  headerEyebrow: {
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 1,
    color: colors.textMuted,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.3,
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
  backButtonSpacer: { width: 40 },

  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
    paddingBottom: 76,
    gap: spacing.sm,
  },

  searchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  searchField: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    height: 46,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchInput: { flex: 1, fontSize: 13.5, color: colors.textPrimary, padding: 0 },
  clearButton: {
    width: 19,
    height: 19,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceContainer,
  },
  filterButton: {
    width: 46,
    height: 46,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterButtonActive: {
    backgroundColor: withOpacity(colors.primary, 0.1),
    borderColor: withOpacity(colors.primary, 0.35),
  },
  filterBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.secondary,
  },
  filterBadgeText: { fontSize: 10, fontWeight: '800', color: colors.white },

  zoneHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
  },
  zoneHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  zoneDot: { width: 7, height: 7, borderRadius: radius.full, backgroundColor: colors.primary },
  zoneLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: colors.textSecondary,
  },
  zoneCount: { fontSize: 11.5, fontWeight: '800', color: colors.primary },

  carousel: { gap: 10, paddingVertical: 2, paddingRight: spacing.xs },
  muscleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 9,
    paddingLeft: 9,
    paddingRight: 16,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  muscleCardActive: {
    borderColor: withOpacity(colors.primary, 0.45),
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 4,
  },
  muscleIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceLow,
  },
  muscleIconActive: { backgroundColor: withOpacity(colors.primary, 0.12) },
  muscleName: { fontSize: 14, fontWeight: '800', color: colors.textSecondary },
  muscleNameActive: { color: colors.textPrimary },

  chipRow: { gap: 6, paddingVertical: 2, paddingRight: spacing.xs },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 12, fontWeight: '700', color: colors.textSecondary },
  chipTextActive: { color: colors.white },

  list: { gap: spacing.sm },

  featured: {
    borderRadius: radius.xl,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  featuredBanner: { width: '100%', height: 168, backgroundColor: colors.surfaceContainer },
  featuredImage: { width: '100%', height: '100%' },
  featuredFallback: { alignItems: 'center', justifyContent: 'center' },
  featuredBadges: {
    position: 'absolute',
    top: spacing.sm,
    left: spacing.sm,
    flexDirection: 'row',
    gap: 6,
  },
  featuredBadgeAccent: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.full,
    backgroundColor: withOpacity(colors.secondary, 0.92),
  },
  featuredBadgeAccentText: { fontSize: 10.5, fontWeight: '800', color: colors.white },
  featuredBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.full,
    backgroundColor: withOpacity(colors.white, 0.92),
  },
  featuredBadgeText: { fontSize: 10.5, fontWeight: '700', color: '#111827' },

  featuredBody: { padding: spacing.md, gap: 6 },
  featuredTitleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xs },
  featuredTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.3,
    color: colors.textPrimary,
  },
  featuredLevel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: colors.primary,
    paddingTop: 3,
  },
  featuredSubtitle: { fontSize: 12, lineHeight: 17, color: colors.textSecondary },
  featuredTags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2 },
  featuredTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: radius.DEFAULT,
    backgroundColor: colors.surfaceLow,
    borderWidth: 1,
    borderColor: colors.border,
  },
  featuredTagText: { fontSize: 10.5, fontWeight: '700', color: colors.textPrimary },
  featuredFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.xs,
    marginTop: 8,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  featuredFooterLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  featuredFooterDot: {
    width: 6,
    height: 6,
    borderRadius: radius.full,
    backgroundColor: colors.success,
  },
  featuredFooterText: { flex: 1, fontSize: 11.5, color: colors.textSecondary },
  featuredFooterStrong: { fontWeight: '800', color: colors.textPrimary },
  featuredCta: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  featuredCtaText: { fontSize: 12, fontWeight: '800', color: colors.primary },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: 11,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rowThumb: { width: 72, height: 72, borderRadius: radius.md, overflow: 'visible' },
  rowThumbImage: {
    width: '100%',
    height: '100%',
    borderRadius: radius.md,
    backgroundColor: colors.surfaceContainer,
  },
  rowThumbFallback: { alignItems: 'center', justifyContent: 'center' },
  rowThumbBadge: {
    position: 'absolute',
    right: -3,
    bottom: -3,
    width: 21,
    height: 21,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
  },
  rowBody: { flex: 1, gap: 2 },
  rowTitle: { fontSize: 13.5, fontWeight: '800', color: colors.textPrimary },
  rowSubtitle: { fontSize: 11.5, color: colors.textSecondary },
  rowTags: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 },
  tag: {
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceLow,
  },
  tagText: { fontSize: 9.5, fontWeight: '700', color: colors.textSecondary },
  tagAccent: {
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: radius.sm,
    backgroundColor: withOpacity(colors.primary, 0.12),
  },
  tagAccentText: { fontSize: 9.5, fontWeight: '700', color: colors.primary },
  rowMechanic: { fontSize: 9.5, fontWeight: '600', color: colors.textMuted },
  rowChevron: {
    width: 32,
    height: 32,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceLow,
    borderWidth: 1,
    borderColor: colors.border,
  },

  skeletonFooter: {
    marginTop: 8,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  skeletonRowBody: { flex: 1, gap: 6 },
  skeletonTagRow: { flexDirection: 'row', gap: 5, marginTop: 2 },

  endOfList: {
    textAlign: 'center',
    paddingVertical: spacing.sm,
    fontSize: 11.5,
    fontWeight: '600',
    color: colors.textMuted,
  },

  featuredWrap: { marginBottom: spacing.sm },
  footerBlock: { gap: spacing.sm, paddingTop: spacing.sm },

  moreButton: {
    paddingVertical: 12,
    borderRadius: radius.full,
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  moreText: { fontSize: 12.5, fontWeight: '800', color: colors.primary },

  emptyCard: {
    alignItems: 'center',
    gap: 5,
    padding: spacing.xl,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  emptyTitle: { fontSize: 13.5, fontWeight: '800', color: colors.textPrimary },
  emptyBody: {
    fontSize: 11.5,
    lineHeight: 16,
    color: colors.textSecondary,
    textAlign: 'center',
  },

  countBar: {
    position: 'absolute',
    bottom: spacing.md,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.14,
    shadowRadius: 14,
    elevation: 8,
  },
  countDot: { width: 6, height: 6, borderRadius: radius.full, backgroundColor: colors.success },
  countText: { fontSize: 11.5, fontWeight: '600', color: colors.textSecondary },
  countStrong: { fontWeight: '800', color: colors.primary },
}));
