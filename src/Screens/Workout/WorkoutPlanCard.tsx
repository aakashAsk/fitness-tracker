import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';
import { ChevronDown, SlidersHorizontal, Trash2, Plus } from 'lucide-react-native';
import { colors, withOpacity } from '../../Theme/colors';
import { spacing } from '../../Theme/spacing';
import EquipmentIcon, { equipmentAccent } from '../../Components/EquipmentIcon';
import SetStepper from './SetStepper';
import { themedStyles } from '../../Theme/ThemeContext';
import { inputKey, type SetInput } from '../../Hooks/useExerciseInputs';
import type { WorkoutStats } from '../../Services/workoutStats';
import WorkoutStatsPanel from './WorkoutStatsPanel';

export interface PlanExerciseRow {
  id: string;
  exerciseId: string;
  name: string;
  meta: string;
  isWeighted: boolean;
  equipment: string | null;
}

interface WorkoutPlanCardProps {
  id: string;
  planDocId: string;
  /** The selected day's key. Set inputs are stored per day (see
      inputKey), so the card needs it to read back what the stepper and
      add-set buttons wrote. */
  dateKey: string;
  title: string;
  exercises: PlanExerciseRow[];
  isLogged: boolean;
  isLogStateKnown: boolean;
  isDayLoading: boolean;
  isSaving: boolean;
  /** True when this session cannot be logged yet — a future day, or
      later today before its own scheduled time. Distinct from
      `isSaving`: this is "not yet allowed", not "in flight". */
  locked?: boolean;
  /** Shown on the button in place of "Save Log" while `locked`, e.g.
      "Available at 6:30 PM". */
  lockedLabel?: string;
  /** The saved estimate for this session, when it has one. */
  stats?: WorkoutStats;
  expandedExerciseId: string | null;
  exerciseInputs: Record<string, SetInput[]>;
  onToggleExercise: (exerciseId: string) => void;
  onEditPlan: () => void;
  onSaveWorkout: () => void;
  onStepSetInput: (rowId: string, setIndex: number, field: 'reps' | 'weight', direction: 1 | -1) => void;
  onAddSet: (rowId: string) => void;
  onRemoveSet: (rowId: string, setIndex: number) => void;
  onFocusLayout: (e: any) => void;
}

const EMPTY_SET_INPUT = { reps: '', weight: '' };

const ExerciseSkeleton: React.FC<{ rows: number }> = ({ rows }) => (
  <View style={styles.skeletonList}>
    {Array.from({ length: rows }).map((_, index) => (
      <View key={index} style={styles.skeletonRow} />
    ))}
  </View>
);

