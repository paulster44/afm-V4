import React from 'react';
import type { Field, FormData, AdditionalFee, Person, WageScale, StepMeta, Currency } from '../types';
import DynamicField from './DynamicField';

type WizardStepViewProps = {
    groupName: string;
    fields: Field[];
    formData: FormData;
    formErrors: Record<string, string>;
    stepErrors: Record<string, string>;
    handleChange: (id: string, value: string | number) => void;
    stepMeta?: Record<string, StepMeta>;
    // Personnel
    personnel: Person[];
    personnelSsns: Record<string, string>;
    handleAddMusician: () => void;
    handleRemoveMusician: (id: string) => void;
    handlePersonnelChange: (id: string, field: keyof Omit<Person, 'id' | 'role'>, value: string | boolean) => void;
    handleRoleChange: (id: string) => void;
    checkForDuplicateMusician: (id: string) => void;
    handleSsnChange: (id: string, value: string) => void;
    cartageScales: WageScale[];
    // Fee categories
    feeCategories: Record<string, AdditionalFee[]>;
    currency: Currency;
    // Wage scales
    performanceScales: WageScale[];
    allWageScales?: WageScale[];
    // Navigation
    isFirstStep: boolean;
    isLastStep: boolean;
    onNext: () => void;
    onBack: () => void;
};

const WizardStepView: React.FC<WizardStepViewProps> = ({
    groupName, fields, formData, formErrors, stepErrors, handleChange, stepMeta,
    personnel, personnelSsns, handleAddMusician, handleRemoveMusician,
    handlePersonnelChange, handleRoleChange, checkForDuplicateMusician, handleSsnChange,
    cartageScales, feeCategories, currency, performanceScales, allWageScales,
    isFirstStep, isLastStep, onNext, onBack,
}) => {
    const mergedErrors = { ...formErrors, ...stepErrors };
    const description = stepMeta?.[groupName]?.description;

    return (
        <div className="bg-slate-800 rounded-lg shadow-lg border border-slate-700 overflow-hidden">
            <div className="p-6 border-b border-slate-700">
                <h2 className="text-xl font-bold font-serif text-slate-100 tracking-wide">{groupName}</h2>
                {description && <p className="text-sm text-slate-400 mt-1">{description}</p>}
            </div>

            <div className="p-6 space-y-4">
                {/* Standard fields */}
                {fields.length > 0 && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2">
                        {fields.map(field => {
                            const wageScalesForField = field.dataSource === 'wageScales'
                                ? (field.id === 'engagementType' ? performanceScales : allWageScales)
                                : undefined;
                            return (
                                <DynamicField
                                    key={field.id}
                                    field={field}
                                    formData={formData}
                                    handleChange={handleChange}
                                    wageScales={wageScalesForField}
                                    currencySymbol={currency.symbol}
                                    error={mergedErrors[field.id]}
                                />
                            );
                        })}
                    </div>
                )}

                {/* Personnel roster */}
                {groupName === 'Personnel' && (
                    <div className={`space-y-4 ${fields.length > 0 ? 'mt-6 border-t border-gray-700 pt-6' : ''}`}>
                        <p className="text-xs text-slate-400 italic">Select the radio button next to a musician to designate them as the Leader.</p>
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
                                    {personnel.length > 1 && (
                                        <button onClick={() => handleRemoveMusician(p.id)} className="text-red-400 hover:text-red-300 transition-colors text-xs font-bold p-1 -mt-2 -mr-2 uppercase tracking-wide" aria-label={`Remove ${p.name || `Musician #${index + 1}`}`}>REMOVE</button>
                                    )}
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
                                        {cartageScales.length > 0 && <label className="flex items-center cursor-pointer group"><input type="checkbox" checked={p.cartage} onChange={e => handlePersonnelChange(p.id, 'cartage', e.target.checked)} className="h-4.5 w-4.5 rounded border-slate-500 bg-slate-800 text-emerald-500 focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 cursor-pointer" /> <span className="ml-2.5 text-sm text-slate-300 group-hover:text-slate-100 transition-colors">Cartage</span></label>}
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

                {/* Fee categories */}
                {feeCategories[groupName] && (
                    <div className="space-y-3">
                        {feeCategories[groupName].map(fee => {
                            const feeKey = `fee_${fee.id}`;
                            const qty = Number(formData[feeKey]) || 0;
                            const isEnabled = qty > 0;
                            return (
                                <div key={fee.id} className="flex items-center justify-between p-3 bg-slate-900/50 border border-slate-700 rounded-lg">
                                    <label className="flex items-center cursor-pointer group flex-1 min-w-0">
                                        <input
                                            type="checkbox"
                                            checked={isEnabled}
                                            onChange={e => handleChange(feeKey, e.target.checked ? 1 : 0)}
                                            className="h-4.5 w-4.5 rounded border-slate-500 bg-slate-800 text-emerald-500 focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 cursor-pointer flex-shrink-0"
                                        />
                                        <span className="ml-2.5 text-sm text-slate-300 group-hover:text-slate-100 transition-colors truncate">
                                            {fee.name}
                                        </span>
                                    </label>
                                    <div className="flex items-center gap-3 flex-shrink-0 ml-3">
                                        <span className="text-sm text-slate-400">{currency.symbol}{fee.rate.toFixed(2)}{fee.perMusician ? '/musician' : ''}</span>
                                        {isEnabled && (
                                            <input
                                                type="number"
                                                min={1}
                                                value={qty}
                                                onChange={e => handleChange(feeKey, Math.max(1, parseInt(e.target.value) || 1))}
                                                className="w-16 px-2 py-1 text-center bg-slate-900 border border-slate-600 rounded-md text-slate-50 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                                                aria-label={`Quantity for ${fee.name}`}
                                            />
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Navigation buttons */}
            <div className="p-6 border-t border-slate-700 flex justify-between gap-4">
                <button
                    onClick={onBack}
                    disabled={isFirstStep}
                    className={`px-6 py-3 rounded-md font-semibold text-sm transition-colors ${
                        isFirstStep
                            ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
                            : 'bg-slate-600 text-white hover:bg-slate-500'
                    }`}
                >
                    Back
                </button>
                <button
                    onClick={onNext}
                    className="px-6 py-3 rounded-md font-semibold text-sm bg-emerald-600 text-white hover:bg-emerald-500 transition-colors flex-1 sm:flex-none sm:min-w-[140px]"
                >
                    {isLastStep ? 'Review' : 'Next'}
                </button>
            </div>
        </div>
    );
};

export default WizardStepView;
