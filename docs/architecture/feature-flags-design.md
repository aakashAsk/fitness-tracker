# Feature Flags / Kill Switch — Design

Status: proposed (design only; no source changed). Companion tasks: `docs/architecture/backlog.md`, section "Feature flags (FF-\*)".
This document is the design evidence for the feature-flag system. It deliberately does **not** use Firebase Remote Config.

> **SCOPE AMENDMENT (approved; supersedes this document where they differ).** Storage is the Firestore collection `featureToggle`, one document per flag (doc id = flag key, `{ enabled: boolean }`), not `config/featureFlags`. The admin is a single uid hardcoded in `firestore.rules` (placeholder `YOUR_UID_HERE`), not `config/admins`. Dropped: admin screen (FF-008), audit trail / `changes`, Cloud Functions, crash keys / Sentry, all targeting fields (section 5), `schemaVersion`/`updatedBy` metadata, and the second fail-closed flag in FF-010. Toggling is manual in the Firebase console. Sections 1, 5, 6, 7, 8 describe the original, larger design and are kept for history. See "Scope amendment" in `backlog.md`.

---

## 0. Repo facts (determined by inspection, not assumed)

| Question | Answer | Evidence |
|---|---|---|
| Expo managed vs bare | Expo SDK 57 with **CNG / prebuild + dev client** — `android/` is generated and checked in, `expo-dev-client` and native modules (`react-native-health-connect`) are present, config still lives in `app.json` | `package.json:14-22` (`expo ~57.0.20`, `expo-dev-client ~57.0.19`), `app.json:29-52` (plugins), `android/` directory present |
| Navigation | **Neither Expo Router nor React Navigation.** Navigation is a `useState<NavTab>` switch in the root component plus a custom bottom bar | `App.tsx` `const [activeTab, setActiveTab] = useState<NavTab>('home')` and `renderScreen()`; `src/Components/Navigation.tsx:13,27-33` (`NavTab`, `TABS`) |
| Database | **Cloud Firestore** only. No Realtime Database (`firebase.json` declares firestore rules/indexes only), no Storage rules | `firebase.json`, `firestore.rules`, `firestore.indexes.json` (`{"indexes": [], "fieldOverrides": []}`) |
| Firebase SDK | **Firebase JS SDK v12** (`firebase`), explicitly *not* `@react-native-firebase`, so the app runs in Expo Go | `src/Firebase/firebaseConfig.ts:1-12` and its header comment; `package.json` `"firebase": "^12.19.0"` |
| Auth | Email/password via `@firebase/auth` with AsyncStorage persistence; session gate in the root component | `src/Firebase/firebaseConfig.ts:38-52`, `App.tsx` (`onAuthStateChanged`), `src/Services/emailAuthService.ts` |
| Roles / admin | **Not modelled at all.** No custom claims, no `role`/`isAdmin` field anywhere in `src` or in `firestore.rules`; every rule is "signed in AND owns the doc" | grep for `admin|customClaim|role` over `src` returns only UI `role` props; `firestore.rules` has only `isSignedIn()`, `ownsExisting()`, `keepsOwnership()` |
| Cloud Functions | **None.** No `functions/` directory, no `functions` key in `firebase.json` | `firebase.json`, repo root listing |
| Local storage | **AsyncStorage** (`@react-native-async-storage/async-storage@2.2.0`). No MMKV, no expo-secure-store. Existing device-cache pattern to copy: `src/Theme/themeStorage.ts` | `package.json`, `src/Theme/themeStorage.ts:1-55` |
| Test setup | **Native `node --test` only**, added in T-000. No Jest, no React Native Testing Library, no `@firebase/rules-unit-testing`. Tests must be pure modules — anything importing `src/Firebase/firebaseConfig.ts` initializes the SDK at module load | `package.json` `"test": "node --test src/**/__tests__/*.test.ts"`; `src/Services/__tests__/*.test.ts`; `docs/architecture/backlog.md` T-000 result (imports need explicit `.ts` extensions) |
| Emulator config | **None today.** `firebase.json` has no `emulators` block; no `connectFirestoreEmulator`/`connectAuthEmulator` call and no `10.0.2.2` anywhere in `src` | `firebase.json`; grep for `Emulator|10.0.2.2` over `src` returns no hits |
| Startup / splash | In-app animated splash gated by a latched `bootComplete`; theme cache is read before the first frame (`if (!hydrated) return null`) | `App.tsx` boot-gate block; `src/Screens/Splash/SplashScreen.tsx:1-20` |
| State management | Redux Toolkit + `react-redux`, with one "sync hook" per collection started once at root (`useWorkoutPlansSync`, `useMealPlansSync`, `useUserProfileSync`) | `src/Store/store.ts`, `src/Store/workoutPlansSlice.ts:1-60`, `App.tsx` |
| Firebase usage pattern | Screens never import `firebase/firestore`; a service in `src/Services` owns the SDK calls, converts `Timestamp`→`Date`, and exposes `subscribeToX` / `fetchX`; a slice + sync hook holds the live result | `README.md:696-712` (Conventions), `src/Store/workoutPlansSlice.ts` |
| Lint / typecheck / build scripts | **No lint script and no typecheck script.** `package.json` scripts are `start`, `android`, `ios`, `web`, `start:go`, `start:clear`, `build:dev`, `test`. Typecheck is run manually as `node ./node_modules/typescript/lib/tsc.js --noEmit` (28 pre-existing errors — see T-001 result) | `package.json:5-13`; `docs/architecture/backlog.md` T-001 Result |
| Crash reporting | **None.** No Crashlytics, no Sentry, no `expo-insights` | grep for `crashlytics|sentry` over `src` and `package.json` returns no hits |
| Deep links | **Not configured.** No `scheme` in `app.json`, no `Linking.addEventListener`/`getInitialURL`; the only `Linking` use is `openURL` to the Play Store | `app.json`; `src/Screens/Dashboard/LiveTelementry.tsx:2,95` |
| Push notification handlers | `expo-notifications` is installed and a `setNotificationHandler` is registered at module scope in `App.tsx`; `useReminderSync` schedules local reminders. No remote push, no response listener that navigates | `App.tsx` (notification block), `src/Services/reminderService.ts`, `src/Store/useReminderSync.ts` |

