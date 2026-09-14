import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  View,
  Text,
  Pressable,
  ScrollView,
  TextInput,
  StyleSheet,
} from 'react-native';
import {
  X,
  Search,
  SlidersHorizontal,
  ChevronDown,
  ChevronUp,
  Check,
  Plus,
  ArrowRight,
  Bookmark,
  Info,
  Clock,
} from 'lucide-react-native';
import Animated, { LinearTransition } from 'react-native-reanimated';
import { colors, withOpacity } from '../../Theme/colors';
import { radius } from '../../Theme/spacing';
import { DayKey } from './Types';
import { DAY_ORDER } from './Data';
import {
  Exercise,
  ExerciseApiError,
  fetchExercises,
  getExerciseImageUrl,
} from '../../Services/exerciseService';

export interface NewPlanPayload {
  name: string;
  muscles: string[];
  exerciseIds: string[];
  days: DayKey[];
  /** e.g. "6:30 PM" — the same time slot every selected weekday. */
  time: string;
}

interface NewPlanModalProps {
  onClose: () => void;
  onCreate: (payload: NewPlanPayload) => void;
  onSaveDraft?: (payload: NewPlanPayload) => void;
  /**
   * When provided the sheet edits this existing plan instead of
   * creating a new one — fields start filled in, and the CTA saves the
   * changes back rather than adding another plan.
   */
  initialPlan?: NewPlanPayload;
  /**
   * Restricts the sheet to choosing exercises — the plan name, training
   * days and session time are hidden and passed straight back through
   * unchanged. Used when editing a single date: that date's exercise
   * list is the only thing that can meaningfully differ from the
   * recurring plan, and the schedule fields would imply the plan itself
   * was being rewritten.
   */
  exercisesOnly?: boolean;
  /** "YYYY-MM-DD" of the single day being edited, shown in the header so
   * it is unambiguous that the change is scoped to that date. */
  singleDateLabel?: string;
}

/** Splits a stored "6:30 PM" time back into the dial's three parts. */
function parsePlanTime(time?: string): { hour: number; minute: number; period: 'AM' | 'PM' } {
  const match = time?.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return { hour: 6, minute: 0, period: 'PM' };
  return {
    hour: parseInt(match[1], 10),
    minute: parseInt(match[2], 10),
    period: match[3].toUpperCase() === 'AM' ? 'AM' : 'PM',
  };
}

function toDayRecord(days?: DayKey[]): Record<DayKey, boolean> {
  const selected = new Set(days ?? []);
  return DAY_ORDER.reduce(
    (acc, day) => ({ ...acc, [day]: selected.has(day) }),
    {} as Record<DayKey, boolean>,
  );
}

interface PlanNameFieldProps {
  value: string;
  onChangeText: (text: string) => void;
}

// Isolated so its focus/blur state doesn't re-render the rest of the sheet
// (chip list, exercise list) — that extra work was delaying the border
// highlight from appearing right when the field was tapped.
const PlanNameField = React.memo(({ value, onChangeText }: PlanNameFieldProps) => {
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.inputWrap}>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder="e.g., Push Hypertrophy, Upper Body Power"
        placeholderTextColor={colors.textMuted}
        style={[styles.input, focused && styles.inputFocused]}
      />
      {value.length > 0 && (
        <Pressable
          accessibilityLabel="Clear plan name"
          hitSlop={8}
          onPress={() => onChangeText('')}
          style={styles.inputClearBtn}
        >
          <X size={13} color={colors.onSurfaceVariant} />
        </Pressable>
      )}
    </View>
  );
});

const MUSCLE_CHIPS = ["biceps", "forearms", "chest", "triceps", "shoulders", "lower back",
  "middle back", "neck", "abdominals",
  "abductors",
  "adductors",
  "calves",
  "glutes",
  "hamstrings",
  "lats",
  "quadriceps",
  "traps"];

