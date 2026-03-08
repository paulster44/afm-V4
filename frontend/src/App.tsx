
import React, { useState, useEffect } from 'react';
import { useConfig } from './hooks/useConfig';
import ContractWizard from './components/ContractWizard';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import LoginPage from './components/LoginPage';
import LocalSelector from './components/LocalSelector';
import AdminPanel from './components/AdminPanel';
import AdminRoute from './components/AdminRoute';
import AnnouncementBanner from './components/AnnouncementBanner';
import type { SavedContract } from './types';


const MainAppView: React.FC<{ localId: number; onResetLocal: () => void; onLogout: () => void; pendingContract?: SavedContract | null; onPendingContractConsumed?: () => void; }> = ({ localId, onResetLocal, onLogout, pendingContract, onPendingContractConsumed }) => {
  const { authState } = useAuth();
  const { config, loading, error } = useConfig(localId);

  const renderContent = () => {
    if (loading) {
      return (
        <div className="flex flex-col items-center justify-center h-full py-20">
          <svg className="animate-spin -ml-1 mr-3 h-10 w-10 text-emerald-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <p className="mt-4 text-lg text-slate-300">Loading Configuration for Local {localId}...</p>
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
      return <ContractWizard config={config} userId={authState.user.uid} pendingContract={pendingContract} onPendingContractConsumed={onPendingContractConsumed} />;
    }

    return null;
  };

  return (
    <main className="min-h-screen text-slate-50 bg-slate-900">
      <header className="bg-slate-800 shadow-md border-b border-slate-700">
        <div className="max-w-7xl mx-auto py-4 px-4 sm:px-6 lg:px-8 flex justify-between items-center">
          <div className="flex flex-col">
            <h1 className="text-xl sm:text-2xl font-bold font-serif leading-tight text-white tracking-wide">
              <a href="/#" className="hover:text-emerald-400 transition-colors duration-200">AFM Smart Contract Generator</a>
            </h1>
            <span className="text-xs sm:text-sm text-emerald-500 font-semibold uppercase tracking-wider">{config?.localName}</span>
          </div>
          <div className="flex items-center space-x-2 sm:space-x-4">
            <span className="hidden sm:inline text-sm text-slate-300">Welcome, {authState.user?.email}</span>
            <button onClick={onResetLocal} className="px-3 py-1.5 text-xs font-medium text-white bg-slate-600 rounded-md hover:bg-slate-500 transition-colors duration-200 shadow-sm">
              Change Local
            </button>
            <button
              onClick={onLogout}
              className="px-3 py-1.5 text-xs font-medium text-white bg-red-600/90 rounded-md hover:bg-red-500 transition-colors duration-200 shadow-sm"
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
          <a href="/#admin" className="text-xs text-slate-500 hover:text-slate-400 transition-colors duration-200">Admin Panel</a>
        </footer>
      )}
    </main>
  );
}

const AppContent: React.FC = () => {
  const { authState, isAuthenticated, logout } = useAuth();
  const [selectedLocalId, setSelectedLocalId] = useState<number | null>(() => {
    const saved = localStorage.getItem('afm_selected_local_id');
    return saved ? parseInt(saved, 10) : null;
  });
  const [route, setRoute] = useState(window.location.hash);
  const [pendingContract, setPendingContract] = useState<SavedContract | null>(null);

  // When a user successfully logs in, the AppContent component might not have unmounted
  // (e.g. if using a popup), so we must explicitly re-check localStorage for their saved Local.
  useEffect(() => {
    if (authState.user) {
      const saved = localStorage.getItem('afm_selected_local_id');
      if (saved) {
        setSelectedLocalId(parseInt(saved, 10));
      }
    }
  }, [authState.user]);

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

  const handleLoadContractFromSelector = (contract: SavedContract, localId: number) => {
    setPendingContract(contract);
    handleSelectLocal(localId);
  };

  const handleResetLocal = () => {
    localStorage.removeItem('afm_selected_local_id');
    setSelectedLocalId(null);
  };

  const handleLogout = () => {
    logout();
  };

  // Wait for Firebase to determine auth status on soft-reloads before routing
  if (authState.loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-900">
        <svg className="animate-spin -ml-1 mr-3 h-10 w-10 text-emerald-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      </div>
    );
  }

  if (authState.suspendedAt) {
    const suspendedDate = new Date(authState.suspendedAt).toLocaleDateString('en-US', {
      year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit'
    });
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-900 px-4">
        <div className="bg-gray-800 border border-yellow-700 rounded-lg p-8 max-w-md w-full text-center shadow-xl">
          <div className="text-yellow-400 text-4xl mb-4">&#9888;</div>
          <h2 className="text-xl font-bold text-white mb-2">Account Suspended</h2>
          <p className="text-gray-300 text-sm mb-4">
            Your account has been suspended since <span className="font-semibold text-yellow-300">{suspendedDate}</span>.
          </p>
          <p className="text-gray-400 text-xs mb-6">
            If you believe this is an error, please contact your local administrator.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 text-sm font-medium text-gray-300 bg-gray-700 hover:bg-gray-600 rounded-md transition-colors"
          >
            Back to Login
          </button>
        </div>
      </div>
    );
  }

  if (!isAuthenticated()) {
    return <LoginPage />;
  }

  if (route === '#admin') {
    return (
      <AdminRoute>
        <div className="min-h-screen flex flex-col bg-gray-900">
          <AnnouncementBanner />
          <AdminPanel />
        </div>
      </AdminRoute>
    );
  }

  if (!selectedLocalId) {
    return (
      <main className="min-h-screen flex flex-col text-slate-50 bg-slate-900">
        <AnnouncementBanner />
        <LocalSelector onSelectLocal={handleSelectLocal} onLogout={handleLogout} onLoadContract={handleLoadContractFromSelector} />
      </main>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-900">
      <AnnouncementBanner />
      <MainAppView localId={selectedLocalId} onResetLocal={handleResetLocal} onLogout={handleLogout} pendingContract={pendingContract} onPendingContractConsumed={() => setPendingContract(null)} />
    </div>
  );
};

const App: React.FC = () => {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
