import { useState, useCallback } from 'react';
import type { ContractType, Person } from '../types';

type UsePersonnelRosterOptions = {
    onDirty: () => void;
};

export const getInitialPersonnel = (ct?: ContractType): Person[] =>
    ct ? [{ id: Date.now().toString(), name: '', address: '', presentForRehearsal: true, role: 'leader', doubling: false, cartage: false, cartageInstrumentId: '' }] : [];

export const usePersonnelRoster = ({ onDirty }: UsePersonnelRosterOptions) => {
    const [personnel, setPersonnel] = useState<Person[]>([]);
    const [personnelSsns, setPersonnelSsns] = useState<Record<string, string>>({});

    const handleAddMusician = useCallback(() => {
        setPersonnel(p => [...p, { id: Date.now().toString(), name: '', address: '', presentForRehearsal: true, role: 'sideperson', doubling: false, cartage: false, cartageInstrumentId: '' }]);
        onDirty();
    }, [onDirty]);

    const handleRemoveMusician = useCallback((id: string) => {
        setPersonnel(p => {
            const newPersonnel = p.filter(musician => musician.id !== id);
            if (newPersonnel.length > 0 && !newPersonnel.some(m => m.role === 'leader')) {
                newPersonnel[0].role = 'leader';
            }
            return newPersonnel;
        });
        setPersonnelSsns(s => { const newSsns = { ...s }; delete newSsns[id]; return newSsns; });
        onDirty();
    }, [onDirty]);

    const handlePersonnelChange = useCallback((id: string, field: keyof Omit<Person, 'id' | 'role'>, value: string | boolean) => {
        setPersonnel(p => p.map(musician => {
            if (musician.id !== id) return musician;
            const updatedMusician = { ...musician, [field]: value };
            if (field === 'cartage' && value === false) {
                updatedMusician.cartageInstrumentId = '';
            }
            return updatedMusician;
        }));
        onDirty();
    }, [onDirty]);

    const handleRoleChange = useCallback((leaderId: string) => {
        setPersonnel(p => p.map(musician => ({
            ...musician,
            role: musician.id === leaderId ? 'leader' : 'sideperson'
        })));
        onDirty();
    }, [onDirty]);

    const checkForDuplicateMusician = useCallback((id: string) => {
        // We read personnel inline via a state callback to avoid stale closures
        setPersonnel(currentPersonnel => {
            const currentMusician = currentPersonnel.find(p => p.id === id);
            if (!currentMusician || !currentMusician.name.trim() || !currentMusician.address.trim()) {
                return currentPersonnel;
            }

            const duplicate = currentPersonnel.find(p =>
                p.id !== id &&
                p.name.trim().toLowerCase() === currentMusician.name.trim().toLowerCase() &&
                p.address.trim().toLowerCase() === currentMusician.address.trim().toLowerCase()
            );

            if (duplicate) {
                if (window.confirm(`A musician named '${duplicate.name}' with the same address already exists. Would you like to remove this duplicate entry?`)) {
                    const newPersonnel = currentPersonnel.filter(musician => musician.id !== id);
                    if (newPersonnel.length > 0 && !newPersonnel.some(m => m.role === 'leader')) {
                        newPersonnel[0].role = 'leader';
                    }
                    return newPersonnel;
                }
            }
            return currentPersonnel;
        });
    }, []);

    const handleSsnChange = useCallback((id: string, value: string) => {
        setPersonnelSsns(s => ({ ...s, [id]: value }));
    }, []);

    const resetPersonnel = useCallback((ct?: ContractType) => {
        setPersonnel(getInitialPersonnel(ct));
        setPersonnelSsns({});
    }, []);

    return {
        personnel,
        setPersonnel,
        personnelSsns,
        setPersonnelSsns,
        handleAddMusician,
        handleRemoveMusician,
        handlePersonnelChange,
        handleRoleChange,
        checkForDuplicateMusician,
        handleSsnChange,
        resetPersonnel,
    };
};
