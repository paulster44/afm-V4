import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import type { PendingContractType } from '../types';

const statusColors: Record<string, string> = {
    pending: 'bg-yellow-900 text-yellow-300 border-yellow-700',
    approved: 'bg-emerald-900 text-emerald-300 border-emerald-700',
    rejected: 'bg-red-900 text-red-300 border-red-700',
    error: 'bg-red-900 text-red-300 border-red-700',
};

const BatchIngestion: React.FC = () => {
    const { getFreshAuthHeaders } = useAuth();

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
            <div className="mb-6 p-4 bg-blue-900/30 border border-blue-700 rounded-lg text-blue-300 text-sm">
                Run <code className="bg-gray-800 px-1.5 py-0.5 rounded text-blue-200">cd functions && npm run config-builder</code> to ingest new wage agreements. Items appear here for review.
            </div>

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
                    <p className="text-gray-500 italic">No pending items. Run the config-builder CLI to add items.</p>
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
                            <details className="mb-3">
                                <summary className="text-sm text-gray-400 cursor-pointer hover:text-gray-300">
                                    Field Reference
                                </summary>
                                <div className="mt-2 text-xs text-gray-500 space-y-1 max-h-48 overflow-y-auto">
                                    <div><code>rules.overtime</code> — Overtime rate (PercentageRule or TieredRule)</div>
                                    <div><code>rules.leaderPremium</code> — Leader premium (TieredRule by ensemble size)</div>
                                    <div><code>rules.pension</code> — Pension contribution (PercentageRule or ConditionalRule)</div>
                                    <div><code>rules.health</code> — Health & welfare (FlatRule per musician/service)</div>
                                    <div><code>rules.workDues</code> — Work dues (PercentageRule)</div>
                                    <div><code>rules.doubling</code> — Doubling premium (TieredRule or PercentageRule)</div>
                                    <div><code>rules.billing</code> — Billing increments and minimums (minutes)</div>
                                    <div><code>rules.surcharges</code> — After-midnight, onstage, etc.</div>
                                    <div><code>rules.extensions</code> — Additional rules not fitting core types</div>
                                    <div><code>pensionable: true/false</code> — Whether rule output counts toward pension basis</div>
                                    <div><code>extractionNotes</code> — AI uncertainty flags (review carefully)</div>
                                </div>
                            </details>
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
