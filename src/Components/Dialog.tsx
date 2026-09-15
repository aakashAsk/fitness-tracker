import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import {
    Modal,
    Pressable,
    StyleSheet,
    Text,
    useWindowDimensions,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, withOpacity } from '../Theme/colors';
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

    // Sized from the window rather than from flex:1 against the Modal
    // root. statusBarTranslucent makes that root a full-screen window
    // whose box does not always match what the layout assumes, which
    // left the card off-centre and clipped at an edge.
    const { width, height } = useWindowDimensions();
    const insets = useSafeAreaInsets();

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
                // The Modal's own fade, rather than reanimated entering
                // animations on the views inside it — see below.
                animationType="fade"
                onRequestClose={hide}
                statusBarTranslucent
            >
                {/* Plain Views, not Animated ones. reanimated's
                    entering/exiting animations are unreliable inside a
                    Modal — the view can be left sitting at the
                    animation's initial frame (scale 0 / opacity 0) and
                    never play, which reads as the card rendering
                    unstyled or not at all. The Modal's own animationType
                    gives the same fade with none of that risk. */}
                <View
                    style={[
                        styles.overlay,
                        {
                            width,
                            height,
                            // Keeps the card off the status and gesture
                            // bars on a full-screen modal window.
                            paddingTop: spacing.xl + insets.top,
                            paddingBottom: spacing.xl + insets.bottom,
                        },
                    ]}
                >
                    {/* Tapping outside dismisses, matching the modal
                        sheets elsewhere in the app. */}
                    <Pressable style={StyleSheet.absoluteFill} onPress={hide} />

                    <View style={styles.card}>
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
                    </View>
                </View>
            </Modal>
        </DialogContext.Provider>
    );
};

const styles = StyleSheet.create({
    overlay: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: spacing.xl,
        backgroundColor: 'rgba(17, 24, 39, 0.45)',
    },
    card: {
        width: '100%',
        maxWidth: 360,
        gap: spacing.sm,
        padding: spacing.lg,
        borderRadius: radius.xl,
        backgroundColor: colors.surface,
        shadowColor: colors.black,
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.2,
        shadowRadius: 28,
        elevation: 14,
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
        // surfaceContainer (#ECEEFB) on the card's white is a handful of
        // points apart — a Cancel button in it looked like plain text.
        backgroundColor: withOpacity(colors.textMuted, 0.16),
        borderWidth: 1,
        borderColor: withOpacity(colors.textMuted, 0.28),
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
