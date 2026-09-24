// Step 1 — who the user is. Asked before anything else because it is
// the only thing here the app cannot derive or guess: the dashboard
// greets by name, and the email local-part is a poor stand-in for one.
//
// The phone number is collected but NOT verified — there is no OTP
// check yet, so nothing may treat it as a proven contact. It is
// optional for that reason: blocking setup on an unverified field the
// app does not use yet would be a gate with nothing behind it.
import React from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
import { Phone, User } from 'lucide-react-native';
import { colors } from '../../Theme/colors';
import { radius, spacing } from '../../Theme/spacing';
import { FieldCard, PrimaryButton, StepHeader, StepTitle } from './OnboardingUI';
import { themedStyles } from '../../Theme/ThemeContext';

const ICON_SIZE = 16;

/** Longer than this is a paste, not a name, and it would overflow the
    dashboard greeting on one line. */
export const MAX_NAME_LENGTH = 40;
export const MAX_PHONE_LENGTH = 16;

export interface AboutYouValue {
    displayName: string;
    phoneNumber: string;
}

export interface AboutYouStepProps {
    value: AboutYouValue;
    onChange: (next: Partial<AboutYouValue>) => void;
    onContinue: () => void;
}

export const AboutYouStep: React.FC<AboutYouStepProps> = ({
    value,
    onChange,
    onContinue,
}) => {
    // Trimmed for the check so a name of only spaces cannot pass, but the
    // raw value stays in the field — trimming as the user types would eat
    // the space between their first and last name.
    const nameReady = value.displayName.trim().length > 0;

    // Lets the name field's "Next" hand focus straight to the phone
    // field, instead of just closing the keyboard — returnKeyType="next"
    // alone only changes the key's label, it does not move focus itself.
    const phoneInputRef = React.useRef<TextInput>(null);

    return (
        <ScrollView
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
        >
            <StepHeader step={1} />

            <StepTitle
                title="First, what should we call you?"
                subtitle="Your name is how the app greets you. You can change it later from your profile."
            />

            <View style={styles.fields}>
                <FieldCard
                    label="Your name"
                    icon={<User size={ICON_SIZE} color={colors.primary} strokeWidth={2.4} />}
                >
                    <TextInput
                        value={value.displayName}
                        onChangeText={(displayName) => onChange({ displayName })}
                        placeholder="e.g. Jordan Lee"
                        placeholderTextColor={colors.textSecondary}
                        style={styles.input}
                        maxLength={MAX_NAME_LENGTH}
                        autoCapitalize="words"
                        autoCorrect={false}
                        autoFocus
                        returnKeyType="next"
                        blurOnSubmit={false}
                        onSubmitEditing={() => phoneInputRef.current?.focus()}
                        accessibilityLabel="Your name"
                    />
                </FieldCard>

                <FieldCard
                    label="Phone number"
                    icon={<Phone size={ICON_SIZE} color={colors.primary} strokeWidth={2.4} />}
                    trailing={<Text style={styles.optional}>Optional</Text>}
                >
                    <TextInput
                        ref={phoneInputRef}
                        value={value.phoneNumber}
                        onChangeText={(phoneNumber) => onChange({ phoneNumber })}
                        placeholder="e.g. 90000 00000"
                        placeholderTextColor={colors.textSecondary}
                        style={styles.input}
                        maxLength={MAX_PHONE_LENGTH}
                        keyboardType="phone-pad"
                        returnKeyType="done"
                        accessibilityLabel="Phone number"
                    />
                </FieldCard>
            </View>

            <View style={styles.note}>
                <Text style={styles.noteText}>
                    We don't verify your number yet — it's stored on your profile so reminders
                    can reach you once that ships.
                </Text>
            </View>

            <PrimaryButton label="Continue" onPress={onContinue} disabled={!nameReady} />
        </ScrollView>
    );
};

export default AboutYouStep;

const styles = themedStyles(() => ({
    content: {
        paddingHorizontal: spacing.lg,
        paddingTop: spacing.md,
        paddingBottom: spacing['2xl'],
        gap: spacing.lg,
    },
    fields: { gap: spacing.sm },
    input: {
        height: 46,
        paddingHorizontal: spacing.sm,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surfaceLow,
        fontSize: 15,
        fontWeight: '600',
        color: colors.textPrimary,
    },
    optional: {
        fontSize: 11,
        fontWeight: '700',
        color: colors.textSecondary,
    },
    note: {
        padding: spacing.sm,
        borderRadius: radius.md,
        backgroundColor: colors.surfaceLow,
    },
    noteText: { fontSize: 12, lineHeight: 17, color: colors.textSecondary },
}));
