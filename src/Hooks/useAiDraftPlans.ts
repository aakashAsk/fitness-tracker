// What the "Design AI Workout Protocol" button does when tapped: builds a
// week of workout plans from the signed-in user's profile with the AI and
// saves them as DRAFTS (see aiWorkoutPlanDraftService), then says what
// happened.
//
//   const { generate, isGenerating } = useAiDraftPlans();
//   <WorkoutPlanEngineCard onPress={generate} loading={isGenerating} />
//
// Two things worth knowing:
//
//  - One generation at a time, app-wide. The Workout tab is unmounted
//    whenever the user switches tabs, and a generation takes ~10 seconds,
//    so "wait for it" and "tap again after coming back" are both real. A
//    per-component guard would reset with the tab and let a second tap
//    start a second — billed, duplicate-producing — run. The in-flight
//    promise therefore lives at module level.
//
//  - It is NOT cancelled when the tab is left. Cancelling would throw away
//    a run the user has already waited for; the drafts are saved and the
//    result dialog (which is app-level) appears wherever they are.
import { useCallback, useEffect, useRef, useState } from 'react';

import { useDialog } from '../Components/Dialog';
import { generateAiDraftPlans } from '../Services/aiWorkoutPlanDraftService';
import { AiWorkoutPlanError, describeDraftResult } from '../Services/aiWorkoutPlanShape';
import { useUserProfile } from '../Store/userProfileSlice';

let inFlight: Promise<void> | null = null;

export interface UseAiDraftPlansResult {
    /** Starts a generation. A no-op while one is already running. */
    generate: () => void;
    isGenerating: boolean;
}

export function useAiDraftPlans(): UseAiDraftPlansResult {
    const dialog = useDialog();
    const profile = useUserProfile();
    // Starts true when the tab is reopened mid-generation.
    const [isGenerating, setIsGenerating] = useState(inFlight !== null);
    const mounted = useRef(true);

    useEffect(() => {
        mounted.current = true;
        // Returned to the tab while a run is still going: follow it, so
        // the button clears when it finishes.
        const pending = inFlight;
        if (pending) {
            void pending.finally(() => {
                if (mounted.current) setIsGenerating(false);
            });
        }
        return () => {
            mounted.current = false;
        };
    }, []);

    const generate = useCallback(() => {
        if (inFlight) return;

        setIsGenerating(true);
        const run = (async () => {
            try {
                const result = await generateAiDraftPlans({ profile });
                dialog.show({
                    title: 'AI plan ready',
                    message: describeDraftResult({
                        summary: result.plan.summary,
                        drafts: result.drafts,
                        skippedPlans: result.skippedPlans,
                    }),
                });
            } catch (error) {
                dialog.show({
                    title: 'Could not create your plan',
                    message:
                        error instanceof AiWorkoutPlanError
                            ? error.message
                            : 'Something went wrong. Please try again.',
                });
            }
        })();

        inFlight = run.finally(() => {
            inFlight = null;
            if (mounted.current) setIsGenerating(false);
        });
    }, [dialog, profile]);

    return { generate, isGenerating };
}

export default useAiDraftPlans;
