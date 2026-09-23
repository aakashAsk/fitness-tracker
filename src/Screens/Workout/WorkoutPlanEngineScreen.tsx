// Full-screen sheet shown when the user taps "Add Workout Plan" — the
// replacement for the NewPlanModal popup, built up step by step. For now
// it holds only the engine card.
import React from 'react';
import { Modal, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X } from 'lucide-react-native';

import { colors } from '../../Theme/colors';
import { spacing } from '../../Theme/spacing';
import { themedStyles } from '../../Theme/ThemeContext';
import WorkoutPlanEngineCard from './WorkoutPlanEngineCard';

export interface WorkoutPlanEngineScreenProps {
    onClose: () => void;
}

export const WorkoutPlanEngineScreen: React.FC<WorkoutPlanEngineScreenProps> = ({ onClose }) => {
    const insets = useSafeAreaInsets();

    return (
        <Modal
            visible
            animationType="slide"
            onRequestClose={onClose}
            // Draw under the system bars so the screen's own background
            // fills the whole display, with the insets applied below.
            statusBarTranslucent
            navigationBarTranslucent
        >
            <View style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
                <View style={styles.header}>
                    <Text style={styles.title}>New Workout Plan</Text>
                    <TouchableOpacity
                        activeOpacity={0.7}
                        onPress={onClose}
                        hitSlop={10}
                        accessibilityRole="button"
                        accessibilityLabel="Close"
                        style={styles.closeButton}
                    >
                        <X size={18} color={colors.textSecondary} strokeWidth={2.4} />
                    </TouchableOpacity>
                </View>

                <WorkoutPlanEngineCard />
            </View>
        </Modal>
    );
};

export default WorkoutPlanEngineScreen;

const styles = themedStyles(() => ({
    screen: {
        flex: 1,
        gap: 20,
        backgroundColor: colors.background,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: spacing.screenHorizontalPadding,
        paddingTop: 12,
    },
    title: {
        fontSize: 20,
        fontWeight: '800',
        letterSpacing: -0.3,
        color: colors.textPrimary,
    },
    closeButton: {
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.surface,
    },
}));
