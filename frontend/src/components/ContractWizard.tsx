import React, { useState, useMemo, useCallback, useEffect } from 'react';
import type { Config, ContractType, FormData, Person, SavedContract } from '../types';
import { useContractStorage } from '../hooks/useContractStorage';
import { useContractForm } from '../hooks/useContractForm';
import { usePersonnelRoster } from '../hooks/usePersonnelRoster';
import { useDraftPersistence } from '../hooks/useDraftPersistence';
import { useVersionManagement } from '../hooks/useVersionManagement';
import { useWizardNavigation } from '../hooks/useWizardNavigation';
import WizardProgress from './WizardProgress';
import WizardStepView from './WizardStepView';
import WizardReviewStep from './WizardReviewStep';
import OpenContractModal from './OpenContractModal';
import EmailModal from './EmailModal';
import { generatePdf } from '../services/pdfGenerator';
import { auth } from '../utils/firebase';
import { calculateEngagement } from '../utils/calculations';

type ContractWizardProps = {
    config: Config;
    userId: string;
    pendingContract?: SavedContract | null;
    onPendingContractConsumed?: () => void;
};

const ContractWizard: React.FC<ContractWizardProps> = ({ config, userId, pendingContract, onPendingContractConsumed }) => {
    // Ensure contractTypes is always an array (DB configs may omit it)
    if (!config.contractTypes) config.contractTypes = [];

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
    const { savedContracts, saveContract, updateContract, deleteContract } = useContractStorage(config.localId, userId, config.localName);

    // --- Form state & validation ---
    const {
        formData, setFormData, formErrors,
        fieldGroups, orderedGroupNames, performanceScales, cartageScales, feeCategories,
        handleChange, resetFormState,
    } = useContractForm({ contractType, onDirty });

    // --- Personnel roster ---
    const {
        personnel, setPersonnel, personnelSsns, setPersonnelSsns,
        handleAddMusician, handleRemoveMusician, handlePersonnelChange,
        handleRoleChange, checkForDuplicateMusician, handleSsnChange,
        resetPersonnel,
    } = usePersonnelRoster({ onDirty });

    // --- Wizard navigation ---
    const wizard = useWizardNavigation({
        orderedGroupNames,
        formData,
        stepMeta: contractType?.stepMeta,
    });

    // --- Orchestrated reset (called by draft and version hooks) ---
    const resetForm = useCallback((ct?: ContractType) => {
        resetFormState(ct);
        resetPersonnel(ct);
        setActiveVersionId(null);
        wizard.resetNavigation();
    }, [resetFormState, resetPersonnel, wizard.resetNavigation]);

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

    // --- Load pending contract from LocalSelector ---
    useEffect(() => {
        if (pendingContract) {
            versions.handleLoadContract(pendingContract);
            onPendingContractConsumed?.();
        }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // --- Email history ---
    type EmailLogEntry = { id: string; recipientEmail: string; referenceNumber: string; subject: string; sentAt: string };
    const [emailHistory, setEmailHistory] = useState<EmailLogEntry[]>([]);

    const fetchEmailHistory = useCallback(async (contractId: string) => {
        try {
            const token = auth.currentUser ? await auth.currentUser.getIdToken() : '';
            const res = await fetch(`/api/contracts/${contractId}/emails`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok) {
                const data = await res.json();
                setEmailHistory(data.emailLogs);
            }
        } catch (err) {
            console.error('Failed to fetch email history:', err);
        }
    }, []);

    useEffect(() => {
        if (versions.loadedContractId) {
            fetchEmailHistory(versions.loadedContractId);
            // Navigate to review step when a contract is loaded
            wizard.goToStep(wizard.visibleSteps.length - 1);
        } else {
            setEmailHistory([]);
        }
    }, [versions.loadedContractId]); // eslint-disable-line react-hooks/exhaustive-deps

    // --- Calculations ---
    const calculationResults = useMemo(() => contractType ? calculateEngagement(formData, contractType, personnel) : [], [formData, contractType, personnel]);
    const currency = contractType?.currency || config.currency;

    // --- PDF / Email ---
    const contractName = useMemo(() => {
        const name = String(formData.purchaserName || formData.recordCompanyName || formData.artistName || '');
        const date = String(formData.engagementDate || formData.sessionDate || '');
        return name && date ? `${name} (${date})` : name || date || '';
    }, [formData]);

    const handlePdfGeneration = () => {
        if (!contractType) return;
        const { blob, fileName } = generatePdf(config, contractType, formData, calculationResults, personnel, contractName);

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
            const { blob, fileName } = generatePdf(config, contractType, formData, calculationResults, personnel, contractName);

            const currentUser = auth.currentUser;
            const token = currentUser ? await currentUser.getIdToken() : '';

            const formDataPayload = new FormData();
            formDataPayload.append('to', email);
            formDataPayload.append('message', message);
            formDataPayload.append('pdf', blob, fileName);

            const subject = `Smart Contract PDF: ${fileName.replace('.pdf', '')}`;
            formDataPayload.append('subject', subject);

            const refMatch = fileName.match(/ref_(.+)\.pdf$/i);
            const referenceNumber = refMatch ? refMatch[1] : fileName.replace('.pdf', '');

            if (versions.loadedContractId) {
                formDataPayload.append('contractId', versions.loadedContractId);
                formDataPayload.append('referenceNumber', referenceNumber);
            }

            const response = await fetch('/api/email', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
                body: formDataPayload
            });

            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.error || 'Failed to send email');
            }

            alert('Email sent successfully!');
            setIsEmailModalOpen(false);

            if (versions.loadedContractId) {
                fetchEmailHistory(versions.loadedContractId);
            }
        } catch (error: any) {
            console.error("Email send error:", error);
            alert(`Error sending email: ${error.message}`);
        } finally {
            setIsSendingEmail(false);
        }
    };

    // --- Version load handler ---
    const handleLoadVersion = useCallback((vFormData: FormData, vPersonnel: Person[], vId: string) => {
        setFormData(vFormData);
        setPersonnel(vPersonnel);
        setActiveVersionId(vId);
        window.scrollTo(0, 0);
    }, [setFormData, setPersonnel]);

    return (
        <>
            {isOpeningContract && <OpenContractModal isOpen={isOpeningContract} onClose={() => setIsOpeningContract(false)} savedContracts={savedContracts} onLoadContract={(contract) => { versions.handleLoadContract(contract); }} onDeleteContract={deleteContract} />}
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
                <div className="max-w-3xl mx-auto space-y-6">
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

                    <div className="bg-slate-800 p-4 rounded-lg shadow-lg border border-slate-700">
                        <div className="flex items-end gap-3">
                            <div className="flex-1">
                                <label htmlFor="contract-type" className="block text-sm font-medium text-slate-300 mb-2">Contract Type</label>
                                <select id="contract-type" value={selectedContractTypeId} onChange={(e) => handleManualTypeChange(e.target.value)} className="block w-full pl-3 pr-10 py-2.5 text-base border-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 sm:text-sm rounded-md bg-slate-900 text-slate-50 shadow-sm transition-shadow">
                                    {config.contractTypes.map(ct => <option key={ct.id} value={ct.id}>{ct.name}</option>)}
                                </select>
                            </div>
                            <button onClick={() => setIsOpeningContract(true)} className="px-4 py-2.5 bg-slate-600 text-white text-sm font-semibold rounded-md hover:bg-slate-500 transition-colors shadow-sm whitespace-nowrap">Open Saved</button>
                        </div>
                    </div>

                    <WizardProgress
                        steps={wizard.visibleSteps}
                        currentIndex={wizard.currentStepIndex}
                        onStepClick={wizard.goToStep}
                    />

                    {wizard.isReviewStep ? (
                        <WizardReviewStep
                            fieldGroups={fieldGroups}
                            orderedGroupNames={orderedGroupNames}
                            formData={formData}
                            personnel={personnel}
                            calculationResults={calculationResults}
                            currency={currency}
                            feeCategories={feeCategories}
                            visibleSteps={wizard.visibleSteps}
                            onEditStep={wizard.goToStep}
                            onBack={wizard.goBack}
                            onSaveContract={versions.handleSaveContract}
                            onSaveAsNew={versions.handleSaveAsNew}
                            onDownloadPdf={handlePdfGeneration}
                            onEmailPdf={() => setIsEmailModalOpen(true)}
                            onOpenContract={() => setIsOpeningContract(true)}
                            onResetContract={versions.handleResetContract}
                            isExistingContract={!!versions.loadedContractId}
                            versions={versions.currentVersions}
                            activeVersionId={activeVersionId}
                            snapshotNote={versions.snapshotNote}
                            onSnapshotNoteChange={versions.setSnapshotNote}
                            onSaveVersion={versions.handleSaveVersion}
                            onLoadVersion={handleLoadVersion}
                            onDeleteVersion={versions.handleDeleteCurrentVersion}
                            emailHistory={emailHistory}
                        />
                    ) : (
                        <WizardStepView
                            groupName={wizard.currentStepName}
                            fields={fieldGroups[wizard.currentStepName] || []}
                            formData={formData}
                            formErrors={formErrors}
                            stepErrors={{}}

                            handleChange={handleChange}
                            stepMeta={contractType.stepMeta}
                            personnel={personnel}
                            personnelSsns={personnelSsns}
                            handleAddMusician={handleAddMusician}
                            handleRemoveMusician={handleRemoveMusician}
                            handlePersonnelChange={handlePersonnelChange}
                            handleRoleChange={handleRoleChange}
                            checkForDuplicateMusician={checkForDuplicateMusician}
                            handleSsnChange={handleSsnChange}
                            cartageScales={cartageScales}
                            feeCategories={feeCategories}
                            currency={currency}
                            performanceScales={performanceScales}
                            allWageScales={contractType.wageScales}
                            isFirstStep={wizard.isFirstStep}
                            isLastStep={wizard.isLastStep}
                            onNext={wizard.goNext}
                            onBack={wizard.goBack}
                        />
                    )}
                </div>
            )}
        </>
    );
};
export default ContractWizard;