export const NewPlanModal: React.FC<NewPlanModalProps> = ({
  onClose,
  onCreate,
  onSaveDraft,
  initialPlan,
  exercisesOnly = false,
  singleDateLabel,
}) => {
  const isEditing = !!initialPlan;

  // The sheet is mounted only while it should be open, so Modal would
  // start life already visible — and RN only runs the slide animation
  // on a false -> true transition. Flipping it on the next frame gives
  // it that transition to animate.
  const [isVisible, setIsVisible] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setIsVisible(true));
    return () => cancelAnimationFrame(frame);
  }, []);
  const initialTime = parsePlanTime(initialPlan?.time);

  const [name, setName] = useState(initialPlan?.name ?? 'Hypertrophy Push & Delts');
  const [muscles, setMuscles] = useState<string[]>(initialPlan?.muscles ?? []);
  const [exerciseIds, setExerciseIds] = useState<string[]>(initialPlan?.exerciseIds ?? []);
  const [days, setDays] = useState<Record<DayKey, boolean>>(() => toDayRecord(initialPlan?.days));

  // Session time — the same slot applies to every selected training day.
  const [timeHour, setTimeHour] = useState(initialTime.hour);
  const [timeMinute, setTimeMinute] = useState(initialTime.minute);
  const [timePeriod, setTimePeriod] = useState<'AM' | 'PM'>(initialTime.period);
  const cycleHour = (delta: 1 | -1) =>
    setTimeHour((prev) => {
      const next = prev + delta;
      if (next > 12) return 1;
      if (next < 1) return 12;
      return next;
    });
  const cycleMinute = (delta: 1 | -1) =>
    setTimeMinute((prev) => {
      const next = prev + delta * 5;
      if (next >= 60) return 0;
      if (next < 0) return 55;
      return next;
    });
  const formattedTime = `${timeHour}:${String(timeMinute).padStart(2, '0')} ${timePeriod}`;

  const [exerciseSearch, setExerciseSearch] = useState('');
  const [infoExercise, setInfoExercise] = useState<Exercise | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // Exercises fetched per selected muscle: GET /exercises?muscle={muscle}
  const [exercisesByMuscle, setExercisesByMuscle] = useState<Record<string, Exercise[]>>({});
  const [loadingMuscles, setLoadingMuscles] = useState<Record<string, boolean>>({});
  const [muscleErrors, setMuscleErrors] = useState<Record<string, string>>({});

  const loadExercisesForMuscle = async (muscle: string) => {
    setLoadingMuscles((prev) => ({ ...prev, [muscle]: true }));
    setMuscleErrors((prev) => {
      const { [muscle]: _removed, ...rest } = prev;
      return rest;
    });
    try {
      const data = await fetchExercises({ muscle });
      setExercisesByMuscle((prev) => ({ ...prev, [muscle]: data }));
    } catch (err) {
      setMuscleErrors((prev) => ({
        ...prev,
        [muscle]:
          err instanceof ExerciseApiError ? err.message : 'Failed to load exercises.',
      }));
    } finally {
      setLoadingMuscles((prev) => ({ ...prev, [muscle]: false }));
    }
  };

  // Default exercises shown before any muscle is picked: GET /exercises?limit=5
  const [defaultExercises, setDefaultExercises] = useState<Exercise[]>([]);
  const [isLoadingDefault, setIsLoadingDefault] = useState(false);
  const [defaultError, setDefaultError] = useState<string | undefined>();

  useEffect(() => {
    let cancelled = false;
    setIsLoadingDefault(true);
    fetchExercises({ limit: 5 })
      .then((data) => {
        if (!cancelled) setDefaultExercises(data);
      })
      .catch((err) => {
        if (!cancelled) {
          setDefaultError(
            err instanceof ExerciseApiError ? err.message : 'Failed to load exercises.',
          );
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoadingDefault(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  // An edited plan arrives with muscles already selected, so nothing
  // ever calls toggleMuscle for them — kick off their fetches here
  // instead, once, so the checked exercises have a list to sit in.
  useEffect(() => {
    initialPlan?.muscles.forEach((muscle) => loadExercisesForMuscle(muscle));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleMuscle = (m: string) => {
    setMuscles((prev) => {
      const isSelected = prev.includes(m);

      if (isSelected) {
        // Deselecting — drop the cached exercises fetched for this muscle.
        setExercisesByMuscle((cache) => {
          const { [m]: _removed, ...rest } = cache;
          return rest;
        });
        return prev.filter((x) => x !== m);
      }

      // Newly selected — fetch its exercises: GET /exercises?muscle={m}
      loadExercisesForMuscle(m);
      return [...prev, m];
    });
  };

  const toggleExercise = (id: string) =>
    setExerciseIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );

  // Selected chips float to the front (in the order they were picked),
  // unselected ones keep their original order after that.
  const orderedMuscleChips = useMemo(
    () => [...muscles, ...MUSCLE_CHIPS.filter((m) => !muscles.includes(m))],
    [muscles],
  );

  // Union of every fetched-muscle's exercises, deduped by id.
  const combinedExercises = useMemo(() => {
    const byId = new Map<string, Exercise>();
    muscles.forEach((m) => {
      (exercisesByMuscle[m] ?? []).forEach((ex) => {
        if (!byId.has(ex.id)) byId.set(ex.id, ex);
      });
    });
    return Array.from(byId.values());
  }, [muscles, exercisesByMuscle]);

  // A muscle counts as still loading until its request has actually
  // resolved — not just while `loadingMuscles` says so. On the first
  // render of an edited plan the muscles are already selected but their
  // fetches haven't been kicked off yet, so without the "no data and no
  // error yet" case the list would briefly claim to be empty instead of
  // showing the spinner.
  const isLoadingList = muscles.length > 0
    ? muscles.some(
        (m) => loadingMuscles[m] || (!exercisesByMuscle[m] && !muscleErrors[m]),
      )
    : isLoadingDefault;
  const listErrorText = muscles.length > 0
    ? (muscles.filter((m) => muscleErrors[m]).length > 0
        ? `Couldn't load exercises for: ${muscles.filter((m) => muscleErrors[m]).join(', ')}`
        : undefined)
    : defaultError;

  // What the list actually shows: exercises for the selected muscles, or —
  // before any muscle is picked — the default GET /exercises?limit=5 batch.
  // Kept as its own state (rather than derived directly) so the *previous*
  // list stays on screen — with the loading overlay on top — while a newly
  // selected muscle's request is still in flight, instead of flashing empty.
  const [visibleExercises, setVisibleExercises] = useState<Exercise[]>([]);

  useEffect(() => {
    if (muscles.length === 0) {
      setVisibleExercises(defaultExercises);
      return;
    }
    if (isLoadingList) return; // keep showing the previous list under the spinner
    setVisibleExercises(combinedExercises);
  }, [muscles.length, combinedExercises, isLoadingList, defaultExercises]);

  // Latest selection, readable without making the memo below depend on it.
  const exerciseIdsRef = useRef(exerciseIds);
  exerciseIdsRef.current = exerciseIds;

  // Exercises matching the search box, scoped to the currently loaded list,
  // with everything already selected floated to the top — same idea as the
  // muscle chips, so a long list never hides what you have picked.
  //
  // Deliberately recomputed only when the LIST or the query changes, not on
  // every selection: reordering the instant a box is ticked would yank that
  // row up to the top from under the finger that just tapped it.
  const filteredExercises = useMemo(() => {
    const query = exerciseSearch.trim().toLowerCase();
    const matches = !query
      ? visibleExercises
      : visibleExercises.filter((ex) =>
          ex.name.toLowerCase().includes(query) ||
          ex.primaryMuscles.some((m) => m.toLowerCase().includes(query)) ||
          (ex.equipment ?? '').toLowerCase().includes(query),
        );

    const selected = new Set(exerciseIdsRef.current);
    return [
      ...matches.filter((ex) => selected.has(ex.id)),
      ...matches.filter((ex) => !selected.has(ex.id)),
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleExercises, exerciseSearch]);

  // The exercises an edited plan arrived with. They are exempt from the
  // pruning below: on the first pass `loadingMuscles` is still empty, so
  // nothing reads as loading yet while `combinedExercises` is also still
  // empty — without this the prefilled selection gets wiped before its
  // muscles have even started fetching.
  const initialExerciseIds = useRef(new Set(initialPlan?.exerciseIds ?? []));

  // Drop any checked exercise that fell out of the list (its muscle was deselected).
  useEffect(() => {
    if (isLoadingList || muscles.length === 0) return;
    const validIds = new Set(combinedExercises.map((ex) => ex.id));
    setExerciseIds((prev) =>
      prev.filter((id) => validIds.has(id) || initialExerciseIds.current.has(id)),
    );
  }, [combinedExercises, isLoadingList, muscles.length]);

  // Clear the search box once there's nothing left to search.
  useEffect(() => {
    if (muscles.length === 0) setExerciseSearch('');
  }, [muscles.length]);

  const toggleDay = (d: DayKey) => setDays((prev) => ({ ...prev, [d]: !prev[d] }));

  const activeDays = useMemo(
    () => DAY_ORDER.filter((d) => days[d]) as DayKey[],
    [days],
  );

  const payload: NewPlanPayload = {
    name,
    muscles,
    exerciseIds,
    days: activeDays,
    time: formattedTime,
  };

  const handleCreate = () => {
    // The name is editable in both modes, so it is always validated.
    // The training-day check is not: that field is hidden in
    // exercises-only mode and passes through untouched, so a plan whose
    // days predate the field would otherwise fail validation on
    // something the user was never shown.
    if (!name.trim()) {
      setFormError(exercisesOnly ? 'Please enter a session name.' : 'Please enter a plan name.');
      return;
    }
    if (exerciseIds.length < 3) {
      setFormError('Select at least 3 exercises.');
      return;
    }
    if (!exercisesOnly && activeDays.length < 1) {
      setFormError('Select at least 1 training day.');
      return;
    }
    setFormError(null);
    onCreate(payload);
  };

  // A draft is unfinished by definition, so the exercise and
  // training-day minimums don't apply — but it still needs a name, or
  // it lands in the plan list as an unidentifiable row.
  const handleDraft = () => {
    if (!onSaveDraft) return;
    if (!name.trim()) {
      setFormError('Give the draft a name so you can find it later.');
      return;
    }
    setFormError(null);
    onSaveDraft(payload);
  };

  return (
    <>
    <Modal transparent visible={isVisible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />

        <View style={styles.sheet}>
          {/* Drag pill */}
          <View style={styles.dragBar}>
            <View style={styles.dragPill} />
          </View>

          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerTextWrap}>
              <View style={styles.headerTitleRow}>
                <View style={styles.glowDot} />
                <Text style={styles.headerTitle}>
                  {exercisesOnly
                    ? 'Edit This Day'
                    : isEditing
                      ? 'Edit Workout Plan'
                      : 'New Workout Plan'}
                </Text>
              </View>
              <Text style={styles.headerSubtitle}>
                {exercisesOnly
                  ? singleDateLabel
                    ? `Changes apply to ${singleDateLabel} only — the plan stays as it is`
                    : 'Changes apply to this day only — the plan stays as it is'
                  : isEditing
                    ? 'Update the routine — changes apply everywhere it is scheduled'
                    : 'Set up your precision routine in seconds'}
              </Text>
            </View>
            <Pressable
              accessibilityLabel="Close sheet"
              hitSlop={8}
              onPress={onClose}
              style={({ pressed }) => [styles.closeBtn, pressed && styles.pressedDim]}
            >
              <X size={20} color={colors.onSurfaceVariant} />
            </Pressable>
          </View>

          {/* Scrollable body */}
          <ScrollView
            style={styles.body}
            contentContainerStyle={styles.bodyContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* SECTION 1: PLAN NAME — shown in both modes. Editing a
                single date renames that session alone, since the
                occurrence row carries its own name; the recurring plan
                keeps the one it already had. */}
            <View style={styles.field}>
              <View style={styles.labelRow}>
                <Text style={styles.labelCaps}>
                  {exercisesOnly ? 'SESSION NAME' : 'PLAN NAME'}
                </Text>
                <Text style={styles.requiredText}>Required</Text>
              </View>
              <PlanNameField value={name} onChangeText={setName} />
            </View>

            {/* SECTION 2: TARGET MUSCLE GROUP */}
            <View style={styles.fieldLoose}>
              <View style={styles.labelRow}>
                <Text style={styles.labelCaps}>TARGET MUSCLE GROUP</Text>
                <View style={styles.autoBalancedRow}>
                  <SlidersHorizontal size={13} color={colors.secondary} />
                  <Text style={styles.autoBalancedText}>Auto-balanced</Text>
                </View>
              </View>

              <Pressable style={styles.selectorField}>
                <View style={styles.selectorLeft}>
                  <View style={styles.selectorSwatch} />
                  <Text style={styles.selectorValue} numberOfLines={1}>
                    {muscles.length > 0 ? muscles.join(' & ') : 'Select muscles'}
                  </Text>
                  <View style={styles.selectorBadge}>
                    <Text style={styles.selectorBadgeText}>Selected</Text>
                  </View>
                </View>
                <ChevronDown size={18} color={colors.onSurfaceVariant} />
              </Pressable>

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chipRow}
              >
                {orderedMuscleChips.map((m) => {
                  const selected = muscles.includes(m);
                  return (
                    <Animated.View key={m} layout={LinearTransition.duration(280)}>
                      <Pressable
                        onPress={() => toggleMuscle(m)}
                        style={[styles.chip, selected ? styles.chipActive : styles.chipIdle]}
                      >
                        <Text
                          style={[
                            styles.chipText,
                            selected ? styles.chipTextActive : styles.chipTextIdle,
                          ]}
                        >
                          {m}
                          {selected ? '  ✓' : ''}
                        </Text>
                      </Pressable>
                    </Animated.View>
                  );
                })}
              </ScrollView>
            </View>

            {/* SECTION 3: SELECT EXERCISES */}
            <View style={styles.fieldLoose}>
              <View style={styles.labelRow}>
                <Text style={styles.labelCaps}>
                  SELECT EXERCISES ({exerciseIds.length} Selected)
                </Text>
                <Pressable hitSlop={6} onPress={() => setExerciseIds([])}>
                  <Text style={styles.clearAllText}>Clear all</Text>
                </Pressable>
              </View>

              {visibleExercises.length > 0 && (
                <View style={styles.searchWrap}>
                  <Search size={15} color={colors.textMuted} />
                  <TextInput
                    value={exerciseSearch}
                    onChangeText={setExerciseSearch}
                    placeholder="Search loaded exercises…"
                    placeholderTextColor={colors.textMuted}
                    style={styles.searchInput}
                  />
                  {exerciseSearch.length > 0 && (
                    <Pressable
                      accessibilityLabel="Clear search"
                      hitSlop={8}
                      onPress={() => setExerciseSearch('')}
                    >
                      <X size={14} color={colors.onSurfaceVariant} />
                    </Pressable>
                  )}
                </View>
              )}

              {/* Fixed-height so switching muscles/loading never shifts the sheet. */}
              <View style={styles.exerciseListWrap}>
                {visibleExercises.length === 0 && !isLoadingList ? (
                  <View style={styles.exerciseEmptyBox}>
                    <Text style={styles.emptyStateText}>
                      {muscles.length === 0
                        ? 'No exercises available right now.'
                        : 'No exercises found for the selected muscles.'}
                    </Text>
                  </View>
                ) : filteredExercises.length === 0 && !isLoadingList ? (
                  <View style={styles.exerciseEmptyBox}>
                    <Text style={styles.emptyStateText}>
                      No exercises match "{exerciseSearch}".
                    </Text>
                  </View>
                ) : (
                  <ScrollView
                    style={styles.exerciseList}
                    contentContainerStyle={styles.exerciseListContent}
                    nestedScrollEnabled
                    showsVerticalScrollIndicator={false}
                  >
                    {filteredExercises.map((ex) => {
                      const checked = exerciseIds.includes(ex.id);
                      const meta = [ex.primaryMuscles[0], ex.equipment]
                        .filter(Boolean)
                        .join(' • ');
                      return (
                        <Pressable
                          key={ex.id}
                          onPress={() => toggleExercise(ex.id)}
                          style={[
                            styles.exerciseRow,
                            checked ? styles.exerciseRowChecked : styles.exerciseRowIdle,
                          ]}
                        >
                          <View style={styles.exerciseLeft}>
                            <View
                              style={[
                                styles.checkbox,
                                checked ? styles.checkboxChecked : styles.checkboxIdle,
                              ]}
                            >
                              {checked && (
                                <Check size={14} strokeWidth={3.5} color={colors.onPrimary} />
                              )}
                            </View>
                            <View style={styles.exerciseTextWrap}>
                              <Text
                                style={[
                                  styles.exerciseName,
                                  !checked && styles.exerciseNameIdle,
                                ]}
                                numberOfLines={1}
                              >
                                {ex.name}
                              </Text>
                              <Text style={styles.exerciseMeta} numberOfLines={1}>
                                {meta || 'General'}
                              </Text>
                            </View>
                          </View>
                          <View style={styles.exerciseRight}>
                            <Pressable
                              accessibilityLabel={`More info about ${ex.name}`}
                              hitSlop={8}
                              onPress={() => setInfoExercise(ex)}
                              style={styles.infoBtn}
                            >
                              <Info size={16} color={colors.secondary} />
                            </Pressable>
                            {checked ? (
                              <View style={styles.exerciseTag}>
                                <Text style={styles.exerciseTagText}>{ex.level}</Text>
                              </View>
                            ) : (
                              <Plus size={18} color={colors.textMuted} />
                            )}
                          </View>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                )}

                {isLoadingList && (
                  <View style={styles.exerciseListOverlay}>
                    <ActivityIndicator color={colors.primary} />
                    <Text style={styles.loadingText}>Loading exercises…</Text>
                  </View>
                )}
              </View>

              {listErrorText && <Text style={styles.errorText}>{listErrorText}</Text>}
            </View>

            {/* SECTIONS 4 & 4b: SCHEDULE — hidden when only this date's
                exercise list is being changed, since the recurring
                schedule is not what is being edited then. */}
            {exercisesOnly ? null : (
            <>
            {/* SECTION 4: TRAINING DAYS */}
            <View style={styles.field}>
              <View style={styles.labelRow}>
                <Text style={styles.labelCaps}>SELECT TRAINING DAYS</Text>
                <Text style={styles.daysCountText}>{activeDays.length} DAYS</Text>
              </View>

              <View style={styles.dayGrid}>
                {DAY_ORDER.map((d) => {
                  const active = days[d];
                  return (
                    <Pressable
                      key={d}
                      onPress={() => toggleDay(d)}
                      style={[
                        styles.dayPill,
                        active ? styles.dayPillActive : styles.dayPillIdle,
                      ]}
                    >
                      <Text
                        style={[
                          styles.dayPillText,
                          active ? styles.dayPillTextActive : styles.dayPillTextIdle,
                        ]}
                      >
                        {d.slice(0, 3).toUpperCase()}
                      </Text>
                      {active ? (
                        <Check
                          size={12}
                          strokeWidth={3.5}
                          color={colors.onPrimary}
                          style={styles.dayPillIcon}
                        />
                      ) : (
                        <View style={styles.dayPillDot} />
                      )}
                    </Pressable>
                  );
                })}
              </View>

              <Text style={styles.recurrenceNote}>
                {activeDays.length > 0
                  ? `${activeDays.length} days selected: ${activeDays.join(', ')}`
                  : 'No training days selected'}
              </Text>
            </View>

            {/* SECTION 4b: SESSION TIME — applies to every selected day above */}
            <View style={styles.field}>
              <View style={styles.labelRow}>
                <Text style={styles.labelCaps}>SESSION TIME</Text>
                <View style={styles.autoBalancedRow}>
                  <Clock size={13} color={colors.secondary} />
                  <Text style={styles.autoBalancedText}>Same time every day</Text>
                </View>
              </View>

              <View style={styles.timeDial}>
                <View style={styles.timeStepper}>
                  <Pressable
                    accessibilityLabel="Increase hour"
                    hitSlop={8}
                    onPress={() => cycleHour(1)}
                    style={styles.timeStepBtn}
                  >
                    <ChevronUp size={16} color={colors.onSurfaceVariant} />
                  </Pressable>
                  <Text style={styles.timeValue}>{timeHour}</Text>
                  <Pressable
                    accessibilityLabel="Decrease hour"
                    hitSlop={8}
                    onPress={() => cycleHour(-1)}
                    style={styles.timeStepBtn}
                  >
                    <ChevronDown size={16} color={colors.onSurfaceVariant} />
                  </Pressable>
                </View>

                <Text style={styles.timeColon}>:</Text>

                <View style={styles.timeStepper}>
                  <Pressable
                    accessibilityLabel="Increase minute"
                    hitSlop={8}
                    onPress={() => cycleMinute(1)}
                    style={styles.timeStepBtn}
                  >
                    <ChevronUp size={16} color={colors.onSurfaceVariant} />
                  </Pressable>
                  <Text style={styles.timeValue}>{String(timeMinute).padStart(2, '0')}</Text>
                  <Pressable
                    accessibilityLabel="Decrease minute"
                    hitSlop={8}
                    onPress={() => cycleMinute(-1)}
                    style={styles.timeStepBtn}
                  >
                    <ChevronDown size={16} color={colors.onSurfaceVariant} />
                  </Pressable>
                </View>

                <View style={styles.periodWrap}>
                  {(['AM', 'PM'] as const).map((period) => {
                    const selected = timePeriod === period;
                    return (
                      <Pressable
                        key={period}
                        onPress={() => setTimePeriod(period)}
                        style={[styles.periodBtn, selected ? styles.periodActive : styles.periodIdle]}
                      >
                        <Text
                          style={[
                            styles.periodText,
                            selected ? styles.chipTextActive : styles.chipTextIdle,
                          ]}
                        >
                          {period}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              <Text style={styles.recurrenceNote}>
                {activeDays.length > 0
                  ? `Scheduled ${formattedTime} on ${activeDays.join(', ')}`
                  : 'Pick training days above to see the full schedule'}
              </Text>
            </View>
            </>
            )}
          </ScrollView>

          {/* SECTION 5: ACTION FOOTER */}
          <View style={styles.footer}>
            {formError && <Text style={styles.formErrorText}>{formError}</Text>}

            <View style={styles.ctaGlow}>
              <View style={styles.ctaClip}>
                <Pressable
                  onPress={handleCreate}
                  android_ripple={{ color: colors.primaryDark }}
                  style={styles.ctaBtn}
                >
                  <Text style={styles.ctaText}>
                    {exercisesOnly
                      ? 'Save For This Day'
                      : isEditing
                        ? 'Save Changes'
                        : 'Create Workout Plan'}
                  </Text>
                  <ArrowRight size={20} strokeWidth={2.6} color={colors.onPrimary} />
                </Pressable>
              </View>
            </View>

            {onSaveDraft ? (
              <View style={styles.draftBtnClip}>
                <Pressable
                  onPress={handleDraft}
                  android_ripple={{ color: colors.surfaceContainerHigh }}
                  style={styles.draftBtn}
                >
                  <Bookmark size={16} color={colors.secondary} />
                  <Text style={styles.draftBtnText}>Save as Draft</Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        </View>
      </View>
    </Modal>

    {infoExercise && (
      <Modal
        transparent
        visible
        animationType="fade"
        onRequestClose={() => setInfoExercise(null)}
      >
        <View style={styles.infoOverlay}>
          <Pressable
            style={styles.infoBackdrop}
            onPress={() => setInfoExercise(null)}
          />

          <View style={styles.infoCard}>
            <View style={styles.infoHeader}>
              <Text style={styles.infoTitle} numberOfLines={2}>
                {infoExercise.name}
              </Text>
              <Pressable
                accessibilityLabel="Close exercise info"
                hitSlop={8}
                onPress={() => setInfoExercise(null)}
                style={styles.closeBtn}
              >
                <X size={18} color={colors.onSurfaceVariant} />
              </Pressable>
            </View>

            <ScrollView
              contentContainerStyle={styles.infoBody}
              showsVerticalScrollIndicator={false}
            >
              {infoExercise.images.length > 0 && (
                <View style={styles.infoImageRow}>
                  {infoExercise.images.slice(0, 2).map((img) => (
                    <Image
                      key={img}
                      source={{ uri: getExerciseImageUrl(img) }}
                      style={styles.infoImage}
                      resizeMode="cover"
                    />
                  ))}
                </View>
              )}

              <View style={styles.infoTagRow}>
                <View style={styles.infoTag}>
                  <Text style={styles.infoTagText}>{infoExercise.level}</Text>
                </View>
                {infoExercise.mechanic && (
                  <View style={styles.infoTag}>
                    <Text style={styles.infoTagText}>{infoExercise.mechanic}</Text>
                  </View>
                )}
                {infoExercise.force && (
                  <View style={styles.infoTag}>
                    <Text style={styles.infoTagText}>{infoExercise.force}</Text>
                  </View>
                )}
                <View style={styles.infoTag}>
                  <Text style={styles.infoTagText}>
                    {infoExercise.equipment ?? 'no equipment'}
                  </Text>
                </View>
              </View>

              <View style={styles.infoSection}>
                <Text style={styles.infoSectionLabel}>PRIMARY MUSCLES</Text>
                <Text style={styles.infoSectionValue}>
                  {infoExercise.primaryMuscles.join(', ')}
                </Text>
              </View>

              {infoExercise.secondaryMuscles.length > 0 && (
                <View style={styles.infoSection}>
                  <Text style={styles.infoSectionLabel}>SECONDARY MUSCLES</Text>
                  <Text style={styles.infoSectionValue}>
                    {infoExercise.secondaryMuscles.join(', ')}
                  </Text>
                </View>
              )}

              <View style={styles.infoSection}>
                <Text style={styles.infoSectionLabel}>INSTRUCTIONS</Text>
                {infoExercise.instructions.map((step, i) => (
                  <Text key={i} style={styles.infoInstruction}>
                    {i + 1}. {step}
                  </Text>
                ))}
              </View>
            </ScrollView>

            <Pressable
              onPress={() => {
                toggleExercise(infoExercise.id);
                setInfoExercise(null);
              }}
              style={styles.infoAddBtn}
            >
              {exerciseIds.includes(infoExercise.id) ? (
                <>
                  <Check size={16} strokeWidth={3} color={colors.onPrimary} />
                  <Text style={styles.infoAddBtnText}>Added to Plan</Text>
                </>
              ) : (
                <>
                  <Plus size={16} strokeWidth={2.8} color={colors.onPrimary} />
                  <Text style={styles.infoAddBtnText}>Add to Plan</Text>
                </>
              )}
            </Pressable>
          </View>
        </View>
      </Modal>
    )}
    </>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: withOpacity(colors.black, 0.75),
  },
  sheet: {
    width: '100%',
    maxHeight: '92%',
    backgroundColor: colors.surfaceContainerLow,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: 1,
    borderColor: withOpacity(colors.border, 0.6),
    overflow: 'hidden',
  },

  dragBar: { alignItems: 'center', paddingTop: 12, paddingBottom: 4 },
  dragPill: {
    width: 48,
    height: 5,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceContainerHighest,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: withOpacity(colors.surfaceContainer, 0.5),
  },
  headerTextWrap: { flex: 1, gap: 2 },
  headerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  glowDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.primary,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 6,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.onSurface,
    letterSpacing: -0.3,
  },
  headerSubtitle: { fontSize: 12, color: colors.onSurfaceVariant },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceContainer,
  },
  pressedDim: { opacity: 0.6 },

  body: { flexGrow: 0 },
  bodyContent: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 16,
  },

  field: { gap: 6 },
  fieldLoose: { gap: 8 },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  labelCaps: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    color: colors.onSurfaceVariant,
    textTransform: 'uppercase',
  },
  requiredText: { fontSize: 12, fontWeight: '500', color: colors.primary },

  inputWrap: { position: 'relative', justifyContent: 'center' },
  input: {
    width: '100%',
    height: 44,
    paddingHorizontal: 16,
    paddingRight: 40,
    fontSize: 14,
    borderRadius: radius.md,
    backgroundColor: colors.canvasDeep,
    color: colors.onSurface,
    borderWidth: 1,
    borderColor: withOpacity(colors.border, 0.6),
  },
  inputFocused: {
    borderColor: colors.primary,
    backgroundColor: colors.surfaceContainer,
  },
  inputClearBtn: {
    position: 'absolute',
    right: 10,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceContainerHigh,
  },

  autoBalancedRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  autoBalancedText: { fontSize: 12, fontWeight: '500', color: colors.secondary },

  selectorField: {
    height: 44,
    paddingHorizontal: 14,
    borderRadius: radius.md,
    backgroundColor: colors.canvasDeep,
    borderWidth: 1,
    borderColor: withOpacity(colors.border, 0.6),
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectorLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  selectorSwatch: {
    width: 10,
    height: 10,
    borderRadius: 3,
    backgroundColor: colors.primary,
  },
  selectorValue: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.onSurface,
    flexShrink: 1,
  },
  selectorBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceContainer,
  },
  selectorBadgeText: { fontSize: 11, color: colors.onSurfaceVariant },

  chipRow: { flexDirection: 'row', gap: 6, paddingBottom: 2, paddingRight: 4 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.full,
  },
  chipActive: {
    backgroundColor: colors.primary,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  chipIdle: { backgroundColor: colors.surfaceContainer },
  chipText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  chipTextActive: { color: colors.onPrimary },
  chipTextIdle: { color: colors.onSurfaceVariant },

  clearAllText: { fontSize: 12, fontWeight: '500', color: colors.secondary },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 38,
    paddingHorizontal: 12,
    borderRadius: radius.md,
    backgroundColor: colors.canvasDeep,
    borderWidth: 1,
    borderColor: withOpacity(colors.border, 0.6),
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: colors.onSurface,
    padding: 0,
  },
  emptyStateText: {
    fontSize: 12,
    color: colors.textMuted,
    paddingVertical: 12,
    textAlign: 'center',
  },
  loadingText: { fontSize: 12, color: colors.onSurfaceVariant },
  errorText: { fontSize: 11, color: colors.error, marginTop: 6 },
  // Fixed height regardless of state (loading/empty/populated) so selecting
  // a chip never shifts the rest of the sheet.
  exerciseListWrap: {
    height: 220,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  exerciseEmptyBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  exerciseListOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: withOpacity(colors.canvasDeep, 0.85),
    borderRadius: radius.md,
  },
  exerciseList: { flex: 1 },
  exerciseListContent: { gap: 6, paddingBottom: 2 },
  exerciseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 10,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  exerciseRowChecked: {
    backgroundColor: colors.surfaceContainer,
    borderColor: withOpacity(colors.primary, 0.4),
  },
  exerciseRowIdle: {
    backgroundColor: colors.canvasDeep,
    borderColor: withOpacity(colors.border, 0.6),
  },
  exerciseLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1 },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: colors.primary,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
  },
  checkboxIdle: {
    backgroundColor: colors.surfaceContainerHigh,
    borderWidth: 1,
    borderColor: colors.border,
  },
  exerciseTextWrap: { flexShrink: 1 },
  exerciseName: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.onSurface,
  },
  exerciseNameIdle: { fontWeight: '400', color: colors.onSurfaceVariant },
  exerciseMeta: { fontSize: 12, color: colors.onSurfaceVariant, marginTop: 2 },
  exerciseTag: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.DEFAULT,
    backgroundColor: colors.canvasDeep,
  },
  exerciseTagText: { fontSize: 11, fontWeight: '600', color: colors.primary },

  daysCountText: { fontSize: 11, fontWeight: '700', color: colors.primary },
  dayGrid: { flexDirection: 'row', gap: 6 },
  dayPill: {
    flex: 1,
    height: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayPillActive: {
    backgroundColor: colors.primary,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
  },
  dayPillIdle: {
    backgroundColor: colors.canvasDeep,
    borderWidth: 1,
    borderColor: withOpacity(colors.border, 0.6),
  },
  dayPillText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.4, lineHeight: 12 },
  dayPillTextActive: { color: colors.onPrimary },
  dayPillTextIdle: { color: colors.onSurfaceVariant },
  dayPillIcon: { marginTop: 3 },
  dayPillDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 6,
    backgroundColor: colors.surfaceContainerHighest,
  },
  recurrenceNote: { fontSize: 12, color: colors.onSurfaceVariant, marginTop: 2 },

  timeDial: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderRadius: radius.md,
    backgroundColor: colors.canvasDeep,
    borderWidth: 1,
    borderColor: withOpacity(colors.border, 0.6),
    paddingVertical: 12,
  },
  timeStepper: { alignItems: 'center', gap: 2 },
  timeStepBtn: {
    width: 28,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timeValue: {
    minWidth: 36,
    textAlign: 'center',
    fontSize: 24,
    fontWeight: '800',
    color: colors.onSurface,
  },
  timeColon: { fontSize: 24, fontWeight: '800', color: colors.primary },
  periodWrap: { gap: 4, marginLeft: 8 },
  periodBtn: {
    height: 26,
    paddingHorizontal: 12,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  periodActive: { backgroundColor: colors.primary },
  periodIdle: { backgroundColor: colors.surfaceContainerHigh },
  periodText: { fontSize: 11, fontWeight: '700' },

  footer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 16,
    backgroundColor: colors.surfaceContainerLow,
    borderTopWidth: 1,
    borderTopColor: withOpacity(colors.border, 0.6),
    gap: 8,
  },
  formErrorText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.error,
    textAlign: 'center',
  },
  // Shadow lives on a non-clipping wrapper so it isn't cut off by the clip
  // layer below it.
  ctaGlow: {
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
  },
  // `overflow: 'hidden'` only clips a view's CHILDREN — it does not clip
  // that same view's own native android_ripple foreground. So the ripple
  // has to live on a Pressable that is itself a CHILD of the clipping
  // view, one level below where the shape/background/overflow are set.
  ctaClip: {
    width: '100%',
    height: 48,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.primary,
  },
  ctaBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  ctaBtnPressed: { backgroundColor: colors.primaryDark, transform: [{ scale: 0.98 }] },
  ctaText: { fontSize: 16, fontWeight: '700', color: colors.onPrimary },
  draftBtnClip: {
    width: '100%',
    height: 48,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.surfaceContainer,
    borderWidth: 1,
    borderColor: withOpacity(colors.border, 0.6),
  },
  draftBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  draftBtnText: { fontSize: 16, fontWeight: '700', color: colors.secondary },

  exerciseRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  infoBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: withOpacity(colors.secondary, 0.12),
  },

  // Exercise info popup
  infoOverlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  infoBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: withOpacity(colors.black, 0.75),
  },
  infoCard: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '85%',
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceContainerLow,
    borderWidth: 1,
    borderColor: withOpacity(colors.border, 0.6),
    overflow: 'hidden',
  },
  infoHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: withOpacity(colors.border, 0.6),
  },
  infoTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '800',
    color: colors.onSurface,
    letterSpacing: -0.2,
  },
  infoBody: { padding: 16, gap: 14 },
  infoImageRow: { flexDirection: 'row', gap: 8 },
  infoImage: {
    flex: 1,
    height: 140,
    borderRadius: radius.md,
    backgroundColor: colors.canvasDeep,
  },
  infoTagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  infoTag: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceContainer,
  },
  infoTagText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.onSurfaceVariant,
    textTransform: 'capitalize',
  },
  infoSection: { gap: 4 },
  infoSectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
    color: colors.secondary,
    textTransform: 'uppercase',
  },
  infoSectionValue: {
    fontSize: 13,
    color: colors.onSurface,
    textTransform: 'capitalize',
  },
  infoInstruction: {
    fontSize: 13,
    lineHeight: 19,
    color: colors.onSurfaceVariant,
    marginTop: 4,
  },
  infoAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 48,
    margin: 16,
    marginTop: 0,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
  },
  infoAddBtnText: { fontSize: 14, fontWeight: '700', color: colors.onPrimary },
});

export default NewPlanModal;
