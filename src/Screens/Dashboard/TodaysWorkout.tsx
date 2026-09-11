import React, { useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
} from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ArrowRight, Dumbbell, Flame, List, Play, Repeat2, Timer } from 'lucide-react-native';
import { colors, withOpacity } from '../../Theme/colors';

export interface ExerciseItem {
    id: string;
    name: string;
    weightKg: number;
    reps: number;
    targetSets?: number;
}

export interface TodaysWorkoutCardProps {
    title?: string;
    focusTags?: string;
    durationMinutes?: number;
    scheduledTime?: string;
    exerciseCount?: number;
    totalSets?: number;
    estimatedKcal?: number;
    exercises?: ExerciseItem[];
    onStartWorkout?: () => void;
    onPressExercise?: (exercise: ExerciseItem) => void;
}

const DEFAULT_EXERCISES: ExerciseItem[] = [
    { id: '1', name: 'Deadlift', weightKg: 80, reps: 8, targetSets: 4 },
    { id: '2', name: 'Lat Pulldown', weightKg: 60, reps: 10, targetSets: 4 },
    { id: '3', name: 'Seated Cable Row', weightKg: 55, reps: 10, targetSets: 4 },
    { id: '4', name: 'Barbell Bicep Curl', weightKg: 32, reps: 12, targetSets: 3 },
    { id: '5', name: 'Face Pulls', weightKg: 25, reps: 15, targetSets: 3 },
];

