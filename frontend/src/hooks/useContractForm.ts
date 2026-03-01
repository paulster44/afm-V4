import { useState, useEffect, useMemo, useCallback } from 'react';
import type { ContractType, Field, FormData } from '../types';

type UseContractFormOptions = {
    contractType: ContractType | undefined;
    onDirty: () => void;
};

export const getInitialFormData = (ct?: ContractType): FormData =>
    ct ? ct.fields.reduce((acc, field) => ({ ...acc, [field.id]: field.defaultValue ?? '' }), {}) : {};

export const useContractForm = ({ contractType, onDirty }: UseContractFormOptions) => {
    const [formData, setFormData] = useState<FormData>({});
    const [formErrors, setFormErrors] = useState<{ [key: string]: string }>({});
    const [openAccordion, setOpenAccordion] = useState<string | null>(null);

    const fieldGroups = useMemo(() => {
        if (!contractType) return {};
        return contractType.fields.reduce((acc, field) => {
            const groupName = field.group || 'Engagement Details';
            if (!acc[groupName]) acc[groupName] = [];
            acc[groupName].push(field);
            return acc;
        }, {} as Record<string, Field[]>);
    }, [contractType]);

    const performanceScales = useMemo(() => contractType?.wageScales?.filter(s => !s.id.startsWith('ws_cartage_')) || [], [contractType]);
    const cartageScales = useMemo(() => contractType?.wageScales?.filter(s => s.id.startsWith('ws_cartage_')) || [], [contractType]);

    const orderedGroupNames = useMemo(() => {
        if (!contractType) return [];
        const groupNamesInOrder = [...new Set(contractType.fields.map(f => f.group || 'Engagement Details'))];

        if (!groupNamesInOrder.includes('Personnel')) {
            const compIndex = groupNamesInOrder.indexOf('Compensation');
            if (compIndex !== -1) {
                groupNamesInOrder.splice(compIndex + 1, 0, 'Personnel');
            } else {
                const financialIndex = groupNamesInOrder.indexOf('Financial Terms');
                if (financialIndex > -1) {
                    groupNamesInOrder.splice(financialIndex, 0, 'Personnel');
                } else {
                    groupNamesInOrder.push('Personnel');
                }
            }
        }
        return groupNamesInOrder;
    }, [contractType]);

    // Validation effect
    useEffect(() => {
        if (!contractType) {
            setFormErrors({});
            return;
        }

        const newErrors: { [key: string]: string } = {};

        // --- Standard field validation ---
        contractType.fields.forEach(field => {
            const value = formData[field.id];
            // A value of 0 is valid, so we explicitly check for empty string, null, or undefined.
            if (field.required && (value === '' || value === null || value === undefined)) {
                newErrors[field.id] = `${field.label} is required.`;
            } else if (field.minLength && String(value || '').length < field.minLength) {
                newErrors[field.id] = `${field.label} must be at least ${field.minLength} characters.`;
            }
        });

        // --- Custom validation for rehearsal rate ---
        const rehearsalHours = formData.rehearsalHours;
        const rehearsalRate = formData.rehearsalRate;

        // If hours are entered and are more than 0, a rate is required.
        if (typeof rehearsalHours === 'number' && rehearsalHours > 0) {
            // An empty string or null/undefined for rate is considered not entered. 0 is a valid rate.
            if (rehearsalRate === '' || rehearsalRate === null || rehearsalRate === undefined) {
                // Only add the error if there isn't already a 'required' error, to avoid clutter.
                if (!newErrors['rehearsalRate']) {
                    newErrors['rehearsalRate'] = 'A Rehearsal Rate is required when Rehearsal Hours are entered.';
                }
            }
        }

        // Prevent unnecessary re-renders by comparing with the current state.
        setFormErrors(currentErrors => {
            if (JSON.stringify(newErrors) !== JSON.stringify(currentErrors)) {
                return newErrors;
            }
            return currentErrors;
        });
    }, [formData, contractType]); // Removed formErrors from dependencies for stability

    const handleChange = useCallback((id: string, value: string | number) => {
        setFormData(prev => ({ ...prev, [id]: value }));
        onDirty();
    }, [onDirty]);

    const handleKeyDown = useCallback((event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        if (event.key === 'Enter' && !event.shiftKey && !(event.target instanceof HTMLTextAreaElement)) {
            event.preventDefault();
            setOpenAccordion(currentAccordion => {
                if (!currentAccordion || !contractType) return currentAccordion;
                const currentGroupFields = fieldGroups[currentAccordion] || [];
                const isSectionComplete = currentGroupFields.every(field => {
                    if (!field.required) return true;
                    const value = formData[field.id];
                    if (value === '' || value === undefined || value === null) return false;
                    if (field.minLength && String(value).length < field.minLength) return false;
                    return true;
                });
                if (isSectionComplete) {
                    const currentIdx = orderedGroupNames.indexOf(currentAccordion);
                    if (currentIdx > -1 && currentIdx < orderedGroupNames.length - 1) {
                        return orderedGroupNames[currentIdx + 1];
                    }
                }
                return currentAccordion;
            });
        }
    }, [contractType, fieldGroups, orderedGroupNames, formData]);

    const resetFormState = useCallback((ct?: ContractType) => {
        setFormData(getInitialFormData(ct));
        setFormErrors({});
        setOpenAccordion(null);
    }, []);

    return {
        formData,
        setFormData,
        formErrors,
        openAccordion,
        setOpenAccordion,
        fieldGroups,
        orderedGroupNames,
        performanceScales,
        cartageScales,
        handleChange,
        handleKeyDown,
        resetFormState,
    };
};
