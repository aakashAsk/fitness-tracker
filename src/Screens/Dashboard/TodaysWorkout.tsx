import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { ArrowRight, Dumbbell, Timer } from 'lucide-react-native';
import { colors, withOpacity } from '../../Theme/colors';
import { themedStyles } from '../../Theme/ThemeContext';

export interface TodaysWorkoutCardProps {
    categoryLabel?: string;
    title?: string;
    durationMinutes?: number;
    circuitCount?: number;
    participantInitials?: string[];
    participantOverflowCount?: number;
    onStartWorkout?: () => void;
    onViewAll?: () => void;
}

export const TodaysWorkoutCard: React.FC<TodaysWorkoutCardProps> = ({
    categoryLabel = 'Strength & Hypertrophy',
    title = 'Upper Body Sculpt',
    durationMinutes = 45,
    circuitCount = 4,
    participantInitials = ['JD', 'SK'],
    participantOverflowCount = 18,
    onStartWorkout,
    onViewAll,
}) => {
    return (
        <View style={styles.wrapper}>
            <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionTitle}>Today's Workout</Text>
                <TouchableOpacity activeOpacity={0.7} onPress={onViewAll}>
                    <Text style={styles.viewAllText}>View All</Text>
                </TouchableOpacity>
            </View>

            <View style={styles.card}>
                <View style={styles.glowAccent} />

                <View style={styles.headerRow}>
                    <View style={styles.titleColumn}>
                        <View style={styles.categoryPill}>
                            <Text style={styles.categoryPillText}>{categoryLabel}</Text>
                        </View>
                        <Text style={styles.workoutTitle}>{title}</Text>
                        <View style={styles.metaRow}>
                            <View style={styles.metaItem}>
                                <Timer size={14} color={colors.textSecondary} strokeWidth={2.2} />
                                <Text style={styles.metaText}>{durationMinutes} mins</Text>
                            </View>
                            <Text style={styles.metaSeparator}>•</Text>
                            <View style={styles.metaItem}>
                                <Dumbbell size={14} color={colors.textSecondary} strokeWidth={2.2} />
                                <Text style={styles.metaText}>{circuitCount} circuits</Text>
                            </View>
                        </View>
                    </View>

                    <View style={styles.thumbnail}>
                        <Dumbbell size={26} color={colors.primary} strokeWidth={2} />
                    </View>
                </View>

                <View style={styles.footerRow}>
                    <View style={styles.avatarStack}>
                        {participantInitials.map((initials, index) => (
                            <View
                                key={initials}
                                style={[
                                    styles.avatarChip,
                                    index === 0 ? styles.avatarChipPrimary : styles.avatarChipSecondary,
                                    index > 0 && styles.avatarChipOverlap,
                                ]}
                            >
                                <Text
                                    style={[
                                        styles.avatarChipText,
                                        index === 0 && styles.avatarChipTextOnPrimary,
                                    ]}
                                >
                                    {initials}
                                </Text>
                            </View>
                        ))}
                        {participantOverflowCount > 0 ? (
                            <View style={[styles.avatarChip, styles.avatarChipOverlap, styles.avatarChipMuted]}>
                                <Text style={styles.avatarChipTextMuted}>+{participantOverflowCount}</Text>
                            </View>
                        ) : null}
                    </View>

                    <TouchableOpacity
                        activeOpacity={0.85}
                        onPress={onStartWorkout}
                        style={styles.startButton}
                    >
                        <Text style={styles.startButtonText}>Start Workout</Text>
                        <ArrowRight size={16} color={colors.white} strokeWidth={2.4} />
                    </TouchableOpacity>
                </View>
            </View>
        </View>
    );
};

const styles = themedStyles(() => ({
    wrapper: {
        gap: 10,
    },
    sectionHeaderRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 2,
    },
    sectionTitle: {
        fontSize: 16,
        fontWeight: '800',
        color: colors.textPrimary,
        letterSpacing: -0.2,
    },
    viewAllText: {
        fontSize: 13,
        fontWeight: '700',
        color: colors.primary,
    },
    card: {
        backgroundColor: colors.surface,
        borderRadius: 24,
        padding: 18,
        overflow: 'hidden',
        shadowColor: colors.primary,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.08,
        shadowRadius: 20,
        elevation: 3,
    },
    glowAccent: {
        position: 'absolute',
        right: -32,
        bottom: -32,
        width: 176,
        height: 176,
        borderRadius: 88,
        backgroundColor: withOpacity(colors.primary, 0.1),
    },
    headerRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
    },
    titleColumn: {
        flex: 1,
        paddingRight: 12,
    },
    categoryPill: {
        alignSelf: 'flex-start',
        backgroundColor: withOpacity(colors.primary, 0.14),
        borderRadius: 10,
        paddingHorizontal: 10,
        paddingVertical: 4,
        marginBottom: 8,
    },
    categoryPillText: {
        fontSize: 11,
        fontWeight: '800',
        color: colors.primary,
    },
    workoutTitle: {
        fontSize: 20,
        fontWeight: '800',
        color: colors.textPrimary,
        letterSpacing: -0.3,
    },
    metaRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginTop: 6,
    },
    metaItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
    },
    metaText: {
        fontSize: 12.5,
        fontWeight: '500',
        color: colors.textSecondary,
    },
    metaSeparator: {
        color: colors.textMuted,
        fontSize: 12,
    },
    thumbnail: {
        width: 64,
        height: 64,
        borderRadius: 18,
        backgroundColor: colors.surfaceContainer,
        alignItems: 'center',
        justifyContent: 'center',
    },
    footerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: 18,
    },
    avatarStack: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    avatarChip: {
        width: 28,
        height: 28,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 2,
        borderColor: colors.surface,
    },
    avatarChipOverlap: {
        marginLeft: -8,
    },
    avatarChipPrimary: {
        backgroundColor: withOpacity(colors.primary, 0.85),
    },
    avatarChipSecondary: {
        backgroundColor: withOpacity(colors.secondary, 0.7),
    },
    avatarChipMuted: {
        backgroundColor: colors.surfaceContainer,
    },
    avatarChipText: {
        fontSize: 10,
        fontWeight: '800',
        color: colors.textPrimary,
    },
    avatarChipTextOnPrimary: {
        color: colors.white,
    },
    avatarChipTextMuted: {
        fontSize: 10,
        fontWeight: '700',
        color: colors.textSecondary,
    },
    startButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: colors.primary,
        paddingHorizontal: 18,
        paddingVertical: 12,
        borderRadius: 24,
        shadowColor: colors.primary,
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.3,
        shadowRadius: 12,
        elevation: 4,
    },
    startButtonText: {
        fontSize: 13.5,
        fontWeight: '800',
        color: colors.white,
    },
}));

export default TodaysWorkoutCard;
