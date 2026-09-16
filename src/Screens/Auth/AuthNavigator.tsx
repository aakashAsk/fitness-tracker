import React, { useState } from 'react';
import EmailAuthScreen from './EmailAuthScreen';
import ForgotPasswordScreen from './ForgotPasswordScreen';
import { sendPasswordReset, signInOrCreateWithEmail } from '../../Services/emailAuthService';

// Shown while there is no signed-in session. On success, Firebase's
// onAuthStateChanged (listened to in App.tsx) flips the app into the
// signed-in state — there is nothing to report back up here.

type AuthView = 'signIn' | 'forgotPassword';

export const AuthNavigator: React.FC = () => {
    const [view, setView] = useState<AuthView>('signIn');
    const [loading, setLoading] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    // The address the reset screen opened with, so switching views does
    // not make the user type it twice.
    const [resetEmail, setResetEmail] = useState('');
    const [resetSent, setResetSent] = useState(false);

    const handleSubmit = async (email: string, password: string) => {
        setErrorMessage(null);
        setLoading(true);
        try {
            await signInOrCreateWithEmail(email, password);
        } catch (error) {
            setErrorMessage((error as Error).message);
        } finally {
            setLoading(false);
        }
    };

    const openForgotPassword = (email: string) => {
        setErrorMessage(null);
        setResetEmail(email);
        setResetSent(false);
        setView('forgotPassword');
    };

    const backToSignIn = () => {
        setErrorMessage(null);
        setView('signIn');
    };

    const handleSendReset = async (email: string) => {
        setErrorMessage(null);
        setLoading(true);
        try {
            await sendPasswordReset(email);
            setResetEmail(email);
            // Success here does NOT mean the address has an account —
            // see sendPasswordReset. The screen's wording reflects that.
            setResetSent(true);
        } catch (error) {
            setErrorMessage((error as Error).message);
        } finally {
            setLoading(false);
        }
    };

    if (view === 'forgotPassword') {
        return (
            <ForgotPasswordScreen
                initialEmail={resetEmail}
                onSubmit={handleSendReset}
                onBack={backToSignIn}
                loading={loading}
                errorMessage={errorMessage}
                sent={resetSent}
            />
        );
    }

    return (
        <EmailAuthScreen
            onSubmit={handleSubmit}
            onForgotPassword={openForgotPassword}
            loading={loading}
            errorMessage={errorMessage}
        />
    );
};

export default AuthNavigator;
