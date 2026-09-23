import React, { useState } from 'react';
import {
    ActivityIndicator,
    Modal,
    Pressable,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';
import { Scale } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, withOpacity } from '../../Theme/colors';
import { radius, spacing } from '../../Theme/spacing';
import { themedStyles } from '../../Theme/ThemeContext';

// Small centered popup for today's weigh-in — deliberately not another
// bottom sheet like the plan modals: it is a single number, not a form,
// and mirrors Dialog's card so it feels like the rest of the app's
// popups rather than a one-off.

export interface WeightEntryModalProps {
    onClose: () => void;
    /** Resolves once the weight is persisted; rejecting keeps the sheet open. */
    onSave: (weightKg: number) => Promise<void>;
    /** Pre-fills the field when today already has a weigh-in. */
    initialWeightKg?: number | null;
    saving?: boolean;
}

// Generous enough for any real body weight while still catching typos
// like an extra digit (720 instead of 72.0).
const MIN_WEIGHT_KG = 20;
const MAX_WEIGHT_KG = 400;

export const WeightEntryModal: React.FC<WeightEntryModalProps> = ({
    onClose,
    onSave,
    initialWeightKg,
    saving = false,
}) => {
    const insets = useSafeAreaInsets();
    const [value, setValue] = useState(
        initialWeightKg != null ? String(initialWeightKg) : '',
    );
    const [error, setError] = useState<string | null>(null);

    const handleSave = async () => {
        const trimmed = value.trim().replace(',', '.');
        const parsed = Number(trimmed);

        if (!trimmed || Number.isNaN(parsed)) {
            setError('Enter your weight as a number.');
            return;
        }
        if (parsed < MIN_WEIGHT_KG || parsed > MAX_WEIGHT_KG) {
            setError(`Enter a weight between ${MIN_WEIGHT_KG} and ${MAX_WEIGHT_KG} kg.`);
            return;
        }

        setError(null);
        try {
            await onSave(parsed);
        } catch {
            // The caller surfaces the failure (e.g. via a Dialog) — this
            // sheet just stays open with what the user typed so they don't
            // have to retype it.
        }
    };

    return (
        <Modal
            transparent
            visible
            animationType="fade"
            onRequestClose={onClose}
            statusBarTranslucent
            navigationBarTranslucent
        >
            <View
                style={[
                    styles.overlay,
                    { paddingTop: spacing.xl + insets.top, paddingBottom: spacing.xl + insets.bottom },
                ]}
            >
                <Pressable style={StyleSheet.absoluteFill} onPress={saving ? undefined : onClose} />

                <View style={styles.card}>
                    <View style={styles.iconCircle}>
                        <Scale size={18} color={colors.primary} strokeWidth={2.3} />
                    </View>

                    <Text style={styles.title}>Log Today's Weight</Text>
                    <Text style={styles.subtitle}>Saved to today's entry — decimals are fine.</Text>

                    <View style={[styles.inputRow, error && styles.inputRowError]}>
                        <TextInput
                            value={value}
                            onChangeText={(text) => {
                                setValue(text);
                                if (error) setError(null);
                            }}
                            placeholder="e.g. 72.5"
                            placeholderTextColor={colors.textMuted}
                            keyboardType="decimal-pad"
                            autoFocus
                            editable={!saving}
                            style={styles.input}
                            onSubmitEditing={handleSave}
                        />
                        <Text style={styles.unit}>kg</Text>
                    </View>
                    {error ? <Text style={styles.errorText}>{error}</Text> : null}

                    <View style={styles.actionRow}>
                        <Pressable
                            disabled={saving}
                            onPress={onClose}
                            style={[styles.button, styles.buttonNeutral]}
                        >
                            <Text style={styles.buttonNeutralText}>Cancel</Text>
                        </Pressable>
                        <Pressable
                            disabled={saving}
                            onPress={handleSave}
                            style={[styles.button, styles.buttonPrimary, saving && styles.buttonBusy]}
                        >
                            {saving ? (
                                <ActivityIndicator color={colors.white} />
                            ) : (
                                <Text style={styles.buttonPrimaryText}>Save</Text>
                            )}
                        </Pressable>
                    </View>
                </View>
            </View>
        </Modal>
    );
};

export default WeightEntryModal;

const styles = themedStyles(() => ({
    overlay: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: spacing.xl,
        backgroundColor: 'rgba(17, 24, 39, 0.55)',
    },
    card: {
        width: '100%',
        maxWidth: 340,
        padding: spacing.lg,
        borderRadius: radius.xl,
        backgroundColor: colors.surface,
        shadowColor: colors.black,
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.2,
        shadowRadius: 28,
        elevation: 14,
    },
    iconCircle: {
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 10,
        backgroundColor: withOpacity(colors.primary, 0.14),
    },
    title: {
        fontSize: 16,
        fontWeight: '800',
        letterSpacing: -0.2,
        color: colors.textPrimary,
    },
    subtitle: {
        marginTop: spacing.xs,
        fontSize: 12.5,
        lineHeight: 18,
        color: colors.textSecondary,
    },
    inputRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: spacing.md,
        height: 48,
        paddingHorizontal: 14,
        borderRadius: radius.md,
        backgroundColor: colors.surfaceLow,
        borderWidth: 1.5,
        borderColor: 'transparent',
        gap: 8,
    },
    inputRowError: {
        borderColor: colors.error,
    },
    input: {
        flex: 1,
        fontSize: 17,
        fontWeight: '700',
        color: colors.textPrimary,
        padding: 0,
    },
    unit: {
        fontSize: 13,
        fontWeight: '700',
        color: colors.textSecondary,
    },
    errorText: {
        marginTop: 6,
        fontSize: 12,
        fontWeight: '600',
        color: colors.error,
    },
    actionRow: {
        flexDirection: 'row',
        marginTop: spacing.md,
        gap: spacing.xs,
    },
    button: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 11,
        borderRadius: radius.md,
    },
    buttonNeutral: {
        backgroundColor: colors.surfaceContainer,
        borderWidth: 1,
        borderColor: withOpacity(colors.textMuted, 0.28),
    },
    buttonNeutralText: {
        fontSize: 13.5,
        fontWeight: '800',
        color: colors.textPrimary,
    },
    buttonPrimary: {
        backgroundColor: colors.primary,
    },
    buttonPrimaryText: {
        fontSize: 13.5,
        fontWeight: '800',
        color: colors.white,
    },
    buttonBusy: {
        opacity: 0.7,
    },
}));
