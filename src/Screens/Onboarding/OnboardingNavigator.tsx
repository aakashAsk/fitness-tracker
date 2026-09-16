// Owns the answers for all three steps and does the single write at the
// end. Nothing is persisted until "Complete setup": a half-finished
// profile would satisfy the onboardingCompleted check on the next cold
// start and strand the user with targets derived from defaults.
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';
import { colors } from '../../Theme/colors';
import {
  ProfileAnswers,
  saveUserProfile,
  UserProfile,
} from '../../Services/userProfileService';
import GoalStep from './GoalStep';
import BodyMetricsStep from './BodyMetricsStep';
import ActivityStep from './ActivityStep';

// Population medians, so the previews show a plausible number before
// the user has touched anything rather than zeros.
const DEFAULT_ANSWERS: ProfileAnswers = {
  gender: 'male',
  age: 26,
  heightCm: 175,
  weightKg: 75,
  goal: 'fat-loss',
  activityLevel: 'moderate',
  weeklyPaceKg: 0.5,
  injuries: [],
  dietaryPreferences: [],
};

export interface OnboardingNavigatorProps {
  /** Called with the saved profile once the write succeeds. */
  onComplete: (profile: UserProfile) => void;
}

export const OnboardingNavigator: React.FC<OnboardingNavigatorProps> = ({ onComplete }) => {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [answers, setAnswers] = useState<ProfileAnswers>(DEFAULT_ANSWERS);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const patch = (next: Partial<ProfileAnswers>) =>
    setAnswers(current => ({ ...current, ...next }));

  const handleSubmit = async () => {
    setErrorMessage(null);
    setSaving(true);
    try {
      onComplete(await saveUserProfile(answers));
    } catch (error) {
      // Stay on step 3 with everything still filled in — the failure is
      // almost always transient (offline, rules), and re-asking nine
      // questions to retry a network call would be punitive.
      setErrorMessage((error as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.flex}>
        {step === 1 ? (
          <GoalStep
            value={answers.goal}
            onChange={goal => patch({ goal })}
            onContinue={() => setStep(2)}
          />
        ) : null}

        {step === 2 ? (
          <BodyMetricsStep
            value={{
              gender: answers.gender,
              age: answers.age,
              heightCm: answers.heightCm,
              weightKg: answers.weightKg,
            }}
            onChange={patch}
            onContinue={() => setStep(3)}
            onBack={() => setStep(1)}
          />
        ) : null}

        {step === 3 ? (
          <ActivityStep
            value={{
              activityLevel: answers.activityLevel,
              weeklyPaceKg: answers.weeklyPaceKg,
              injuries: answers.injuries,
              dietaryPreferences: answers.dietaryPreferences,
            }}
            answers={answers}
            goal={answers.goal}
            onChange={patch}
            onSubmit={handleSubmit}
            onBack={() => setStep(2)}
            saving={saving}
            errorMessage={errorMessage}
          />
        ) : null}
      </View>
    </KeyboardAvoidingView>
  );
};

export default OnboardingNavigator;

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
});
