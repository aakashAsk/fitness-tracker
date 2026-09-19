import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Minus, Plus } from 'lucide-react-native';
import { colors } from '../../Theme/colors';
import { themedStyles } from '../../Theme/ThemeContext';

interface SetStepperProps {
  value: string;
  unit: string;
  onStep: (direction: 1 | -1) => void;
}

export const SetStepper: React.FC<SetStepperProps> = ({ value, unit, onStep }) => (
  <View style={styles.stepper}>
    <TouchableOpacity
      activeOpacity={0.6}
      onPress={() => onStep(-1)}
      hitSlop={6}
      style={styles.stepperButton}
    >
      <Minus size={14} color={colors.textSecondary} strokeWidth={2.8} />
    </TouchableOpacity>

    <View style={styles.stepperValueBlock}>
      <Text style={styles.stepperValue}>{value === '' ? '—' : value}</Text>
      <Text style={styles.stepperUnit}>{unit}</Text>
    </View>

    <TouchableOpacity
      activeOpacity={0.6}
      onPress={() => onStep(1)}
      hitSlop={6}
      style={styles.stepperButton}
    >
      <Plus size={14} color={colors.primary} strokeWidth={2.8} />
    </TouchableOpacity>
  </View>
);

const styles = themedStyles(() => ({
  stepper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surfaceLow,
    borderRadius: 12,
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  stepperButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  stepperValueBlock: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 28,
  },
  stepperValue: {
    fontSize: 14,
    lineHeight: 16,
    includeFontPadding: false,
    textAlign: 'center',
    textAlignVertical: 'center',
    fontWeight: '800',
    color: colors.textPrimary,
  },
  stepperUnit: {
    fontSize: 9,
    lineHeight: 11,
    includeFontPadding: false,
    textAlign: 'center',
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
}));

export default SetStepper;
