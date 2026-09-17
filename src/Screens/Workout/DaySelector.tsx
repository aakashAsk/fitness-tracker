import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { Check } from 'lucide-react-native';
import { colors } from '../../Theme/colors';
import { radius } from '../../Theme/spacing';
import { TrainingDays } from './Types';
import { DAY_ORDER } from './Data';
import { themedStyles } from '../../Theme/ThemeContext';

interface DaySelectorProps {
  trainingDays: TrainingDays;
  onToggleDay: (day: (typeof DAY_ORDER)[number]) => void;
  cadenceSummary: string;
}

export const DaySelector: React.FC<DaySelectorProps> = ({ trainingDays, onToggleDay, cadenceSummary }) => {
  return (
    <View style={styles.container}>
      <View>
        <Text style={styles.title}>When do you train?</Text>
        <Text style={styles.subtitle}>
          Select recurring training days to auto-lock calendar slots
        </Text>
      </View>

      {/* 7-Day Matrix */}
      <View style={styles.matrix}>
        {DAY_ORDER.map((day) => {
          const isSelected = trainingDays[day];
          return (
            <Pressable
              key={day}
              onPress={() => onToggleDay(day)}
              style={[styles.chip, isSelected ? styles.chipSelected : styles.chipIdle]}
            >
              <Text
                style={[
                  styles.chipText,
                  { color: isSelected ? colors.onPrimary : colors.textSecondary },
                ]}
              >
                {day.toUpperCase()}
              </Text>
              {isSelected ? (
                <Check size={13} strokeWidth={3} color={colors.onPrimary} />
              ) : (
                <View style={styles.emptyDot} />
              )}
            </Pressable>
          );
        })}
      </View>

      {/* Selected Cadence Box */}
      <View style={styles.cadenceBox}>
        <Text style={styles.cadenceLabel}>Selected Cadence:</Text>
        <Text style={styles.cadenceValue}>{cadenceSummary}</Text>
      </View>
    </View>
  );
};

const styles = themedStyles(() => ({
  container: { gap: 12, paddingTop: 4 },
  title: { fontSize: 14, fontWeight: '700', color: colors.white },
  subtitle: { fontSize: 12, color: colors.textSecondary },
  matrix: { flexDirection: 'row', gap: 6 },
  chip: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: radius.md,
    gap: 8,
  },
  chipSelected: { backgroundColor: colors.primary },
  chipIdle: {
    backgroundColor: colors.cardBackgroud,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  chipText: { fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  emptyDot: { width: 6, height: 6 },
  cadenceBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radius.md,
    backgroundColor: colors.cardBackgroud,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  cadenceLabel: { fontSize: 12, color: colors.textSecondary },
  cadenceValue: { fontSize: 12, fontWeight: '700', color: colors.primary, flexShrink: 1, textAlign: 'right' },
}));

export default DaySelector;
