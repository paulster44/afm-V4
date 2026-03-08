import { useState, useMemo, useCallback } from 'react';
import type { FormData, StepMeta } from '../types';

const REVIEW_STEP = '__review' as const;

type UseWizardNavigationOptions = {
    orderedGroupNames: string[];
    formData: FormData;
    stepMeta?: Record<string, StepMeta>;
};

const evaluateCondition = (condition: StepMeta['condition'], formData: FormData): boolean => {
    if (!condition) return true;
    const val = formData[condition.field];
    switch (condition.operator) {
        case 'eq': return val === condition.value;
        case 'neq': return val !== condition.value;
        case 'gt': return Number(val) > Number(condition.value);
        case 'exists': return val !== '' && val !== null && val !== undefined;
        default: return true;
    }
};

export const useWizardNavigation = ({ orderedGroupNames, formData, stepMeta }: UseWizardNavigationOptions) => {
    const [currentStepIndex, setCurrentStepIndex] = useState(0);
    const [stepErrors, setStepErrors] = useState<Record<string, string>>({});

    const visibleSteps = useMemo(() => {
        const filtered = orderedGroupNames.filter(name => {
            const meta = stepMeta?.[name];
            if (!meta?.condition) return true;
            return evaluateCondition(meta.condition, formData);
        });
        return [...filtered, REVIEW_STEP];
    }, [orderedGroupNames, stepMeta, formData]);

    const currentStepName = visibleSteps[currentStepIndex] ?? visibleSteps[0] ?? REVIEW_STEP;
    const isFirstStep = currentStepIndex === 0;
    const isLastStep = currentStepIndex === visibleSteps.length - 1;
    const isReviewStep = currentStepName === REVIEW_STEP;

    const goNext = useCallback(() => {
        if (isLastStep) return;
        setStepErrors({});
        setCurrentStepIndex(i => Math.min(i + 1, visibleSteps.length - 1));
    }, [isLastStep, visibleSteps.length]);

    const goBack = useCallback(() => {
        setStepErrors({});
        setCurrentStepIndex(i => Math.max(i - 1, 0));
    }, []);

    const goToStep = useCallback((index: number) => {
        if (index >= 0 && index < visibleSteps.length) {
            setStepErrors({});
            setCurrentStepIndex(index);
        }
    }, [visibleSteps.length]);

    const resetNavigation = useCallback(() => {
        setCurrentStepIndex(0);
        setStepErrors({});
    }, []);

    return {
        currentStepIndex,
        currentStepName,
        visibleSteps,
        isFirstStep,
        isLastStep,
        isReviewStep,
        stepErrors,
        goNext,
        goBack,
        goToStep,
        resetNavigation,
    };
};
