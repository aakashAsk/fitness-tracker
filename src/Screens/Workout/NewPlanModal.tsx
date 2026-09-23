import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Keyboard,
  Modal,
  View,
  Text,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  } from 'react-native';
import {
  X,
  Search,
  SlidersHorizontal,
  Check,
  Plus,
  ArrowRight,
  Bookmark,
  Info,
  Clock,
  ChevronLeft,
  Dumbbell,
  Minus,
  Zap,
  ListFilter,
} from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { LinearTransition } from 'react-native-reanimated';
import { colors, withOpacity } from '../../Theme/colors';
import TimeDial from '../../Components/TimeDial';
import { radius } from '../../Theme/spacing';
import { DayKey } from './Types';
import {
  describeMissingTarget,
  isRestCategory,
  isTargetCategory,
  MAX_TARGET_KM,
  MAX_TARGET_MINUTES,
  parseTarget,
  PLAN_CATEGORIES,
  usesDistanceTarget,
  type PlanCategory,
} from '../../Services/planCategory';
import { DAY_ORDER, todayDayKey } from './Data';
import {
  Exercise,
  ExerciseApiError,
  fetchExercises,
  getExerciseImageUrl,
} from '../../Services/exerciseService';
import { themedStyles, useTheme } from '../../Theme/ThemeContext';

export interface NewPlanPayload {
  name: string;
  muscles: string[];
  exerciseIds: string[];
  days: DayKey[];
  /** e.g. "6:30 PM" — the same time slot every selected weekday. */
  time: string;
  /** Absent on plans saved before categories existed, which read as 'workout'. */
  category?: PlanCategory;
  /** Cardio, cycling and walking plans only. */
  targetKm?: number;
  targetMinutes?: number;
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
  /**
   * Fills the whole display like a screen instead of rising from the
   * bottom as a sheet: no backdrop, grabber or rounded top, and the body
   * takes all the height between the header and the footer.
   */
  fullScreen?: boolean;
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

