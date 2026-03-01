import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';

type LocalOption = { id: number; name: string };

const LocalConfigEditor: React.FC = () => {
    const { getAuthHeaders } = useAuth();
    const [locals, setLocals] = useState<LocalOption[]>([]);
    const [selectedLocalId, setSelectedLocalId] = useState<number | 'new'>('new');
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [message, setMessage] = useState({ type: '', text: '' });

    // Root Config State
    const [formId, setFormId] = useState('');
    const [formName, setFormName] = useState('');
    const [currencySymbol, setCurrencySymbol] = useState('$');
    const [currencyCode, setCurrencyCode] = useState('USD');
    const [contractTypes, setContractTypes] = useState<any[]>([]);

    // UI state
    const [activeCtIndex, setActiveCtIndex] = useState<number>(-1);

    // JSON editing strings for complex nested object fields
    const [rulesJsonStr, setRulesJsonStr] = useState('{}');
    const [legalTextJsonStr, setLegalTextJsonStr] = useState('{}');
    const [summaryJsonStr, setSummaryJsonStr] = useState('[]');

    const API_BASE = '/api/locals';

    useEffect(() => {
        fetchLocalsList();
    }, []);

    const fetchLocalsList = async () => {
        try {
            const res = await fetch(API_BASE, { headers: getAuthHeaders() });
            if (res.ok) {
                const data = await res.json();
                setLocals(data.locals || []);
            }
        } catch (err) {
            console.error('Failed to fetch locals list:', err);
        }
    };

    const fetchLocalData = async (id: number) => {
        setIsLoading(true);
        setMessage({ type: '', text: '' });
        setActiveCtIndex(-1); // reset active contract

        try {
            const res = await fetch(`${API_BASE}/${id}`, { headers: getAuthHeaders() });
            if (res.ok) {
                const config = await res.json();
                setFormId(String(config.localId || id));
                setFormName(config.localName || locals.find(l => l.id === id)?.name || '');
                setCurrencySymbol(config.currency?.symbol || '$');
                setCurrencyCode(config.currency?.code || 'USD');
                setContractTypes(config.contractTypes || []);
            } else {
                setMessage({ type: 'error', text: 'Failed to fetch the configuration.' });
            }
        } catch (err) {
            console.error(err);
            setMessage({ type: 'error', text: 'Error fetching data.' });
        } finally {
            setIsLoading(false);
        }
    };

    const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const val = e.target.value;
        if (val === 'new') {
            setSelectedLocalId('new');
            setFormId('');
            setFormName('');
            setCurrencySymbol('$');
            setCurrencyCode('USD');
            setContractTypes([]);
            setActiveCtIndex(-1);
            setMessage({ type: '', text: '' });
        } else {
            const numId = parseInt(val, 10);
            setSelectedLocalId(numId);
            fetchLocalData(numId);
        }
    };

    const handleSave = async () => {
        setMessage({ type: '', text: '' });
        if (!formId || !formName) {
            setMessage({ type: 'error', text: 'Local ID and Name are required.' });
            return;
        }

        // Before saving, apply the current active JSON string buffers to the active contract type if valid
        let updatedContractTypes = [...contractTypes];
        if (activeCtIndex !== -1) {
            try {
                const rules = JSON.parse(rulesJsonStr);
                const legalText = JSON.parse(legalTextJsonStr);
                const summary = JSON.parse(summaryJsonStr);
                updatedContractTypes[activeCtIndex] = {
                    ...updatedContractTypes[activeCtIndex],
                    rules,
                    legalText,
                    summary
                };
            } catch (err: any) {
                setMessage({ type: 'error', text: `Invalid JSON in current Contract Type advanced settings: ${err.message}` });
                return;
            }
        }

        setIsSaving(true);
        const payload = {
            id: formId,
            name: formName,
            config: {
                localId: parseInt(formId, 10),
                localName: formName,
                currency: {
                    symbol: currencySymbol,
                    code: currencyCode
                },
                contractTypes: updatedContractTypes
            }
        };

        try {
            const isEditing = selectedLocalId !== 'new';
            const url = isEditing ? `${API_BASE}/${formId}` : API_BASE;
            const method = isEditing ? 'PUT' : 'POST';

            const res = await fetch(url, {
                method,
                headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                setMessage({ type: 'success', text: `Local definition successfully ${isEditing ? 'updated' : 'created'}.` });
                await fetchLocalsList();
                if (!isEditing) {
                    setSelectedLocalId(parseInt(formId, 10));
                }
                setContractTypes(updatedContractTypes); // Reflect the actual state saved
            } else {
                const errData = await res.json();
                setMessage({ type: 'error', text: errData.error || 'Failed to save configuration.' });
            }
        } catch (err) {
            console.error(err);
            setMessage({ type: 'error', text: 'Error connecting to API.' });
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async () => {
        if (selectedLocalId === 'new') return;

        if (!window.confirm(`Are you sure you want to permanently delete Local ${formId}? This cannot be undone.`)) {
            return;
        }

        setIsSaving(true);
        try {
            const res = await fetch(`${API_BASE}/${formId}`, {
                method: 'DELETE',
                headers: getAuthHeaders()
            });

            if (res.ok) {
                setMessage({ type: 'success', text: 'Local successfully deleted.' });
                setSelectedLocalId('new');
                setFormId('');
                setFormName('');
                setCurrencySymbol('$');
                setCurrencyCode('USD');
                setContractTypes([]);
                setActiveCtIndex(-1);
                await fetchLocalsList();
            } else {
                const errData = await res.json();
                setMessage({ type: 'error', text: errData.error || 'Failed to delete configuration.' });
            }
        } catch (err) {
            console.error(err);
            setMessage({ type: 'error', text: 'Error connecting to API.' });
        } finally {
            setIsSaving(false);
        }
    };

    // --- Contract Types Management ---
    const handleSwitchContractType = (index: number) => {
        // before switching, parse the active JSON buffers back into the active contract to save it 
        if (activeCtIndex !== -1) {
            try {
                const rules = JSON.parse(rulesJsonStr);
                const legalText = JSON.parse(legalTextJsonStr);
                const summary = JSON.parse(summaryJsonStr);

                const updated = [...contractTypes];
                updated[activeCtIndex] = { ...updated[activeCtIndex], rules, legalText, summary };
                setContractTypes(updated);
            } catch (err) {
                alert('Cannot switch contract types while there is invalid JSON in the Rules/LegalText/Summary of the current contract.');
                return;
            }
        }

        setActiveCtIndex(index);

        // initialize buffers for next
        if (index !== -1) {
            const nextCt = contractTypes[index];
            setRulesJsonStr(JSON.stringify(nextCt.rules || {}, null, 2));
            setLegalTextJsonStr(JSON.stringify(nextCt.legalText || {}, null, 2));
            setSummaryJsonStr(JSON.stringify(nextCt.summary || [], null, 2));
        }
    };

    const addContractType = () => {
        const newCt = {
            id: `new_contract_type_${Date.now()}`,
            name: "New Contract Type",
            formIdentifier: "AFM_",
            calculationModel: "live_engagement",
            signatureType: "engagement",
            fields: [],
            wageScales: [],
            rules: {},
            legalText: {},
            summary: []
        };
        setContractTypes([...contractTypes, newCt]);
        handleSwitchContractType(contractTypes.length); // will switch to newly added (length is old length so it indexes the new item)
    };

    const deleteContractType = (index: number) => {
        if (!window.confirm("Delete this Contract Type?")) return;
        const updated = [...contractTypes];
        updated.splice(index, 1);
        setContractTypes(updated);

        setActiveCtIndex(-1); // Reset select 
    };

    const updateActiveContractField = (field: string, value: any) => {
        if (activeCtIndex === -1) return;
        const updated = [...contractTypes];
        updated[activeCtIndex] = { ...updated[activeCtIndex], [field]: value };
        setContractTypes(updated);
    };

    const activeCt = activeCtIndex !== -1 ? contractTypes[activeCtIndex] : null;

    return (
        <div className="bg-gray-800 p-6 rounded-lg shadow-lg text-gray-200 w-full max-w-7xl mx-auto">
            <h2 className="text-2xl font-bold mb-2">Local Configuration Editor</h2>
            <p className="text-sm text-gray-400 mb-6">Create, read, update, and delete AFM local configuration in the database via the UI form.</p>

            {message.text && (
                <div className={`mb-6 p-4 rounded-md text-sm border-l-4 ${message.type === 'success' ? 'bg-emerald-900/40 border-emerald-500 text-emerald-200' : 'bg-red-900/40 border-red-500 text-red-200'}`}>
                    {message.text}
                </div>
            )}

            <div className="mb-6 bg-gray-700/50 p-4 rounded-md border border-gray-600 flex flex-col md:flex-row gap-4 items-center">
                <div className="flex-1 w-full">
                    <label className="block text-sm font-medium text-gray-300 mb-2">Select a Local to Edit:</label>
                    <select
                        value={selectedLocalId}
                        onChange={handleSelectChange}
                        className="w-full bg-gray-800 border border-gray-600 rounded-md py-2 px-3 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                        <option value="new">== Create New Local ==</option>
                        {locals.map(l => (
                            <option key={l.id} value={l.id}>Local {l.id} - {l.name}</option>
                        ))}
                    </select>
                </div>

                {selectedLocalId !== 'new' && (
                    <button
                        onClick={handleDelete}
                        disabled={isSaving}
                        className="mt-6 bg-red-900/50 hover:bg-red-900 text-red-200 border border-red-700 py-2 px-4 rounded transition-colors disabled:opacity-50 h-10 flex-shrink-0"
                    >
                        Delete Local
                    </button>
                )}
            </div>

            {isLoading ? (
                <div className="text-center py-10">
                    <svg className="animate-spin h-8 w-8 text-indigo-500 mx-auto" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <p className="mt-4 text-gray-400">Loading Configuration Data...</p>
                </div>
            ) : (
                <div className="space-y-8">
                    {/* General Settings */}
                    <div className="bg-gray-750 p-5 rounded-lg border border-gray-700 shadow-inner">
                        <h3 className="text-xl font-semibold mb-4 text-gray-300 border-b border-gray-700 pb-2">General Settings</h3>
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                            <div className="md:col-span-1">
                                <label className="block text-sm font-medium text-gray-300 mb-1">Local ID Number</label>
                                <input
                                    type="number"
                                    value={formId}
                                    onChange={e => setFormId(e.target.value)}
                                    disabled={selectedLocalId !== 'new'}
                                    placeholder="e.g. 802"
                                    className="w-full bg-gray-800 border border-gray-600 rounded-md py-2 px-3 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
                                />
                            </div>
                            <div className="md:col-span-3">
                                <label className="block text-sm font-medium text-gray-300 mb-1">Local Descriptive Name</label>
                                <input
                                    type="text"
                                    value={formName}
                                    onChange={e => setFormName(e.target.value)}
                                    placeholder="e.g. Associated Musicians of Greater New York"
                                    className="w-full bg-gray-800 border border-gray-600 rounded-md py-2 px-3 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                />
                            </div>
                            <div className="md:col-span-2">
                                <label className="block text-sm font-medium text-gray-300 mb-1">Currency Code</label>
                                <input
                                    type="text"
                                    value={currencyCode}
                                    onChange={e => setCurrencyCode(e.target.value)}
                                    placeholder="e.g. USD, CAD"
                                    className="w-full bg-gray-800 border border-gray-600 rounded-md py-2 px-3 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                />
                            </div>
                            <div className="md:col-span-2">
                                <label className="block text-sm font-medium text-gray-300 mb-1">Currency Symbol</label>
                                <input
                                    type="text"
                                    value={currencySymbol}
                                    onChange={e => setCurrencySymbol(e.target.value)}
                                    placeholder="e.g. $"
                                    className="w-full bg-gray-800 border border-gray-600 rounded-md py-2 px-3 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Contract Types Section */}
                    <div className="bg-gray-750 p-5 rounded-lg border border-gray-700 shadow-inner">
                        <div className="flex justify-between items-center mb-4 border-b border-gray-700 pb-2">
                            <h3 className="text-xl font-semibold text-gray-300">Contract Types ({contractTypes.length})</h3>
                            <button onClick={addContractType} className="bg-emerald-600 hover:bg-emerald-700 text-white py-1 px-3 text-sm rounded">
                                + Add Contract Type
                            </button>
                        </div>

                        <div className="mb-4">
                            <select
                                value={activeCtIndex}
                                onChange={(e) => handleSwitchContractType(parseInt(e.target.value, 10))}
                                className="w-full bg-gray-800 border border-indigo-600 rounded-md py-2 px-3 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 mb-2"
                            >
                                <option value="-1">-- Select a Contract Type to Edit --</option>
                                {contractTypes.map((ct, idx) => (
                                    <option key={idx} value={idx}>{ct.id} - {ct.name}</option>
                                ))}
                            </select>
                        </div>

                        {activeCt && (
                            <div className="bg-gray-800 border border-gray-600 rounded p-4 space-y-6">
                                <div className="flex justify-between items-center">
                                    <h4 className="text-lg font-bold text-indigo-400">Editing: {activeCt.name || 'Unnamed Contract Type'}</h4>
                                    <button onClick={() => deleteContractType(activeCtIndex)} className="text-red-400 hover:text-red-300 text-sm underline">
                                        Delete this Contract Type
                                    </button>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs text-gray-400">ID (Internal)</label>
                                        <input type="text" value={activeCt.id} onChange={e => updateActiveContractField('id', e.target.value)} className="w-full bg-gray-900 border border-gray-700 rounded py-1 px-2 text-white text-sm" />
                                    </div>
                                    <div>
                                        <label className="block text-xs text-gray-400">Display Name</label>
                                        <input type="text" value={activeCt.name} onChange={e => updateActiveContractField('name', e.target.value)} className="w-full bg-gray-900 border border-gray-700 rounded py-1 px-2 text-white text-sm" />
                                    </div>
                                    <div>
                                        <label className="block text-xs text-gray-400">Form Identifier</label>
                                        <input type="text" value={activeCt.formIdentifier} onChange={e => updateActiveContractField('formIdentifier', e.target.value)} className="w-full bg-gray-900 border border-gray-700 rounded py-1 px-2 text-white text-sm" />
                                    </div>
                                    <div>
                                        <label className="block text-xs text-gray-400">Calculation Model</label>
                                        <select value={activeCt.calculationModel || ''} onChange={e => updateActiveContractField('calculationModel', e.target.value)} className="w-full bg-gray-900 border border-gray-700 rounded py-1 px-2 text-white text-sm">
                                            <option value="">Default</option>
                                            <option value="live_engagement">Live Engagement</option>
                                            <option value="media_report">Media Report</option>
                                            <option value="contribution_only">Contribution Only</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-xs text-gray-400">Signature Type</label>
                                        <select value={activeCt.signatureType || ''} onChange={e => updateActiveContractField('signatureType', e.target.value)} className="w-full bg-gray-900 border border-gray-700 rounded py-1 px-2 text-white text-sm">
                                            <option value="">Default</option>
                                            <option value="engagement">Engagement</option>
                                            <option value="media_report">Media Report</option>
                                            <option value="member">Member</option>
                                            <option value="petitioner">Petitioner</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-xs text-gray-400">Jurisdiction (Optional)</label>
                                        <input type="text" value={activeCt.jurisdiction || ''} onChange={e => updateActiveContractField('jurisdiction', e.target.value)} className="w-full bg-gray-900 border border-gray-700 rounded py-1 px-2 text-white text-sm" />
                                    </div>
                                </div>

                                {/* Wage Scales Section */}
                                <div>
                                    <div className="flex justify-between items-end mb-2">
                                        <h5 className="font-semibold text-gray-300">Wage Scales</h5>
                                        <button
                                            onClick={() => updateActiveContractField('wageScales', [...(activeCt.wageScales || []), { id: '', name: '', rate: 0, duration: 1 }])}
                                            className="text-xs bg-gray-700 hover:bg-gray-600 px-2 py-1 rounded"
                                        >+ Add Scale</button>
                                    </div>
                                    <div className="overflow-x-auto border border-gray-700 rounded">
                                        <table className="w-full text-left text-sm text-gray-400">
                                            <thead className="bg-gray-700 text-xs uppercase text-gray-300">
                                                <tr>
                                                    <th className="px-3 py-2">ID</th>
                                                    <th className="px-3 py-2">Name</th>
                                                    <th className="px-3 py-2 w-24">Rate</th>
                                                    <th className="px-3 py-2 w-24">Hrs</th>
                                                    <th className="px-3 py-2 w-10 text-center">Del</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {(activeCt.wageScales || []).map((ws: any, idx: number) => (
                                                    <tr key={idx} className="border-b border-gray-700/50">
                                                        <td className="px-2 py-1"><input type="text" value={ws.id} onChange={e => {
                                                            const nWs = [...activeCt.wageScales]; nWs[idx].id = e.target.value; updateActiveContractField('wageScales', nWs);
                                                        }} className="w-full bg-transparent border-gray-600 border rounded px-1 text-white" /></td>
                                                        <td className="px-2 py-1"><input type="text" value={ws.name} onChange={e => {
                                                            const nWs = [...activeCt.wageScales]; nWs[idx].name = e.target.value; updateActiveContractField('wageScales', nWs);
                                                        }} className="w-full bg-transparent border-gray-600 border rounded px-1 text-white" /></td>
                                                        <td className="px-2 py-1"><input type="number" step="0.01" value={ws.rate} onChange={e => {
                                                            const nWs = [...activeCt.wageScales]; nWs[idx].rate = parseFloat(e.target.value) || 0; updateActiveContractField('wageScales', nWs);
                                                        }} className="w-full bg-transparent border-gray-600 border rounded px-1 text-white" /></td>
                                                        <td className="px-2 py-1"><input type="number" step="0.5" value={ws.duration} onChange={e => {
                                                            const nWs = [...activeCt.wageScales]; nWs[idx].duration = parseFloat(e.target.value) || 0; updateActiveContractField('wageScales', nWs);
                                                        }} className="w-full bg-transparent border-gray-600 border rounded px-1 text-white" /></td>
                                                        <td className="px-2 py-1 text-center"><button onClick={() => {
                                                            const nWs = [...activeCt.wageScales]; nWs.splice(idx, 1); updateActiveContractField('wageScales', nWs);
                                                        }} className="text-red-500 hover:text-red-300">✕</button></td>
                                                    </tr>
                                                ))}
                                                {(activeCt.wageScales || []).length === 0 && <tr><td colSpan={5} className="text-center py-2 text-gray-500 italic">No wage scales defined</td></tr>}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>

                                {/* Fields Section */}
                                <div>
                                    <div className="flex justify-between items-end mb-2">
                                        <h5 className="font-semibold text-gray-300">Form Fields</h5>
                                        <button
                                            onClick={() => updateActiveContractField('fields', [...(activeCt.fields || []), { id: '', label: '', type: 'text', required: false, group: 'General' }])}
                                            className="text-xs bg-gray-700 hover:bg-gray-600 px-2 py-1 rounded"
                                        >+ Add Field</button>
                                    </div>
                                    <div className="overflow-x-auto border border-gray-700 rounded">
                                        <table className="w-full text-left text-sm text-gray-400">
                                            <thead className="bg-gray-700 text-xs uppercase text-gray-300">
                                                <tr>
                                                    <th className="px-3 py-2">ID</th>
                                                    <th className="px-3 py-2">Label</th>
                                                    <th className="px-3 py-2">Type</th>
                                                    <th className="px-3 py-2">Group</th>
                                                    <th className="px-3 py-2 w-12 text-center">Req?</th>
                                                    <th className="px-3 py-2 w-10 text-center">Del</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {(activeCt.fields || []).map((f: any, idx: number) => (
                                                    <tr key={idx} className="border-b border-gray-700/50">
                                                        <td className="px-2 py-1"><input type="text" value={f.id} onChange={e => {
                                                            const nF = [...activeCt.fields]; nF[idx].id = e.target.value; updateActiveContractField('fields', nF);
                                                        }} className="w-full bg-transparent border-gray-600 border rounded px-1 text-white" /></td>
                                                        <td className="px-2 py-1"><input type="text" value={f.label} onChange={e => {
                                                            const nF = [...activeCt.fields]; nF[idx].label = e.target.value; updateActiveContractField('fields', nF);
                                                        }} className="w-full bg-transparent border-gray-600 border rounded px-1 text-white" /></td>
                                                        <td className="px-2 py-1">
                                                            <select value={f.type} onChange={e => {
                                                                const nF = [...activeCt.fields]; nF[idx].type = e.target.value; updateActiveContractField('fields', nF);
                                                            }} className="w-full bg-transparent border-gray-600 border rounded px-1 text-white">
                                                                <option value="text">text</option><option value="date">date</option>
                                                                <option value="time">time</option><option value="number">number</option>
                                                                <option value="currency">currency</option><option value="textarea">textarea</option>
                                                                <option value="select">select</option>
                                                            </select>
                                                        </td>
                                                        <td className="px-2 py-1"><input type="text" value={f.group || ''} onChange={e => {
                                                            const nF = [...activeCt.fields]; nF[idx].group = e.target.value; updateActiveContractField('fields', nF);
                                                        }} className="w-full bg-transparent border-gray-600 border rounded px-1 text-white" /></td>
                                                        <td className="px-2 py-1 text-center"><input type="checkbox" checked={f.required} onChange={e => {
                                                            const nF = [...activeCt.fields]; nF[idx].required = e.target.checked; updateActiveContractField('fields', nF);
                                                        }} className="rounded bg-gray-900 border-gray-600" /></td>
                                                        <td className="px-2 py-1 text-center"><button onClick={() => {
                                                            const nF = [...activeCt.fields]; nF.splice(idx, 1); updateActiveContractField('fields', nF);
                                                        }} className="text-red-500 hover:text-red-300">✕</button></td>
                                                    </tr>
                                                ))}
                                                {(activeCt.fields || []).length === 0 && <tr><td colSpan={6} className="text-center py-2 text-gray-500 italic">No fields defined</td></tr>}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>

                                {/* Advanced JSON Snippets */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-gray-700">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-300 mb-1">Rules (JSON)</label>
                                        <textarea
                                            value={rulesJsonStr}
                                            onChange={e => setRulesJsonStr(e.target.value)}
                                            rows={6}
                                            className="w-full bg-gray-900 border border-gray-600 rounded-md py-2 px-3 text-emerald-400 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                            placeholder='{ "overtimeRate": 1.5 }'
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-300 mb-1">Legal Text (JSON)</label>
                                        <textarea
                                            value={legalTextJsonStr}
                                            onChange={e => setLegalTextJsonStr(e.target.value)}
                                            rows={6}
                                            className="w-full bg-gray-900 border border-gray-600 rounded-md py-2 px-3 text-sky-400 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                            placeholder='{ "preamble": "THIS CONTRACT..." }'
                                        />
                                    </div>
                                    <div className="md:col-span-2">
                                        <label className="block text-sm font-medium text-gray-300 mb-1">Summary Config (JSON Array) (Usually empty [])</label>
                                        <textarea
                                            value={summaryJsonStr}
                                            onChange={e => setSummaryJsonStr(e.target.value)}
                                            rows={2}
                                            className="w-full bg-gray-900 border border-gray-600 rounded-md py-2 px-3 text-amber-400 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                            placeholder="[]"
                                        />
                                    </div>
                                </div>
                            </div>
                        )}
                        {!activeCt && contractTypes.length > 0 && (
                            <div className="bg-gray-800/50 p-4 rounded text-center text-gray-500">
                                Select a contract type from the dropdown above to edit its details.
                            </div>
                        )}
                    </div>

                    <div className="flex justify-end pt-6">
                        <button
                            onClick={handleSave}
                            disabled={isSaving}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-10 rounded-lg shadow-lg transition-transform transform hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 flex items-center"
                        >
                            {isSaving ? 'Saving to Database...' : 'Save Complete Configuration'}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default LocalConfigEditor;
