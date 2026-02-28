import React, { useState, useEffect } from 'react';
import type { UsageStats } from '../types';

// Mock data for previewing without a backend
const MOCK_STATS: UsageStats = {
    totalTokensLifetime: 125830,
    totalTokensToday: 18245,
    userUsage: [
        { uid: 'user1', email: 'leader@band.com', totalTokens: 75400, lastActive: new Date(Date.now() - 3600 * 1000 * 2).toISOString() },
        { uid: 'user2', email: 'bassist@band.com', totalTokens: 41230, lastActive: new Date(Date.now() - 3600 * 1000 * 24).toISOString() },
        { uid: 'mock-admin-user-123', email: 'admin@preview.dev', totalTokens: 9200, lastActive: new Date().toISOString() },
    ]
};

const UsageDashboard: React.FC = () => {
    const [stats, setStats] = useState<UsageStats | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [error, setError] = useState<string>('');

    useEffect(() => {
        // Simulate fetching data
        setIsLoading(true);
        setError('');
        const timer = setTimeout(() => {
            setStats(MOCK_STATS);
            setIsLoading(false);
        }, 500); // Simulate network delay

        return () => clearTimeout(timer);
    }, []);
    
    const StatCard: React.FC<{ title: string; value: string | number; icon: React.ReactNode }> = ({ title, value, icon }) => (
        <div className="bg-gray-800 p-6 rounded-lg shadow-lg flex items-center space-x-4">
            <div className="bg-gray-700 p-3 rounded-full">
                {icon}
            </div>
            <div>
                <p className="text-sm text-gray-400 font-medium">{title}</p>
                <p className="text-2xl font-bold text-white">{value.toLocaleString()}</p>
            </div>
        </div>
    );

    if (isLoading) {
        return (
            <div className="flex justify-center items-center h-64">
                <svg className="animate-spin h-8 w-8 text-indigo-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                 <p className="ml-3 text-gray-300">Loading Usage Data...</p>
            </div>
        );
    }
    
     if (error) {
      return (
        <div className="bg-red-900/50 p-4 rounded-lg text-red-200">
            <p className="font-bold">Error loading usage data</p>
            <p className="text-sm">{error}</p>
        </div>
      );
    }

    if (!stats) {
        return <p className="text-center text-gray-400">No usage data available.</p>;
    }

    return (
        <div className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <StatCard 
                    title="Total Tokens Used (Today)"
                    value={stats.totalTokensToday}
                    icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>}
                />
                <StatCard 
                    title="Total Tokens Used (Lifetime)"
                    value={stats.totalTokensLifetime}
                    icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>}
                />
            </div>

            <div className="bg-gray-800 rounded-lg shadow-lg">
                <h3 className="text-lg font-bold p-4 border-b border-gray-700">Usage by User</h3>
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-700">
                        <thead className="bg-gray-700/50">
                            <tr>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">User</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Total Tokens</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Last Scan</th>
                            </tr>
                        </thead>
                        <tbody className="bg-gray-800 divide-y divide-gray-700">
                            {stats.userUsage.map(user => (
                                <tr key={user.uid}>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-100">{user.email}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">{user.totalTokens.toLocaleString()}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">{new Date(user.lastActive).toLocaleString()}</td>
                                </tr>
                            ))}
                             {stats.userUsage.length === 0 && (
                                <tr>
                                    <td colSpan={3} className="text-center py-4 text-sm text-gray-500">No user activity recorded yet.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default UsageDashboard;
