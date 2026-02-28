
import { useState, useEffect, useCallback } from 'react';
import type { SavedContract, ContractVersion, FormData, Person } from '../types';
import { useAuth } from '../contexts/AuthContext';

// Maps API response shape → internal SavedContract shape
const migratePersonnel = (personnel: any[] | undefined): Person[] =>
  (personnel || []).map((p: any, index: number) => {
    const { engagementTypeId, ...rest } = p;
    return {
      ...rest,
      id: p.id || `${Date.now()}-${index}`,
      presentForRehearsal: p.presentForRehearsal ?? true,
      role: p.role || (index === 0 ? 'leader' : 'sideperson'),
      doubling: p.doubling || false,
      cartage: p.cartage || false,
      cartageInstrumentId: p.cartageInstrumentId || '',
    };
  });

const apiToSavedContract = (c: any): SavedContract => ({
  id: c.id,
  name: c.name,
  contractTypeId: c.contractTypeId,
  baseFormData: c.baseFormData ?? {},
  personnel: migratePersonnel(c.personnel),
  createdAt: c.createdAt,
  updatedAt: c.updatedAt,
  versions: (c.versions || []).map((v: any) => ({
    id: v.id,
    name: v.name,
    contractTypeId: v.contractTypeId,
    formData: v.formData ?? {},
    personnel: migratePersonnel(v.personnel),
    createdAt: v.createdAt,
  })),
});

export const useContractStorage = (localId: number, userId: string) => {
  const { getAuthHeaders } = useAuth();
  const [savedContracts, setSavedContracts] = useState<SavedContract[]>([]);

  // Load contracts on mount
  useEffect(() => {
    if (!userId) {
      setSavedContracts([]);
      return;
    }
    const load = async () => {
      try {
        const res = await fetch(`/api/contracts?localId=${localId}`, {
          headers: getAuthHeaders(),
        });
        if (!res.ok) throw new Error('Failed to load');
        const data = await res.json();
        setSavedContracts((data.contracts || []).map(apiToSavedContract));
      } catch (err) {
        console.error('[useContractStorage] load failed', err);
        setSavedContracts([]);
      }
    };
    load();
  }, [localId, userId]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveContract = useCallback(
    async (baseFormData: FormData, _versions: ContractVersion[], contractTypeId: string, personnel: Person[]): Promise<SavedContract | null> => {
      const name = String(
        baseFormData.purchaserName || baseFormData.recordCompanyName ||
        baseFormData.artistName || 'Unnamed Contract'
      );
      const date = String(baseFormData.engagementDate || baseFormData.sessionDate || '');
      if (!date.trim()) {
        alert('Cannot save contract without an Engagement Date or Session Date.');
        return null;
      }
      if (!contractTypeId) {
        alert('Cannot save contract without a contract type.');
        return null;
      }
      try {
        const res = await fetch('/api/contracts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify({
            localId,
            contractTypeId,
            name: `${name} (${date})`,
            baseFormData,
            personnel,
          }),
        });
        if (!res.ok) throw new Error('Save failed');
        const data = await res.json();
        const contract = apiToSavedContract(data.contract);
        setSavedContracts(prev => [contract, ...prev]);
        return contract;
      } catch (err) {
        console.error('[useContractStorage] save failed', err);
        return null;
      }
    },
    [localId, getAuthHeaders] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const updateContract = useCallback(
    async (contractId: string, baseFormData: FormData, _versions: ContractVersion[], contractTypeId: string, personnel: Person[]): Promise<boolean> => {
      const name = String(
        baseFormData.purchaserName || baseFormData.recordCompanyName ||
        baseFormData.artistName || 'Unnamed Contract'
      );
      const date = String(baseFormData.engagementDate || baseFormData.sessionDate || '');
      try {
        const res = await fetch(`/api/contracts/${contractId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify({
            contractTypeId,
            name: `${name} (${date})`,
            baseFormData,
            personnel,
          }),
        });
        if (!res.ok) throw new Error('Update failed');
        const data = await res.json();
        const updated = apiToSavedContract(data.contract);
        setSavedContracts(prev => prev.map(c => (c.id === contractId ? updated : c)));
        return true;
      } catch (err) {
        console.error('[useContractStorage] update failed', err);
        return false;
      }
    },
    [getAuthHeaders] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const deleteContract = useCallback(
    async (id: string) => {
      try {
        await fetch(`/api/contracts/${id}`, {
          method: 'DELETE',
          headers: getAuthHeaders(),
        });
        setSavedContracts(prev => prev.filter(c => c.id !== id));
      } catch (err) {
        console.error('[useContractStorage] delete failed', err);
      }
    },
    [getAuthHeaders] // eslint-disable-line react-hooks/exhaustive-deps
  );

  return { savedContracts, saveContract, updateContract, deleteContract };
};
