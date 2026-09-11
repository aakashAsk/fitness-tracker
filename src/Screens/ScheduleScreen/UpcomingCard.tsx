import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LucideIcon } from 'lucide-react-native';
import { colors } from '../../Theme/colors';
import { typography } from '../../Theme/typography';
import { spacing, radius } from '../../Theme/spacing';

export interface UpcomingItem {
  id: string;
  icon: LucideIcon;
  iconColor: string;
  iconBg: string;
  timeLabel: string; // "6:00 PM" or "6:15 PM - 60m"
  title: string;
  meta: string; // "Downtown Locker #42" / "5 exercises planned"
  footer: string; // "Starts in 6h 18m" / "HIGH INTENSITY"
  footerColor?: string;
}

export default function UpcomingCard({ item }: { item: UpcomingItem }) {
  const Icon = item.icon;
  return (
    <View style={styles.card}>
      <View style={styles.topRow}>
        <View style={[styles.iconBadge, { backgroundColor: item.iconBg }]}>
          <Icon size={14} color={item.iconColor} />
        </View>
        <Text style={styles.timeLabel}>{item.timeLabel}</Text>
      </View>

      <Text style={styles.title} numberOfLines={1}>
        {item.title}
      </Text>
      <Text style={styles.meta} numberOfLines={1}>
        {item.meta}
      </Text>

      <Text style={[styles.footer, item.footerColor ? { color: item.footerColor } : null]}>
        {item.footer}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: 200,
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radius.lg,
    padding: spacing.sm,
    gap: 4,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  iconBadge: {
    width: 26,
    height: 26,
    borderRadius: radius.md - 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timeLabel: {
    ...typography.labelRegular,
    color: colors.onSurfaceVariant,
  },
  title: {
    ...typography.headlineSm,
    fontSize: 14,
    color: colors.onSurface,
    marginTop: 4,
  },
  meta: {
    ...typography.bodySm,
    color: colors.onSurfaceVariant,
  },
  footer: {
    ...typography.labelCaps,
    fontSize: 10,
    color: colors.primaryContainer,
    marginTop: 4,
  },
});
