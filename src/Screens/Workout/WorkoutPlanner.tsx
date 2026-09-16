import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, Alert } from 'react-native';
import { Zap, Plus } from 'lucide-react-native';

import { colors } from '../../Theme/colors';
import { textStyle } from '../../Theme/typography';
import { ExerciseItem, PlanItem, NavTab, DayKey } from './Types';
import { INITIAL_EXERCISES, INITIAL_PLANS, INITIAL_TRAINING_DAYS } from './Data';

import { Header } from './Header';
import { ActivePlanCard } from './ActivePlanCard';
import { SavedPlansList } from './SavedPlansList';
import { PlanBuilder } from './PlanBuilder';
import { SaveControls } from './SaveControls';
import { SaveSuccessModal } from './SaveSuccessModal';
import { StartWorkoutModal } from './StartWorkoutModal';
import { EditExerciseModal } from './EditExerciseModal';
import { EditPlanModal } from './EditPlanModal';
import { NewPlanModal } from './NewPlanModal';
import {
  createWorkoutPlan,
  updateWorkoutPlan,
  WorkoutPlan,
  WorkoutPlanServiceError,
} from '../../Services/workoutPlanService';
import { useWorkoutPlans } from '../../Store/workoutPlansSlice';

interface WorkoutPlannerScreenProps {
  onOpenQuickAdd?: () => void;
}

// Maps a Firestore-stored plan to the PlanItem shape ActivePlanCard /
// SavedPlansList already know how to render. `active` is passed in
// separately so re-subscribing doesn't clobber the user's local selection.
function toPlanItem(plan: WorkoutPlan, active: boolean): PlanItem {
  return {
    id: plan.id,
    title: plan.name,
    daysPerWeek: plan.days.length,
    scheduleDays: plan.days.length > 0 ? plan.days.join(' · ') : 'No days set',
    time: plan.time || 'Not scheduled',
    active,
    type: plan.muscles.length > 0 ? plan.muscles.join(' & ') : 'Custom Plan',
    status: plan.status,
  };
}

