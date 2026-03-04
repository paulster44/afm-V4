import React, { useState, useMemo, useCallback } from 'react';
import type { Config, ContractType, FormData, Person } from '../types';
import { useContractStorage } from '../hooks/useContractStorage';
import { useContractForm } from '../hooks/useContractForm';
import { usePersonnelRoster } from '../hooks/usePersonnelRoster';
import { useDraftPersistence } from '../hooks/useDraftPersistence';
import { useVersionManagement } from '../hooks/useVersionManagement';
import DynamicField from './DynamicField';
import Accordion from './Accordion';
import OpenContractModal from './OpenContractModal';
import EmailModal from './EmailModal';
import { generatePdf } from '../services/pdfGenerator';
import { auth } from '../utils/firebase';
import { formatCurrency, calculateEngagement } from '../utils/calculations';

type ContractWizardProps = {
    config: Config;
    userId: string;
};

const ContractWizard: React.FC<ContractWizardProps> = ({ config, userId }) => {
    // --- Contract type selection ---
    const [selectedContractTypeId, setSelectedContractTypeId] = useState<string>(config.contractTypes[0]?.id ?? '');
    const contractType = useMemo(() => config.contractTypes.find(c => c.id === selectedContractTypeId), [config.contractTypes, selectedContractTypeId]);
    const [contractTypeFilter, setContractTypeFilter] = useState('');
    const filteredContractTypes = useMemo(() => {
        if (!contractTypeFilter) return config.contractTypes;
        return config.contractTypes.filter(ct =>
            ct.name.toLowerCase().includes(contractTypeFilter.toLowerCase())
        );
    }, [config.contractTypes, contractTypeFilter]);

    // --- Dirty flag (stays here to avoid circular deps between hooks) ---
    const [activeVersionId, setActiveVersionId] = useState<string | null>(null);
    const onDirty = useCallback(() => setActiveVersionId(null), []);

    // --- Storage ---
    const { savedContracts, saveContract, updateContract, deleteContract } = useContractStorage(config.localId, userId);

    // --- Form state & validation ---
    const {
        formData, setFormData, formErrors, openAccordion, setOpenAccordion,
        fieldGroups, orderedGroupNames, performanceScales, cartageScales,
        handleChange, handleKeyDown, resetFormState,
    } = useContractForm({ contractType, onDirty });

    // --- Personnel roster ---
    const {
        personnel, setPersonnel, personnelSsns, setPersonnelSsns,
        handleAddMusician, handleRemoveMusician, handlePersonnelChange,
        handleRoleChange, checkForDuplicateMusician, handleSsnChange,
        resetPersonnel,
    } = usePersonnelRoster({ onDirty });

    // --- Orchestrated reset (called by draft and version hooks) ---
    const resetForm = useCallback((ct?: ContractType) => {
        resetFormState(ct);
        resetPersonnel(ct);
        setActiveVersionId(null);
        // Version reset is handled separately by the version hook
    }, [resetFormState, resetPersonnel]);

    // --- UI state ---
    const [isOpeningContract, setIsOpeningContract] = useState(false);
    const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
    const [isSendingEmail, setIsSendingEmail] = useState(false);

    // --- Draft persistence ---
    const {
        draftToRestore, setDraftToRestore, setIsSwitchingType,
        clearDraft, handleManualTypeChange, handleRestoreDraft, handleDismissDraft,
    } = useDraftPersistence({
        localId: config.localId,
        userId,
        contractType,
        selectedContractTypeId,
        formData,
        personnel,
        configContractTypes: config.contractTypes,
        onResetForm: (ct?: ContractType) => {
            resetForm(ct);
            versions.resetVersions();
        },
        onRestoreFormData: setFormData,
        onRestorePersonnel: setPersonnel,
        onSetSelectedContractTypeId: setSelectedContractTypeId,
    });

    // --- Version / snapshot management ---
    const versions = useVersionManagement({
        selectedContractTypeId,
        formData,
        personnel,
        activeVersionId,
        setActiveVersionId,
        saveContract,
        updateContract,
        clearDraft,
        onResetForm: () => {
            resetForm();
            versions.resetVersions();
        },
        setFormData,
        setPersonnel,
        setPersonnelSsns: () => setPersonnelSsns({}),
        setSelectedContractTypeId,
        setIsOpeningContract,
        setDraftToRestore: () => setDraftToRestore(null),
        setIsSwitchingType,
        contractType,
    });

    // --- Calculations ---
    const calculationResults = useMemo(() => contractType ? calculateEngagement(formData, contractType, personnel) : [], [formData, contractType, personnel]);
    const currency = contractType?.currency || config.currency;

    // --- PDF / Email ---
    const handlePdfGeneration = () => {
        if (!contractType) return;
        const { blob, fileName } = generatePdf(config, contractType, formData, calculationResults, personnel);

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

            const subject = `Smart Contract PDF: ${fileName.replace('.pdf', '')}`;
            formDataPayload.append('subject', subject);

            const apiUrl = '/api/email';

            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
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

    // --- Version load handler (inline in JSX, formalized here) ---
    const handleLoadVersion = useCallback((vFormData: FormData, vPersonnel: Person[], vId: string) => {
        setFormData(vFormData);
        setPersonnel(vPersonnel);
        setActiveVersionId(vId);
        window.scrollTo(0, 0);
    }, [setFormData, setPersonnel]);

    return (
        <>
            {isOpeningContract && <OpenContractModal isOpen={isOpeningContract} onClose={() => setIsOpeningContract(false)} savedContracts={savedContracts} onLoadContract={versions.handleLoadContract} onDeleteContract={deleteContract} />}
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
                                    value={versions.snapshotNote}
                                    onChange={(e) => versions.setSnapshotNote(e.target.value)}
                                    className="block w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-50 sm:text-sm"
                                />
                                <button onClick={versions.handleSaveVersion} className="w-full bg-slate-700 text-slate-100 font-bold py-2.5 px-4 rounded-md hover:bg-slate-600 transition-colors shadow-sm">Save Version Snapshot</button>
                            </div>

                            <button onClick={versions.handleSaveContract} className="w-full bg-indigo-600 text-white font-bold py-2.5 px-4 rounded-md hover:bg-indigo-500 transition-colors shadow-sm mt-4">{versions.loadedContractId ? 'Update Master Contract' : 'Save Master Contract'}</button>
                            <div className="border-t border-slate-700 !my-5"></div>
                            <button onClick={() => setIsOpeningContract(true)} className="w-full bg-slate-600 text-white font-bold py-2.5 px-4 rounded-md hover:bg-slate-500 transition-colors shadow-sm">Open Contract</button>
                            <div className="flex space-x-3">
                                <button onClick={handlePdfGeneration} className="w-1/2 bg-emerald-600 text-white font-bold py-3 px-4 rounded-md hover:bg-emerald-500 transition-colors shadow-md text-base">Download PDF</button>
                                <button onClick={() => setIsEmailModalOpen(true)} className="w-1/2 bg-sky-600 text-white font-bold py-3 px-4 rounded-md hover:bg-sky-500 transition-colors shadow-md text-base">Email PDF</button>
                            </div>
                            <div className="border-t border-slate-700 !my-5"></div>
                            <button onClick={versions.handleResetContract} className="w-full bg-red-600/90 text-white font-bold py-2.5 px-4 rounded-md hover:bg-red-500 transition-colors shadow-sm">Start New Contract</button>
                        </div>
                        {versions.currentVersions.length > 0 && (
                            <div className="bg-slate-800 p-6 rounded-lg shadow-lg border border-slate-700">
                                <h3 className="text-lg font-bold text-slate-200 mb-4">Saved Snapshots</h3>
                                <ul className="space-y-2 max-h-48 overflow-y-auto pr-2">{versions.currentVersions.map(v => {
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
                                                <button onClick={() => handleLoadVersion(v.formData, v.personnel, v.id)} className="text-indigo-400 hover:text-indigo-300">Load</button>
                                                <button onClick={() => versions.handleDeleteCurrentVersion(v.id)} className="text-red-400 hover:text-red-300">Del</button>
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