  // Subscribes to the theme purely so a switch reaches this component:
  // React.memo blocks re-renders coming from the parent, but a context
  // consumer still re-renders when the context value changes. Without
  // this the field keeps its old palette until the sheet is reopened.
  useTheme();
  return (
    <View style={styles.inputWrap}>
      <View style={styles.inputLeadingIcon} pointerEvents="none">
        <Zap size={17} color={colors.primary} strokeWidth={2.2} />
      </View>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder="e.g. Upper Body Hypertrophy"
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

// The thumb's travel is the button height plus the tray gap, so all
// three have to agree — hence the shared constants.

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

/** Rows added each time the exercise list is scrolled near its end. */
const EXERCISE_PAGE_SIZE = 12;
/** How close to the end of the list (dp) to load the next page — about
    two rows early, so the next page is in place before the user reaches it. */
const EXERCISE_PAGE_TRIGGER = 240;

interface ExerciseRowProps {
  exercise: Exercise;
  checked: boolean;
  onToggle: (id: string) => void;
  onInfo: (exercise: Exercise) => void;
}

/**
 * One row of the exercise picker.
 *
 * Memoized, with stable callbacks passed in, so ticking one exercise
 * re-renders that row and not every row already on screen — each of which
 * holds a thumbnail image.
 */
const ExerciseRow = memo<ExerciseRowProps>(({ exercise: ex, checked, onToggle, onInfo }) => {
  const meta = [ex.primaryMuscles[0], ex.equipment].filter(Boolean).join(' • ');

  return (
    <Pressable
      onPress={() => onToggle(ex.id)}
      style={[styles.exerciseRow, checked ? styles.exerciseRowChecked : styles.exerciseRowIdle]}
    >
      <View style={styles.exerciseThumb}>
        {ex.images[0] ? (
          <Image
            source={{ uri: getExerciseImageUrl(ex.images[0]) }}
            style={styles.exerciseThumbImage}
            resizeMode="cover"
            // The source is an 850×567 JPEG shown in a 60dp box. 'resize'
            // makes Android decode it at the displayed size instead of
            // full size — the default keeps the full bitmap in memory,
            // about 2 MB per row.
            resizeMethod="resize"
          />
        ) : (
          <Dumbbell size={22} color={colors.textMuted} strokeWidth={2} />
        )}
        {ex.mechanic ? (
          <View style={styles.exerciseThumbTag}>
            <Text style={styles.exerciseThumbTagText}>{ex.mechanic}</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.exerciseTextWrap}>
        <Text style={styles.exerciseName} numberOfLines={1}>
          {ex.name}
        </Text>
        {meta ? (
          <Text style={styles.exerciseMeta} numberOfLines={1}>
            {meta}
          </Text>
        ) : null}
        <View style={styles.exerciseLevelPill}>
          <Text style={styles.exerciseLevelText}>{ex.level}</Text>
        </View>
      </View>

      <View style={styles.exerciseRight}>
        <Pressable
          accessibilityLabel={`More info about ${ex.name}`}
          hitSlop={8}
          onPress={() => onInfo(ex)}
          style={styles.roundBtn}
        >
          <Info size={15} color={colors.primary} strokeWidth={2.4} />
        </Pressable>
        <View
          style={[styles.roundBtn, checked && styles.roundBtnRemove]}
          accessibilityLabel={checked ? 'Selected' : 'Not selected'}
        >
          {checked ? (
            <Minus size={16} color={colors.secondary} strokeWidth={2.6} />
          ) : (
            <Plus size={16} color={colors.textSecondary} strokeWidth={2.6} />
          )}
        </View>
      </View>
    </Pressable>
  );
});

export const NewPlanModal: React.FC<NewPlanModalProps> = ({
  onClose,
  onCreate,
  onSaveDraft,
  initialPlan,
  exercisesOnly = false,
  singleDateLabel,
  fullScreen = false,
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

  const [name, setName] = useState(initialPlan?.name ?? '');
  const [category, setCategory] = useState<PlanCategory>(initialPlan?.category ?? 'workout');
  const [targetKm, setTargetKm] = useState(
    initialPlan?.targetKm !== undefined ? String(initialPlan.targetKm) : '',
  );
  const [targetMinutes, setTargetMinutes] = useState(
    initialPlan?.targetMinutes !== undefined ? String(initialPlan.targetMinutes) : '',
  );
  // Cardio, cycling and walking are planned by distance and time, not by
  // an exercise list. Editing a single day only ever changes exercises.
  const isTarget = !exercisesOnly && isTargetCategory(category);
  // Swimming is planned by time in the pool alone — no distance.
  const showDistance = isTarget && usesDistanceTarget(category);
  // A rest / recovery day is only the days it falls on: no time,
  // exercises or targets.
  const isRest = !exercisesOnly && isRestCategory(category);
  const [muscles, setMuscles] = useState<string[]>(initialPlan?.muscles ?? []);
  const [exerciseIds, setExerciseIds] = useState<string[]>(initialPlan?.exerciseIds ?? []);
  // A new plan starts on today's weekday — the day the user is almost
  // always thinking about when they open this. An existing plan keeps
  // exactly the days it was saved with, including none.
  const [days, setDays] = useState<Record<DayKey, boolean>>(() =>
    toDayRecord(initialPlan ? initialPlan.days : [todayDayKey()]),
  );

  // Session time — the same slot applies to every selected training day.
  const [timeHour, setTimeHour] = useState(initialTime.hour);
  const [timeMinute, setTimeMinute] = useState(initialTime.minute);
  const [timePeriod, setTimePeriod] = useState<'AM' | 'PM'>(initialTime.period);
  const formattedTime = `${timeHour}:${String(timeMinute).padStart(2, '0')} ${timePeriod}`;
  // The dial only takes space once the user asks to change the time.
  const [timeOpen, setTimeOpen] = useState(false);

  // How much of the screen the keyboard currently covers. Tracked
  // explicitly rather than via KeyboardAvoidingView: inside a Modal on
  // Android that component frequently measures nothing, which is what
  // left the exercise search box sitting behind the keypad.
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  useEffect(() => {
    // iOS fires the "will" events ahead of the animation, so the sheet
    // moves in step with the keyboard instead of snapping after it.
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvent, (event) =>
      setKeyboardHeight(event.endCoordinates?.height ?? 0),
    );
    const hideSub = Keyboard.addListener(hideEvent, () => setKeyboardHeight(0));

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);


  // Lets focusing the search box scroll its section to the top of the
  // sheet — shrinking the sheet alone isn't enough when the field
  // started out below the fold.
  const bodyRef = useRef<ScrollView>(null);
  const exerciseSectionY = useRef(0);


  // The modal's own content box, measured rather than assumed. An RN
  // <Modal> on Android is a separate window: it does not inherit the
  // activity's adjustResize, and its height is not the app window's.
  // Measuring is the only thing that is true on both platforms.
  const [overlayHeight, setOverlayHeight] = useState(0);

  // The modal window is full-screen (statusBarTranslucent), so the
  // system bars overlap it unless their insets are subtracted here.
  const insets = useSafeAreaInsets();

  // Lift the sheet clear of the keyboard, and cap it so that lift can
  // never push its top off the screen. Correct whether or not the
  // window itself resized: either way the sheet plus its lift comes to
  // the measured height minus the gap.
  const sheetSizing = fullScreen
    ? // A screen fills the window: only the keyboard lift and the status
      // bar inset are needed, and no measured cap.
      {
        flex: 1,
        marginBottom: keyboardHeight,
        paddingTop: insets.top,
        borderTopLeftRadius: 0,
        borderTopRightRadius: 0,
      }
    : overlayHeight > 0
      ? {
          marginBottom: keyboardHeight,
          // Top inset keeps a tall sheet clear of the status bar; the
          // bottom one is handled by the footer's own padding, so it is
          // not subtracted twice here.
          maxHeight: Math.max(overlayHeight - keyboardHeight - insets.top - 24, 220),
        }
      : undefined;

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

  // Stable identity (functional update, no captured state) so the memoized
  // exercise rows below are not re-rendered by every unrelated state change.
  const toggleExercise = useCallback(
    (id: string) =>
      setExerciseIds((prev) =>
        prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
      ),
    [],
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

  // The list is rendered a page at a time, growing as the user scrolls,
  // rather than all at once. A muscle has 84–148 exercises and the sheet
  // opens with three muscles picked, so the whole list is 300+ rows — and
  // each row carries a network thumbnail (an 850×567 JPEG). Mounting them
  // all at once meant hundreds of simultaneous downloads and decodes, which
  // is what made the sheet hang while scrolling.
  const [shownCount, setShownCount] = useState(EXERCISE_PAGE_SIZE);
  const filteredCountRef = useRef(0);
  filteredCountRef.current = filteredExercises.length;

  // A new list or a new search starts over from the first page.
  useEffect(() => {
    setShownCount(EXERCISE_PAGE_SIZE);
  }, [filteredExercises]);

  const shownExercises = useMemo(
    () => filteredExercises.slice(0, shownCount),
    [filteredExercises, shownCount],
  );

  const onExerciseListScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, layoutMeasurement, contentSize } = event.nativeEvent;
    const remaining = contentSize.height - (contentOffset.y + layoutMeasurement.height);
    if (remaining > EXERCISE_PAGE_TRIGGER) return;
    // Clamped to the list length, so once everything is shown this sets the
    // value it already has and React skips the render.
    setShownCount((count) => Math.min(count + EXERCISE_PAGE_SIZE, filteredCountRef.current));
  }, []);

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

  const parsedKm = showDistance ? parseTarget(targetKm, MAX_TARGET_KM) : undefined;
  const parsedMinutes = isTarget ? parseTarget(targetMinutes, MAX_TARGET_MINUTES) : undefined;

  const payload: NewPlanPayload = {
    name,
    muscles: isTarget || isRest ? [] : muscles,
    exerciseIds: isTarget || isRest ? [] : exerciseIds,
    days: activeDays,
    time: isRest ? '' : formattedTime,
    // A single-day edit passes the category through untouched.
    ...(exercisesOnly ? {} : { category }),
    ...(parsedKm !== undefined ? { targetKm: parsedKm } : {}),
    ...(parsedMinutes !== undefined ? { targetMinutes: parsedMinutes } : {}),
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
    if (isTarget) {
      const missing = describeMissingTarget(category, parsedKm, parsedMinutes);
      if (missing) {
        setFormError(missing);
        return;
      }
    } else if (!isRest && exerciseIds.length < 3) {
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

  // Muscle and exercise pickers: not for rest days or distance/time plans.
  const showPickers = !isRest && !isTarget;

  return (
    <>
    <Modal
      transparent
      visible={isVisible}
      animationType="slide"
      onRequestClose={onClose}
      // Makes the modal window full-screen, so the height measured
      // below and the keyboard height reported by Keyboard events are
      // in the same coordinate space.
      statusBarTranslucent
      navigationBarTranslucent
    >
      <View
        style={styles.overlay}
        onLayout={(event) => setOverlayHeight(event.nativeEvent.layout.height)}
      >
        {fullScreen ? null : <Pressable style={styles.backdrop} onPress={onClose} />}

        <View style={[styles.sheet, sheetSizing]}>
          {/* Drag pill — a sheet affordance, meaningless on a screen */}
          {fullScreen ? null : (
            <View style={styles.dragBar}>
              <View style={styles.dragPill} />
            </View>
          )}

          {/* Header */}
          <View style={styles.header}>
            <Pressable
              accessibilityLabel={fullScreen ? 'Go back' : 'Close sheet'}
              hitSlop={8}
              onPress={onClose}
              style={styles.closeBtn}
            >
              {fullScreen ? (
                <ChevronLeft size={22} color={colors.onSurfaceVariant} strokeWidth={2.4} />
              ) : (
                <X size={20} color={colors.onSurfaceVariant} />
              )}
            </Pressable>
            <View style={styles.headerTextWrap}>
              <View style={styles.headerTitleRow}>
                <View style={styles.glowDot} />
                <Text style={styles.headerKicker}>ROUTINE BUILDER</Text>
              </View>
              <Text style={styles.headerTitle}>
                {exercisesOnly
                  ? 'Edit This Day'
                  : isEditing
                    ? 'Edit Workout Plan'
                    : 'Create Workout Plan'}
              </Text>
              {exercisesOnly || isEditing ? (
                <Text style={styles.headerSubtitle}>
                  {exercisesOnly
                    ? singleDateLabel
                      ? `Changes apply to ${singleDateLabel} only — the plan stays as it is`
                      : 'Changes apply to this day only — the plan stays as it is'
                    : 'Update the routine — changes apply everywhere it is scheduled'}
                </Text>
              ) : null}
            </View>
          </View>

          {/* Scrollable body */}
          <ScrollView
            ref={bodyRef}
            style={fullScreen ? styles.bodyFill : styles.body}
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
                <View style={styles.requiredBadge}>
                    <Text style={styles.requiredText}>Required</Text>
                </View>
              </View>
              <PlanNameField value={name} onChangeText={setName} />
            </View>

            {/* CATEGORY — chips like the nutrition tab's meal types. Not
                shown when editing a single day: a date cannot change
                what kind of plan it belongs to. */}
            {exercisesOnly ? null : (
            <View style={styles.field}>
              <Text style={styles.labelCaps}>CATEGORY</Text>
              <View style={styles.categoryWrap}>
                {PLAN_CATEGORIES.map((option) => {
                  const selected = option.key === category;
                  return (
                    <Pressable
                      key={option.key}
                      onPress={() => setCategory(option.key)}
                      style={[styles.categoryChip, selected && styles.categoryChipActive]}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                    >
                      <Text
                        style={[styles.categoryChipText, selected && styles.categoryChipTextActive]}
                      >
                        {option.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
            )}

            {/* Cardio / cycling / walking: distance and time targets in
                place of the muscle and exercise pickers. */}
            {isTarget && !isRest ? (
              <View style={styles.field}>
                <Text style={styles.labelCaps}>TARGETS</Text>
                <View style={styles.targetRow}>
                  {showDistance ? (
                    <View style={styles.targetField}>
                      <Text style={styles.targetLabel}>Target distance</Text>
                      <View style={styles.targetInputWrap}>
                        <TextInput
                          value={targetKm}
                          onChangeText={setTargetKm}
                          keyboardType="decimal-pad"
                          placeholder="5"
                          placeholderTextColor={colors.textMuted}
                          maxLength={6}
                          style={styles.targetInput}
                        />
                        <Text style={styles.targetUnit}>km</Text>
                      </View>
                    </View>
                  ) : null}
                  <View style={styles.targetField}>
                    <Text style={styles.targetLabel}>
                      {category === 'swimming' ? 'Time in the pool' : 'Target time'}
                    </Text>
                    <View style={styles.targetInputWrap}>
                      <TextInput
                        value={targetMinutes}
                        onChangeText={setTargetMinutes}
                        keyboardType="decimal-pad"
                        placeholder="30"
                        placeholderTextColor={colors.textMuted}
                        maxLength={6}
                        style={styles.targetInput}
                      />
                      <Text style={styles.targetUnit}>min</Text>
                    </View>
                  </View>
                </View>
              </View>
            ) : null}

            {/* SECTION 2: TARGET MUSCLE FOCUS */}
            {showPickers ? (
            <View style={styles.fieldLoose}>
              <View style={styles.labelRow}>
                <View style={styles.labelStack}>
                  <Text style={styles.labelCaps}>TARGET MUSCLE FOCUS</Text>
                  <Text style={styles.labelHint}>
                    Select 1 or more to auto-filter recommendations
                  </Text>
                </View>
                <Text style={styles.selectedCountText}>{muscles.length} Selected</Text>
              </View>

              {/* One swipeable row rather than a wrapped grid: the list is
                  long, and selected chips float to the front so they stay
                  in view. */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                style={styles.chipScroll}
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
                        {selected ? (
                          <View style={styles.chipDot} />
                        ) : (
                          <Plus size={12} color={colors.textMuted} strokeWidth={2.6} />
                        )}
                        <Text
                          style={[
                            styles.chipText,
                            selected ? styles.chipTextActive : styles.chipTextIdle,
                          ]}
                        >
                          {m}
                        </Text>
                        {selected ? (
                          <Check size={13} color={colors.primary} strokeWidth={3} />
                        ) : null}
                      </Pressable>
                    </Animated.View>
                  );
                })}
              </ScrollView>
            </View>
            ) : null}

            {/* SECTIONS 3 & 3b: WEEKLY SCHEDULE — hidden when only this
                date's exercise list is being changed, since the recurring
                schedule is not what is being edited then. */}
            {exercisesOnly ? null : (
            <View style={styles.scheduleCard}>
              <View style={styles.labelRow}>
                <Text style={styles.labelCaps}>
                  {isRest ? 'REST DAYS' : 'WEEKLY SCHEDULE'}
                </Text>
                <Text style={styles.daysCountText}>{activeDays.length} days/week</Text>
              </View>

              <View style={styles.dayGrid}>
                {DAY_ORDER.map((d) => {
                  const active = days[d];
                  return (
                    <Pressable
                      key={d}
                      onPress={() => toggleDay(d)}
                      accessibilityLabel={d}
                      accessibilityState={{ selected: active }}
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
                        {d.slice(0, 1)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {/* Session time — applies to every selected day above. A
                  rest day has no time. */}
              {isRest ? null : (
              <>
                <View style={styles.timeRow}>
                  <View style={styles.timeLabelWrap}>
                    <Clock size={16} color={colors.secondary} strokeWidth={2.2} />
                    <Text style={styles.timeLabel}>
                      Preferred Time: <Text style={styles.timeValue}>{formattedTime}</Text>
                    </Text>
                  </View>
                  <Pressable hitSlop={8} onPress={() => setTimeOpen((open) => !open)}>
                    <Text style={styles.changeText}>{timeOpen ? 'Done' : 'Change'}</Text>
                  </Pressable>
                </View>

                {timeOpen ? (
                  <TimeDial
                    value={{ hour: timeHour, minute: timeMinute, period: timePeriod }}
                    onChange={(next) => {
                      setTimeHour(next.hour);
                      setTimeMinute(next.minute);
                      setTimePeriod(next.period);
                    }}
                  />
                ) : null}
              </>
              )}
            </View>
            )}

            {/* SECTION 4: CURATED MOVEMENTS */}
            {showPickers ? (
            <View
              style={styles.fieldLoose}
              onLayout={(event) => {
                exerciseSectionY.current = event.nativeEvent.layout.y;
              }}
            >
              <View style={styles.labelRow}>
                <View style={styles.labelStack}>
                  <Text style={styles.sectionTitle}>Curated Movements</Text>
                  <Text style={styles.sectionSub}>{exerciseIds.length} selected</Text>
                </View>
                <Pressable
                  hitSlop={6}
                  onPress={() => setExerciseIds([])}
                  style={styles.clearPill}
                >
                  <Text style={styles.clearPillText}>Clear all</Text>
                </Pressable>
              </View>

              {visibleExercises.length > 0 && (
                <View style={styles.searchWrap}>
                  <Search size={15} color={colors.textMuted} />
                  <TextInput
                    value={exerciseSearch}
                    onChangeText={setExerciseSearch}
                    onFocus={() =>
                      bodyRef.current?.scrollTo({
                        y: Math.max(exerciseSectionY.current - 8, 0),
                        animated: true,
                      })
                    }
                    placeholder="Search exercises or equipment..."
                    placeholderTextColor={colors.textMuted}
                    style={styles.searchInput}
                  />
                  {exerciseSearch.length > 0 ? (
                    <Pressable
                      accessibilityLabel="Clear search"
                      hitSlop={8}
                      onPress={() => setExerciseSearch('')}
                    >
                      <X size={14} color={colors.onSurfaceVariant} />
                    </Pressable>
                  ) : (
                    <ListFilter size={14} color={colors.textMuted} strokeWidth={2.2} />
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
                    // Only checked for "near the end" — see onExerciseListScroll.
                    // Throttled so a fast fling is not a JS call per frame.
                    onScroll={onExerciseListScroll}
                    scrollEventThrottle={100}
                  >
                    {shownExercises.map((ex) => (
                      <ExerciseRow
                        key={ex.id}
                        exercise={ex}
                        checked={exerciseIds.includes(ex.id)}
                        onToggle={toggleExercise}
                        onInfo={setInfoExercise}
                      />
                    ))}
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
            ) : null}
          </ScrollView>

          {/* SECTION 5: ACTION FOOTER */}
          <View
            style={[
              styles.footer,
              // Lifts the buttons clear of the gesture bar. Never below
              // the design padding, so a device with no inset is
              // unchanged.
              { paddingBottom: Math.max(insets.bottom, 20) },
            ]}
          >
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

            {/* iOS-style home indicator, matching the reference sheet. */}
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

const styles = themedStyles(() => ({
  footer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 20,
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: 8,
  },
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
    backgroundColor: 'rgba(17, 24, 39, 0.5)',
  },
  sheet: {
    width: '100%',
    backgroundColor: colors.background,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: 'hidden',
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 16,
  },

  dragBar: { alignItems: 'center', paddingTop: 10, paddingBottom: 2 },
  dragPill: {
    width: 40,
    height: 4,
    borderRadius: radius.full,
    // The old token resolved to the same near-white as the sheet, so
    // the grabber was effectively invisible.
    backgroundColor: withOpacity(colors.textMuted, 0.45),
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTextWrap: { flex: 1, gap: 2 },
  headerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  glowDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 6,
  },
  headerKicker: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.9,
    color: colors.primary,
  },
  headerTitle: {
    fontSize: 18,
    lineHeight: 22,
    fontWeight: '800',
    color: colors.onSurface,
    letterSpacing: -0.2,
  },
  headerSubtitle: { fontSize: 12, lineHeight: 17, color: colors.onSurfaceVariant },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pressedDim: { opacity: 0.6 },

  body: { flexGrow: 0 },
  bodyFill: { flex: 1 },
  bodyContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 20,
    gap: 22,
  },

  field: { gap: 8 },
  fieldLoose: { gap: 10 },
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
  requiredBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.sm,
    backgroundColor: withOpacity(colors.primary, 0.18),
    borderWidth: 1,
    borderColor: withOpacity(colors.primary, 0.3),
  },
  requiredText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: colors.primary,
  },

  inputWrap: { position: 'relative', justifyContent: 'center' },
  input: {
    width: '100%',
    height: 52,
    // Left padding clears the leading icon; right clears the clear button.
    paddingLeft: 44,
    paddingRight: 44,
    fontSize: 14,
    fontWeight: '600',
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    color: colors.onSurface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  inputFocused: {
    borderColor: colors.primary,
    backgroundColor: colors.surface,
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


  // Bleeds out to the screen edges (bodyContent pads 20 each side) so the
  // row swipes edge to edge, with the same inset restored inside it.
  chipScroll: { flexGrow: 0, marginHorizontal: -20 },
  chipRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 20, paddingVertical: 2 },
  labelStack: { flexShrink: 1, gap: 2 },
  labelHint: { fontSize: 11, color: colors.textMuted },
  selectedCountText: { fontSize: 12, fontWeight: '800', color: colors.primary },
  chipDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary },
  targetRow: { flexDirection: 'row', gap: 10 },
  targetField: { flex: 1, gap: 6 },
  targetLabel: { fontSize: 12, fontWeight: '600', color: colors.textSecondary },
  targetInputWrap: { position: 'relative', justifyContent: 'center' },
  targetInput: {
    height: 48,
    paddingLeft: 14,
    paddingRight: 44,
    fontSize: 15,
    fontWeight: '700',
    borderRadius: radius.md,
    backgroundColor: colors.surfaceLow,
    color: colors.onSurface,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  targetUnit: {
    position: 'absolute',
    right: 14,
    fontSize: 13,
    fontWeight: '700',
    color: colors.textMuted,
  },
  categoryWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  categoryChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceLow,
  },
  categoryChipActive: { backgroundColor: colors.primary },
  categoryChipText: { fontSize: 12, fontWeight: '700', color: colors.textSecondary },
  categoryChipTextActive: { color: colors.white },
  inputLeadingIcon: {
    position: 'absolute',
    left: 14,
    zIndex: 1,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 13,
    paddingVertical: 9,
    borderRadius: 12,
    borderWidth: 1,
  },
  chipIdle: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
  },
  chipActive: {
    backgroundColor: withOpacity(colors.primary, 0.15),
    borderColor: colors.primary,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  chipTextActive: { color: colors.onSurface, fontWeight: '700' },
  chipTextIdle: { color: colors.textSecondary },

  sectionTitle: { fontSize: 15, fontWeight: '800', color: colors.onSurface },
  sectionSub: { fontSize: 12, color: colors.textMuted },
  clearPill: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 12,
    backgroundColor: withOpacity(colors.primary, 0.15),
    borderWidth: 1,
    borderColor: withOpacity(colors.primary, 0.4),
  },
  clearPillText: { fontSize: 12, fontWeight: '700', color: colors.primary },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 44,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
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
    height: 360,
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
  exerciseListContent: { gap: 10, paddingBottom: 2 },
  exerciseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  exerciseRowChecked: {
    backgroundColor: colors.surface,
    borderColor: withOpacity(colors.primary, 0.7),
  },
  exerciseRowIdle: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
  },
  exerciseThumb: {
    width: 60,
    height: 60,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: colors.surfaceContainer,
    borderWidth: 1,
    borderColor: colors.border,
  },
  exerciseThumbImage: { width: '100%', height: '100%' },
  exerciseThumbTag: {
    position: 'absolute',
    bottom: 3,
    right: 3,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
  },
  exerciseThumbTagText: {
    fontSize: 8.5,
    fontWeight: '800',
    color: colors.white,
    textTransform: 'capitalize',
  },
  exerciseTextWrap: { flex: 1, minWidth: 0, gap: 3 },
  exerciseLevelPill: {
    alignSelf: 'flex-start',
    marginTop: 2,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: withOpacity(colors.primary, 0.15),
    borderWidth: 1,
    borderColor: withOpacity(colors.primary, 0.2),
  },
  exerciseLevelText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.primary,
    textTransform: 'capitalize',
  },
  exerciseName: { fontSize: 14, fontWeight: '800', color: colors.onSurface },
  exerciseMeta: { fontSize: 12, color: colors.textSecondary, textTransform: 'capitalize' },

  daysCountText: { fontSize: 11, fontWeight: '700', color: colors.primary },
  scheduleCard: {
    gap: 14,
    padding: 16,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  dayGrid: { flexDirection: 'row', gap: 6 },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  timeLabelWrap: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  timeLabel: { fontSize: 12.5, color: colors.textSecondary },
  timeValue: { fontWeight: '800', color: colors.onSurface },
  changeText: { fontSize: 12.5, fontWeight: '700', color: colors.primary },
  dayPill: {
    flex: 1,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayPillActive: {
    backgroundColor: colors.primary,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    // Without elevation the glow renders on iOS only — Android ignores
    // shadow* entirely and draws from this instead.
    elevation: 6,
  },
  dayPillIdle: {
    backgroundColor: colors.surfaceContainer,
    borderWidth: 1,
    borderColor: colors.border,
  },
  dayPillText: { fontSize: 12, fontWeight: '800' },
  dayPillTextActive: { color: colors.onPrimary },
  dayPillTextIdle: { color: colors.onSurfaceVariant },

  // Stacked AM over PM in a recessed tray, as in the reference sheet.
  // Sits under both buttons and slides between them.
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
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.28,
    shadowRadius: 14,
    elevation: 6,
  },
  // `overflow: 'hidden'` only clips a view's CHILDREN — it does not clip
  // that same view's own native android_ripple foreground. So the ripple
  // has to live on a Pressable that is itself a CHILD of the clipping
  // view, one level below where the shape/background/overflow are set.
  ctaClip: {
    width: '100%',
    height: 52,
    borderRadius: radius.lg,
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
  ctaText: { fontSize: 14, fontWeight: '800', letterSpacing: 0.3, color: colors.onPrimary },
  draftBtnClip: {
    width: '100%',
    height: 40,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  draftBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  draftBtnText: { fontSize: 13, fontWeight: '700', color: colors.secondary },

  exerciseRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  roundBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceContainer,
    borderWidth: 1,
    borderColor: colors.border,
  },
  roundBtnRemove: { borderColor: withOpacity(colors.secondary, 0.4) },

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
    backgroundColor: 'rgba(17, 24, 39, 0.5)',
  },
  infoCard: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '85%',
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    overflow: 'hidden',
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.16,
    shadowRadius: 24,
    elevation: 12,
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
}));

export default NewPlanModal;
