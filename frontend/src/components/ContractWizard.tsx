

import React, { useState, useEffect, useMemo, useRef } from 'react';
import type { Config, ContractType, Field, FormData, CalculationResult, ContractVersion, SavedContract, Person } from '../types';
import { useContractStorage } from '../hooks/useContractStorage';
import DynamicField from './DynamicField';
import Accordion from './Accordion';
import OpenContractModal from './OpenContractModal';
import EmailModal from './EmailModal';
import { generatePdf } from '../services/pdfGenerator';
import { auth } from '../utils/firebase';

// Helper for currency formatting
const formatCurrency = (value: number, _currencyCode: string, symbol: string) => {
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
        if (perDiem > 0) results.push({ id: 'totalPerDiem', label: 'Total Per Diem', value: perDiem });
        if (travelExpenses > 0) results.push({ id: 'travelExpenses', label: 'Travel Expenses', value: travelExpenses });
        totalCost += perDiem + travelExpenses;
    }

    // --- Dynamic Currency Fields (e.g., Tips, Custom Costs) ---
    const ignoredCurrencyFields = ['rehearsalRate', 'scaleWages', 'totalScaleWages', 'perDiem', 'travelExpenses', 'healthContributionAmount', 'pensionContributionPercentage'];
    contractType.fields.forEach(field => {
        if (field.type === 'currency' && !ignoredCurrencyFields.includes(field.id)) {
            const val = getVal(field.id);
            if (val > 0) {
                results.push({ id: field.id, label: field.label, value: val });
                totalCost += val;
            }
        }
    });

    results.push({ id: 'totalBenefits', label: 'Total Benefits', value: totalBenefits });
    results.push({ id: 'totalEngagementCost', label: 'Total Engagement Cost', value: totalCost });
    return results;
};

type ContractWizardProps = {
    config: Config;
    userId: string;
};

