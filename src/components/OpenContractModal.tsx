import React, { useState } from 'react';
import type { SavedContract } from '../types';

type OpenContractModalProps = {
  isOpen: boolean;
  onClose: () => void;
  savedContracts: SavedContract[];
  onLoadContract: (contract: SavedContract) => void;
  onDeleteContract: (id: string) => void;
};

const OpenContractModal: React.FC<OpenContractModalProps> = ({ isOpen, onClose, savedContracts, onLoadContract, onDeleteContract }) => {
  if (!isOpen) return null;

  const [filterText, setFilterText] = useState('');

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const filteredContracts = savedContracts.filter(contract => {
    if (!filterText) return true;
    const searchTerm = filterText.toLowerCase();
    const nameMatch = contract.name.toLowerCase().includes(searchTerm);
    const dateMatch = formatDate(contract.createdAt).toLowerCase().includes(searchTerm);
    return nameMatch || dateMatch;
  });

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-60 z-50 flex justify-center items-center p-4 transition-opacity duration-300"
      aria-modal="true"
      role="dialog"
    >
      <div className="bg-gray-800 rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col transform transition-all duration-300 scale-95 opacity-0 animate-fade-in-scale">
        <header className="flex justify-between items-center p-4 border-b border-gray-700 flex-shrink-0">
          <h2 className="text-xl font-bold text-white">
            Open Saved Contract
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-200" aria-label="Close modal">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </header>

        <main className="p-6 overflow-y-auto">
            {savedContracts.length === 0 ? (
                <p className="text-sm text-center text-gray-400 py-8">You have no saved contracts.</p>
            ) : (
                <>
                <input
                    type="text"
                    placeholder="Search by name or date..."
                    value={filterText}
                    onChange={(e) => setFilterText(e.target.value)}
                    className="w-full px-3 py-1.5 text-sm mb-4 bg-gray-700 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    aria-label="Search saved contracts"
                />
                {filteredContracts.length === 0 ? (
                    <p className="text-sm text-center text-gray-400 py-8">No saved contracts match your search.</p>
                ) : (
                    <ul className="space-y-3">
                    {filteredContracts.map((contract) => (
                        <li key={contract.id} className="p-3 bg-gray-700 rounded-md flex flex-col sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex-grow mb-2 sm:mb-0">
                            <p className="font-semibold text-gray-100 text-sm">{contract.name}</p>
                            <p className="text-xs text-gray-400">Saved: {formatDate(contract.createdAt)} ({contract.versions.length} versions)</p>
                        </div>
                        <div className="flex space-x-2 flex-shrink-0">
                            <button
                                onClick={() => onLoadContract(contract)}
                                className="px-3 py-1 text-xs font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition"
                                aria-label={`Load contract ${contract.name}`}
                            >
                            Load
                            </button>
                            <button
                                onClick={() => onDeleteContract(contract.id)}
                                className="px-3 py-1 text-xs font-medium text-white bg-red-600 rounded-md hover:bg-red-700 transition"
                                aria-label={`Delete contract ${contract.name}`}
                            >
                            Delete
                            </button>
                        </div>
                        </li>
                    ))}
                    </ul>
                )}
                </>
            )}
        </main>
        
        <footer className="flex justify-end items-center p-4 bg-gray-900/50 border-t border-gray-700 flex-shrink-0">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-200 bg-gray-700 border border-gray-600 rounded-md hover:bg-gray-600">
            Cancel
          </button>
        </footer>
      </div>
       <style>{`
        @keyframes fadeInScale {
          from { opacity: 0; transform: scale(.95); }
          to { opacity: 1; transform: scale(1); }
        }
        .animate-fade-in-scale { animation: fadeInScale 0.2s ease-out forwards; }
      `}</style>
    </div>
  );
};

export default OpenContractModal;
