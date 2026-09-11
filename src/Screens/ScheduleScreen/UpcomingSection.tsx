import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { colors } from '../../Theme/colors';
import { typography } from '../../Theme/typography';
import { spacing } from '../../Theme/spacing';
import UpcomingCard, { UpcomingItem } from './UpcomingCard';

interface UpcomingSectionProps {
  items: UpcomingItem[];
}

export default function UpcomingSection({ items }: UpcomingSectionProps) {
  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>UPCOMING NEXT ({items.length})</Text>
        <Text style={styles.synced}>Synchronized</Text>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {items.map((item) => (
          <UpcomingCard key={item.id} item={item} />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.xs,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.gutterMobile,
  },
  title: {
    ...typography.labelCaps,
    color: colors.onSurfaceVariant,
  },
  synced: {
    ...typography.bodySm,
    color: colors.onSurfaceVariant,
  },
  scrollContent: {
    paddingHorizontal: spacing.gutterMobile,
    gap: spacing.xs,
  },
});
