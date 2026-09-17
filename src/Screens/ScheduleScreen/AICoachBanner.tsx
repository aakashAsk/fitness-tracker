import React from 'react';
import { View, Text } from 'react-native';
import { Sparkles } from 'lucide-react-native';
import { colors, withOpacity } from '../../Theme/colors';
import { typography } from '../../Theme/typography';
import { spacing, radius } from '../../Theme/spacing';
import { themedStyles } from '../../Theme/ThemeContext';

interface AICoachBannerProps {
  message: string;
  planLabel: string;
  restLabel: string;
}

export default function AICoachBanner({ message, planLabel, restLabel }: AICoachBannerProps) {
  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <Sparkles size={14} color={colors.secondary} />
          <Text style={styles.headerLabel}>AI COACH TELEMETRY</Text>
        </View>
        <Text style={styles.windowLabel}>OPTIMAL WINDOW</Text>
      </View>

      <Text style={styles.message}>{message}</Text>

      <View style={styles.footerRow}>
        <Text style={styles.footerItem}>{planLabel}</Text>
        <Text style={styles.footerDivider}>·</Text>
        <Text style={styles.footerItem}>{restLabel}</Text>
      </View>
    </View>
  );
}

const styles = themedStyles(() => ({
  card: {
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radius.lg,
    padding: spacing.cardPadding - 4,
    marginHorizontal: spacing.gutterMobile,
    gap: 8,
    borderWidth: 1,
    borderColor: withOpacity(colors.aiRecovery, 0.2),
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerLabel: {
    ...typography.labelCaps,
    color: colors.secondary,
  },
  windowLabel: {
    ...typography.labelCaps,
    color: colors.primaryContainer,
  },
  message: {
    ...typography.bodySm,
    color: colors.onSurface,
    lineHeight: 18,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  footerItem: {
    ...typography.labelRegular,
    color: colors.onSurfaceVariant,
  },
  footerDivider: {
    color: colors.onSurfaceVariant,
  },
}));
