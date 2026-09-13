// Email/password auth against Firebase: if the email is new we create
// the account, otherwise we sign in and let Firebase validate the
// password. Trying create-first (rather than checking existence up
// front) avoids Firebase's email-enumeration-protected `invalid-credential`
// error being ambiguous between "no such user" and "wrong password".
import {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
} from '@firebase/auth';
import { auth } from '../Firebase/firebaseConfig';

export type EmailAuthErrorReason =
    | 'invalid-email'
    | 'weak-password'
    | 'wrong-password'
    | 'unknown';

export class EmailAuthError extends Error {
    reason: EmailAuthErrorReason;

    constructor(message: string, reason: EmailAuthErrorReason) {
        super(message);
        this.reason = reason;
    }
}

function toEmailAuthError(error: unknown): EmailAuthError {
    const code = (error as { code?: string })?.code ?? '';

    switch (code) {
        case 'auth/invalid-email':
            return new EmailAuthError('That email address looks invalid.', 'invalid-email');
        case 'auth/weak-password':
            return new EmailAuthError(
                'Password is too weak — use at least 6 characters.',
                'weak-password',
            );
        case 'auth/wrong-password':
        case 'auth/invalid-credential':
            return new EmailAuthError('Incorrect password. Please try again.', 'wrong-password');
        default:
            return new EmailAuthError(
                (error as Error)?.message ?? 'Something went wrong. Please try again.',
                'unknown',
            );
    }
}

// Resolves once the user is signed in — either into a freshly created
// account (new email) or their existing one (correct password).
// Throws EmailAuthError on invalid email, weak password, or wrong
// password for an existing account.
export async function signInOrCreateWithEmail(
    email: string,
    password: string,
): Promise<void> {
    try {
        await createUserWithEmailAndPassword(auth, email, password);
        return;
    } catch (error) {
        const code = (error as { code?: string })?.code;
        if (code !== 'auth/email-already-in-use') {
            throw toEmailAuthError(error);
        }
    }

    try {
        await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
        throw toEmailAuthError(error);
    }
}
