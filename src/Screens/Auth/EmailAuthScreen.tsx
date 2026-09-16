import React, { useEffect, useState } from 'react';
import {
    Keyboard,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { Dumbbell, Eye, EyeOff, Lock, Mail } from 'lucide-react-native';
import { colors, withOpacity } from '../../Theme/colors';

export interface EmailAuthScreenProps {
    onSubmit?: (email: string, password: string) => void;
    loading?: boolean;
    errorMessage?: string | null;
    /** Opens the reset flow, carrying whatever has been typed so far. */
    onForgotPassword?: (email: string) => void;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const EmailAuthScreen: React.FC<EmailAuthScreenProps> = ({
    onSubmit,
    loading = false,
    errorMessage = null,
    onForgotPassword,
}) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
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
    const isPasswordValid = password.length >= 6;
    const canSubmit = isEmailValid && isPasswordValid && !loading;

    const showEmailError = touched && email.trim().length > 0 && !isEmailValid;
    const showPasswordError = touched && password.length > 0 && !isPasswordValid;

    return (
        <KeyboardAvoidingView
            style={styles.flex}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 24}
        >
            <ScrollView
                contentContainerStyle={[
                    styles.scrollContent,
                    keyboardVisible ? styles.scrollContentShifted : styles.scrollContentCentered,
                ]}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
                showsVerticalScrollIndicator={false}
            >
                {/* Brand mark */}
                <View style={styles.brandRow}>
                    <View style={styles.brandIconWrapper}>
                        <Dumbbell size={26} color={colors.black} strokeWidth={2.6} />
                    </View>
                    <Text style={styles.brandTitle}>FitTrack</Text>
                </View>

                <View style={styles.headerBlock}>
                    <Text style={styles.title}>Welcome</Text>
                    <Text style={styles.subtitle}>
                        Sign in with your email — a new account is created automatically
                        if you're new here
                    </Text>
                </View>

                {errorMessage ? (
                    <View style={styles.errorBanner}>
                        <Text style={styles.errorText}>{errorMessage}</Text>
                    </View>
                ) : null}

                {/* Email field */}
                <View style={styles.fieldGroup}>
                    <Text style={styles.fieldLabel}>Email</Text>
                    <View style={[styles.inputWrapper, showEmailError && styles.inputWrapperError]}>
                        <Mail size={18} color={colors.textSecondary} strokeWidth={2.2} />
                        <TextInput
                            style={styles.input}
                            placeholder="you@example.com"
                            placeholderTextColor={colors.textMuted}
                            value={email}
                            onChangeText={setEmail}
                            onBlur={() => setTouched(true)}
                            autoCapitalize="none"
                            autoComplete="email"
                            keyboardType="email-address"
                            editable={!loading}
                            autoFocus
                        />
                    </View>
                    {showEmailError ? (
                        <Text style={styles.fieldErrorText}>Enter a valid email address</Text>
                    ) : null}
                </View>

                {/* Password field */}
                <View style={styles.fieldGroup}>
                    <Text style={styles.fieldLabel}>Password</Text>
                    <View
                        style={[styles.inputWrapper, showPasswordError && styles.inputWrapperError]}
                    >
                        <Lock size={18} color={colors.textSecondary} strokeWidth={2.2} />
                        <TextInput
                            style={styles.input}
                            placeholder="At least 6 characters"
                            placeholderTextColor={colors.textMuted}
                            value={password}
                            onChangeText={setPassword}
                            onBlur={() => setTouched(true)}
                            secureTextEntry={!showPassword}
                            autoCapitalize="none"
                            autoComplete="password"
                            editable={!loading}
                        />
                        <TouchableOpacity
                            onPress={() => setShowPassword(!showPassword)}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                            {showPassword ? (
                                <EyeOff size={18} color={colors.textSecondary} strokeWidth={2.2} />
                            ) : (
                                <Eye size={18} color={colors.textSecondary} strokeWidth={2.2} />
                            )}
                        </TouchableOpacity>
                    </View>
                    {showPasswordError ? (
                        <Text style={styles.fieldErrorText}>
                            Password must be at least 6 characters
                        </Text>
                    ) : null}
                </View>

                {/* Submit */}
                <TouchableOpacity
                    activeOpacity={0.85}
                    disabled={loading}
                    onPress={() => {
                        setTouched(true);
                        if (canSubmit) {
                            onSubmit && onSubmit(email.trim(), password);
                        }
                    }}
                    style={[styles.submitButton, !canSubmit && styles.submitButtonDisabled]}
                >
                    <Text style={styles.submitButtonText}>
                        {loading ? 'Please wait…' : 'Continue'}
                    </Text>
                </TouchableOpacity>

                {/* Passes the typed address along so the reset screen
                    does not ask for it a second time. */}
                {onForgotPassword ? (
                    <TouchableOpacity
                        activeOpacity={0.7}
                        disabled={loading}
                        onPress={() => onForgotPassword(email.trim())}
                        style={styles.forgotButton}
                    >
                        <Text style={styles.forgotText}>Forgot password?</Text>
                    </TouchableOpacity>
                ) : null}
            </ScrollView>
        </KeyboardAvoidingView>
    );
};

