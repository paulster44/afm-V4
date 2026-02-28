import React, { useState, ReactNode } from 'react';

type AdminAuthProps = {
  children: ReactNode;
};

const ADMIN_PASSWORD = 'milo123';

const AdminAuth: React.FC<AdminAuthProps> = ({ children }) => {
  const [password, setPassword] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === ADMIN_PASSWORD) {
      setIsAuthenticated(true);
      setError('');
    } else {
      setError('Incorrect password. Please try again.');
      setPassword('');
    }
  };

  if (isAuthenticated) {
    return <>{children}</>;
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-900 px-4">
      <div className="w-full max-w-sm p-8 space-y-8 bg-gray-800 rounded-lg shadow-md">
        <div>
          <h2 className="text-2xl font-bold text-center text-white">
            Admin Panel Access
          </h2>
          <p className="mt-2 text-sm text-center text-gray-400">
            Please enter the admin password to continue.
          </p>
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="rounded-md shadow-sm">
            <div>
              <label htmlFor="admin-password" className="sr-only">Password</label>
              <input
                id="admin-password"
                name="password"
                type="password"
                required
                className="relative block w-full px-3 py-2 text-white placeholder-gray-400 bg-gray-700 border border-gray-600 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                placeholder="Admin Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          {error && <p className="text-sm text-center text-red-500">{error}</p>}

          <div>
            <button
              type="submit"
              className="relative flex justify-center w-full px-4 py-2 text-sm font-medium text-white bg-indigo-600 border border-transparent rounded-md group hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              Authorize
            </button>
          </div>
        </form>
         <div className="text-center mt-4">
            <a href="#" className="text-sm text-indigo-400 hover:text-indigo-300" onClick={(e) => { e.preventDefault(); window.location.hash = ''; }}>
                &larr; Back to Main App
            </a>
        </div>
      </div>
    </div>
  );
};

export default AdminAuth;
