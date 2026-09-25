import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Bell, ChevronLeft, Flame, Settings as SettingsIcon } from 'lucide-react-native';
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
    /** Switches to the Profile tab. Shown on every tab except Profile
        itself — while already there, this same slot becomes the
        Settings gear instead (see onSettingsPress). */
    onProfilePress: () => void;
    /** Opens Settings directly. Only shown while on the Profile tab —
        your own avatar has nothing to navigate to from there, so the
        slot is put to better use. */
    onSettingsPress: () => void;
    onNotificationsPress?: () => void;
    /**
     * Set by a tab's own sub-screen (e.g. the Workout tab's Exercise
     * Library) to replace the brand mark with a back button and the
     * section label with that sub-screen's own title. Screens that push
     * a sub-view no longer need to build their own header/back button —
     * see WorkoutSession's onSubScreenChange.
     */
    subScreen?: { title: string; onBack: () => void } | null;
    /**
     * Replaces "PulseFit" itself (and hides the subtitle under it) — no
     * back button, unlike subScreen. For a screen like Settings that
     * sits "inside" a tab (still reachable by tapping that tab again)
     * rather than pushed on top of it.
     */
    titleOverride?: string;
}

/**
 * The brand mark + section label + notifications/settings row, rendered
 * once above every tab (see App.tsx) instead of each screen building
 * its own — previously only the Dashboard had one, so switching to any
 * other tab lost the notifications/settings entry point entirely.
 */
export const AppTopBar: React.FC<AppTopBarProps> = ({
    activeTab,
    onProfilePress,
    onSettingsPress,
    onNotificationsPress,
    subScreen,
    titleOverride,
}) => (
    <View style={styles.topBar}>
        <View style={styles.brandRow}>
            {subScreen ? (
                <TouchableOpacity
                    style={styles.backButton}
                    activeOpacity={0.7}
                    onPress={subScreen.onBack}
                    accessibilityRole="button"
                    accessibilityLabel="Go back"
                >
                    <ChevronLeft size={20} color={colors.textPrimary} strokeWidth={2.4} />
                </TouchableOpacity>
            ) : (
                <View style={styles.brandMark}>
                    <Flame size={16} color={colors.white} strokeWidth={2.6} />
                </View>
            )}
            <View>
                <Text style={styles.brandTitle}>
                    {subScreen ? subScreen.title : (titleOverride ?? 'PulseFit')}
                </Text>
                {subScreen || titleOverride ? null : (
                    <Text style={styles.brandSubtitle}>{SECTION_LABEL[activeTab]}</Text>
                )}
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
            {/* Already inside Settings (titleOverride is set only for
                that): the gear that got here has nothing left to do, so
                the slot is simply empty rather than showing a button
                that re-triggers the screen it is already on. */}
            {titleOverride ? null : activeTab === 'profile' ? (
                <TouchableOpacity
                    style={styles.iconButton}
                    activeOpacity={0.7}
                    onPress={onSettingsPress}
                    accessibilityRole="button"
                    accessibilityLabel="Settings"
                >
                    <SettingsIcon size={20} color={colors.textSecondary} strokeWidth={2.2} />
                </TouchableOpacity>
            ) : (
                <TouchableOpacity
                    activeOpacity={0.7}
                    onPress={onProfilePress}
                    accessibilityRole="button"
                    accessibilityLabel="Open your profile"
                >
                    <UserAvatar size={32} />
                </TouchableOpacity>
            )}
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
    backButton: {
        width: 32,
        height: 32,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.surfaceContainer,
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
