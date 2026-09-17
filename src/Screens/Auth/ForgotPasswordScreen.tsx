import React, { useEffect, useState } from 'react';
import {
    Keyboard,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { ArrowLeft, CheckCircle, Mail } from 'lucide-react-native';
import { colors, withOpacity } from '../../Theme/colors';
import { themedStyles } from '../../Theme/ThemeContext';

export interface ForgotPasswordScreenProps {
    onSubmit: (email: string) => void;
    onBack: () => void;
    loading?: boolean;
    errorMessage?: string | null;
    /** True once a link has been sent for the address below. */
    sent?: boolean;
    /** Prefilled from the sign-in screen, so the address is not retyped. */
    initialEmail?: string;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const ForgotPasswordScreen: React.FC<ForgotPasswordScreenProps> = ({
    onSubmit,
    onBack,
    loading = false,
    errorMessage = null,
    sent = false,
    initialEmail = '',
}) => {
    const [email, setEmail] = useState(initialEmail);
    const [touched, setTouched] = useState(false);
    const [keyboardVisible, setKeyboardVisible] = useState(false);

    useEffect(() => {
        const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
        const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
        const showSub = Keyboard.addListener(showEvent, () => setKeyboardVisible(true));
        const hideSub = Keyboard.addListener(hideEvent, () => setKeyboardVisible(false));
        return () => {
            showSub.remove();
            hideSub.remove();
        };
    }, []);

    const isEmailValid = EMAIL_PATTERN.test(email.trim());
    const canSubmit = isEmailValid && !loading;
    const showEmailError = touched && email.trim().length > 0 && !isEmailValid;

    return (
        <KeyboardAvoidingView
            style={styles.flex}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
            <ScrollView
                contentContainerStyle={[
                    styles.scrollContent,
                    keyboardVisible ? styles.scrollContentShifted : styles.scrollContentCentered,
                ]}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
            >
                <TouchableOpacity
                    accessibilityLabel="Back to sign in"
                    activeOpacity={0.7}
                    hitSlop={10}
                    onPress={onBack}
                    style={styles.backButton}
                >
                    <ArrowLeft size={18} color={colors.textPrimary} strokeWidth={2.4} />
                    <Text style={styles.backText}>Sign in</Text>
                </TouchableOpacity>

                <View style={styles.iconBadge}>
                    {sent ? (
                        <CheckCircle size={22} color={colors.success} strokeWidth={2.2} />
                    ) : (
                        <Mail size={22} color={colors.primary} strokeWidth={2.2} />
                    )}
                </View>

                <View style={styles.headerBlock}>
                    <Text style={styles.title}>
                        {sent ? 'Check your email' : 'Reset your password'}
                    </Text>
                    <Text style={styles.subtitle}>
                        {sent
                            ? // Deliberately conditional. Firebase resolves
                              // successfully for addresses that have no
                              // account, so claiming "we sent it" would be a
                              // lie half the time — and would also let anyone
                              // use this screen to test who has an account.
                              `If an account exists for ${email.trim()}, a reset link is on its way. It can take a minute to arrive — check spam too.`
                            : 'Enter the email you signed up with and we’ll send you a link to set a new password.'}
                    </Text>
                </View>

                {errorMessage ? (
                    <View style={styles.errorBanner}>
                        <Text style={styles.errorText}>{errorMessage}</Text>
                    </View>
                ) : null}

                {sent ? null : (
                    <View style={styles.fieldGroup}>
                        <Text style={styles.fieldLabel}>Email</Text>
                        <View
                            style={[styles.inputWrapper, showEmailError && styles.inputWrapperError]}
                        >
                            <Mail size={18} color={colors.textMuted} strokeWidth={2.2} />
                            <TextInput
                                value={email}
                                onChangeText={setEmail}
                                placeholder="you@example.com"
                                placeholderTextColor={colors.textMuted}
                                autoCapitalize="none"
                                autoComplete="email"
                                keyboardType="email-address"
                                editable={!loading}
                                style={styles.input}
                            />
                        </View>
                        {showEmailError ? (
                            <Text style={styles.fieldErrorText}>Enter a valid email address</Text>
                        ) : null}
                    </View>
                )}

                <TouchableOpacity
                    activeOpacity={0.85}
                    disabled={loading}
                    onPress={() => {
                        if (sent) {
                            onBack();
                            return;
                        }
                        setTouched(true);
                        if (canSubmit) onSubmit(email.trim());
                    }}
                    style={[
                        styles.submitButton,
                        !sent && !canSubmit && styles.submitButtonDisabled,
                    ]}
                >
                    <Text style={styles.submitButtonText}>
                        {loading ? 'Sending…' : sent ? 'Back to sign in' : 'Send reset link'}
                    </Text>
                </TouchableOpacity>

                {sent ? (
                    <TouchableOpacity
                        activeOpacity={0.7}
                        disabled={loading}
                        onPress={() => onSubmit(email.trim())}
                        style={styles.resendButton}
                    >
                        <Text style={styles.resendText}>Send it again</Text>
                    </TouchableOpacity>
                ) : null}
            </ScrollView>
        </KeyboardAvoidingView>
    );
};

export default ForgotPasswordScreen;

const styles = themedStyles(() => ({
    flex: { flex: 1, backgroundColor: colors.background },
    scrollContent: {
        flexGrow: 1,
        paddingHorizontal: 24,
        paddingBottom: 40,
    },
    scrollContentCentered: { justifyContent: 'center' },
    scrollContentShifted: { justifyContent: 'flex-start', paddingTop: 32 },

    backButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        alignSelf: 'flex-start',
        marginBottom: 28,
    },
    backText: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },

    iconBadge: {
        width: 52,
        height: 52,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: withOpacity(colors.primary, 0.12),
        marginBottom: 18,
    },

    headerBlock: { gap: 8, marginBottom: 26 },
    title: {
        fontSize: 26,
        fontWeight: '800',
        letterSpacing: -0.5,
        color: colors.textPrimary,
    },
    subtitle: { fontSize: 14, lineHeight: 21, color: colors.textSecondary },

    errorBanner: {
        padding: 12,
        borderRadius: 12,
        marginBottom: 18,
        backgroundColor: withOpacity(colors.error, 0.1),
        borderWidth: 1,
        borderColor: withOpacity(colors.error, 0.25),
    },
    errorText: { fontSize: 13, fontWeight: '600', color: colors.error },

    fieldGroup: { gap: 8, marginBottom: 24 },
    fieldLabel: { fontSize: 13, fontWeight: '700', color: colors.textPrimary },
    inputWrapper: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        height: 52,
        paddingHorizontal: 14,
        borderRadius: 14,
        backgroundColor: colors.surface,
        borderWidth: 1.5,
        borderColor: withOpacity(colors.textMuted, 0.28),
    },
    inputWrapperError: { borderColor: colors.error },
    input: { flex: 1, fontSize: 15, color: colors.textPrimary },
    fieldErrorText: { fontSize: 12, fontWeight: '600', color: colors.error },

    submitButton: {
        height: 52,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.primary,
    },
    submitButtonDisabled: { opacity: 0.5 },
    submitButtonText: { fontSize: 15, fontWeight: '800', color: colors.white },

    resendButton: { alignSelf: 'center', paddingVertical: 14 },
    resendText: { fontSize: 13.5, fontWeight: '700', color: colors.primary },
}));
