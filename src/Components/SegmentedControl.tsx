import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { colors } from '../Theme/colors';
import { themedStyles, useTheme } from '../Theme/ThemeContext';

interface SegmentedControlProps<T extends string> {
    options: readonly { value: T; label: string }[];
    value: T;
    onChange: (value: T) => void;
    /** 'sm' is for tight headers, 'md' fills its row. */
    size?: 'sm' | 'md';
}

// Pill-shaped switcher: a dark rounded track with the active option
// lifted onto a brand-coloured pill.
export function SegmentedControl<T extends string>({
    options,
    value,
    onChange,
    size = 'md',
}: SegmentedControlProps<T>) {
    const { isDark } = useTheme();
    const compact = size === 'sm';

    return (
        <View style={[styles.track, compact ? styles.trackSm : styles.trackMd]}>
            {options.map(option => {
                const active = option.value === value;
                return (
                    <TouchableOpacity
                        key={option.value}
                        activeOpacity={0.8}
                        onPress={() => onChange(option.value)}
                        style={[
                            styles.segment,
                            compact ? styles.segmentSm : styles.segmentMd,
                            !compact && styles.segmentFill,
                            active && styles.segmentActive,
                        ]}
                        accessibilityRole="button"
                        accessibilityState={{ selected: active }}
                    >
                        <Text
                            style={[
                                styles.label,
                                compact ? styles.labelSm : styles.labelMd,
                                active && { color: isDark ? '#0B1650' : colors.white, fontWeight: '800' },
                            ]}
                        >
                            {option.label}
                        </Text>
                    </TouchableOpacity>
                );
            })}
        </View>
    );
}

const styles = themedStyles(() => ({
    track: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.surfaceLow,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 9999,
    },
    trackSm: {
        padding: 2,
    },
    trackMd: {
        padding: 5,
    },
    segment: {
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 9999,
    },
    segmentSm: {
        paddingHorizontal: 8,
        paddingVertical: 4,
    },
    segmentMd: {
        paddingVertical: 10,
    },
    segmentFill: {
        flex: 1,
    },
    segmentActive: {
        backgroundColor: colors.primary,
    },
    label: {
        fontWeight: '700',
        color: colors.textSecondary,
    },
    labelSm: {
        fontSize: 11,
    },
    labelMd: {
        fontSize: 15,
    },
}));

export default SegmentedControl;
