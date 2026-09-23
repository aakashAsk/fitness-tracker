# Feature flags (kill switches)

Every new feature ships behind a flag. If it misbehaves in production you turn it off in the Firebase console and running apps hide it within about a second, with no new build.

## How it works

- Flags live in the Firestore collection **`featureToggle`**: one document per flag, **document id = flag key**, body `{ enabled: true | false }`. A boolean field named after the flag (e.g. `disabledPushNotification: true`) is accepted too. Precedence per flag: the database value if the document has one, otherwise the default in `src/FeatureFlags/registry.ts`.
- `src/FeatureFlags/registry.ts` declares every flag (owner, default, planned removal, fail mode). A key in Firestore that is not in the registry is ignored.
- `FeatureFlagProvider` (mounted once in `App.tsx`) loads flags at start with a 2.5 s timeout, keeps a live listener, and caches the last values on the device.
- Fallback per flag: **database value -> device cache -> registry default**. A `failMode: 'closed'` flag with no value anywhere is OFF.
- The splash stays up until flags have loaded (or the 2.5 s timeout hits), so a switched-off feature is never painted.

## Shipping a new feature behind a flag

1. **Add it to the registry** (`src/FeatureFlags/registry.ts`): `key`, `description`, `owner`, `defaultValue: false`, `createdAt`, `plannedRemoval` (90 days out at most), `failMode: 'closed'`. New and risky features are always `closed`.
2. **Create the document** in the Firebase console: collection `featureToggle`, document id = the key, field `enabled` (boolean) = `false`. Optional (a missing doc uses the default), but having it there means the switch already exists during an incident.
3. **Gate every way in.**
   - UI: `<FeatureGate flag="myFeature" fallback={...}>...</FeatureGate>` or `useFeatureFlag('myFeature')`.
   - Non-React code (services, navigation guards, notification or deep-link handlers): `isFeatureEnabled('myFeature')`.
   - If the feature can be reached two ways, gate both. The Schedule tab is the reference: it is hidden in `Navigation.tsx`, gated in `renderScreen()`, refused in `setActiveTab`, and the app leaves it if the flag flips while the user is on it.
   - Put the gate at the outermost boundary of the feature so unmounting can never interrupt a half-finished write.
4. **Test both states.** Run the app with the flag on and off, and flip it while the app is open.
5. **Roll out.** Turn it on in the console. Watch it for a release.
6. **Remove.** Delete the gate from the code, delete the registry entry, then delete the Firestore document last.

## Killing a feature in production

Firebase console -> Firestore -> `featureToggle` -> the flag's document -> set `enabled` to `false`. Running apps update live. Apps that start offline use the last cached value, or the registry default if there is none.

## What an offline user sees

The last values the device received. On a first-ever offline start there is no cache, so registry defaults apply after at most 2.5 s (`closed` flags are OFF).

## Rules

- Anyone can **read** `featureToggle` (flags must resolve before sign-in). Only one hardcoded admin uid can **write** (see `firestore.rules`; the placeholder `YOUR_UID_HERE` must be replaced with the real uid before the rules are deployed).
- **Never put anything secret or user-specific in a flag document.** It is publicly readable.
- Only `FeatureFlagProvider` talks to `featureFlagService`. Screens use the hook, the gate or `isFeatureEnabled`.

## Stale flags

`npm test` fails when a flag is more than 30 days past its `plannedRemoval` date, listing the flags to remove. In development the provider also logs a warning at startup.

## Files

`src/FeatureFlags/` (registry, resolver, store, provider, hook, gate, cache) and `src/Services/featureFlagService.ts` (the only Firestore access).

## Current flags

| Flag | Gates |
|---|---|
| `disabledPushNotification` | Kill switch for ALL notification code: the `expo-notifications` handler, workout/meal reminder scheduling (`src/Notifications/`), the "Notifications & alerts" section in Settings, and the reminder block in the plan builder. |
| `enabledAddForSubscription` | The subscription advert above the bottom navigation on the dashboard (`src/Screens/Dashboard/SubscriptionAdBanner.tsx`, gated in `App.tsx`). Slides in 5 s after the dashboard appears; dismissable for the session. `failMode: 'open'` with `defaultValue: true`, so it shows by default; set `enabled: false` on the Firestore document to turn it off. (Deviates from the "new features are closed" rule on purpose — a closed flag ignores `defaultValue` entirely, so the advert would never appear until a document existed. See the comment in `registry.ts`.) "Add" in the key is the product's spelling of *advert*, not an action. |

**Polarity:** the name says what it does. In the console, `enabled: true` means push notifications are **DISABLED**. `enabled: false` (or no document at all) leaves them on.

### How `disabledPushNotification` is isolated

- `App.tsx` no longer imports `expo-notifications` or calls `useReminderSync`. It only mounts `NotificationsRoot`.
- `NotificationsRoot` waits for flags to load, then lazy-loads `NotificationsFeature` only when the kill switch is off. While it is on, nothing loads and `expo-notifications` is never imported.
- Reminders are weekly notifications owned by the OS. If the switch is flipped on while the app is open, the feature unmounts and cancels them. If the app **starts** with the switch already on, nothing is loaded, so reminders scheduled in an earlier session are NOT cancelled and may keep firing until the switch is turned off again.
- Not covered by a runtime flag: the `expo-notifications` entry in `app.json` and `package.json`. They are build-time native config.
