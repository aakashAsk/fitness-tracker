// What an "AI meal plan" button does when tapped: builds a week of meal
// plans from the signed-in user's calorie/macro targets with the AI and
// saves them as DRAFTS (see aiMealPlanDraftService), then says what
// happened. Mirrors useAiDraftPlans.ts exactly — see that file for the
// reasoning behind the module-level in-flight guard.
//
//   const { generate, isGenerating } = useAiDraftMealPlans();
//   <MealPlanEngineCard onPress={generate} loading={isGenerating} />
import { useCallback, useEffect, useRef, useState } from 'react';

import { useDialog } from '../Components/Dialog';
import { generateAiDraftMealPlans } from '../Services/aiMealPlanDraftService';
import { AiMealPlanError, describeDraftMealResult } from '../Services/aiMealPlanShape';
import { useUserProfile } from '../Store/userProfileSlice';

let inFlight: Promise<void> | null = null;

export interface UseAiDraftMealPlansResult {
    /** Starts a generation. A no-op while one is already running. */
    generate: () => void;
    isGenerating: boolean;
}

export function useAiDraftMealPlans(): UseAiDraftMealPlansResult {
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
                const result = await generateAiDraftMealPlans({ profile });
                dialog.show({
                    title: 'AI meal plan ready',
                    message: describeDraftMealResult({
                        summary: result.plan.summary,
                        drafts: result.drafts,
                    }),
                });
            } catch (error) {
                dialog.show({
                    title: 'Could not create your meal plan',
                    message:
                        error instanceof AiMealPlanError
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

export default useAiDraftMealPlans;
