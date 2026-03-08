import { useState, useEffect, useMemo, useCallback } from 'react';
import type { ContractType, AdditionalFee, Field, FormData } from '../types';

type UseContractFormOptions = {
    contractType: ContractType | undefined;
    onDirty: () => void;
};

export const getInitialFormData = (ct?: ContractType): FormData =>
    ct?.fields ? ct.fields.reduce((acc, field) => ({ ...acc, [field.id]: field.defaultValue ?? '' }), {}) : {};

export const useContractForm = ({ contractType, onDirty }: UseContractFormOptions) => {
    const [formData, setFormData] = useState<FormData>({});
    const [formErrors, setFormErrors] = useState<{ [key: string]: string }>({});

    const fieldGroups = useMemo(() => {
        if (!contractType?.fields) return {};
        return contractType.fields.reduce((acc, field) => {
            const groupName = field.group || 'Engagement Details';
            if (!acc[groupName]) acc[groupName] = [];
            acc[groupName].push(field);
            return acc;
        }, {} as Record<string, Field[]>);
    }, [contractType]);

    const performanceScales = useMemo(() => contractType?.wageScales?.filter(s => !s.id.startsWith('ws_cartage_')) || [], [contractType]);
    const cartageScales = useMemo(() => contractType?.wageScales?.filter(s => s.id.startsWith('ws_cartage_')) || [], [contractType]);

    const feeCategories = useMemo(() => {
        if (!contractType?.additionalFees?.length) return {} as Record<string, AdditionalFee[]>;
        return contractType.additionalFees.reduce((acc, fee) => {
            if (!acc[fee.category]) acc[fee.category] = [];
            acc[fee.category].push(fee);
            return acc;
        }, {} as Record<string, AdditionalFee[]>);
    }, [contractType]);

    const orderedGroupNames = useMemo(() => {
        if (!contractType?.fields) return [];
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
        // Append additional fee categories after Personnel
        const feeCatNames = Object.keys(feeCategories);
        feeCatNames.forEach(cat => {
            if (!groupNamesInOrder.includes(cat)) {
                const personnelIdx = groupNamesInOrder.indexOf('Personnel');
                if (personnelIdx > -1) {
                    groupNamesInOrder.splice(personnelIdx + 1, 0, cat);
                } else {
                    groupNamesInOrder.push(cat);
                }
            }
        });

        return groupNamesInOrder;
    }, [contractType, feeCategories]);

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

    const validateStep = useCallback((groupName: string): Record<string, string> => {
        if (!contractType) return {};
        const stepErrors: Record<string, string> = {};
        const fieldsInGroup = fieldGroups[groupName] || [];
        fieldsInGroup.forEach(field => {
            const value = formData[field.id];
            if (field.required && (value === '' || value === null || value === undefined)) {
                stepErrors[field.id] = `${field.label} is required.`;
            } else if (field.minLength && String(value || '').length < field.minLength) {
                stepErrors[field.id] = `${field.label} must be at least ${field.minLength} characters.`;
            }
        });
        return stepErrors;
    }, [contractType, fieldGroups, formData]);

    const resetFormState = useCallback((ct?: ContractType) => {
        setFormData(getInitialFormData(ct));
        setFormErrors({});
    }, []);

    return {
        formData,
        setFormData,
        formErrors,
        fieldGroups,
        orderedGroupNames,
        performanceScales,
        cartageScales,
        feeCategories,
        handleChange,
        validateStep,
        resetFormState,
    };
};
