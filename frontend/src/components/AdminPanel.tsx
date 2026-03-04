import React, { useState, useEffect } from 'react';
import UsageDashboard from './UsageDashboard';
import { useAuth } from '../contexts/AuthContext';
import LocalConfigEditor from './LocalConfigEditor';

type AdminPanelView = 'scanner' | 'usage' | 'users' | 'announcements' | 'locals';

type PlatformUser = {
    id: string;
    email: string;
    name: string | null;
    role: string;
    suspendedAt: string | null;
    createdAt: string;
    _count: { contracts: number };
};

const AdminPanel: React.FC = () => {
    const { authState, getAuthHeaders } = useAuth();
    // Use the backend's isGod flag
    const isGod = authState.user?.isGod || false;

    // Default view
    const [view, setView] = useState<AdminPanelView>('scanner');

    // Scanner State
    const [image, setImage] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [generatedJson, setGeneratedJson] = useState<string>('');
    const [error, setError] = useState<string>('');

    // Users State
    const [users, setUsers] = useState<PlatformUser[]>([]);
    const [loadingUsers, setLoadingUsers] = useState<boolean>(false);
    const [confirmDeleteUserId, setConfirmDeleteUserId] = useState<string | null>(null);
    const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

    // Announcements State
    const [announcementText, setAnnouncementText] = useState('');
    const [isPublishing, setIsPublishing] = useState(false);
    const [publishMessage, setPublishMessage] = useState({ type: '', text: '' });
    const [activeAnnouncement, setActiveAnnouncement] = useState<{ id: string; message: string } | null>(null);
    const [loadingAnnouncement, setLoadingAnnouncement] = useState(false);

    useEffect(() => {
        if (view === 'users' && isGod) {
            fetchUsers();
        }
        if (view === 'announcements') {
            fetchActiveAnnouncement();
        }
    }, [view, isGod]);

    const fetchUsers = async () => {
        setLoadingUsers(true);
        try {
            const res = await fetch('/api/admin/users', { headers: getAuthHeaders() });
            if (res.ok) {
                const data = await res.json();
                setUsers(data.users);
            } else {
                setError('Failed to fetch users');
            }
        } catch (err) {
            console.error('Fetch users error:', err);
            setError('Error connecting to API.');
        } finally {
            setLoadingUsers(false);
        }
    };

    const fetchActiveAnnouncement = async () => {
        setLoadingAnnouncement(true);
        try {
            const res = await fetch('/api/announcements/latest', { headers: getAuthHeaders() });
            if (res.ok) {
                const data = await res.json();
                setActiveAnnouncement(data.announcement || null);
            }
        } catch (err) {
            console.error('Fetch announcement error:', err);
        } finally {
            setLoadingAnnouncement(false);
        }
    };

    const handleDeactivateAnnouncement = async () => {
        try {
            const res = await fetch('/api/admin/announcements', {
                method: 'DELETE',
                headers: getAuthHeaders()
            });
            if (res.ok) {
                setActiveAnnouncement(null);
                setPublishMessage({ type: 'success', text: 'Announcement deactivated.' });
            } else {
                setPublishMessage({ type: 'error', text: 'Failed to deactivate announcement.' });
            }
        } catch (err) {
            console.error('Deactivate error:', err);
            setPublishMessage({ type: 'error', text: 'Error connecting to API.' });
        }
    };

    const handleRoleChange = async (userId: string, newRole: string) => {
        try {
            const res = await fetch(`/api/admin/users/${userId}/role`, {
                method: 'PUT',
                headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
                body: JSON.stringify({ role: newRole })
            });
            if (res.ok) {
                // Instantly update the list state
                setUsers(users.map(u => u.id === userId ? { ...u, role: newRole } : u));
            } else {
                alert('Failed to update user role');
            }
        } catch (err) {
            console.error('Role update error:', err);
            alert('Error connecting to API.');
        }
    };

    const handleDeleteUser = async (userId: string) => {
        setActionLoadingId(userId);
        try {
            const res = await fetch(`/api/admin/users/${userId}`, {
                method: 'DELETE',
                headers: getAuthHeaders()
            });
            if (res.ok) {
                setUsers(users.filter(u => u.id !== userId));
            } else {
                const data = await res.json();
                alert(data.error || 'Failed to delete user');
            }
        } catch (err) {
            console.error('Delete user error:', err);
            alert('Error connecting to API.');
        } finally {
            setActionLoadingId(null);
            setConfirmDeleteUserId(null);
        }
    };

    const handleSuspendToggle = async (userId: string) => {
        setActionLoadingId(userId);
        try {
            const res = await fetch(`/api/admin/users/${userId}/suspend`, {
                method: 'PUT',
                headers: getAuthHeaders()
            });
            if (res.ok) {
                const data = await res.json();
                setUsers(users.map(u => u.id === userId ? { ...u, suspendedAt: data.user.suspendedAt } : u));
            } else {
                const data = await res.json();
                alert(data.error || 'Failed to update suspension status');
            }
        } catch (err) {
            console.error('Suspend toggle error:', err);
            alert('Error connecting to API.');
        } finally {
            setActionLoadingId(null);
        }
    };

    const handlePublishAnnouncement = async () => {
        if (!announcementText.trim()) return;
        setIsPublishing(true);
        setPublishMessage({ type: '', text: '' });

        try {
            const res = await fetch('/api/admin/announcements', {
                method: 'POST',
                headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: announcementText })
            });

            if (res.ok) {
                const data = await res.json();
                setPublishMessage({ type: 'success', text: 'Announcement published successfully! It is now live for all users.' });
                setAnnouncementText('');
                setActiveAnnouncement(data.announcement);
            } else {
                setPublishMessage({ type: 'error', text: 'Failed to publish announcement.' });
            }
        } catch (err) {
            console.error('Publish error:', err);
            setPublishMessage({ type: 'error', text: 'Error connecting to API.' });
        } finally {
            setIsPublishing(false);
        }
    };

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            setImage(file);
            setGeneratedJson('');
            setError('');
            const reader = new FileReader();
            reader.onloadend = () => {
                setImagePreview(reader.result as string);
            };
            reader.readAsDataURL(file);
        }
    };

    const handleScan = async () => {
        if (!image) {
            setError('Please select an image file first.');
            return;
        }

        setIsLoading(true);
        setGeneratedJson('');
        setError('');

        try {
            const formDataPayload = new FormData();
            formDataPayload.append('image', image);

            const response = await fetch('/api/admin/scan', {
                method: 'POST',
                headers: getAuthHeaders(),
                body: formDataPayload,
            });

            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.error || 'Scan failed');
            }

            const data = await response.json();
            setGeneratedJson(JSON.stringify(data.result, null, 2));
        } catch (err) {
            console.error("AI Scan Error:", err);
            setError(err instanceof Error ? err.message : 'An error occurred during the AI scan.');
        } finally {
            setIsLoading(false);
        }
    };

    const copyToClipboard = () => {
        navigator.clipboard.writeText(generatedJson).then(() => {
            alert('JSON copied to clipboard!');
        }, (err) => {
            alert('Failed to copy text.');
            console.error('Clipboard copy failed: ', err);
        });
    };

    const tabClasses = (tabName: AdminPanelView) =>
        `px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${view === tabName
            ? 'bg-gray-800 text-white border-b-2 border-indigo-500'
            : 'text-gray-400 hover:bg-gray-700 hover:text-gray-200'
        }`;

    return (
        <div className="bg-gray-900 min-h-screen text-gray-100">
            {isLoading && (
                <div className="fixed inset-0 bg-black bg-opacity-70 z-50 flex flex-col justify-center items-center">
                    <svg className="animate-spin h-12 w-12 text-indigo-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <p className="mt-4 text-lg text-gray-200">Scanning with Gemini, this may take a moment...</p>
                </div>
            )}
            <header className="bg-gray-800 shadow-md">
                <div className="max-w-7xl mx-auto py-4 px-4 sm:px-6 lg:px-8 flex justify-between items-center">
                    <div>
                        <h1 className="text-2xl font-bold leading-tight text-white flex items-center gap-2">
                            <a href="/#" className="hover:text-indigo-400">Admin Panel</a>
                            <span className="text-xs bg-indigo-900 text-indigo-200 py-1 px-2 rounded-full border border-indigo-700">v4.0</span>
                        </h1>
                        <p className="text-sm text-gray-400">Manage contract configurations, roles, and usage.</p>
                    </div>
                    <a href="/#" className="px-3 py-1 text-xs font-medium text-white bg-gray-600 rounded-md hover:bg-gray-500 transition">
                        &larr; Back to App
                    </a>
                </div>
            </header>
            <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
                <div className="border-b border-gray-700 mb-6 flex items-center justify-between">
                    <nav className="-mb-px flex space-x-4" aria-label="Tabs">
                        <button onClick={() => setView('scanner')} className={tabClasses('scanner')}>
                            Contract Scanner
                        </button>
                        <button onClick={() => setView('usage')} className={tabClasses('usage')}>
                            Usage Stats
                        </button>
                        <button onClick={() => setView('announcements')} className={tabClasses('announcements')}>
                            Announcements
                        </button>
                        {isGod && (
                            <>
                                <button onClick={() => setView('locals')} className={tabClasses('locals')}>
                                    Local Configs ⚡️
                                </button>
                                <button onClick={() => setView('users')} className={tabClasses('users')}>
                                    Users & Roles ⚡️
                                </button>
                            </>
                        )}
                    </nav>
                </div>

                {view === 'users' && isGod && (
                    <div className="bg-gray-800 p-6 rounded-lg shadow-lg">
                        <h2 className="text-xl font-bold mb-4">Platform Users</h2>
                        {error && <p className="text-red-400 mb-4">{error}</p>}
                        {loadingUsers ? <p className="text-gray-400">Loading users...</p> : (
                            <div className="overflow-x-auto">
                                <table className="min-w-full divide-y divide-gray-700">
                                    <thead>
                                        <tr>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Email</th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Joined</th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Contracts</th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Role</th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-700">
                                        {users.map((user) => (
                                            <tr key={user.id}>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-200">
                                                    {user.email}
                                                    {user.id === authState.user?.uid && <span className="text-xs text-indigo-400 ml-2">(You)</span>}
                                                    {user.suspendedAt && (
                                                        <span className="text-xs bg-yellow-900 text-yellow-300 border border-yellow-700 py-0.5 px-1.5 rounded-full ml-2">
                                                            Suspended
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">
                                                    {new Date(user.createdAt).toLocaleDateString()}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">
                                                    {user._count.contracts}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm">
                                                    <select
                                                        value={user.role}
                                                        onChange={(e) => handleRoleChange(user.id, e.target.value)}
                                                        disabled={user.id === authState.user?.uid} // Can't demote yourself if you are God
                                                        className="bg-gray-700 border border-gray-600 text-white text-sm rounded-md focus:ring-indigo-500 focus:border-indigo-500 block w-full p-2.5 disabled:opacity-50"
                                                    >
                                                        <option value="USER">User</option>
                                                        <option value="ADMIN">Admin</option>
                                                        {user.role === 'GOD' && <option value="GOD">God</option>}
                                                    </select>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm">
                                                    {user.id !== authState.user?.uid && (
                                                        <div className="flex items-center gap-2">
                                                            <button
                                                                onClick={() => handleSuspendToggle(user.id)}
                                                                disabled={actionLoadingId === user.id}
                                                                className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                                                                    user.suspendedAt
                                                                        ? 'bg-emerald-700 hover:bg-emerald-600 text-white'
                                                                        : 'bg-yellow-700 hover:bg-yellow-600 text-white'
                                                                }`}
                                                            >
                                                                {user.suspendedAt ? 'Unsuspend' : 'Suspend'}
                                                            </button>
                                                            <button
                                                                onClick={() => setConfirmDeleteUserId(user.id)}
                                                                disabled={actionLoadingId === user.id}
                                                                className="px-3 py-1 text-xs font-semibold rounded-md bg-red-800 hover:bg-red-700 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                                            >
                                                                Delete
                                                            </button>
                                                        </div>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}

                {view === 'scanner' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="bg-gray-800 p-6 rounded-lg shadow-lg">
                            <h2 className="text-xl font-bold mb-4">1. Upload Contract Image</h2>
                            <p className="text-sm text-gray-400 mb-4">Choose a clear photo or scan of the contract document you wish to process.</p>
                            <input
                                type="file"
                                accept="image/*"
                                capture="environment"
                                onChange={handleFileChange}
                                className="block w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-indigo-600 file:text-white hover:file:bg-indigo-700"
                            />
                            {imagePreview && (
                                <div className="mt-4 border-2 border-dashed border-gray-600 rounded-lg p-2">
                                    <img src={imagePreview} alt="Contract preview" className="max-h-80 w-auto mx-auto rounded" />
                                </div>
                            )}
                            <button
                                onClick={handleScan}
                                disabled={!image || isLoading}
                                className="mt-6 w-full bg-emerald-600 text-white font-bold py-2 px-4 rounded-md hover:bg-emerald-700 disabled:bg-gray-600 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
                            >
                                {isLoading ? (
                                    <>
                                        <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                        </svg>
                                        Scanning...
                                    </>
                                ) : (
                                    "2. Scan with AI"
                                )}
                            </button>
                        </div>

                        <div className="bg-gray-800 p-6 rounded-lg shadow-lg">
                            <h2 className="text-xl font-bold mb-4">3. Generated JSON Output</h2>
                            <p className="text-sm text-gray-400 mb-4">The AI-generated JSON will appear below. Copy it and add it to the `contractTypes` array in the relevant `local_XXX.json` file.</p>

                            {error && <div className="bg-red-900/50 text-red-200 p-3 rounded-md text-sm">{error}</div>}

                            <div className="relative mt-4">
                                <pre className="bg-gray-900 rounded-md p-4 text-xs text-emerald-400 overflow-x-auto h-96 border border-gray-700">
                                    <code>
                                        {generatedJson || (isLoading ? 'AI is analyzing the document...' : 'Output will appear here...')}
                                    </code>
                                </pre>
                                {generatedJson && (
                                    <button
                                        onClick={copyToClipboard}
                                        className="absolute top-2 right-2 bg-gray-600 hover:bg-gray-500 text-white text-xs font-bold py-1 px-2 rounded transition-colors shadow-sm"
                                    >
                                        Copy JSON
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {view === 'usage' && (
                    <UsageDashboard />
                )}

                {view === 'announcements' && (
                    <div className="bg-gray-800 p-6 rounded-lg shadow-lg max-w-2xl">
                        <h2 className="text-xl font-bold mb-4">Global Announcement</h2>

                        <div className="mb-6 p-4 rounded-md border border-gray-600 bg-gray-900">
                            <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">Currently Active</label>
                            {loadingAnnouncement ? (
                                <p className="text-sm text-gray-400">Loading...</p>
                            ) : activeAnnouncement ? (
                                <div className="flex items-start justify-between gap-4">
                                    <p className="text-sm text-indigo-200">{activeAnnouncement.message}</p>
                                    <button
                                        onClick={handleDeactivateAnnouncement}
                                        className="shrink-0 px-3 py-1 text-xs font-semibold rounded-md bg-red-800 hover:bg-red-700 text-white transition-colors"
                                    >
                                        Deactivate
                                    </button>
                                </div>
                            ) : (
                                <p className="text-sm text-gray-500 italic">No active announcement</p>
                            )}
                        </div>

                        <p className="text-sm text-gray-400 mb-6">
                            Publish a message that will appear as a banner at the top of the screen for all users.
                            Publishing a new announcement will immediately replace any currently active announcement.
                        </p>

                        <div className="mb-4">
                            <label className="block text-sm font-medium text-gray-300 mb-2">Announcement Message</label>
                            <textarea
                                value={announcementText}
                                onChange={(e) => setAnnouncementText(e.target.value)}
                                rows={4}
                                className="w-full bg-gray-700 border border-gray-600 rounded-md py-2 px-3 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                placeholder="E.g., System maintenance scheduled for tonight at 2 AM EST..."
                            />
                        </div>

                        {publishMessage.text && (
                            <div className={`mb-4 p-3 rounded-md text-sm ${publishMessage.type === 'success' ? 'bg-emerald-900/50 text-emerald-200' : 'bg-red-900/50 text-red-200'}`}>
                                {publishMessage.text}
                            </div>
                        )}

                        <button
                            onClick={handlePublishAnnouncement}
                            disabled={!announcementText.trim() || isPublishing}
                            className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-600 text-white font-bold py-2 px-4 rounded transition-colors flex items-center"
                        >
                            {isPublishing ? 'Publishing...' : 'Publish Announcement'}
                        </button>
                    </div>
                )}

                {view === 'locals' && isGod && (
                    <LocalConfigEditor />
                )}
                {confirmDeleteUserId && (() => {
                    const targetUser = users.find(u => u.id === confirmDeleteUserId);
                    return (
                        <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex items-center justify-center">
                            <div className="bg-gray-800 border border-gray-600 rounded-lg p-6 max-w-sm w-full mx-4 shadow-xl">
                                <h3 className="text-lg font-bold text-white mb-2">Delete User</h3>
                                <p className="text-sm text-gray-300 mb-1">
                                    Are you sure you want to permanently delete:
                                </p>
                                <p className="text-sm font-semibold text-red-300 mb-4">
                                    {targetUser?.email}
                                </p>
                                <p className="text-xs text-gray-400 mb-6">
                                    This will delete all their contracts, memberships, and workspaces. This action cannot be undone.
                                </p>
                                <div className="flex gap-3 justify-end">
                                    <button
                                        onClick={() => setConfirmDeleteUserId(null)}
                                        disabled={actionLoadingId === confirmDeleteUserId}
                                        className="px-4 py-2 text-sm font-medium text-gray-300 bg-gray-700 hover:bg-gray-600 rounded-md transition-colors disabled:opacity-50"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={() => handleDeleteUser(confirmDeleteUserId)}
                                        disabled={actionLoadingId === confirmDeleteUserId}
                                        className="px-4 py-2 text-sm font-medium text-white bg-red-700 hover:bg-red-600 rounded-md transition-colors disabled:opacity-50"
                                    >
                                        {actionLoadingId === confirmDeleteUserId ? 'Deleting...' : 'Delete Permanently'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    );
                })()}
            </main>
        </div>
    );
};

export default AdminPanel;
