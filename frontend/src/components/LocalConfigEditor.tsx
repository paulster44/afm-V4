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

    // Form state
    const [formId, setFormId] = useState('');
    const [formName, setFormName] = useState('');
    const [formJson, setFormJson] = useState('{\n  \n}');

    const API_BASE = '/api/locals';

    useEffect(() => {
        fetchLocalsList();
    }, []);

    const fetchLocalsList = async () => {
        try {
            const res = await fetch(API_BASE, { headers: getAuthHeaders() });
            if (res.ok) {
                const data = await res.json();
                setLocals(data.locals);
            }
        } catch (err) {
            console.error('Failed to fetch locals list:', err);
        }
    };

    const fetchLocalData = async (id: number) => {
        setIsLoading(true);
        setMessage({ type: '', text: '' });
        try {
            const res = await fetch(`${API_BASE}/${id}`, { headers: getAuthHeaders() });
            if (res.ok) {
                const config = await res.json();
                const matchedLocal = locals.find(l => l.id === id);
                setFormId(String(id));
                setFormName(matchedLocal?.name || '');
                setFormJson(JSON.stringify(config, null, 2));
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
            setFormJson('{\n  \n}');
            setMessage({ type: '', text: '' });
        } else {
            const numId = parseInt(val, 10);
            setSelectedLocalId(numId);
            fetchLocalData(numId);
        }
    };

    const handleSave = async () => {
        setMessage({ type: '', text: '' });
        if (!formId || !formName || !formJson.trim()) {
            setMessage({ type: 'error', text: 'ID, Name, and JSON Configuration are required.' });
            return;
        }

        let parsedConfig;
        try {
            parsedConfig = JSON.parse(formJson);
        } catch (err: any) {
            setMessage({ type: 'error', text: `Invalid JSON format: ${err.message}` });
            return;
        }

        setIsSaving(true);
        const payload = {
            id: formId,
            name: formName,
            config: parsedConfig
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
                setFormJson('{\n  \n}');
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

    return (
        <div className="bg-gray-800 p-6 rounded-lg shadow-lg text-gray-200 w-full">
            <h2 className="text-2xl font-bold mb-2">Local Configuration Editor</h2>
            <p className="text-sm text-gray-400 mb-6">Create, read, update, and delete AFM local configuration JSONs active in the database.</p>

            {message.text && (
                <div className={`mb-6 p-4 rounded-md text-sm border-l-4 ${message.type === 'success' ? 'bg-emerald-900/40 border-emerald-500 text-emerald-200' : 'bg-red-900/40 border-red-500 text-red-200'}`}>
                    {message.text}
                </div>
            )}

            <div className="mb-6 bg-gray-700/50 p-4 rounded-md border border-gray-600">
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

            {isLoading ? (
                <div className="text-center py-10">
                    <svg className="animate-spin h-8 w-8 text-indigo-500 mx-auto" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <p className="mt-4 text-gray-400">Loading Configuration Data...</p>
                </div>
            ) : (
                <div className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-1">Local ID Number</label>
                            <input
                                type="number"
                                value={formId}
                                onChange={e => setFormId(e.target.value)}
                                disabled={selectedLocalId !== 'new'}
                                placeholder="e.g. 802"
                                className="w-full bg-gray-800 border border-gray-600 rounded-md py-2 px-3 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
                            />
                            {selectedLocalId !== 'new' && <p className="text-xs text-indigo-400 mt-1">ID cannot be changed on an existing configuration.</p>}
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-1">Local Descriptive Name</label>
                            <input
                                type="text"
                                value={formName}
                                onChange={e => setFormName(e.target.value)}
                                placeholder="e.g. Associated Musicians of Greater New York"
                                className="w-full bg-gray-800 border border-gray-600 rounded-md py-2 px-3 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">JSON Configuration Payload</label>
                        <textarea
                            value={formJson}
                            onChange={e => setFormJson(e.target.value)}
                            rows={30}
                            className="w-full bg-gray-900 border border-gray-600 rounded-md py-3 px-4 text-emerald-400 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            placeholder="Paste your correctly formatted JSON config here..."
                        />
                    </div>

                    <div className="flex justify-end gap-3 pt-4 border-t border-gray-700">
                        {selectedLocalId !== 'new' && (
                            <button
                                onClick={handleDelete}
                                disabled={isSaving}
                                className="bg-red-900/50 hover:bg-red-900 text-red-200 border border-red-700 font-bold py-2 px-6 rounded transition-colors disabled:opacity-50"
                            >
                                Delete Local
                            </button>
                        )}
                        <button
                            onClick={handleSave}
                            disabled={isSaving}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-8 rounded transition-colors disabled:opacity-50 flex items-center"
                        >
                            {isSaving ? 'Saving to Database...' : 'Save Configuration'}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default LocalConfigEditor;
