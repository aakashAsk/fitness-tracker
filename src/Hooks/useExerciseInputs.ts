import { useState, useCallback } from 'react';
import { toDateKey } from '../Services/workoutLogService';

export interface SetInput {
  reps: string;
  weight: string;
}

const EMPTY_SET_INPUT: SetInput = { reps: '', weight: '' };
const SET_STEPS = { reps: 1, weight: 2.5 } as const;

function formatStepValue(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));
}

function inputKey(dateKey: string, rowId: string): string {
  return `${dateKey}::${rowId}`;
}

interface UseExerciseInputsOptions {
  selectedDate: Date;
}

export function useExerciseInputs({ selectedDate }: UseExerciseInputsOptions) {
  const [exerciseInputs, setExerciseInputs] = useState<Record<string, SetInput[]>>({});

  const getSetInputs = useCallback(
    (rowId: string) => {
      return exerciseInputs[inputKey(toDateKey(selectedDate), rowId)] ?? [EMPTY_SET_INPUT];
    },
    [exerciseInputs, selectedDate],
  );

  const stepSetInput = useCallback(
    (rowId: string, setIndex: number, field: 'reps' | 'weight', direction: 1 | -1) => {
      const key = inputKey(toDateKey(selectedDate), rowId);
      setExerciseInputs((prev) => {
        const sets = prev[key] ?? [EMPTY_SET_INPUT];
        return {
          ...prev,
          [key]: sets.map((set, i) => {
            if (i !== setIndex) return set;
            const current = parseFloat(set[field]) || 0;
            const next = Math.max(current + SET_STEPS[field] * direction, 0);
            return { ...set, [field]: formatStepValue(next) };
          }),
        };
      });
    },
    [selectedDate],
  );

  const addSet = useCallback(
    (rowId: string) => {
      const key = inputKey(toDateKey(selectedDate), rowId);
      setExerciseInputs((prev) => {
        const sets = prev[key] ?? [EMPTY_SET_INPUT];
        const last = sets[sets.length - 1] ?? EMPTY_SET_INPUT;
        return { ...prev, [key]: [...sets, { ...last }] };
      });
    },
    [selectedDate],
  );

  const removeSet = useCallback(
    (rowId: string, setIndex: number) => {
      const key = inputKey(toDateKey(selectedDate), rowId);
      setExerciseInputs((prev) => {
        const sets = prev[key] ?? [EMPTY_SET_INPUT];
        if (sets.length <= 1) return prev;
        return { ...prev, [key]: sets.filter((_, i) => i !== setIndex) };
      });
    },
    [selectedDate],
  );

  const setAllInputs = useCallback(
    (newInputs: Record<string, SetInput[]>) => {
      setExerciseInputs(newInputs);
    },
    [],
  );

  return {
    exerciseInputs,
    setExerciseInputs,
    getSetInputs,
    stepSetInput,
    addSet,
    removeSet,
    setAllInputs,
  };
}

export { inputKey, EMPTY_SET_INPUT };