Consequences that shape the design:
- There is **no router**, so "gating a route" means gating a `NavTab` entry in `src/Components/Navigation.tsx:27` plus its `case` in `App.tsx`'s `renderScreen()`. There is **no deep-link surface yet** — the design specifies the guard so it exists the day a `scheme` is added, but the proof task cannot demonstrate a real deep link.
- There are **no Cloud Functions**, so the audit trail and the "who is an admin" decision must be client-written and rules-enforced, or done by hand in the console.
- There is **no admin concept**, so this feature has to introduce one. Custom claims cannot be set without a privileged backend (Admin SDK / Function), so the design recommends an admin-list document for now and documents the claims upgrade path.
- Tests can only cover **pure logic**. Rules tests need `@firebase/rules-unit-testing` + an emulator, which do not exist yet — that is its own task.

---

## 1. Storage model

### The two candidates

**(a) One document holding a map of all flags** — `config/featureFlags`

```
config/featureFlags
  flags: {
    scheduleTab: { enabled: true, ... },
    aiCoachBanner: { enabled: false, ... },
  }
  updatedAt, updatedBy, schemaVersion
```

**(b) One document per flag** — `featureFlags/{flagKey}`

| Criterion | (a) Single doc, map | (b) Doc per flag |
|---|---|---|
| Read cost at app start | **1 document read**, fixed forever | N reads, one per flag; grows with every flag shipped |
| Live update | 1 `onSnapshot` on a doc; every change re-delivers the whole map — trivially consistent | 1 `onSnapshot` on a collection query; per-doc deltas, but a collection listener bills per changed doc and needs a rule that permits list |
| Atomic multi-flag change | Native — one `updateDoc` changes several flags in one transaction-free write | Needs `writeBatch`; still fine, but the client must remember to batch |
| Per-flag metadata | Nested map fields (`flags.aiCoach.owner`) — writable individually with dotted field paths, so no read-modify-write | First-class document fields; slightly nicer to query (`where('owner','==',...)`) |
| Audit trail | Must live elsewhere (a subcollection) either way | Same |
| Size limit | Firestore document limit is **1 MiB**. A flag entry with full metadata is roughly 250–400 bytes, so the ceiling is on the order of ~2,500 flags — far beyond any realistic count for this app | No practical limit |
| Rules | One `match /config/featureFlags` block | One block over the collection, plus a list-read rule |
| Offline cache | One doc to persist to AsyncStorage | Must persist a collection snapshot |

### Recommendation: **(a) one document, `config/featureFlags`, with a `flags` map**

Justification for *this* repo specifically:
1. **Startup cost is the binding constraint.** The design requires flags to be resolved before the first screen renders, behind a 2–3 s hard timeout (§3b). One read of one known document is the cheapest and most predictable thing Firestore can do; N reads over a growing collection makes the cold-start budget a function of how many flags the team has ever shipped.
2. **The app already has exactly this pattern.** `userProfiles/{uid}` is a single document holding a nested `macros` map read once at boot (`src/Services/userProfileService.ts`, `README.md:251`). A single config document is consistent with the repo, not a new idea.
3. **Kill-switch semantics want atomicity.** Turning off a feature and its entry point together must not be observable half-applied. A map in one document gives that for free.
4. **Size is a non-issue at this scale.** The 1 MiB ceiling is ~2,500 flags; §9's lifecycle convention keeps the live count in the tens.
5. **Dotted field paths keep writes surgical.** `updateDoc(ref, { 'flags.aiCoachBanner.enabled': false, ... })` changes one flag without reading the document first, so two admins toggling different flags cannot clobber each other.

Where (b) would win — querying flags by owner, thousands of flags, per-flag ACLs — none apply here. If the flag count ever passes ~100 or per-team ownership of writes becomes real, migrating to (b) is mechanical because the client only ever talks to `featureFlagService`.

### Must flags be readable before login?

**Yes.** Three reasons drawn from the actual boot sequence in `App.tsx`:
- The splash, `AuthNavigator` and `OnboardingNavigator` all render before a session exists, and the whole point of a kill switch is to be able to disable a broken *sign-in* or *onboarding* step.
- `onAuthStateChanged` resolves asynchronously; making the flag fetch wait on it would serialize two round trips inside a 2–3 s budget.
- A flag that only applies after login is not a kill switch for the launch path.

**What that means for rules:** the flags document must be world-readable (`allow read: if true`). That is acceptable only because §6 forbids any secret or user data in it — a flag document is, by construction, a list of feature names the app already ships code for, which anyone can read out of the APK anyway. Writes remain admin-only.

### Exact data model

Path: `config/featureFlags` (single document; collection `config` reserved for future app-wide config documents).

