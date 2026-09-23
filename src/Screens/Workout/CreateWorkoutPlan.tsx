import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    Animated,
    Easing,
    Modal,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
    useWindowDimensions,
    type PressableStateCallbackType,
    type StyleProp,
    type ViewStyle,
} from 'react-native';
import Svg, { Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

// "Create Workout Plan" — a 1:1 build of the PulseFit design.
//
// The palette, spacing, radii and type sizes below are the design's own
// Tailwind values, converted 1:1 (1 CSS px = 1 dp). They are deliberately
// NOT taken from the app's theme: the design is a fixed dark surface with
// its own colours, and mapping it onto the light/dark theme tokens would
// change what it looks like.
//
// Icons are the design's exact SVG paths drawn with react-native-svg, not
// lucide look-alikes, so their shapes match the mock.
//
// Where CSS had no direct React Native equivalent:
//   - backdrop-blur (header, footer, modal scrim) — not available in core
//     React Native; those surfaces use the design's translucent colour
//     without the blur.
//   - inset shadow on the text inputs — not expressible; omitted.
//   - the blue glow (shadow-glow-blue) is an iOS shadow; Android draws no
//     coloured shadow from core styles, so it shows there as no glow.
//   - the font: the design uses Plus Jakarta Sans, which the app does not
//     bundle, so text renders in the system font like every other screen.

// ── Design tokens ───────────────────────────────────────────────────────

const C = {
    dark: '#10131A',
    card: '#161922',
    cardLight: '#1C202B',
    border: '#242A38',
    blue: '#4F6BF6',
    blueHover: '#3D59E0',
    coral: '#FF6433',
    muted: '#7E8B9F',
    accent: '#38BDF8',
    white: '#FFFFFF',
    // Tailwind slate / amber / emerald, as the design uses them.
    slate200: '#E2E8F0',
    slate300: '#CBD5E1',
    slate400: '#94A3B8',
    slate500: '#64748B',
    slate600: '#475569',
    amber400: '#FBBF24',
    emerald400: '#34D399',
} as const;

/** `color` at `alpha` — Tailwind's `bg-x/20` style opacity modifiers. */
const rgba = (hex: string, alpha: number): string => {
    const value = hex.replace('#', '');
    const r = parseInt(value.slice(0, 2), 16);
    const g = parseInt(value.slice(2, 4), 16);
    const b = parseInt(value.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

/** shadow-glow-blue: 0 0 20px -2px rgba(79,107,246,.45). */
const GLOW_BLUE: ViewStyle = {
    shadowColor: C.blue,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.45,
    shadowRadius: 10,
};

/** Tailwind's active:scale-95 / active:scale-[0.98]. */
const pressScale =
    (scale = 0.95) =>
    ({ pressed }: PressableStateCallbackType): StyleProp<ViewStyle> =>
        pressed ? { transform: [{ scale }] } : null;

// ── Icons (the design's own paths) ──────────────────────────────────────

interface StrokeIconProps {
    d: string;
    size: number;
    color: string;
    strokeWidth?: number;
}

const StrokeIcon: React.FC<StrokeIconProps> = ({ d, size, color, strokeWidth = 2 }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Path
            d={d}
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
        />
    </Svg>
);

const PATH = {
    back: 'M15 19l-7-7 7-7',
    more: 'M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z',
    bolt: 'M13 10V3L4 14h7v7l9-11h-7z',
    close: 'M6 18L18 6M6 6l12 12',
    check: 'M5 13l4 4L19 7',
    plus: 'M12 4v16m8-8H4',
    clock: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z',
    search: 'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z',
    filter: 'M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z',
    info: 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
    edit: 'M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z',
    minus: 'M20 12H4',
    chart: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z',
    arrow: 'M14 5l7 7m0 0l-7 7m7-7H3',
    bookmark: 'M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z',
} as const;

// ── Data ────────────────────────────────────────────────────────────────

const DAYS = [
    { key: 'mon', label: 'M' },
    { key: 'tue', label: 'T' },
    { key: 'wed', label: 'W' },
    { key: 'thu', label: 'T' },
    { key: 'fri', label: 'F' },
    { key: 'sat', label: 'S' },
    { key: 'sun', label: 'S' },
] as const;

const MUSCLES = ['Chest', 'Shoulders', 'Triceps', 'Back'] as const;

interface ExerciseCard {
    id: string;
    emoji: string;
    badge: string;
    badgeColor: string;
    name: string;
    muscle: string;
    equipment: string;
    sets: number;
    prescription: string;
    note: string;
}

const INITIAL_EXERCISES: ExerciseCard[] = [
    {
        id: 'incline-barbell-bench-press',
        emoji: '🏋️‍♂️',
        badge: 'Primary',
        badgeColor: C.accent,
        name: 'Incline Barbell Bench Press',
        muscle: 'Chest',
        equipment: 'Barbell',
        sets: 4,
        prescription: '4 sets × 8–10 reps',
        note: 'RPE 8.5',
    },
    {
        id: 'arnold-dumbbell-press',
        emoji: '💪',
        badge: 'Compound',
        badgeColor: C.coral,
        name: 'Arnold Dumbbell Press',
        muscle: 'Shoulders',
        equipment: 'Dumbbell',
        sets: 3,
        prescription: '3 sets × 10–12 reps',
        note: '90s rest',
    },
    {
        id: 'alternating-deltoid-raise',
        emoji: '🎯',
        badge: 'Isolation',
        badgeColor: C.emerald400,
        name: 'Alternating Deltoid Raise',
        muscle: 'Shoulders',
        equipment: 'Dumbbell',
        sets: 3,
        prescription: '3 sets × 12–15 reps',
        note: 'Burnout',
    },
];

/** The design's estimate is 48 min for 10 sets. */
const MINUTES_PER_SET = 4.8;

// ── Small pieces ────────────────────────────────────────────────────────

/** Tailwind's animate-pulse: opacity 1 → 0.5 → 1 over 2s. */
const PulseDot: React.FC = () => {
    const opacity = useRef(new Animated.Value(1)).current;

    useEffect(() => {
        const loop = Animated.loop(
            Animated.sequence([
                Animated.timing(opacity, {
                    toValue: 0.5,
                    duration: 1000,
                    easing: Easing.bezier(0.4, 0, 0.6, 1),
                    useNativeDriver: true,
                }),
                Animated.timing(opacity, {
                    toValue: 1,
                    duration: 1000,
                    easing: Easing.bezier(0.4, 0, 0.6, 1),
                    useNativeDriver: true,
                }),
            ]),
        );
        loop.start();
        return () => loop.stop();
    }, [opacity]);

    return <Animated.View style={[styles.pulseDot, { opacity }]} />;
};

export interface CreateWorkoutPlanProps {
    onBack?: () => void;
    onSave?: () => void;
    onSaveDraft?: () => void;
}

export const CreateWorkoutPlan: React.FC<CreateWorkoutPlanProps> = ({
    onBack,
    onSave,
    onSaveDraft,
}) => {
    const [planName, setPlanName] = useState('Hypertrophy Push & Delts');
    const [selectedMuscles, setSelectedMuscles] = useState<string[]>([
        'Chest',
        'Shoulders',
        'Triceps',
    ]);
    const [selectedDays, setSelectedDays] = useState<string[]>(['mon', 'wed', 'fri']);
    const [exercises, setExercises] = useState<ExerciseCard[]>(INITIAL_EXERCISES);
    const [guideOpen, setGuideOpen] = useState(false);

    const toggleMuscle = (muscle: string) =>
        setSelectedMuscles((prev) =>
            prev.includes(muscle) ? prev.filter((m) => m !== muscle) : [...prev, muscle],
        );

    const toggleDay = (key: string) =>
        setSelectedDays((prev) =>
            prev.includes(key) ? prev.filter((d) => d !== key) : [...prev, key],
        );

    const estimatedMinutes = useMemo(
        () => Math.round(exercises.reduce((sum, item) => sum + item.sets, 0) * MINUTES_PER_SET),
        [exercises],
    );

    return (
        <View style={styles.screen}>
            {/* ── Header ─────────────────────────────────────────────── */}
            <View style={styles.header}>
                <View style={styles.headerLeft}>
                    <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Go Back"
                        onPress={onBack}
                        style={(state) => [styles.circleButton40, pressScale()(state)]}
                    >
                        <StrokeIcon d={PATH.back} size={20} color={C.slate300} />
                    </Pressable>
                    <View>
                        <View style={styles.eyebrowRow}>
                            <PulseDot />
                            <Text style={styles.eyebrowText}>Routine Builder</Text>
                        </View>
                        <Text style={styles.headerTitle}>Create Workout Plan</Text>
                    </View>
                </View>

                <View style={styles.headerActions}>
                    <Pressable
                        accessibilityRole="button"
                        style={(state) => [styles.draftPill, pressScale()(state)]}
                    >
                        <View style={styles.draftDot} />
                        <Text style={styles.draftPillText}>Draft</Text>
                    </Pressable>
                    <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="More options"
                        style={(state) => [styles.circleButton40, pressScale()(state)]}
                    >
                        <StrokeIcon d={PATH.more} size={20} color={C.slate300} />
                    </Pressable>
                </View>
            </View>

            <ScrollView
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={styles.scrollContent}
            >
                <View style={styles.main}>
                    {/* ── Plan essentials ────────────────────────────── */}
                    <View style={styles.section}>
                        <View style={styles.rowBetween}>
                            <Text style={styles.sectionLabel}>Plan Name</Text>
                            <View style={styles.requiredBadge}>
                                <Text style={styles.requiredBadgeText}>Required</Text>
                            </View>
                        </View>

                        <View style={styles.nameInputWrap}>
                            <View style={styles.nameInputIcon} pointerEvents="none">
                                <StrokeIcon d={PATH.bolt} size={20} color={C.blue} />
                            </View>
                            <TextInput
                                value={planName}
                                onChangeText={setPlanName}
                                placeholder="e.g. Upper Body Strength"
                                placeholderTextColor={C.muted}
                                accessibilityLabel="Plan Name"
                                style={styles.nameInput}
                            />
                            <Pressable
                                accessibilityRole="button"
                                accessibilityLabel="Clear Plan Name"
                                onPress={() => setPlanName('')}
                                style={styles.nameClear}
                            >
                                <StrokeIcon d={PATH.close} size={14} color={C.slate300} strokeWidth={2.5} />
                            </Pressable>
                        </View>

                        <View style={styles.goalRow}>
                            <Text style={styles.goalLabel}>Goal:</Text>
                            <View style={[styles.goalTag, styles.goalTagActive]}>
                                <Text style={[styles.goalTagText, { color: C.accent, fontWeight: '600' }]}>
                                    Hypertrophy
                                </Text>
                            </View>
                            <View style={[styles.goalTag, styles.goalTagIdle]}>
                                <Text style={[styles.goalTagText, { color: C.slate400 }]}>Strength</Text>
                            </View>
                            <Text style={styles.goalDivider}>|</Text>
                            <View style={[styles.goalTag, styles.goalTagActive]}>
                                <Text style={[styles.goalTagText, { color: C.slate300, fontWeight: '600' }]}>
                                    Advanced (4-5 d/w)
                                </Text>
                            </View>
                        </View>
                    </View>

                    {/* ── Target muscle focus ────────────────────────── */}
                    <View style={styles.section}>
                        <View style={styles.rowBetween}>
                            <View>
                                <Text style={styles.sectionLabel}>Target Muscle Focus</Text>
                                <Text style={styles.sectionHint}>
                                    Select 1 or more to auto-filter recommendations
                                </Text>
                            </View>
                            <Text style={styles.selectedCount}>{selectedMuscles.length} Selected</Text>
                        </View>

                        <View style={styles.chipWrap}>
                            {MUSCLES.map((muscle) => {
                                const selected = selectedMuscles.includes(muscle);
                                return selected ? (
                                    <Pressable
                                        key={muscle}
                                        accessibilityRole="button"
                                        accessibilityState={{ selected }}
                                        onPress={() => toggleMuscle(muscle)}
                                        style={styles.chipSelected}
                                    >
                                        <View style={styles.chipDot} />
                                        <Text style={styles.chipSelectedText}>{muscle}</Text>
                                        <StrokeIcon d={PATH.check} size={14} color={C.blue} strokeWidth={2.5} />
                                    </Pressable>
                                ) : (
                                    <Pressable
                                        key={muscle}
                                        accessibilityRole="button"
                                        accessibilityState={{ selected }}
                                        onPress={() => toggleMuscle(muscle)}
                                        style={styles.chipIdle}
                                    >
                                        <Text style={styles.chipIdleText}>+</Text>
                                        <Text style={styles.chipIdleText}>{muscle}</Text>
                                    </Pressable>
                                );
                            })}

                            <Pressable accessibilityRole="button" style={styles.chipAdd}>
                                <StrokeIcon d={PATH.plus} size={14} color={C.slate400} />
                                <Text style={styles.chipIdleText}>Add Muscle</Text>
                            </Pressable>
                        </View>
                    </View>

                    {/* ── Weekly schedule ────────────────────────────── */}
                    <View style={[styles.section, styles.scheduleCard]}>
                        <View style={styles.rowBetween}>
                            <Text style={styles.sectionLabel}>Weekly Schedule</Text>
                            <Text style={styles.scheduleCount}>{selectedDays.length} days/week</Text>
                        </View>

                        <View style={styles.dayGrid}>
                            {DAYS.map((day) => {
                                const on = selectedDays.includes(day.key);
                                return (
                                    <Pressable
                                        key={day.key}
                                        accessibilityRole="button"
                                        accessibilityState={{ selected: on }}
                                        onPress={() => toggleDay(day.key)}
                                        style={[styles.dayButton, on ? styles.dayButtonOn : styles.dayButtonOff]}
                                    >
                                        <Text style={[styles.dayText, on ? styles.dayTextOn : styles.dayTextOff]}>
                                            {day.label}
                                        </Text>
                                    </Pressable>
                                );
                            })}
                        </View>

                        <View style={styles.timeRow}>
                            <View style={styles.timeLeft}>
                                <StrokeIcon d={PATH.clock} size={16} color={C.coral} />
                                <Text style={styles.timeText}>
                                    Preferred Time: <Text style={styles.timeValue}>07:00 AM</Text>
                                </Text>
                            </View>
                            <Pressable accessibilityRole="button">
                                <Text style={styles.changeText}>Change</Text>
                            </Pressable>
                        </View>
                    </View>

                    {/* ── Exercise curation ──────────────────────────── */}
                    <View style={[styles.section, styles.curationSection]}>
                        <View style={styles.rowBetween}>
                            <View style={styles.curationTitleBlock}>
                                <Text style={styles.curationTitle}>Curated Movements</Text>
                                <Text style={styles.curationSubtitle}>
                                    {exercises.length} selected • ~{estimatedMinutes} mins estimated
                                </Text>
                            </View>
                            <Pressable
                                accessibilityRole="button"
                                style={(state) => [styles.addExercise, pressScale()(state)]}
                            >
                                <StrokeIcon d={PATH.plus} size={14} color={C.blue} />
                                <Text style={styles.addExerciseText}>Add Exercise</Text>
                            </Pressable>
                        </View>

                        <View style={styles.searchRow}>
                            <View style={styles.searchWrap}>
                                <View style={styles.searchIcon} pointerEvents="none">
                                    <StrokeIcon d={PATH.search} size={16} color={C.slate400} />
                                </View>
                                <TextInput
                                    placeholder="Search exercises or equipment..."
                                    placeholderTextColor={C.slate500}
                                    accessibilityLabel="Search exercises or equipment"
                                    style={styles.searchInput}
                                />
                            </View>
                            <Pressable
                                accessibilityRole="button"
                                accessibilityLabel="Filters"
                                style={(state) => [styles.filterButton, pressScale()(state)]}
                            >
                                <StrokeIcon d={PATH.filter} size={16} color={C.slate300} />
                            </Pressable>
                        </View>

                        <View style={styles.cardStack}>
                            {exercises.map((exercise) => (
                                <View key={exercise.id} style={styles.exerciseCard}>
                                    <View style={styles.exerciseRow}>
                                        <View style={styles.thumb}>
                                            <Text style={styles.thumbEmoji}>{exercise.emoji}</Text>
                                            <View style={styles.thumbBadge}>
                                                <Text style={[styles.thumbBadgeText, { color: exercise.badgeColor }]}>
                                                    {exercise.badge}
                                                </Text>
                                            </View>
                                        </View>

                                        <View style={styles.exerciseInfo}>
                                            <Text style={styles.exerciseName} numberOfLines={1}>
                                                {exercise.name}
                                            </Text>
                                            <Text style={styles.exerciseMeta}>
                                                {exercise.muscle} <Text style={styles.exerciseBullet}>•</Text>{' '}
                                                {exercise.equipment}
                                            </Text>
                                            <View style={styles.paramRow}>
                                                <View style={styles.paramPill}>
                                                    <Text style={styles.paramPillText}>{exercise.prescription}</Text>
                                                </View>
                                                <Text style={styles.paramNote}>{exercise.note}</Text>
                                            </View>
                                        </View>

                                        <View style={styles.cardActions}>
                                            <Pressable
                                                accessibilityRole="button"
                                                accessibilityLabel="View Exercise Details & Demo"
                                                onPress={() => setGuideOpen(true)}
                                                style={(state) => [
                                                    styles.actionButton,
                                                    styles.actionButtonInfo,
                                                    pressScale()(state),
                                                ]}
                                            >
                                                <StrokeIcon d={PATH.info} size={16} color={C.blue} />
                                            </Pressable>
                                            <Pressable
                                                accessibilityRole="button"
                                                accessibilityLabel="Edit Exercise"
                                                style={(state) => [styles.actionButton, pressScale()(state)]}
                                            >
                                                <StrokeIcon d={PATH.edit} size={14} color={C.slate300} />
                                            </Pressable>
                                            <Pressable
                                                accessibilityRole="button"
                                                accessibilityLabel="Remove exercise"
                                                onPress={() =>
                                                    setExercises((prev) => prev.filter((item) => item.id !== exercise.id))
                                                }
                                                style={(state) => [styles.actionButton, pressScale()(state)]}
                                            >
                                                <StrokeIcon d={PATH.minus} size={16} color={C.slate400} />
                                            </Pressable>
                                        </View>
                                    </View>
                                </View>
                            ))}
                        </View>
                    </View>

                    {/* ── Insight banner ─────────────────────────────── */}
                    <InsightBanner />
                </View>
            </ScrollView>

            {/* ── Sticky bottom action bar ───────────────────────────── */}
            <View style={styles.footer}>
                <View style={styles.footerInner}>
                    <Pressable
                        accessibilityRole="button"
                        onPress={onSave}
                        style={(state) => [styles.saveButton, pressScale(0.98)(state)]}
                    >
                        <Text style={styles.saveButtonText}>Save Workout Plan</Text>
                        <StrokeIcon d={PATH.arrow} size={16} color={C.white} />
                    </Pressable>
                    <Pressable
                        accessibilityRole="button"
                        onPress={onSaveDraft}
                        style={(state) => [styles.draftButton, pressScale()(state)]}
                    >
                        <StrokeIcon d={PATH.bookmark} size={16} color={C.coral} />
                        <Text style={styles.draftButtonText}>Save as Draft</Text>
                    </Pressable>
                </View>
            </View>

            <ExerciseGuideSheet visible={guideOpen} onClose={() => setGuideOpen(false)} />
        </View>
    );
};

// ── Insight banner ──────────────────────────────────────────────────────

const InsightBanner: React.FC = () => {
    const [size, setSize] = useState({ width: 0, height: 0 });

    return (
        <View
            style={styles.banner}
            onLayout={(event) => {
                const { width, height } = event.nativeEvent.layout;
                setSize((prev) =>
                    prev.width === width && prev.height === height ? prev : { width, height },
                );
            }}
        >
            {/* bg-gradient-to-r from-blue/15 via-card to-coral/10 */}
            {size.width > 0 ? (
                <Svg style={StyleSheet.absoluteFill} width={size.width} height={size.height}>
                    <Defs>
                        <LinearGradient id="insightBanner" x1="0" y1="0" x2="1" y2="0">
                            <Stop offset="0" stopColor={C.blue} stopOpacity={0.15} />
                            <Stop offset="0.5" stopColor={C.card} stopOpacity={1} />
                            <Stop offset="1" stopColor={C.coral} stopOpacity={0.1} />
                        </LinearGradient>
                    </Defs>
                    <Rect
                        x={0}
                        y={0}
                        width={size.width}
                        height={size.height}
                        rx={15}
                        fill="url(#insightBanner)"
                    />
                </Svg>
            ) : null}

            <View style={styles.bannerIcon}>
                <StrokeIcon d={PATH.chart} size={20} color={C.blue} />
            </View>
            <View style={styles.bannerText}>
                <Text style={styles.bannerTitle}>Optimal Recovery Projected</Text>
                <Text style={styles.bannerBody}>
                    Upper body volume matches your weekly targets with 48h rest windows.
                </Text>
            </View>
        </View>
    );
};

// ── Exercise guide (bottom sheet) ───────────────────────────────────────

const ExerciseGuideSheet: React.FC<{ visible: boolean; onClose: () => void }> = ({
    visible,
    onClose,
}) => {
    const { height: windowHeight } = useWindowDimensions();
    // The Modal stays mounted through the close animation, then unmounts.
    const [mounted, setMounted] = useState(visible);
    const progress = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (visible) {
            setMounted(true);
            // drawer-transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1),
            // scrim opacity 0.25s ease-out.
            Animated.timing(progress, {
                toValue: 1,
                duration: 300,
                easing: Easing.bezier(0.16, 1, 0.3, 1),
                useNativeDriver: true,
            }).start();
        } else {
            Animated.timing(progress, {
                toValue: 0,
                duration: 300,
                easing: Easing.bezier(0.16, 1, 0.3, 1),
                useNativeDriver: true,
            }).start(({ finished }) => {
                if (finished) setMounted(false);
            });
        }
    }, [visible, progress]);

    const translateY = progress.interpolate({
        inputRange: [0, 1],
        outputRange: [windowHeight, 0],
    });
    const scrimOpacity = progress.interpolate({
        inputRange: [0, 0.83, 1],
        outputRange: [0, 1, 1],
        extrapolate: 'clamp',
    });

    if (!mounted) return null;

    return (
        <Modal
            transparent
            animationType="none"
            visible
            statusBarTranslucent
            onRequestClose={onClose}
        >
            <View style={styles.modalRoot}>
                <Animated.View style={[styles.scrim, { opacity: scrimOpacity }]}>
                    <Pressable
                        accessibilityLabel="Close modal"
                        style={StyleSheet.absoluteFill}
                        onPress={onClose}
                    />
                </Animated.View>

                <Animated.View
                    style={[
                        styles.sheet,
                        { maxHeight: windowHeight * 0.85, transform: [{ translateY }] },
                    ]}
                >
                    <ScrollView
                        showsVerticalScrollIndicator={false}
                        bounces={false}
                        contentContainerStyle={styles.sheetContent}
                    >
                        <View style={styles.dragHandle} />

                        <View style={styles.sheetHeader}>
                            <View style={styles.sheetHeaderText}>
                                <View style={styles.guideBadgeLine}>
                                    <View style={styles.guideBadge}>
                                        <Text style={styles.guideBadgeText}>Exercise Guide</Text>
                                    </View>
                                </View>
                                <Text style={styles.sheetTitle}>Incline Barbell Bench Press</Text>
                                <Text style={styles.sheetSubtitle}>
                                    Primary: Clavicular Pectoralis (Upper Chest)
                                </Text>
                            </View>
                            <Pressable
                                accessibilityRole="button"
                                accessibilityLabel="Close modal"
                                onPress={onClose}
                                style={styles.sheetClose}
                            >
                                <StrokeIcon d={PATH.close} size={16} color={C.slate300} strokeWidth={2.5} />
                            </Pressable>
                        </View>

                        <View style={styles.demoBox}>
                            <View style={styles.demoOrb} />
                            <View style={styles.demoContent}>
                                <View style={styles.playRing}>
                                    <View style={styles.playCircle}>
                                        <Svg width={24} height={24} viewBox="0 0 24 24">
                                            <Path d="M8 5v14l11-7z" fill={C.blue} />
                                        </Svg>
                                    </View>
                                </View>
                                <Text style={styles.demoTitle}>3D Form Video Preview</Text>
                                <Text style={styles.demoCaption}>Bench angle set at 30° - 45°</Text>
                            </View>
                        </View>

                        <View style={styles.metricGrid}>
                            <View style={styles.metricCell}>
                                <Text style={styles.metricLabel}>Est. 1RM</Text>
                                <Text style={[styles.metricValue, { color: C.white }]}>92.5 kg</Text>
                            </View>
                            <View style={styles.metricCell}>
                                <Text style={styles.metricLabel}>Tempo</Text>
                                <Text style={[styles.metricValue, { color: C.blue }]}>3-0-1-0</Text>
                            </View>
                            <View style={styles.metricCell}>
                                <Text style={styles.metricLabel}>Target RPE</Text>
                                <Text style={[styles.metricValue, { color: C.coral }]}>8.0 - 9.0</Text>
                            </View>
                        </View>

                        <View style={styles.cueCard}>
                            <View style={styles.cueHeader}>
                                <Svg width={16} height={16} viewBox="0 0 20 20">
                                    <Path
                                        fill={C.amber400}
                                        fillRule="evenodd"
                                        clipRule="evenodd"
                                        d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                                    />
                                </Svg>
                                <Text style={styles.cueTitle}>Coaching Cue</Text>
                            </View>
                            <Text style={styles.cueBody}>
                                Retract and depress scapula prior to unrack. Lower bar smoothly to mid-upper
                                clavicle, drive elbows inward at a 45° angle.
                            </Text>
                        </View>

                        <View style={styles.sheetActions}>
                            <Pressable
                                accessibilityRole="button"
                                onPress={onClose}
                                style={(state) => [styles.keepButton, pressScale()(state)]}
                            >
                                <Text style={styles.keepButtonText}>Keep In Routine</Text>
                            </Pressable>
                            <Pressable
                                accessibilityRole="button"
                                onPress={onClose}
                                style={(state) => [styles.dismissButton, pressScale()(state)]}
                            >
                                <Text style={styles.dismissButtonText}>Close</Text>
                            </Pressable>
                        </View>
                    </ScrollView>
                </Animated.View>
            </View>
        </Modal>
    );
};

// ── Styles ──────────────────────────────────────────────────────────────
//
// Each rule is annotated with the Tailwind classes it was converted from.
// Text carries an explicit lineHeight because Tailwind's font-size
// utilities carry one (text-xs 16, text-sm 20, text-lg 28), and the
// arbitrary text-[Npx] sizes inherit the body's 1.5.

const styles = StyleSheet.create({
    screen: {
        flex: 1,
        backgroundColor: C.dark,
    },

    // header: px-4 py-3 border-b bg-dark/90
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 12,
        backgroundColor: rgba(C.dark, 0.9),
        borderBottomWidth: 1,
        borderBottomColor: C.border,
        zIndex: 30,
    },
    headerLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        flexShrink: 1,
    },
    // w-10 h-10 rounded-full bg-card border
    circleButton40: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: C.card,
        borderWidth: 1,
        borderColor: C.border,
        alignItems: 'center',
        justifyContent: 'center',
    },
    eyebrowRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    // w-2 h-2 rounded-full bg-blue animate-pulse
    pulseDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: C.blue,
    },
    // text-[11px] font-bold tracking-wider uppercase
    eyebrowText: {
        fontSize: 11,
        lineHeight: 16.5,
        fontWeight: '700',
        letterSpacing: 0.55,
        textTransform: 'uppercase',
        color: C.blue,
    },
    // text-lg font-bold leading-tight
    headerTitle: {
        fontSize: 18,
        lineHeight: 22.5,
        fontWeight: '700',
        color: C.white,
    },
    headerActions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    // px-3 py-1.5 rounded-full bg-card border
    draftPill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 9999,
        backgroundColor: C.card,
        borderWidth: 1,
        borderColor: C.border,
    },
    draftDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: C.amber400,
    },
    // text-xs font-semibold
    draftPillText: {
        fontSize: 12,
        lineHeight: 16,
        fontWeight: '600',
        color: C.slate300,
    },

    // pb-36
    scrollContent: {
        paddingBottom: 144,
    },
    // max-w-md mx-auto px-4 pt-5 space-y-6
    main: {
        width: '100%',
        maxWidth: 448,
        alignSelf: 'center',
        paddingHorizontal: 16,
        paddingTop: 20,
        gap: 24,
    },
    // space-y-3
    section: {
        gap: 12,
    },
    rowBetween: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    // text-xs font-bold uppercase tracking-wider text-slate-400
    sectionLabel: {
        fontSize: 12,
        lineHeight: 16,
        fontWeight: '700',
        letterSpacing: 0.6,
        textTransform: 'uppercase',
        color: C.slate400,
    },
    // text-[11px] text-slate-500
    sectionHint: {
        fontSize: 11,
        lineHeight: 16.5,
        color: C.slate500,
    },
    // text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded
    requiredBadge: {
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 4,
        backgroundColor: rgba(C.blue, 0.2),
        borderWidth: 1,
        borderColor: rgba(C.blue, 0.3),
    },
    requiredBadgeText: {
        fontSize: 10,
        lineHeight: 15,
        fontWeight: '700',
        letterSpacing: 0.5,
        textTransform: 'uppercase',
        color: C.blue,
    },

    // Plan name input: pl-11 pr-11 py-3.5 rounded-2xl text-sm font-semibold
    nameInputWrap: {
        justifyContent: 'center',
    },
    nameInputIcon: {
        position: 'absolute',
        left: 14,
        zIndex: 1,
    },
    nameInput: {
        height: 50,
        paddingVertical: 0,
        paddingLeft: 44,
        paddingRight: 44,
        borderRadius: 16,
        backgroundColor: C.card,
        borderWidth: 1,
        borderColor: C.border,
        fontSize: 14,
        lineHeight: 20,
        fontWeight: '600',
        color: C.white,
        ...Platform.select({ android: { textAlignVertical: 'center' as const } }),
    },
    // right-3.5 w-6 h-6 rounded-full bg-border
    nameClear: {
        position: 'absolute',
        right: 14,
        width: 24,
        height: 24,
        borderRadius: 12,
        backgroundColor: C.border,
        alignItems: 'center',
        justifyContent: 'center',
    },

    // flex items-center gap-2 pt-1 — items shrink like CSS flex items.
    goalRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingTop: 4,
    },
    // text-xs text-slate-400
    goalLabel: {
        fontSize: 12,
        lineHeight: 16,
        color: C.slate400,
        flexShrink: 1,
    },
    // px-2.5 py-1 rounded-lg border text-[11px]
    goalTag: {
        flexShrink: 1,
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: C.border,
    },
    goalTagActive: {
        backgroundColor: C.cardLight,
    },
    goalTagIdle: {
        backgroundColor: C.card,
    },
    goalTagText: {
        fontSize: 11,
        lineHeight: 16.5,
        textAlign: 'center',
    },
    // text-slate-600 — inherits the body's 16px / 24px
    goalDivider: {
        fontSize: 16,
        lineHeight: 24,
        color: C.slate600,
        flexShrink: 1,
    },

    // Muscle chips: flex flex-wrap gap-2 pt-1
    selectedCount: {
        fontSize: 12,
        lineHeight: 16,
        fontWeight: '700',
        color: C.blue,
    },
    chipWrap: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        paddingTop: 4,
    },
    // gap-2 px-3.5 py-2 rounded-xl bg-blue/15 border-blue text-xs font-semibold
    chipSelected: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 12,
        backgroundColor: rgba(C.blue, 0.15),
        borderWidth: 1,
        borderColor: C.blue,
    },
    chipDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: C.blue,
    },
    chipSelectedText: {
        fontSize: 12,
        lineHeight: 16,
        fontWeight: '600',
        color: C.white,
    },
    // gap-1.5 px-3 py-2 rounded-xl bg-card border text-xs font-medium
    chipIdle: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 12,
        backgroundColor: C.card,
        borderWidth: 1,
        borderColor: C.border,
    },
    chipIdleText: {
        fontSize: 12,
        lineHeight: 16,
        fontWeight: '500',
        color: C.slate400,
    },
    // gap-1 px-3 py-2 rounded-xl border border-dashed
    chipAdd: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 12,
        borderWidth: 1,
        borderStyle: 'dashed',
        borderColor: C.border,
    },

    // Weekly schedule: bg-card/80 border p-4 rounded-2xl
    scheduleCard: {
        backgroundColor: rgba(C.card, 0.8),
        borderWidth: 1,
        borderColor: C.border,
        padding: 16,
        borderRadius: 16,
    },
    // text-xs font-medium text-muted
    scheduleCount: {
        fontSize: 12,
        lineHeight: 16,
        fontWeight: '500',
        color: C.muted,
    },
    // grid grid-cols-7 gap-1.5
    dayGrid: {
        flexDirection: 'row',
        gap: 6,
    },
    // py-2 rounded-xl text-xs
    dayButton: {
        flex: 1,
        paddingVertical: 8,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    dayButtonOn: {
        backgroundColor: C.blue,
        ...GLOW_BLUE,
    },
    dayButtonOff: {
        backgroundColor: C.cardLight,
        borderWidth: 1,
        borderColor: C.border,
    },
    dayText: {
        fontSize: 12,
        lineHeight: 16,
    },
    dayTextOn: {
        fontWeight: '700',
        color: C.white,
    },
    dayTextOff: {
        fontWeight: '600',
        color: C.slate400,
    },
    // flex items-center justify-between pt-1 text-xs
    timeRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingTop: 4,
    },
    timeLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    timeText: {
        fontSize: 12,
        lineHeight: 16,
        color: C.slate300,
    },
    timeValue: {
        fontWeight: '600',
        color: C.white,
    },
    changeText: {
        fontSize: 12,
        lineHeight: 16,
        fontWeight: '500',
        color: C.blue,
    },

    // Curation: space-y-3 pt-2
    curationSection: {
        paddingTop: 8,
    },
    curationTitleBlock: {
        flexShrink: 1,
    },
    // text-sm font-bold text-white
    curationTitle: {
        fontSize: 14,
        lineHeight: 20,
        fontWeight: '700',
        color: C.white,
    },
    // text-xs text-muted
    curationSubtitle: {
        fontSize: 12,
        lineHeight: 16,
        color: C.muted,
    },
    // gap-1 px-3 py-1.5 rounded-xl bg-blue/15 border-blue/40 text-xs font-semibold
    addExercise: {
        flexShrink: 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 12,
        backgroundColor: rgba(C.blue, 0.15),
        borderWidth: 1,
        borderColor: rgba(C.blue, 0.4),
    },
    addExerciseText: {
        flexShrink: 1,
        fontSize: 12,
        lineHeight: 16,
        fontWeight: '600',
        color: C.blue,
    },

    // Search row: flex items-center gap-2
    searchRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    searchWrap: {
        flex: 1,
        justifyContent: 'center',
    },
    // left-3.5, vertically centred
    searchIcon: {
        position: 'absolute',
        left: 14,
        zIndex: 1,
    },
    // pl-9 pr-4 py-2.5 rounded-xl text-xs
    searchInput: {
        height: 38,
        paddingVertical: 0,
        paddingLeft: 36,
        paddingRight: 16,
        borderRadius: 12,
        backgroundColor: C.card,
        borderWidth: 1,
        borderColor: C.border,
        fontSize: 12,
        lineHeight: 16,
        color: C.white,
        ...Platform.select({ android: { textAlignVertical: 'center' as const } }),
    },
    // p-2.5 rounded-xl bg-card border
    filterButton: {
        padding: 10,
        borderRadius: 12,
        backgroundColor: C.card,
        borderWidth: 1,
        borderColor: C.border,
    },

    // space-y-3 pt-1
    cardStack: {
        gap: 12,
        paddingTop: 4,
    },
    // p-3.5 rounded-2xl bg-card border
    exerciseCard: {
        padding: 14,
        borderRadius: 16,
        backgroundColor: C.card,
        borderWidth: 1,
        borderColor: C.border,
        gap: 12,
    },
    // flex items-start gap-3
    exerciseRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 12,
    },
    // w-16 h-16 rounded-xl bg-cardLight border overflow-hidden flex-shrink-0
    thumb: {
        width: 64,
        height: 64,
        borderRadius: 12,
        backgroundColor: C.cardLight,
        borderWidth: 1,
        borderColor: C.border,
        overflow: 'hidden',
        flexShrink: 0,
        alignItems: 'center',
        justifyContent: 'center',
    },
    // text-2xl
    thumbEmoji: {
        fontSize: 24,
        lineHeight: 32,
    },
    // absolute bottom-1 right-1 px-1 rounded bg-black/70 text-[9px] font-bold
    thumbBadge: {
        position: 'absolute',
        bottom: 4,
        right: 4,
        paddingHorizontal: 4,
        borderRadius: 4,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
    },
    thumbBadgeText: {
        fontSize: 9,
        lineHeight: 13.5,
        fontWeight: '700',
    },
    // flex-1 min-w-0
    exerciseInfo: {
        flex: 1,
        minWidth: 0,
    },
    // text-sm font-bold text-white truncate
    exerciseName: {
        fontSize: 14,
        lineHeight: 20,
        fontWeight: '700',
        color: C.white,
    },
    // text-xs text-slate-400 mt-0.5
    exerciseMeta: {
        fontSize: 12,
        lineHeight: 16,
        color: C.slate400,
        marginTop: 2,
    },
    exerciseBullet: {
        color: C.slate600,
    },
    // flex items-center gap-2 mt-2
    paramRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginTop: 8,
    },
    // px-2 py-0.5 rounded-md bg-blue/15 border-blue/20 text-[11px] font-semibold
    paramPill: {
        flexShrink: 1,
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 6,
        backgroundColor: rgba(C.blue, 0.15),
        borderWidth: 1,
        borderColor: rgba(C.blue, 0.2),
    },
    paramPillText: {
        fontSize: 11,
        lineHeight: 16.5,
        fontWeight: '600',
        color: C.blue,
    },
    paramNote: {
        flexShrink: 1,
        fontSize: 11,
        lineHeight: 16.5,
        color: C.slate400,
    },
    // flex items-center gap-1.5 flex-shrink-0
    cardActions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        flexShrink: 0,
    },
    // w-8 h-8 rounded-full bg-cardLight border
    actionButton: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: C.cardLight,
        borderWidth: 1,
        borderColor: C.border,
        alignItems: 'center',
        justifyContent: 'center',
    },
    actionButtonInfo: {},

    // Insight banner: rounded-2xl border p-4 flex items-center gap-3.5
    banner: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        padding: 16,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: C.border,
        backgroundColor: C.card,
        overflow: 'hidden',
    },
    // w-10 h-10 rounded-xl bg-blue/20
    bannerIcon: {
        width: 40,
        height: 40,
        borderRadius: 12,
        backgroundColor: rgba(C.blue, 0.2),
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
    },
    bannerText: {
        flex: 1,
    },
    // text-xs font-bold text-white block
    bannerTitle: {
        fontSize: 12,
        lineHeight: 16,
        fontWeight: '700',
        color: C.white,
    },
    // text-xs text-slate-400
    bannerBody: {
        fontSize: 12,
        lineHeight: 16,
        color: C.slate400,
    },

    // Footer: fixed bottom-0 px-4 py-3 border-t bg-dark/95 shadow-bottom-bar
    footer: {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        paddingHorizontal: 16,
        paddingVertical: 12,
        backgroundColor: rgba(C.dark, 0.95),
        borderTopWidth: 1,
        borderTopColor: C.border,
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: -10 },
        shadowOpacity: 0.65,
        shadowRadius: 12.5,
        zIndex: 40,
    },
    // max-w-md mx-auto space-y-2.5
    footerInner: {
        width: '100%',
        maxWidth: 448,
        alignSelf: 'center',
        gap: 10,
    },
    // py-3.5 px-6 rounded-2xl bg-blue font-bold text-sm tracking-wide gap-2
    saveButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingVertical: 14,
        paddingHorizontal: 24,
        borderRadius: 16,
        backgroundColor: C.blue,
        ...GLOW_BLUE,
    },
    saveButtonText: {
        fontSize: 14,
        lineHeight: 20,
        fontWeight: '700',
        letterSpacing: 0.35,
        color: C.white,
    },
    // py-2 gap-2 text-coral text-xs font-semibold tracking-wide
    draftButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingVertical: 8,
    },
    draftButtonText: {
        fontSize: 12,
        lineHeight: 16,
        fontWeight: '600',
        letterSpacing: 0.3,
        color: C.coral,
    },

    // ── Exercise guide sheet ───────────────────────────────────────────
    modalRoot: {
        flex: 1,
        justifyContent: 'flex-end',
    },
    // bg-black/80
    scrim: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
    },
    // bg-card border-t rounded-t-3xl max-h-[85vh] max-w-md
    sheet: {
        width: '100%',
        maxWidth: 448,
        alignSelf: 'center',
        backgroundColor: C.card,
        borderTopWidth: 1,
        borderTopColor: C.border,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        overflow: 'hidden',
    },
    // p-5 space-y-4
    sheetContent: {
        padding: 20,
        gap: 16,
    },
    // w-12 h-1.5 rounded-full bg-border mx-auto -mt-1 mb-2
    dragHandle: {
        width: 48,
        height: 6,
        borderRadius: 9999,
        backgroundColor: C.border,
        alignSelf: 'center',
        marginTop: -4,
        marginBottom: 8,
    },
    sheetHeader: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
    },
    sheetHeaderText: {
        flex: 1,
    },
    // The badge is an inline span in a div, so its line is the body's 24px.
    guideBadgeLine: {
        minHeight: 24,
        justifyContent: 'center',
        alignItems: 'flex-start',
    },
    // text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded
    guideBadge: {
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 4,
        backgroundColor: rgba(C.blue, 0.15),
        borderWidth: 1,
        borderColor: rgba(C.blue, 0.2),
    },
    guideBadgeText: {
        fontSize: 10,
        lineHeight: 15,
        fontWeight: '700',
        letterSpacing: 0.5,
        textTransform: 'uppercase',
        color: C.blue,
    },
    // text-lg font-bold mt-1
    sheetTitle: {
        marginTop: 4,
        fontSize: 18,
        lineHeight: 28,
        fontWeight: '700',
        color: C.white,
    },
    sheetSubtitle: {
        fontSize: 12,
        lineHeight: 16,
        color: C.muted,
    },
    // w-8 h-8 rounded-full bg-cardLight border
    sheetClose: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: C.cardLight,
        borderWidth: 1,
        borderColor: C.border,
        alignItems: 'center',
        justifyContent: 'center',
    },
    // h-44 rounded-2xl bg-cardLight border overflow-hidden p-4, centred
    demoBox: {
        height: 176,
        borderRadius: 16,
        backgroundColor: C.cardLight,
        borderWidth: 1,
        borderColor: C.border,
        overflow: 'hidden',
        padding: 16,
        alignItems: 'center',
        justifyContent: 'center',
    },
    // absolute w-32 h-32 bg-blue/20 rounded-full blur-2xl
    demoOrb: {
        position: 'absolute',
        width: 128,
        height: 128,
        borderRadius: 64,
        backgroundColor: rgba(C.blue, 0.2),
        filter: [{ blur: 40 }],
    },
    // relative z-10 space-y-2
    demoContent: {
        alignItems: 'center',
        gap: 8,
    },
    // ring-4 ring-blue/10 — drawn outside the 48px circle, so the ring's
    // extra 4px each side is pulled back out of the layout.
    playRing: {
        width: 56,
        height: 56,
        margin: -4,
        borderRadius: 28,
        backgroundColor: rgba(C.blue, 0.1),
        alignItems: 'center',
        justifyContent: 'center',
    },
    // w-12 h-12 rounded-full bg-blue/20
    playCircle: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: rgba(C.blue, 0.2),
        alignItems: 'center',
        justifyContent: 'center',
    },
    // text-xs font-semibold text-slate-200
    demoTitle: {
        fontSize: 12,
        lineHeight: 16,
        fontWeight: '600',
        color: C.slate200,
        textAlign: 'center',
    },
    // text-[10px] text-muted
    demoCaption: {
        fontSize: 10,
        lineHeight: 15,
        color: C.muted,
        textAlign: 'center',
    },
    // grid grid-cols-3 gap-2.5 py-1 text-center
    metricGrid: {
        flexDirection: 'row',
        gap: 10,
        paddingVertical: 4,
    },
    // p-2.5 rounded-xl bg-cardLight border
    metricCell: {
        flex: 1,
        padding: 10,
        borderRadius: 12,
        backgroundColor: C.cardLight,
        borderWidth: 1,
        borderColor: C.border,
        alignItems: 'center',
    },
    // text-[10px] text-slate-400 uppercase font-semibold
    metricLabel: {
        fontSize: 10,
        lineHeight: 15,
        fontWeight: '600',
        textTransform: 'uppercase',
        color: C.slate400,
        textAlign: 'center',
    },
    // text-sm font-bold
    metricValue: {
        fontSize: 14,
        lineHeight: 20,
        fontWeight: '700',
        textAlign: 'center',
    },
    // p-3.5 rounded-2xl bg-cardLight/70 border text-xs space-y-1.5
    cueCard: {
        padding: 14,
        borderRadius: 16,
        backgroundColor: rgba(C.cardLight, 0.7),
        borderWidth: 1,
        borderColor: C.border,
        gap: 6,
    },
    cueHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    cueTitle: {
        fontSize: 12,
        lineHeight: 16,
        fontWeight: '700',
        color: C.amber400,
    },
    // text-slate-300 text-[11px] leading-relaxed (1.625)
    cueBody: {
        fontSize: 11,
        lineHeight: 17.875,
        color: C.slate300,
    },
    // flex items-center gap-3 pt-2
    sheetActions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingTop: 8,
    },
    // flex-1 py-3 px-4 rounded-xl bg-blue font-bold text-xs tracking-wide
    keepButton: {
        flex: 1,
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderRadius: 12,
        backgroundColor: C.blue,
        alignItems: 'center',
        justifyContent: 'center',
        ...GLOW_BLUE,
    },
    keepButtonText: {
        fontSize: 12,
        lineHeight: 16,
        fontWeight: '700',
        letterSpacing: 0.3,
        color: C.white,
    },
    // px-4 py-3 rounded-xl bg-cardLight border font-semibold text-xs
    dismissButton: {
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderRadius: 12,
        backgroundColor: C.cardLight,
        borderWidth: 1,
        borderColor: C.border,
        alignItems: 'center',
        justifyContent: 'center',
    },
    dismissButtonText: {
        fontSize: 12,
        lineHeight: 16,
        fontWeight: '600',
        color: C.slate300,
    },
});

export default CreateWorkoutPlan;
