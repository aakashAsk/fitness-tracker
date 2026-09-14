import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut, ZoomIn } from 'react-native-reanimated';
import { colors } from '../Theme/colors';
import { radius, spacing } from '../Theme/spacing';

// In-app replacement for React Native's Alert.alert.
//
// Alert.alert renders the platform's own dialog, which ignores the app's
// palette, radii and type scale entirely — and looks different on iOS
// and Android. This keeps the same imperative call style (so converting
// a call site is a one-line change) while rendering a surface that
// matches the cards it sits on top of.

export type DialogActionStyle = 'default' | 'primary' | 'cancel' | 'destructive';

export interface DialogAction {
    label: string;
    onPress?: () => void;
    style?: DialogActionStyle;
}

export interface DialogOptions {
    title: string;
    message?: string;
    /** Defaults to a single dismissing "OK" when omitted. */
    actions?: DialogAction[];
}

interface DialogContextValue {
    show: (options: DialogOptions) => void;
    hide: () => void;
}

const DialogContext = createContext<DialogContextValue | null>(null);

/**
 * Imperative dialog, mirroring Alert.alert's shape:
 *
 *   const dialog = useDialog();
 *   dialog.show({ title, message, actions: [{ label: 'OK' }] });
 *
 * An action's `onPress` runs after the dialog closes, so a handler that
 * opens another dialog doesn't race the first one's exit animation.
 */
export function useDialog(): DialogContextValue {
    const context = useContext(DialogContext);
    if (!context) {
        throw new Error('useDialog must be used inside a <DialogProvider>.');
    }
    return context;
}

export const DialogProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [options, setOptions] = useState<DialogOptions | null>(null);

    const hide = useCallback(() => setOptions(null), []);
    const show = useCallback((next: DialogOptions) => setOptions(next), []);

    const value = useMemo(() => ({ show, hide }), [show, hide]);

    const actions: DialogAction[] = options?.actions?.length
        ? options.actions
        : [{ label: 'OK', style: 'primary' }];

    // Two short actions sit side by side; anything more stacks, so a
    // three-way choice doesn't squeeze its labels to nothing.
    const isStacked = actions.length > 2;

    const runAction = (action: DialogAction) => {
        hide();
        action.onPress?.();
    };

    return (
        <DialogContext.Provider value={value}>
            {children}

            <Modal
                transparent
                visible={!!options}
                animationType="none"
                onRequestClose={hide}
                statusBarTranslucent
            >
                <Animated.View
                    entering={FadeIn.duration(140)}
                    exiting={FadeOut.duration(120)}
                    style={styles.overlay}
                >
                    {/* Tapping outside dismisses, matching the modal
                        sheets elsewhere in the app. */}
                    <Pressable style={StyleSheet.absoluteFill} onPress={hide} />

                    <Animated.View entering={ZoomIn.duration(160)} style={styles.card}>
                        <Text style={styles.title}>{options?.title}</Text>

                        {options?.message ? (
                            <Text style={styles.message}>{options.message}</Text>
                        ) : null}

                        <View style={[styles.actionRow, isStacked && styles.actionColumn]}>
                            {actions.map((action, index) => {
                                const isPrimary =
                                    action.style === 'primary' ||
                                    action.style === 'destructive' ||
                                    // With no explicit styles, the last
                                    // action reads as the confirming one.
                                    (!action.style && !isStacked && index === actions.length - 1);
                                const isDestructive = action.style === 'destructive';

                                return (
                                    <Pressable
                                        key={action.label}
                                        onPress={() => runAction(action)}
                                        style={({ pressed }) => [
                                            styles.button,
                                            isStacked ? styles.buttonStacked : styles.buttonInline,
                                            isPrimary ? styles.buttonPrimary : styles.buttonNeutral,
                                            isDestructive && styles.buttonDestructive,
                                            pressed && styles.buttonPressed,
                                        ]}
                                    >
                                        <Text
                                            style={[
                                                styles.buttonText,
                                                isPrimary
                                                    ? styles.buttonTextPrimary
                                                    : styles.buttonTextNeutral,
                                            ]}
                                        >
                                            {action.label}
                                        </Text>
                                    </Pressable>
                                );
                            })}
                        </View>
                    </Animated.View>
                </Animated.View>
            </Modal>
        </DialogContext.Provider>
    );
};

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: spacing.xl,
        backgroundColor: 'rgba(17, 24, 39, 0.45)',
    },
    card: {
        width: '100%',
        maxWidth: 360,
        gap: spacing.sm,
        padding: spacing.lg,
        borderRadius: radius.xl,
        backgroundColor: colors.surface,
        shadowColor: colors.primary,
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.16,
        shadowRadius: 24,
        elevation: 8,
    },
    title: {
        fontSize: 16,
        fontWeight: '800',
        letterSpacing: -0.2,
        color: colors.textPrimary,
    },
    message: {
        fontSize: 13.5,
        lineHeight: 20,
        color: colors.textSecondary,
    },
    actionRow: {
        flexDirection: 'row',
        gap: spacing.xs,
        paddingTop: spacing['2xs'],
    },
    actionColumn: {
        flexDirection: 'column-reverse',
    },
    button: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 11,
        paddingHorizontal: spacing.md,
        borderRadius: radius.md,
    },
    buttonInline: {
        flex: 1,
    },
    buttonStacked: {
        width: '100%',
    },
    buttonNeutral: {
        backgroundColor: colors.surfaceContainer,
    },
    buttonPrimary: {
        backgroundColor: colors.primary,
    },
    buttonDestructive: {
        backgroundColor: colors.error,
    },
    buttonPressed: {
        opacity: 0.75,
    },
    buttonText: {
        fontSize: 13.5,
        fontWeight: '800',
    },
    buttonTextNeutral: {
        color: colors.textPrimary,
    },
    buttonTextPrimary: {
        color: colors.white,
    },
});

export default DialogProvider;
