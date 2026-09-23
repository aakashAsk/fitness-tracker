# PulseFit — Implementation Backlog

Derived from `docs/architecture/GAPS_REPORT.md`. Ordered so every task depends only on tasks above it.
Conventions are non-negotiable and come from `README.md:696-712`: screens never import `firebase/firestore`; no `StyleSheet.create` (use `themedStyles`); no bare `useSelector`/`useDispatch` (use `src/Store/hooks.ts`); no `Alert.alert` (use `useDialog()`); never a hardcoded uid (use `getCurrentUserId()`); dates crossing Firestore are `"YYYY-MM-DD"` device-local strings; `.tsx` files use CRLF.

There is no test runner in `package.json`. "Tests" below therefore means a manual verification script plus, where a task adds pure logic, a small pure-function harness — see T-000.

---

## T-000: Add a minimal test runner for pure service logic   [P1] [S] [status: done]
Feature: cross-cutting
Depends on: none
Goal: Make the pure parts of `src/Services` verifiable without a device, so every later task can ship with an automated acceptance check instead of a manual one.
Data: none
Files:
  modify: `package.json` (add `"test": "node --test"` and `devDependencies.tsx` or use `node --experimental-strip-types`)
  create: `src/Services/__tests__/progressService.test.ts` (one seed test against the existing `estimateOneRepMax`)
Steps:
  1. Add `"test": "node --test src/**/*.test.ts"` to `scripts`. Node 24 is present locally and strips TypeScript types natively — confirm with `node --test` on a trivial file before adding a transpiler dependency.
  2. Write one test for `estimateOneRepMax` (`src/Services/progressService.ts:22`) covering: `weight <= 0` → 0, `reps <= 1` → weight unchanged, Epley case `60kg × 10 reps` → 80.
  3. Do not attempt to test anything that imports `src/Firebase/firebaseConfig.ts` — it initializes the SDK at module load. Keep tests to pure modules only.
Acceptance criteria:
  - [ ] `npm test` exits 0 and reports at least 3 passing assertions
  - [ ] No new runtime dependency added (devDependencies only, or none)
Tests: the seed test itself
Risks / notes: If native TS stripping proves unreliable for this repo's syntax, stop and use `tsx` as a devDependency rather than adding Jest — Jest with React Native presets is a multi-hour setup and is out of scope here.
Evidence: `package.json` has no `test` script; `src/Services/progressService.ts:1-4` is explicitly pure ("Everything here is pure").
Result: Added `"test": "node --test src/**/__tests__/*.test.ts"` to `package.json` scripts (no new dependency). Confirmed native TS stripping works on Node v24.19.0 with a trivial test before writing the real one; test imports must use explicit `.ts` extensions for ESM resolution to work (`import { estimateOneRepMax } from '../progressService.ts'`) — note this for every later `*.test.ts` file. Created `src/Services/__tests__/progressService.test.ts` with 3 tests: weight<=0 -> 0, reps<=1 -> weight unchanged, 60kg x 10 reps -> 80 (Epley). `npm test` output: "tests 3", "pass 3", "fail 0", exit 0. Acceptance criteria: [x] npm test exits 0 with >=3 passing assertions [x] no new runtime/dev dependency added.

---

## T-001: Wire the Nutrition calorie/macro card to real meal logs and profile targets   [P0] [M] [status: done]
Feature: F-011
Depends on: T-000
Goal: The Nutrition tab's headline card shows the signed-in user's actual consumed calories and macros for the selected date, against their own derived targets — instead of the literals 2200 / 1310 / 650.
Data: `mealLogs/{uid}_{planId}_{date}` (fields: `items: MealItem[]` each with optional `nutrition: MealItemNutrition`, `state: 'planned'|'completed'`) | data status: UNVERIFIED (writer proven at `src/Hooks/useDayMeals.ts:196-217`) | evidence L1. Targets from `userProfiles/{uid}` → `DerivedTargets` (`calorieTarget`, `proteinG`, `carbsG`, `fatsG`), already in the Redux store.
Files:
  modify: `src/Hooks/useDayMeals.ts` — add a `totals` field to `UseDayMealsResult` (interface at `:38`)
  modify: `src/Screens/Nutrition/NutritionScreen.tsx` — delete `MACROS` (`:39-43`) and `calorieTotal`/`calorieConsumed`/`calorieBurned` (`:185-187`); feed the card from the hook + profile selector
  modify: `src/Screens/Nutrition/CalorieMacroCard.tsx` — accept a nullable/loading shape
  create: `src/Services/__tests__/nutritionTotals.test.ts`
Steps:
  1. In `useDayMeals.ts`, compute `totals` by summing `sumItemNutrition(log.items)` (`src/Services/mealPlanService.ts:132`) over logs with `state === 'completed'` only. Planned meals are not eaten — the `MealLogState` distinction exists precisely for this (`src/Services/mealLogService.ts:36-38`).
  2. Preserve `sumItemNutrition`'s null contract: it returns `null` when no item carries an AI estimate, to distinguish "no data yet" from "genuinely zero" (documented at `mealPlanService.ts:129`). Propagate that null; do not coerce to 0.
  3. Add a `selectDerivedTargets` selector to `src/Store/userProfileSlice.ts` following the existing selector pattern in that file. Targets come from the profile, never recomputed in the screen.
  4. In `NutritionScreen.tsx`, pass `calorieTotal = targets.calorieTarget`, `calorieConsumed = totals?.calories`, and macros as `[{label:'Protein', grams: totals?.protein, goalGrams: targets.proteinG, color: colors.protein}, …]` — keep the existing `colors.protein/carbs/fats` mapping from the deleted literal.
  5. `calorieBurned`: reuse the pedometer-derived value. `src/Screens/Dashboard/LiveTelementry.tsx:149` already does `stepData.caloriesBurned` via `useDailySteps`. Call `useDailySteps()` in `NutritionScreen` the same way rather than duplicating the derivation. When steps are unavailable, render `—`, not 0 (match `LiveTelementry.tsx:262`).
  6. Only show burn for today: `isToday` already exists at `NutritionScreen.tsx:70`. Steps are device-local with no history, so a past date must show `—` for burn rather than today's number.
Acceptance criteria:
  - [ ] With zero meal logs on the selected date, the card shows `—` (not 0) for consumed and macros, and the real `calorieTarget` for the goal
  - [ ] After logging a meal whose items have AI nutrition, consumed calories equal the sum of those items' `calories`, rounded as `sumItemNutrition` rounds
  - [ ] A `state: 'planned'` meal does **not** move the consumed figure
  - [ ] Switching the date strip to yesterday recomputes consumed from that day's logs and shows `—` for burned
  - [ ] `grep -n "2200\|1310\|650" src/Screens/Nutrition/NutritionScreen.tsx` returns nothing
