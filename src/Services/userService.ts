// Placeholder for real authentication, which doesn't exist in this app yet.
// Every write/query that should be scoped "per user" uses this fixed id
// for now, so everyone sharing this Firebase project currently sees the
// same data — there is no real per-device or per-account isolation.
//
// When real sign-in is added (Firebase Auth, most likely), swap
// CURRENT_USER_ID for the signed-in user's uid here — every call site
// that imports it keeps working unchanged.
export const CURRENT_USER_ID = 'guest-user';