| Field | Type | Req. | Notes |
|---|---|---|---|
| `schemaVersion` | number | yes | `1`. Lets a future client refuse a shape it does not understand and fall back to bundled defaults. |
| `updatedAt` | Timestamp | yes | Server-set (`serverTimestamp()`). |
| `updatedBy` | string | yes | uid of the admin who last wrote. |
| `flags` | map<string, FlagValue> | yes | Keyed by the registry key. Unknown keys are ignored by the client; missing keys fall back to the registry default. |

`FlagValue`:

| Field | Type | Req. | Notes |
|---|---|---|---|
| `enabled` | boolean | yes | The on/off decision. The only field v1 clients read. |
| `note` | string | no | Free text, e.g. why it was killed. Shown in the admin screen only. |
| `updatedAt` | Timestamp | no | Per-flag last change. |
| `updatedBy` | string | no | uid. |
| `environments` | map<string, boolean> | no | §5 extension: `{ dev: true, prod: false }`. Absent ⇒ `enabled` applies everywhere. |
| `rolloutPercent` | number (0–100) | no | §5 extension. Absent ⇒ 100 when `enabled`. |
| `allowUserIds` | string[] | no | §5 extension. Listed uids get the feature on regardless of `enabled`/`rolloutPercent`. **Not** a place for emails or any PII — uids only. |
| `minAppVersion` | string | no | §5 extension, semver of `app.json` `expo.version`. Clients below it treat the flag as off. |

Every extension field is **optional and additive**, so §5 needs no migration: a v1 client ignores what it does not know, and the resolver treats absent fields as "no constraint".

Audit trail subcollection: `config/featureFlags/changes/{autoId}` — see §7.

### Example document

```jsonc
// config/featureFlags
{
  "schemaVersion": 1,
  "updatedAt": "<Timestamp 2026-09-19T10:14:02Z>",
  "updatedBy": "kR3v...uid",
  "flags": {
    "scheduleTab": {
      "enabled": true,
      "note": "Presentational ScheduleSession; kill if the timeline misrenders.",
      "updatedAt": "<Timestamp 2026-09-19T10:14:02Z>",
      "updatedBy": "kR3v...uid"
    },
    "aiMealEstimates": {
      "enabled": false,
      "note": "Killed 2026-09-18: OpenRouter spend spike.",
      "updatedAt": "<Timestamp 2026-09-18T22:01:55Z>",
      "updatedBy": "kR3v...uid",
      "environments": { "dev": true, "prod": false },
      "rolloutPercent": 10,
      "allowUserIds": ["kR3v...uid"],
      "minAppVersion": "1.1.0"
    }
  }
}
```

---

## 2. Flag registry (single typed definition in code)

One file, `src/FeatureFlags/registry.ts`, is the only place a flag is declared. Firestore holds *values*; the registry holds *identity, intent and defaults*. A key that exists in Firestore but not the registry is ignored; a key in the registry but not Firestore resolves to its bundled default.

```ts
// src/FeatureFlags/registry.ts  (proposed — not yet written)
export interface FlagDefinition {
  /** Stable key. Also the Firestore map key. Never renamed — retire instead. */
  readonly key: string;
  /** What the flag controls, in one sentence, for whoever finds it in six months. */
  readonly description: string;
  /** Who decides whether this is on. A person, not a team alias. */
  readonly owner: string;
  /** Value used when no value is available from anywhere. See failMode. */
  readonly defaultValue: boolean;
  /** "YYYY-MM-DD" the flag was added. */
  readonly createdAt: string;
  /** "YYYY-MM-DD" by which the flag should be deleted. Enforced by the staleness helper (§9). */
  readonly plannedRemoval: string;
  /**
   * What happens when the backend said nothing and there is no cache.
   * 'open'   — behave as ON  (defaultValue must be true).  For long-lived,
   *            proven features where absence would break the app.
   * 'closed' — behave as OFF (defaultValue must be false). For every new or
   *            risky feature. This is the default choice.
   */
  readonly failMode: 'open' | 'closed';
}

export const FEATURE_FLAGS = {
  scheduleTab: {
    key: 'scheduleTab',
    description: 'Shows the Schedule tab in the bottom nav and allows navigating to it.',
    owner: 'aakash',
    defaultValue: true,
    createdAt: '2026-09-19',
    plannedRemoval: '2026-12-31',
    failMode: 'open',
  },
} as const satisfies Record<string, FlagDefinition>;

export type FeatureFlagKey = keyof typeof FEATURE_FLAGS;
```

`FeatureFlagKey` is what every API in §4 accepts, so a typo is a compile error, and "which flags exist" is answerable by reading one file. The invariant `failMode === 'closed' ⇒ defaultValue === false` is asserted by a unit test, not by types, to keep the literal shape inferable.

---

## 3. Safe defaults and resilience

Non-negotiable: **an unreachable backend must never block, crash, or change behaviour unexpectedly.**

- **Nothing throws.** `featureFlagService` catches everything and resolves; the same non-throwing contract `src/Theme/themeStorage.ts:24-33` already documents ("a theme preference is not worth failing a launch over").
- **Cached last-known values.** Every successful snapshot is mirrored to AsyncStorage under `pulsefit.featureFlags` (namespacing copied from `THEME_KEY = 'pulsefit.themeMode'`), as `{ schemaVersion, fetchedAt, flags }`.
- **Offline start** reads that cache and proceeds. No network wait beyond the timeout.
- **Fetch timeout** — see §3b.
- **Bundled registry defaults** are the last resort and are always available, because they are compiled into the bundle.
- **Cache staleness:** a cached snapshot older than 7 days is still used (stale flags beat no flags, and a kill switch you cannot reach is exactly when you most want the last known kill) but is reported in the provider's `source` field so the admin screen and crash keys can say `cache-stale`.
- **Schema guard:** if `schemaVersion` from the server exceeds the client's known version, log and fall back to defaults rather than misread a shape.

