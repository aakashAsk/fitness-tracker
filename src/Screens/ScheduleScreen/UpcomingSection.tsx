import React, { useEffect } from 'react';
import { Text, View, ScrollView } from 'react-native';
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { colors } from '../../Theme/colors';
import { typography } from '../../Theme/typography';
import { spacing } from '../../Theme/spacing';
import UpcomingCard, { UpcomingItem } from './UpcomingCard';
import { themedStyles } from '../../Theme/ThemeContext';

interface UpcomingSectionProps {
  items: UpcomingItem[];
  /** Collapses every card to a single line — icon, title, start time. */
  compact?: boolean;
}

const HEADER_HEIGHT = 20;

export default function UpcomingSection({ items, compact }: UpcomingSectionProps) {
  // Same technique as UpcomingCard: animate one persistent header's height
  // + opacity instead of mounting/unmounting it, so nothing below it
  // reflows abruptly mid-animation.
  const progress = useSharedValue(compact ? 1 : 0);

  useEffect(() => {
    progress.value = withTiming(compact ? 1 : 0, { duration: 220 });
  }, [compact, progress]);

  const headerStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 1], [1, 0]),
    maxHeight: interpolate(progress.value, [0, 1], [HEADER_HEIGHT, 0]),
    marginBottom: interpolate(progress.value, [0, 1], [spacing.xs, 0]),
  }));

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.headerRow, headerStyle]}>
        <Text style={styles.title}>UPCOMING NEXT ({items.length})</Text>
        <Text style={styles.synced}>Synchronized</Text>
      </Animated.View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {items.map((item) => (
          <UpcomingCard key={item.id} item={item} compact={compact} />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = themedStyles(() => ({
  container: {},
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.gutterMobile,
    overflow: 'hidden',
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
}));
