import { useState, useEffect, useRef, useCallback } from 'react';
import type { FormData, Person, ContractType } from '../types';

type UseDraftPersistenceOptions = {
    localId: number;
    userId: string;
    contractType: ContractType | undefined;
    selectedContractTypeId: string;
    formData: FormData;
    personnel: Person[];
    configContractTypes: ContractType[];
    onResetForm: (ct?: ContractType) => void;
    onRestoreFormData: (formData: FormData) => void;
    onRestorePersonnel: (personnel: Person[]) => void;
    onSetSelectedContractTypeId: (id: string) => void;
};

export const useDraftPersistence = ({
    localId, userId, contractType, selectedContractTypeId,
    formData, personnel, configContractTypes,
    onResetForm, onRestoreFormData, onRestorePersonnel, onSetSelectedContractTypeId,
}: UseDraftPersistenceOptions) => {
    const [draftToRestore, setDraftToRestore] = useState<{ formData: FormData; personnel: Person[] } | null>(null);
    const [isSwitchingType, setIsSwitchingType] = useState(false);
    const draftSaveTimeoutRef = useRef<number | null>(null);

    const getDraftKey = useCallback((typeId: string) =>
        `afm_draft_contract_${localId}_${userId}_${typeId}`, [localId, userId]);

    const clearDraft = useCallback((contractTypeIdToClear: string) => {
        if (contractTypeIdToClear) {
            localStorage.removeItem(getDraftKey(contractTypeIdToClear));
        }
    }, [getDraftKey]);

    // Type-switch guard reset
    useEffect(() => {
        if (isSwitchingType) setIsSwitchingType(false);
    }, [selectedContractTypeId]); // eslint-disable-line react-hooks/exhaustive-deps

    // Debounced auto-save to localStorage
    useEffect(() => {
        if (!contractType || draftToRestore || isSwitchingType) return;

        if (draftSaveTimeoutRef.current) {
            clearTimeout(draftSaveTimeoutRef.current);
        }

        draftSaveTimeoutRef.current = window.setTimeout(() => {
            const draft = { formData, personnel };
            const isFormEmpty = Object.values(formData).every(v => v === '') && (personnel.length === 1 && !personnel[0]?.name && !personnel[0]?.address);
            if (!isFormEmpty) {
                localStorage.setItem(getDraftKey(selectedContractTypeId), JSON.stringify(draft));
            }
        }, 500);

        return () => {
            if (draftSaveTimeoutRef.current) {
                clearTimeout(draftSaveTimeoutRef.current);
            }
        };
    }, [formData, personnel, contractType, selectedContractTypeId, draftToRestore, isSwitchingType, getDraftKey]);

    const handleManualTypeChange = useCallback((newTypeId: string) => {
        if (newTypeId === selectedContractTypeId) {
            return;
        }
        setIsSwitchingType(true);

        const newContractType = configContractTypes.find(c => c.id === newTypeId);

        const savedDraftJson = localStorage.getItem(getDraftKey(newTypeId));

        if (savedDraftJson) {
            try {
                const savedDraft = JSON.parse(savedDraftJson);
                onRestoreFormData(savedDraft.formData);
                onRestorePersonnel(savedDraft.personnel);
                setDraftToRestore(savedDraft);
            } catch (e) {
                console.error("Failed to parse draft", e);
                localStorage.removeItem(getDraftKey(newTypeId));
                setDraftToRestore(null);
                onResetForm(newContractType);
            }
        } else {
            setDraftToRestore(null);
            onResetForm(newContractType);
        }

        onSetSelectedContractTypeId(newTypeId);
    }, [selectedContractTypeId, configContractTypes, getDraftKey, onResetForm, onRestoreFormData, onRestorePersonnel, onSetSelectedContractTypeId]);

    const handleRestoreDraft = useCallback(() => {
        setDraftToRestore(null);
    }, []);

    const handleDismissDraft = useCallback(() => {
        if (contractType) {
            clearDraft(selectedContractTypeId);
            setDraftToRestore(null);
            onResetForm(contractType);
        }
    }, [contractType, selectedContractTypeId, clearDraft, onResetForm]);

    return {
        draftToRestore,
        setDraftToRestore,
        isSwitchingType,
        setIsSwitchingType,
        clearDraft,
        handleManualTypeChange,
        handleRestoreDraft,
        handleDismissDraft,
    };
};
