// Android Health Connect — today's step total.
//
// Health Connect is a request/response datastore, not a live feed. It
// has no subscribe API and no per-step callback: you ask it a question
// and it answers. `getChanges` exists, but it is a polling token, not a
// push, and it still costs a round trip per check. There is nothing
// here that fires when the user takes a step.
//
// It is also not instant. The steps in Health Connect were *written*
// there by some other provider — Google Fit, Samsung Health, Fitbit,
// the system's own activity recognition — and those providers batch
// their writes. A step taken now typically lands seconds to minutes
// later, and which provider is writing at all depends on what the user
// has installed.
//
// What it is good at is being *correct over a day*: it counts steps
// taken while our app was closed, it survives reboots, and it merges
// what several apps recorded without double counting. That is exactly
// the thing the raw pedometer cannot do, and exactly why the step
// service treats this as the baseline and lets the pedometer supply
// the live movement on top. See ./stepService.ts.
//
// Everything here is Android-only and returns null on iOS, where
// Core Motion already answers the same question directly.
import { Platform } from 'react-native';

/** Health Connect's own package name, used to tell "not installed"
    from "installed but no permission". */
const PROVIDER_PACKAGE = 'com.google.android.apps.healthdata';

/** Why a read came back without a number — used to decide whether the
    UI should prompt, send the user to the Play Store, or stay quiet. */
export type HealthConnectStatus =
    /** Read succeeded. */
    | 'ok'
    /** Not Android, so this path does not apply. */
    | 'unsupported'
    /** Health Connect is not installed, or is too old. Android 14+ has
        it in the OS; 9–13 needs the Play Store app. */
    | 'provider-unavailable'
    /** Installed, but the user has not granted step reading. */
    | 'permission-denied'
    /** Installed and permitted, but the read itself failed. */
    | 'error';

export interface HealthConnectStepResult {
    /** Today's steps, or null whenever `status` is not `'ok'`. */
    steps: number | null;
    status: HealthConnectStatus;
}

const UNSUPPORTED: HealthConnectStepResult = { steps: null, status: 'unsupported' };

/** The step read permission, in the shape `requestPermission` wants. */
const STEP_PERMISSION = { accessType: 'read', recordType: 'Steps' } as const;

/**
 * The library pulls in Android-only native code, so it is required
 * lazily rather than at module load. On iOS the import never runs at
 * all, and a missing or unlinked build (Expo Go, for instance) fails
 * here as a null rather than crashing the bundle.
 */
function loadModule(): typeof import('react-native-health-connect') | null {
    if (Platform.OS !== 'android') return null;
    try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        return require('react-native-health-connect');
    } catch {
        return null;
    }
}

/** Midnight today, as the ISO instant Health Connect expects. */
function dayRange(): { startTime: string; endTime: string } {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return { startTime: start.toISOString(), endTime: new Date().toISOString() };
}

/**
 * Whether Health Connect is installed and usable on this device.
 *
 * Distinguishes "no provider" from "provider too old", because the
 * second is fixable by the user updating the app and the first may not
 * be — below Android 9 there is no Health Connect at all.
 */
export async function getHealthConnectStatus(): Promise<HealthConnectStatus> {
    const module = loadModule();
    if (!module) return 'unsupported';

    try {
        const status = await module.getSdkStatus(PROVIDER_PACKAGE);
        if (status === module.SdkAvailabilityStatus.SDK_AVAILABLE) return 'ok';
        return 'provider-unavailable';
    } catch {
        return 'provider-unavailable';
    }
}

/**
 * Asks for step read access, returning whether it is now granted.
 *
 * Health Connect shows its own system dialog. If the user has denied
 * it twice Android silently stops showing that dialog, so a `false`
 * here does not always mean the user just refused — it can mean they
 * were never asked. `openHealthConnectSettings` is the escape hatch
 * for that case.
 */
export async function requestHealthConnectPermission(): Promise<boolean> {
    const module = loadModule();
    if (!module) return false;

    try {
        if (!(await module.initialize(PROVIDER_PACKAGE))) return false;

        const granted = await module.getGrantedPermissions();
        const alreadyGranted = granted.some(
            (permission) =>
                'recordType' in permission &&
                permission.recordType === 'Steps' &&
                permission.accessType === 'read',
        );
        if (alreadyGranted) return true;

        const requested = await module.requestPermission([STEP_PERMISSION]);
        return requested.some(
            (permission) =>
                'recordType' in permission &&
                permission.recordType === 'Steps' &&
                permission.accessType === 'read',
        );
    } catch {
        return false;
    }
}

/** Sends the user to the Health Connect app, for when permission was
    permanently denied and we can no longer prompt. */
export function openHealthConnectSettings(): void {
    loadModule()?.openHealthConnectSettings();
}

/**
 * Today's step total from Health Connect.
 *
 * Uses `aggregateRecord` rather than `readRecords` deliberately:
 * aggregation is what de-duplicates overlapping records from several
 * providers. Summing `readRecords` by hand double counts a user who
 * has both, say, Fitbit and Samsung Health writing steps.
 *
 * Never throws — every failure is a `status` the caller can act on.
 */
export async function readTodaySteps(): Promise<HealthConnectStepResult> {
    const module = loadModule();
    if (!module) return UNSUPPORTED;

    const availability = await getHealthConnectStatus();
    if (availability !== 'ok') return { steps: null, status: availability };

    if (!(await requestHealthConnectPermission())) {
        return { steps: null, status: 'permission-denied' };
    }

    try {
        const result = await module.aggregateRecord({
            recordType: 'Steps',
            timeRangeFilter: { operator: 'between', ...dayRange() },
        });
        return { steps: Math.max(result.COUNT_TOTAL ?? 0, 0), status: 'ok' };
    } catch {
        return { steps: null, status: 'error' };
    }
}
