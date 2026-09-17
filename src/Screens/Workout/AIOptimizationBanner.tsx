import React from 'react';
import { View, Text } from 'react-native';
import { Sparkles } from 'lucide-react-native';
import { colors, withOpacity } from '../../Theme/colors';
import { radius } from '../../Theme/spacing';
import { textStyle } from '../../Theme/typography';
import { themedStyles } from '../../Theme/ThemeContext';

interface AIOptimizationBannerProps {
  sessionDuration: string;
  targetHour: string;
  targetMinute: string;
  targetPeriod: 'AM' | 'PM';
}

export const AIOptimizationBanner: React.FC<AIOptimizationBannerProps> = ({
  sessionDuration,
  targetHour,
  targetMinute,
  targetPeriod,
}) => {
  return (
    <View style={styles.container}>
      <Sparkles size={18} color={colors.secondary} />
      <View style={styles.textWrap}>
        <Text style={[textStyle('labelCaps'), { color: colors.secondary }]}>
          KINETIC AI OPTIMIZATION
        </Text>
        <Text style={styles.body}>
          Your target {sessionDuration} session matches your peak heart rate readiness score at{' '}
          {targetHour}:{targetMinute} {targetPeriod} based on past sleep telemetry.
        </Text>
      </View>
    </View>
  );
};

const styles = themedStyles(() => ({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    borderRadius: radius.md,
    backgroundColor: colors.cardBackgroud,
    borderWidth: 1,
    borderColor: withOpacity(colors.secondary, 0.25),
    padding: 14,
  },
  textWrap: { flex: 1, gap: 2 },
  body: { fontSize: 12, lineHeight: 18, color: colors.textSecondary },
}));

export default AIOptimizationBanner;
