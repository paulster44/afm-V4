import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import type { Config, ContractType, Field, FormData, CalculationResult, Rules, WageScale, Currency, ContractVersion, SavedContract, Person } from '../types';
import { useContractStorage } from '../hooks/useContractStorage';
import DynamicField from './DynamicField';
import Accordion from './Accordion';
import OpenContractModal from './OpenContractModal';
import { generatePdf } from '../services/pdfGenerator';

// Helper for currency formatting
const formatCurrency = (value: number, currencyCode: string, symbol: string) => {
    if (typeof value !== 'number' || isNaN(value)) {
        return `${symbol}0.00`;
    }
    const isNegative = value < 0;
    const fixedValue = Math.abs(value).toFixed(2);
    return isNegative ? `-${symbol}${fixedValue}` : `${symbol}${fixedValue}`;
};

// Calculation logic
const calculateEngagement = (formData: FormData, contractType: ContractType, personnel: Person[]): CalculationResult[] => {
    const { rules, calculationModel, wageScales } = contractType;
    if (!rules && calculationModel !== 'contribution_only') return [];
    
    const results: CalculationResult[] = [];
    const getVal = (id: string) => Number(formData[id]) || 0;

    const numberOfMusicians = personnel.length;
    const numberOfRehearsingMusicians = personnel.filter(p => p.presentForRehearsal ?? true).length;

    let totalScaleWages = 0, totalRehearsal = 0, totalOvertime = 0, pensionContribution = 0, healthContribution = 0;
    let totalPremiums = 0, totalCartage = 0, subtotalWages = 0, pensionableWages = 0, totalCost = 0;

    switch (calculationModel) {
        case 'live_engagement': {
            const engagementTypeId = formData.engagementType as string;
            const baseScale = wageScales?.find(s => s.id === engagementTypeId);

            if (baseScale) {
                personnel.forEach(person => {
                    const personScaleWage = baseScale.rate;
                    totalScaleWages += personScaleWage;

                    // --- Premiums ---
                    if (person.role === 'leader' && rules?.leaderPremium) {
                        totalPremiums += personScaleWage * (rules.leaderPremium.rate / 100);
                    }
                    if (person.doubling && rules?.doublingPremium) {
                        totalPremiums += personScaleWage * (rules.doublingPremium.rate / 100);
                    }
                });
                
                 // --- Cartage ---
                personnel.forEach(person => {
                    if (person.cartage && person.cartageInstrumentId) {
                        const cartageScale = wageScales?.find(s => s.id === person.cartageInstrumentId);
                        if (cartageScale) {
                            totalCartage += cartageScale.rate;
                        }
                    }
                });

                // --- Auto Overtime ---
                const autoOvertimeHours = Math.max(0, getVal('engagementDuration') - baseScale.duration);
                if (autoOvertimeHours > 0 && baseScale.duration > 0 && rules?.overtimeRate) {
                    const baseHourlyRate = baseScale.rate / baseScale.duration;
                    totalOvertime += autoOvertimeHours * baseHourlyRate * rules.overtimeRate * numberOfMusicians;
                }
                
                 // --- Manual Overtime ---
                const manualOvertimeHours = getVal('overtimeHours');
                if (manualOvertimeHours > 0 && rules?.overtimeRate && baseScale.duration > 0) {
                    const hourlyRate = baseScale.rate / baseScale.duration;
                    totalOvertime += manualOvertimeHours * hourlyRate * rules.overtimeRate * numberOfMusicians;
                }

            } else { // Manual scale logic for T-2 or if no scale selected
                 const totalScaleWagesPerMusician = getVal('totalScaleWages');
                const engagementDuration = getVal('engagementDuration');
                const overtimeHours = getVal('overtimeHours');
                totalScaleWages = totalScaleWagesPerMusician * numberOfMusicians;
                if (overtimeHours > 0 && engagementDuration > 0 && rules?.overtimeRate) {
                    const baseHourlyRate = totalScaleWagesPerMusician / engagementDuration;
                    totalOvertime = overtimeHours * baseHourlyRate * rules.overtimeRate * numberOfMusicians;
                }
            }
            
            totalRehearsal = getVal('rehearsalHours') * getVal('rehearsalRate') * numberOfRehearsingMusicians;
            
            results.push({ id: 'totalScaleWages', label: 'Total Base Scale Wages', value: totalScaleWages });
            if (totalPremiums > 0) results.push({ id: 'totalPremiums', label: 'Leader/Doubling Premiums', value: totalPremiums });
            if (totalCartage > 0) results.push({ id: 'totalCartage', label: 'Total Cartage', value: totalCartage });
            if (totalRehearsal > 0) results.push({ id: 'totalRehearsalPay', label: 'Total Rehearsal Pay', value: totalRehearsal });
            if (totalOvertime > 0) results.push({ id: 'totalOvertimePay', label: 'Total Overtime Pay', value: totalOvertime });
            
            subtotalWages = totalScaleWages + totalPremiums + totalCartage + totalRehearsal + totalOvertime;
            results.push({ id: 'subtotalWages', label: 'Subtotal Gross Wages', value: subtotalWages });
            break;
        }
        case 'media_report': {
            const scaleWagesPerSession = getVal('scaleWages');
            const numberOfServices = getVal('numberOfServices') || 1;
            const overtimeHours = getVal('overtimeHours');
            totalScaleWages = scaleWagesPerSession * numberOfMusicians * numberOfServices;
            if (overtimeHours > 0 && rules?.overtimeRate) {
                const baseHourlyRate = scaleWagesPerSession / 3;
                totalOvertime = overtimeHours * baseHourlyRate * rules.overtimeRate * numberOfMusicians;
            }
            results.push({ id: 'totalScaleWages', label: 'Total Session Wages', value: totalScaleWages });
            if (totalOvertime > 0) results.push({ id: 'overtimePay', label: 'Overtime Pay', value: totalOvertime });
            subtotalWages = totalScaleWages + totalOvertime;
            break;
        }
        case 'contribution_only': {
             pensionableWages = getVal('totalPensionableWages');
             const pensionPercentage = getVal('pensionContributionPercentage');
             healthContribution = getVal('healthContributionAmount');
             pensionContribution = pensionableWages * (pensionPercentage / 100);
             results.push({ id: 'pensionableWages', label: 'Total Pensionable Wages', value: pensionableWages });
             results.push({ id: 'pensionContribution', label: `Pension Contribution (${pensionPercentage}%)`, value: pensionContribution });
             if (healthContribution > 0) results.push({ id: 'healthContribution', label: 'Health Contribution', value: healthContribution });
             totalCost = pensionContribution + healthContribution;
             results.push({ id: 'totalContributions', label: 'Total Contributions Due', value: totalCost });
             return results;
        }
    }
    
    pensionableWages = totalScaleWages + totalPremiums + totalCartage + totalRehearsal + totalOvertime; // Pension is typically on all gross wages
    
    if (rules?.pensionContribution) {
        pensionContribution = pensionableWages * (rules.pensionContribution.rate / 100);
        results.push({ id: 'pensionContribution', label: `Pension (${rules.pensionContribution.description || `${rules.pensionContribution.rate}%`})`, value: pensionContribution });
    }
    if (rules?.healthContribution) {
        const services = calculationModel === 'media_report' ? (getVal('numberOfServices') || 1) : 1;
        healthContribution = rules.healthContribution.ratePerMusicianPerService * numberOfMusicians * services;
        results.push({ id: 'healthContribution', label: `Health & Welfare (${rules.healthContribution.description})`, value: healthContribution });
    }
    if (rules?.workDues) {
        results.push({ id: 'workDues', label: `Work Dues (${rules.workDues.description || `${rules.workDues.rate}%`})`, value: pensionableWages * (rules.workDues.rate / 100) });
    }
    
    const totalBenefits = pensionContribution + healthContribution;
    totalCost = subtotalWages + totalBenefits; // Work dues are typically deducted, not added to purchaser cost.
    
    if (calculationModel === 'live_engagement' && !wageScales) {
        const perDiem = getVal('perDiem') * numberOfMusicians;
        const travelExpenses = getVal('travelExpenses');
        if (perDiem > 0) results.push({id: 'totalPerDiem', label: 'Total Per Diem', value: perDiem });
        if (travelExpenses > 0) results.push({id: 'travelExpenses', label: 'Travel Expenses', value: travelExpenses });
        totalCost += perDiem + travelExpenses;
    }
    
    results.push({id: 'totalBenefits', label: 'Total Benefits', value: totalBenefits});
    results.push({id: 'totalEngagementCost', label: 'Total Engagement Cost', value: totalCost});
    return results;
};