export const WorkoutPlanCard: React.FC<WorkoutPlanCardProps> = ({
  id,
  planDocId,
  dateKey,
  title,
  exercises,
  isLogged,
  isLogStateKnown,
  isDayLoading,
  isSaving,
  locked = false,
  lockedLabel,
  stats,
  expandedExerciseId,
  exerciseInputs,
  onToggleExercise,
  onEditPlan,
  onSaveWorkout,
  onStepSetInput,
  onAddSet,
  onRemoveSet,
  onFocusLayout,
}) => {
  return (
    <View style={styles.card} onLayout={onFocusLayout}>
      <View style={styles.planCardHeaderRow}>
        <View style={styles.planCardHeaderLeft}>
          <Text style={styles.planCardTitle} numberOfLines={1}>
            {title}
          </Text>
          <View style={styles.planCardCountPill}>
            <Text style={styles.planCardCountText}>{exercises.length}</Text>
          </View>
          {isLogged ? (
            <View style={styles.planCardLoggedPill}>
              <Text style={styles.planCardLoggedText}>Logged</Text>
            </View>
          ) : null}
        </View>
        {isLogStateKnown && !isLogged ? (
          <TouchableOpacity activeOpacity={0.7} onPress={onEditPlan} style={styles.editPlanButton}>
            <Text style={styles.editPlanText}>Edit Plan</Text>
            <SlidersHorizontal size={13} color={colors.primary} strokeWidth={2.4} />
          </TouchableOpacity>
        ) : null}
      </View>

      {isDayLoading ? (
        <ExerciseSkeleton rows={exercises.length || 3} />
      ) : (
        <View style={styles.planExerciseList}>
          {exercises.map((exercise, index) => {
            const setInputs = exerciseInputs[inputKey(dateKey, exercise.id)] ?? [EMPTY_SET_INPUT];
            const isLast = index === exercises.length - 1;
            const isExpanded = expandedExerciseId === exercise.id;

            return (
              <Animated.View
                key={exercise.id}
                layout={LinearTransition.duration(220)}
                style={[styles.planExerciseRow, !isLast && styles.planExerciseRowDivider]}
              >
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => onToggleExercise(exercise.id)}
                  style={styles.planExerciseTopRow}
                >
                  <Text style={styles.planExerciseIndex}>{String(index + 1).padStart(2, '0')}</Text>
                  <View
                    style={[
                      styles.planExerciseIcon,
                      {
                        backgroundColor: withOpacity(equipmentAccent(exercise.equipment), 0.16),
                      },
                    ]}
                  >
                    <EquipmentIcon equipment={exercise.equipment} size={18} strokeWidth={2.2} />
                  </View>
                  <View style={styles.planExerciseTextBlock}>
                    <Text style={styles.planExerciseName} numberOfLines={1}>
                      {exercise.name}
                    </Text>
                    <Text style={styles.planExerciseMeta} numberOfLines={1}>
                      {exercise.meta || 'Loading details…'}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.planExerciseChevron,
                      isExpanded && styles.planExerciseChevronExpanded,
                    ]}
                  >
                    <ChevronDown size={16} color={colors.textSecondary} strokeWidth={2.4} />
                  </View>
                </TouchableOpacity>

                {isExpanded ? (
                  <Animated.View
                    entering={FadeIn.duration(160)}
                    exiting={FadeOut.duration(120)}
                    style={styles.planSetList}
                  >
                    {setInputs.map((set, setIndex) => (
                      <View key={setIndex} style={styles.planSetRow}>
                        <Text style={styles.planSetLabel}>Set {setIndex + 1}</Text>
                        <SetStepper
                          value={set.reps}
                          unit="reps"
                          onStep={(direction) =>
                            onStepSetInput(exercise.id, setIndex, 'reps', direction)
                          }
                        />
                        {exercise.isWeighted ? (
                          <SetStepper
                            value={set.weight}
                            unit="kg"
                            onStep={(direction) =>
                              onStepSetInput(exercise.id, setIndex, 'weight', direction)
                            }
                          />
                        ) : null}
                        {setInputs.length > 1 ? (
                          <TouchableOpacity
                            activeOpacity={0.7}
                            onPress={() => onRemoveSet(exercise.id, setIndex)}
                            style={styles.removeSetButton}
                            hitSlop={8}
                          >
                            <Trash2 size={15} color={colors.error} strokeWidth={2.2} />
                          </TouchableOpacity>
                        ) : (
                          <View style={styles.removeSetButton} />
                        )}
                      </View>
                    ))}

                    <TouchableOpacity
                      activeOpacity={0.8}
                      onPress={() => onAddSet(exercise.id)}
                      style={styles.addSetRowButton}
                    >
                      <Plus size={15} color={colors.primary} strokeWidth={2.6} />
                      <Text style={styles.addSetRowText}>Add set {setInputs.length + 1}</Text>
                    </TouchableOpacity>
                  </Animated.View>
                ) : null}
              </Animated.View>
            );
          })}
        </View>
      )}

      {isLogged && stats && !isDayLoading ? <WorkoutStatsPanel stats={stats} /> : null}

      <TouchableOpacity
        activeOpacity={0.85}
        disabled={isSaving || isDayLoading || locked}
        onPress={onSaveWorkout}
        style={[
          styles.saveWorkoutButton,
          (isSaving || isDayLoading || locked) && styles.submitButtonDisabled,
        ]}
      >
        <Text style={styles.saveWorkoutButtonText}>
          {isSaving
            ? 'Saving…'
            : locked
              ? lockedLabel ?? 'Not yet'
              : isLogStateKnown
                ? (isLogged ? 'Update Log' : 'Save Log')
                : 'Loading…'}
        </Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = themedStyles(() => ({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    padding: 16,
    marginHorizontal: spacing.screenHorizontalPadding,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.07,
    shadowRadius: 18,
    elevation: 3,
  },
  planCardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  planCardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 1,
  },
  planCardTitle: {
    fontSize: 16.5,
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: -0.2,
    flexShrink: 1,
  },
  planCardCountPill: {
    backgroundColor: withOpacity(colors.primary, 0.14),
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  planCardCountText: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.primary,
  },
  planCardLoggedPill: {
    backgroundColor: withOpacity(colors.success, 0.16),
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  planCardLoggedText: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.success,
    letterSpacing: 0.2,
  },
  editPlanButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingLeft: 8,
  },
  editPlanText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: colors.primary,
  },
  planExerciseList: {},
  planExerciseRow: {
    paddingVertical: 12,
    gap: 10,
  },
  planExerciseTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  planExerciseRowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  planExerciseIndex: {
    width: 18,
    fontSize: 11,
    fontWeight: '700',
    color: colors.textMuted,
    fontVariant: ['tabular-nums'],
  },
  planExerciseIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  planExerciseTextBlock: {
    flex: 1,
    minWidth: 0,
  },
  planExerciseName: {
    fontSize: 13.5,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  planExerciseMeta: {
    fontSize: 11,
    fontWeight: '500',
    color: colors.textSecondary,
    marginTop: 1,
    textTransform: 'capitalize',
  },
  planExerciseChevron: {
    transform: [{ rotate: '0deg' }],
  },
  planExerciseChevronExpanded: {
    transform: [{ rotate: '180deg' }],
  },
  skeletonList: {
    gap: 14,
    paddingVertical: 6,
  },
  skeletonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    height: 50,
    backgroundColor: colors.surfaceContainer,
    borderRadius: 8,
  },
  planSetList: {
    gap: 8,
    marginTop: 2,
  },
  planSetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  planSetLabel: {
    width: 46,
    fontSize: 11.5,
    fontWeight: '800',
    color: colors.textSecondary,
  },
  removeSetButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  addSetRowButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: withOpacity(colors.primary, 0.1),
    borderRadius: 12,
    paddingVertical: 9,
    marginTop: 2,
  },
  addSetRowText: {
    fontSize: 12.5,
    fontWeight: '800',
    color: colors.primary,
  },
  saveWorkoutButton: {
    backgroundColor: colors.primary,
    borderRadius: 16,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 3,
  },
  submitButtonDisabled: {
    opacity: 0.5,
    shadowOpacity: 0,
    elevation: 0,
  },
  saveWorkoutButtonText: {
    fontSize: 13.5,
    fontWeight: '800',
    color: colors.white,
  },
}));

export default WorkoutPlanCard;
