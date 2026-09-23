// Persists the dashboard's live readings into today's telemetry row.
//
// Steps, calories and sleep are read from the device every time the
// dashboard is open, and until now they were never stored — close the
// app and the day was gone. Writing them here is what gives those
// metrics a history, without asking the user to do anything.
//
// It is deliberately a by-product of rendering the dashboard: no
// background job, no scheduler. That means a day the user never opens
// the app records nothing, which is the honest outcome — the device's
// own step ledger is still the source of truth and backfills the total
// whenever they next look.
//
// recordDailyMetrics throttles and de-duplicates (see telemetryShape's
// shouldWriteMetrics), so calling this on every reading is cheap: a day
// costs a handful of writes, not one per pedometer tick.
import { useEffect } from 'react';

import { recordDailyMetrics, type SleepSnapshot } from '../Services/telemetryService';
import { todayDateKey } from '../Services/workoutLogService';

export interface TelemetryReadings {
    /** Undefined while unknown — the pedometer may still be resolving, or
        be unavailable entirely. Never pass 0 to mean "don't know": that
        is a measured zero and would overwrite a real count. */
    steps?: number;
    caloriesBurned?: number;
    sleep?: SleepSnapshot | null;
}

/**
 * @param readings What is known right now. Leave a field undefined until
 *                 its source has actually answered.
 * @param enabled  False while the screen is still loading or signed out,
 *                 so nothing is written against a half-read day.
 */
export function useRecordTelemetry(readings: TelemetryReadings, enabled: boolean): void {
    const { steps, caloriesBurned, sleep } = readings;
    const sleepKey = sleep ? `${sleep.asleepMinutes}:${sleep.inBedMinutes}` : String(sleep);

    useEffect(() => {
        if (!enabled) return;
        // Fire and forget: recordDailyMetrics never throws, and the
        // dashboard must not wait on a write it did not ask for.
        void recordDailyMetrics(todayDateKey(), { steps, caloriesBurned, sleep });
        // Keyed on the values rather than the object, which is rebuilt on
        // every render of the dashboard.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [enabled, steps, caloriesBurned, sleepKey]);
}

export default useRecordTelemetry;