type ContractWizardProps = {
    config: Config;
    userId: string;
};

const ContractWizard: React.FC<ContractWizardProps> = ({ config, userId }) => {
    const [selectedContractTypeId, setSelectedContractTypeId] = useState<string>('');
    const contractType = useMemo(() => config.contractTypes.find(c => c.id === selectedContractTypeId), [config.contractTypes, selectedContractTypeId]);
    
    const [formData, setFormData] = useState<FormData>({});
    const [personnel, setPersonnel] = useState<Person[]>([]);
    const [personnelSsns, setPersonnelSsns] = useState<Record<string, string>>({}); // Not persisted for security
    
    const [formErrors, setFormErrors] = useState<{ [key: string]: string }>({});
    const [openAccordion, setOpenAccordion] = useState<string | null>(null);
    const [isOpeningContract, setIsOpeningContract] = useState(false);
    const [contractTypeFilter, setContractTypeFilter] = useState('');
    
    const [currentVersions, setCurrentVersions] = useState<ContractVersion[]>([]);
    const [loadedContractId, setLoadedContractId] = useState<string | null>(null);
    const { savedContracts, saveContract, updateContract, deleteContract } = useContractStorage(config.localId, userId);

    const [draftToRestore, setDraftToRestore] = useState<{formData: FormData, personnel: Person[]} | null>(null);
    const draftSaveTimeoutRef = useRef<number | null>(null);

    const filteredContractTypes = useMemo(() => {
        if (!contractTypeFilter) {
            return config.contractTypes;
        }
        return config.contractTypes.filter(ct =>
            ct.name.toLowerCase().includes(contractTypeFilter.toLowerCase())
        );
    }, [config.contractTypes, contractTypeFilter]);

    const getInitialFormData = (ct?: ContractType): FormData => ct ? ct.fields.reduce((acc, field) => ({ ...acc, [field.id]: field.defaultValue ?? '' }), {}) : {};
    const getInitialPersonnel = (ct?: ContractType): Person[] => ct ? [{ id: Date.now().toString(), name: '', address: '', presentForRehearsal: true, role: 'leader', doubling: false, cartage: false, cartageInstrumentId: '' }] : [];
    
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

    const nextStepGroup = useMemo(() => {
        if (!contractType) return null;

        const isGroupComplete = (groupName: string): boolean => {
            const fieldsInGroup = fieldGroups[groupName] || [];
            if (groupName === 'Personnel') {
                if (personnel.length === 0) return false;
                const leader = personnel.find(p => p.role === 'leader');
                return !!(leader && leader.name.trim() !== '' && leader.address.trim() !== '');
            }
            if (fieldsInGroup.length === 0) return true;
            return fieldsInGroup.every(field => {
                if (!field.required) return true;
                const value = formData[field.id];
                if (value === undefined || value === null || value === '') return false;
                if (field.minLength && String(value).length < field.minLength) return false;
                return true;
            });
        };

        return orderedGroupNames.find(group => !isGroupComplete(group)) || null;
    }, [formData, personnel, contractType, fieldGroups, orderedGroupNames]);
    
    const clearDraft = (contractTypeIdToClear: string) => {
        if (contractTypeIdToClear) {
            const DRAFT_STORAGE_KEY = `afm_draft_contract_${config.localId}_${userId}_${contractTypeIdToClear}`;
            localStorage.removeItem(DRAFT_STORAGE_KEY);
        }
    };

    const resetForm = (ct?: ContractType) => {
        setFormData(getInitialFormData(ct));
        setPersonnel(getInitialPersonnel(ct));
        setPersonnelSsns({});
        setCurrentVersions([]);
        setLoadedContractId(null);
        setFormErrors({});
        setOpenAccordion(ct ? orderedGroupNames[0] : null);
    };

    useEffect(() => {
        if (!contractType || draftToRestore) return; 
        
        if (draftSaveTimeoutRef.current) {
            clearTimeout(draftSaveTimeoutRef.current);
        }

        draftSaveTimeoutRef.current = window.setTimeout(() => {
            const DRAFT_STORAGE_KEY = `afm_draft_contract_${config.localId}_${userId}_${selectedContractTypeId}`;
            const draft = { formData, personnel };
            const isFormEmpty = Object.values(formData).every(v => v === '') && (personnel.length === 1 && !personnel[0]?.name && !personnel[0]?.address);
            if (!isFormEmpty) {
                 localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
            }
        }, 500);

        return () => {
            if (draftSaveTimeoutRef.current) {
                clearTimeout(draftSaveTimeoutRef.current);
            }
        };
    }, [formData, personnel, contractType, config.localId, userId, selectedContractTypeId, draftToRestore]);

    const handleManualTypeChange = (newTypeId: string) => {
        const newContractType = config.contractTypes.find(c => c.id === newTypeId);
        
        const DRAFT_STORAGE_KEY = `afm_draft_contract_${config.localId}_${userId}_${newTypeId}`;
        const savedDraftJson = localStorage.getItem(DRAFT_STORAGE_KEY);
        
        setSelectedContractTypeId(newTypeId);

        if (savedDraftJson) {
            try {
                const savedDraft = JSON.parse(savedDraftJson);
                setFormData(savedDraft.formData); 
                setPersonnel(savedDraft.personnel);
                setDraftToRestore(savedDraft);
            } catch (e) {
                console.error("Failed to parse draft", e);
                localStorage.removeItem(DRAFT_STORAGE_KEY);
                setDraftToRestore(null);
                resetForm(newContractType);
            }
        } else {
            setDraftToRestore(null);
            resetForm(newContractType);
        }
    };

    const handleRestoreDraft = () => {
        setDraftToRestore(null);
    };

    const handleDismissDraft = () => {
        if (contractType) {
            clearDraft(selectedContractTypeId);
            setDraftToRestore(null);
            resetForm(contractType);
        }
    };

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

    const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      if (event.key === 'Enter' && !event.shiftKey && !(event.target instanceof HTMLTextAreaElement)) {
        event.preventDefault();
        if (!openAccordion || !contractType) return;
        
        const isCurrentGroupComplete = (groupName: string): boolean => {
            const fieldsInGroup = fieldGroups[groupName] || [];
            if (fieldsInGroup.length === 0) return true;
            return fieldsInGroup.every(field => {
                if (!field.required) return true;
                const value = formData[field.id];
                if (value === '' || value === undefined || value === null) return false;
                if (field.minLength && String(value).length < field.minLength) return false;
                return true;
            });
        };

        if (isCurrentGroupComplete(openAccordion)) {
          const groupNames = orderedGroupNames;
          const currentIdx = groupNames.indexOf(openAccordion);
          if (currentIdx > -1 && currentIdx < groupNames.length - 1) {
            setOpenAccordion(groupNames[currentIdx + 1]);
          }
        }
      }
    };

    const handleChange = (id: string, value: string | number) => setFormData(prev => ({ ...prev, [id]: value }));
    const calculationResults = useMemo(() => contractType ? calculateEngagement(formData, contractType, personnel) : [], [formData, contractType, personnel]);
    const currency = contractType?.currency || config.currency;

    const handlePdfGeneration = () => contractType && generatePdf(config, contractType, formData, calculationResults, personnel);

    const handleSaveVersion = () => {
        if (!contractType) return;
        const totalCostResult = calculationResults.find(r => r.id === 'totalEngagementCost');
        const newVersion: ContractVersion = {
            id: new Date().toISOString(),
            name: `Version @ ${formatCurrency(totalCostResult?.value ?? 0, currency.code, currency.symbol)}`,
            formData,
            personnel,
            createdAt: new Date().toISOString(),
            contractTypeId: selectedContractTypeId,
        };
        setCurrentVersions(prev => [...prev, newVersion]);
    };
    
    const handleSaveContract = () => {
        if (!contractType) return;

        if (loadedContractId) {
            const success = updateContract(loadedContractId, formData, currentVersions, selectedContractTypeId, personnel);
            if (success) {
                alert('Contract updated successfully!');
                clearDraft(selectedContractTypeId);
            }
        } else {
            const newContract = saveContract(formData, currentVersions, selectedContractTypeId, personnel);
            if (newContract) {
                alert('Contract saved successfully!');
                setLoadedContractId(newContract.id);
                clearDraft(selectedContractTypeId);
            }
        }
    };

    const handleResetContract = () => {
      if (window.confirm('Are you sure you want to start a new contract? This will clear all fields and return to the selection screen.')) {
        clearDraft(selectedContractTypeId);
        setSelectedContractTypeId('');
        resetForm();
      }
    };
    
    const handleLoadContract = (contract: SavedContract) => {
        if (selectedContractTypeId) {
            clearDraft(selectedContractTypeId);
        }
        setSelectedContractTypeId(contract.contractTypeId);
        setFormData(contract.baseFormData);
        setPersonnel(contract.personnel);
        setPersonnelSsns({});
        setCurrentVersions(contract.versions);
        setLoadedContractId(contract.id);
        setIsOpeningContract(false);
        setDraftToRestore(null);
        window.scrollTo(0, 0);
    };
    
    const handleDeleteCurrentVersion = (id: string) => setCurrentVersions(prev => prev.filter(v => v.id !== id));
    
    const handleAddMusician = () => setPersonnel(p => [...p, { id: Date.now().toString(), name: '', address: '', presentForRehearsal: true, role: 'sideperson', doubling: false, cartage: false, cartageInstrumentId: '' }]);
    const handleRemoveMusician = (id: string) => {
        setPersonnel(p => {
           const newPersonnel = p.filter(musician => musician.id !== id);
           if (newPersonnel.length > 0 && !newPersonnel.some(m => m.role === 'leader')) {
               newPersonnel[0].role = 'leader';
           }
           return newPersonnel;
        });
        setPersonnelSsns(s => { const newSsns = {...s}; delete newSsns[id]; return newSsns; });
    }
    const handlePersonnelChange = (id: string, field: keyof Omit<Person, 'id' | 'role'>, value: string | boolean) => {
        setPersonnel(p => p.map(musician => {
            if (musician.id !== id) return musician;
            const updatedMusician = { ...musician, [field]: value };
            if(field === 'cartage' && value === false) {
                updatedMusician.cartageInstrumentId = '';
            }
            return updatedMusician;
        }));
    }
    const handleRoleChange = (leaderId: string) => {
        setPersonnel(p => p.map(musician => ({
            ...musician,
            role: musician.id === leaderId ? 'leader' : 'sideperson'
        })));
    };

    const checkForDuplicateMusician = (id: string) => {
        const currentMusician = personnel.find(p => p.id === id);
        if (!currentMusician || !currentMusician.name.trim() || !currentMusician.address.trim()) {
            return;
        }

        const duplicate = personnel.find(p =>
            p.id !== id &&
            p.name.trim().toLowerCase() === currentMusician.name.trim().toLowerCase() &&
            p.address.trim().toLowerCase() === currentMusician.address.trim().toLowerCase()
        );
        
        if (duplicate) {
            if (window.confirm(`A musician named '${duplicate.name}' with the same address already exists. Would you like to remove this duplicate entry?`)) {
                handleRemoveMusician(id);
            }
        }
    };
    
    const handleSsnChange = (id: string, value: string) => setPersonnelSsns(s => ({ ...s, [id]: value }));
    
    return (
        <>
            {isOpeningContract && <OpenContractModal isOpen={isOpeningContract} onClose={() => setIsOpeningContract(false)} savedContracts={savedContracts} onLoadContract={handleLoadContract} onDeleteContract={deleteContract} />}

            {!contractType ? (
                <div className="bg-gray-800 p-8 rounded-lg shadow-lg text-center">
                    <h2 className="text-2xl font-bold text-gray-100 mb-4">Welcome</h2>
                    <p className="text-gray-300 mb-6">Please select a contract type to begin, or open a saved contract.</p>

                    <div className="max-w-md mx-auto mb-4">
                        <label htmlFor="contract-search" className="sr-only">Search contracts</label>
                        <input
                            id="contract-search"
                            type="text"
                            placeholder="Search contract types..."
                            value={contractTypeFilter}
                            onChange={(e) => setContractTypeFilter(e.target.value)}
                            className="w-full px-3 py-2 text-base text-white placeholder-gray-400 bg-gray-700 border border-gray-600 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                            aria-label="Search for a contract type"
                        />
                    </div>
                    
                    <select
                        value={selectedContractTypeId}
                        onChange={(e) => handleManualTypeChange(e.target.value)}
                        className="max-w-md mx-auto mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-600 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md bg-gray-700"
                    >
                        <option value="" disabled>-- Choose a Contract --</option>
                        {filteredContractTypes.map(ct => <option key={ct.id} value={ct.id}>{ct.name}</option>)}
                    </select>

                    {filteredContractTypes.length === 0 && contractTypeFilter && (
                      <p className="text-sm text-gray-400 mt-2">No contract types match your search.</p>
                    )}

                    <div className="mt-6">
                        <p className="text-sm text-gray-400 mb-2">or</p>
                        <button onClick={() => setIsOpeningContract(true)} className="w-full max-w-md mx-auto bg-gray-500 text-white font-bold py-2 px-4 rounded-md hover:bg-gray-600">Open a Saved Contract</button>
                    </div>
                </div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
                    <div className="lg:col-span-2 space-y-6">
                        {draftToRestore && (
                            <div className="bg-indigo-900/70 border border-indigo-700 text-white p-4 rounded-lg shadow-lg flex justify-between items-center">
                                <div>
                                    <h4 className="font-bold">Unsaved Work Found</h4>
                                    <p className="text-sm text-gray-300">Would you like to continue where you left off?</p>
                                </div>
                                <div className="flex space-x-2">
                                    <button onClick={handleRestoreDraft} className="px-3 py-1 text-xs font-medium text-white bg-green-600 rounded-md hover:bg-green-700 transition">Continue</button>
                                    <button onClick={handleDismissDraft} className="px-3 py-1 text-xs font-medium text-white bg-gray-600 rounded-md hover:bg-gray-700 transition">Start New</button>
                                </div>
                            </div>
                        )}
                        <div className="bg-gray-800 p-6 rounded-lg shadow-lg">
                            <label htmlFor="contract-type" className="block text-sm font-medium text-gray-300">Contract Type</label>
                            <select id="contract-type" value={selectedContractTypeId} onChange={(e) => handleManualTypeChange(e.target.value)} className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-600 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md bg-gray-700">
                                {config.contractTypes.map(ct => <option key={ct.id} value={ct.id}>{ct.name}</option>)}
                            </select>
                        </div>
                        <div className="bg-gray-800 rounded-lg shadow-lg">
                            {orderedGroupNames.map((groupName) => (
                                <Accordion 
                                    key={groupName} 
                                    title={groupName} 
                                    isOpen={openAccordion === groupName} 
                                    onToggle={() => setOpenAccordion(openAccordion === groupName ? null : groupName)}
                                    isNextStep={openAccordion !== groupName && nextStepGroup === groupName}
                                >
                                    
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2">
                                        {fieldGroups[groupName]?.map(field => {
                                            const wageScalesForField = field.dataSource === 'wageScales' 
                                              ? (field.id === 'engagementType' ? performanceScales : contractType.wageScales) 
                                              : undefined;
                                            return <DynamicField key={field.id} field={field} formData={formData} handleChange={handleChange} wageScales={wageScalesForField} currencySymbol={currency.symbol} error={formErrors[field.id]} onKeyDown={handleKeyDown} />
                                        })}
                                    </div>

                                    {groupName === 'Personnel' && (
                                        <div className={`space-y-4 ${fieldGroups['Personnel']?.length > 0 ? 'mt-6 border-t border-gray-700 pt-6' : ''}`}>
                                            {personnel.map((p, index) => (
                                                <div key={p.id} className="p-4 border border-gray-700 rounded-lg space-y-4 relative bg-gray-900/50">
                                                    <div className="flex justify-between items-start">
                                                        <h4 className="font-semibold text-gray-200 text-lg flex items-center">
                                                            <label className="flex items-center cursor-pointer">
                                                                <input
                                                                    type="radio"
                                                                    name="leader-selection"
                                                                    checked={p.role === 'leader'}
                                                                    onChange={() => handleRoleChange(p.id)}
                                                                    className="h-5 w-5 text-indigo-500 border-gray-500 bg-gray-700 focus:ring-indigo-500"
                                                                />
                                                                <span className="ml-3">
                                                                    {p.role === 'leader' ? 'Leader' : `Musician #${index + 1}`}
                                                                </span>
                                                            </label>
                                                        </h4>
                                                        {personnel.length > 1 && <button onClick={() => handleRemoveMusician(p.id)} className="text-red-500 hover:text-red-400 text-xs font-bold p-1 -mt-2 -mr-2" aria-label={`Remove ${p.name || `Musician #${index + 1}`}`}>REMOVE</button>}
                                                    </div>
                                                    
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                        <div>
                                                            <label className="text-xs text-gray-400 block mb-1">Name</label>
                                                            <input type="text" value={p.name} onChange={e => handlePersonnelChange(p.id, 'name', e.target.value)} onBlur={() => checkForDuplicateMusician(p.id)} className="block w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-md shadow-sm focus:outline-none sm:text-sm"/>
                                                        </div>
                                                        <div>
                                                            <label className="text-xs text-gray-400 block mb-1">Address</label>
                                                            <input type="text" value={p.address} onChange={e => handlePersonnelChange(p.id, 'address', e.target.value)} onBlur={() => checkForDuplicateMusician(p.id)} className="block w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-md shadow-sm focus:outline-none sm:text-sm"/>
                                                        </div>
                                                    </div>
                                                   
                                                    <div className="border-t border-gray-700 pt-4 space-y-3">
                                                         <h5 className="text-sm font-semibold text-gray-300">Options</h5>
                                                         <div className="grid grid-cols-2 gap-4">
                                                            <label className="flex items-center"><input type="checkbox" checked={p.doubling} onChange={e => handlePersonnelChange(p.id, 'doubling', e.target.checked)} className="h-4 w-4 rounded border-gray-500 bg-gray-700 text-indigo-600 focus:ring-indigo-500" /> <span className="ml-2 text-sm">Doubling</span></label>
                                                            <label className="flex items-center"><input type="checkbox" checked={p.cartage} onChange={e => handlePersonnelChange(p.id, 'cartage', e.target.checked)} className="h-4 w-4 rounded border-gray-500 bg-gray-700 text-indigo-600 focus:ring-indigo-500" /> <span className="ml-2 text-sm">Cartage</span></label>
                                                            <label className="flex items-center"><input type="checkbox" checked={p.presentForRehearsal ?? true} onChange={(e) => handlePersonnelChange(p.id, 'presentForRehearsal', e.target.checked)} className="h-4 w-4 rounded border-gray-500 bg-gray-700 text-indigo-600 focus:ring-indigo-500"/> <span className="ml-2 text-sm">Present for Rehearsal</span></label>
                                                         </div>
                                                         {p.cartage && (
                                                            <div>
                                                                <label htmlFor={`cartage-${p.id}`} className="text-xs text-gray-400 block mb-1">Cartage Instrument</label>
                                                                <select id={`cartage-${p.id}`} value={p.cartageInstrumentId} onChange={e => handlePersonnelChange(p.id, 'cartageInstrumentId', e.target.value)} className="block w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-md shadow-sm focus:outline-none sm:text-sm">
                                                                    <option value="">-- Select Instrument --</option>
                                                                    {cartageScales.map(scale => <option key={scale.id} value={scale.id}>{scale.name}</option>)}
                                                                </select>
                                                            </div>
                                                         )}
                                                    </div>

                                                    <div>
                                                        <label className="text-xs text-gray-400 block mb-1">SSN / SIN (not saved, for PDF only)</label>
                                                        <input type="text" value={personnelSsns[p.id] || ''} onChange={e => handleSsnChange(p.id, e.target.value)} className="block w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-md shadow-sm focus:outline-none sm:text-sm" placeholder="Enter on final PDF for security"/>
                                                    </div>
                                                </div>
                                            ))}
                                            <button onClick={handleAddMusician} className="w-full text-sm bg-indigo-600 text-white font-bold py-2 px-4 rounded-md hover:bg-indigo-700">+ Add Musician</button>
                                        </div>
                                    )}

                                </Accordion>
                            ))}
                        </div>
                    </div>
                    <div className="lg:col-span-1 space-y-6 sticky top-6">
                        <div className="bg-gray-800 p-6 rounded-lg shadow-lg">
                            <h3 className="text-lg font-bold text-white mb-4">Calculation Summary</h3>
                            {calculationResults.length > 0 ? (
                                <ul className="space-y-2">{calculationResults.map(item => <li key={item.id} className="flex justify-between items-center text-sm border-b border-gray-700 py-2"><span className="text-gray-300">{item.label}</span><span className="font-semibold text-gray-100">{formatCurrency(item.value, currency.code, currency.symbol)}</span></li>)}</ul>
                            ) : <p className="text-sm text-gray-400">Enter details to see calculations.</p>}
                        </div>
                        <div className="bg-gray-800 p-6 rounded-lg shadow-lg space-y-3">
                            <h3 className="text-lg font-bold text-white">Actions</h3>
                            <button onClick={handleSaveVersion} className="w-full bg-indigo-600 text-white font-bold py-2 px-4 rounded-md hover:bg-indigo-700">Save Version</button>
                            <button onClick={handleSaveContract} className="w-full bg-blue-600 text-white font-bold py-2 px-4 rounded-md hover:bg-blue-700">{loadedContractId ? 'Update Contract' : 'Save Contract'}</button>
                            <div className="border-t border-gray-700 !my-4"></div>
                            <button onClick={() => setIsOpeningContract(true)} className="w-full bg-gray-500 text-white font-bold py-2 px-4 rounded-md hover:bg-gray-600">Open Contract</button>
                            <button onClick={handlePdfGeneration} className="w-full bg-green-600 text-white font-bold py-2 px-4 rounded-md hover:bg-green-700">Generate PDF</button>
                            <div className="border-t border-gray-700 !my-4"></div>
                            <button onClick={handleResetContract} className="w-full bg-red-600 text-white font-bold py-2 px-4 rounded-md hover:bg-red-700">Start New Contract</button>
                        </div>
                        {currentVersions.length > 0 && (
                            <div className="bg-gray-800 p-6 rounded-lg shadow-lg">
                                <h3 className="text-lg font-bold text-white mb-4">Current Versions</h3>
                                <ul className="space-y-2 max-h-48 overflow-y-auto pr-2">{currentVersions.map(v => (
                                    <li key={v.id} className="p-2 bg-gray-700 rounded-md flex justify-between items-center text-sm">
                                        <span className="font-medium text-gray-200">{v.name}</span>
                                        <div className="flex space-x-2">
                                            <button onClick={() => { setFormData(v.formData); setPersonnel(v.personnel) }} className="text-blue-500 hover:text-blue-700">Load</button>
                                            <button onClick={() => handleDeleteCurrentVersion(v.id)} className="text-red-500 hover:text-red-700">Del</button>
                                        </div>
                                    </li>
                                ))}</ul>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </>
    );
};
export default ContractWizard;