## 3b. Startup loading

Sequence, mapped onto the existing boot gate in `App.tsx`:

1. **Before the first screen renders.** `FeatureFlagProvider` mounts inside `SafeAreaProvider` and *outside* `AppContent`, as a sibling layer to `ThemeProvider`/`DialogProvider`. Its effect fires on mount — i.e. concurrently with `onAuthStateChanged`, not after it. Flags do not depend on auth (§1), so the two round trips overlap.
2. **What the user sees while waiting.** Nothing new. The existing animated splash already covers boot (`App.tsx` `if (!bootComplete)`). Flag readiness becomes a third input to the existing latch: `appReady = authResolved && flagsReady && (!hasSession || !profileLoading)`. The splash animation runs ~1.5 s on its own, so in the common case flags cost zero visible time. No skeleton is introduced; adding one would mean a second loading idiom in a boot sequence that already has a deliberate one.
3. **Hard timeout: 2500 ms**, measured from provider mount. On expiry the provider resolves with whatever it has and the splash comes down. The Firestore listener is *not* cancelled — it keeps running and will deliver the real values a moment later (§3b.5 makes that safe). This is chosen over 2000 ms because a cold Firestore connection on a mobile network commonly needs >1 s, and over 3000 ms because the splash is only ~1.5 s and users notice a stall past ~2.5 s.
4. **Fallback order** (first that yields a value for a given key wins, evaluated per key, not per snapshot):
   1. fresh value from `config/featureFlags`
   2. last-known cached value from AsyncStorage
   3. bundled registry `defaultValue`
5. **Live updates after initial load.** The same `onSnapshot` that served the initial value stays attached for the app's lifetime. A flag flipped off mid-session updates provider state, which re-renders `useFeatureFlag` consumers and `FeatureGate`, so the feature disappears **immediately without a restart**. Gated screens must therefore tolerate unmounting mid-interaction: the convention is that a gate is placed at the outermost boundary of a feature (tab entry, card, modal trigger) so unmounting cannot leave a half-written document. Anything that writes must complete its write before the gate can remove it, or be idempotent.
6. **One owner.** `FeatureFlagProvider` at the app root owns the fetch, the timeout, the cache write and the listener. **No screen, hook or service ever reads Firestore for flags.** This mirrors the existing "one listener per collection, started once at root" rule (`src/Store/workoutPlansSlice.ts:1-4`). Enforced by convention and reviewed like the other rules in `README.md:696`.
7. **First-ever offline start.** No cache, no network ⇒ registry defaults only, after at most 2500 ms. New/risky features are `failMode: 'closed'`, so a first-run offline user sees the safe, minimal app rather than untested surface.
8. **Fail-open vs fail-closed** is per flag, declared in the registry (§2). Default for anything new: **closed**.

```mermaid
flowchart TD
  A[App mounts] --> B[FeatureFlagProvider effect]
  B --> C[read AsyncStorage cache]
  B --> D[onSnapshot config/featureFlags]
  C --> E{cache hit?}
  E -- yes --> F[resolve from cache, source=cache]
  E -- no --> G[hold registry defaults]
  D -- first snapshot --> H[resolve from server, source=server, write cache]
  B --> T[2500 ms timeout]
  T -- fires first --> I[resolve with best available, source=cache|default]
  F & H & I --> J[flagsReady = true → splash latch]
  D -- later snapshots --> K[update state live, rewrite cache]
```

---

## 4. Client API

Three entry points, all reading the same provider state. Files live in `src/FeatureFlags/`.

**(1) Hook — `useFeatureFlag(key)`**
```ts
const scheduleEnabled = useFeatureFlag('scheduleTab'); // boolean, never undefined
```
Returns the resolved boolean. Typed on `FeatureFlagKey`. A companion `useFeatureFlagsMeta()` returns `{ source: 'server'|'cache'|'cache-stale'|'default', fetchedAt }` for the admin screen and diagnostics.

**(2) Component — `<FeatureGate>`**
```tsx
<FeatureGate flag="scheduleTab" fallback={<ComingSoonCard />}>
  <ScheduleSession />
</FeatureGate>
```
`fallback` is optional and defaults to `null`. Children are not mounted at all when off — not merely hidden — so no effect runs and no Firestore listener inside the gated subtree starts.

