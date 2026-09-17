import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import {
  Calendar,
  Dumbbell,
  Home,
  UtensilsCrossed,
  UserRound,
} from 'lucide-react-native';
import { colors, withOpacity } from '../Theme/colors';
import { themedStyles } from '../Theme/ThemeContext';

export type NavTab = 'home' | 'workout' | 'nutrition' | 'schedule' | 'profile';

interface BottomNavBarProps {
  activeTab: NavTab;
  onTabPress: (tab: NavTab) => void;
}

interface TabConfig {
  key: NavTab;
  label: string;
  Icon: typeof Home;
}

const ICON_SIZE = 22;

const TABS: TabConfig[] = [
  { key: 'home', label: 'Home', Icon: Home },
  { key: 'workout', label: 'Workout', Icon: Dumbbell },
  { key: 'nutrition', label: 'Nutrition', Icon: UtensilsCrossed },
  { key: 'schedule', label: 'Schedule', Icon: Calendar },
  { key: 'profile', label: 'Profile', Icon: UserRound },
];

export default function BottomNavBar({ activeTab, onTabPress }: BottomNavBarProps) {
  return (
    <View style={styles.wrapper}>
      <View style={styles.bar}>
        {TABS.map(({ key, label, Icon }) => {
          const active = key === activeTab;
          return (
            <TouchableOpacity
              key={key}
              style={[styles.tabItem, active && styles.tabItemActive]}
              activeOpacity={0.7}
              onPress={() => onTabPress(key)}
            >
              <Icon
                size={ICON_SIZE}
                color={active ? colors.primary : colors.textSecondary}
                strokeWidth={active ? 2.4 : 2}
              />
              {active ? <Text style={styles.tabLabel}>{label}</Text> : null}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const BAR_HEIGHT = 64;

const styles = themedStyles(() => ({
  wrapper: {
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    width: '100%',
    maxWidth: 420,
    height: BAR_HEIGHT,
    backgroundColor: withOpacity(colors.surface, 0.92),
    borderRadius: 32,
    paddingHorizontal: 6,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 8,
  },
  tabItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minWidth: 44,
    height: 44,
    borderRadius: 22,
    paddingHorizontal: 12,
  },
  tabItemActive: {
    backgroundColor: withOpacity(colors.primary, 0.1),
  },
  tabLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.primary,
    letterSpacing: -0.1,
  },
}));
