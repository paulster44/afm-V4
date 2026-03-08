import React, { useState, useEffect } from 'react';
import type { UsageStats } from '../types';
import { useAuth } from '../contexts/AuthContext';

const UsageDashboard: React.FC = () => {
    const { getAuthHeaders } = useAuth();
    const [stats, setStats] = useState<UsageStats | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [error, setError] = useState<string>('');

    useEffect(() => {
        const fetchUsage = async () => {
            setIsLoading(true);
            setError('');
            try {
                const res = await fetch('/api/admin/usage', { headers: getAuthHeaders() });
                if (!res.ok) throw new Error('Failed to fetch usage data');
                const data = await res.json();
                setStats(data);
            } catch (err: any) {
                setError(err.message || 'Failed to load usage data');
            } finally {
                setIsLoading(false);
            }
        };
        fetchUsage();
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard
                    title="Contracts Today"
                    value={stats.contractsToday}
                    icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>}
                />
                <StatCard
                    title="Versions Today"
                    value={stats.versionsToday}
                    icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>}
                />
                <StatCard
                    title="Total Contracts"
                    value={stats.totalContractsLifetime}
                    icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>}
                />
                <StatCard
                    title="Total Versions"
                    value={stats.totalVersionsLifetime}
                    icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>}
                />
            </div>

            <div className="bg-gray-800 rounded-lg shadow-lg">
                <h3 className="text-lg font-bold p-4 border-b border-gray-700">Usage by User</h3>
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-700">
                        <thead className="bg-gray-700/50">
                            <tr>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">User</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Contracts</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Versions</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Last Active</th>
                            </tr>
                        </thead>
                        <tbody className="bg-gray-800 divide-y divide-gray-700">
                            {stats.userUsage.map(user => (
                                <tr key={user.uid}>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-100">{user.email}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">{user.totalContracts}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">{user.totalVersions}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">{user.lastActive ? new Date(user.lastActive).toLocaleString() : 'No activity'}</td>
                                </tr>
                            ))}
                            {stats.userUsage.length === 0 && (
                                <tr>
                                    <td colSpan={4} className="text-center py-4 text-sm text-gray-500">No user activity recorded yet.</td>
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