**(3) Plain function — `isFeatureEnabled(key)`** for non-React callers (services, the `renderScreen` switch, notification response handlers, future deep-link parsing). It reads a module-level snapshot the provider keeps up to date (same pattern as the theme's module-level `styles` rebuild in `src/Theme/ThemeContext.tsx` — non-React code reading a value React also owns). It must never be called before the provider mounts; called early it returns registry defaults, which is the safe answer by construction.

**Gating entry points, not just UI.** A disabled feature must be unreachable by every path:

| Entry point in this repo | Guard |
|---|---|
| Bottom nav tab | Filter `TABS` in `src/Components/Navigation.tsx:27` by `isFeatureEnabled` |
| `renderScreen()` switch in `App.tsx` | The gated `case` returns the fallback (or falls through to `home`) when off |
| `setActiveTab` from a card (e.g. `openPlanInTab`) | The setter refuses a tab whose flag is off and stays put |
| Notification response (`expo-notifications`) | A handler that would navigate checks `isFeatureEnabled` first; if off, it no-ops |
| Deep links | None exist yet (no `scheme` in `app.json`). When added, the URL→tab resolver calls `isFeatureEnabled` before switching, and the design requires that the resolver be the *only* mapping from URL to tab |
| Services | A killed service (e.g. AI estimates) checks `isFeatureEnabled` at the top of its public entry function and returns the "no data" value its callers already handle |

Rule: **the flag check lives at the boundary the feature is entered through, and the feature has exactly one such boundary per path.** If a feature can be entered two ways, both are gated, and that is stated in the flag's registry `description`.

---

## 5. Targeting

v1 ships **on/off only** (`enabled`). The model in §1 already reserves the extension fields, so each of these is added later by teaching the resolver one more rule — no document migration, because absent field ⇒ no constraint.

Resolution order, once implemented (first decisive rule wins):
1. `minAppVersion` — client version below it ⇒ **off** (an old build cannot honour a flag for code it does not have).
2. `allowUserIds` contains the current uid ⇒ **on**.
3. `environments[currentEnv]` present ⇒ that value; env derived from `__DEV__` plus an `EXPO_PUBLIC_APP_ENV` variable (`dev`|`staging`|`prod`, defaulting to `dev` when unset), following the existing `EXPO_PUBLIC_*` convention in `.env.example`.
4. `rolloutPercent` present ⇒ **on** iff `stableHash(uid + ':' + flagKey) % 100 < rolloutPercent`. Hashing uid *with* the key keeps the 10 % cohort of one flag independent of another's, and keeps a given user's answer stable across restarts. Signed-out users fall back to `enabled` (no stable identity to bucket on — do not bucket on a random device id, or the cohort churns).
5. otherwise `enabled`.

The resolver is a **pure function** `resolveFlag(definition, value, context)` in `src/FeatureFlags/resolveFlag.ts`, so it is testable under `node --test` without touching Firebase — the same structural move T-001 made for `nutritionTotals.ts`.

---

## 6. Control and security

### How an owner toggles a flag

**Recommendation: Firebase Console for v1; a small in-app admin screen only once flags are routinely changed.**

- The console needs zero code, works during an incident from any laptop, and cannot itself be broken by the bug you are killing. For a kill switch, "the control plane does not depend on the app" is the decisive property.
- Its costs are real: no validation (a typo'd key silently does nothing — mitigated because unknown keys are ignored, §2), no audit metadata unless typed by hand, and console edits will **not** write the audit subcollection (§7). This is the main argument for the admin screen later.
- The admin screen (FF-008, optional) is `src/Screens/Admin/FeatureFlagsScreen.tsx`, reachable only from Settings and only when the current uid is an admin. It writes with dotted field paths, sets `updatedBy`/`updatedAt`, and appends an audit entry — i.e. it is the path that makes §7 complete.

### Who may change flags

The repo models **no roles today** (see §0). Two options:

| Option | Fit |
|---|---|
| **Custom claims** (`request.auth.token.admin == true`) | The right long-term answer: nothing client-writable decides admin status. But claims can only be set by the Admin SDK or a Cloud Function, and this repo has **no Functions and no server**. Adopting it now means either a local script run with a service account (a secret that must never enter the repo) or standing up Functions. |
| **Admin-list document** (`config/admins`, `{ uids: [...] }`) read by the rules via `get()` | Works today with zero infrastructure. Costs one extra rule-evaluation document read per flag write (writes are rare, so irrelevant). The list itself must be **non-writable by any client** — it is edited in the console only, which is exactly where flags are edited anyway. |

**Recommendation: `config/admins` now, with a documented migration to custom claims the moment Cloud Functions exist** (§8). The rules are written so the switch is a one-line change to the `isAdmin()` helper.

### Proposed security rules — TEXT ONLY, do not apply

To be inserted inside the existing `match /databases/{database}/documents { ... }` block in `firestore.rules`, alongside the existing helpers. Nothing else in that file changes.

```
    // ── Feature flags ────────────────────────────────────────────────
    // Admin identity lives in a console-only document rather than a
    // custom claim because this project has no Cloud Functions and no
    // server able to call the Admin SDK (see the feature-flag design,
    // §6). config/admins is readable by the rules engine via get() and
    // writable by nobody — it is edited in the Firebase console.
    //
    // Migration to claims later is one line: replace the body with
    //   return isSignedIn() && request.auth.token.admin == true;
    function isAdmin() {
      return isSignedIn() &&
             request.auth.uid in
               get(/databases/$(database)/documents/config/admins).data.uids;
    }

    match /config/featureFlags {
      // Deliberately public. The flags must resolve before sign-in —
      // the splash, auth and onboarding screens all render without a
      // session, and a kill switch that cannot disable the login path
      // is not a kill switch. This is safe ONLY because the document
      // contains no secret and no user data: flag keys name features
      // whose code already ships inside the APK. Never put anything
      // here that is not already public.
      allow read: if true;

      // Only admins write, and every write must identify its author and
      // keep the schema version the client understands.
      allow write: if isAdmin() &&
                      request.resource.data.updatedBy == request.auth.uid &&
                      request.resource.data.schemaVersion == 1;

      // Append-only audit trail. Anyone signed in may read it (it is
      // uid + flag key + booleans, no user data); only an admin may
      // append; nobody may edit or delete history.
      match /changes/{changeId} {
        allow read:   if isSignedIn();
        allow create: if isAdmin() &&
                         request.resource.data.changedBy == request.auth.uid;
        allow update, delete: if false;
      }
    }

    // The admin list itself: readable so an admin screen can decide
    // whether to render, never writable from a client.
    match /config/admins {
      allow read:  if isSignedIn();
      allow write: if false;
    }
```

Indexes: **none required.** Every access is a single-document get/listen, or a single-collection `orderBy('changedAt','desc')` on the audit subcollection, which Firestore serves from the automatic single-field index. `firestore.indexes.json` stays `{"indexes": [], "fieldOverrides": []}`.

### Content restrictions

No secrets, no API keys, no user data in `config/featureFlags`. `allowUserIds` holds **uids only** — never emails, never names. The document is world-readable; treat every byte in it as published.

---

## 7. Observability

**Audit trail** — `config/featureFlags/changes/{autoId}`:

| Field | Type | Notes |
|---|---|---|
| `flagKey` | string | Registry key changed |
| `from` | boolean \| null | Previous `enabled`; `null` when the flag did not exist |
| `to` | boolean | New `enabled` |
| `changedBy` | string | uid (pinned by the rule above) |
| `changedAt` | Timestamp | `serverTimestamp()` |
| `note` | string? | Why |
| `source` | string | `'admin-screen'` — console edits cannot write this |

Honest limitation: **console edits bypass the audit trail entirely**, because the console writes the document directly. Options are (a) accept it and rely on Firestore's own console activity logging in Cloud Audit Logs, or (b) build FF-008 and make the admin screen the only sanctioned path. Recommendation: accept for v1, note it in the developer guide, and revisit if flag changes become frequent. Do not pretend the trail is complete.

**Crash reports.** There is **no crash reporting in this project today** (§0) — no Crashlytics, no Sentry. So there is nothing to attach flags to yet. What it would take:
- *Crashlytics* requires `@react-native-firebase/app` + `@react-native-firebase/crashlytics` and native config (`google-services.json`). That contradicts the deliberate JS-SDK-only choice documented in `src/Firebase/firebaseConfig.ts:1-6` (Expo Go compatibility) and means a dev build for every developer. It is a project-level decision, not a feature-flag decision.
- *Sentry* (`@sentry/react-native` via its Expo config plugin) works with the existing CNG setup and does not disturb the Firebase SDK choice. If crash reporting is wanted, this is the lower-friction option for this repo.

Design position: **out of scope for the flag system, but the flag system must be ready for it.** The provider exposes `getActiveFlagsSummary(): Record<string,boolean>` plus `source`, in the exact shape a crash reporter's custom-keys / context API wants. Wiring it is one call in whichever task introduces crash reporting. Meanwhile, `console.log` the summary once on resolve in `__DEV__` only, so a developer can always see which values a session started with. Listed as an open question (§ Open questions).

---

## 8. Server side

There are **no Cloud Functions in this project** — no `functions/` directory and no `functions` key in `firebase.json`. So nothing server-side reads flags today, and the flag system is client-only.

If Functions are added later:
- A Function reads the same `config/featureFlags` document with the Admin SDK (`admin.firestore().doc('config/featureFlags').get()`), applies the **same** `resolveFlag` logic, and must not invent a second source of truth. `resolveFlag.ts` is deliberately pure and dependency-free so it can be shared.
- Admin SDK reads bypass security rules, so the public-read rule is irrelevant server-side.
- A Function should cache the document in module scope with a short TTL (~60 s) rather than read per invocation.
- Once Functions exist, migrate admin identity from `config/admins` to **custom claims** via a callable that only an existing admin can invoke (§6), and change `isAdmin()` to the one-line claim check.

---

## 9. Lifecycle

Convention:
- Every flag declares `plannedRemoval` at creation. A flag with no removal date is not accepted in review.
- A shipped-and-proven feature's flag is deleted: remove from the registry, remove the gate from the code, then remove the key from Firestore **last** (so no build is ever reading a key that vanished; the registry default covers it anyway).
- Kill switches for permanent infrastructure are the exception and use `failMode: 'open'` with a far-future `plannedRemoval` that is reviewed, not ignored.

Helper: `findStaleFlags(today)` in `src/FeatureFlags/staleness.ts` — pure, iterates `FEATURE_FLAGS`, returns entries whose `plannedRemoval < today`, with `key`, `owner`, `daysOverdue`. Surfaced two ways:
- a unit test under `node --test` that **fails** when any flag is more than 30 days overdue (a hard test failure is the only reminder that cannot be ignored; 30 days of grace stops it firing on the exact removal day in the middle of unrelated work);
- a `__DEV__`-only console warning at provider resolve listing overdue flags.

---

## 10. Developer guide (outline) — `docs/feature-flags.md`

"How to ship a new feature behind a flag":
1. **Add to the registry.** One entry in `src/FeatureFlags/registry.ts`: key, description, owner, `defaultValue: false`, `createdAt`, `plannedRemoval` (≤ 90 days out), `failMode: 'closed'`.
2. **Create it in Firebase.** In the console, add `flags.<key> = { enabled: false, note, updatedBy, updatedAt }` to `config/featureFlags`. Optional — an absent key resolves to the registry default — but creating it up front means the kill switch is already there during an incident instead of being typed under pressure.
3. **Gate the code.** Wrap the UI in `<FeatureGate flag="...">`. Gate *every* entry point: nav tab, `renderScreen` case, any `setActiveTab` call, notification handlers, future deep links. Put the gate at the feature's outermost boundary.
4. **Test both states.** Unit-test the resolver path; manually verify ON and OFF against the emulator, including flipping mid-session.
5. **Roll out.** Turn on in dev, then staging, then prod (or ramp with `rolloutPercent` if §5 is implemented). Watch for one release.
6. **Remove.** Delete the gate, delete the registry entry, delete the Firestore key — in that order. The staleness test will tell you when.

Also covered: how to kill a feature in production (console → `flags.<key>.enabled = false`; clients pick it up live, no build), what a user with no network sees, and why nothing secret goes in the document.

---

## File list (follows existing repo conventions)

Create:
- `src/FeatureFlags/registry.ts` — typed flag definitions (§2). Pure, no imports from Firebase.
- `src/FeatureFlags/types.ts` — `FlagValue`, `FlagsSnapshot`, `FlagSource`, `ResolveContext`.
- `src/FeatureFlags/resolveFlag.ts` — pure resolver (§5). Pattern: `src/Services/nutritionTotals.ts` (extracted pure module, testable under `node --test`).
- `src/FeatureFlags/staleness.ts` — pure (§9).
- `src/FeatureFlags/featureFlagStorage.ts` — AsyncStorage cache. Pattern: `src/Theme/themeStorage.ts` (non-throwing read/write/clear, `pulsefit.` key prefix).
- `src/Services/featureFlagService.ts` — the **only** module importing `firebase/firestore` for flags: `subscribeToFeatureFlags(onChange, onError)`, `setFlagEnabled(key, enabled, note)`, `fetchAdminUids()`. Pattern: `src/Services/workoutPlanService.ts` (`subscribeToX`, Timestamp→Date, no Firestore types leak upward).
- `src/FeatureFlags/FeatureFlagProvider.tsx` — provider owning fetch, timeout, cache, listener, and the module-level snapshot behind `isFeatureEnabled`. Pattern: `src/Theme/ThemeContext.tsx` (provider + module-level value read by non-React code) and `src/Components/Dialog.tsx` (single root host).
- `src/FeatureFlags/useFeatureFlag.ts` — `useFeatureFlag`, `useFeatureFlagsMeta`.
- `src/FeatureFlags/FeatureGate.tsx` — gate component.
- `src/FeatureFlags/isFeatureEnabled.ts` — plain function for non-React code.
- `src/FeatureFlags/__tests__/resolveFlag.test.ts`, `registry.test.ts`, `staleness.test.ts` — `node --test`; **imports need explicit `.ts` extensions** (T-000 result).
- `docs/feature-flags.md` — the §10 guide.
- Optional: `src/Screens/Admin/FeatureFlagsScreen.tsx` (+ entry in `src/Screens/Profile/SettingsScreen.tsx`). Pattern: `SettingsScreen.tsx`, `themedStyles`, `useDialog()`.

Modify:
- `App.tsx` — mount `FeatureFlagProvider`; add `flagsReady` to the boot latch; gate the `renderScreen` case and `openPlanInTab`.
- `src/Components/Navigation.tsx` — filter `TABS` by flag.
- `firestore.rules` — **proposed text only in §6; not applied by this design and not by any task that is not explicitly a rules task.**
- `.env.example` — add `EXPO_PUBLIC_APP_ENV` (documentation only) if §5 environments are implemented.
- `firebase.json` — add an `emulators` block (FF-001) so the proof task is runnable.

No new runtime dependency is needed for the core system. The **rules test** (FF-009) needs `@firebase/rules-unit-testing` as a devDependency — justified because there is no other way to assert a rule, and it is dev-only, matching T-000's "devDependencies only, or none" constraint.

---

## Test plan (adapted to the tooling that actually exists)

There is no Jest and no React Native Testing Library, so **component and provider behaviour cannot be unit-tested** in this repo. The plan splits accordingly.

**Automated — `npm test` (`node --test`, pure modules only):**
1. `resolveFlag`: value present ⇒ `enabled`; value absent ⇒ registry default; `failMode:'closed'` with no value ⇒ false; unknown key in document ⇒ ignored; `minAppVersion` above current ⇒ off; uid in `allowUserIds` ⇒ on even when `enabled:false`; `rolloutPercent` bucketing is stable for the same uid+key and differs across keys; `rolloutPercent:0` ⇒ off, `100` ⇒ on.
2. `registry`: every entry's `key` equals its object key; `failMode:'closed'` ⇒ `defaultValue === false`; `plannedRemoval > createdAt`; dates parse as `YYYY-MM-DD`.
3. `staleness`: overdue detection, boundary on the exact date, empty result when nothing overdue; the guard test fails past 30 days overdue.
4. Cache codec: serialize→deserialize round-trip; corrupt JSON ⇒ `null`, never a throw; unknown `schemaVersion` ⇒ `null`.

Pure modules must not import `src/Firebase/firebaseConfig.ts` (it initializes the SDK at import) — same constraint T-000 recorded.

**Manual, against the Firestore emulator** (the provider, the gate, the boot latch and the rules): the PROOF TASK below is the manual test plan. Each step has an observable pass/fail.

**Typecheck:** `node --stack-size=8000 ./node_modules/typescript/lib/tsc.js --noEmit` must show the same pre-existing error count as before the change (28 at the time of writing, per T-001's result), with none in `src/FeatureFlags/`.

---

## PROOF TASK

### Candidate feature: the **Schedule tab** (`scheduleTab`)

Chosen from the actual code. Justification:
- **Genuinely low risk.** The tab currently renders `ScheduleSession`, a *presentational* timeline with no Firestore writes — `README.md:716+` records it as a design placeholder swapped in for the Firestore-backed `Schedule` screen. Hiding it cannot lose data or interrupt a workout/meal log.
- **It has both a UI surface and an entry point**, which is exactly what the proof must demonstrate: the `TABS` entry in `src/Components/Navigation.tsx:27-33` *and* the `case 'schedule'` in `App.tsx`'s `renderScreen()`. Nothing else in the app navigates to it, so the boundary is small and provably complete.
- **Its absence is unmistakable at a glance** — a nav bar with four icons instead of five — so "absent from first render" is verifiable without instrumentation.
- **`failMode: 'open'`** is correct here (it is an existing shipped surface, not a new risky one), which also proves the fail-open branch. A second, `failMode: 'closed'` flag is added in FF-010 to prove the other branch.

Rejected alternatives: `HydrationCard` (writes Firestore mid-interaction — unmount-while-writing risk, bad first proof); the AI meal estimate path (spends money, and its service has retry logic that muddies the demo); the dashboard cards (already partly hardcoded, so "did the flag work?" is ambiguous).

### What must be demonstrated, in the emulator

| # | Scenario | Setup | Pass condition |
|---|---|---|---|
| a | **Cold start, flag OFF** | `flags.scheduleTab.enabled = false` in the emulator before launch; app fully killed; cache cleared | On first render the bottom bar shows 4 tabs, no Schedule icon; `ScheduleSession` never mounts (a `__DEV__` mount log never appears); no flash of the tab at any point |
| b | **Flip ON in DB → appears live** | App running from (a); set `enabled = true` in the emulator UI | The Schedule tab appears **without restart**, within ~1 s; tapping it renders `ScheduleSession` |
| c | **Flip OFF → disappears live, entry points blocked** | App running on the Schedule tab; set `enabled = false` | Tab disappears from the bar within ~1 s; the app falls back to `home` rather than showing a blank screen; a programmatic `setActiveTab('schedule')` (dev-only button or debugger) does **not** navigate; the notification/deep-link guard returns false for the schedule target |
| d | **Emulator unreachable** | Stop the emulator, kill and relaunch the app | App boots. If a cache exists it uses the last-known values (`source: 'cache'`); with the cache also cleared it uses registry defaults (`scheduleTab` → ON, per `failMode:'open'`). No crash, no unhandled rejection, and the splash **comes down within 2.5 s** of provider mount — measured against a wall clock or a timestamped log |
| e | **Non-admin cannot write** | `@firebase/rules-unit-testing` against the emulator with the §6 rules loaded | A signed-in non-admin uid's write to `config/featureFlags` is **denied**; an unauthenticated read is **allowed**; an admin uid (present in `config/admins`) write **succeeds**; a write with `updatedBy != auth.uid` is **denied**; update/delete of a `changes/*` document is **denied** |

Constraints for the whole proof: **emulator only**, never production, no `firebase deploy`, no rules or index publishing, no secrets committed. Rules are loaded into the local emulator from a scratch copy for (e) — the real `firestore.rules` is not edited by the proof itself; applying §6's text to `firestore.rules` is its own explicit task (FF-002) and is still never deployed.

---

## Open questions (need a human decision)

1. **Admin identity:** approve `config/admins` now with a documented migration to custom claims, or stand up Cloud Functions first and go straight to claims? (Affects FF-002 and FF-008.)
2. **Public read of the flags document:** confirmed acceptable? It is required for pre-login kill switches, and the document is by construction non-secret — but it is the first publicly readable path in `firestore.rules`.
3. **Admin screen:** build it (FF-008) or stay console-only for v1? The trade-off is the completeness of the audit trail (§7).
4. **Crash reporting:** is it wanted at all, and if so Sentry (works with the current Expo/JS-SDK setup) or Crashlytics (needs `@react-native-firebase` + native config, conflicting with the deliberate Expo-Go-compatible choice)? Until answered, §7's crash-key wiring cannot be implemented, only prepared.
5. **Environments:** does a staging Firebase project exist, or is `dev`/`prod` all that is real? Determines whether §5's `environments` is worth implementing.
6. **Emulator adoption:** adding an `emulators` block to `firebase.json` and an `EXPO_PUBLIC_USE_FIREBASE_EMULATOR` switch changes every developer's local workflow, not just this feature. Approve as a project-wide change (FF-001)?
7. **`@firebase/rules-unit-testing` devDependency** for FF-009 — acceptable, given T-000's "no new dependency" preference? There is no alternative way to test rules.
8. **Who owns flags** (the `owner` field)? Needs at least one real name before the registry is written.

## Verification limits

Nothing in this document was verified against a live or emulated Firebase instance: there is no emulator configured (`firebase.json` has no `emulators` block) and no credentials were used. All repo facts are static (L1) reads of the files cited. `config/featureFlags`, `config/admins` and the `changes` subcollection **do not exist yet** — they are proposed, not observed. The proposed rules in §6 have not been applied, deployed, or evaluated by the rules engine; `isAdmin()`'s `get()` on `config/admins` is written from the documented rules API and must be proven by FF-009's emulator test before it is trusted.
