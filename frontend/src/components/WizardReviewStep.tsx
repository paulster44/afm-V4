import React from 'react';
import type { Field, FormData, Person, CalculationResult, Currency, ContractVersion, AdditionalFee } from '../types';
import { formatCurrency } from '../utils/calculations';

type EmailLogEntry = { id: string; recipientEmail: string; referenceNumber: string; subject: string; sentAt: string };

type WizardReviewStepProps = {
    fieldGroups: Record<string, Field[]>;
    orderedGroupNames: string[];
    formData: FormData;
    personnel: Person[];
    calculationResults: CalculationResult[];
    currency: Currency;
    feeCategories: Record<string, AdditionalFee[]>;
    // Step navigation
    visibleSteps: string[];
    onEditStep: (index: number) => void;
    onBack: () => void;
    // Actions
    onSaveContract: () => void;
    onSaveAsNew?: () => void;
    onDownloadPdf: () => void;
    onEmailPdf: () => void;
    onOpenContract: () => void;
    onResetContract: () => void;
    isExistingContract: boolean;
    // Versions
    versions: ContractVersion[];
    activeVersionId: string | null;
    snapshotNote: string;
    onSnapshotNoteChange: (note: string) => void;
    onSaveVersion: () => void;
    onLoadVersion: (formData: FormData, personnel: Person[], id: string) => void;
    onDeleteVersion: (id: string) => void;
    // Email history
    emailHistory: EmailLogEntry[];
};

