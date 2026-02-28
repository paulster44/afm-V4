
import React from 'react';

const LoginPage: React.FC = () => {
  // This component is not used in the preview environment because authentication
  // is mocked. This simplified version prevents any accidental API calls.
  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-900 px-4">
      <div className="w-full max-w-md p-8 space-y-8 bg-gray-800 rounded-lg shadow-md">
        <div>
          <h2 className="text-3xl font-bold text-center text-white">
            AFM Smart Contract Generator ✨
          </h2>
          <p className="mt-2 text-sm text-center text-gray-400">
            Loading your session...
          </p>
        </div>
        <div className="text-center text-xs text-gray-500 mt-6 pt-4 border-t border-gray-700">
            <p>Version 8.0 (Standalone Preview)</p>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
