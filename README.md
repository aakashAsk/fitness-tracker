# PulseFit — Fitness Tracker

A React Native (Expo) fitness app: workout plans and session logging, meal
plans with AI nutrition estimation, hydration tracking, a schedule view, and
device step counting — all backed by Firebase.

> **Note on this document.** It describes the app as it is actually built.
> An earlier version of this README described a Supabase/PostgreSQL backend,
> Zustand, TanStack Query, offline SQLite, a Node.js cron worker, barcode
> scanning and social leaderboards. None of that exists in this codebase.

---

## Table of contents

1. [Stack](#stack)
2. [Getting started](#getting-started)
3. [Environment variables](#environment-variables)
4. [Architecture at a glance](#architecture-at-a-glance)
5. [Boot sequence](#boot-sequence)
6. [State management](#state-management)
7. [Firestore data model](#firestore-data-model)
8. [Services layer](#services-layer)
9. [Theming](#theming)
10. [Navigation and screens](#navigation-and-screens)
11. [Feature walkthroughs](#feature-walkthroughs)
12. [Native modules and build requirements](#native-modules-and-build-requirements)
13. [Conventions](#conventions)
14. [Known gaps and disabled features](#known-gaps-and-disabled-features)

---

## Stack

| Concern | Choice | Notes |
|---|---|---|
| Framework | Expo SDK 57, React Native 0.86, React 19.2 | |
| Language | TypeScript 6 | `strict` via `tsconfig` |
| Auth | Firebase Auth (email/password) | JS SDK, not `@react-native-firebase` |
| Database | Cloud Firestore | 6 top-level collections |
| State | Redux Toolkit + react-redux | 3 slices |
| Local storage | AsyncStorage | Auth persistence, theme cache, step ledger |
| Styling | Hand-rolled `themedStyles` over `StyleSheet` | NativeWind is installed but unused |
| Icons | `lucide-react-native` | |
| Charts | `react-native-svg` (hand-drawn rings/bars), `react-native-linear-gradient` | |
| Images | Cloudinary (unsigned upload) | Not Firebase Storage |
| AI | Google Gemini + OpenRouter | Plain `fetch`, no SDKs |
| Steps | `expo-sensors` + `react-native-health-connect` | |
| Notifications | `expo-notifications` | Currently disabled — see [gaps](#known-gaps-and-disabled-features) |

The Firebase **JS** SDK is used deliberately so the app runs in Expo Go
without `google-services.json`. See the comment block at the top of
`src/Firebase/firebaseConfig.ts` — in particular, auth is imported from
`@firebase/auth` rather than `firebase/auth`, because the wrapper package's
export map has no `react-native` condition and silently drops
`getReactNativePersistence` (which would log the user out on every reload).

---

## Getting started

```bash
npm install
cp .env.example .env     # then fill in the values below
npm run start:go         # Expo Go
```

| Script | What it does |
|---|---|
| `npm start` | `expo start` |
| `npm run start:go` | `expo start --go` |
| `npm run start:clear` | `expo start --go -c` (clears Metro cache) |
| `npm run android` / `ios` | `expo run:*` — local native build |
| `npm run web` | `expo start --web` |
| `npm run build:dev` | EAS development build (Android) |

**Running against the Firebase emulator.** Install the Firebase CLI (and
Java, which the Firestore emulator needs), run `firebase emulators:start`,
and set `EXPO_PUBLIC_USE_FIREBASE_EMULATOR=1` in `.env` (plus
`EXPO_PUBLIC_EMULATOR_HOST=10.0.2.2` on the Android emulator). Unset, the app
uses the real project.

**Expo Go does not support everything.** Notifications, Health Connect and
the motion permission all require a development build. See
[Native modules](#native-modules-and-build-requirements).

---

## Environment variables

All are `EXPO_PUBLIC_*`, so they are **inlined into the bundle at build time
and are readable by anyone with the app**. Nothing secret belongs here — the
proxy URLs below exist for exactly that reason.

```bash
# Firebase
EXPO_PUBLIC_FIREBASE_API_KEY=
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=
EXPO_PUBLIC_FIREBASE_PROJECT_ID=
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
EXPO_PUBLIC_FIREBASE_APP_ID=

# Exercise catalogue (Free Exercise DB-compatible host)
EXPO_PUBLIC_EXERCISE_API_BASE_URL=

# Cloudinary — unsigned preset, used for profile pictures
EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME=
EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET=

# Gemini — set EITHER the key (dev) OR a proxy URL (production)
EXPO_PUBLIC_GEMINI_API_KEY=
EXPO_PUBLIC_GEMINI_MODEL=          # default: gemini-3.6-flash
EXPO_PUBLIC_GEMINI_PROXY_URL=

# OpenRouter — same either/or
EXPO_PUBLIC_OPENROUTER_API_KEY=
EXPO_PUBLIC_OPENROUTER_MODEL=      # default: openai/gpt-4o-mini
EXPO_PUBLIC_OPENROUTER_PROXY_URL=
```

Both AI services expose `isGeminiConfigured()` / `isOpenRouterConfigured()`,
which return true if *either* a key or a proxy URL is present. When a proxy
URL is set, the API key header is omitted entirely and the proxy is expected
to attach credentials server-side.

---

## Architecture at a glance

```text
┌──────────────────────────────────────────────────────────────────┐
│ App.tsx — root                                                   │
│   Provider(store) → ThemeProvider → SafeAreaProvider →           │
│   DialogProvider → AppContent                                    │
│                                                                  │
│   AppContent owns: auth state, boot gate, active tab,            │
│   and starts the app-wide Firestore listeners.                   │
└───────────────┬──────────────────────────────────────────────────┘
                │
        ┌───────┴────────┬─────────────────┬────────────────┐
        ▼                ▼                 ▼                ▼
   Screens/          Store/            Services/        Theme/
   (presentation)    (RTK slices)      (all I/O)        (tokens +
                                                         themedStyles)
        │                ▲                 │
        │                │                 ▼
        │                │        ┌────────────────────────────┐
        └────────────────┘        │ Firestore · Firebase Auth  │
        reads via selectors       │ Cloudinary · Gemini        │
        or calls services         │ OpenRouter · Exercise API  │
        directly                  │ Health Connect · Pedometer │
                                  └────────────────────────────┘
```

**The rule:** screens never touch Firestore directly. Every read or write
goes through a module in `src/Services/`. Shared, long-lived data
(plans, profile) additionally flows through Redux so there is exactly one
listener per collection for the whole app. Per-screen, per-day data
(logs, telemetry, steps) is read on demand by the screen or a hook.

---

## Boot sequence

`AppContent` gates rendering behind several conditions, in this order. Each
gate exists to prevent a specific visible flash:

1. **`!hydrated` → render `null`.**
   The cached theme (AsyncStorage) has not been read yet. Painting now would
   show a dark-mode user a light frame. The OS splash covers this.

2. **`!bootComplete` → `SplashScreen`.**
   `bootComplete` latches true once the splash animation finishes **and**
   `appReady` is true. `appReady = authResolved && (!hasSession || !profileLoading)`.
   It is latched rather than derived because a later profile refetch would
   otherwise make the splash reappear mid-session.

3. **`!hasSession` → `AuthNavigator`.**
   Note `authResolved` is tracked separately from `firebaseUser`, because
   `auth.currentUser` is `null` on a cold start even for a signed-in user
   until Firebase restores the session.

4. **`profileLoading` → spinner.**
   Signed in, but we do not yet know whether this account has completed
   onboarding.

5. **`needsOnboarding` → `OnboardingNavigator`.**
   Defined as `profileStatus === 'ready' && !profile?.onboardingCompleted`.
   A *failed* read deliberately does not qualify — that would re-run
   onboarding for an existing user and overwrite their real answers.

6. Otherwise → the tab shell (`renderScreen()` + `BottomNavBar`).

---

## State management

Redux Toolkit, three slices, configured in `src/Store/store.ts`:

| Slice | Holds | Populated by |
|---|---|---|
| `userProfile` | The signed-in user's `UserProfile` | `useUserProfileSync(uid)` |
| `workoutPlans` | All of the user's workout plans | `useWorkoutPlansSync(uid)` |
| `mealPlans` | All of the user's meal plans | `useMealPlansSync(uid)` |

Each slice follows the same shape — `{ data, status, error }` where status is
`'idle' | 'loading' | 'ready' | 'failed'` — and exports:

- action creators (`*Loading`, `*Received`, `*Failed`)
- selectors (`selectWorkoutPlans`, `selectWorkoutPlansStatus`, …)
- a `use*Sync(userId)` hook that opens the Firestore listener
- convenience hooks (`useWorkoutPlans()`, `useMealPlansLoading()`, …)

**The sync hooks are called once, in `AppContent`**, not per screen. That is
the whole point: one `onSnapshot` per collection for the entire app. They are
passed `firebaseUser?.uid` and no-op while it is undefined, because the
queries filter on `userId` and the security rules reject them without it.

Use the typed wrappers in `src/Store/hooks.ts` (`useAppDispatch`,
`useAppSelector`), never the bare react-redux hooks.

### Serializability exemptions

`serializableCheck.ignoredPaths` exempts `workoutPlans.plans`,
`mealPlans.plans` and `userProfile.profile`. Those objects carry real `Date`
values, converted from Firestore `Timestamp`s inside the services, rather
than being re-serialized on every snapshot.

---

## Firestore data model

Six top-level collections. There are **no subcollections** — everything is
flat and scoped by a `userId` field.

### ID strategy

Two patterns, chosen per collection:

- **Deterministic IDs** for anything that is "one thing per day": writing the
  same day twice overwrites rather than accumulating, and reading it is a
  single `getDoc` instead of a query.
- **Auto IDs** (`addDoc`) for plans, which are open-ended collections.

| Collection | ID | Shape |
|---|---|---|
| `userProfiles` | `{uid}` | One per user |
| `workoutPlans` | auto | Recurring rule |
| `workoutLogs` | `{userId}_{planId}_{date}` | One per (user, plan, day) |
| `mealPlans` | auto | Recurring rule |
| `mealLogs` | `{userId}_{planId}_{date}` | One per (user, plan, day) |
| `telemetry` | `{userId}_{date}` | One per (user, day) |

`date` is always `"YYYY-MM-DD"` in the **device's local timezone**.

### `userProfiles/{uid}`

Keyed by the Firebase uid itself rather than an auto-id, so "has this user
onboarded?" is one `getDoc()` on every cold start.

```ts
interface UserProfile {
  userId: string;
  // ── ProfileAnswers (collected in onboarding) ──
  displayName: string;
  phoneNumber: string;            // unverified, no OTP — do not trust as contact
  gender: Gender;
  age: number;                    // years
  heightCm: number;
  weightKg: number;
  goal: FitnessGoal;
  activityLevel: ActivityLevel;
  weeklyPaceKg: WeeklyPace;
  injuries: string[];             // e.g. ['Knees']; empty = injury-free
  dietaryPreferences: string[];   // e.g. ['Gluten-Free']
  // ── DerivedTargets (computed, not asked) ──
  bmr: number;
  tdee: number;
  dailyCalorieTarget: number;
  macros: { proteinG: number; carbsG: number; fatsG: number };
  // ── Set outside onboarding ──
  photoURL: string | null;        // Cloudinary URL
  themeMode: 'light' | 'dark';
  onboardingCompleted: boolean;   // true once step 3 saves
  createdAt: Date | null;
  updatedAt: Date | null;
}
```

**Targets are derived, not stored input.** `deriveTargets(answers)` runs the
chain: Mifflin-St Jeor BMR (`10·kg + 6.25·cm − 5·age + genderOffset`) →
TDEE (`bmr × activityMultiplier`) → calorie target (adjusted by goal and
weekly pace) → macro split.

Every field has a fallback in `toUserProfile()`, because profiles written
before a given field shipped simply lack it. `themeMode` defaults to
`'light'` so an existing user is never silently flipped to dark.

### `workoutPlans/{autoId}`

A plan is a **recurring rule**, not a dated entry.

```ts
interface WorkoutPlan {
  id: string;
  userId: string;
  name: string;
  muscles: string[];
  exerciseIds: string[];          // → Exercise API
  days: DayKey[];                 // which weekdays it recurs on
  time: string;                   // "6:30 PM" — same slot on every day
  status: 'live' | 'draft' | 'paused';
  createdAt: Date | null;
}
```

### `workoutLogs/{userId}_{planId}_{date}`

A **materialized occurrence** of a plan on one date — which is not the same
as a completed session:

- `state: 'completed'` — the user entered numbers and hit Save. Real history.
- `state: 'planned'` — the user changed that day's exercises without logging.

`state` is required with no default, so a call site cannot produce a
completed-looking row by omission.

```ts
interface WorkoutLog {
  id: string; userId: string;
  planId: string;                 // the WorkoutPlan doc id
  planName: string;
  date: string;                   // "YYYY-MM-DD"
  exercises: {
    exerciseId: string;
    name: string;
    sets: ExerciseSetEntry[];     // one record per set, in order
  }[];
  state: 'planned' | 'completed';
  updatedAt: Date | null;
}
```

**Migration handled on read:** entries written before per-set tracking have a
set *count* plus one reps/weight pair (`{ sets: 3, reps: 8, weight: 60 }`).
`toExerciseLogEntry` expands those into three identical set records so
everything downstream sees one shape.

### `mealPlans` / `mealLogs`

Deliberately mirror the workout pair so the two behave identically.

```ts
interface MealPlan {
  id: string; userId: string;
  name: string;
  mealType: MealType;
  items: MealItem[];
  days: DayKey[];
  time: string;                   // "8:30 AM"
  status: 'live' | 'draft' | 'paused';
  createdAt: Date | null;
}

interface MealItem {
  name: string;
  quantity: string;               // a string: users type "1/2" or "2 scoops"
  unit: string;                   // g, ml, scoop, piece…
  nutrition?: MealItemNutrition;  // filled in asynchronously by the AI
}

interface MealItemNutrition {
  calories: number;               // kcal
  protein: number; carbs: number; fat: number; fiber: number; sugar: number;
  confidence: number;             // 0–1, PER ITEM
  estimatedAt?: string;           // ISO — lets a stale figure be spotted
}
```

`MealLog` adds `time` (when it was actually eaten, which can differ from the
plan) and the same `state: 'planned' | 'completed'`.

> `nutrition` is **spread in**, not assigned (`...(entry.nutrition ? {…} : {})`).
> An explicit `nutrition: undefined` key is rejected by Firestore with
> "Unsupported field value" on the next write-back, which the edit path does.

### `telemetry/{userId}_{date}`

Everything the dashboard shows for one day, in one document.

```ts
interface TelemetryDay {
  id: string; userId: string;
  date: string;
  water: { ml: number; time: string }[];     // oldest first
  steps: number | null;
  caloriesBurned: number | null;
  weightKg: number | null;
  sleep: {
    asleepMinutes: number; inBedMinutes: number;
    start: string | null; end: string | null;  // ISO instants
    stages: { deep: number; rem: number; light: number; awake: number } | null;
  } | null;
  updatedAt: Date | null;
}
```

A day is a row, not a stream of events: every consumer asks "what did this
day look like", and one merge-write per metric keeps a day to a single
document however often the pedometer ticks.

**Every metric is nullable, and `null` is not `0`** — nothing has reported it
yet, as opposed to a measured zero. The dashboard shows `—` for the first and
a real value for the second.

Water keeps individual drinks rather than a running total, which preserves
*when* the user drank and lets a mistaken entry be removed without guessing
its size. `ML_PER_GLASS = 250`, `DAILY_GLASS_GOAL = 8` (2 litres).

Writers: `saveWaterEntries` (the user logging a drink), `recordDailyMetrics`
(steps / calories / sleep, written as a by-product of the dashboard being
open, throttled by `shouldWriteMetrics`), and `saveDailyWeight` (a weigh-in;
**nothing calls it yet** — there is no weigh-in UI, so `weightKg` stays null
and the dashboard falls back to the onboarding profile's weight).

> **Replaces `hydrationLogs`**, which held water alone. That collection is
> read-only in `firestore.rules` and is still read once per day, as a
> fallback, so existing water history carries forward the first time an old
> day is opened (`readLegacyWater`). Safe to delete — collection, rule and
> function — once no user has unmigrated days worth keeping.

Pure shape rules (ids, totals, sanitising, the write throttle) live in
`telemetryShape.ts` with no Firestore import, which is what makes them
unit-testable — the same split as `nutritionTotals.ts`.

### Not in Firestore

**Steps are device-local.** There is no `stepLogs` collection — see
[Step counting](#step-counting).

### Security rules

Checked in at `firestore.rules` (wired up by `firebase.json`). Three shared
helpers do most of the work:

| Helper | Meaning |
|---|---|
| `isSignedIn()` | `request.auth != null` |
| `ownsExisting()` | Signed in **and** the stored doc is the caller's |
| `keepsOwnership()` | An update may not reassign `userId` to someone else |

Three subtleties are worth knowing before editing them — all three were bugs
at some point, and the file documents each:

1. **`resource == null` is allowed.** A `get` on a document that does not
   exist still evaluates the rules, with `resource` set to null; reading
   `resource.data` off null fails evaluation and surfaces as "Missing or
   insufficient permissions" rather than an empty result. Every `getDoc()` in
   the app can hit this — `fetchTelemetry`, `fetchMealLog`,
   `fetchWorkoutLog`, `savePlannedOccurrence`. Nothing can leak from a
   document that does not exist.

2. **Docs with no `userId` field are readable.** Documents written before
   per-user scoping lack the field entirely; requiring it would make them
   permanently unreadable. The `where('userId', '==', uid)` filter every
   service uses already excludes them from list queries.
   *Known risk, flagged in the file:* for a **list** query Firestore checks
   the query's constraints rather than reading documents. A plain
   `resource.data.userId == request.auth.uid` pairs provably with that
   `where`; whether the `in` disjunction is accepted the same way is not
   something the docs commit to. If list reads start failing while
   single-document reads work, drop that first branch.

3. **Log document ids are pinned to the caller's uid** on create:
   `logId == request.auth.uid + '_' + planId + '_' + date`. Without this,
   anyone could squat on another user's log id, which would permanently block
   that user from saving that day — their own write would then fail
   `ownsExisting()`. `telemetry` deliberately does **not** pin its id;
   that check is defence-in-depth, not correctness, and the ownership
   conditions are what actually protect the data.

`workoutLogs` and `mealLogs` set `allow delete: if false` — logs are
history and are never removed from the client. `userProfiles` checks
ownership against the **document id** (which is the uid) rather than a field.

---

## Services layer

Everything in `src/Services/` is the I/O boundary. Each exposes a typed API
and its own `*ServiceError` class; none of them throw raw Firebase errors at
screens.

### Firestore-backed

| Module | Responsibility |
|---|---|
| `userProfileService` | Profile CRUD + `deriveTargets()` (BMR/TDEE/macros) |
| `workoutPlanService` | Workout plan CRUD, `onSnapshot` subscription |
| `workoutLogService` | Per-day set/rep/weight log; legacy shape migration |
| `mealPlanService` | Meal plan CRUD, `onSnapshot` subscription |
| `mealLogService` | Meals actually eaten |
| `telemetryService` | One day of dashboard metrics: water, steps, calories, sleep, weight |
| `telemetryShape` | Its pure rules and types — no Firestore import, carries the tests |
| `userService` | `getCurrentUserId()` — the single source of the uid |

`getCurrentUserId()` matters: every per-user write and query calls it rather
than importing a fixed constant, which is what makes the data genuinely
isolated per account.

### External APIs

| Module | Talks to | Notes |
|---|---|---|
| `exerciseService` | Free Exercise DB-compatible host | Catalogue, filters, muscle list, images, `fetchExercisesBulk` |
| `avatarService` | Cloudinary | Pick/shoot → crop → unsigned upload → URL |
| `geminiService` | Google Gemini REST | `generateText`, `generateJson<T>` |
| `openRouterService` | OpenRouter REST | OpenAI-compatible; same two entry points |

Neither AI service uses an SDK — `@google/genai` and `openai` pull in
Node-oriented plumbing that React Native would need polyfilling for, and a
completion is one POST.

### Domain logic (pure or device-local)

| Module | Responsibility |
|---|---|
| `calendarEventService` | Normalizes sources into one `CalendarEvent` shape; expands recurring plans onto a date |
| `progressService` | Turns logged sets into chart data — 1RM estimate, trends, session totals. **Pure**, so charting costs no extra reads |
| `planValidation` | `MAX_PLANS_PER_USER = 10`, `MIN_EXERCISES = 3`, schedule-conflict detection |
| `reminderService` | Local notifications, `REMINDER_LEAD_MINUTES = 15` |
| `nutritionAiService` | Per-item nutrition estimation via OpenRouter |
| `coachService` | A short coaching note from the user's own logged sessions, via Gemini |
| `stepService` | Daily step count — see below |
| `healthConnectSteps` | Android Health Connect reader |

`calendarEventService` currently only knows `CalendarEventType = 'workout'`,
but is explicitly the seam for adding meals, hydration and more.

`nutritionAiService` estimates **per item, not per meal**. Meal and day
totals are summed from those (`sumItemNutrition`) rather than asked for
separately, so a stored total can never disagree with its parts.

---

## Theming

`src/Theme/` holds `colors.ts`, `spacing.ts`, `typography.ts`,
`ThemeContext.tsx` and `themeStorage.ts`.

The colour system is unusual and worth understanding before editing any
screen:

**`colors` is a live view of the active theme.** Reading `colors.background`
before and after a theme switch gives different values from the same import.
That is what lets every screen keep a plain `import { colors }` and still
repaint on a switch.

**Because of that, stylesheets must be wrapped in `themedStyles(() => ({…}))`,
never `StyleSheet.create`.** `themedStyles` registers the factory and rebuilds
its container object in place whenever the mode changes. The returned object
is used exactly like a normal stylesheet — `styles.card` type-checks, works in
arrays and in conditional style props.

```ts
const styles = themedStyles(() => ({
  card: { backgroundColor: colors.surface },
}));
```

**Theme-invariant vs. re-tuned tokens.** Domain and feedback hues carry
meaning (calories are always coral, water always blue) and do not change
between themes. The two brand anchors *are* re-tuned per theme — at their
light-theme saturation they read as unlit against the dark canvas.

**Why the theme lives in root state.** `useThemeState()` is held in `App`,
not inside a provider wrapping opaque children. Screens do not subscribe to
the theme — they read module-level `styles` objects that `themedStyles`
rebuilds behind their backs — so a switch only reaches them if the whole tree
re-renders. A provider re-rendering with an unchanged `children` element
would not do that; root state does.

**The two-tier persistence.** Firestore is the source of truth (it follows
the user between devices) but arrives hundreds of milliseconds into a cold
start, by which time the splash is already on screen. So the mode is also
mirrored to AsyncStorage (`themeStorage.ts`) and read before the first frame;
Firestore corrects it afterwards. This is why `App.tsx` drives the correction
off `profile?.themeMode ?? null` rather than a selector with a `'light'`
fallback — such a selector reads as light while loading, which would put the
flash straight back.

---

## Navigation and screens

There is **no navigation library**. `AppContent` holds
`activeTab: NavTab` in `useState` and renders via a `switch`. Tabs are
`'home' | 'workout' | 'nutrition' | 'schedule' | 'profile'`
(`src/Components/Navigation.tsx`).

A consequence worth knowing: **switching tabs unmounts the previous screen.**
Several hooks rely on this — e.g. `useDailyHydration` notes that the Dashboard
remounts whenever Home is reopened, which covers the "logged water on the
Nutrition tab, went back home" case without any cross-screen invalidation.

| Directory | Contents |
|---|---|
| `Screens/Splash` | Animated splash |
| `Screens/Auth` | `AuthNavigator`, `EmailAuthScreen`, `ForgotPasswordScreen` |
| `Screens/Onboarding` | `AboutYouStep`, `BodyMetricsStep`, `GoalStep`, `ActivityStep`, `OnboardingNavigator`, shared `OnboardingUI` |
| `Screens/Dashboard` | `LiveTelementry` (the metric grid + charts), `TodaysScheduleSlider` (today's workouts and meals, sorted by time) |
| `Screens/Workout` | 27 files — planner, session logger, exercise library, modals, charts |
| `Screens/Nutrition` | `NutritionScreen`, `NewMealPlanModal` |
| `Screens/ScheduleScreen` | 13 files — timeline, week strip, upcoming section |
| `Screens/Profile` | `ProfileScreen`, `SettingsScreen` |

Shared components live in `src/Components/`: `Dialog` (a `useDialog()` host
used instead of `Alert.alert` so confirmations match the app's surfaces),
`Navigation`, `UserAvatar`, `Skeleton`, `TimeDial`, `EquipmentIcon`.

> `LiveTelementry.tsx` is spelled that way in the codebase (missing an `r`).
> It is the Dashboard overview component, exported as `DashboardOverview`.

---

## Feature walkthroughs

### Auth

`emailAuthService` tries **create-first**, then falls back to sign-in. This
is deliberate: checking existence up front runs into Firebase's
email-enumeration protection, which returns an opaque `invalid-credential`.

### Onboarding

Four steps → `deriveTargets()` → one `setDoc` to `userProfiles/{uid}`. The
saved profile is dispatched straight into the store
(`onComplete={saved => dispatch(userProfileReceived(saved))}`), so the
dashboard behind the modal already has it when the gate falls through.

### Workout session logging

`WorkoutDateStrip` picks a date → `calendarEventService.getEventsForDate()`
expands recurring plans onto it → the user logs sets → `workoutLogService`
writes `workoutLogs/{userId}_{planId}_{date}` with `state: 'completed'`.
`progressService` then derives 1RM estimates and trends from that history
without further reads.

### Nutrition

`NutritionScreen` is the only screen that calls the AI services. Meal items
are entered free-form (`quantity` is a string), then `nutritionAiService`
estimates each item's macros via OpenRouter and writes them back onto the
item with a per-item `confidence` and `estimatedAt`.

### Step counting

Two sources, each solving half the problem:

- **Health Connect** (`healthConnectSteps.ts`) knows the true daily total —
  steps taken while the app was closed, merged across every app that records
  them. But it is a **datastore you query, with no push and no per-step
  callback**; its providers batch writes, so it lags by seconds to minutes.
- **The pedometer** (`expo-sensors`, `TYPE_STEP_COUNTER`) fires the instant a
  step is taken, but Expo's native module subtracts a baseline captured at
  subscribe time and hands JS only the count *since this subscription* —
  it has no idea what happened before the app opened.

So `stepService.ts` combines them: Health Connect supplies the baseline, the
pedometer supplies movement since that baseline, and the card shows the sum.
The baseline re-reads every `BASELINE_RESYNC_MS` (90s); because the refreshed
total already contains the steps the pedometer was tracking, the live offset
is reset **in the same operation** — that hand-off is the one place this could
double-count.

iOS skips all of it: Core Motion's `getStepCountAsync` answers the daily
question directly, so a pedometer tick just triggers a re-query.

Readings are tagged so the UI can be honest:

| `source` | Meaning |
|---|---|
| `'device'` | True daily total (Health Connect or Core Motion) |
| `'session'` | Fallback AsyncStorage ledger. **Undercounts** — closed-app steps are unrecoverable |
| `'unavailable'` | Nothing worked; `unavailableReason` says which of `'platform' \| 'no-hardware' \| 'permission'` |

`aggregateRecord` is used rather than `readRecords` deliberately — aggregation
de-duplicates overlapping records, whereas summing by hand double-counts a
user with two apps both writing steps.

The ledger is cleared on sign-out alongside the theme cache
(`ProfileScreen`), so the next account does not inherit these steps.

---

## Native modules and build requirements

`app.json` declares:

```jsonc
"android": {
  "permissions": [
    "android.permission.ACTIVITY_RECOGNITION",      // pedometer
    "android.permission.health.READ_STEPS"          // Health Connect
  ]
},
"plugins": [
  "expo-notifications",
  ["expo-image-picker",   { "photosPermission": "…", "cameraPermission": "…" }],
  ["expo-sensors",        { "motionPermission": "…" }],
  "react-native-health-connect",
  ["expo-build-properties", { "android": { "minSdkVersion": 26 } }]
]
```

`minSdkVersion: 26` is a Health Connect requirement.
`react-native-health-connect`'s own manifest declares only the `<queries>`
entry for `com.google.android.apps.healthdata` — `READ_STEPS` is ours to
declare. `expo-sensors` does merge `ACTIVITY_RECOGNITION` in from its own
manifest; it is listed explicitly so both motion grants are visible together.

### What does *not* work in Expo Go

| Feature | Why |
|---|---|
| Health Connect | Native module, not bundled in Expo Go |
| Motion permission | Expo Go has a fixed prebuilt manifest, so `app.json` permissions never reach it — the request auto-denies |
| Notifications | `expo-notifications` cannot run in Expo Go on Android |

Run `npm run build:dev` for any of these. On Android 9–13 the user also needs
the Health Connect app from the Play Store; on Android 14+ it is part of the
OS.

---

## Conventions

- **Screens never import `firebase/firestore`.** Go through a service.
- **Never `StyleSheet.create`.** Use `themedStyles` or dark mode breaks.
- **Never bare `useSelector`/`useDispatch`.** Use `src/Store/hooks.ts`.
- **Never `Alert.alert`.** Use `useDialog()` from `src/Components/Dialog`.
- **Never a hardcoded user id.** Call `getCurrentUserId()`.
- Dates crossing the Firestore boundary are `"YYYY-MM-DD"` strings in device
  local time; times are `"8:30 AM"`.
- Services convert `Timestamp` → `Date` on read and never leak Firestore
  types upward.
- Every reader normalizes missing fields with a fallback, because documents
  written before a field shipped simply lack it.
- Source files carry long explanatory comments about *why*, not *what*.
  They are the real documentation — keep them current when changing
  behaviour.
- `.tsx` files in this repo use **CRLF** line endings.

---

## Known gaps and disabled features

**Reminders are commented out** in `App.tsx` (`useReminderSync`, the
`expo-notifications` import and the notification handler). `expo-notifications`
cannot run in Expo Go on Android, so the feature is switched off entirely
rather than left half-working. `reminderService.ts` and
`Store/useReminderSync.ts` are complete and unused. To re-enable: uncomment
both blocks and run a dev build.

**Two screens are swapped out for presentational replacements**, imports kept
in place as comments:

| Commented out | Currently rendered | Why |
|---|---|---|
| `Screens/ScheduleScreen/Schedule` (Firestore-backed) | `ScheduleSession` | New design's data layer not wired |
| `Screens/Workout/WorkoutPlanner` (plan builder) | `WorkoutSession` | Same |

Both are intact, not deleted — swap the import back once the new designs have
their data layer.

**Dashboard cards are still partly hardcoded.** `LiveTelementry` reads steps,
water, sleep, calories burned, body weight and the calorie budget live, but
`weeklyAvgKcal`, `monthlyGoalPercent` and `WEEK_ACTIVITY` are still prop
defaults, not real data.

**NativeWind and `react-native-gifted-charts` are installed but unused** —
charts are hand-drawn with `react-native-svg`.

**Other open items** are tracked in `src/Task.daily.txt`.