const ContractWizard: React.FC<ContractWizardProps> = ({ config, userId }) => {
    const [selectedContractTypeId, setSelectedContractTypeId] = useState<string>(config.contractTypes[0]?.id ?? '');
    const contractType = useMemo(() => config.contractTypes.find(c => c.id === selectedContractTypeId), [config.contractTypes, selectedContractTypeId]);

    const [formData, setFormData] = useState<FormData>({});
    const [personnel, setPersonnel] = useState<Person[]>([]);
    const [personnelSsns, setPersonnelSsns] = useState<Record<string, string>>({}); // Not persisted for security

    const [formErrors, setFormErrors] = useState<{ [key: string]: string }>({});
    const [openAccordion, setOpenAccordion] = useState<string | null>(null);
    const [isOpeningContract, setIsOpeningContract] = useState(false);
    const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
    const [isSendingEmail, setIsSendingEmail] = useState(false);
    const [contractTypeFilter, setContractTypeFilter] = useState('');

    const [currentVersions, setCurrentVersions] = useState<ContractVersion[]>([]);
    const [loadedContractId, setLoadedContractId] = useState<string | null>(null);
    const { savedContracts, saveContract, updateContract, deleteContract } = useContractStorage(config.localId, userId);

    const [draftToRestore, setDraftToRestore] = useState<{ formData: FormData, personnel: Person[] } | null>(null);
    const [activeVersionId, setActiveVersionId] = useState<string | null>(null);
    const [snapshotNote, setSnapshotNote] = useState<string>('');
    const draftSaveTimeoutRef = useRef<number | null>(null);
    const [isSwitchingType, setIsSwitchingType] = useState(false);

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
        setActiveVersionId(null);
        setSnapshotNote('');
    };

    useEffect(() => {
        if (isSwitchingType) {
            setIsSwitchingType(false);
        }
    }, [selectedContractTypeId]);

    useEffect(() => {
        if (!contractType || draftToRestore || isSwitchingType) return;

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
    }, [formData, personnel, contractType, config.localId, userId, selectedContractTypeId, draftToRestore, isSwitchingType]);

    const handleManualTypeChange = (newTypeId: string) => {
        if (newTypeId === selectedContractTypeId) {
            return;
        }
        setIsSwitchingType(true);

        const newContractType = config.contractTypes.find(c => c.id === newTypeId);

        const DRAFT_STORAGE_KEY = `afm_draft_contract_${config.localId}_${userId}_${newTypeId}`;
        const savedDraftJson = localStorage.getItem(DRAFT_STORAGE_KEY);

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

        setSelectedContractTypeId(newTypeId);
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
            const currentGroupFields = fieldGroups[openAccordion] || [];
            const isSectionComplete = currentGroupFields.every(field => {
                if (!field.required) return true;
                const value = formData[field.id];
                if (value === '' || value === undefined || value === null) return false;
                if (field.minLength && String(value).length < field.minLength) return false;
                return true;
            });
            if (isSectionComplete) {
                const groupNames = orderedGroupNames;
                const currentIdx = groupNames.indexOf(openAccordion);
                if (currentIdx > -1 && currentIdx < groupNames.length - 1) {
                    setOpenAccordion(groupNames[currentIdx + 1]);
                }
            }
        }
    };

    const handleChange = (id: string, value: string | number) => {
        setFormData(prev => ({ ...prev, [id]: value }));
        setActiveVersionId(null);
    };
    const calculationResults = useMemo(() => contractType ? calculateEngagement(formData, contractType, personnel) : [], [formData, contractType, personnel]);
    const currency = contractType?.currency || config.currency;

    const handlePdfGeneration = () => {
        if (!contractType) return;
        const { blob, fileName } = generatePdf(config, contractType, formData, calculationResults, personnel);

        // Trigger download
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const handleEmailPdf = async (email: string, message: string) => {
        if (!contractType) return;

        setIsSendingEmail(true);
        try {
            const { blob, fileName } = generatePdf(config, contractType, formData, calculationResults, personnel);

            const currentUser = auth.currentUser;
            const token = currentUser ? await currentUser.getIdToken() : '';

            const formDataPayload = new FormData();
            formDataPayload.append('to', email);
            formDataPayload.append('message', message);
            formDataPayload.append('pdf', blob, fileName);

            // Allow the user to specify a subject
            const subject = `Smart Contract PDF: ${fileName.replace('.pdf', '')}`;
            formDataPayload.append('subject', subject);

            // If we are developing locally, port 8080 usually handles the API
            // Production will route /api nicely, but dev might need explicit mapping
            const apiUrl = import.meta.env.DEV ? 'http://localhost:8080/api/email' : '/api/email';

            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                    // Do NOT set Content-Type header with FormData, fetch handles the boundary automatically
                },
                body: formDataPayload
            });

            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.error || 'Failed to send email');
            }

            alert('Email sent successfully!');
            setIsEmailModalOpen(false);
        } catch (error: any) {
            console.error("Email send error:", error);
            alert(`Error sending email: ${error.message}`);
        } finally {
            setIsSendingEmail(false);
        }
    };

    const handleSaveVersion = () => {
        if (!contractType) return;
        const finalName = snapshotNote.trim() || `Version ${currentVersions.length + 1}`;

        const newVersion: ContractVersion = {
            id: new Date().toISOString(),
            name: finalName,
            formData,
            personnel,
            createdAt: new Date().toISOString(),
            contractTypeId: selectedContractTypeId,
        };
        setCurrentVersions(prev => [...prev, newVersion]);
        setSnapshotNote('');
        setActiveVersionId(newVersion.id);
    };

    const handleSaveContract = async () => {
        if (!contractType) return;

        // Compute activeVersionIndex from activeVersionId
        const versionIndex = activeVersionId
            ? currentVersions.findIndex(v => v.id === activeVersionId)
            : null;
        const activeIdx = versionIndex !== null && versionIndex >= 0 ? versionIndex : null;

        if (loadedContractId) {
            const success = await updateContract(loadedContractId, formData, currentVersions, selectedContractTypeId, personnel, activeIdx);
            if (success) {
                alert('Contract updated successfully!');
                clearDraft(selectedContractTypeId);
            }
        } else {
            const newContract = await saveContract(formData, currentVersions, selectedContractTypeId, personnel, activeIdx);
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
        const isChangingType = selectedContractTypeId !== contract.contractTypeId;

        if (selectedContractTypeId) {
            clearDraft(selectedContractTypeId);
        }

        if (isChangingType) {
            setIsSwitchingType(true);
        }

        setSelectedContractTypeId(contract.contractTypeId);
        setFormData(contract.baseFormData);
        setPersonnel(contract.personnel);
        setPersonnelSsns({});
        setCurrentVersions(contract.versions);
        setLoadedContractId(contract.id);
        setIsOpeningContract(false);
        setDraftToRestore(null);
        // Restore the active version from the saved activeVersionIndex
        const savedIdx = contract.activeVersionIndex;
        if (savedIdx !== null && savedIdx !== undefined && savedIdx >= 0 && savedIdx < contract.versions.length) {
            setActiveVersionId(contract.versions[savedIdx].id);
        } else if (contract.versions.length > 0) {
            setActiveVersionId(contract.versions[contract.versions.length - 1].id);
        } else {
            setActiveVersionId(null);
        }
        window.scrollTo(0, 0);
    };

    const handleDeleteCurrentVersion = (id: string) => setCurrentVersions(prev => prev.filter(v => v.id !== id));

    const handleAddMusician = () => {
        setPersonnel(p => [...p, { id: Date.now().toString(), name: '', address: '', presentForRehearsal: true, role: 'sideperson', doubling: false, cartage: false, cartageInstrumentId: '' }]);
        setActiveVersionId(null);
    };
    const handleRemoveMusician = (id: string) => {
        setPersonnel(p => {
            const newPersonnel = p.filter(musician => musician.id !== id);
            if (newPersonnel.length > 0 && !newPersonnel.some(m => m.role === 'leader')) {
                newPersonnel[0].role = 'leader';
            }
            return newPersonnel;
        });
        setPersonnelSsns(s => { const newSsns = { ...s }; delete newSsns[id]; return newSsns; });
        setActiveVersionId(null);
    }
    const handlePersonnelChange = (id: string, field: keyof Omit<Person, 'id' | 'role'>, value: string | boolean) => {
        setPersonnel(p => p.map(musician => {
            if (musician.id !== id) return musician;
            const updatedMusician = { ...musician, [field]: value };
            if (field === 'cartage' && value === false) {
                updatedMusician.cartageInstrumentId = '';
            }
            return updatedMusician;
        }));
        setActiveVersionId(null);
    }
    const handleRoleChange = (leaderId: string) => {
        setPersonnel(p => p.map(musician => ({
            ...musician,
            role: musician.id === leaderId ? 'leader' : 'sideperson'
        })));
        setActiveVersionId(null);
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
            <EmailModal
                isOpen={isEmailModalOpen}
                onClose={() => setIsEmailModalOpen(false)}
                onSend={handleEmailPdf}
                isSending={isSendingEmail}
            />

            {!contractType ? (
                <div className="bg-slate-800/90 p-8 rounded-lg shadow-xl text-center border border-slate-700">
                    <h2 className="text-2xl font-bold font-serif text-slate-100 mb-4 tracking-wide">Welcome</h2>
                    <p className="text-slate-300 mb-6 font-light">Please select a contract type to begin, or open a saved contract.</p>

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

                    <div className="mt-6 pt-6 border-t border-slate-700">
                        <p className="text-sm text-slate-400 mb-3 uppercase tracking-wider font-semibold">or</p>
                        <button onClick={() => setIsOpeningContract(true)} className="w-full max-w-md mx-auto bg-slate-600 text-white font-bold py-2.5 px-4 rounded-md hover:bg-slate-500 transition-colors shadow-sm">Open a Saved Contract</button>
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
                        <div className="bg-slate-800 p-6 rounded-lg shadow-lg border border-slate-700">
                            <label htmlFor="contract-type" className="block text-sm font-medium text-slate-300 mb-2">Contract Type</label>
                            <select id="contract-type" value={selectedContractTypeId} onChange={(e) => handleManualTypeChange(e.target.value)} className="mt-1 block w-full pl-3 pr-10 py-2.5 text-base border-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 sm:text-sm rounded-md bg-slate-900 text-slate-50 shadow-sm transition-shadow">
                                {config.contractTypes.map(ct => <option key={ct.id} value={ct.id}>{ct.name}</option>)}
                            </select>
                        </div>
                        <div className="bg-slate-800 rounded-lg shadow-lg border border-slate-700 overflow-hidden">
                            {orderedGroupNames.map((groupName) => (
                                <Accordion key={groupName} title={groupName} isOpen={openAccordion === groupName} onToggle={() => setOpenAccordion(p => p === groupName ? null : groupName)}>

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
                                                <div key={p.id} className="p-5 border border-slate-700 rounded-lg space-y-4 relative bg-slate-900/50 shadow-inner">
                                                    <div className="flex justify-between items-start">
                                                        <h4 className="font-semibold font-serif text-slate-200 text-lg flex items-center">
                                                            <label className="flex items-center cursor-pointer group">
                                                                <input
                                                                    type="radio"
                                                                    name="leader-selection"
                                                                    checked={p.role === 'leader'}
                                                                    onChange={() => handleRoleChange(p.id)}
                                                                    className="h-5 w-5 text-emerald-500 border-slate-500 bg-slate-800 focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 transition-colors cursor-pointer"
                                                                />
                                                                <span className="ml-3 group-hover:text-emerald-400 transition-colors">
                                                                    {p.role === 'leader' ? 'Leader' : `Musician #${index + 1}`}
                                                                </span>
                                                            </label>
                                                        </h4>
                                                        {personnel.length > 1 && <button onClick={() => handleRemoveMusician(p.id)} className="text-red-400 hover:text-red-300 transition-colors text-xs font-bold p-1 -mt-2 -mr-2 uppercase tracking-wide" aria-label={`Remove ${p.name || `Musician #${index + 1}`}`}>REMOVE</button>}
                                                    </div>

                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                                        <div>
                                                            <label className="text-xs text-slate-400 block mb-1.5 uppercase tracking-wider font-semibold">Name</label>
                                                            <input type="text" value={p.name} onChange={e => handlePersonnelChange(p.id, 'name', e.target.value)} onBlur={() => checkForDuplicateMusician(p.id)} className="block w-full px-4 py-2 min-h-[44px] leading-normal appearance-none bg-slate-900 border border-slate-600 rounded-md shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 text-slate-50 sm:text-sm transition-shadow" />
                                                        </div>
                                                        <div>
                                                            <label className="text-xs text-slate-400 block mb-1.5 uppercase tracking-wider font-semibold">Address</label>
                                                            <input type="text" value={p.address} onChange={e => handlePersonnelChange(p.id, 'address', e.target.value)} onBlur={() => checkForDuplicateMusician(p.id)} className="block w-full px-4 py-2 min-h-[44px] leading-normal appearance-none bg-slate-900 border border-slate-600 rounded-md shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 text-slate-50 sm:text-sm transition-shadow" />
                                                        </div>
                                                    </div>

                                                    <div className="border-t border-slate-700 pt-5 space-y-4">
                                                        <h5 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">Options</h5>
                                                        <div className="grid grid-cols-2 gap-5">
                                                            <label className="flex items-center cursor-pointer group"><input type="checkbox" checked={p.doubling} onChange={e => handlePersonnelChange(p.id, 'doubling', e.target.checked)} className="h-4.5 w-4.5 rounded border-slate-500 bg-slate-800 text-emerald-500 focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 cursor-pointer" /> <span className="ml-2.5 text-sm text-slate-300 group-hover:text-slate-100 transition-colors">Doubling</span></label>
                                                            <label className="flex items-center cursor-pointer group"><input type="checkbox" checked={p.cartage} onChange={e => handlePersonnelChange(p.id, 'cartage', e.target.checked)} className="h-4.5 w-4.5 rounded border-slate-500 bg-slate-800 text-emerald-500 focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 cursor-pointer" /> <span className="ml-2.5 text-sm text-slate-300 group-hover:text-slate-100 transition-colors">Cartage</span></label>
                                                            <label className="flex items-center cursor-pointer group"><input type="checkbox" checked={p.presentForRehearsal ?? true} onChange={(e) => handlePersonnelChange(p.id, 'presentForRehearsal', e.target.checked)} className="h-4.5 w-4.5 rounded border-slate-500 bg-slate-800 text-emerald-500 focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 cursor-pointer" /> <span className="ml-2.5 text-sm text-slate-300 group-hover:text-slate-100 transition-colors">Present for Rehearsal</span></label>
                                                        </div>
                                                        {p.cartage && (
                                                            <div className="mt-4">
                                                                <label htmlFor={`cartage-${p.id}`} className="text-xs text-slate-400 block mb-1.5 uppercase tracking-wider font-semibold">Cartage Instrument</label>
                                                                <select id={`cartage-${p.id}`} value={p.cartageInstrumentId} onChange={e => handlePersonnelChange(p.id, 'cartageInstrumentId', e.target.value)} className="block w-full px-4 py-2 bg-slate-900 border border-slate-600 rounded-md shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 sm:text-sm transition-shadow text-slate-50">
                                                                    <option value="">-- Select Instrument --</option>
                                                                    {cartageScales.map(scale => <option key={scale.id} value={scale.id}>{scale.name}</option>)}
                                                                </select>
                                                            </div>
                                                        )}
                                                    </div>

                                                    <div className="mt-2">
                                                        <label className="text-xs text-slate-400 block mb-1.5 uppercase tracking-wider font-semibold">SSN / SIN (not saved, for PDF only)</label>
                                                        <input type="text" value={personnelSsns[p.id] || ''} onChange={e => handleSsnChange(p.id, e.target.value)} className="block w-full px-4 py-2 min-h-[44px] leading-normal appearance-none bg-slate-900 border border-slate-600 rounded-md shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 sm:text-sm transition-shadow text-slate-50 placeholder-slate-500" placeholder="Enter on final PDF for security" />
                                                    </div>
                                                </div>
                                            ))}
                                            <button onClick={handleAddMusician} className="w-full text-sm bg-slate-700 text-white font-bold py-2.5 px-4 rounded-md hover:bg-slate-600 transition-colors shadow-sm">+ Add Musician</button>
                                        </div>
                                    )}

                                </Accordion>
                            ))}
                        </div>
                    </div>
                    <div className="lg:col-span-1 space-y-6 sticky top-6">
                        <div className="bg-slate-800 border border-slate-700 p-6 rounded-lg shadow-xl">
                            <h3 className="text-xl font-bold font-serif text-slate-100 mb-5 tracking-wide">Calculation Summary</h3>
                            {calculationResults.length > 0 ? (
                                <ul className="space-y-3">{calculationResults.map(item => <li key={item.id} className="flex justify-between items-center text-sm border-b border-slate-700/50 pb-2"><span className="text-slate-300 font-medium">{item.label}</span><span className="font-bold text-slate-100">{formatCurrency(item.value, currency.code, currency.symbol)}</span></li>)}</ul>
                            ) : <p className="text-sm text-slate-400 italic">Enter details to see calculations.</p>}
                        </div>
                        <div className="bg-slate-800 border border-slate-700 p-6 rounded-lg shadow-xl space-y-4">
                            <h3 className="text-xl font-bold font-serif text-slate-100 mb-2 tracking-wide">Actions</h3>

                            <div className="space-y-2 border-b border-slate-700 pb-5">
                                <label className="block text-xs font-medium text-slate-400">Save Current Snapshot</label>
                                <input
                                    type="text"
                                    placeholder="Note for snapshot (optional)"
                                    value={snapshotNote}
                                    onChange={(e) => setSnapshotNote(e.target.value)}
                                    className="block w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-50 sm:text-sm"
                                />
                                <button onClick={handleSaveVersion} className="w-full bg-slate-700 text-slate-100 font-bold py-2.5 px-4 rounded-md hover:bg-slate-600 transition-colors shadow-sm">Save Version Snapshot</button>
                            </div>

                            <button onClick={handleSaveContract} className="w-full bg-indigo-600 text-white font-bold py-2.5 px-4 rounded-md hover:bg-indigo-500 transition-colors shadow-sm mt-4">{loadedContractId ? 'Update Master Contract' : 'Save Master Contract'}</button>
                            <div className="border-t border-slate-700 !my-5"></div>
                            <button onClick={() => setIsOpeningContract(true)} className="w-full bg-slate-600 text-white font-bold py-2.5 px-4 rounded-md hover:bg-slate-500 transition-colors shadow-sm">Open Contract</button>
                            <div className="flex space-x-3">
                                <button onClick={handlePdfGeneration} className="w-1/2 bg-emerald-600 text-white font-bold py-3 px-4 rounded-md hover:bg-emerald-500 transition-colors shadow-md text-base">Download PDF</button>
                                <button onClick={() => setIsEmailModalOpen(true)} className="w-1/2 bg-sky-600 text-white font-bold py-3 px-4 rounded-md hover:bg-sky-500 transition-colors shadow-md text-base">Email PDF</button>
                            </div>
                            <div className="border-t border-slate-700 !my-5"></div>
                            <button onClick={handleResetContract} className="w-full bg-red-600/90 text-white font-bold py-2.5 px-4 rounded-md hover:bg-red-500 transition-colors shadow-sm">Start New Contract</button>
                        </div>
                        {currentVersions.length > 0 && (
                            <div className="bg-slate-800 p-6 rounded-lg shadow-lg border border-slate-700">
                                <h3 className="text-lg font-bold text-slate-200 mb-4">Saved Snapshots</h3>
                                <ul className="space-y-2 max-h-48 overflow-y-auto pr-2">{currentVersions.map(v => {
                                    const vResults = contractType ? calculateEngagement(v.formData, contractType, v.personnel) : [];
                                    const vTotal = vResults.find(r => r.id === 'totalEngagementCost');
                                    const vCostStr = formatCurrency(vTotal?.value ?? 0, currency.code, currency.symbol);
                                    return (
                                        <li key={v.id} className={`p-3 rounded-md flex justify-between items-center text-sm ${activeVersionId === v.id ? 'bg-indigo-900/60 border border-indigo-500/50' : 'bg-slate-900 border border-slate-700'}`}>
                                            <span className="font-medium text-slate-200 flex items-center gap-2">
                                                {v.name} ({vCostStr})
                                                {activeVersionId === v.id && (
                                                    <span className="text-emerald-400 text-xs ml-1 bg-emerald-900/40 px-2 py-0.5 rounded-full border border-emerald-800" title="Active Version">★ Active</span>
                                                )}
                                            </span>
                                            <div className="flex space-x-3 text-xs font-semibold uppercase tracking-wider">
                                                <button onClick={() => { setFormData(v.formData); setPersonnel(v.personnel); setActiveVersionId(v.id); window.scrollTo(0, 0); }} className="text-indigo-400 hover:text-indigo-300">Load</button>
                                                <button onClick={() => handleDeleteCurrentVersion(v.id)} className="text-red-400 hover:text-red-300">Del</button>
                                            </div>
                                        </li>
                                    );
                                })}</ul>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </>
    );
};
export default ContractWizard;