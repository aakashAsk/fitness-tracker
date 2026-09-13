import React, { useState } from 'react';
import EmailAuthScreen from './EmailAuthScreen';
import { signInOrCreateWithEmail } from '../../Services/emailAuthService';

// Shown while there is no signed-in session. On success, Firebase's
// onAuthStateChanged (listened to in App.tsx) flips the app into the
// signed-in state — there is nothing to report back up here.
export const AuthNavigator: React.FC = () => {
    const [loading, setLoading] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

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

    return (
        <EmailAuthScreen
            onSubmit={handleSubmit}
            loading={loading}
            errorMessage={errorMessage}
        />
    );
};

export default AuthNavigator;
