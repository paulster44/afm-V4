import { useState, useEffect, useCallback } from 'react';
import type { SavedContract, ContractVersion, FormData, Person } from '../types';

const getStorageKey = (localId: number, userId: string) => `afm_saved_contracts_${userId}_${localId}`;

export const useContractStorage = (localId: number, userId: string) => {
  const [savedContracts, setSavedContracts] = useState<SavedContract[]>([]);

  useEffect(() => {
    if (!userId) {
        setSavedContracts([]);
        return;
    }
    try {
      const storageKey = getStorageKey(localId, userId);
      const item = window.localStorage.getItem(storageKey);
      if (item) {
        const contracts: SavedContract[] = JSON.parse(item);
        
        const migratePersonnel = (personnel: any[] | undefined): Person[] => {
            return (personnel || []).map((p, index) => {
                const { engagementTypeId, ...rest } = p; // Destructure to remove the old field
                return {
                    ...rest,
                    id: p.id || `${Date.now()}-${index}`, // Ensure ID exists
                    presentForRehearsal: p.presentForRehearsal ?? true,
                    role: p.role || (index === 0 ? 'leader' : 'sideperson'),
                    doubling: p.doubling || false,
                    cartage: p.cartage || false,
                    cartageInstrumentId: p.cartageInstrumentId || '',
                };
            });
        };

        const migratedContracts = contracts.map(c => ({
          ...c,
          personnel: migratePersonnel(c.personnel),
          versions: (c.versions || []).map(v => ({...v, personnel: migratePersonnel(v.personnel)}))
        }));
        
        setSavedContracts(migratedContracts);
      } else {
        setSavedContracts([]);
      }
    } catch (error) {
      console.error("Failed to load contracts from localStorage", error);
      setSavedContracts([]);
    }
  }, [localId, userId]);

  const saveContract = useCallback((baseFormData: FormData, versions: ContractVersion[], contractTypeId: string, personnel: Person[]): SavedContract | null => {
    const name = String(baseFormData.purchaserName || baseFormData.recordCompanyName || baseFormData.artistName || 'Unnamed Contract');
    const date = String(baseFormData.engagementDate || baseFormData.sessionDate);

    if (!date || date.trim() === '') {
        alert("Cannot save contract without an Engagement Date or Session Date.");
        return null;
    }
    
    if (!contractTypeId) {
        alert("Cannot save contract without a contract type.");
        return null;
    }

    const newContract: SavedContract = {
      id: new Date().toISOString(),
      name: `${name} (${date})`,
      baseFormData,
      versions,
      contractTypeId,
      personnel,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    setSavedContracts(prev => {
      const updatedContracts = [newContract, ...prev];
      try {
        window.localStorage.setItem(getStorageKey(localId, userId), JSON.stringify(updatedContracts));
      } catch (error) {
        console.error("Failed to save contracts to localStorage", error);
      }
      return updatedContracts;
    });
    return newContract;
  }, [localId, userId]);

  const updateContract = useCallback((contractId: string, baseFormData: FormData, versions: ContractVersion[], contractTypeId: string, personnel: Person[]): boolean => {
     setSavedContracts(prev => {
      const updatedContracts = prev.map(c => {
        if (c.id === contractId) {
          const name = String(baseFormData.purchaserName || baseFormData.recordCompanyName || baseFormData.artistName || 'Unnamed Contract');
          const date = String(baseFormData.engagementDate || baseFormData.sessionDate);
          return {
            ...c,
            name: `${name} (${date})`,
            baseFormData,
            versions,
            contractTypeId,
            personnel,
            updatedAt: new Date().toISOString()
          };
        }
        return c;
      });
      try {
        window.localStorage.setItem(getStorageKey(localId, userId), JSON.stringify(updatedContracts));
      } catch (error) {
        console.error("Failed to update contracts in localStorage", error);
      }
      return updatedContracts;
    });
    return true;
  }, [localId, userId]);

  const deleteContract = useCallback((id: string) => {
    setSavedContracts(prev => {
      const updatedContracts = prev.filter(c => c.id !== id);
      try {
        window.localStorage.setItem(getStorageKey(localId, userId), JSON.stringify(updatedContracts));
      } catch (error) {
        console.error("Failed to update contracts in localStorage", error);
      }
      return updatedContracts;
    });
  }, [localId, userId]);

  return { savedContracts, saveContract, updateContract, deleteContract };
};
