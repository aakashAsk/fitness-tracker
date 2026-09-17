import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import {
    Modal,
    Pressable,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, withOpacity } from '../Theme/colors';
import { radius, spacing } from '../Theme/spacing';
import { themedStyles } from '../Theme/ThemeContext';

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
                navigationBarTranslucent
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
                                const isDestructive = action.style === 'destructive';
                                const isPrimary =
                                    action.style === 'primary' ||
                                    isDestructive ||
                                    // With no explicit styles, the last
                                    // action reads as the confirming one.
                                    (!action.style && !isStacked && index === actions.length - 1);

                                // Resolved to concrete values and applied
                                // inline rather than as conditional
                                // entries in a style array: a confirming
                                // action that loses its fill renders as
                                // white text on the white card, i.e. an
                                // invisible button, and the user is left
                                // with only Cancel and no way to confirm.
                                const backgroundColor = isDestructive
                                    ? colors.error
                                    : isPrimary
                                      ? colors.primary
                                      : colors.surfaceContainer;

                                return (
                                    <TouchableOpacity
                                        key={action.label}
                                        activeOpacity={0.75}
                                        onPress={() => runAction(action)}
                                        // A plain array, never the ({ pressed }) => [...]
                                        // callback form. This project compiles JSX through
                                        // NativeWind's runtime, whose interop passes array
                                        // styles through but drops a function style — which
                                        // left these buttons with no fill, no padding and no
                                        // radius while the card around them styled fine.
                                        // TouchableOpacity gives the press feedback that the
                                        // callback's `pressed` flag used to.
                                        style={[
                                            styles.button,
                                            isStacked ? styles.buttonStacked : styles.buttonInline,
                                            !isPrimary && styles.buttonNeutralBorder,
                                            { backgroundColor },
                                            // Spacing between actions is a margin on every
                                            // item but the first, rather than `gap` on the
                                            // row: the buttons were rendering flush against
                                            // each other, and a margin cannot be dropped the
                                            // way a gap can.
                                            index > 0 &&
                                                (isStacked
                                                    ? styles.buttonSpacedStacked
                                                    : styles.buttonSpacedInline),
                                        ]}
                                    >
                                        <Text
                                            style={[
                                                styles.buttonText,
                                                {
                                                    color: isPrimary
                                                        ? colors.white
                                                        : colors.textPrimary,
                                                },
                                            ]}
                                        >
                                            {action.label}
                                        </Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>
                    </View>
                </View>
            </Modal>
        </DialogContext.Provider>
    );
};

const styles = themedStyles(() => ({
    overlay: {
        // flex, not a measured width/height. The modal window is
        // full-screen (statusBarTranslucent + navigationBarTranslucent),
        // and useWindowDimensions reports the app window, which excludes
        // the system bars — sizing from it left the dim layer short of
        // the screen edges. Filling the modal's own root is correct
        // whatever that root turns out to measure.
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: spacing.xl,
        backgroundColor: 'rgba(17, 24, 39, 0.55)',
    },
    card: {
        width: '100%',
        maxWidth: 360,
        // Children carry their own top margins instead of the card
        // carrying a gap — see the note on buttonSpacedInline.
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
        marginTop: spacing.xs,
        fontSize: 13.5,
        lineHeight: 20,
        color: colors.textSecondary,
    },
    actionRow: {
        flexDirection: 'row',
        marginTop: spacing.md,
    },
    actionColumn: {
        flexDirection: 'column-reverse',
    },
    buttonSpacedInline: { marginLeft: spacing.xs },
    // column-reverse: later actions render ABOVE earlier ones, so the
    // gap belongs under them.
    buttonSpacedStacked: { marginBottom: spacing.xs },
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
    // Fills live inline on the Pressable (see above); only the neutral
    // action's border is left here, since it has no coloured fill to
    // separate it from the card.
    buttonNeutralBorder: {
        borderWidth: 1,
        borderColor: withOpacity(colors.textMuted, 0.28),
    },
    buttonPressed: {
        opacity: 0.75,
    },
    buttonText: {
        fontSize: 13.5,
        fontWeight: '800',
    },
}));

export default DialogProvider;
