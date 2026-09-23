import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Bell, Flame } from 'lucide-react-native';
import { colors } from '../Theme/colors';
import { themedStyles } from '../Theme/ThemeContext';
import UserAvatar from './UserAvatar';
import type { NavTab } from './Navigation';

/** What the subtitle under "PulseFit" says for each tab — lifted from
 * the Dashboard's own top bar (LiveTelementry.tsx), which previously
 * only rendered this on the Home tab. */
const SECTION_LABEL: Record<NavTab, string> = {
    home: 'Dashboard',
    workout: 'Workout',
    nutrition: 'Nutrition',
    schedule: 'Schedule',
    profile: 'Profile',
};

export interface AppTopBarProps {
    activeTab: NavTab;
    onProfilePress: () => void;
    onNotificationsPress?: () => void;
}

/**
 * The brand mark + section label + notifications/avatar row, rendered
 * once above every tab (see App.tsx) instead of each screen building
 * its own — previously only the Dashboard had one, so switching to any
 * other tab lost the avatar/notifications entry point entirely.
 */
export const AppTopBar: React.FC<AppTopBarProps> = ({
    activeTab,
    onProfilePress,
    onNotificationsPress,
}) => (
    <View style={styles.topBar}>
        <View style={styles.brandRow}>
            <View style={styles.brandMark}>
                <Flame size={16} color={colors.white} strokeWidth={2.6} />
            </View>
            <View>
                <Text style={styles.brandTitle}>PulseFit</Text>
                <Text style={styles.brandSubtitle}>{SECTION_LABEL[activeTab]}</Text>
            </View>
        </View>
        <View style={styles.topBarActions}>
            <TouchableOpacity
                style={styles.iconButton}
                activeOpacity={0.7}
                onPress={onNotificationsPress}
                accessibilityRole="button"
                accessibilityLabel="Notifications"
            >
                <Bell size={20} color={colors.textSecondary} strokeWidth={2.2} />
            </TouchableOpacity>
            <TouchableOpacity
                activeOpacity={0.7}
                onPress={onProfilePress}
                accessibilityRole="button"
                accessibilityLabel="Open your profile"
            >
                <UserAvatar size={32} />
            </TouchableOpacity>
        </View>
    </View>
);

const styles = themedStyles(() => ({
    topBar: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingVertical: 8,
        // Matches the screen behind it (colors.background, also what the
        // status bar is painted with) rather than colors.surface — the
        // card colour reads as a separate panel sitting on top of the
        // screen, which this bar spans the full width of and isn't.
        backgroundColor: colors.background,
    },
    brandRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    brandMark: {
        width: 32,
        height: 32,
        borderRadius: 10,
        backgroundColor: colors.primary,
        alignItems: 'center',
        justifyContent: 'center',
    },
    brandTitle: {
        fontSize: 15,
        fontWeight: '800',
        color: colors.textPrimary,
        letterSpacing: -0.3,
        lineHeight: 18,
    },
    brandSubtitle: {
        fontSize: 11,
        fontWeight: '500',
        color: colors.textSecondary,
        lineHeight: 14,
    },
    topBarActions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    iconButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
    },
}));

export default AppTopBar;