export const WorkoutPlanner: React.FC<WorkoutPlannerScreenProps> = ({ onOpenQuickAdd }) => {
  // Navigation
  const [activeNavTab, setActiveNavTab] = useState<NavTab>('workout');

  // Live Firestore plans — synced into Redux once at the app root
  // (App.tsx's useWorkoutPlansSync), so every screen just reads the shared
  // store instead of running its own subscribeToWorkoutPlans() listener.
  const firestorePlans = useWorkoutPlans();
  const firestorePlanIds = useMemo(
    () => new Set(firestorePlans.map((p) => p.id)),
    [firestorePlans],
  );

  // Active Plan States — Firestore plans (newest first) prepended ahead of
  // the demo plans, re-derived whenever the store updates.
  const [plans, setPlans] = useState<PlanItem[]>(INITIAL_PLANS);
  useEffect(() => {
    setPlans((prev) => {
      const activeIds = new Set(prev.filter((p) => p.active).map((p) => p.id));
      const mapped = firestorePlans.map((p) => toPlanItem(p, activeIds.has(p.id)));
      return [...mapped, ...INITIAL_PLANS];
    });
  }, [firestorePlans]);

  // Plan builder state
  const [trainingDays, setTrainingDays] = useState(INITIAL_TRAINING_DAYS);
  const [targetHour] = useState<string>('06');
  const [targetMinute] = useState<string>('30');
  const [targetPeriod, setTargetPeriod] = useState<'AM' | 'PM'>('PM');
  const [sessionDuration, setSessionDuration] = useState<string>('60m');
  const [sessionReminder, setSessionReminder] = useState<boolean>(true);
  const [reminderOffset, setReminderOffset] = useState<string>('15m');

  // Exercise builder state
  const [exercises, setExercises] = useState<ExerciseItem[]>(INITIAL_EXERCISES);
  const [searchFilter, setSearchFilter] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [editingExercise, setEditingExercise] = useState<ExerciseItem | null>(null);

  // Modals
  const [showStartWorkoutModal, setShowStartWorkoutModal] = useState<boolean>(false);
  const [showSaveSuccess, setShowSaveSuccess] = useState<boolean>(false);
  const [showEditPlanModal, setShowEditPlanModal] = useState<boolean>(false);
  const [showNewPlanModal, setShowNewPlanModal] = useState<boolean>(false);

  // Bottom toast
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = (message: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToastMessage(message);
    toastTimer.current = setTimeout(() => setToastMessage(null), 2500);
  };

  // Toggle training day
  const toggleDay = (day: DayKey) => {
    setTrainingDays((prev: any) => ({ ...prev, [day]: !prev[day] }));
  };

  // Generate cadence summary text
  const getCadenceSummary = () => {
    const activeDays = Object.entries(trainingDays)
      .filter(([, active]) => active)
      .map(([day]) => day);

    if (activeDays.length === 0) return 'No days selected';
    if (activeDays.length === 3 && trainingDays.Mon && trainingDays.Wed && trainingDays.Fri) {
      return 'Mon (Push) · Wed (Pull) · Fri (Legs)';
    }
    return activeDays.map((d) => `${d} (Session)`).join(' · ');
  };

  // Handle Plan Activation
  const handleActivatePlan = (planId: string) => {
    setPlans((prev) => prev.map((p) => ({ ...p, active: p.id === planId })));
  };

  const activePlan = plans.find((p) => p.active) || plans[0];
  const planPaused = activePlan.status === 'paused';

  // Pause/resume the active plan. Persists to Firestore for real plans;
  // the built-in demo plans (not in `firestorePlanIds`) only update locally.
  const handleTogglePause = async () => {
    const nextStatus: PlanItem['status'] = planPaused ? 'live' : 'paused';
    const targetId = activePlan.id;

    setPlans((prev) =>
      prev.map((p) => (p.id === targetId ? { ...p, status: nextStatus } : p)),
    );

    if (firestorePlanIds.has(targetId)) {
      try {
        await updateWorkoutPlan(targetId, { status: nextStatus });
      } catch (err) {
        showToast(
          err instanceof WorkoutPlanServiceError
            ? err.message
            : 'Could not update the plan status.',
        );
      }
    }
  };

  // Save Plan
  const handleSavePlan = () => {
    setShowSaveSuccess(true);
    setTimeout(() => setShowSaveSuccess(false), 2800);
  };

  // Move exercise up/down
  const moveExercise = (index: number, direction: 'up' | 'down') => {
    const newEx = [...exercises];
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    if (targetIdx >= 0 && targetIdx < newEx.length) {
      const temp = newEx[index];
      newEx[index] = newEx[targetIdx];
      newEx[targetIdx] = temp;
      setExercises(newEx);
    }
  };



  return (
    <View style={styles.root}>
      <Header />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Screen Title Bar */}
        <View style={styles.titleBar}>
          <View style={styles.titleTextWrap}>
            <Text style={[textStyle('headlineLg'), { color: colors.white }]}>
              Workout Planner
            </Text>
            <Text style={styles.subtitle}>
              Build a workout plan that fits your schedule.
            </Text>
          </View>

          <View style={styles.newPlanBtnClip}>
            <Pressable
              onPress={() => {
                onOpenQuickAdd?.();
                setShowNewPlanModal(true);
              }}
              android_ripple={{ color: colors.primaryDark }}
              style={styles.newPlanBtn}
            >
              <Plus size={16} strokeWidth={2.8} color={colors.onPrimary} />
              <Text style={styles.newPlanBtnText}>New Plan</Text>
            </Pressable>
          </View>
        </View>

        {/* SECTION 1: Current Regimen */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionHeaderLeft}>
              <Zap size={15}  color={colors.primary} />
              <Text style={[textStyle('labelCaps'), styles.sectionLabel]}>
                CURRENT REGIMEN
              </Text>
            </View>
            <Text style={styles.sectionMeta}>1 of {plans.length} Active</Text>
          </View>

          <ActivePlanCard
            plan={activePlan}
            isPaused={planPaused}
            onStartWorkout={() => setShowStartWorkoutModal(true)}
            onEditPlan={() => setShowEditPlanModal(true)}
            onTogglePause={handleTogglePause}
          />

          <SavedPlansList plans={plans} onActivate={handleActivatePlan} />
        </View>

        {/* SECTION 2: Guided Interactive Plan Builder Section */}
        <View style={styles.sectionLoose}>
          <PlanBuilder
            onEditRoutineProfile={() => setShowEditPlanModal(true)}
            exercises={exercises}
            onMoveExercise={moveExercise}
            onEditExercise={setEditingExercise}
            searchFilter={searchFilter}
            onSearchFilterChange={setSearchFilter}
            selectedCategory={selectedCategory}
            onSelectedCategoryChange={setSelectedCategory}
            trainingDays={trainingDays}
            onToggleDay={toggleDay}
            cadenceSummary={getCadenceSummary()}
            targetHour={targetHour}
            targetMinute={targetMinute}
            targetPeriod={targetPeriod}
            onTargetPeriodChange={setTargetPeriod}
            sessionDuration={sessionDuration}
            onSessionDurationChange={setSessionDuration}
            sessionReminder={sessionReminder}
            onToggleSessionReminder={() => setSessionReminder(!sessionReminder)}
            reminderOffset={reminderOffset}
            onReminderOffsetChange={setReminderOffset}
          />

          {/* SECTION 3: Step 5 Final Review & Save CTA Controls */}
          <SaveControls
            onSave={handleSavePlan}
            onSaveDraft={() =>
              Alert.alert('Draft saved', 'Plan saved as draft to your local device.')
            }
          />
        </View>
      </ScrollView>

      {showSaveSuccess && (
        <SaveSuccessModal
          onClose={() => setShowSaveSuccess(false)}
          targetHour={targetHour}
          targetMinute={targetMinute}
          targetPeriod={targetPeriod}
          cadenceSummary={getCadenceSummary()}
        />
      )}

      {showStartWorkoutModal && (
        <StartWorkoutModal
          exercises={exercises}
          onClose={() => setShowStartWorkoutModal(false)}
          onBeginTracking={() => {
            setShowStartWorkoutModal(false);
            Alert.alert(
              'Workout started',
              'Workout timer started! Recording live heart rate telemetry.',
            );
          }}
        />
      )}

      {editingExercise && (
        <EditExerciseModal
          exercise={editingExercise}
          onChange={setEditingExercise}
          onClose={() => setEditingExercise(null)}
          onSave={(updated: any) => {
            setExercises((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
            setEditingExercise(null);
          }}
        />
      )}

      {showEditPlanModal && (
        <EditPlanModal
          planTitle={activePlan.title}
          onClose={() => setShowEditPlanModal(false)}
          onSave={() => {
            setShowEditPlanModal(false);
            Alert.alert('Updated', 'Plan details updated!');
          }}
        />
      )}

      {showNewPlanModal && (
        <NewPlanModal
          onClose={() => setShowNewPlanModal(false)}
          onCreate={async (payload) => {
            setShowNewPlanModal(false);
            try {
              await createWorkoutPlan({ ...payload, status: 'live' });
              showToast('Workout plan created!');
            } catch (err) {
              showToast(
                err instanceof WorkoutPlanServiceError
                  ? err.message
                  : 'Could not save the plan. Check your connection.',
              );
            }
          }}
          onSaveDraft={async (payload) => {
            setShowNewPlanModal(false);
            try {
              await createWorkoutPlan({ ...payload, status: 'draft' });
              showToast('Saved as draft.');
            } catch (err) {
              showToast(
                err instanceof WorkoutPlanServiceError
                  ? err.message
                  : 'Could not save the draft. Check your connection.',
              );
            }
          }}
        />
      )}

      {toastMessage && (
        <View style={styles.toast} pointerEvents="none">
          <Text style={styles.toastText}>{toastMessage}</Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 24,
    gap: 24,
  },
  titleBar: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  titleTextWrap: { flex: 1 },
  subtitle: { fontSize: 12, marginTop: 2, color: colors.onSurfaceVariant },
  // Outer view owns the shape + clips the inner Pressable's own ripple
  // drawable — `overflow: 'hidden'` on a view only clips its CHILDREN, not
  // that same view's own native ripple foreground, so the clip has to sit
  // one level up from the Pressable that draws the ripple.
  newPlanBtnClip: {
    height: 40,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: colors.primary,
  },
  newPlanBtn: {
    flex: 1,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  newPlanBtnText: { color: colors.onPrimary, fontWeight: '700', fontSize: 12 },
  pressed: { opacity: 0.85 },
  section: { gap: 12 },
  sectionLoose: { gap: 16, paddingTop: 8 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sectionLabel: { color: colors.onSurfaceVariant },
  sectionMeta: { fontSize: 12, color: colors.onSurfaceVariant },
  toast: {
    position: 'absolute',
    left: 24,
    right: 24,
    bottom: 32,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    backgroundColor: colors.surfaceContainerHighest,
    borderWidth: 1,
    borderColor: colors.border,
  },
  toastText: {
    color: colors.onSurface,
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
});

export default WorkoutPlanner;