export const TodaysWorkoutCard: React.FC<TodaysWorkoutCardProps> = ({
    title = 'Pull Day',
    focusTags = 'Back • Biceps • Lat Focus',
    durationMinutes = 65,
    scheduledTime = '17:30',
    exerciseCount = 5,
    totalSets = 18,
    estimatedKcal = 420,
    exercises = DEFAULT_EXERCISES,
    onStartWorkout,
    onPressExercise,
}) => {
    const [showAll, setShowAll] = useState(false);

    const displayedExercises = showAll ? exercises : exercises.slice(0, 3);

    return (
        <SafeAreaProvider>
            <View style={styles.wrapper}>
                {/* Outer Section Header */}
                <View style={styles.sectionHeaderRow}>
                    <Text style={styles.sectionTitle}>Today's Workout</Text>

                    <View style={styles.scheduledBadge}>
                        <View style={styles.scheduledDot} />
                        <Text style={styles.scheduledText}>SCHEDULED • {scheduledTime}</Text>
                    </View>
                </View>

                {/* Main Card Container */}
                <View style={styles.card}>
                    {/* Top Details Row */}
                    <View style={styles.headerRow}>
                        <View style={styles.titleColumn}>
                            <View style={styles.workoutNameRow}>
                                <View style={styles.glowingDot} />
                                <Text style={styles.workoutTitle}>{title}</Text>
                            </View>
                            <Text style={styles.focusTagsText}>{focusTags}</Text>
                        </View>

                        {/* Duration Pill */}
                        <View style={styles.durationPill}>
                            <Timer size={12}
                                color={colors.primaryHighlight}
                                strokeWidth={2.4} />
                            <Text style={styles.durationText}>{durationMinutes} min</Text>
                        </View>
                    </View>

                    {/* Stats Row */}
                    <View style={styles.statsRow}>
                        {/* Exercises count */}
                        <View style={styles.statItem}>
                            <List size={12}
                                color={colors.primary}
                                strokeWidth={2.4} />
                            <Text style={styles.statLabel}>{exerciseCount} Exercises</Text>
                        </View>

                        <Text style={styles.statSeparator}>•</Text>

                        {/* Sets count */}
                        <View style={styles.statItem}>
                            <Repeat2 size={12}
                                color={colors.primary}
                                strokeWidth={2.4} />
                            <Text style={styles.statLabel}>{totalSets} Sets</Text>
                        </View>

                        <Text style={styles.statSeparator}>•</Text>

                        {/* Calories burned */}
                        <View style={styles.statItem}>
                            <Flame size={12}
                                color={colors.primary}
                                strokeWidth={2.4} />
                            <Text style={styles.statLabel}>~{estimatedKcal} kcal</Text>
                        </View>
                    </View>

                    {/* Exercises List */}
                    <View style={styles.exercisesList}>
                        {displayedExercises.map((exercise) => (
                            <TouchableOpacity
                                key={exercise.id}
                                activeOpacity={0.7}
                                onPress={() => onPressExercise && onPressExercise(exercise)}
                                style={styles.exerciseCard}
                            >
                                <View style={styles.exerciseLeft}>
                                    {/* Dumbbell Icon */}
                                    <Dumbbell
                                        size={18}
                                        color={colors.primary}
                                        strokeWidth={2.4}
                                    />
                                    <Text style={styles.exerciseName}>{exercise.name}</Text>
                                </View>

                                <Text style={styles.exerciseDetails}>
                                    {exercise.weightKg} kg × {exercise.reps}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>

                    {/* View all exercises expander */}
                    {exercises.length > 3 && (
                        <TouchableOpacity
                            activeOpacity={0.7}
                            onPress={() => setShowAll(!showAll)}
                            style={styles.viewAllButton}
                        >
                            <Text style={styles.viewAllText}>
                                {showAll
                                    ? 'Show less'
                                    : `View all ${exerciseCount} exercises`}
                            </Text>
                            <ArrowRight size={18} color={colors.primaryHighlight} />
                        </TouchableOpacity>
                    )}

                    {/* Primary CTA Button: Start Workout */}
                    <TouchableOpacity
                        activeOpacity={0.85}
                        onPress={onStartWorkout}
                        style={styles.startWorkoutButton}
                    >
                        <Play size={16} color={colors.black} fill={colors.black} />
                        <Text style={styles.startWorkoutText}>Start Workout</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </SafeAreaProvider>
    );
};

const styles = StyleSheet.create({
    safeArea: {
        flex: 1,
        backgroundColor: colors.neutral,
    },
    wrapper: {
        marginVertical: 8,
        width: '100%',
    },
    sectionHeaderRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 4,
        marginBottom: 10,
    },
    sectionTitle: {
        fontSize: 17,
        fontWeight: '800',
        color: colors.textPrimary,
        letterSpacing: -0.4,
    },
    scheduledBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: withOpacity(colors.primary, 0.12),
        borderWidth: 1,
        borderColor: withOpacity(colors.primary, 0.28),
        borderRadius: 14,
        paddingHorizontal: 10,
        paddingVertical: 4,
    },
    scheduledDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: colors.primary,
        shadowColor: colors.primary,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.9,
        shadowRadius: 4,
    },
    scheduledText: {
        fontSize: 11,
        fontWeight: '700',
        color: colors.primary,
        letterSpacing: 0.6,
    },
    card: {
        backgroundColor: colors.cardBackgroud,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: colors.cardBorder,
        padding: 18,
        shadowColor: colors.black,
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.5,
        shadowRadius: 12,
        elevation: 8,
    },
    headerRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
    },
    titleColumn: {
        flex: 1,
    },
    workoutNameRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    glowingDot: {
        width: 9,
        height: 9,
        borderRadius: 4.5,
        backgroundColor: colors.primary,
        shadowColor: colors.primary,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.9,
        shadowRadius: 5,
    },
    workoutTitle: {
        fontSize: 22,
        fontWeight: '800',
        color: colors.textPrimary,
        letterSpacing: -0.4,
    },
    focusTagsText: {
        fontSize: 13,
        fontWeight: '500',
        color: colors.primaryHighlight,
        marginTop: 4,
        letterSpacing: 0.2,
    },
    durationPill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: colors.cardBackgroud,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 12,
        paddingHorizontal: 10,
        paddingVertical: 6,
    },
    durationText: {
        fontSize: 12,
        fontWeight: '600',
        color: colors.primaryHighlight,
    },
    statsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        marginTop: 16,
        paddingBottom: 4,
    },
    statItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    statLabel: {
        fontSize: 13,
        fontWeight: '600',
        color: colors.textPrimary,
    },
    statSeparator: {
        color: colors.textSecondary,
        fontSize: 12,
    },
    exercisesList: {
        marginTop: 14,
        gap: 9,
    },
    exerciseCard: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: colors.backgroundSecondary,
        borderWidth: 1,
        borderColor: colors.cardBorder,
        borderRadius: 14,
        paddingHorizontal: 14,
        paddingVertical: 13,
    },
    exerciseLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    exerciseName: {
        fontSize: 15,
        fontWeight: '700',
        color: colors.textPrimary,
        letterSpacing: -0.2,
    },
    exerciseDetails: {
        fontSize: 14,
        fontWeight: '600',
        color: colors.primaryHighlight,
    },
    viewAllButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginTop: 12,
        paddingVertical: 4,
        paddingHorizontal: 2,
        alignSelf: 'flex-start',
    },
    viewAllText: {
        fontSize: 13,
        fontWeight: '600',
        color: colors.primaryHighlight,
    },
    startWorkoutButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        backgroundColor: colors.primary,
        borderRadius: 14,
        paddingVertical: 14,
        marginTop: 16,
        shadowColor: colors.primary,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.35,
        shadowRadius: 8,
        elevation: 4,
    },
    startWorkoutText: {
        fontSize: 15,
        fontWeight: '800',
        color: colors.black,
        letterSpacing: 0.2,
    },
});

export default TodaysWorkoutCard;