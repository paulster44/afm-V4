import React, { ReactNode } from 'react';
import { useAuth } from '../contexts/AuthContext';

const AdminRoute: React.FC<{ children: ReactNode }> = ({ children }) => {
    const { authState } = useAuth();

    // Since we now have a mock admin user in the context, we can just check the flag directly.
    if (authState.user?.isAdmin) {
        return <>{children}</>;
    }

    return (
        <div className="flex flex-col justify-center items-center h-screen bg-gray-900 text-white p-4">
            <div className="text-center bg-gray-800 p-8 rounded-lg shadow-lg">
                <h2 className="text-2xl font-bold text-red-500 mb-4">Access Denied</h2>
                <p className="mb-6">You must be an administrator to view this page.</p>
                <a href="/#" className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700">
                    &larr; Back to Main App
                </a>
            </div>
        </div>
    );
};

export default AdminRoute;
