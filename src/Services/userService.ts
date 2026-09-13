// Real auth now exists (email/password + Firebase Auth — see
// src/Screens/Auth). Every write/query that scopes data "per user"
// calls getCurrentUserId() rather than importing a fixed constant, so
// data is actually isolated per signed-in account.
//
// Falls back to 'guest-user' only if called with nobody signed in —
// shouldn't happen in practice, since every screen that reads/writes
// user data is gated behind App.tsx's `hasSession` check (a real
// Firebase user), but this keeps the function total instead of
// throwing if that invariant is ever violated.
import { auth } from '../Firebase/firebaseConfig';

export function getCurrentUserId(): string {
  return auth.currentUser?.uid ?? 'guest-user';
}
