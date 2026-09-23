import React from 'react';
import { Text, View } from 'react-native';
import { Dumbbell, Flame, Hourglass, TrendingDown } from 'lucide-react-native';
import { colors, withOpacity } from '../../Theme/colors';
import { formatCompact } from '../../Services/progressService';
import { formatRecovery, type WorkoutStats } from '../../Services/workoutStats';
import { themedStyles } from '../../Theme/ThemeContext';

// The estimated benefit of one logged session: what it burned, how much
// was lifted, the fat-loss equivalent and how long the worked muscles
// need. Shown under a logged plan card. Everything here is approximate
// and the panel says so.

export interface WorkoutStatsPanelProps {
  stats: WorkoutStats;
}

export const WorkoutStatsPanel: React.FC<WorkoutStatsPanelProps> = ({ stats }) => {
  const tiles = [
    {
      key: 'calories',
      icon: Flame,
      color: colors.secondary,
      value: `${stats.caloriesBurned}`,
      unit: 'kcal',
      label: 'Burned',
    },
    {
      key: 'volume',
      icon: Dumbbell,
      color: colors.primary,
      value: formatCompact(stats.volumeKg),
      unit: 'kg',
      label: 'Volume',
    },
    {
      key: 'fat',
      icon: TrendingDown,
      color: colors.success,
      value: `${stats.fatLossGrams}`,
      unit: 'g',
      label: 'Fat equiv.',
    },
    {
      key: 'recovery',
      icon: Hourglass,
      color: colors.textSecondary,
      value: formatRecovery(stats.recoveryHours),
      unit: '',
      label: 'Recovery',
    },
  ];

  const muscles = stats.recoveryMuscles.map((entry) => entry.muscle).join(', ');

  return (
    <View style={styles.panel} accessibilityLabel="Estimated workout benefits">
      <Text style={styles.title}>Workout impact</Text>

      <View style={styles.tileRow}>
        {tiles.map(({ key, icon: Icon, color, value, unit, label }) => (
          <View key={key} style={styles.tile}>
            <View style={[styles.tileIcon, { backgroundColor: withOpacity(color, 0.14) }]}>
              <Icon size={14} color={color} strokeWidth={2.4} />
            </View>
            <Text style={styles.tileValue} numberOfLines={1}>
              {value}
              {unit ? <Text style={styles.tileUnit}> {unit}</Text> : null}
            </Text>
            <Text style={styles.tileLabel}>{label}</Text>
          </View>
        ))}
      </View>

      <Text style={styles.caption}>
        {muscles ? `Most worked: ${muscles}. ` : ''}
        Estimates from your last saved sets and {Math.round(stats.weightKgUsed)} kg body weight —
        approximate, not a measurement.
      </Text>
    </View>
  );
};

const styles = themedStyles(() => ({
  panel: {
    marginTop: 16,
    padding: 12,
    borderRadius: 16,
    backgroundColor: colors.surfaceLow,
    gap: 10,
  },
  title: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  tileRow: {
    flexDirection: 'row',
    gap: 8,
  },
  tile: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: colors.surface,
  },
  tileIcon: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileValue: {
    fontSize: 13.5,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  tileUnit: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  tileLabel: {
    fontSize: 9.5,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  caption: {
    fontSize: 10.5,
    lineHeight: 15,
    color: colors.textSecondary,
  },
}));

export default WorkoutStatsPanel;