const WizardReviewStep: React.FC<WizardReviewStepProps> = ({
    fieldGroups, orderedGroupNames, formData, personnel, calculationResults, currency,
    feeCategories, visibleSteps, onEditStep, onBack,
    onSaveContract, onSaveAsNew, onDownloadPdf, onEmailPdf, onOpenContract, onResetContract,
    isExistingContract, versions, activeVersionId, snapshotNote, onSnapshotNoteChange,
    onSaveVersion, onLoadVersion, onDeleteVersion, emailHistory,
}) => {
    const getDisplayValue = (field: Field, value: string | number): string => {
        if (value === '' || value === undefined || value === null) return '-';
        if (field.type === 'currency') return `${currency.symbol}${Number(value).toFixed(2)}`;
        return String(value);
    };

    return (
        <div className="space-y-6">
            {/* Data summary by step */}
            <div className="bg-slate-800 rounded-lg shadow-lg border border-slate-700 overflow-hidden">
                <div className="p-6 border-b border-slate-700">
                    <h2 className="text-xl font-bold font-serif text-slate-100 tracking-wide">Review Your Contract</h2>
                    <p className="text-sm text-slate-400 mt-1">Review all details before saving or generating a PDF.</p>
                </div>

                <div className="divide-y divide-slate-700">
                    {orderedGroupNames.map(groupName => {
                        const fields = fieldGroups[groupName] || [];
                        const fees = feeCategories[groupName] || [];
                        const stepIndex = visibleSteps.indexOf(groupName);
                        const hasContent = fields.length > 0 || groupName === 'Personnel' || fees.length > 0;
                        if (!hasContent) return null;

                        return (
                            <div key={groupName} className="p-6">
                                <div className="flex justify-between items-center mb-3">
                                    <h3 className="text-lg font-semibold font-serif text-slate-200">{groupName}</h3>
                                    {stepIndex >= 0 && (
                                        <button onClick={() => onEditStep(stepIndex)} className="text-xs font-semibold text-emerald-400 hover:text-emerald-300 uppercase tracking-wider transition-colors">
                                            Edit
                                        </button>
                                    )}
                                </div>

                                {/* Field values */}
                                {fields.length > 0 && (
                                    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
                                        {fields.map(field => (
                                            <div key={field.id} className="flex justify-between sm:block py-1">
                                                <dt className="text-xs text-slate-400 uppercase tracking-wider">{field.label}</dt>
                                                <dd className="text-sm text-slate-200 font-medium">{getDisplayValue(field, formData[field.id])}</dd>
                                            </div>
                                        ))}
                                    </dl>
                                )}

                                {/* Personnel summary */}
                                {groupName === 'Personnel' && (
                                    <div className="space-y-2 mt-2">
                                        {personnel.map((p, i) => (
                                            <div key={p.id} className="flex items-center gap-3 text-sm bg-slate-900/50 border border-slate-700 rounded-md p-3">
                                                <span className={`text-xs font-bold uppercase px-2 py-0.5 rounded ${p.role === 'leader' ? 'bg-emerald-900/50 text-emerald-300' : 'bg-slate-700 text-slate-400'}`}>
                                                    {p.role === 'leader' ? 'Leader' : `#${i + 1}`}
                                                </span>
                                                <span className="text-slate-200 font-medium">{p.name || '(unnamed)'}</span>
                                                <span className="text-slate-400 text-xs truncate">{p.address}</span>
                                                <div className="ml-auto flex gap-2 text-xs text-slate-500">
                                                    {p.doubling && <span>Doubling</span>}
                                                    {p.cartage && <span>Cartage</span>}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {/* Fee summary */}
                                {fees.length > 0 && (
                                    <div className="space-y-1 mt-2">
                                        {fees.map(fee => {
                                            const qty = Number(formData[`fee_${fee.id}`]) || 0;
                                            if (qty === 0) return null;
                                            return (
                                                <div key={fee.id} className="flex justify-between text-sm py-1">
                                                    <span className="text-slate-300">{fee.name} x{qty}</span>
                                                    <span className="text-slate-200 font-medium">{currency.symbol}{(fee.rate * qty).toFixed(2)}{fee.perMusician ? '/musician' : ''}</span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Calculation results */}
            <div className="bg-slate-800 border border-slate-700 p-6 rounded-lg shadow-xl">
                <h3 className="text-xl font-bold font-serif text-slate-100 mb-5 tracking-wide">Calculation Summary</h3>
                {calculationResults.length > 0 ? (
                    <ul className="space-y-3">
                        {calculationResults.map(item => (
                            <li key={item.id} className="flex justify-between items-center text-sm border-b border-slate-700/50 pb-2">
                                <span className="text-slate-300 font-medium">{item.label}</span>
                                <span className="font-bold text-slate-100">{formatCurrency(item.value, currency.code, currency.symbol)}</span>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p className="text-sm text-slate-400 italic">No calculations available.</p>
                )}
            </div>

            {/* Actions */}
            <div className="bg-slate-800 border border-slate-700 p-6 rounded-lg shadow-xl space-y-4">
                <h3 className="text-xl font-bold font-serif text-slate-100 mb-2 tracking-wide">Actions</h3>

                <div className="space-y-2 border-b border-slate-700 pb-5">
                    <label className="block text-xs font-medium text-slate-400">Save Current Snapshot</label>
                    <input
                        type="text"
                        placeholder="Note for snapshot (optional)"
                        value={snapshotNote}
                        onChange={(e) => onSnapshotNoteChange(e.target.value)}
                        className="block w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-50 sm:text-sm"
                    />
                    <button onClick={onSaveVersion} className="w-full bg-slate-700 text-slate-100 font-bold py-2.5 px-4 rounded-md hover:bg-slate-600 transition-colors shadow-sm">Save Version Snapshot</button>
                </div>

                <button onClick={onSaveContract} className="w-full bg-indigo-600 text-white font-bold py-2.5 px-4 rounded-md hover:bg-indigo-500 transition-colors shadow-sm mt-4">Save Contract</button>
                {isExistingContract && (
                    <button onClick={onSaveAsNew} className="w-full bg-indigo-500/50 text-indigo-100 font-bold py-2 px-4 rounded-md hover:bg-indigo-500/70 transition-colors shadow-sm text-sm mt-1">Save As New Contract</button>
                )}
                <div className="border-t border-slate-700 !my-5"></div>
                <button onClick={onOpenContract} className="w-full bg-slate-600 text-white font-bold py-2.5 px-4 rounded-md hover:bg-slate-500 transition-colors shadow-sm">Open Contract</button>
                <div className="flex space-x-3">
                    <button onClick={onDownloadPdf} className="w-1/2 bg-emerald-600 text-white font-bold py-3 px-4 rounded-md hover:bg-emerald-500 transition-colors shadow-md text-base">Download PDF</button>
                    <button onClick={onEmailPdf} className="w-1/2 bg-sky-600 text-white font-bold py-3 px-4 rounded-md hover:bg-sky-500 transition-colors shadow-md text-base">Email PDF</button>
                </div>

                {emailHistory.length > 0 && (
                    <div className="border-t border-slate-700 pt-4 mt-4">
                        <h4 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-2">
                            Email History — Emailed {emailHistory.length} time{emailHistory.length !== 1 ? 's' : ''}
                        </h4>
                        <ul className="space-y-2 max-h-40 overflow-y-auto pr-1">
                            {emailHistory.map(log => (
                                <li key={log.id} className="text-xs bg-slate-900 border border-slate-700 rounded-md p-2">
                                    <div className="text-slate-200 font-medium truncate">{log.recipientEmail}</div>
                                    <div className="text-slate-400 flex justify-between mt-0.5">
                                        <span>Ref: {log.referenceNumber}</span>
                                        <span>{new Date(log.sentAt).toLocaleDateString()}</span>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}

                <div className="border-t border-slate-700 !my-5"></div>
                <div className="flex gap-3">
                    <button onClick={onBack} className="flex-1 bg-slate-600 text-white font-bold py-2.5 px-4 rounded-md hover:bg-slate-500 transition-colors shadow-sm">Back to Form</button>
                    <button onClick={onResetContract} className="flex-1 bg-red-600/90 text-white font-bold py-2.5 px-4 rounded-md hover:bg-red-500 transition-colors shadow-sm">Start New</button>
                </div>
            </div>

            {/* Saved versions */}
            {versions.length > 0 && (
                <div className="bg-slate-800 p-6 rounded-lg shadow-lg border border-slate-700">
                    <h3 className="text-lg font-bold text-slate-200 mb-4">Saved Snapshots</h3>
                    <ul className="space-y-2 max-h-48 overflow-y-auto pr-2">
                        {versions.map(v => {
                            return (
                                <li key={v.id} className={`p-3 rounded-md flex justify-between items-center text-sm ${activeVersionId === v.id ? 'bg-indigo-900/60 border border-indigo-500/50' : 'bg-slate-900 border border-slate-700'}`}>
                                    <span className="font-medium text-slate-200 flex items-center gap-2">
                                        {v.name}
                                        {activeVersionId === v.id && (
                                            <span className="text-emerald-400 text-xs ml-1 bg-emerald-900/40 px-2 py-0.5 rounded-full border border-emerald-800" title="Active Version">Active</span>
                                        )}
                                    </span>
                                    <div className="flex space-x-3 text-xs font-semibold uppercase tracking-wider">
                                        <button onClick={() => onLoadVersion(v.formData, v.personnel, v.id)} className="text-indigo-400 hover:text-indigo-300">Load</button>
                                        <button onClick={() => onDeleteVersion(v.id)} className="text-red-400 hover:text-red-300">Del</button>
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                </div>
            )}
        </div>
    );
};

export default WizardReviewStep;