Tests: `src/Services/__tests__/nutritionTotals.test.ts` — sum over mixed planned/completed logs, all-unestimated → null, partial estimates.
Risks / notes: Items estimated at different times can be re-estimated; `nutritionAiService.ts:155` notes estimates are stored so a meal does not get different calories each save. Do not trigger re-estimation from this read path.
Evidence: `src/Screens/Nutrition/NutritionScreen.tsx:39-43,185-187,281-287`; `src/Services/mealPlanService.ts:109-170`; `src/Services/userProfileService.ts:62-72`; `src/Hooks/useDayMeals.ts:38,196-258`.
Result: `useDayMeals` now exposes `totals: NutritionTotals | null`, summed via `sumItemNutrition` over only `state === 'completed'` rows for the selected date (planned rows excluded). Extracted `MealItem`/`MealItemNutrition`/`NutritionTotals`/`sumItemNutrition` out of `mealPlanService.ts` into a new pure module `src/Services/nutritionTotals.ts` (re-exported from `mealPlanService.ts` unchanged) so the logic is testable without importing `firebaseConfig` — this is a structural prerequisite T-000 flagged and applies to every later `Services/__tests__` file that needs a pure dependency. Added `selectDerivedTargets` to `src/Store/userProfileSlice.ts` (profile's `dailyCalorieTarget`/`macros.{proteinG,carbsG,fatsG}` — note actual field names differ from the task's `calorieTarget`/`proteinG` at top level; adapted, minor drift). `NutritionScreen.tsx` now derives `calorieTotal`/`calorieConsumed`/macros from `totals` + `targets`, and `calorieBurned` from `useDailySteps()`, showing `null` (rendered as `—` by `CalorieMacroCard`) whenever `!isToday` or steps are loading/unavailable. `CalorieMacroCard` and its `Macro` prop now accept `number | null` throughout and render `—` for null.
Evidence of verification: `npm test` → 6/6 passing (`src/Services/__tests__/progressService.test.ts`, `src/Services/__tests__/nutritionTotals.test.ts` — null-when-no-estimate, sum-with-mixed-estimated, completed-only). `grep -n "2200\|1310\|650" src/Screens/Nutrition/NutritionScreen.tsx` → no matches. `node --stack-size=8000 ./node_modules/typescript/lib/tsc.js --noEmit` → same 28 pre-existing errors before and after this change (confirmed via `git stash`/`git stash pop` diff — all in `WorkoutSession.tsx` (dead-code chain, T-012), `MealLogsCard.tsx`/`NutritionScreen.tsx:332` (pre-existing `MealType` narrowing gap, not touched by this task) and the two test files (missing `@types/node`, pre-existing since T-000) — none introduced by T-001.
Deviations: profile field names are `dailyCalorieTarget` and `macros.{proteinG,carbsG,fatsG}`, not the flat `calorieTarget`/`proteinG`/etc the task text assumed — adapted in the selector, which normalizes the shape for callers. Could not manually verify on-device/emulator states (no Firebase emulator or device session available in this environment); acceptance criteria for zero-logs/—, completed-vs-planned exclusion, and date-switch recompute are proven at the unit level (`sumItemNutrition`, `useDayMeals`'s completed-only filter) and via code review of the render paths, not a live walkthrough.

---

## T-002: Wire the Dashboard calorie budget and macro ring to real data   [P0] [S] [status: done]
Feature: F-010
Depends on: T-001
Goal: The Dashboard's calorie budget ring and macro bars reflect today's real intake and the user's real targets, reusing the aggregation T-001 introduces.
Data: same as T-001 | UNVERIFIED | L1
Files:
  modify: `src/Screens/Dashboard/LiveTelementry.tsx` — remove `DEFAULT_MACROS` (`:52-56`) and the defaults `calorieBudgetTotal = 2100`, `calorieBudgetConsumed = 1420`, `macros = DEFAULT_MACROS` (`:111-113`); drop those three props from `DashboardOverviewProps` (`:47-49`)
Steps:
  1. Call the T-001 aggregation for `todayDateKey()` inside `LiveTelementry` rather than threading props — this matches how steps, hydration and sleep are already handled there (`:124`, `:140`, `:157` all read their own source and the props were removed with an explanatory comment; follow that exact precedent, including leaving a comment saying why the prop is gone).
  2. Read targets from the same `selectDerivedTargets` selector added in T-001.
  3. Loading state: use `SkeletonBlock`/`SkeletonGroup` from `src/Components/Skeleton.tsx`, as `WorkoutProgressCard.tsx:14` does. Empty state: `—` with the ring at 0, matching the steps-unknown treatment at `:262`.
Acceptance criteria:
  - [ ] `DashboardOverviewProps` no longer declares `calorieBudgetTotal`, `calorieBudgetConsumed` or `macros`
  - [ ] A brand-new account with no meal logs sees `—` and an empty ring, not 1420/2100
  - [ ] Logging a meal on the Nutrition tab and returning Home shows the updated figure (the tab switch unmounts and remounts the Dashboard — `README.md:556-560` — so no cross-screen invalidation is needed)
Tests: covered by T-001's unit tests; verify the two states manually on device.
Risks / notes: Do not add a Redux slice for this. The remount-on-tab-switch behaviour is load-bearing and already relied on by `useDailyHydration`.
Evidence: `src/Screens/Dashboard/LiveTelementry.tsx:36-66,107-113,124,140,149,157`; `App.tsx:182`.
Result: Removed `DEFAULT_MACROS`, and the `bodyWeightKg`/`bodyWeightDeltaKg` stayed (T-007) but `calorieBudgetTotal`/`calorieBudgetConsumed`/`macros` props and their defaults (2100/1420/DEFAULT_MACROS) are gone from `DashboardOverviewProps` and the component signature. `DashboardOverview` now calls `useDayMeals(new Date())` and `selectDerivedTargets` directly — same aggregation T-001 introduced — memoizing `today` with `useMemo` so the hook doesn't re-fetch every render. Loading state (`!hasLogsForDay || !targets`) renders `SkeletonBlock` placeholders for the ring and macro rows, matching `WorkoutProgressCard`'s precedent. A day with `hasLogsForDay` true but `totals === null` (no completed logs, or none estimated) renders "No meals logged today", `—` in the ring, and 0-width macro fills rather than fabricated grams. No new Redux slice added — confirmed no other importer of `DashboardOverview` passes the removed props (only `App.tsx` renders it, with no calorie/macro props).
Verification: `npm test` → 6/6 pass (no regression). `node --stack-size=8000 ./node_modules/typescript/lib/tsc.js --noEmit` → same pre-existing 28 errors as T-001's baseline, none in `LiveTelementry.tsx`. `grep -n "2100\|1420\|DEFAULT_MACROS" src/Screens/Dashboard/LiveTelementry.tsx` → no matches. Could not manually verify the brand-new-account and post-meal-log states on device/emulator (none available in this environment) — verified by code review that the loading/empty/populated branches match `useDayMeals`'s documented null contract from T-001.
Deviations: none beyond T-001's field-name adaptation, reused here via the same `selectDerivedTargets` selector.

---

## T-003: Persist Settings preferences to the user profile   [P1] [M] [status: todo]
Feature: F-014
Depends on: T-000
Goal: The six non-theme toggles in Settings survive a screen close and a reinstall, stored on the user's profile document the same way `themeMode` already is.
Data: `userProfiles/{uid}` — add `preferences: { workoutReminders: boolean, mealReminders: boolean, weeklyDigest: boolean, biometricLock: boolean, voiceCoach: boolean, autoRest: boolean, haptics: boolean }`, all optional with defaults. | data status: NO-WRITER today | L1
  Example document fragment:
  ```json
  { "userId": "<uid>", "themeMode": "dark",
    "preferences": { "workoutReminders": true, "mealReminders": true,
                     "weeklyDigest": false, "biometricLock": false,
                     "voiceCoach": true, "autoRest": true, "haptics": true } }
  ```
Rules: **no change required.** `firestore.rules` `match /userProfiles/{profileId}` already allows any write where `profileId == request.auth.uid` and `request.resource.data.userId == request.auth.uid`. Do not edit the rules file for this task.
Index: none.
Files:
  modify: `src/Services/userProfileService.ts` — add `saveUserPreferences(partial)`, copying `saveUserThemeMode` at `:332` exactly (same `setDoc`+merge shape, same `UserProfileServiceError` wrapping)
  modify: `src/Store/userProfileSlice.ts` — add `userPreferencesUpdated` action, mirroring `userThemeModeUpdated`
  modify: `src/Screens/Profile/SettingsScreen.tsx` — replace `useState(DEFAULT_TOGGLES)` (`:186`) and `flip` (`:189`) with store-backed state + optimistic write
Steps:
  1. Extend `UserProfile` (`userProfileService.ts:72`) with `preferences?`. Normalize missing fields on read with defaults, per the repo's "every reader normalizes missing fields" convention (`README.md:707`).
  2. Implement `saveUserPreferences` as a merge write of only the changed key, so two devices toggling different preferences do not clobber each other.
  3. In `SettingsScreen`, follow the exact optimistic pattern `applyTheme` uses (`:203-222`): repaint first, write second, roll back and `dialog.show()` on failure. The rationale comment there applies verbatim to these switches.
  4. Guard on `hasProfile` (`:195`) the same way — pre-onboarding there is no document to merge into.
  5. Update the notice text at `:241-246` and the footer at `:312` ("Preferences coming soon") to reflect what is now actually stored. Leave the still-unimplemented `kind: 'value'` rows described honestly.
Acceptance criteria:
  - [ ] Toggling "Weekly progress digest", leaving Settings, and returning shows the new value
  - [ ] Force-quitting and reopening the app preserves all six toggles
  - [ ] With the network off, the switch flips, then reverts and shows a dialog
  - [ ] Signing out and into a different account shows that account's preferences, not the previous one's
Tests: unit-test the read normalizer (missing `preferences` → all defaults; partial `preferences` → merged with defaults).
Risks / notes: Persisting a toggle is not the same as honouring it. `biometricLock`, `voiceCoach`, `autoRest` and `haptics` will still do nothing — say so in the notice text rather than implying otherwise. See Open Question 5 in the gap report.
Evidence: `src/Screens/Profile/SettingsScreen.tsx:127-170,186-190,203-222,241-246,312`; `src/Services/userProfileService.ts:332`.

---

## T-004: Honour the reminder preferences, fix the double notification, and correct the stale disablement comment   [P1] [M] [status: todo]
Feature: F-013
Depends on: T-003
Goal: Workout reminders fire once (not twice), and only when the user's `workoutReminders` preference is on.
Data: reads `preferences.workoutReminders` from `userProfiles/{uid}` (T-003); schedules are device-local via `expo-notifications`. | L1
Files:
  modify: `src/Store/useReminderSync.ts`, `src/Services/reminderService.ts`, `App.tsx:51-74`
Steps:
  1. Reproduce the double-fire recorded in `src/Task.daily.txt:11`. The likeliest cause is `useReminderSync` re-running its scheduling effect and calling `scheduleNotificationAsync` again without cancelling the prior identifier — verify by logging `getAllScheduledNotificationsAsync()` before and after a plan edit. Fix by cancelling by a deterministic identifier derived from `(planId, date)` before scheduling, mirroring the deterministic-doc-id strategy the services already use.
  2. Gate `useReminderSync(hasSession)` (`App.tsx:160`) on the preference: pass `hasSession && preferences.workoutReminders`, and cancel all scheduled reminders when it flips off.
  3. **Delete the stale comment block at `App.tsx:51-60`.** It claims the feature is commented out; the code directly beneath it is live. Update `README.md`'s "Known gaps" section to match.
  4. Requires a dev build — `expo-notifications` does not work in Expo Go on Android (`README.md:682-694`). Run `npm run build:dev`.
Acceptance criteria:
  - [ ] With a plan scheduled 20 minutes out, exactly one notification arrives at `REMINDER_LEAD_MINUTES` (15) before it
  - [ ] Editing that plan's time does not produce a second notification for the old time
  - [ ] Turning "Workout reminders" off cancels pending reminders; `getAllScheduledNotificationsAsync()` returns none for that plan
  - [ ] No comment in `App.tsx` claims reminders are disabled
Tests: manual on a dev build; log `getAllScheduledNotificationsAsync()` at each step and paste counts into the PR.
Risks / notes: Cannot be verified in Expo Go at all. Do not mark done from a Metro/Expo Go session.
Evidence: `App.tsx:51-74,160`; `src/Task.daily.txt:1,11`; `src/Services/reminderService.ts`; `README.md` Known gaps.

---

## T-005: Add a daily metrics rollup collection (unblocks all history charts)   [P1] [M] [status: todo]
Feature: F-015, F-016, F-017
Depends on: T-000
Goal: Persist one document per user per day capturing steps, calories burned and body weight, so the app has any history at all to chart. This is the prerequisite for three UI-only Dashboard features; none of them can become real without it.
Data: **new collection** `dailyMetrics/{uid}_{date}` — deterministic id, matching the existing `hydrationLogs` pattern.
  | field | type | required | notes |
  |---|---|---|---|
  | `userId` | string | yes | required by every rule in this project |
  | `date` | string | yes | `"YYYY-MM-DD"`, device-local |
  | `steps` | number | no | daily total at time of write |
  | `stepSource` | `'device'\|'session'\|'unavailable'` | no | carry `stepService`'s honesty tag forward; a `'session'` total undercounts and must not be charted as truth |
  | `caloriesBurned` | number | no | derived from steps |
  | `bodyWeightKg` | number | no | only present on days the user logged a weight |
  | `updatedAt` | Timestamp | yes | converted to `Date` on read, per convention |

  Example: `{"userId":"abc123","date":"2026-09-19","steps":8421,"stepSource":"device","caloriesBurned":337,"updatedAt":<Timestamp>}`
  Current data status: **does not exist** (no `stepLogs` or equivalent — `README.md:397-400` states steps are deliberately device-local).
Rules: proposed addition to `firestore.rules` — **do not deploy as part of this task; open it as a separate reviewed change.** Model it on the `hydrationLogs` block, which is the closest analogue (one doc per user per day, read-before-first-write every day, `resource == null` therefore allowed):
```
    match /dailyMetrics/{metricId} {
      allow read: if isSignedIn() &&
                     (resource == null ||
                      resource.data.userId == request.auth.uid);
      allow write: if isSignedIn() &&
                      (resource == null ||
                       resource.data.userId == request.auth.uid) &&
                      request.resource.data.userId == request.auth.uid;
    }
```
Index: a range query over `date` combined with `where('userId','==',uid)` **will** need a composite index on `(userId ASC, date ASC)`. `firestore.indexes.json` is currently `{"indexes":[],"fieldOverrides":[]}`; proposed entry (again, propose, do not deploy):
```json
{ "collectionGroup": "dailyMetrics", "queryScope": "COLLECTION",
  "fields": [{"fieldPath":"userId","order":"ASCENDING"},
             {"fieldPath":"date","order":"ASCENDING"}] }
```
Files:
  create: `src/Services/dailyMetricsService.ts` — copy the structure of `src/Services/hydrationLogService.ts` wholesale (deterministic `dailyMetricsDocId(userId, date)`, `DailyMetricsServiceError`, `Timestamp`→`Date` on read, field-by-field normalization on read)
  create: `src/Services/__tests__/dailyMetrics.test.ts`
  modify: `src/Hooks/useDailySteps.ts` — write the rollup when a reading settles
Steps:
  1. Write `dailyMetricsService` with `fetchDailyMetrics(date)`, `fetchDailyMetricsRange(startDate, endDate)`, and `upsertDailyMetrics(partial)` (merge write).
  2. Call `upsertDailyMetrics` from `useDailySteps` when a reading with `source === 'device'` settles, throttled to at most once per `BASELINE_RESYNC_MS` so a 90-second pedometer cadence does not become a 90-second write cadence.
  3. **Never write when `source === 'session'` or `'unavailable'`** — a session-ledger total undercounts (`README.md:630-635`) and writing it would poison the history permanently with a number that cannot be corrected.
  4. Because the write happens only while the app is open, days the user never opens the app will have no document. The readers in T-006 must treat a missing day as "no data", not zero.
Acceptance criteria:
  - [ ] Opening the app with Health Connect available creates/updates exactly one `dailyMetrics/{uid}_{today}` document
  - [ ] In Expo Go (steps unavailable) **no** document is written
  - [ ] Reopening the app the same day updates `updatedAt` and `steps` on the same document rather than creating a second one
  - [ ] `fetchDailyMetricsRange` over a 7-day window returns only the current user's documents
Tests: unit-test the doc-id builder and the read normalizer; manual device check for the write path.
Risks / notes: This adds a recurring write per user per app-open. That is within free-tier limits at this scale but should be throttled as described. Answer Open Question 3 in the gap report before starting — if the product does not want history, T-006 and T-007 should be cut instead, and the charts removed from the UI rather than faked.
Evidence: `src/Screens/Dashboard/LiveTelementry.tsx:58-66,473`; `src/Services/stepService.ts`; `README.md:397-400,616-654`; `firestore.indexes.json`.

---

## T-006: Replace the hardcoded weekly activity chart with real history   [P1] [S] [status: todo]
Feature: F-015, F-017
Depends on: T-005
Goal: The Dashboard's 7-bar week chart, its "Avg. N kcal / day" subtitle, and the monthly goal gauge are computed from stored daily metrics.
Data: `dailyMetrics/{uid}_{date}` over a 7-day and a month-to-date window | data status after T-005: PRESENT going forward, EMPTY for all history before T-005 ships | L1
Files:
  modify: `src/Screens/Dashboard/LiveTelementry.tsx` — delete `WEEK_ACTIVITY` (`:58-66`) and the `weeklyAvgKcal = 485` / `monthlyGoalPercent = 89` defaults (`:109-110`) and their props (`:44-45`)
  create: `src/Hooks/useWeeklyActivity.ts` — follows the shape of `src/Hooks/useDailySteps.ts` (loading flag, no throw to the UI)
Steps:
  1. `useWeeklyActivity` fetches the last 7 days via `fetchDailyMetricsRange` and returns `{ days: {day: string, kcal: number|null}[], avgKcal: number|null, loading: boolean }`. Average over days that have data only — do not let missing days drag the mean toward zero.
  2. Bar height = `kcal / max(kcal in window)`, preserving the existing `peak` highlight behaviour at `:473`. A day with no data renders an empty track, visually distinct from a zero-activity day.
  3. Monthly gauge = days-with-activity in the current month ÷ days elapsed, or a stored goal if Open Question 3 resolves toward one. Whatever the formula, put it in the hook with a comment explaining the choice — this repo documents *why* (`README.md:709`).
  4. Empty state: for the first week after T-005 ships there will be almost no data. Render a short "Your week fills in as you move" message rather than a chart of empty bars.
Acceptance criteria:
  - [ ] `grep -n "WEEK_ACTIVITY\|485\|89" src/Screens/Dashboard/LiveTelementry.tsx` returns nothing
  - [ ] A fresh account sees the empty-state message, not seven bars
  - [ ] After two days with recorded steps, exactly two bars have height and the average equals their mean
  - [ ] A day the app was never opened renders as an empty track, not a zero bar
Tests: unit-test the windowing/averaging helper with gaps in the range.
Risks / notes: Do not backfill. There is no source to backfill from — Health Connect can supply past daily totals, but reading them retroactively is a separate, larger task and should not be smuggled into this one.
Evidence: `src/Screens/Dashboard/LiveTelementry.tsx:44-45,58-66,109-110,457-473,532-537`.

---

## T-007: Body weight logging and a real weight metric   [P1] [M] [status: todo]
Feature: F-016
Depends on: T-005
Goal: The Dashboard's body-weight tile shows the user's most recently logged weight and a real delta, and the user has a way to log a new weight.
Data: `dailyMetrics/{uid}_{date}.bodyWeightKg` (T-005) | NO-WRITER today | L1
Files:
  modify: `src/Screens/Profile/ProfileScreen.tsx` — add a "Log weight" action near the existing profile actions
  modify: `src/Screens/Dashboard/LiveTelementry.tsx` — remove `bodyWeightKg = 68.4` and `bodyWeightDeltaKg` (`:42-43`, `:107`, `:318`)
  modify: `src/Services/userProfileService.ts` — update the profile's `weightKg` alongside the daily metric, so `deriveTargets` stays honest
Steps:
  1. Add the entry sheet using the existing modal/dialog conventions — `useDialog()` from `src/Components/Dialog.tsx` for confirmation, and follow `BodyMetricsStep.tsx` for the numeric input treatment so the two weight inputs look identical.
  2. On save, write both `dailyMetrics/{uid}_{today}.bodyWeightKg` and the profile's `weightKg`. The profile value feeds BMR/TDEE (`userProfileService.ts:145-199`); leaving it stale would silently drift every calorie target in the app.
  3. Recompute `DerivedTargets` on weight change using the existing `deriveTargets` (`:199`) and persist — do not recompute ad hoc in the UI.
  4. Delta = latest logged weight minus the most recent earlier entry in `dailyMetrics`. With fewer than two entries show no delta at all rather than `0.0`.
Acceptance criteria:
  - [ ] Logging a weight updates the Dashboard tile immediately on return to Home
  - [ ] With exactly one weight ever logged, no delta is rendered
  - [ ] Logging a second, lower weight a day later shows a negative delta
  - [ ] The Nutrition calorie target changes after a significant weight change (verifying `deriveTargets` re-ran)
  - [ ] `grep -n "68.4" src/` returns nothing
Tests: unit-test the delta helper (0 entries, 1 entry, 2+ entries, same-day re-log).
Risks / notes: Re-logging on the same day overwrites rather than appending — the deterministic doc id makes that automatic and is the desired behaviour. Answer Open Question 4 first: if a smart-scale integration is planned to own weight, this manual path may be interim.
Evidence: `src/Screens/Dashboard/LiveTelementry.tsx:42-43,107,318`; `src/Screens/Onboarding/BodyMetricsStep.tsx`; `src/Services/userProfileService.ts:145-199`; `src/Screens/Profile/SettingsScreen.tsx:100-104`.

---

## T-008: Decide and act on the AI coach (Gemini)   [P2] [S] [status: todo]
Feature: F-021
Depends on: T-000
Goal: Either surface the completed coach insight in the UI, or delete it and its Gemini dependency. It currently costs bundle weight and env surface while being unreachable.
Data: reads `workoutLogs` via `fetchWorkoutLogsForUser` (`src/Services/workoutLogService.ts:299`) | UNVERIFIED | L1
Files:
  modify (revive): `src/Screens/Dashboard/LiveTelementry.tsx` or `WorkoutProgressCard.tsx` to host the banner; `src/Screens/ScheduleScreen/AICoachBanner.tsx` is an existing unreachable component that already has the visual treatment
  delete (cut): `src/Services/coachService.ts`, `src/Services/geminiService.ts`, and the `EXPO_PUBLIC_GEMINI_*` entries in `.env.example` and `README.md`
Steps (revive path):
  1. Add a `useCoachInsight()` hook wrapping `fetchCoachInsight(signal)` (`coachService.ts:57`), passing an `AbortSignal` from the effect cleanup — the service already accepts one.
  2. Honour the `null` return: `coachService` deliberately returns null under two sessions of history rather than letting the model invent a trend (`:50-56`). Render nothing at all in that case — no skeleton, no empty card.
  3. Check `isGeminiConfigured()` before calling, and render nothing when unconfigured. Do not surface an API error to the user for a decorative banner.
  4. Cache the result per day so opening the Dashboard does not bill a completion every time.
Acceptance criteria (revive path):
  - [ ] An account with 0 or 1 logged sessions sees no banner and triggers no network call
  - [ ] An account with 3+ sessions sees a headline and detail referencing its own real numbers
  - [ ] With `EXPO_PUBLIC_GEMINI_API_KEY` unset, no banner and no error dialog
  - [ ] Navigating away mid-request aborts it (no state update warning)
Acceptance criteria (cut path):
  - [ ] `grep -rn "gemini\|Gemini" src/ .env.example README.md` returns nothing
  - [ ] App builds and runs unchanged
Tests: unit-test `describeSessions` (`coachService.ts:35`) formatting; mock the model call rather than hitting the API.
Risks / notes: Requires Open Question 2 answered first. `coachService` is well-written and prompt-hardened ("Never invent sessions… Do not give medical advice") — deleting it loses real work, so prefer reviving unless the product has dropped AI coaching.
Evidence: `src/Services/coachService.ts` (whole file, zero importers); `src/Screens/ScheduleScreen/AICoachBanner.tsx` (unreachable).

---

## T-009: Backfill `userId` and tighten the rules' fieldless-document branch   [P3] [M] [status: todo]
Feature: cross-cutting (§6.1)
Depends on: none
Goal: Remove the `!('userId' in resource.data)` escape hatch from `ownsExisting()`, eliminating the list-query risk the rules file documents at length.
Data: all of `workoutPlans`, `workoutLogs`, `mealPlans`, `mealLogs` | data status: UNVERIFIED — **the number of fieldless legacy documents is unknown and must be measured first** | needs L2
Rules: proposed final form of the branch (propose in a reviewed PR; **do not deploy from this task**):
```
    function ownsExisting() {
      return isSignedIn() &&
             (resource == null ||
              resource.data.userId == request.auth.uid);
    }
```
Files:
  create: `scripts/backfill-userid.ts` (Admin SDK, run manually by a human with credentials — not part of the app bundle)
  modify: `firestore.rules` (proposal only)
Steps:
  1. **Measure first.** In the Firebase console, check each of the four collections for documents lacking `userId`. If there are none, the branch can be dropped with no backfill at all and this task collapses to an S.
  2. If any exist, they cannot be attributed to a user from the client. For `workoutLogs`/`mealLogs` the doc id encodes the uid (`{uid}_{planId}_{date}`) so attribution is mechanical. For `workoutPlans`/`mealPlans` (auto ids) there may be no way to attribute them — in that case the honest action is deletion, which needs a human decision.
  3. Run the backfill with the Admin SDK from a trusted environment. Never from the app.
  4. Deploy the tightened rule and verify list queries still succeed — that is the exact failure mode the current comment warns about, in reverse.
Acceptance criteria:
  - [ ] A console query confirms zero documents without `userId` in all four collections
  - [ ] After the rule change, the Workout, Nutrition and Schedule tabs all load a user's data without "Missing or insufficient permissions"
  - [ ] `firestore.rules` no longer contains `!('userId' in resource.data)`, and the now-obsolete explanatory comment is removed with it
Tests: Firestore rules unit tests via `@firebase/rules-unit-testing` against the emulator would be the right long-term answer; at minimum, manual verification of all four collections' list paths.
Risks / notes: **Highest-blast-radius task in this backlog.** A wrong rule locks every user out of their data. Do it behind the emulator first; `firebase.json` currently declares no emulator suite, so adding one is a prerequisite. This is also why it sits at P3 despite being a security item — the current rules are safe, just inelegant.
Evidence: `firestore.rules` `ownsExisting()` and its comment block; `src/Services/workoutPlanService.ts:126` (client-side re-filter that makes the current state safe).

---

## T-010: Bound the unbounded history read   [P3] [S] [status: todo]
Feature: cross-cutting (§6.3)
Depends on: T-000
Goal: `WorkoutProgressCard` stops fetching a user's entire workout history on every mount.
Data: `workoutLogs` where `userId ==` | UNVERIFIED | L1
Files:
  modify: `src/Services/workoutLogService.ts:299` (`fetchWorkoutLogsForUser`), `src/Screens/Workout/WorkoutProgressCard.tsx:57`
Steps:
  1. Add an optional `sinceDate` parameter (default: 90 days back) and apply `where('date','>=',sinceDate)`. Because `date` is a `"YYYY-MM-DD"` string, lexicographic ordering equals chronological ordering — this works as a string range, and that is worth a comment.
  2. A range filter alongside the `userId` equality **requires a composite index** on `(userId ASC, date ASC)`. Add it to `firestore.indexes.json` as a proposal in the same PR; it must be deployed before the code ships or the query fails at runtime.
  3. Confirm `progressService` charting still behaves with a truncated window — the trend is windowed anyway (`progressService.ts:42-46` describes "the window").
Acceptance criteria:
  - [ ] Opening the Workout tab reads at most 90 days of logs (verify via the Firestore usage panel or a read counter log)
  - [ ] The trend graph renders identically for an account with under 90 days of history
  - [ ] The composite index entry exists in `firestore.indexes.json`
Tests: unit-test the date-window helper across a year boundary.
Risks / notes: Ship the index before the code. Deploying the query first produces a hard runtime failure with a console link — recoverable, but user-visible.
Evidence: `src/Services/workoutLogService.ts:299`; `src/Screens/Workout/WorkoutProgressCard.tsx:57`; `firestore.indexes.json` (empty).

---

## T-011: Correct the four stale comments and the README's Known Gaps   [P3] [S] [status: todo]
Feature: cross-cutting (§6.5)
Depends on: T-004 (which removes one of them)
Goal: The documentation stops describing a version of the app that no longer exists. In a repo whose stated convention is that source comments *are* the documentation, these are defects.
Data: none
Files:
  modify: `README.md` (Known gaps section), `src/Services/workoutPlanService.ts:115`, `src/Screens/Workout/WorkoutSession.tsx:62-67`, `App.tsx:32-42`
Steps:
  1. `workoutPlanService.ts:115` — "Needs a composite index on (userId ASC, createdAt DESC)" is false; the query has no `orderBy` and sorts client-side at `:126`. Replace with a note explaining the client-side sort and why.
  2. `WorkoutSession.tsx:64` — "those numbers below are still invented placeholders" is false; `useExerciseInputs.ts:9` starts every set empty. Rewrite to describe the real gap: plans carry no prescribed sets/reps (see T-014).
  3. `README.md` Known gaps — the claim that `ScheduleSession` and `WorkoutSession` are presentational stand-ins with an unwired data layer is false; both are Firestore-backed. Replace with the actual remaining gap: the *old* screens are dead code pending a keep/delete decision.
  4. `App.tsx:32-42` — update the two swap comments to match whatever T-012 decides.
Acceptance criteria:
  - [ ] Each of the four locations describes current behaviour, verifiable by reading the code beside it
  - [ ] README's Known gaps lists the Dashboard/Nutrition hardcoding only if T-001/T-002 have not yet shipped
Tests: none (documentation).
Risks / notes: Do this *after* T-004, which deletes the reminders comment outright.
Evidence: `README.md` Known gaps; `src/Services/workoutPlanService.ts:115`; `src/Screens/Workout/WorkoutSession.tsx:62-67`; `App.tsx:32-42,160`.

---

## T-012: Resolve the 29 unreachable modules   [P2] [M] [status: todo]
Feature: F-022, F-023
Depends on: T-011
Goal: Either delete the two dead screen chains or schedule their revival, so the tree stops containing a third of `src/Screens` that cannot run.
Data: n/a
Files:
  delete (cut path): the 12 Schedule-chain and 15 Workout-planner-chain files listed in GAPS_REPORT §5 F-021/022/023, plus `src/Theme/typography.ts`
  modify: `src/Screens/Workout/Data.ts` — retain the live constants (`DAY_ORDER`, `todayDayKey`, `DURATION_OPTIONS`, `EXERCISE_CATEGORY_FILTERS`, `REMINDER_OFFSET_OPTIONS`), delete `INITIAL_PLANS`/`INITIAL_EXERCISES`/`INITIAL_TRAINING_DAYS`
Steps:
  1. Get Open Question 1 answered. Do not guess.
  2. **If reviving `WorkoutPlanner`: delete `WorkoutPlanner.tsx:69` first.** That line is `[...mapped, ...INITIAL_PLANS]` — it concatenates four invented plans ("Push Pull Legs", "Upper / Lower Split") onto the user's real Firestore plans. Shipping it would show every user fake data they cannot delete. This is the single most dangerous line in the dead branch.
  3. If cutting: delete in one commit per chain so the diff is reviewable, and confirm the reachability walk is clean afterwards.
  4. Either way, remove `ScheduleData.ts`'s `weekDays`/`upcomingItems` — "Downtown Locker #42" is fixture data and has no place in a shipped bundle.
Acceptance criteria:
  - [ ] A module-graph walk from `App.tsx` reports zero unreachable files under `src/Screens`
  - [ ] `npx tsc --noEmit` passes
  - [ ] The app builds and all five tabs render
  - [ ] `grep -rn "Downtown Locker\|Push Pull Legs" src/` returns nothing
Tests: `npx tsc --noEmit`; manual pass over all five tabs.
Risks / notes: If revived rather than cut, each chain becomes its own feature-sized effort and needs re-scoping — treat this task as the decision point, not the implementation.
Evidence: GAPS_REPORT §5 F-021/F-022/F-023; `src/Screens/Workout/WorkoutPlanner.tsx:64-83`; `src/Screens/ScheduleScreen/ScheduleData.ts:6-38`.

---

## T-013: Drop unused dependencies   [P3] [S] [status: todo]
Feature: cross-cutting (§6.6)
Depends on: T-012
Goal: Remove NativeWind/Tailwind and `react-native-gifted-charts` from the bundle, since styling is hand-rolled `themedStyles` and charts are hand-drawn SVG.
Data: n/a
Files:
  modify: `package.json`, `babel.config.js`, `metro.config.js`, `tsconfig.json`; delete `global.css`, `tailwind.config.js`
Steps:
  1. Confirm zero usage after T-012's deletions: `grep -rn "className=\|nativewind\|gifted-charts" src/ App.tsx`.
  2. Remove the NativeWind babel plugin and metro CSS wiring, and any `nativewind-env.d.ts` type reference in `tsconfig.json`.
  3. Rebuild from a cleared cache (`npm run start:clear`) — stale Metro caches will mask a broken babel config.
Acceptance criteria:
  - [ ] `npx tsc --noEmit` passes
  - [ ] App boots from a cleared cache and all five tabs render with correct styling in both light and dark mode
  - [ ] `package.json` no longer lists `nativewind`, `tailwindcss` or `react-native-gifted-charts`
Tests: manual light/dark pass over all five tabs.
Risks / notes: Touching babel/metro config can break the build in ways that only appear after a cache clear. Do it in its own commit so it is trivially revertable.
Evidence: `package.json`; `README.md:41` ("NativeWind is installed but unused") and Known gaps.

---

## T-014: Add prescribed sets/reps to the workout plan model   [P1] [M] [status: todo]
Feature: F-024
Depends on: T-012
Goal: A plan can specify a target (e.g. 3 × 8-10 @ 60kg) per exercise, so the session logger shows what to aim for instead of only capturing what happened.
Data: `workoutPlans/{autoId}` — replace `exerciseIds: string[]` with a richer `exercises` array while continuing to read the legacy field.
  | field | type | required | notes |
  |---|---|---|---|
  | `exercises` | array | no | new; `[{ exerciseId: string, targetSets: number, targetReps: string, targetWeightKg?: number, restSeconds?: number }]` |
  | `exerciseIds` | string[] | no | legacy; keep writing it for one release so older clients keep working |

  Example: `{"exercises":[{"exerciseId":"Barbell_Bench_Press","targetSets":3,"targetReps":"8-10","targetWeightKg":60,"restSeconds":90}]}`
  Data status: field absent from every existing document | UNVERIFIED | L1
Rules: no change — `workoutPlans` rules check only `userId`, not shape.
Index: none.
Files:
  modify: `src/Services/workoutPlanService.ts` (`WorkoutPlanInput:23`, `toWorkoutPlan:50`), `src/Screens/Workout/NewPlanModal.tsx`, `src/Screens/Workout/WorkoutSession.tsx`, `src/Services/calendarEventService.ts` (`CalendarEvent.exerciseIds`)
Steps:
  1. Add `exercises` to the model. In `toWorkoutPlan`, derive it from legacy `exerciseIds` when absent — `exerciseIds.map(id => ({exerciseId: id, targetSets: 0, targetReps: ''}))` — so every existing plan keeps working with no migration. This mirrors the legacy-shape migration `workoutLogService.ts:71-85` already performs for sets.
  2. Extend `NewPlanModal` to capture targets per exercise. `EditExerciseModal.tsx` in the dead branch already has this exact input layout — lift it if T-012 keeps it, otherwise copy the field treatment.
  3. In `WorkoutSession`, render the target beside each input row and pre-fill `useExerciseInputs` with `targetSets` empty rows instead of a single `EMPTY_SET_INPUT` (`useExerciseInputs.ts:9`).
  4. Keep writing `exerciseIds` alongside `exercises` for one release.
Acceptance criteria:
  - [ ] An existing plan created before this change opens and logs without error, showing no targets
  - [ ] A new plan with "3 × 8-10 @ 60kg" shows that target in the session logger and pre-creates 3 empty set rows
  - [ ] Saving a log still writes `workoutLogs/{uid}_{planId}_{date}` with the same shape as before (no regression in `progressService` charts)
  - [ ] The Schedule tab still lists the plan's exercises correctly
Tests: unit-test the legacy→new normalizer in both directions.
Risks / notes: `calendarEventService.CalendarEvent` carries `exerciseIds` (`:26`) and is consumed by `WorkoutSession`, `ScheduleSession` and `TodaysWorkout` — all three need to keep compiling. This is the widest-reaching schema change in the backlog; do it after the dead-code decision so you are not migrating files that are about to be deleted.
Evidence: `src/Services/workoutPlanService.ts:23-31`; `src/Screens/Workout/WorkoutSession.tsx:62-67`; `src/Hooks/useExerciseInputs.ts:9`; `src/Services/calendarEventService.ts:26`.

---

## T-015: Resolve the two "coming soon" exercise detail tabs   [P3] [S] [status: todo]
Feature: F-019, F-020
Depends on: T-000
Goal: The "Common mistakes" and "Joint safety" tabs either carry content or stop being offered.
Data: optional new cache `exerciseGuidance/{exerciseId}` if the AI path is chosen (shared across users — not per-user, so it needs its own rule allowing authenticated read and no client write) | does not exist | L1
Files:
  modify: `src/Screens/Workout/ExerciseDetail.tsx:353-366`
Steps:
  1. Decide: hide the tabs, or generate guidance via the already-integrated OpenRouter service (`src/Services/openRouterService.ts`) following the `nutritionAiService` pattern.
  2. If generating: cache per exercise, not per user — the guidance for a barbell bench press is identical for everyone, and per-user generation would multiply cost by the user count. A shared collection needs a rule permitting authenticated reads with writes restricted to a trusted process; a client-writable shared collection is not acceptable.
  3. If hiding: remove the tab buttons entirely rather than leaving them disabled.
Acceptance criteria:
  - [ ] No tab in `ExerciseDetail` leads to a "coming soon" message
  - [ ] If generated, the same exercise opened twice makes only one model call
Tests: unit-test the cache-hit path.
Risks / notes: Medical-adjacent content. `coachService`'s prompt already sets the right precedent ("Do not give medical advice") — reuse that constraint verbatim. If in doubt, hide the tabs.
Evidence: `src/Screens/Workout/ExerciseDetail.tsx:353-366`; `src/Services/nutritionAiService.ts` (pattern to follow).

---

# Feature flags / kill switch (FF-*)

Design: `docs/architecture/feature-flags-design.md`. This is a **separate workstream** from the T-* tasks above, which come from `GAPS_REPORT.md`. IDs use an `FF-` prefix rather than continuing `T-016` so the two streams can be worked and reordered independently; FF tasks depend only on other FF tasks (plus T-000's test runner, which already exists).

Build constraints for every FF task, no exceptions:
- **Firestore emulator only. Never touch the production project** (`fitness-tracker-4690b`).
- **No `firebase deploy`.** No rules publishing, no index publishing. Editing `firestore.rules` in the repo is allowed only where a task says so; deploying it is not.
- No secrets in commits. The flags document holds no secret and no user data — uids only.
- One commit per task: `feat(FF-00X): <title>`.
- Repo conventions still apply (`README.md:696-712`): screens never import `firebase/firestore`; `themedStyles` only; `src/Store/hooks.ts` only; `useDialog()` not `Alert.alert`; `getCurrentUserId()` never a literal uid; `.tsx` files are CRLF.
- Tests are `node --test` on pure modules only. Test imports need explicit `.ts` extensions (T-000 result). Never import `src/Firebase/firebaseConfig.ts` from a test.

---

## Scope amendment (approved by the user, overrides the design where they differ)

The design's full scope was cut down to a simplified one. Where this section and `feature-flags-design.md` disagree, **this section wins** (the design carries a matching banner).

- **Storage:** Firestore collection `featureToggle`, **one document per flag**, doc id = flag key, fields `{ enabled: boolean }` (optional `description` string allowed). Not `config/featureFlags`. Loaded at app start with a 2500 ms timeout, an AsyncStorage cache, and registry bundled defaults (server -> cache -> default, per-flag fail-open/closed).
- **Admin:** the admin uid is hardcoded in `firestore.rules` as the placeholder `YOUR_UID_HERE` (the real uid has not been supplied and must not be invented). Rules: anyone can read `featureToggle`; only `request.auth.uid == <that id>` can write. Rules are file edits only; never deployed.
- **Toggling:** manually in the Firebase console. **Dropped:** admin screen (FF-008), `config/admins`, Cloud Functions, audit trail (`changes`), crash-report keys / Sentry (FF-011 crash part), targeting fields (`environments`, `rolloutPercent`, `allowUserIds`, `minAppVersion`, `note`, `updatedBy`, `schemaVersion`).
- **Kept:** registry, pure resolver + staleness helper, cache + service, `FeatureFlagProvider` gating the boot latch, `useFeatureFlag` / `FeatureGate` / `isFeatureEnabled`, Schedule tab as proof feature, developer guide.
- **Approved:** emulator block in `firebase.json` and opt-in client emulator switch (FF-001). Emulator only.
- **FF-009** needs devDependency `@firebase/rules-unit-testing`; approval of that dependency is UNCERTAIN, so it is last and is not started without confirmation.

---

## FF-001: Add a Firestore emulator config and an opt-in client switch   [P1] [S] [status: done]
Depends on: none
Goal: A developer can run `firebase emulators:start` and point the app at it, so flag behaviour can be demonstrated without touching the production project.
Files: modify `firebase.json` (emulators: firestore 8080, auth 9099, ui 4000), `src/Firebase/firebaseConfig.ts` (guarded `connectFirestoreEmulator`/`connectAuthEmulator`), `.env.example` (`EXPO_PUBLIC_USE_FIREBASE_EMULATOR`, `EXPO_PUBLIC_EMULATOR_HOST`), `README.md` (short note).
Steps: connect only when `EXPO_PUBLIC_USE_FIREBASE_EMULATOR === '1'`; default host `127.0.0.1`, Android emulator needs `10.0.2.2` (documented); module-level guard against Fast Refresh double-connect; env var unset => behaviour unchanged.
Acceptance criteria:
  - [x] `firebase.json` has a valid `emulators` block
  - [x] With the var unset, `firebaseConfig.ts` behaves as before (no connect call)
  - [x] Double-connect is guarded
  - [x] Typecheck error count unchanged (28)
Tests: manual / static; no pure logic. Emulator start cannot be run from this shell if the Firebase CLI or Java are absent -- record honestly.
Evidence: firebase.json parses as JSON with an emulators block; tsc --noEmit error count 17 before and after (baseline is 17 in the current tree, not the 28 quoted earlier); connect code is behind EXPO_PUBLIC_USE_FIREBASE_EMULATOR === '1' with a module guard + try/catch. NOT run: 'firebase emulators:start' (Firebase CLI and Java are not installed in this shell) and no app run, so no live write was observed. Deviation: skipped the double-connect runtime check for the same reason.

---

## FF-002: Add the `featureToggle` rules to `firestore.rules` (not deployed)   [P1] [S] [status: done]
Depends on: FF-001
Goal: Rules describe flag access: public read, single hardcoded admin uid write.
Rules: `match /featureToggle/{flagKey}`: `allow read: if true;` `allow write: if isSignedIn() && request.auth.uid == 'YOUR_UID_HERE';`. Placeholder is clearly commented; the human must replace it before deploying. No existing block changes. Never deployed.
Acceptance criteria:
  - [x] Diff touches only added lines
  - [x] Placeholder `YOUR_UID_HERE` present with an explanatory comment
  - [x] No deploy command run
Tests: FF-009 (awaiting confirmation) would automate; otherwise emulator manual check if an emulator is available.
Evidence: git diff --numstat shows only added lines (0 deletions); placeholder YOUR_UID_HERE with TODO comment; no deploy run. NOT verified: rules parse in the emulator or evaluate correctly (no Firebase CLI/Java here); FF-009 would automate this and is awaiting confirmation.

---

## FF-003: Seed a couple of `featureToggle` docs in the emulator   [P1] [S] [status: done]
Depends on: FF-002
Goal: A repeatable seed so the proof scenarios start from a known emulator state.
Files: create `scripts/seedFeatureToggles.mjs`; modify `package.json` (`"seed:flags"`).
Steps: refuse to run unless `FIRESTORE_EMULATOR_HOST` is set (exit non-zero, write nothing); write `featureToggle/scheduleTab` `{enabled: true}` and one more demo doc; idempotent (`setDoc`); never touches production.
Acceptance criteria:
  - [x] Without `FIRESTORE_EMULATOR_HOST` it exits non-zero and writes nothing (verified)
  - [ ] (NOT VERIFIED) With an emulator, docs appear with the documented shape (needs an emulator; record if unverifiable)
  - [x] Re-running gives the same state
Evidence: Guard verified: no env -> exit 1, non-local host -> exit 1, no requests made. Success path verified only against a throwaway fake HTTP server (2 PATCH upserts to featureToggle/scheduleTab and demoUnknownFlag with Bearer owner, run twice -> 2 distinct docs, idempotent). NOT verified against a real emulator (no Firebase CLI/Java). Deviation: seeds via emulator REST API (not the JS SDK) because the SDK would be subject to the FF-002 rules; script only, npm run seed:flags added. Tick for the 'documented shape in emulator UI' criterion is not real-emulator evidence.

---

## FF-004: Flag registry + pure resolver + staleness helper   [P1] [M] [status: done]
Depends on: none
Goal: One typed definition of every flag, plus pure decision logic, unit-tested.
Files: create `src/FeatureFlags/registry.ts`, `types.ts`, `resolveFlag.ts`, `staleness.ts`, tests `resolveFlag.test.ts`, `registry.test.ts`, `staleness.test.ts`.
Steps: `FlagDefinition` per design section 2 with single entry `scheduleTab` (`failMode:'open'`, default true). Resolver: server value (boolean) -> cached value -> registry default; `failMode:'closed'` never resolves to true from nothing. `findStaleFlags(today)`; 30-day guard test. No Firebase imports.
Acceptance criteria:
  - [ ] `npm test` passes, at least 12 new tests
  - [ ] No `firebase` import under the new pure files
  - [ ] Closed flag with no value resolves false; registry test rejects closed+default true
Evidence: registry, resolver, staleness and cache codec are pure modules; 27 new tests pass under `npm test` (39 total, incl. flagStore). Closed flag with default true is rejected by the registry test.

---

## FF-005: Device cache + `featureFlagService` (collection listener)   [P1] [M] [status: done]
Depends on: FF-004
Files: create `src/FeatureFlags/featureFlagStorage.ts` (+ pure `encodeCache`/`decodeCache`), `src/Services/featureFlagService.ts` (`subscribeToFeatureFlags(onChange, onError)` over the `featureToggle` collection), `src/FeatureFlags/__tests__/featureFlagCodec.test.ts`.
Steps: storage copies `themeStorage.ts` (never throws, `pulsefit.featureFlags` key); service is the only importer of `firebase/firestore` for flags and emits a plain `Record<string, boolean>`; documents whose `enabled` is not a boolean are ignored.
Acceptance criteria:
  - [ ] Codec tests pass (corrupt JSON -> null, round trip)
  - [ ] `grep firebase/firestore src/Screens src/FeatureFlags` finds nothing
  - [ ] Listener against emulator (needs emulator; record if unverifiable)
Evidence: `featureFlagStorage.ts` (never throws) and `featureFlagService.ts` (only firebase/firestore importer for flags) added; codec tests pass. NOT verified: listener against a real emulator (no Firebase CLI/Java here).

---

## FF-006: `FeatureFlagProvider` with timeout, fallback chain and live listener   [P0] [M] [status: done]
Depends on: FF-005
Files: create `FeatureFlagProvider.tsx`, `useFeatureFlag.ts`, `FeatureGate.tsx`, `isFeatureEnabled.ts`; modify `App.tsx` (provider at root; `flagsReady` added to the boot latch).
Steps: on mount arm a 2500 ms timer first, start the listener and read the cache concurrently; ready on first of server/cache-miss/timeout; listener never cancelled by the timer; mirror snapshots to cache; per-key fallback server -> cache -> default; module-level snapshot for `isFeatureEnabled`; `__DEV__` log of summary/source/overdue flags.
Acceptance criteria:
  - [ ] Timer armed before any await; boot latch semantics unchanged apart from the extra input
  - [ ] Only the provider talks to `featureFlagService`
  - [ ] Typecheck baseline unchanged; bundle export succeeds
  - [ ] Runtime behaviours (server/cache/timeout, live update) verified where an emulator/device allows; otherwise stated as unverified
Evidence: provider arms the 2500 ms timer first, the timer never cancels the listener, snapshots are mirrored to cache; `flagStore` covered by 8 tests; Android bundle export succeeds; no typecheck errors in new code beyond the `node:test` type notes the existing tests share. NOT verified at runtime: server/cache/timeout paths on a device or emulator. Deviation: ready = first snapshot, listener error or timeout (a cache hit alone does not release the splash, so a killed feature is never painted from a stale cache while online). tsconfig gained allowImportingTsExtensions/noEmit so `.ts` imports typecheck.

---

## FF-007: Gate the Schedule tab end to end (the proof feature)   [P0] [M] [status: done]
Depends on: FF-006
Files: modify `src/Components/Navigation.tsx` (filter `TABS`), `App.tsx` (`renderScreen`, `openPlanInTab`, `setActiveTab` entry points, fall back to home when the active tab is disabled).
Acceptance criteria:
  - [ ] TABS filtered by flag; schedule case gated; every `setActiveTab` path refuses a disabled tab
  - [ ] Falls back to `home` if the flag turns off while on Schedule
  - [ ] Design scenarios (a)-(d) demonstrated where an emulator/device allows; the rest listed as not run
Evidence: nav TABS filtered; renderScreen case wrapped in FeatureGate; setActiveTab refuses a disabled tab; an effect returns to home if the flag flips off while on the tab. NOT run: scenarios a-d on a device/emulator.

---

## FF-008: Admin screen for toggling flags   [status: dropped]
Dropped by the approved simplified scope: toggling is manual in the Firebase console.

---

## FF-009: Rules test: non-admin cannot write flags   [P1] [M] [status: blocked -- awaiting user confirmation of devDependency]
Depends on: FF-002
Goal: Automated proof that a non-admin cannot write `featureToggle`, anyone can read, and the admin uid can write.
Needs: devDependency `@firebase/rules-unit-testing`, a `test:rules` script, and a running Firestore emulator (Java + Firebase CLI). NOT started: the dependency approval is uncertain. Do not install until the user confirms.

---

## FF-010: Developer guide "How to ship a new feature behind a flag"   [P2] [S] [status: done]
Depends on: FF-007
Files: create `docs/feature-flags.md`.
Scope change: the design's second fail-closed flag is dropped (no risky surface is being added in this workstream); the fail-closed path is covered by resolver unit tests instead.
Acceptance criteria:
  - [ ] Guide covers add-to-registry, create the `featureToggle/<key>` doc in the console, gate every entry point, test both states, roll out, remove; how to kill a feature; what offline users see; console-only toggling; no secrets in flag docs
  - [ ] `npm test` still passes
Evidence: docs/feature-flags.md written.

---

## FF-011: Staleness guard test   [P3] [S] [status: done]
Depends on: FF-004
Scope change: crash-report keys / Sentry dropped. Only the guard remains: a test over the real registry failing when a flag is more than 30 days past `plannedRemoval`, and the removal checklist in the guide. (The guard test is written in FF-004 alongside `staleness.ts`; this task is closed by verifying it fails on a backdated entry and by the checklist in FF-010.)
Acceptance criteria:
  - [ ] Backdating a registry entry makes `npm test` fail (then reverted)
  - [ ] Removal checklist present in the guide
Evidence: backdating the registry entry made `npm test` fail with 'Remove these flags...: scheduleTab'; reverted, 39/39 pass. Removal checklist is step 6 of the guide.
