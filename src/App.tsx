

import React, { useState, useEffect } from 'react';
import { useConfig } from './hooks/useConfig';
import ContractWizard from './components/ContractWizard';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import LoginPage from './components/LoginPage';
import LocalSelector from './components/LocalSelector';
import AdminPanel from './components/AdminPanel';
import AdminRoute from './components/AdminRoute';


const MainAppView: React.FC<{ localId: number; onResetLocal: () => void; onLogout: () => void; }> = ({ localId, onResetLocal, onLogout }) => {
  const { authState } = useAuth();
  const { config, loading, error } = useConfig(localId);

  const renderContent = () => {
    if (loading) {
      return (
        <div className="flex flex-col items-center justify-center h-full py-20">
          <svg className="animate-spin -ml-1 mr-3 h-10 w-10 text-indigo-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <p className="mt-4 text-lg text-gray-300">Loading Configuration for Local {localId}...</p>
        </div>
      );
    }

    if (error) {
      return (
        <div className="flex items-center justify-center h-full bg-red-900/50 p-4 rounded-lg">
          <div className="text-center text-red-200">
            <h2 className="text-2xl font-bold mb-2">Error</h2>
            <p>{error}</p>
            <p className="mt-2 text-sm">Please make sure `public/configs/local_{localId}.json` exists and is accessible.</p>
          </div>
        </div>
      );
    }

    if (config && authState.user) {
      return <ContractWizard config={config} userId={authState.user.uid} />;
    }

    return null;
  };

  return (
    <main className="min-h-screen text-gray-100">
       <header className="bg-gray-800 shadow-md">
        <div className="max-w-7xl mx-auto py-4 px-4 sm:px-6 lg:px-8 flex justify-between items-center">
            <div className="flex flex-col">
              <h1 className="text-xl sm:text-2xl font-bold leading-tight text-white">
                  <a href="/#" className="hover:text-indigo-400">AFM Smart Contract Generator</a>
              </h1>
              <span className="text-xs sm:text-sm text-indigo-400 font-semibold">{config?.localName}</span>
            </div>
            <div className="flex items-center space-x-2 sm:space-x-4">
              <span className="hidden sm:inline text-sm text-gray-300">Welcome, {authState.user?.email}</span>
              <button onClick={onResetLocal} className="px-3 py-1 text-xs font-medium text-white bg-gray-500 rounded-md hover:bg-gray-600 transition">
                  Change Local
              </button>
              <button
                onClick={onLogout}
                className="px-3 py-1 text-xs font-medium text-white bg-red-600 rounded-md hover:bg-red-700 transition"
              >
                Logout
              </button>
            </div>
        </div>
      </header>
      <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        {renderContent()}
      </div>
      {authState.user?.isAdmin && (
        <footer className="text-center py-4">
          <a href="/#admin" className="text-xs text-gray-600 hover:text-gray-400">Admin Panel</a>
        </footer>
      )}
    </main>
  );
}

const AppContent: React.FC = () => {
  const { isAuthenticated, logout } = useAuth();
  const [selectedLocalId, setSelectedLocalId] = useState<number | null>(() => {
    const saved = localStorage.getItem('afm_selected_local_id');
    return saved ? parseInt(saved, 10) : null;
  });
  const [route, setRoute] = useState(window.location.hash);

  useEffect(() => {
    const handleHashChange = () => {
      setRoute(window.location.hash);
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => {
      window.removeEventListener('hashchange', handleHashChange);
    };
  }, []);

  const handleSelectLocal = (id: number) => {
    localStorage.setItem('afm_selected_local_id', String(id));
    setSelectedLocalId(id);
  };

  const handleResetLocal = () => {
    localStorage.removeItem('afm_selected_local_id');
    setSelectedLocalId(null);
  };

  const handleLogout = () => {
    handleResetLocal();
    logout();
  };
  
  if (!isAuthenticated()) {
      return <LoginPage />; 
  }
  
  if (route === '#admin') {
    return (
      <AdminRoute>
        <AdminPanel />
      </AdminRoute>
    );
  }

  if (!selectedLocalId) {
    return (
        <main className="min-h-screen text-gray-100">
            <LocalSelector onSelectLocal={handleSelectLocal} onLogout={handleLogout} />
        </main>
    );
  }

  return <MainAppView localId={selectedLocalId} onResetLocal={handleResetLocal} onLogout={handleLogout} />;
};

const App: React.FC = () => {
    return (
        <AuthProvider>
            <AppContent />
        </AuthProvider>
    );
}

export default App;
