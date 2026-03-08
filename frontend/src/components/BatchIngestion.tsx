import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import type { PendingContractType } from '../types';

type LocalOption = { id: number; name: string };

const statusColors: Record<string, string> = {
    pending: 'bg-yellow-900 text-yellow-300 border-yellow-700',
    approved: 'bg-emerald-900 text-emerald-300 border-emerald-700',
    rejected: 'bg-red-900 text-red-300 border-red-700',
    error: 'bg-red-900 text-red-300 border-red-700',
};

const BatchIngestion: React.FC = () => {
    const { getFreshAuthHeaders } = useAuth();

    // Ingestion mode
    const [ingestionMode, setIngestionMode] = useState<'zip' | 'drive'>('zip');

    // Upload state
    const [locals, setLocals] = useState<LocalOption[]>([]);
    const [selectedLocalId, setSelectedLocalId] = useState<number | '' | 'new'>('');
    const [zipFile, setZipFile] = useState<File | null>(null);
    const [driveUrl, setDriveUrl] = useState('');
    const [uploading, setUploading] = useState(false);
    const [uploadResult, setUploadResult] = useState<{ batchId: string; totalFiles: number; processed: number; failed: number } | null>(null);
    const [uploadError, setUploadError] = useState('');

    // New local form state
    const [newLocalId, setNewLocalId] = useState('');
    const [newLocalName, setNewLocalName] = useState('');
    const [newCurrencySymbol, setNewCurrencySymbol] = useState('$');
    const [newCurrencyCode, setNewCurrencyCode] = useState('USD');

    // Pending items state
    const [items, setItems] = useState<PendingContractType[]>([]);
    const [loadingItems, setLoadingItems] = useState(false);
    const [filterStatus, setFilterStatus] = useState<string>('');

    // Review panel state
    const [reviewItem, setReviewItem] = useState<PendingContractType | null>(null);
    const [editJson, setEditJson] = useState('');
    const [jsonError, setJsonError] = useState('');
    const [actionLoading, setActionLoading] = useState(false);
    const [actionMessage, setActionMessage] = useState({ type: '', text: '' });

    useEffect(() => {
        fetchLocals();
        fetchPendingItems();
    }, []);

    const fetchLocals = async () => {
        try {
            const res = await fetch('/api/locals', { headers: await getFreshAuthHeaders() });
            if (res.ok) {
                const data = await res.json();
                setLocals(data.locals || []);
            }
        } catch (err) {
            console.error('Failed to fetch locals:', err);
        }
    };

    const fetchPendingItems = useCallback(async () => {
        setLoadingItems(true);
        try {
            const params = new URLSearchParams();
            if (filterStatus) params.set('status', filterStatus);
            const res = await fetch(`/api/admin/batch-pending?${params}`, { headers: await getFreshAuthHeaders() });
            if (res.ok) {
                const data = await res.json();
                setItems(data.items || []);
            }
        } catch (err) {
            console.error('Failed to fetch pending items:', err);
        } finally {
            setLoadingItems(false);
        }
    }, [filterStatus, getFreshAuthHeaders]);

    useEffect(() => {
        fetchPendingItems();
    }, [filterStatus, fetchPendingItems]);

    const handleUpload = async () => {
        if (!zipFile || selectedLocalId === '') return;
        if (selectedLocalId === 'new' && (!newLocalId || !newLocalName)) return;

        setUploading(true);
        setUploadError('');
        setUploadResult(null);

        try {
            let localId: number;

            if (selectedLocalId === 'new') {
                const createRes = await fetch('/api/locals', {
                    method: 'POST',
                    headers: { ...await getFreshAuthHeaders(), 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        id: Number(newLocalId),
                        name: newLocalName,
                        config: {
                            localId: Number(newLocalId),
                            localName: newLocalName,
                            currency: { symbol: newCurrencySymbol, code: newCurrencyCode },
                            contractTypes: [],
                        },
                    }),
                });

                if (!createRes.ok) {
                    const data = await createRes.json();
                    throw new Error(data.error || 'Failed to create local');
                }

                const created = await createRes.json();
                localId = created.id;
                await fetchLocals();
                setSelectedLocalId(localId);
                setNewLocalId('');
                setNewLocalName('');
                setNewCurrencySymbol('$');
                setNewCurrencyCode('USD');
            } else {
                localId = selectedLocalId;
            }

            const formData = new FormData();
            formData.append('zipFile', zipFile);
            formData.append('localId', String(localId));

            const res = await fetch('/api/admin/batch-upload', {
                method: 'POST',
                headers: await getFreshAuthHeaders(),
                body: formData,
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Upload failed');
            }

            const data = await res.json();
            setUploadResult(data);
            setZipFile(null);
            // Reset the file input
            const fileInput = document.getElementById('zip-file-input') as HTMLInputElement;
            if (fileInput) fileInput.value = '';
            // Refresh the pending list
            fetchPendingItems();
        } catch (err) {
            setUploadError(err instanceof Error ? err.message : 'Upload failed');
        } finally {
            setUploading(false);
        }
    };

    const handleDriveImport = async () => {
        if (!driveUrl || selectedLocalId === '') return;
        if (selectedLocalId === 'new' && (!newLocalId || !newLocalName)) return;

        setUploading(true);
        setUploadError('');
        setUploadResult(null);

        try {
            let localId: number;

            if (selectedLocalId === 'new') {
                const createRes = await fetch('/api/locals', {
                    method: 'POST',
                    headers: { ...await getFreshAuthHeaders(), 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        id: Number(newLocalId),
                        name: newLocalName,
                        config: {
                            localId: Number(newLocalId),
                            localName: newLocalName,
                            currency: { symbol: newCurrencySymbol, code: newCurrencyCode },
                            contractTypes: [],
                        },
                    }),
                });

                if (!createRes.ok) {
                    const data = await createRes.json();
                    throw new Error(data.error || 'Failed to create local');
                }

                const created = await createRes.json();
                localId = created.id;
                await fetchLocals();
                setSelectedLocalId(localId);
                setNewLocalId('');
                setNewLocalName('');
                setNewCurrencySymbol('$');
                setNewCurrencyCode('USD');
            } else {
                localId = selectedLocalId;
            }

            // Use Cloud Run URL directly to avoid Firebase Hosting's 60s timeout
            const baseUrl = import.meta.env.PROD
                ? 'https://api-olic7ddwoq-uc.a.run.app'
                : '';
            const res = await fetch(`${baseUrl}/api/admin/batch-drive`, {
                method: 'POST',
                headers: { ...await getFreshAuthHeaders(), 'Content-Type': 'application/json' },
                body: JSON.stringify({ folderUrl: driveUrl, localId }),
            });

            const contentType = res.headers.get('content-type') || '';
            if (!contentType.includes('application/json')) {
                throw new Error(`Server error (${res.status}). Please try again.`);
            }

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Import failed');
            }

            const data = await res.json();
            setUploadResult(data);
            setDriveUrl('');
            fetchPendingItems();
        } catch (err) {
            setUploadError(err instanceof Error ? err.message : 'Import failed');
        } finally {
            setUploading(false);
        }
    };

    const openReview = (item: PendingContractType) => {
        setReviewItem(item);
        setEditJson(JSON.stringify(item.parsedData, null, 2));
        setJsonError('');
        setActionMessage({ type: '', text: '' });
    };

    const handleSaveEdit = async () => {
        if (!reviewItem) return;

        let parsed;
        try {
            parsed = JSON.parse(editJson);
        } catch {
            setJsonError('Invalid JSON');
            return;
        }

        setActionLoading(true);
        setJsonError('');
        try {
            const res = await fetch(`/api/admin/batch-pending/${reviewItem.id}`, {
                method: 'PUT',
                headers: { ...await getFreshAuthHeaders(), 'Content-Type': 'application/json' },
                body: JSON.stringify({ parsedData: parsed }),
            });
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Save failed');
            }
            const data = await res.json();
            setReviewItem(data.item);
            setActionMessage({ type: 'success', text: 'Changes saved' });
            fetchPendingItems();
        } catch (err) {
            setActionMessage({ type: 'error', text: err instanceof Error ? err.message : 'Save failed' });
        } finally {
            setActionLoading(false);
        }
    };

    const handleApprove = async () => {
        if (!reviewItem) return;

        // Save any edits first
        let parsed;
        try {
            parsed = JSON.parse(editJson);
        } catch {
            setJsonError('Invalid JSON — fix before approving');
            return;
        }

        setActionLoading(true);
        setActionMessage({ type: '', text: '' });
        try {
            // Save edits if changed
            const currentJson = JSON.stringify(reviewItem.parsedData, null, 2);
            if (editJson !== currentJson) {
                const saveRes = await fetch(`/api/admin/batch-pending/${reviewItem.id}`, {
                    method: 'PUT',
                    headers: { ...await getFreshAuthHeaders(), 'Content-Type': 'application/json' },
                    body: JSON.stringify({ parsedData: parsed }),
                });
                if (!saveRes.ok) {
                    const data = await saveRes.json();
                    throw new Error(data.error || 'Save failed');
                }
            }

            const res = await fetch(`/api/admin/batch-pending/${reviewItem.id}/approve`, {
                method: 'POST',
                headers: await getFreshAuthHeaders(),
            });
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Approve failed');
            }
            setActionMessage({ type: 'success', text: 'Approved and added to local config!' });
            setReviewItem(null);
            fetchPendingItems();
        } catch (err) {
            setActionMessage({ type: 'error', text: err instanceof Error ? err.message : 'Approve failed' });
        } finally {
            setActionLoading(false);
        }
    };

    const handleReject = async () => {
        if (!reviewItem) return;

        setActionLoading(true);
        setActionMessage({ type: '', text: '' });
        try {
            const res = await fetch(`/api/admin/batch-pending/${reviewItem.id}/reject`, {
                method: 'POST',
                headers: await getFreshAuthHeaders(),
            });
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Reject failed');
            }
            setReviewItem(null);
            fetchPendingItems();
        } catch (err) {
            setActionMessage({ type: 'error', text: err instanceof Error ? err.message : 'Reject failed' });
        } finally {
            setActionLoading(false);
        }
    };

    const handleDelete = async (id: string) => {
        try {
            const res = await fetch(`/api/admin/batch-pending/${id}`, {
                method: 'DELETE',
                headers: await getFreshAuthHeaders(),
            });
            if (res.ok) {
                setItems(items.filter(i => i.id !== id));
                if (reviewItem?.id === id) setReviewItem(null);
            }
        } catch (err) {
            console.error('Delete error:', err);
        }
    };

    // Group items by batchId
    const groupedItems = items.reduce<Record<string, PendingContractType[]>>((acc, item) => {
        if (!acc[item.batchId]) acc[item.batchId] = [];
        acc[item.batchId].push(item);
        return acc;
    }, {});

    return (
        <div className="space-y-6">
            {/* Upload Section */}
            <div className="bg-gray-800 p-6 rounded-lg shadow-lg">
                <h2 className="text-xl font-bold mb-4">Batch Import</h2>

                <div className="flex gap-2 mb-4">
                    <button
                        onClick={() => setIngestionMode('zip')}
                        className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${ingestionMode === 'zip' ? 'bg-indigo-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
                    >
                        Upload ZIP
                    </button>
                    <button
                        onClick={() => setIngestionMode('drive')}
                        className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${ingestionMode === 'drive' ? 'bg-indigo-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
                    >
                        Import from Google Drive
                    </button>
                </div>

                <p className="text-sm text-gray-400 mb-4">
                    {ingestionMode === 'zip'
                        ? 'Upload a ZIP file containing contract documents (PDF, PNG, JPG, DOC, DOCX). Each file will be scanned with AI and queued for review. Maximum 15 files, 50MB total.'
                        : 'Paste a publicly-shared Google Drive folder URL. Uploaded files (PDF, PNG, JPG, DOC, DOCX) will be downloaded and scanned. Google Docs native files are not supported. Maximum 15 files.'}
                </p>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">Target Local</label>
                        <select
                            value={selectedLocalId}
                            onChange={(e) => {
                                const val = e.target.value;
                                setSelectedLocalId(val === 'new' ? 'new' : val ? Number(val) : '');
                            }}
                            className="w-full bg-gray-700 border border-gray-600 text-white text-sm rounded-md focus:ring-indigo-500 focus:border-indigo-500 p-2.5"
                        >
                            <option value="">Select a local...</option>
                            <option value="new">+ Create new local...</option>
                            {locals.map(l => (
                                <option key={l.id} value={l.id}>Local {l.id} — {l.name}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        {ingestionMode === 'zip' ? (
                            <>
                                <label className="block text-sm font-medium text-gray-300 mb-1">ZIP File</label>
                                <input
                                    id="zip-file-input"
                                    type="file"
                                    accept=".zip"
                                    onChange={(e) => setZipFile(e.target.files?.[0] || null)}
                                    className="block w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-indigo-600 file:text-white hover:file:bg-indigo-700"
                                />
                            </>
                        ) : (
                            <>
                                <label className="block text-sm font-medium text-gray-300 mb-1">Google Drive Folder URL</label>
                                <input
                                    type="text"
                                    value={driveUrl}
                                    onChange={(e) => setDriveUrl(e.target.value)}
                                    placeholder="https://drive.google.com/drive/folders/..."
                                    className="w-full bg-gray-700 border border-gray-600 text-white text-sm rounded-md p-2.5 focus:ring-indigo-500 focus:border-indigo-500"
                                />
                            </>
                        )}
                    </div>
                    <div>
                        <button
                            onClick={ingestionMode === 'zip' ? handleUpload : handleDriveImport}
                            disabled={
                                uploading ||
                                selectedLocalId === '' ||
                                (selectedLocalId === 'new' && (!newLocalId || !newLocalName)) ||
                                (ingestionMode === 'zip' && !zipFile) ||
                                (ingestionMode === 'drive' && !driveUrl)
                            }
                            className="w-full bg-emerald-600 text-white font-bold py-2.5 px-4 rounded-md hover:bg-emerald-700 disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors"
                        >
                            {uploading ? 'Processing...' : ingestionMode === 'zip' ? 'Upload & Scan' : 'Import & Scan'}
                        </button>
                    </div>
                </div>

                {selectedLocalId === 'new' && (
                    <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4 bg-gray-900 p-4 rounded-md border border-gray-700">
                        <div>
                            <label className="block text-xs font-medium text-gray-400 mb-1">Local ID</label>
                            <input
                                type="number"
                                value={newLocalId}
                                onChange={(e) => setNewLocalId(e.target.value)}
                                placeholder="e.g. 802"
                                className="w-full bg-gray-700 border border-gray-600 text-white text-sm rounded-md p-2 focus:ring-indigo-500 focus:border-indigo-500"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-400 mb-1">Local Name</label>
                            <input
                                type="text"
                                value={newLocalName}
                                onChange={(e) => setNewLocalName(e.target.value)}
                                placeholder="e.g. New York City"
                                className="w-full bg-gray-700 border border-gray-600 text-white text-sm rounded-md p-2 focus:ring-indigo-500 focus:border-indigo-500"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-400 mb-1">Currency Symbol</label>
                            <input
                                type="text"
                                value={newCurrencySymbol}
                                onChange={(e) => setNewCurrencySymbol(e.target.value)}
                                className="w-full bg-gray-700 border border-gray-600 text-white text-sm rounded-md p-2 focus:ring-indigo-500 focus:border-indigo-500"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-400 mb-1">Currency Code</label>
                            <input
                                type="text"
                                value={newCurrencyCode}
                                onChange={(e) => setNewCurrencyCode(e.target.value)}
                                className="w-full bg-gray-700 border border-gray-600 text-white text-sm rounded-md p-2 focus:ring-indigo-500 focus:border-indigo-500"
                            />
                        </div>
                    </div>
                )}

                {uploadError && (
                    <div className="mt-4 bg-red-900/50 text-red-200 p-3 rounded-md text-sm">{uploadError}</div>
                )}
                {uploadResult && (
                    <div className="mt-4 bg-emerald-900/50 text-emerald-200 p-3 rounded-md text-sm">
                        Batch <code className="bg-gray-700 px-1 rounded">{uploadResult.batchId.slice(0, 8)}...</code> processed: {uploadResult.processed} succeeded, {uploadResult.failed} failed out of {uploadResult.totalFiles} files.
                    </div>
                )}
            </div>

            {/* Loading overlay for upload */}
            {uploading && (
                <div className="fixed inset-0 bg-black bg-opacity-70 z-50 flex flex-col justify-center items-center">
                    <svg className="animate-spin h-12 w-12 text-indigo-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <p className="mt-4 text-lg text-gray-200">
                        {ingestionMode === 'drive' ? 'Downloading & scanning files with Gemini AI...' : 'Scanning files with Gemini AI...'}
                    </p>
                    <p className="mt-1 text-sm text-gray-400">This may take a few minutes for multiple files.</p>
                </div>
            )}

            {/* Pending Items Section */}
            <div className="bg-gray-800 p-6 rounded-lg shadow-lg">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-bold">Review Queue</h2>
                    <div className="flex items-center gap-3">
                        <select
                            value={filterStatus}
                            onChange={(e) => setFilterStatus(e.target.value)}
                            className="bg-gray-700 border border-gray-600 text-white text-sm rounded-md focus:ring-indigo-500 focus:border-indigo-500 p-2"
                        >
                            <option value="">All statuses</option>
                            <option value="pending">Pending</option>
                            <option value="approved">Approved</option>
                            <option value="rejected">Rejected</option>
                        </select>
                        <button
                            onClick={fetchPendingItems}
                            className="px-3 py-2 text-xs font-medium text-white bg-gray-600 rounded-md hover:bg-gray-500 transition"
                        >
                            Refresh
                        </button>
                    </div>
                </div>

                {loadingItems ? (
                    <p className="text-gray-400">Loading...</p>
                ) : items.length === 0 ? (
                    <p className="text-gray-500 italic">No pending items. Upload a ZIP to get started.</p>
                ) : (
                    <div className="space-y-4">
                        {Object.entries(groupedItems).map(([batchId, batchItems]) => (
                            <div key={batchId} className="border border-gray-700 rounded-lg overflow-hidden">
                                <div className="bg-gray-900 px-4 py-2 flex items-center justify-between">
                                    <span className="text-xs text-gray-400">
                                        Batch <code className="text-gray-300">{batchId.slice(0, 8)}...</code>
                                        {' '} — Local {batchItems[0].localId}
                                        {' '} — {new Date(batchItems[0].createdAt).toLocaleDateString()}
                                    </span>
                                    <span className="text-xs text-gray-500">{batchItems.length} file{batchItems.length !== 1 ? 's' : ''}</span>
                                </div>
                                <table className="min-w-full divide-y divide-gray-700">
                                    <thead>
                                        <tr>
                                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-400 uppercase">File</th>
                                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-400 uppercase">Parsed Name</th>
                                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-400 uppercase">Status</th>
                                            <th className="px-4 py-2 text-right text-xs font-medium text-gray-400 uppercase">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-700">
                                        {batchItems.map(item => {
                                            const parsed = item.parsedData as { name?: string; id?: string };
                                            return (
                                                <tr key={item.id} className="hover:bg-gray-750">
                                                    <td className="px-4 py-2 text-sm text-gray-200 font-mono">{item.sourceFileName}</td>
                                                    <td className="px-4 py-2 text-sm text-gray-300">{parsed?.name || '—'}</td>
                                                    <td className="px-4 py-2 text-sm">
                                                        <span className={`px-2 py-0.5 rounded-full text-xs border ${statusColors[item.status] || 'bg-gray-700 text-gray-300'}`}>
                                                            {item.status}
                                                        </span>
                                                        {item.error && (
                                                            <span className="ml-2 text-xs text-red-400" title={item.error}>
                                                                (error)
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-2 text-sm text-right">
                                                        <div className="flex items-center justify-end gap-2">
                                                            {item.status === 'pending' && (
                                                                <button
                                                                    onClick={() => openReview(item)}
                                                                    className="px-3 py-1 text-xs font-semibold rounded-md bg-indigo-700 hover:bg-indigo-600 text-white transition-colors"
                                                                >
                                                                    Review
                                                                </button>
                                                            )}
                                                            <button
                                                                onClick={() => handleDelete(item.id)}
                                                                className="px-3 py-1 text-xs font-semibold rounded-md bg-red-800 hover:bg-red-700 text-white transition-colors"
                                                            >
                                                                Delete
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Review Panel Modal */}
            {reviewItem && (
                <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex items-center justify-center p-4">
                    <div className="bg-gray-800 border border-gray-600 rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
                        <div className="flex items-center justify-between p-4 border-b border-gray-700">
                            <div>
                                <h3 className="text-lg font-bold text-white">Review: {reviewItem.sourceFileName}</h3>
                                <p className="text-xs text-gray-400">Local {reviewItem.localId} — Batch {reviewItem.batchId.slice(0, 8)}...</p>
                            </div>
                            <button
                                onClick={() => setReviewItem(null)}
                                className="text-gray-400 hover:text-white text-xl leading-none"
                            >
                                &times;
                            </button>
                        </div>

                        <div className="flex-1 overflow-auto p-4">
                            {actionMessage.text && (
                                <div className={`mb-4 p-3 rounded-md text-sm ${actionMessage.type === 'success' ? 'bg-emerald-900/50 text-emerald-200' : 'bg-red-900/50 text-red-200'}`}>
                                    {actionMessage.text}
                                </div>
                            )}
                            {jsonError && (
                                <div className="mb-4 bg-red-900/50 text-red-200 p-3 rounded-md text-sm">{jsonError}</div>
                            )}
                            <textarea
                                value={editJson}
                                onChange={(e) => { setEditJson(e.target.value); setJsonError(''); }}
                                className="w-full h-[50vh] bg-gray-900 border border-gray-700 rounded-md p-3 text-xs text-emerald-400 font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                                spellCheck={false}
                            />
                        </div>

                        <div className="flex items-center justify-between p-4 border-t border-gray-700">
                            <button
                                onClick={handleSaveEdit}
                                disabled={actionLoading}
                                className="px-4 py-2 text-sm font-medium bg-gray-600 hover:bg-gray-500 text-white rounded-md transition-colors disabled:opacity-50"
                            >
                                Save Edits
                            </button>
                            <div className="flex items-center gap-3">
                                <button
                                    onClick={handleReject}
                                    disabled={actionLoading}
                                    className="px-4 py-2 text-sm font-medium bg-red-800 hover:bg-red-700 text-white rounded-md transition-colors disabled:opacity-50"
                                >
                                    Reject
                                </button>
                                <button
                                    onClick={handleApprove}
                                    disabled={actionLoading}
                                    className="px-4 py-2 text-sm font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-md transition-colors disabled:opacity-50"
                                >
                                    {actionLoading ? 'Processing...' : 'Approve & Add to Config'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default BatchIngestion;
