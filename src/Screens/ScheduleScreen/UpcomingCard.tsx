import React, { useEffect } from 'react';
import { Text, View } from 'react-native';
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { LucideIcon } from 'lucide-react-native';
import { colors } from '../../Theme/colors';
import { typography } from '../../Theme/typography';
import { spacing, radius } from '../../Theme/spacing';
import { themedStyles } from '../../Theme/ThemeContext';

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

interface UpcomingCardProps {
  item: UpcomingItem;
  /** Collapses the card to one line — icon, title, start time. */
  compact?: boolean;
}

// A single persistent card whose "meta/footer" block collapses via an
// animated height + opacity, rather than swapping between two completely
// different mounted trees. The previous version keyed two different
// <Animated.View> layouts and relied on entering/exiting to crossfade them
// — inside a horizontal ScrollView, that meant every sibling card was also
// reflowing (widths changing) at the same time the exiting/entering card
// was still mid-fade, which is what produced the jump/flicker. Animating
// one stable-width card's internal content instead means no sibling ever
// moves, so there's nothing left to cause that jitter.
const DETAILS_HEIGHT = 40; // enough for the meta + footer lines

export default function UpcomingCard({ item, compact }: UpcomingCardProps) {
  const Icon = item.icon;
  const progress = useSharedValue(compact ? 1 : 0);

  useEffect(() => {
    progress.value = withTiming(compact ? 1 : 0, { duration: 220 });
  }, [compact, progress]);

  const detailsStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 1], [1, 0]),
    maxHeight: interpolate(progress.value, [0, 1], [DETAILS_HEIGHT, 0]),
    marginTop: interpolate(progress.value, [0, 1], [4, 0]),
  }));

  return (
    <View style={styles.card}>
      <View style={styles.topRow}>
        <View style={[styles.iconBadge, { backgroundColor: item.iconBg }]}>
          <Icon size={14} color={item.iconColor} />
        </View>
        <Text style={styles.title} numberOfLines={1}>
          {item.title}
        </Text>
        <Text style={styles.timeLabel} numberOfLines={1}>
          {item.timeLabel}
        </Text>
      </View>

      <Animated.View style={[styles.details, detailsStyle]}>
        <Text style={styles.meta} numberOfLines={1}>
          {item.meta}
        </Text>
        <Text
          style={[styles.footer, item.footerColor ? { color: item.footerColor } : null]}
          numberOfLines={1}
        >
          {item.footer}
        </Text>
      </Animated.View>
    </View>
  );
}

const styles = themedStyles(() => ({
  card: {
    width: 200,
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radius.lg,
    padding: spacing.sm,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconBadge: {
    width: 26,
    height: 26,
    borderRadius: radius.md - 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    ...typography.bodySm,
    fontWeight: '700',
    color: colors.onSurface,
    flex: 1,
  },
  timeLabel: {
    ...typography.labelRegular,
    color: colors.onSurfaceVariant,
  },
  details: {
    overflow: 'hidden',
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
}));
