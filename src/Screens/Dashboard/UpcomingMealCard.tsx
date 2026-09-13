import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Check, Plus, UtensilsCrossed } from 'lucide-react-native';
import { colors, withOpacity } from '../../Theme/colors';

export interface UpcomingMealCardProps {
    mealTimeLabel?: string;
    mealName?: string;
    calories?: number;
    proteinGrams?: number;
    onLogMeal?: () => void;
}

export const UpcomingMealCard: React.FC<UpcomingMealCardProps> = ({
    mealTimeLabel = 'Lunch • 1:00 PM',
    mealName = 'Grilled Salmon Bowl',
    calories = 580,
    proteinGrams = 42,
    onLogMeal,
}) => {
    const [logged, setLogged] = useState(false);

    const handleLogPress = () => {
        setLogged(true);
        onLogMeal && onLogMeal();
        setTimeout(() => setLogged(false), 1500);
    };

    return (
        <View style={styles.wrapper}>
            <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionTitle}>Upcoming Meal</Text>
                <Text style={styles.mealTimeText}>{mealTimeLabel}</Text>
            </View>

            <View style={styles.card}>
                <View style={styles.thumbnail}>
                    <UtensilsCrossed size={24} color={colors.secondary} strokeWidth={2} />
                </View>

                <View style={styles.infoColumn}>
                    <Text style={styles.mealName} numberOfLines={1}>
                        {mealName}
                    </Text>
                    <View style={styles.metaRow}>
                        <Text style={styles.calorieText}>{calories} kcal</Text>
                        <Text style={styles.metaSeparator}>•</Text>
                        <Text style={styles.metaText}>{proteinGrams}g Protein</Text>
                    </View>
                </View>

                <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={handleLogPress}
                    style={[styles.logButton, logged && styles.logButtonActive]}
                >
                    {logged ? (
                        <Check size={20} color={colors.white} strokeWidth={2.6} />
                    ) : (
                        <Plus size={20} color={colors.secondary} strokeWidth={2.6} />
                    )}
                </TouchableOpacity>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
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
    mealTimeText: {
        fontSize: 12,
        fontWeight: '600',
        color: colors.textSecondary,
    },
    card: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        backgroundColor: colors.surface,
        borderRadius: 24,
        padding: 14,
        shadowColor: colors.primary,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.08,
        shadowRadius: 20,
        elevation: 3,
    },
    thumbnail: {
        width: 64,
        height: 64,
        borderRadius: 18,
        backgroundColor: withOpacity(colors.secondary, 0.12),
        alignItems: 'center',
        justifyContent: 'center',
    },
    infoColumn: {
        flex: 1,
        minWidth: 0,
    },
    mealName: {
        fontSize: 16,
        fontWeight: '800',
        color: colors.textPrimary,
    },
    metaRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginTop: 4,
    },
    calorieText: {
        fontSize: 12.5,
        fontWeight: '800',
        color: colors.secondary,
    },
    metaSeparator: {
        color: colors.textMuted,
        fontSize: 12,
    },
    metaText: {
        fontSize: 12.5,
        fontWeight: '500',
        color: colors.textSecondary,
    },
    logButton: {
        width: 44,
        height: 44,
        borderRadius: 22,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: withOpacity(colors.secondary, 0.14),
    },
    logButtonActive: {
        backgroundColor: colors.primary,
    },
});

export default UpcomingMealCard;
