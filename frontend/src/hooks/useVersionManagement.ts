import { useState, useCallback } from 'react';
import type { FormData, Person, ContractType, ContractVersion, SavedContract } from '../types';

type UseVersionManagementOptions = {
    selectedContractTypeId: string;
    formData: FormData;
    personnel: Person[];
    activeVersionId: string | null;
    setActiveVersionId: (id: string | null) => void;
    saveContract: (formData: FormData, versions: ContractVersion[], contractTypeId: string, personnel: Person[], activeVersionIndex: number | null) => Promise<SavedContract | null>;
    updateContract: (id: string, formData: FormData, versions: ContractVersion[], contractTypeId: string, personnel: Person[], activeVersionIndex: number | null) => Promise<boolean>;
    clearDraft: (typeId: string) => void;
    onResetForm: () => void;
    setFormData: (fd: FormData) => void;
    setPersonnel: (p: Person[]) => void;
    setPersonnelSsns: (s: Record<string, string>) => void;
    setSelectedContractTypeId: (id: string) => void;
    setIsOpeningContract: (v: boolean) => void;
    setDraftToRestore: (v: null) => void;
    setIsSwitchingType: (v: boolean) => void;
    contractType: ContractType | undefined;
};

export const useVersionManagement = (opts: UseVersionManagementOptions) => {
    const [currentVersions, setCurrentVersions] = useState<ContractVersion[]>([]);
    const [snapshotNote, setSnapshotNote] = useState<string>('');
    const [loadedContractId, setLoadedContractId] = useState<string | null>(null);

    const handleSaveVersion = useCallback(() => {
        if (!opts.contractType) return;
        const finalName = snapshotNote.trim() || `Version ${currentVersions.length + 1}`;

        const newVersion: ContractVersion = {
            id: new Date().toISOString(),
            name: finalName,
            formData: opts.formData,
            personnel: opts.personnel,
            createdAt: new Date().toISOString(),
            contractTypeId: opts.selectedContractTypeId,
        };
        setCurrentVersions(prev => [...prev, newVersion]);
        setSnapshotNote('');
        opts.setActiveVersionId(newVersion.id);
    }, [opts, snapshotNote, currentVersions.length]);

    const handleSaveContract = useCallback(async () => {
        if (!opts.contractType) return;

        // Compute activeVersionIndex from activeVersionId
        const versionIndex = opts.activeVersionId
            ? currentVersions.findIndex(v => v.id === opts.activeVersionId)
            : null;
        const activeIdx = versionIndex !== null && versionIndex >= 0 ? versionIndex : null;

        if (loadedContractId) {
            const success = await opts.updateContract(loadedContractId, opts.formData, currentVersions, opts.selectedContractTypeId, opts.personnel, activeIdx);
            if (success) {
                alert('Contract updated successfully!');
                opts.clearDraft(opts.selectedContractTypeId);
            }
        } else {
            const newContract = await opts.saveContract(opts.formData, currentVersions, opts.selectedContractTypeId, opts.personnel, activeIdx);
            if (newContract) {
                alert('Contract saved successfully!');
                setLoadedContractId(newContract.id);
                opts.clearDraft(opts.selectedContractTypeId);
            }
        }
    }, [opts, currentVersions, loadedContractId]);

    const handleSaveAsNew = useCallback(async () => {
        if (!opts.contractType) return;

        const versionIndex = opts.activeVersionId
            ? currentVersions.findIndex(v => v.id === opts.activeVersionId)
            : null;
        const activeIdx = versionIndex !== null && versionIndex >= 0 ? versionIndex : null;

        const newContract = await opts.saveContract(opts.formData, currentVersions, opts.selectedContractTypeId, opts.personnel, activeIdx);
        if (newContract) {
            alert('Contract saved as new copy!');
            setLoadedContractId(newContract.id);
            opts.clearDraft(opts.selectedContractTypeId);
        }
    }, [opts, currentVersions]);

    const handleResetContract = useCallback(() => {
        if (window.confirm('Are you sure you want to start a new contract? This will clear all fields and return to the selection screen.')) {
            opts.clearDraft(opts.selectedContractTypeId);
            opts.setSelectedContractTypeId('');
            opts.onResetForm();
        }
    }, [opts]);

    const handleLoadContract = useCallback((contract: SavedContract) => {
        const isChangingType = opts.selectedContractTypeId !== contract.contractTypeId;

        if (opts.selectedContractTypeId) {
            opts.clearDraft(opts.selectedContractTypeId);
        }

        if (isChangingType) {
            opts.setIsSwitchingType(true);
        }

        opts.setSelectedContractTypeId(contract.contractTypeId);
        opts.setFormData(contract.baseFormData);
        opts.setPersonnel(contract.personnel);
        opts.setPersonnelSsns({});
        setCurrentVersions(contract.versions);
        setLoadedContractId(contract.id);
        opts.setIsOpeningContract(false);
        opts.setDraftToRestore(null);
        // Restore the active version from the saved activeVersionIndex
        const savedIdx = contract.activeVersionIndex;
        if (savedIdx !== null && savedIdx !== undefined && savedIdx >= 0 && savedIdx < contract.versions.length) {
            opts.setActiveVersionId(contract.versions[savedIdx].id);
        } else if (contract.versions.length > 0) {
            opts.setActiveVersionId(contract.versions[contract.versions.length - 1].id);
        } else {
            opts.setActiveVersionId(null);
        }
        window.scrollTo(0, 0);
    }, [opts]);

    const handleDeleteCurrentVersion = useCallback((id: string) => {
        setCurrentVersions(prev => prev.filter(v => v.id !== id));
    }, []);

    const resetVersions = useCallback(() => {
        setCurrentVersions([]);
        setLoadedContractId(null);
        setSnapshotNote('');
    }, []);

    return {
        currentVersions,
        snapshotNote,
        setSnapshotNote,
        loadedContractId,
        handleSaveVersion,
        handleSaveContract,
        handleSaveAsNew,
        handleLoadContract,
        handleDeleteCurrentVersion,
        handleResetContract,
        resetVersions,
    };
};