const styles = StyleSheet.create({
    forgotButton: { alignSelf: 'center', paddingVertical: 16 },
    forgotText: { fontSize: 13.5, fontWeight: '700', color: colors.primary },
    flex: {
        flex: 1,
        backgroundColor: colors.background,
    },
    scrollContent: {
        flexGrow: 1,
        paddingHorizontal: 24,
        paddingBottom: 40,
    },
    scrollContentCentered: {
        justifyContent: 'center',
    },
    scrollContentShifted: {
        justifyContent: 'flex-start',
        paddingTop: 32,
    },
    brandRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        marginBottom: 36,
    },
    brandIconWrapper: {
        width: 40,
        height: 40,
        borderRadius: 12,
        backgroundColor: colors.primary,
        alignItems: 'center',
        justifyContent: 'center',
    },
    brandTitle: {
        fontSize: 20,
        fontWeight: '800',
        color: colors.textPrimary,
        letterSpacing: -0.4,
    },
    headerBlock: {
        marginBottom: 28,
    },
    title: {
        fontSize: 26,
        fontWeight: '800',
        color: colors.textPrimary,
        letterSpacing: -0.5,
    },
    subtitle: {
        fontSize: 14,
        fontWeight: '500',
        color: colors.textSecondary,
        marginTop: 6,
        lineHeight: 20,
    },
    errorBanner: {
        backgroundColor: withOpacity(colors.error, 0.12),
        borderWidth: 1,
        borderColor: withOpacity(colors.error, 0.3),
        borderRadius: 12,
        paddingHorizontal: 14,
        paddingVertical: 10,
        marginBottom: 20,
    },
    errorText: {
        color: colors.error,
        fontSize: 13,
        fontWeight: '600',
    },
    fieldGroup: {
        marginBottom: 18,
    },
    fieldLabel: {
        fontSize: 13,
        fontWeight: '700',
        color: colors.textSecondary,
        marginBottom: 8,
        letterSpacing: 0.2,
    },
    inputWrapper: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        backgroundColor: colors.surfaceContainer,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 14,
        paddingHorizontal: 14,
        paddingVertical: 12,
    },
    inputWrapperError: {
        borderColor: withOpacity(colors.error, 0.6),
    },
    input: {
        flex: 1,
        fontSize: 15,
        fontWeight: '500',
        color: colors.textPrimary,
        padding: 0,
    },
    fieldErrorText: {
        fontSize: 12,
        fontWeight: '600',
        color: colors.error,
        marginTop: 6,
        marginLeft: 2,
    },
    submitButton: {
        backgroundColor: colors.primary,
        borderRadius: 14,
        paddingVertical: 15,
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 8,
        shadowColor: colors.primary,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.35,
        shadowRadius: 8,
        elevation: 4,
    },
    submitButtonDisabled: {
        opacity: 0.5,
        shadowOpacity: 0,
        elevation: 0,
    },
    submitButtonText: {
        fontSize: 15,
        fontWeight: '800',
        color: colors.black,
        letterSpacing: 0.2,
    },
});

export default EmailAuthScreen;
