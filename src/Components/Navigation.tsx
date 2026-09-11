import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
} from 'react-native';
import { Home, Dumbbell, UtensilsCrossed, TrendingUp, Plus } from 'lucide-react-native';
import { colors } from '../Theme/colors';


export type NavTab = 'home' | 'workout' | 'nutrition' | 'progress';

interface BottomNavBarProps {
  activeTab: NavTab;
  onTabPress: (tab: NavTab) => void;
  onCenterPress: () => void;
}

interface TabConfig {
  key: NavTab;
  label: string;
  renderIcon: (active: boolean) => React.ReactNode;
}

const ICON_SIZE = 22;

const TABS: TabConfig[] = [
  {
    key: 'home',
    label: 'Home',
    renderIcon: (active) => (
      <Home
        size={ICON_SIZE}
        color={active ? colors.primary : colors.textSecondary}
        strokeWidth={active ? 2.4 : 2}
      />
    ),
  },
  {
    key: 'workout',
    label: 'Workout',
    renderIcon: (active) => (
      <Dumbbell
        size={ICON_SIZE}
        color={active ? colors.primary : colors.textSecondary}
        strokeWidth={active ? 2.4 : 2}
      />
    ),
  },
  {
    key: 'nutrition',
    label: 'Nutrition',
    renderIcon: (active) => (
      <UtensilsCrossed
        size={ICON_SIZE}
        color={active ? colors.primary : colors.textSecondary}
        strokeWidth={active ? 2.4 : 2}
      />
    ),
  },
  {
    key: 'progress',
    label: 'Progress',
    renderIcon: (active) => (
      <TrendingUp
        size={ICON_SIZE}
        color={active ? colors.primary : colors.textSecondary}
        strokeWidth={active ? 2.4 : 2}
      />
    ),
  },
];

const LEFT_TABS = TABS.slice(0, 2);
const RIGHT_TABS = TABS.slice(2);

export default function BottomNavBar({
  activeTab,
  onTabPress,
  onCenterPress,
}: BottomNavBarProps) {
  const renderTab = (tab: TabConfig) => {
    const active = tab.key === activeTab;
    return (
      <TouchableOpacity
        key={tab.key}
        style={styles.tabItem}
        activeOpacity={0.7}
        onPress={() => onTabPress(tab.key)}
      >
        {tab.renderIcon(active)}
        <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>
          {tab.label.toUpperCase()}
        </Text>
        {active && <View style={styles.activeDot} />}
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.wrapper}>
      <View style={styles.bar}>
        <View style={styles.sideGroup}>{LEFT_TABS.map(renderTab)}</View>

        {/* Spacer keeps the two side groups apart so the floating
            center button has room to sit on top of the bar */}
        <View style={styles.centerSpacer} />

        <View style={styles.sideGroup}>{RIGHT_TABS.map(renderTab)}</View>
      </View>

      <TouchableOpacity
        style={styles.centerButton}
        activeOpacity={0.85}
        onPress={onCenterPress}
      >
        <Plus size={28} color={colors.neutral} strokeWidth={2.8} />
      </TouchableOpacity>
    </View>
  );
}

const BAR_HEIGHT = 78;
const CENTER_BUTTON_SIZE = 64;

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    height: BAR_HEIGHT,
    backgroundColor: colors.neutral,
    borderRadius: 28,
    paddingHorizontal: 8,
  },
  sideGroup: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    alignItems: 'center',
  },
  centerSpacer: {
    width: CENTER_BUTTON_SIZE - 8,
  },
  tabItem: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 4,
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.3,
    color: colors.textSecondary,
  },
  tabLabelActive: {
    color: colors.primary,
  },
  activeDot: {
    position: 'absolute',
    bottom: -8,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.primary,
  },
  centerButton: {
    position: 'absolute',
    top: -22,
    width: CENTER_BUTTON_SIZE,
    height: CENTER_BUTTON_SIZE,
    borderRadius: CENTER_BUTTON_SIZE / 2,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.primary,
    shadowOpacity: 0.8,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 0 },
    elevation: Platform.OS === 'android' ? 12 : 0,
  },
});