import React from 'react';

const AdminAuth: React.FC = () => {
  console.warn("DEPRECATION WARNING: The <AdminAuth> component is insecure and should not be used. Please use the secure <AdminRoute> component instead.");

  return (
    <div className="flex flex-col justify-center items-center h-screen bg-gray-900 text-white p-4">
        <div className="text-center bg-red-900/50 p-8 rounded-lg shadow-lg">
            <h2 className="text-2xl font-bold text-red-200 mb-4">Component Deprecated</h2>
            <p className="mb-6 text-red-300">This component contains a security vulnerability and has been disabled. Please use the secure `AdminRoute` component.</p>
            <a href="/#" className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700">
                &larr; Back to Main App
            </a>
        </div>
    </div>
  );
};

export default AdminAuth;