import React from 'react';
import { View, Text, Image } from 'react-native';
import { colors } from '../../Theme/colors';
import { typography } from '../../Theme/typography';
import { spacing } from '../../Theme/spacing';
import { themedStyles } from '../../Theme/ThemeContext';

interface AppHeaderProps {
  sectionLabel: string;
  avatarUrl: string;
}

export default function AppHeader({ sectionLabel, avatarUrl }: AppHeaderProps) {
  return (
    <View style={styles.header}>
      <View style={styles.brandGroup}>
        <View style={styles.logoBadge}>
          <Text style={styles.logoBadgeText}>FT</Text>
        </View>
        <Text style={styles.brandText}>FITTRACK</Text>
      </View>

      <View style={styles.rightGroup}>
        <Text style={styles.sectionLabel}>{sectionLabel}</Text>
        <Image source={{ uri: avatarUrl }} style={styles.avatar} />
      </View>
    </View>
  );
}

const styles = themedStyles(() => ({
  header: {
    height: 56,
    paddingHorizontal: spacing.gutterMobile,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
  },
  brandGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  logoBadge: {
    width: 26,
    height: 26,
    borderRadius: radiusSm(),
    backgroundColor: colors.surfaceContainerHigh,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoBadgeText: {
    ...typography.labelCaps,
    color: colors.primaryContainer,
    fontSize: 10,
  },
  brandText: {
    ...typography.headlineSm,
    color: colors.onSurface,
    letterSpacing: 0.5,
  },
  rightGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  sectionLabel: {
    ...typography.headlineSm,
    color: colors.onSurfaceVariant,
    fontWeight: '500',
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
}));

function radiusSm() {
  return 8;
}