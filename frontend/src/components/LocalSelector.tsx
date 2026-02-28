
import React, { useState, useEffect } from 'react';

type LocalInfo = {
  id: number;
  name: string;
};

type LocalSelectorProps = {
  onSelectLocal: (id: number) => void;
  onLogout: () => void;
};

const LocalSelector: React.FC<LocalSelectorProps> = ({ onSelectLocal, onLogout }) => {
  const [locals, setLocals] = useState<LocalInfo[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string>('');

  useEffect(() => {
    const fetchLocals = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch('/configs/locals.json');
        if (!response.ok) {
          throw new Error('Failed to load the list of locals. Please ensure `public/configs/locals.json` is available.');
        }
        const data = await response.json();
        setLocals(data.locals);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An unknown error occurred.');
      } finally {
        setLoading(false);
      }
    };
    fetchLocals();
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedId) {
      onSelectLocal(parseInt(selectedId, 10));
    }
  };

  const renderContent = () => {
    if (loading) {
      return (
        <div className="flex items-center justify-center py-8">
          <svg className="animate-spin h-8 w-8 text-indigo-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <p className="ml-3 text-gray-300">Loading locals...</p>
        </div>
      );
    }
    if (error) {
      return (
        <div className="bg-red-900/50 p-4 rounded-lg text-red-200">
          <p className="font-bold">Error loading configuration</p>
          <p className="text-sm">{error}</p>
        </div>
      );
    }
    return (
      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label htmlFor="local-select" className="sr-only">Select a Local</label>
          <select
            id="local-select"
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            className="block w-full pl-3 pr-10 py-3 text-base border-gray-600 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md bg-gray-700 text-gray-100"
          >
            <option value="" disabled>-- Choose your local jurisdiction --</option>
            {locals.map(local => (
              <option key={local.id} value={local.id}>
                {local.name}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          disabled={!selectedId}
          className="w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:bg-indigo-800 disabled:cursor-not-allowed transition-colors"
        >
          Load Local Configuration
        </button>
      </form>
    );
  };

  return (
    <div className="max-w-2xl mx-auto py-12 px-4 animate-fade-in">
      <div className="bg-gray-800 p-8 rounded-xl shadow-lg text-center relative">
        <button
          onClick={onLogout}
          className="absolute top-4 right-4 px-3 py-1 text-xs font-medium text-white bg-red-600 rounded-md hover:bg-red-700 transition"
          aria-label="Logout"
        >
          Logout
        </button>
        <h1 className="text-3xl font-bold text-white mb-2">
          Select Your AFM Local
        </h1>
        <p className="text-gray-300 mb-8">
          Choose your local from the dropdown to load the correct contract templates and wage scales.
        </p>
        {renderContent()}
      </div>
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in { animation: fadeIn 0.5s ease-out forwards; }
      `}</style>
    </div>
  );
};

export default LocalSelector;
