import React, { useState, useEffect } from 'react';
import { GoogleGenAI, Type } from "@google/genai";
import UsageDashboard from './UsageDashboard';
import { useAuth } from '../contexts/AuthContext';
import LocalConfigEditor from './LocalConfigEditor';

const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            const base64data = reader.result as string;
            // remove the "data:mime/type;base64," prefix
            resolve(base64data.split(',')[1]);
        }
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
};

type AdminPanelView = 'scanner' | 'usage' | 'users' | 'announcements' | 'locals';

type PlatformUser = {
    id: string;
    email: string;
    name: string | null;
    role: string;
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

    // Announcements State
    const [announcementText, setAnnouncementText] = useState('');
    const [isPublishing, setIsPublishing] = useState(false);
    const [publishMessage, setPublishMessage] = useState({ type: '', text: '' });

    useEffect(() => {
        if (view === 'users' && isGod) {
            fetchUsers();
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
                setPublishMessage({ type: 'success', text: 'Announcement published successfully! It is now live for all users.' });
                setAnnouncementText('');
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
        if (!process.env.API_KEY) {
            setError("API_KEY is not configured. Please set it up to use the scanner.");
            return;
        }

        setIsLoading(true);
        setGeneratedJson('');
        setError('');

        try {
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
            const base64Data = await blobToBase64(image);

            const imagePart = { inlineData: { mimeType: image.type, data: base64Data } };
            const textPart = {
                text: `Analyze the attached image of a musician's union contract document. Extract all relevant information to create a complete JSON configuration for a single 'ContractType' object that can be used in our system.
- Infer a unique 'id' (e.g., 'local_live_engagement'), a descriptive 'name', and a 'formIdentifier'.
- Determine the 'calculationModel' (e.g., 'live_engagement', 'media_report', 'contribution_only') and 'signatureType' (e.g., 'engagement', 'media_report', 'member').
- If present, extract 'jurisdiction' (e.g., 'Canada (Ontario)') and 'currency' details (symbol and code). If currency is not specified, assume USD.
- Identify all fillable fields ('fields'). For each field, determine its 'id', 'label', 'type', 'required' status, and logical 'group'. Also extract any optional details like 'placeholder', 'description', 'options' for selects, 'min'/'minLength' values, 'dataSource' ('wageScales'), and a 'defaultValue'.
- Extract all financial rules ('rules'), including premiums for 'leader' or 'doubling', 'overtimeRate', and contributions for 'pension', 'health', and 'workDues'. For each rule, capture the rate, a descriptive text, and what the calculation is based on (for 'pension' and 'workDues') or if it's a flat rate (for 'health').
- Detail all 'wageScales'. For each scale, extract its unique 'id', 'name', 'rate', standard 'duration' in hours, and an optional 'description'.
- If there is legal text, extract it into the 'legalText' object with appropriate keys (e.g., 'preamble', 'clause_governingLaw', 'clause_arbitrationL1'). The model should create logical keys for distinct clauses.
- The 'summary' field must be an empty array '[]'.
- Structure the entire output as a single, clean JSON object that strictly adheres to the provided schema. Do not include any extra explanations, comments, or markdown formatting.` };
            const model = 'gemini-2.5-flash';

            const response = await ai.models.generateContent({
                model,
                contents: { parts: [imagePart, textPart] },
                config: {
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: Type.OBJECT,
                        properties: { id: { type: Type.STRING }, name: { type: Type.STRING }, formIdentifier: { type: Type.STRING }, calculationModel: { type: Type.STRING }, signatureType: { type: Type.STRING }, jurisdiction: { type: Type.STRING }, currency: { type: Type.OBJECT, properties: { symbol: { type: Type.STRING }, code: { type: Type.STRING } } }, fields: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { id: { type: Type.STRING }, label: { type: Type.STRING }, type: { type: Type.STRING }, required: { type: Type.BOOLEAN }, group: { type: Type.STRING }, placeholder: { type: Type.STRING }, description: { type: Type.STRING }, options: { type: Type.ARRAY, items: { type: Type.STRING } }, dataSource: { type: Type.STRING }, min: { type: Type.NUMBER }, minLength: { type: Type.NUMBER }, defaultValue: { type: Type.STRING } } } }, wageScales: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { id: { type: Type.STRING }, name: { type: Type.STRING }, rate: { type: Type.NUMBER }, duration: { type: Type.NUMBER }, description: { type: Type.STRING } } } }, rules: { type: Type.OBJECT, properties: { overtimeRate: { type: Type.NUMBER }, leaderPremium: { type: Type.OBJECT, properties: { rate: { type: Type.NUMBER }, description: { type: Type.STRING } } }, doublingPremium: { type: Type.OBJECT, properties: { rate: { type: Type.NUMBER }, description: { type: Type.STRING } } }, pensionContribution: { type: Type.OBJECT, properties: { rate: { type: Type.NUMBER }, description: { type: Type.STRING }, basedOn: { type: Type.ARRAY, items: { type: Type.STRING } } } }, healthContribution: { type: Type.OBJECT, properties: { ratePerMusicianPerService: { type: Type.NUMBER }, description: { type: Type.STRING } } }, workDues: { type: Type.OBJECT, properties: { rate: { type: Type.NUMBER }, description: { type: Type.STRING }, basedOn: { type: Type.ARRAY, items: { type: Type.STRING } } } } } }, summary: { type: Type.ARRAY, items: {} }, legalText: { type: Type.OBJECT, properties: { preamble: { type: Type.STRING }, clause_governingLaw: { type: Type.STRING }, clause_disputes: { type: Type.STRING } } } }
                    }
                }
            });

            const jsonText = response.text || "{}";
            const parsedJson = JSON.parse(jsonText);
            setGeneratedJson(JSON.stringify(parsedJson, null, 2));

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
                            <span className="text-xs bg-indigo-900 text-indigo-200 py-1 px-2 rounded-full border border-indigo-700">v8.0</span>
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
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-700">
                                        {users.map((user) => (
                                            <tr key={user.id}>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-200">
                                                    {user.email} {user.id === authState.user?.uid && <span className="text-xs text-indigo-400 ml-2">(You)</span>}
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
            </main>
        </div>
    );
};

export default AdminPanel;
