// Owns the answers for all four steps and does the single write at the
// end. Nothing is persisted until "Complete setup": a half-finished
// profile would satisfy the onboardingCompleted check on the next cold
// start and strand the user with targets derived from defaults.
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
import { colors } from '../../Theme/colors';
import {
  ProfileAnswers,
  saveUserProfile,
  UserProfile,
} from '../../Services/userProfileService';
import AboutYouStep from './AboutYouStep';
import WorkoutFrequencyStep from './WorkoutFrequencyStep';
import GoalStep from './GoalStep';
import ObstacleStep from './ObstacleStep';
import BodyMetricsStep from './BodyMetricsStep';
import ActivityStep from './ActivityStep';
import { themedStyles } from '../../Theme/ThemeContext';

// Population medians, so the previews show a plausible number before
// the user has touched anything rather than zeros.
const DEFAULT_ANSWERS: ProfileAnswers = {
  // No sensible default exists for either — step 1 asks, and the name is
  // required before it will let the user past.
  displayName: '',
  phoneNumber: '',
  gender: 'male',
  age: 26,
  birthDate: null,
  heightCm: 175,
  weightKg: 75,
  targetWeightKg: 70,
  goal: 'fat-loss',
  obstacle: 'consistency',
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
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5 | 6>(1);
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
      // Stay on the last step with everything still filled in — the failure is
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
      // Android's own softwareKeyboardLayoutMode: 'resize' (app.json)
      // should in principle handle this alone, but leaving Android with
      // no behavior at all is what left the phone number field hidden
      // behind the keyboard — 'height' shrinks this view to make room,
      // the same way 'padding' does for iOS.
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.flex}>
        {/* 1: who they are. 2: body metrics — grouped right after,
            per the "name/number, then body weight, then everything
            else" ordering. 3-5: everything else. 6: pace/health +
            the final summary. */}
        {step === 1 ? (
          <AboutYouStep
            value={{
              displayName: answers.displayName,
              phoneNumber: answers.phoneNumber,
            }}
            onChange={patch}
            onContinue={() => setStep(2)}
          />
        ) : null}

        {step === 2 ? (
          <BodyMetricsStep
            value={{
              gender: answers.gender,
              age: answers.age,
              birthDate: answers.birthDate,
              heightCm: answers.heightCm,
              weightKg: answers.weightKg,
              targetWeightKg: answers.targetWeightKg,
            }}
            onChange={patch}
            onContinue={() => setStep(3)}
            onBack={() => setStep(1)}
          />
        ) : null}

        {step === 3 ? (
          <WorkoutFrequencyStep
            value={answers.activityLevel}
            onChange={activityLevel => patch({ activityLevel })}
            onContinue={() => setStep(4)}
            onBack={() => setStep(2)}
          />
        ) : null}

        {step === 4 ? (
          <GoalStep
            value={answers.goal}
            onChange={goal => patch({ goal })}
            onContinue={() => setStep(5)}
            onBack={() => setStep(3)}
          />
        ) : null}

        {step === 5 ? (
          <ObstacleStep
            value={answers.obstacle}
            onChange={obstacle => patch({ obstacle })}
            onContinue={() => setStep(6)}
            onBack={() => setStep(4)}
          />
        ) : null}

        {step === 6 ? (
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
            onBack={() => setStep(5)}
            saving={saving}
            errorMessage={errorMessage}
          />
        ) : null}
      </View>
    </KeyboardAvoidingView>
  );
};

export default OnboardingNavigator;

const styles = themedStyles(() => ({
  flex: { flex: 1, backgroundColor: colors.background },
}));
